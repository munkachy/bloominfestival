/* Bloomin' Festival vault: the locking used by the vendor application form and the festival team pages.
 *
 * Vendor applications are sealed in the vendor's browser with the festival's public key (ECDH P-256 + HKDF +
 * AES-256-GCM), so only the festival's private key can open them. The private key and the team key (which seals the
 * team's records and map) are kept in the mailbox locked with the team password (PBKDF2-SHA256, 600,000 rounds) and,
 * separately, with a printed recovery code. One password derivation gives 64 bytes: the first half unlocks the keys,
 * the second half is the access token the mailbox checks (it stores only a SHA-256 fingerprint of it).
 * The mailbox (mailbox/Code.gs, a Google Apps Script web app) never sees anything readable.
 */
(function (root) {
  'use strict';
  var MAILBOX = 'https://script.google.com/macros/s/AKfycbze-Z6FuOHn2keCt02VT6bWRgLDi2Xncu5a5T-bNwcKQL--_TrHzjXyFdwhv68pHrBNAg/exec';
  var SEASON = 2027;            // the festival year new applications belong to
  var ITER = 600000;            // password stretching
  var REC_ITER = 100000;        // the recovery code is long and random, so it needs less stretching

  var subtle = root.crypto && root.crypto.subtle;
  var enc = new TextEncoder(), dec = new TextDecoder();

  /* ---------- bytes ---------- */
  function rand(n) { var b = new Uint8Array(n); root.crypto.getRandomValues(b); return b; }
  function toB64(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function fromB64(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function hex(bytes) { return Array.prototype.map.call(new Uint8Array(bytes), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function sha256Hex(text) { return hex(await subtle.digest('SHA-256', enc.encode(text))); }

  /* ---------- mailbox ---------- */
  async function call(action, body) {
    var payload = Object.assign({ a: action }, body || {});
    var res;
    try {
      res = await fetch(MAILBOX, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    } catch (e) {
      throw new Error('We could not reach the festival mailbox. Please check your internet connection and try again.');
    }
    if (!res.ok) throw new Error('The festival mailbox did not answer (' + res.status + '). Please try again in a minute.');
    return res.json();
  }
  async function hello() { return call('hello'); }

  /* ---------- password and keys ---------- */
  async function stretch(secret, salt, iterations, bits) {
    var base = await subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations }, base, bits));
  }
  function aesKey(raw, usages) { return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usages || ['encrypt', 'decrypt']); }
  async function seal(key, bytes) {
    var iv = rand(12);
    return { iv: toB64(iv), ct: toB64(await subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, bytes)) };
  }
  async function open(key, sealed) {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) }, key, fromB64(sealed.ct)));
  }

  // Password -> { token (for the mailbox), kek (unlocks the keys) }
  async function fromPassword(password, access) {
    var bits = await stretch(password, fromB64(access.salt), access.iter, 512);
    return { kek: await aesKey(bits.slice(0, 32)), token: hex(bits.slice(32)) };
  }

  // Recovery code -> { token (proves it to the mailbox), kek (unlocks the keys) }, the same way as the password
  async function fromRecovery(code, w) {
    var bits = await stretch(normalizeRecovery(code), fromB64(w.salt), w.iter, 512);
    return { kek: await aesKey(bits.slice(0, 32)), token: hex(bits.slice(32)) };
  }

  // A recovery code like 7KQ2-M9XA-... (Crockford base32, no confusing letters)
  var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function newRecoveryCode() {
    var bytes = rand(20), bits = '', out = '';
    bytes.forEach(function (b) { bits += ('0000000' + b.toString(2)).slice(-8); });
    for (var i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
    return out.match(/.{4}/g).join('-');
  }
  function normalizeRecovery(code) {
    return String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  }

  async function exportSecrets(session) {
    return enc.encode(JSON.stringify({ priv: toB64(await subtle.exportKey('pkcs8', session.priv)), team: toB64(session.teamRaw) }));
  }
  async function importSecrets(bytes, pubJwk) {
    var s = JSON.parse(dec.decode(bytes));
    var teamRaw = fromB64(s.team);
    return {
      priv: await subtle.importKey('pkcs8', fromB64(s.priv), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
      teamRaw: teamRaw,
      team: await aesKey(teamRaw),
      pub: pubJwk
    };
  }

  // First-time setup: new festival keys, locked with the password and with a printed recovery code.
  async function createKeyring(password) {
    var pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    var pubJwk = await subtle.exportKey('jwk', pair.publicKey);
    var pub = { kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x, y: pubJwk.y };
    var teamRaw = rand(32);
    var session = { priv: pair.privateKey, teamRaw: teamRaw, team: await aesKey(teamRaw), pub: pub };
    var recoveryCode = newRecoveryCode();
    var built = await lockKeyring(session, password, recoveryCode);
    session.token = built.token;
    session.keyring = built.keyring;
    return { keyring: built.keyring, tokenHash: built.tokenHash, recHash: built.recHash, recoveryCode: recoveryCode, session: session };
  }

  async function lockKeyring(session, password, recoveryCode, keepRecoveryFrom) {
    var access = { salt: toB64(rand(16)), iter: ITER };
    var p = await fromPassword(password, access);
    var secrets = await exportSecrets(session);
    var rec = keepRecoveryFrom, recHash = null;
    if (!rec) {
      var recSalt = rand(16);
      var r = await fromRecovery(recoveryCode, { salt: toB64(recSalt), iter: REC_ITER });
      rec = Object.assign({ salt: toB64(recSalt), iter: REC_ITER }, await seal(r.kek, secrets));
      recHash = await sha256Hex(r.token);
    }
    return {
      keyring: { version: 1, created: new Date().toISOString(), pub: session.pub, access: access, wrap: { pw: await seal(p.kek, secrets), rec: rec } },
      tokenHash: await sha256Hex(p.token),
      recHash: recHash,
      token: p.token
    };
  }

  // Sign in: returns a session { priv, team, pub, token } or throws.
  async function signIn(password) {
    var h = await hello();
    if (!h.ready) throw new Error('not-set-up');
    var p = await fromPassword(password, h.access);
    var r = await call('login', { token: p.token });
    if (r.error) throw new Error(r.error);
    var session = await importSecrets(await open(p.kek, r.keyring.wrap.pw), r.keyring.pub);
    session.token = p.token;
    session.keyring = r.keyring;
    return session;
  }

  // Forgotten password: open the keys with the recovery code, then set a new password (same keys, same data).
  async function recoverWith(recoveryCode, newPassword) {
    var h = await hello();
    if (!h.ready) throw new Error('not-set-up');
    var r = await call('recoveryKeyring');
    if (r.error) throw new Error(r.error);
    var w = r.recovery.wrap, rk = await fromRecovery(recoveryCode, w);
    var session;
    try { session = await importSecrets(await open(rk.kek, w), r.recovery.pub); } catch (e) { throw new Error('wrong-recovery-code'); }
    var built = await lockKeyring(session, newPassword, null, w);
    var done = await call('recover', { recToken: rk.token, keyring: built.keyring, tokenHash: built.tokenHash });
    if (done.error) throw new Error(done.error);
    session.token = built.token;
    session.keyring = built.keyring;
    return session;
  }

  // Change the team password (signed in): same keys, re-locked; the recovery code stays valid.
  async function changePassword(session, newPassword) {
    var built = await lockKeyring(session, newPassword, null, session.keyring.wrap.rec);
    var r = await call('rekey', { token: session.token, keyring: built.keyring, tokenHash: built.tokenHash });
    if (r.error) throw new Error(r.error);
    session.token = built.token;
    session.keyring = built.keyring;
    return session;
  }

  /* ---------- vendor side ---------- */
  async function importPub(jwk) {
    return subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  }
  async function appKey(privateKey, publicKey, epkRaw) {
    var shared = await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
    var base = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: epkRaw, info: enc.encode('bloomin-application-v1') },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // Seal an application object and its photos (Uint8Arrays) for the festival. Only the team can open them.
  async function sealApplication(pubJwk, appObj, photos) {
    var festival = await importPub(pubJwk);
    var eph = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    var epkRaw = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
    var key = await appKey(eph.privateKey, festival, epkRaw);
    var app = Object.assign({ epk: toB64(epkRaw) }, await seal(key, enc.encode(JSON.stringify(appObj))));
    var sealedPhotos = [];
    for (var i = 0; i < (photos || []).length; i++) sealedPhotos.push(await seal(key, photos[i]));
    return { app: app, photos: sealedPhotos };
  }

  /* ---------- team side ---------- */
  async function keyForApplication(session, sealedApp) {
    var epkRaw = fromB64(sealedApp.epk);
    var epk = await subtle.importKey('raw', epkRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return appKey(session.priv, epk, epkRaw);
  }
  async function openApplication(session, sealedApp) {
    var key = await keyForApplication(session, sealedApp);
    return JSON.parse(dec.decode(await open(key, sealedApp)));
  }
  async function openPhoto(session, sealedApp, sealedPhoto) {
    return open(await keyForApplication(session, sealedApp), sealedPhoto);
  }
  async function sealTeam(session, obj) { return seal(session.team, enc.encode(JSON.stringify(obj))); }
  async function openTeam(session, sealed) { return JSON.parse(dec.decode(await open(session.team, sealed))); }

  root.BFVault = {
    MAILBOX: MAILBOX, SEASON: SEASON,
    call: call, hello: hello,
    createKeyring: createKeyring, signIn: signIn, changePassword: changePassword, recoverWith: recoverWith,
    sealApplication: sealApplication, openApplication: openApplication, openPhoto: openPhoto,
    sealTeam: sealTeam, openTeam: openTeam,
    _internal: { toB64: toB64, fromB64: fromB64, sha256Hex: sha256Hex, fromPassword: fromPassword, normalizeRecovery: normalizeRecovery }
  };
})(typeof window !== 'undefined' ? window : globalThis);
