/**
 * Bloomin' Festival mailbox: a Google Apps Script web app that stores the festival's LOCKED data.
 *
 * Vendor applications are encrypted in the vendor's own browser before they are sent, and the team's notes,
 * statuses and map are encrypted in the team's browser. This script only ever stores and returns scrambled data;
 * it never sees a name, address, phone number or photo in readable form, and it never sees the team password.
 *
 * Setup (once): in script.google.com make a new project, paste this file over the sample code, then
 * Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone, and send the /exec address to the
 * person who looks after bloominfestival.com. To update later: paste the new code, then Deploy > Manage deployments >
 * (pencil) > Version: New version > Deploy. The address stays the same.
 *
 * Everything is kept in one Google Drive folder that this script creates: "Bloomin' Festival vault".
 * Please do not edit or move the files in it by hand.
 */

const FOLDER_NAME = "Bloomin' Festival vault (locked data, do not edit)";
const MAX_BODY = 20 * 1024 * 1024;        // largest request accepted (bytes)
const MAX_PHOTO = 6 * 1024 * 1024;        // largest single locked photo (characters)
const MAX_PHOTOS = 4;
const SUBMITS_PER_MINUTE = 30;            // simple flood guard for the public form
const FAILS_ALLOWED = 12;                 // wrong team keys allowed per 15 minutes before a pause

function doGet(e) {
  return handle_((e && e.parameter) || {}, e);
}

function doPost(e) {
  var body;
  try {
    if (e.postData && e.postData.length > MAX_BODY) return out_({ error: 'too-large' });
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return out_({ error: 'bad-request' });
  }
  return handle_(body || {}, e);
}

function handle_(q, e) {
  try {
    switch (q.a) {
      case 'hello': return out_(hello_());
      case 'publicmap': return out_({ ok: true, map: readJson_('public-map.json', null) });
      case 'submit': return out_(submit_(q));
      case 'init': return out_(init_(q));
      case 'login': return out_(teamOnly_(q, function () { return { ok: true, keyring: readJson_('keyring.json', null) }; }));
      case 'dump': return out_(teamOnly_(q, function () { return dump_(); }));
      case 'photo': return out_(teamOnly_(q, function () { return photo_(q); }));
      case 'put': return out_(teamOnly_(q, function () { return put_(q); }));
      case 'putMap': return out_(teamOnly_(q, function () { return putMap_(q); }));
      case 'publish': return out_(teamOnly_(q, function () { return publish_(q); }));
      case 'removeApp': return out_(teamOnly_(q, function () { return removeApp_(q); }));
      case 'importMany': return out_(teamOnly_(q, function () { return importMany_(q); }));
      case 'settings': return out_(teamOnly_(q, function () { return settings_(q); }));
      case 'rekey': return out_(teamOnly_(q, function () { return rekey_(q); }));
      default: return out_({ ok: true, service: "Bloomin' Festival mailbox", ready: !!readJson_('keyring.json', null) });
    }
  } catch (err) {
    return out_({ error: 'server', detail: String(err && err.message || err).slice(0, 200) });
  }
}

/* ---------- public ---------- */

function hello_() {
  var k = readJson_('keyring.json', null);
  if (!k) return { ok: true, ready: false };
  return { ok: true, ready: true, pub: k.pub, access: k.access, version: k.version || 1 };
}

// A vendor's locked application: { season, app: {epk, iv, ct}, photos: [{iv, ct}], legacy? }
function submit_(q) {
  if (!readJson_('keyring.json', null)) return { error: 'not-ready' };
  var cache = CacheService.getScriptCache();
  var minute = 'sub:' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(minute) || 0);
  if (n >= SUBMITS_PER_MINUTE) return { error: 'busy' };
  cache.put(minute, String(n + 1), 120);

  var season = Number(q.season);
  if (!(season >= 2024 && season <= 2100)) return { error: 'bad-season' };
  if (!sealedOk_(q.app, 200000)) return { error: 'bad-app' };
  var photos = Array.isArray(q.photos) ? q.photos : [];
  if (photos.length > MAX_PHOTOS) return { error: 'too-many-photos' };
  for (var i = 0; i < photos.length; i++) if (!sealedOk_(photos[i], MAX_PHOTO)) return { error: 'bad-photo' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var seq = Number(props.getProperty('SEQ_' + season) || 0) + 1;
    props.setProperty('SEQ_' + season, String(seq));
    var no = 'BF' + String(season).slice(2) + '-' + ('000' + seq).slice(-4);
    var photoFolder = subfolder_('photos');
    var ids = photos.map(function (p, k) {
      return photoFolder.createFile(no + '-' + (k + 1) + '.locked', JSON.stringify({ iv: p.iv, ct: p.ct }), 'text/plain').getId();
    });
    var index = readJson_('applications.json', []);
    var entry = { no: no, season: season, at: new Date().toISOString(), app: { epk: q.app.epk, iv: q.app.iv, ct: q.app.ct }, photos: ids };
    index.push(entry);
    writeJson_('applications.json', index);
    notify_(no);
    return { ok: true, no: no };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- first-time setup ---------- */

// The team's browser creates the festival keys and sends the public half, the password-locked private half,
// and a fingerprint of the team access key. Allowed only once; changing the password uses 'rekey'.
function init_(q) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (readJson_('keyring.json', null)) return { error: 'already-set-up' };
    if (!q.keyring || !q.keyring.pub || !q.keyring.access || !/^[0-9a-f]{64}$/.test(String(q.tokenHash || ''))) return { error: 'bad-keyring' };
    writeJson_('keyring.json', q.keyring);
    PropertiesService.getScriptProperties().setProperty('TOKEN_HASH', q.tokenHash);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- team (needs the key derived from the team password) ---------- */

function teamOnly_(q, fn) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('fails') || 0);
  if (fails >= FAILS_ALLOWED) return { error: 'paused', detail: 'Too many wrong passwords. Try again in 15 minutes.' };
  var want = PropertiesService.getScriptProperties().getProperty('TOKEN_HASH');
  if (!want || sha256Hex_(String(q.token || '')) !== want) {
    cache.put('fails', String(fails + 1), 900);
    return { error: 'wrong-password' };
  }
  return fn();
}

function dump_() {
  return {
    ok: true,
    applications: readJson_('applications.json', []),
    records: readJson_('records.json', {}),
    map: readJson_('map.json', null),
    publicMap: readJson_('public-map.json', null)
  };
}

function photo_(q) {
  var index = readJson_('applications.json', []);
  var owned = index.some(function (a) { return (a.photos || []).indexOf(q.id) !== -1; });
  if (!owned) return { error: 'not-found' };
  return { ok: true, photo: JSON.parse(DriveApp.getFileById(q.id).getBlob().getDataAsString()) };
}

// One locked record per application (status, notes, booth...), saved only if nobody else changed it meanwhile.
function put_(q) {
  if (!/^[A-Za-z0-9-]{1,40}$/.test(String(q.id || ''))) return { error: 'bad-id' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var records = readJson_('records.json', {});
    var cur = records[q.id];
    if ((cur ? cur.rev : 0) !== Number(q.rev || 0)) return { error: 'conflict', current: cur || null };
    if (q.ct === null) delete records[q.id];
    else {
      if (!sealedOk_(q.ct, 400000)) return { error: 'bad-record' };
      records[q.id] = { rev: (cur ? cur.rev : 0) + 1, at: new Date().toISOString(), ct: q.ct };
    }
    writeJson_('records.json', records);
    return { ok: true, record: records[q.id] || null };
  } finally {
    lock.releaseLock();
  }
}

function putMap_(q) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cur = readJson_('map.json', null);
    if ((cur ? cur.rev : 0) !== Number(q.rev || 0)) return { error: 'conflict', current: cur };
    if (!sealedOk_(q.ct, 5000000)) return { error: 'bad-map' };
    var next = { rev: (cur ? cur.rev : 0) + 1, at: new Date().toISOString(), ct: q.ct };
    writeJson_('map.json', next);
    return { ok: true, map: next };
  } finally {
    lock.releaseLock();
  }
}

// The vendor-facing map: booth layout and (only if the team switches it on) business names. Never contact details.
function publish_(q) {
  var text = JSON.stringify(q.map || null);
  if (text.length > 3000000) return { error: 'too-large' };
  writeJson_('public-map.json', q.map || null);
  return { ok: true };
}

// Bring in older applications (for example from the old Google Form), already locked by the team's browser.
// items: [{ season, at, app: {epk, iv, ct} }]  (no photos: the old form's photos stay where they are)
function importMany_(q) {
  var items = Array.isArray(q.items) ? q.items : [];
  if (!items.length || items.length > 100) return { error: 'bad-items' };
  for (var i = 0; i < items.length; i++) {
    var season = Number(items[i].season);
    if (!(season >= 2024 && season <= 2100) || !sealedOk_(items[i].app, 200000)) return { error: 'bad-item', index: i };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var index = readJson_('applications.json', []);
    var nos = items.map(function (it) {
      var season = Number(it.season);
      var seq = Number(props.getProperty('SEQ_' + season) || 0) + 1;
      props.setProperty('SEQ_' + season, String(seq));
      var no = 'BF' + String(season).slice(2) + '-' + ('000' + seq).slice(-4);
      var at = new Date(it.at);
      index.push({ no: no, season: season, at: isNaN(at) ? new Date().toISOString() : at.toISOString(),
        app: { epk: it.app.epk, iv: it.app.iv, ct: it.app.ct }, photos: [], legacy: true });
      return no;
    });
    writeJson_('applications.json', index);
    return { ok: true, nos: nos };
  } finally {
    lock.releaseLock();
  }
}

// Team settings kept by the script: who gets an email when a new application arrives.
function settings_(q) {
  var props = PropertiesService.getScriptProperties();
  if (Array.isArray(q.notify)) {
    var list = q.notify.map(function (x) { return String(x).trim(); }).filter(function (x) { return x; });
    if (list.length > 5 || list.some(function (x) { return !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(x); })) return { error: 'bad-email' };
    props.setProperty('NOTIFY', JSON.stringify(list));
  }
  return { ok: true, notify: JSON.parse(props.getProperty('NOTIFY') || '[]') };
}

// A short note to the team. It carries only the application number; the details stay locked.
function notify_(no) {
  var list = JSON.parse(PropertiesService.getScriptProperties().getProperty('NOTIFY') || '[]');
  if (!list.length) return;
  try {
    MailApp.sendEmail({
      to: list.join(','),
      subject: "New Bloomin' Festival application " + no,
      body: "A new vendor application (" + no + ") has arrived.\n\nOpen the Vendor Desk to read it: https://bloominfestival.com/team/\n\n" +
        "For the vendor's privacy, the application's details are locked and appear only in the Desk."
    });
  } catch (err) {}
}

// Remove an application (for example, junk sent to the public form).
function removeApp_(q) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var index = readJson_('applications.json', []);
    var keep = [], gone = null;
    index.forEach(function (a) { if (a.no === q.no) gone = a; else keep.push(a); });
    if (!gone) return { error: 'not-found' };
    (gone.photos || []).forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (err) {} });
    writeJson_('applications.json', keep);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// New team password: the browser re-locks the same keys with it and sends a new access fingerprint.
function rekey_(q) {
  if (!q.keyring || !q.keyring.pub || !/^[0-9a-f]{64}$/.test(String(q.tokenHash || ''))) return { error: 'bad-keyring' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var old = readJson_('keyring.json', null);
    if (old && old.pub && JSON.stringify(old.pub) !== JSON.stringify(q.keyring.pub)) return { error: 'different-keys' };
    writeJson_('keyring.json', q.keyring);
    PropertiesService.getScriptProperties().setProperty('TOKEN_HASH', q.tokenHash);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- storage helpers ---------- */

function sealedOk_(s, max) {
  if (!s || typeof s !== 'object') return false;
  var text = JSON.stringify(s);
  return text.length <= max && typeof s.iv === 'string' && typeof s.ct === 'string';
}

function folder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) {}
  }
  var f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function subfolder_(name) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_' + name);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) {}
  }
  var f = folder_().createFolder(name);
  props.setProperty('FOLDER_' + name, f.getId());
  return f;
}

function fileFor_(name) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FILE_' + name);
  if (id) {
    try { return DriveApp.getFileById(id); } catch (err) {}
  }
  return null;
}

function readJson_(name, fallback) {
  var f = fileFor_(name);
  if (!f) return fallback;
  var text = f.getBlob().getDataAsString();
  return text ? JSON.parse(text) : fallback;
}

function writeJson_(name, value) {
  var text = JSON.stringify(value);
  var f = fileFor_(name);
  if (f) {
    f.setContent(text);
  } else {
    f = folder_().createFile(name, text, 'application/json');
    PropertiesService.getScriptProperties().setProperty('FILE_' + name, f.getId());
  }
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
