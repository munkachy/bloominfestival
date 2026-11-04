/* Bloomin' Festival team page: first-time setup, sign-in, the Vendor Desk and settings.
 * Everything personal is opened here, in the browser, with the team password (see vault.js); the mailbox only ever
 * holds locked data. Nothing is kept on the device except the person's first name (for the history log).
 */
(function () {
  'use strict';
  var V = window.BFVault;
  var root = document.getElementById('tm');
  var tabsEl = document.getElementById('tm-tabs');
  var whoEl = document.getElementById('tm-who');

  var STATUSES = [
    { id: 'new', label: 'New' },
    { id: 'accepted', label: 'Accepted · awaiting payment', short: 'Accepted' },
    { id: 'paid', label: 'Paid' },
    { id: 'waitlist', label: 'Waitlist' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'withdrew', label: 'Withdrew' }
  ];
  var STATUS = {}; STATUSES.forEach(function (s) { STATUS[s.id] = s; });
  // Crafts, named as the application form offers them. Older applications (the Google sheet, or "Something else")
  // hold the vendor's own words, so those go to the craft whose word comes first in them; no match is "Other".
  var CRAFTS = [
    { id: 'Jewelry & accessories', short: 'Jewelry', words: /jewe?l|jewlery|bracelet|earring|necklace|charm bar|\bbead/ },
    { id: 'Pottery & ceramics', short: 'Pottery & ceramics', words: /potter|ceramic|stoneware|porcelain|\bclay\b/ },
    { id: 'Woodworking', short: 'Woodworking', words: /wood|carving|bird ?house|\bturning|\bcnc\b|pyrograph/ },
    { id: 'Painting, prints & photography', short: 'Painting & photo', words: /paint|\bprints\b|photo|lettered|\bart\b|fine craft/ },
    { id: 'Fiber arts', short: 'Fiber arts', words: /crochet|fiber|fibre|knit|embroider|quilt|macrame|yarn|sewing|sewn|rag rug|monogram/ },
    { id: 'Clothing & hats', short: 'Clothing & hats', words: /clothin|boutique|shirt|\btees?\b|apparel|\bhats?\b|wearable/ },
    { id: 'Glass', short: 'Glass', words: /glass/ },
    { id: 'Metalwork', short: 'Metalwork', words: /metal|forged|blacksmith|\biron\b|copper|silverware|wire mesh|steel/ },
    { id: 'Candles, soap & bath', short: 'Candles & bath', words: /candle|soap|bath|lotion|skin ?care|tallow|wax melt|essential oil|beauty|cosmetic|salve|scrub|beard|hygiene|scents|diffuser|clean|freshener|linen spray/ },
    { id: 'Home & garden decor', short: 'Home & garden', words: /decor|door hanger|wreath|concrete|statuary|garden|yard art|wind ?chime|\bsigns?\b|bird feeder|hammock|coaster|plaster/ },
    { id: 'Plants & flowers', short: 'Plants & flowers', words: /plant|flower|floral|bonsai/ },
    { id: 'Mixed media', short: 'Mixed media', words: /mixed media|upcycl|sculpture|resin/ },
    { id: 'Food, treats & honey', short: 'Food & treats', words: /food|fudge|cand(y|ies)|coffee|bbq|sauce|honey|bake|cookie|bread|popcorn|kettle|lemonade|jerky|\bjams?\b|jell|spice|season|cheese|apple|ice cream|peanut|sweet|treat|\bmix|snack|dessert|\bpies\b|corn\b|salsa|brittle|confection|pork skin|cheesecake|\btea\b|drink|beverage|culinary|sourdough|vinaigrette|glaze|\brubs?\b/ },
    { id: 'Other', short: 'Other', words: null }
  ];
  var CRAFT = {}; CRAFTS.forEach(function (c) { CRAFT[c.id] = c; });
  function craftOf(text) {
    if (CRAFT[text]) return text;
    var t = String(text || '').toLowerCase().replace(/polymer clay/g, 'polymer'), best = 'Other', at = Infinity;
    CRAFTS.forEach(function (c) { var m = c.words && c.words.exec(t); if (m && m.index < at) { at = m.index; best = c.id; } });
    return best;
  }
  // Who is emailed about new applications until the team changes it in Settings (kept in pieces so address
  // harvesters reading this public file don't find them).
  var NOTIFY_DEFAULT = [['rgongre', 'stbernardprep.com'], ['braugustine', 'stbernardabbey.com']].map(function (p) { return p.join('@'); });
  var PAY_URL = 'https://bloominfestival.com/become-an-exhibitor/#bf-apply';

  var S = {
    session: null, apps: [], season: V.SEASON, filter: 'all', craft: 'all', q: '', sort: 'newest', openNo: null, tab: 'vendors',
    photoUrls: {}, loadedAt: null
  };

  /* ---------- small helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, el) { return (el || root).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function myName() { return store('bf-team-name') || 'Team'; }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function whenTime(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function screen(html) { root.innerHTML = '<div class="bf-wrap">' + html + '</div>'; }
  function busy(btn, text) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = text; }
  function unbusy(btn) { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
  function friendly(err) {
    var m = err && err.message || String(err);
    return ({
      'wrong-password': "That password isn't right.",
      'paused': 'Too many wrong passwords. Please wait 15 minutes and try again.',
      'wrong-recovery-code': "That recovery code isn't right.",
      'not-set-up': 'The team password has not been set up yet.',
      'already-set-up': 'The team password was already set up. Please sign in instead.',
      'server': 'The festival mailbox had a problem. Please try again in a minute.',
      'busy': 'The festival mailbox is busy. Please try again in a minute.'
    })[m] || m;
  }
  function pwField(id, label, auto) {
    return '<label class="tm-field" for="' + id + '"><span>' + label + '</span>' +
      '<span class="tm-pw"><input id="' + id + '" type="password" autocomplete="' + auto + '" required>' +
      '<button type="button" class="tm-eye" data-eye="' + id + '" aria-label="Show password">Show</button></span></label>';
  }
  root.addEventListener('click', function (e) {
    var eye = e.target.closest('[data-eye]');
    if (!eye) return;
    var input = document.getElementById(eye.getAttribute('data-eye'));
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.textContent = show ? 'Hide' : 'Show';
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  /* ---------- start ---------- */
  async function boot() {
    screen('<div class="tm-center"><p class="tm-wait">Connecting to the festival mailbox…</p></div>');
    var h;
    try { h = await V.hello(); } catch (e) {
      screen('<div class="tm-card tm-narrow"><h1>Can\'t connect</h1><p>' + esc(friendly(e)) + '</p><button class="bf-btn bf-btn-honey" id="retry">Try again</button></div>');
      $('#retry').onclick = boot;
      return;
    }
    if (h.ready) signInScreen(); else setupScreen();
  }

  /* ---------- first-time setup ---------- */
  function setupScreen() {
    screen('<form class="tm-card tm-narrow" id="setup">' +
      '<p class="bf-label">First-time setup</p><h1>Create the team password</h1>' +
      '<p>This one password opens the Vendor Desk and the festival map for everyone on the festival team. ' +
      'Vendors\' details are locked with it, so choose something long that you can remember. A short sentence works well, ' +
      'like <em>blooming dulcimers in April</em>.</p>' +
      pwField('pw1', 'Team password (at least 10 characters)', 'new-password') +
      pwField('pw2', 'Type it again', 'new-password') +
      '<p class="tm-err" id="err" role="alert" hidden></p>' +
      '<button class="bf-btn bf-btn-honey" type="submit">Create the password</button></form>');
    $('#setup').onsubmit = async function (e) {
      e.preventDefault();
      var a = $('#pw1').value, b = $('#pw2').value, err = $('#err'), btn = e.submitter || $('#setup button[type=submit]');
      err.hidden = true;
      if (a.length < 10) { err.textContent = 'Please use at least 10 characters.'; err.hidden = false; return; }
      if (a !== b) { err.textContent = "The two passwords don't match."; err.hidden = false; return; }
      busy(btn, 'Creating the festival keys…');
      try { recoveryScreen(await V.createKeyring(a)); } catch (x) { unbusy(btn); err.textContent = friendly(x); err.hidden = false; }
    };
  }

  function codeLines(code) {     // 8 groups of 4, shown as two even lines
    var g = code.split('-');
    return '<span>' + esc(g.slice(0, 4).join('-')) + '-</span><span>' + esc(g.slice(4).join('-')) + '</span>';
  }
  function recoveryScreen(made) {
    var today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    screen('<div class="tm-card tm-narrow" id="rec">' +
      '<p class="bf-label">Step 2 of 2</p><h1>Save the recovery code</h1>' +
      '<p>If the team password is ever forgotten, this code is the <strong>only</strong> way to set a new one without losing the vendors\' information. ' +
      'Print it and keep it somewhere safe, such as the school safe. Anyone who has it can open the festival data, so don\'t email it or leave it lying around.</p>' +
      '<div class="tm-code" id="code">' + codeLines(made.recoveryCode) + '</div>' +
      '<div class="tm-row"><button type="button" class="bf-btn" id="print">Print it</button><button type="button" class="bf-btn" id="dl">Save as a file</button></div>' +
      '<label class="tm-check"><input type="checkbox" id="saved"> I have printed or saved the recovery code</label>' +
      '<p class="tm-err" id="err" role="alert" hidden></p>' +
      '<button class="bf-btn bf-btn-honey" id="finish" disabled>Finish setup</button></div>' +
      '<div class="tm-printsheet" aria-hidden="true"><h1>Bloomin\' Festival: team recovery code</h1><p>Made ' + esc(today) + '.</p>' +
      '<p class="tm-printcode">' + codeLines(made.recoveryCode) + '</p>' +
      '<p>If the festival team password is forgotten, go to bloominfestival.com/team, choose "Forgot the password?", and enter this code to set a new password. ' +
      'Keep this sheet somewhere safe. Anyone who has it can open the vendors\' information.</p></div>');
    $('#print').onclick = function () { document.body.classList.add('tm-printing'); window.print(); setTimeout(function () { document.body.classList.remove('tm-printing'); }, 500); };
    $('#dl').onclick = function () {
      var text = "Bloomin' Festival team recovery code\r\nMade " + today + "\r\n\r\n" + made.recoveryCode + "\r\n\r\n" +
        'If the team password is forgotten: bloominfestival.com/team > "Forgot the password?" > enter this code.\r\nKeep it safe: anyone who has it can open the vendors\' information.\r\n';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = 'Bloomin-Festival-recovery-code.txt';
      document.body.appendChild(a); a.click(); a.remove();
    };
    $('#saved').onchange = function () { $('#finish').disabled = !this.checked; };
    $('#finish').onclick = async function () {
      var btn = this, err = $('#err');
      busy(btn, 'Finishing…');
      try {
        var r = await V.call('init', { keyring: made.keyring, tokenHash: made.tokenHash, recHash: made.recHash });
        if (r.error) throw new Error(r.error);
        S.session = made.session;
        try { await V.call('settings', { token: S.session.token, notify: NOTIFY_DEFAULT }); } catch (x) {}
        afterSignIn();
      } catch (x) { unbusy(btn); err.textContent = friendly(x); err.hidden = false; }
    };
  }

  /* ---------- sign in / forgotten password ---------- */
  function signInScreen(note) {
    screen('<form class="tm-card tm-narrow" id="signin">' +
      '<p class="bf-label">Festival team</p><h1>Sign in</h1>' +
      (note ? '<p class="tm-ok">' + esc(note) + '</p>' : '') +
      pwField('pw', 'Team password', 'current-password') +
      '<p class="tm-err" id="err" role="alert" hidden></p>' +
      '<div class="tm-row"><button class="bf-btn bf-btn-honey" type="submit">Sign in</button>' +
      '<button type="button" class="tm-link" id="forgot">Forgot the password?</button></div></form>');
    $('#pw').focus();
    $('#forgot').onclick = recoverScreen;
    $('#signin').onsubmit = async function (e) {
      e.preventDefault();
      var btn = $('#signin button[type=submit]'), err = $('#err');
      err.hidden = true;
      busy(btn, 'Opening…');
      try { S.session = await V.signIn($('#pw').value); afterSignIn(); }
      catch (x) { unbusy(btn); err.textContent = friendly(x); err.hidden = false; $('#pw').select(); }
    };
  }

  function recoverScreen() {
    screen('<form class="tm-card tm-narrow" id="recover">' +
      '<p class="bf-label">Forgot the password</p><h1>Use the recovery code</h1>' +
      '<p>Type the recovery code from the printed sheet (dashes and capitals don\'t matter), then choose a new team password. ' +
      'Remember to tell the rest of the team.</p>' +
      '<label class="tm-field" for="code"><span>Recovery code</span><input id="code" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label>' +
      pwField('pw1', 'New team password (at least 10 characters)', 'new-password') +
      pwField('pw2', 'Type it again', 'new-password') +
      '<p class="tm-err" id="err" role="alert" hidden></p>' +
      '<div class="tm-row"><button class="bf-btn bf-btn-honey" type="submit">Set the new password</button>' +
      '<button type="button" class="tm-link" id="back">Back to sign in</button></div></form>');
    $('#back').onclick = function () { signInScreen(); };
    $('#recover').onsubmit = async function (e) {
      e.preventDefault();
      var a = $('#pw1').value, b = $('#pw2').value, err = $('#err'), btn = $('#recover button[type=submit]');
      err.hidden = true;
      if (a.length < 10) { err.textContent = 'Please use at least 10 characters.'; err.hidden = false; return; }
      if (a !== b) { err.textContent = "The two passwords don't match."; err.hidden = false; return; }
      busy(btn, 'Checking the code…');
      try { S.session = await V.recoverWith($('#code').value, a); afterSignIn(); }
      catch (x) { unbusy(btn); err.textContent = friendly(x); err.hidden = false; }
    };
  }

  function afterSignIn() {
    if (!store('bf-team-name')) return nameScreen();
    shell();
  }

  function nameScreen() {
    screen('<form class="tm-card tm-narrow" id="name"><p class="bf-label">One more thing</p><h1>What\'s your first name?</h1>' +
      '<p>It appears next to the changes you make, so the team can see who did what. It\'s remembered on this device only.</p>' +
      '<label class="tm-field" for="nm"><span>First name</span><input id="nm" autocomplete="given-name" required></label>' +
      '<button class="bf-btn bf-btn-honey" type="submit">Continue</button></form>');
    $('#nm').focus();
    $('#name').onsubmit = function (e) { e.preventDefault(); store('bf-team-name', $('#nm').value.trim().slice(0, 30) || 'Team'); shell(); };
  }

  /* ---------- the signed-in shell ---------- */
  function shell() {
    tabsEl.hidden = false; whoEl.hidden = false;
    whoEl.innerHTML = '<span>' + esc(myName()) + '</span><button type="button" class="tm-link" id="signout">Sign out</button>';
    document.getElementById('signout').onclick = function () { S.session = null; location.reload(); };
    tabsEl.onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) go(b.getAttribute('data-tab')); };
    go('vendors');
  }

  function go(tab) {
    S.tab = tab;
    root.classList.toggle('tm-mapmode', tab === 'map');
    $all('[data-tab]', tabsEl).forEach(function (b) { b.setAttribute('aria-current', String(b.getAttribute('data-tab') === tab)); });
    if (tab === 'vendors') loadVendors();
    else if (tab === 'map') openMap();
    else settingsView();
  }
  async function openMap() {
    if (!S.loadedAt) {
      screen('<div class="tm-center"><p class="tm-wait">Opening the map…</p></div>');
      try { await fetchApps(); } catch (x) { screen('<div class="tm-card tm-narrow"><h1>Couldn\'t open the map</h1><p>' + esc(friendly(x)) + '</p></div>'); return; }
    }
    if (S.tab !== 'map') return;
    BFTeamMap.open(root, {
      session: S.session, apps: function () { return S.apps; }, statusOf: statusOf, titleOf: titleOf, myName: myName, friendly: friendly,
      openVendor: function (no) { var v = find(no); if (v) S.season = v.season; S.openNo = no; S.filter = 'all'; S.craft = 'all'; go('vendors'); }
    });
  }

  /* ---------- loading the vendors ---------- */
  // Applications come from a public form, so every field is untrusted: keep plain text only, and honor the
  // old-sheet extras (status, notes, photo links) only on rows the team imported itself.
  var TEXT = ['name', 'business', 'email', 'phone', 'address', 'website', 'category', 'about', 'notes', 'returningYears', 'legacyStamp', 'submittedAt'];
  function strings(a) { return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }).map(function (x) { return x.slice(0, 2000); }).slice(0, 20) : []; }
  function clean(raw, legacy) {
    var r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}, d = {};
    TEXT.forEach(function (k) { var x = r[k]; d[k] = typeof x === 'string' ? x.slice(0, 6000) : typeof x === 'number' ? String(x) : ''; });
    d.booths = +r.booths === 2 ? 2 : +r.booths === 1 ? 1 : null;
    d.electricity = r.electricity === true || r.electricity === 'yes' ? 'yes' : r.electricity === false || r.electricity === 'no' ? 'no' : '';
    d.returning = r.returning === true || r.returning === 'yes' ? 'yes' : r.returning === false || r.returning === 'no' ? 'no' : '';
    d.photoLabels = strings(r.photoLabels);
    d.legacyStatus = legacy && STATUS[r.legacyStatus] ? r.legacyStatus : null;
    d.legacyNotes = legacy ? strings(r.legacyNotes) : [];
    d.photoLinks = legacy ? strings(r.photoLinks).filter(function (u) { return /^https:\/\//i.test(u); }) : [];
    return d;
  }
  async function fetchApps(progress) {
    var d = await V.call('dump', { token: S.session.token });
    if (d.error) throw new Error(d.error);
    var apps = [];
    for (var i = 0; i < d.applications.length; i++) {
      var a = d.applications[i], v = { no: a.no, season: a.season, at: a.at, legacy: !!a.legacy, photoIds: a.photos || [], sealed: a.app, rev: 0, rec: null };
      try { v.d = clean(await V.openApplication(S.session, a.app), v.legacy); } catch (x) { v.d = clean({ name: '(could not be opened)' }); v.broken = true; }
      v.craft = craftOf(v.d.category);
      var r = d.records[a.no];
      if (r) { v.rev = r.rev; try { v.rec = await V.openTeam(S.session, r.ct); } catch (x) {} }
      apps.push(v);
      if (progress && i % 25 === 0) progress(i + 1, d.applications.length);
    }
    S.apps = apps;
    S.loadedAt = new Date();
    S.bb = d.payments || null;
    markReturning();
    if (window.BFTeamMap) { try { await BFTeamMap.load(d.map, S.session); } catch (x) {} }
  }
  async function loadVendors() {
    screen('<div class="tm-center"><p class="tm-wait" id="lw">Opening the applications…</p></div>');
    try {
      await fetchApps(function (n, of) { if ($('#lw')) $('#lw').textContent = 'Opening the applications… ' + n + ' of ' + of; });
      vendorsView();
      checkBlackbaud(false);
    } catch (x) {
      screen('<div class="tm-card tm-narrow"><h1>Couldn\'t open the applications</h1><p>' + esc(friendly(x)) + '</p><button class="bf-btn bf-btn-honey" id="retry">Try again</button></div>');
      $('#retry').onclick = loadVendors;
    }
  }

  function statusOf(v) { var s = v.rec && v.rec.status; return STATUS[s] ? s : v.d.legacyStatus || 'new'; }
  function titleOf(v) { return v.d.business || v.d.name || v.no; }
  function key(s) { return String(s || '').trim().toLowerCase(); }
  function markReturning() {
    var seen = {};
    S.apps.forEach(function (v) { [key(v.d.email), key(v.d.business)].forEach(function (k) { if (k) (seen[k] = seen[k] || []).push(v.season); }); });
    S.apps.forEach(function (v) {
      var earlier = [key(v.d.email), key(v.d.business)].some(function (k) { return k && seen[k].some(function (y) { return y < v.season; }); });
      v.returning = earlier || v.d.returning === 'yes';
    });
  }

  /* ---------- the Vendor Desk ---------- */
  function seasonApps() { return S.apps.filter(function (v) { return v.season === S.season; }); }
  function visible() {
    var q = key(S.q);
    var list = seasonApps().filter(function (v) {
      if (S.filter === 'owes' ? !owes(v) : S.filter !== 'all' && statusOf(v) !== S.filter) return false;
      if (S.craft !== 'all' && v.craft !== S.craft) return false;
      if (!q) return true;
      return [v.no, v.d.name, v.d.business, v.d.email, v.d.phone, v.d.category, v.d.about, v.d.address].some(function (x) { return key(x).indexOf(q) !== -1; });
    });
    list.sort(function (a, b) {
      if (S.sort === 'name') return titleOf(a).localeCompare(titleOf(b));
      if (S.sort === 'status') return STATUSES.findIndex(function (s) { return s.id === statusOf(a); }) - STATUSES.findIndex(function (s) { return s.id === statusOf(b); }) || titleOf(a).localeCompare(titleOf(b));
      return a.at < b.at ? 1 : -1;
    });
    return list;
  }

  function vendorsView() {
    var seasons = {}; S.apps.forEach(function (v) { seasons[v.season] = (seasons[v.season] || 0) + 1; });
    if (!seasons[S.season]) seasons[S.season] = 0;
    // Each row of chips counts within the other's choice: pick Paid and the crafts show how many paid potters there are.
    var counts = { all: 0, owes: 0 }; STATUSES.forEach(function (s) { counts[s.id] = 0; });
    var crafts = { all: 0 }; CRAFTS.forEach(function (c) { crafts[c.id] = 0; });
    var collected = 0, owed = 0;
    seasonApps().forEach(function (v) {
      if (S.craft === 'all' || v.craft === S.craft) { counts.all++; counts[statusOf(v)]++; if (owes(v)) counts.owes++; }
      if (S.filter === 'all' || (S.filter === 'owes' ? owes(v) : statusOf(v) === S.filter)) { crafts.all++; crafts[v.craft]++; }
      collected += paidOf(v); if (owes(v)) owed += balanceOf(v);
    });
    screen('<div class="tm-desk">' +
      '<div class="tm-top"><div><p class="bf-label">Vendor Desk</p><h1>Bloomin\' Festival ' + S.season + '</h1></div>' +
      '<div class="tm-top-tools"><label class="tm-season"><span class="tm-sr">Festival year</span><select id="season">' +
      Object.keys(seasons).sort().reverse().map(function (y) { return '<option value="' + y + '"' + (+y === S.season ? ' selected' : '') + '>' + y + ' festival (' + seasons[y] + ')</option>'; }).join('') +
      '</select></label><button type="button" class="bf-btn" id="refresh">Refresh</button></div></div>' +
      '<div class="tm-chips" role="group" aria-label="Show">' +
      '<button type="button" class="tm-chip" data-f="all" aria-pressed="' + (S.filter === 'all') + '">All <b>' + counts.all + '</b></button>' +
      STATUSES.map(function (s) { return '<button type="button" class="tm-chip st-' + s.id + '" data-f="' + s.id + '" aria-pressed="' + (S.filter === s.id) + '"><i></i>' + esc(s.short || s.label) + ' <b>' + counts[s.id] + '</b></button>'; }).join('') +
      (counts.owes || S.filter === 'owes' ? '<button type="button" class="tm-chip tm-chip-owe" data-f="owes" aria-pressed="' + (S.filter === 'owes') + '" title="Paid part, balance still owed">Owes a balance <b>' + counts.owes + '</b></button>' : '') +
      '</div>' +
      (collected ? '<p class="tm-money">Payments recorded for ' + S.season + ': <b>' + money(collected) + '</b> collected' + (owed ? ', <b>' + money(owed) + '</b> still owed on partial payments' : '') + '.</p>' : '') +
      '<div id="bbline" class="tm-bb">' + bbLineHtml() + '</div>' +
      '<div class="tm-chips tm-crafts" role="group" aria-label="Craft"><span class="tm-crafts-l" aria-hidden="true">Craft</span>' +
      '<button type="button" class="tm-chip" data-c="all" aria-pressed="' + (S.craft === 'all') + '">All crafts <b>' + crafts.all + '</b></button>' +
      CRAFTS.filter(function (c) { return crafts[c.id] || S.craft === c.id; }).map(function (c) {
        return '<button type="button" class="tm-chip" data-c="' + esc(c.id) + '" aria-pressed="' + (S.craft === c.id) + '" title="' + esc(c.id) + '">' + esc(c.short) + ' <b>' + crafts[c.id] + '</b></button>';
      }).join('') +
      '</div>' +
      '<div class="tm-bar"><input type="search" id="q" placeholder="Search names, businesses, crafts, emails…" value="' + esc(S.q) + '" aria-label="Search">' +
      '<label class="tm-sort"><span class="tm-sr">Sort</span><select id="sort"><option value="newest">Newest first</option><option value="name">By name</option><option value="status">By status</option></select></label>' +
      '<button type="button" class="tm-link" id="csv">Download list</button><button type="button" class="tm-link" id="print">Print list</button></div>' +
      '<ul class="tm-list" id="list"></ul>' +
      '<p class="tm-foot">Loaded ' + esc(S.loadedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })) + '. New applications appear when you press Refresh.</p>' +
      '</div><div class="tm-panel" id="panel" hidden></div>');
    $('#sort').value = S.sort;
    $('#season').onchange = function () { S.season = +this.value; S.filter = 'all'; vendorsView(); };
    $('#refresh').onclick = loadVendors;
    $all('[data-f]').forEach(function (b) { b.onclick = function () { S.filter = b.getAttribute('data-f'); vendorsView(); }; });
    $all('[data-c]').forEach(function (b) { b.onclick = function () { S.craft = b.getAttribute('data-c'); vendorsView(); }; });
    var row = $('.tm-crafts'), on = $('.tm-crafts [aria-pressed="true"]');     // on phones the row scrolls: keep the choice in sight
    if (row.scrollWidth > row.clientWidth) row.scrollLeft += on.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - on.offsetWidth) / 2;
    $('#q').oninput = function () { S.q = this.value; drawList(); };
    $('#sort').onchange = function () { S.sort = this.value; drawList(); };
    $('#csv').onclick = downloadCsv;
    $('#print').onclick = function () { window.print(); };
    wireBbLine();
    drawList();
    if (S.openNo) openPanel(S.openNo);
  }

  function drawList() {
    var list = visible(), ul = $('#list');
    if (!list.length) { ul.innerHTML = '<li class="tm-empty">' + (seasonApps().length ? 'Nothing matches.' : 'No applications yet for ' + S.season + '.') + '</li>'; return; }
    ul.innerHTML = list.map(function (v) {
      var st = statusOf(v), d = v.d;
      var badges = [];
      if (d.booths === 2) badges.push('<span class="tm-bdg" title="Two booth spaces">×2 booths</span>');
      if (d.electricity === 'yes') badges.push('<span class="tm-bdg" title="Needs electricity">⚡ Power</span>');
      if (v.returning) badges.push('<span class="tm-bdg" title="Has applied in an earlier year">↺ Returning</span>');
      if (v.legacy) badges.push('<span class="tm-bdg tm-bdg-old" title="Brought over from the Google sheet">Google sheet</span>');
      if (owes(v)) badges.push('<span class="tm-bdg tm-bdg-owe" title="Paid ' + money(paidOf(v)) + ' of ' + money(dueOf(v)) + '">Owes ' + money(balanceOf(v)) + '</span>');
      var bo = window.BFTeamMap && BFTeamMap.boothFor(v.no);
      if (bo) badges.push('<span class="tm-bdg tm-bdg-booth" title="Their booth on the festival map">Booth ' + esc(bo.n) + (bo.double && bo.n2 && !bo.one ? '–' + esc(bo.n2) : '') + '</span>');
      return '<li><button type="button" class="tm-item st-' + st + '" data-no="' + esc(v.no) + '">' +
        '<span class="tm-item-main"><b>' + esc(titleOf(v)) + '</b>' +
        '<span>' + esc([d.business ? d.name : '', d.category].filter(Boolean).join(' · ')) + '</span>' +
        (badges.length ? '<span class="tm-bdgs">' + badges.join('') + '</span>' : '') + '</span>' +
        '<span class="tm-item-side"><span class="tm-pill st-' + st + '">' + esc(STATUS[st].short || STATUS[st].label) + '</span>' +
        '<small>' + esc(v.no) + ' · ' + esc(when(v.at)) + '</small></span></button></li>';
    }).join('');
    $all('[data-no]', ul).forEach(function (b) { b.onclick = function () { openPanel(b.getAttribute('data-no')); }; });
  }

  function find(no) { return S.apps.filter(function (v) { return v.no === no; })[0]; }

  /* ---------- one application ---------- */
  function openPanel(no) {
    var v = find(no), panel = $('#panel');
    if (!v || !panel) return;
    S.openNo = no;
    var d = v.d, st = statusOf(v), rec = v.rec || {};
    var history = (rec.history || []).slice().reverse();
    var notes = (rec.notes || []).slice().reverse();
    var legacyNotes = d.legacyNotes && d.legacyNotes.length ? '<p class="tm-old">From the Google sheet: ' + esc(d.legacyNotes.join(' · ')) + '</p>' : '';
    var site = d.website ? (/^https?:\/\//i.test(d.website) ? d.website : 'https://' + d.website) : '';
    var mailSubject = "Bloomin' Festival " + v.season + ' application ' + v.no;
    var acceptBody = 'Dear ' + (d.name || 'vendor') + ',\n\nThank you for applying to the ' + v.season + " Bloomin' Festival. We are delighted to tell you that your application has been accepted!\n\n" +
      'To reserve your booth, please register and pay your booth fee here:\n' + PAY_URL + '\n\nWhen the page asks, answer "Yes" to both questions to open the payment form.\n\nWe look forward to seeing you at the festival.\n\n' + myName();
    panel.hidden = false;
    panel.innerHTML = '<div class="tm-panel-in" role="dialog" aria-labelledby="ptitle">' +
      '<div class="tm-panel-top"><button type="button" class="tm-link" id="close">← Back to the list</button><span class="tm-pill st-' + st + '">' + esc(STATUS[st].label) + '</span></div>' +
      '<p class="bf-label">' + esc(v.no) + (v.legacy ? ' · from the Google sheet' : '') + '</p>' +
      '<h2 id="ptitle" tabindex="-1">' + esc(titleOf(v)) + '</h2>' +
      (d.business && d.name ? '<p class="tm-sub">' + esc(d.name) + '</p>' : '') +
      '<div class="tm-status" role="group" aria-label="Status">' + STATUSES.map(function (s) {
        return '<button type="button" class="tm-sbtn st-' + s.id + '" data-set="' + s.id + '" aria-pressed="' + (s.id === st) + '">' + esc(s.short || s.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="tm-contact">' +
      (d.email ? '<a class="bf-btn" href="mailto:' + esc(d.email) + '?subject=' + encodeURIComponent(mailSubject) + '">Email</a>' : '') +
      (d.email && st === 'accepted' ? '<a class="bf-btn bf-btn-honey" href="mailto:' + esc(d.email) + '?subject=' + encodeURIComponent("You're in! " + mailSubject) + '&body=' + encodeURIComponent(acceptBody) + '">Email acceptance &amp; payment link</a>' : '') +
      (d.phone ? '<a class="bf-btn" href="tel:' + esc(String(d.phone).replace(/[^0-9+]/g, '')) + '">Call ' + esc(d.phone) + '</a>' : '') +
      '</div>' +
      '<dl class="tm-dl">' +
      row('Email', d.email) + row('Phone', d.phone) + row('Address', d.address) +
      (site ? '<dt>Website</dt><dd><a href="' + esc(site) + '" target="_blank" rel="noopener">' + esc(d.website) + '</a></dd>' : '') +
      row('Category', d.category) + (v.craft !== d.category ? row('Listed under', v.craft) : '') +
      row('Booth spaces', d.booths === 2 ? '2, side by side' : d.booths === 1 ? '1' : '') +
      row('Electricity', d.electricity === 'yes' ? 'Yes (+$25)' : d.electricity === 'no' ? 'No' : '') +
      row('Exhibited before', d.returning === 'yes' ? 'Yes' + (d.returningYears ? ' (' + d.returningYears + ')' : '') : d.returning === 'no' ? 'No' : '') +
      row('Applied', whenTime(v.at)) +
      '</dl>' +
      paymentsHtml(v) +
      boothHtml(v) +
      (d.about ? '<h3>About their work</h3><p class="tm-about">' + esc(d.about) + '</p>' : '') +
      (d.notes ? '<h3>Their note to us</h3><p class="tm-about">' + esc(d.notes) + '</p>' : '') +
      '<h3>Photos</h3><div class="tm-photos" id="photos">' + photosHtml(v) + '</div>' +
      '<h3>Team notes</h3><form id="noteform" class="tm-noteform"><label class="tm-sr" for="note">Add a note</label>' +
      '<textarea id="note" rows="2" placeholder="Add a note for the team…"></textarea><button class="bf-btn" type="submit">Add note</button></form>' +
      legacyNotes +
      '<ul class="tm-log">' + notes.map(function (n) { return '<li><b>' + esc(n.by) + '</b> <time>' + esc(whenTime(n.at)) + '</time><p>' + esc(n.text) + '</p></li>'; }).join('') + '</ul>' +
      (history.length ? '<h3>History</h3><ul class="tm-log tm-hist">' + history.map(function (h) {
        return '<li><time>' + esc(whenTime(h.at)) + '</time> ' + esc(h.by) + ' marked it <span class="tm-pill st-' + esc(h.to) + '">' + esc((STATUS[h.to] || {}).short || (STATUS[h.to] || {}).label || h.to) + '</span></li>';
      }).join('') + '</ul>' : '') +
      '<p class="tm-err" id="perr" role="alert" hidden></p>' +
      '<details class="tm-danger"><summary>Remove this application</summary><p>Only for junk or duplicates. This deletes it for good.</p>' +
      '<button type="button" class="bf-btn" id="remove">Remove ' + esc(v.no) + '</button></details>' +
      '</div>';
    function row(label, val) { return val ? '<dt>' + label + '</dt><dd>' + esc(val) + '</dd>' : ''; }
    var sm = $('#showmap'); if (sm) sm.onclick = function () { go('map'); setTimeout(function () { BFTeamMap.showBooth(v.no); }, 60); };
    $('#ptitle').focus();
    $('#close').onclick = closePanel;
    $all('[data-set]', panel).forEach(function (b) { b.onclick = function () { setStatus(v, b.getAttribute('data-set')); }; });
    $('#noteform').onsubmit = function (e) { e.preventDefault(); var t = $('#note').value.trim(); if (t) addNote(v, t); };
    $('#remove').onclick = function () { removeApp(v, this); };
    wirePayments(v);
    loadPhotos(v);
  }
  function boothHtml(v) {
    var b = window.BFTeamMap && BFTeamMap.boothFor(v.no), d = v.d;
    if (!b) return LIVE_ST.indexOf(statusOf(v)) !== -1 ? '<h3>Booth</h3><p class="tm-muted">Not on the festival map yet. Place them from the Map tab.</p>' : '';
    var nums = b.n + (b.double && b.n2 && !b.one ? ' and ' + b.n2 : ''), link = 'https://bloominfestival.com/map/?booth=' + encodeURIComponent(b.n);
    var body = 'Dear ' + (d.name || 'vendor') + ',\n\nYour booth at the ' + v.season + " Bloomin' Festival is number " + nums + '. You can see where it is on the festival map:\n' + link +
      '\n\nSetup can begin the Friday before the festival, and booths must be ready by 8 a.m. on Saturday and Sunday.\n\nSee you at the festival!\n\n' + myName();
    return '<h3>Booth</h3><p class="tm-boothline">Booth <b>' + esc(nums) + '</b>' + (b.zone ? ' · ' + esc(b.zone) : '') + '</p>' +
      '<div class="tm-contact"><button type="button" class="bf-btn" id="showmap">Show on the map</button>' +
      (d.email ? '<a class="bf-btn" href="mailto:' + esc(d.email) + '?subject=' + encodeURIComponent("Your Bloomin' Festival booth: " + nums) + '&body=' + encodeURIComponent(body) + '">Email booth assignment</a>' : '') + '</div>';
  }
  var LIVE_ST = ['accepted', 'paid'];

  /* ---------- payments (amounts in cents, kept in the team record) ---------- */
  // The usual fee from the exhibitor page: $275 a booth space, $25 for electricity. The team can change it per vendor.
  var BOOTH_FEE = 27500, POWER_FEE = 2500;
  var PAY_HOW = ['In person at Bernard Blues', 'Online (Blackbaud)', 'Check', 'Cash', 'Card in person', 'Other'];
  function usualFee(v) { return BOOTH_FEE * (v.d.booths === 2 ? 2 : 1) + (v.d.electricity === 'yes' ? POWER_FEE : 0); }
  function paymentsOf(v) { return (v.rec && v.rec.payments) || []; }
  function dueOf(v) { var r = v.rec; return r && typeof r.due === 'number' ? r.due : usualFee(v); }
  function paidOf(v) { return paymentsOf(v).reduce(function (s, p) { return s + p.amount; }, 0); }
  function balanceOf(v) { return dueOf(v) - paidOf(v); }
  function owes(v) { return paymentsOf(v).length > 0 && balanceOf(v) > 0 && statusOf(v) !== 'withdrew' && statusOf(v) !== 'rejected'; }
  function money(c) { return '$' + (c / 100).toFixed(c % 100 ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function cents(s) { var m = /^\$?\s*(\d{1,5}(?:,\d{3})*)(?:\.(\d{1,2}))?$/.exec(String(s || '').trim()); return m ? +m[1].replace(/,/g, '') * 100 + +((m[2] || '0') + '0').slice(0, 2) : null; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayText(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function paymentsHtml(v) {
    var list = paymentsOf(v), due = dueOf(v), paid = paidOf(v), bal = due - paid, custom = v.rec && typeof v.rec.due === 'number';
    return '<h3>Payments</h3><div class="tm-pay">' +
      '<div class="tm-paysum"><span><small>Amount due</small><b>' + money(due) + '</b></span><span><small>Paid</small><b>' + money(paid) + '</b></span>' +
      '<span class="' + (bal > 0 ? 'tm-owe' : 'tm-even') + '"><small>' + (bal < 0 ? 'Overpaid' : 'Balance') + '</small><b>' + money(Math.abs(bal)) + '</b></span></div>' +
      '<p class="tm-muted tm-paynote">' + (custom ? 'Amount due set by the team.' : 'The usual fee: ' + (v.d.booths === 2 ? 'two booth spaces' : 'one booth space') + (v.d.electricity === 'yes' ? ' with electricity' : '') + '.') +
      ' <button type="button" class="tm-link" id="duebtn">Change</button></p>' +
      '<form id="dueform" class="tm-row" hidden><label class="tm-sr" for="due">Amount due</label><input id="due" inputmode="decimal" value="' + esc((due / 100).toFixed(2)) + '">' +
      '<button class="bf-btn" type="submit">Save amount due</button></form>' +
      (list.length ? '<ul class="tm-log tm-paylist">' + list.map(function (p) {
        return '<li><span><b>' + money(p.amount) + '</b> ' + esc(p.how) + ' <time>' + esc(dayText(p.date)) + '</time>' + (p.note ? '<p>' + esc(p.note) + '</p>' : '') +
          '<small>' + (p.ref ? 'Blackbaud gift ' + esc(p.ref) + ' · imported by ' : 'Recorded by ') + esc(p.by) + '</small></span><button type="button" class="tm-link" data-unpay="' + esc(p.id) + '">Remove</button></li>';
      }).join('') + '</ul>' : '<p class="tm-muted">No payments recorded yet.</p>') +
      '<form id="payform" class="tm-payform"><div class="tm-payfields">' +
      '<label><span>Amount</span><input id="payamt" inputmode="decimal" placeholder="' + esc((Math.max(bal, 0) / 100).toFixed(2)) + '" required></label>' +
      '<label><span>How</span><select id="payhow">' + PAY_HOW.map(function (h) { return '<option>' + esc(h) + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Date</span><input id="paydate" type="date" value="' + today() + '" required></label></div>' +
      '<label><span>Note (optional)</span><input id="paynote" maxlength="200" placeholder="Receipt number, who took it…"></label>' +
      '<button class="bf-btn bf-btn-honey" type="submit">Record payment</button></form></div>';
  }
  // Adds payments to a team record, skipping Blackbaud refs it already has. A Blackbaud payment the team already typed in
  // by hand (Online (Blackbaud), same amount, no ref) is linked to it instead of counted twice. Paid in full marks them Paid.
  function handTyped(list, p) { return list.filter(function (x) { return !x.ref && x.how === 'Online (Blackbaud)' && x.amount === p.amount; })[0]; }
  function addPayments(v, rec, list) {
    rec.payments = rec.payments || [];
    var refs = {}; rec.payments.forEach(function (x) { if (x.ref) refs[x.ref] = 1; });
    var add = list.filter(function (p) {
      if (p.ref && refs[p.ref]) return false;
      if (p.ref) {
        refs[p.ref] = 1;
        var same = handTyped(rec.payments, p);
        if (same) { same.ref = p.ref; same.note = (same.note ? same.note + ' ' : '') + '(Matched to Blackbaud gift ' + p.ref + '.)'; return false; }
      }
      return true;
    });
    if (!add.length) return 0;
    rec.payments = rec.payments.concat(add);
    var st = STATUS[rec.status] ? rec.status : statusOf(v);
    var paid = rec.payments.reduce(function (s, x) { return s + x.amount; }, 0), due = typeof rec.due === 'number' ? rec.due : usualFee(v);
    if (paid >= due && st !== 'paid' && st !== 'withdrew') {     // paid in full: mark them Paid
      rec.history.push({ at: add[0].at, by: add[0].by, from: st, to: 'paid' }); rec.status = 'paid';
    }
    return add.length;
  }
  function wirePayments(v) {
    $('#duebtn').onclick = function () { $('#dueform').hidden = !$('#dueform').hidden; if (!$('#dueform').hidden) $('#due').focus(); };
    $('#dueform').onsubmit = async function (e) {
      e.preventDefault();
      var c = cents($('#due').value); if (c === null) return showPanelError(new Error('Please type the amount due in dollars, like 275 or 300.00.'));
      try { await saveRecord(v, function (rec) { rec.due = c; }); vendorsView(); } catch (x) { showPanelError(x); }
    };
    $('#payform').onsubmit = async function (e) {
      e.preventDefault();
      var c = cents($('#payamt').value), btn = $('#payform button');
      if (!c) return showPanelError(new Error('Please type the amount paid in dollars, like 100 or 137.50.'));
      var p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), amount: c, how: $('#payhow').value, date: $('#paydate').value || today(),
        note: $('#paynote').value.trim().slice(0, 200), by: myName(), at: new Date().toISOString() };
      busy(btn, 'Saving…');
      try {
        await saveRecord(v, function (rec) { addPayments(v, rec, [p]); });
        vendorsView();
      } catch (x) { unbusy(btn); showPanelError(x); }
    };
    $all('[data-unpay]').forEach(function (b) {
      b.onclick = async function () {
        var id = b.getAttribute('data-unpay'), p = paymentsOf(v).filter(function (x) { return x.id === id; })[0];
        if (!p || !confirm('Remove the ' + money(p.amount) + ' payment from ' + dayText(p.date) + '?')) return;
        try { await saveRecord(v, function (rec) { rec.payments = (rec.payments || []).filter(function (x) { return x.id !== id; }); }); vendorsView(); } catch (x) { showPanelError(x); }
      };
    });
  }
  function closePanel() { S.openNo = null; var p = $('#panel'); if (p) { p.hidden = true; p.innerHTML = ''; } }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.openNo) closePanel(); });

  function photosHtml(v) {
    var links = v.d.photoLinks || [];
    if (!v.photoIds.length && !links.length) return '<p class="tm-muted">No photos.</p>';
    return v.photoIds.map(function (id, i) {
      var label = (v.d.photoLabels || [])[i] || 'Photo ' + (i + 1);
      return '<figure data-photo="' + esc(id) + '"><div class="tm-ph">Opening…</div><figcaption>' + esc(label) + '</figcaption></figure>';
    }).join('') + links.map(function (u, i) {
      return '<a class="tm-plink" href="' + esc(u) + '" target="_blank" rel="noopener">Photo ' + (i + 1) + ' (opens in Google Drive)</a>';
    }).join('');
  }
  async function loadPhotos(v) {
    for (var i = 0; i < v.photoIds.length; i++) {
      var id = v.photoIds[i], fig = $('[data-photo="' + id + '"]');
      try {
        if (!S.photoUrls[id]) {
          var r = await V.call('photo', { token: S.session.token, id: id });
          if (r.error) throw new Error(r.error);
          var bytes = await V.openPhoto(S.session, v.sealed, r.photo);
          S.photoUrls[id] = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
        }
        fig = $('[data-photo="' + id + '"]');
        if (fig) fig.querySelector('.tm-ph').outerHTML = '<a href="' + S.photoUrls[id] + '" target="_blank" rel="noopener"><img src="' + S.photoUrls[id] + '" alt=""></a>';
      } catch (x) {
        fig = $('[data-photo="' + id + '"]');
        if (fig) fig.querySelector('.tm-ph').textContent = 'Could not open this photo.';
      }
    }
  }

  /* ---------- saving team changes ---------- */
  async function saveRecord(v, change) {
    var err = $('#perr'); if (err) err.hidden = true;
    for (var attempt = 0; attempt < 3; attempt++) {
      var next = JSON.parse(JSON.stringify(v.rec || { status: v.d.legacyStatus || 'new', history: [], notes: [] }));
      next.history = next.history || []; next.notes = next.notes || [];
      change(next);
      var ct = await V.sealTeam(S.session, next);
      var r = await V.call('put', { token: S.session.token, id: v.no, rev: v.rev || 0, ct: ct });
      if (r.ok) { v.rev = r.record.rev; v.rec = next; return true; }
      if (r.error === 'conflict') {     // someone else saved first: take theirs, then apply ours on top
        v.rev = r.current ? r.current.rev : 0;
        v.rec = r.current ? await V.openTeam(S.session, r.current.ct) : null;
        continue;
      }
      throw new Error(r.error || 'save failed');
    }
    throw new Error('Someone else is changing this application right now. Please try again.');
  }

  async function setStatus(v, to) {
    var from = statusOf(v);
    if (from === to) return;
    $all('[data-set]').forEach(function (b) { b.disabled = true; });
    try {
      await saveRecord(v, function (rec) { rec.history.push({ at: new Date().toISOString(), by: myName(), from: rec.status || from, to: to }); rec.status = to; });
      vendorsView();
    } catch (x) { showPanelError(x); $all('[data-set]').forEach(function (b) { b.disabled = false; }); }
  }
  async function addNote(v, text) {
    var btn = $('#noteform button'); busy(btn, 'Saving…');
    try { await saveRecord(v, function (rec) { rec.notes.push({ at: new Date().toISOString(), by: myName(), text: text.slice(0, 4000) }); }); openPanel(v.no); }
    catch (x) { unbusy(btn); showPanelError(x); }
  }
  async function removeApp(v, btn) {
    if (!confirm('Remove ' + titleOf(v) + ' (' + v.no + ') for good?')) return;
    busy(btn, 'Removing…');
    try {
      var r = await V.call('removeApp', { token: S.session.token, no: v.no });
      if (r.error) throw new Error(r.error);
      if (v.rec) await V.call('put', { token: S.session.token, id: v.no, rev: v.rev, ct: null });
      S.apps = S.apps.filter(function (x) { return x !== v; });
      S.openNo = null; vendorsView();
    } catch (x) { unbusy(btn); showPanelError(x); }
  }
  function showPanelError(x) { var e = $('#perr'); if (e) { e.textContent = friendly(x); e.hidden = false; } }

  /* ---------- download the list ---------- */
  function downloadCsv() {
    var cols = ['Number', 'Status', 'Business', 'Name', 'Email', 'Phone', 'Address', 'Website', 'Craft', 'What they make', 'Booth spaces', 'Electricity', 'Returning', 'Applied', 'Amount due', 'Paid', 'Balance', 'Latest team note'];
    var lines = [cols];
    visible().forEach(function (v) {
      var d = v.d, notes = (v.rec && v.rec.notes) || [];
      lines.push([v.no, (STATUS[statusOf(v)] || {}).label, d.business, d.name, d.email, d.phone, d.address, d.website, v.craft, d.category, d.booths,
        d.electricity === 'yes' ? 'Yes' : d.electricity === 'no' ? 'No' : '', v.returning ? 'Yes' : 'No',
        when(v.at), (dueOf(v) / 100).toFixed(2), (paidOf(v) / 100).toFixed(2), (balanceOf(v) / 100).toFixed(2), notes.length ? notes[notes.length - 1].text : '']);
    });
    var csv = lines.map(function (r) { return r.map(function (c) {
      c = String(c == null ? '' : c);
      if (/^[=+\-@\t\r]/.test(c)) c = "'" + c;     // so a spreadsheet never runs an answer as a formula
      return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = "Bloomin-Festival-" + S.season + '-vendors.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- settings ---------- */
  async function settingsView() {
    screen('<div class="tm-settings">' +
      '<section class="tm-card"><p class="bf-label">Notices</p><h2>Email when a new application arrives</h2>' +
      '<p>One address per line (up to 5). The email only says an application arrived and gives its number; the details stay locked here.</p>' +
      '<textarea id="notify" rows="3" aria-label="Notification addresses">Loading…</textarea>' +
      '<div class="tm-row"><button class="bf-btn bf-btn-honey" id="savenotify">Save</button><span class="tm-ok" id="notifyok" hidden>Saved.</span></div>' +
      '<p class="tm-err" id="notifyerr" role="alert" hidden></p></section>' +

      '<section class="tm-card"><p class="bf-label">Bring over</p><h2>Import from the Google sheet</h2>' +
      '<p>In the Google sheet of form responses, choose <strong>File → Download → Comma-separated values (.csv)</strong>, then pick that file here. ' +
      'Each row is locked in this browser before it is sent. Rows already imported are skipped, so it\'s safe to import again later.</p>' +
      '<input type="file" id="csvfile" accept=".csv,text/csv">' +
      '<div id="importinfo"></div></section>' +

      '<section class="tm-card"><p class="bf-label">Payments</p><h2>Blackbaud payments from the office Mac</h2>' +
      '<p>The office Mac checks Raiser\'s Edge every 30 minutes and sends the booth payments here, locked so only the team can read them. ' +
      'The Desk adds new ones when it opens, or when you press <strong>Check now</strong> in the Vendors tab.</p>' +
      '<p id="syncstate" class="tm-muted">Loading…</p>' +
      '<p>To connect the Mac (once): on it, in the betterBB folder\'s <strong>reporting</strong> folder, run <code>python3 -m bbreport booth-sync --setup</code>, then paste the key it shows here.</p>' +
      '<div class="tm-row"><label class="tm-sr" for="synckey">Sync key from the office Mac</label><input id="synckey" autocomplete="off" spellcheck="false" placeholder="Sync key (64 letters and numbers)">' +
      '<button class="bf-btn bf-btn-honey" id="savesync">Save</button></div>' +
      '<div class="tm-row"><span class="tm-ok" id="syncok" hidden>Saved.</span><button type="button" class="tm-link" id="stopsync" hidden>Disconnect the Mac</button></div>' +
      '<p class="tm-err" id="syncerr" role="alert" hidden></p></section>' +

      '<section class="tm-card"><p class="bf-label">Bring over</p><h2>Import payments (CSV)</h2>' +
      '<p>Booth fees paid online on the Blackbaud form. On the office Mac, in the betterBB folder\'s <strong>reporting</strong> folder, run ' +
      '<code>python3 -m bbreport booth-payments</code>, then pick the file it saves (in <strong>betterBB/data/out</strong>) here. ' +
      'Each payment is matched to an application by email, then by name, and locked in this browser. Payments already recorded are skipped, so it\'s safe to import again.</p>' +
      '<input type="file" id="payfile" accept=".csv,text/csv">' +
      '<div id="payinfo"></div></section>' +

      '<section class="tm-card"><p class="bf-label">Security</p><h2>Change the team password</h2>' +
      '<p>Everyone on the team will need the new password. The printed recovery code keeps working.</p>' +
      '<form id="chpw">' + pwField('np1', 'New team password (at least 10 characters)', 'new-password') + pwField('np2', 'Type it again', 'new-password') +
      '<p class="tm-err" id="pwerr" role="alert" hidden></p><div class="tm-row"><button class="bf-btn" type="submit">Change password</button><span class="tm-ok" id="pwok" hidden>Password changed.</span></div></form>' +
      '<h2 class="tm-h2gap">Your name on this device</h2><div class="tm-row"><input id="myname" value="' + esc(myName()) + '" aria-label="Your first name"><button class="bf-btn" id="savename">Save</button></div></section>' +
      '</div>');
    try {
      var r = await V.call('settings', { token: S.session.token });
      $('#notify').value = (r.notify || []).join('\n');
    } catch (x) { $('#notify').value = ''; }
    $('#savenotify').onclick = async function () {
      var list = $('#notify').value.split(/[\n,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      var ok = $('#notifyok'), err = $('#notifyerr'); ok.hidden = err.hidden = true;
      try { var r = await V.call('settings', { token: S.session.token, notify: list }); if (r.error) throw new Error(r.error === 'bad-email' ? 'One of those addresses doesn\'t look right (or there are more than 5).' : r.error); ok.hidden = false; }
      catch (x) { err.textContent = friendly(x); err.hidden = false; }
    };
    $('#chpw').onsubmit = async function (e) {
      e.preventDefault();
      var a = $('#np1').value, b = $('#np2').value, err = $('#pwerr'), ok = $('#pwok'), btn = $('#chpw button[type=submit]');
      err.hidden = ok.hidden = true;
      if (a.length < 10) { err.textContent = 'Please use at least 10 characters.'; err.hidden = false; return; }
      if (a !== b) { err.textContent = "The two passwords don't match."; err.hidden = false; return; }
      busy(btn, 'Changing…');
      try { await V.changePassword(S.session, a); ok.hidden = false; $('#np1').value = $('#np2').value = ''; }
      catch (x) { err.textContent = friendly(x); err.hidden = false; }
      unbusy(btn);
    };
    $('#savename').onclick = function () { store('bf-team-name', $('#myname').value.trim().slice(0, 30) || 'Team'); whoEl.querySelector('span').textContent = myName(); };
    $('#csvfile').onchange = function () { if (this.files[0]) prepareImport(this.files[0]); };
    $('#payfile').onchange = function () { if (this.files[0]) preparePayments(this.files[0]); };
    async function syncState() {
      try { var p = await V.call('getPayments', { token: S.session.token }); if (p.error) throw new Error(p.error); S.bb = p; } catch (x) { $('#syncstate').textContent = friendly(x); return; }
      var b = S.bb;
      $('#syncstate').textContent = !b.set ? 'Not connected yet.' : b.okAt ? 'Connected. Last sent ' + whenTime(b.okAt) + '.' + (b.syncError ? ' Its last try (' + whenTime(b.triedAt) + ') couldn\'t read Blackbaud: ' + b.syncError + '.' : '') : 'Connected. Nothing sent yet.';
      $('#stopsync').hidden = !b.set;
    }
    syncState();
    $('#savesync').onclick = async function () {
      var k = $('#synckey').value.trim().toLowerCase(), err = $('#syncerr'), ok = $('#syncok'); err.hidden = ok.hidden = true;
      if (!/^[0-9a-f]{64}$/.test(k)) { err.textContent = 'That doesn\'t look like the sync key: it is 64 letters (a–f) and numbers.'; err.hidden = false; return; }
      try { var r = await V.call('syncKey', { token: S.session.token, hash: await V._internal.sha256Hex(k) }); if (r.error) throw new Error(r.error); $('#synckey').value = ''; ok.hidden = false; syncState(); }
      catch (x) { err.textContent = friendly(x); err.hidden = false; }
    };
    $('#stopsync').onclick = async function () {
      if (!confirm('Disconnect the office Mac? It will stop sending Blackbaud payments until a new sync key is saved.')) return;
      try { var r = await V.call('syncKey', { token: S.session.token, hash: null }); if (r.error) throw new Error(r.error); syncState(); }
      catch (x) { var err = $('#syncerr'); err.textContent = friendly(x); err.hidden = false; }
    };
  }

  /* ---------- Blackbaud payments sent by the office Mac (betterBB: bbreport booth-sync, every 30 minutes) ---------- */
  // The Mac seals the payments with the festival's public key; they are opened here and added like the CSV import.
  // Checked when the Desk loads and with "Check now". S.bb = what the mailbox has; S.bbResult = what the last check did.
  function ago(iso) {
    var m = Math.round((Date.now() - new Date(iso)) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 60 * 24 ? Math.round(m / 60) + ' h ago' : whenTime(iso);
  }
  function bbRows(data) {     // only well-formed rows, whatever the file says
    return (Array.isArray(data && data.rows) ? data.rows : []).filter(function (r) {
      return r && typeof r.ref === 'string' && r.ref && Number.isInteger(r.amount) && r.amount > 0 && r.amount < 10000000;
    }).map(function (r) {
      var t = function (x, n) { return typeof x === 'string' ? x.slice(0, n) : ''; };
      return { ref: t(r.ref, 60), amount: r.amount, date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '', email: t(r.email, 200), name: t(r.name, 200),
        method: t(r.method, 40), online: r.online !== false };
    });
  }
  function bbPayment(r) {
    return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), amount: r.amount, how: r.online ? 'Online (Blackbaud)' : 'Other',
      date: r.date || today(), note: ((r.online ? '' : 'Entered in Raiser\'s Edge. ') + (r.method ? 'Paid by ' + r.method.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() + '.' : '')).trim().slice(0, 200),
      ref: r.ref, by: myName(), at: new Date().toISOString() };
  }
  async function checkBlackbaud(fresh) {
    if (S.bbBusy) return;
    S.bbBusy = true; drawBbLine();
    var added = 0, err = null;
    try {
      if (fresh) { var r = await V.call('getPayments', { token: S.session.token }); if (r.error) throw new Error(r.error); S.bb = r; }
      if (S.bb && S.bb.sealed) {
        var data = await V.openApplication(S.session, S.bb.sealed), rows = bbRows(data), season = +data.season;
        var apps = S.apps.filter(function (v) { return v.season === season; });
        var have = {}; S.apps.forEach(function (v) { paymentsOf(v).forEach(function (p) { if (p.ref) have[p.ref] = 1; }); });
        var groups = {}, unmatched = [];
        rows.forEach(function (r) {
          if (have[r.ref]) return;
          have[r.ref] = 1;
          var m = matchPayment(r, apps);
          if (m) (groups[m.v.no] = groups[m.v.no] || { v: m.v, rows: [] }).rows.push(r); else unmatched.push(r);
        });
        var keys = Object.keys(groups);
        for (var i = 0; i < keys.length; i++) {
          var g = groups[keys[i]], n = 0;
          await saveRecord(g.v, function (rec) { n = addPayments(g.v, rec, g.rows.map(bbPayment)); });
          added += n;
        }
        S.bbResult = { at: new Date(), added: added, unmatched: unmatched, season: season, event: data.event || '' };
      }
    } catch (x) { err = x; }
    S.bbBusy = false;
    if (err) S.bbResult = Object.assign({}, S.bbResult || {}, { error: friendly(err) });
    if (added && S.tab === 'vendors' && $('#bbline')) vendorsView(); else drawBbLine();
  }
  function bbLineHtml() {
    var b = S.bb, res = S.bbResult;
    if (!b || !b.set) return '';
    var stale = !b.okAt || Date.now() - new Date(b.okAt) > 3 * 3600000, bits = [];
    bits.push(b.okAt ? 'Online payments from Blackbaud: the office Mac last checked <b>' + esc(ago(b.okAt)) + '</b>' : 'Online payments from Blackbaud: the office Mac hasn\'t sent any yet');
    if (b.syncError) bits.push('<span class="tm-err">it couldn\'t read Blackbaud ' + esc(ago(b.triedAt)) + ' (' + esc(b.syncError) + ')</span>');
    else if (stale && b.okAt) bits.push('<span class="tm-err">that\'s a while ago: is the Mac asleep or off?</span>');
    if (S.bbBusy) bits.push('checking…');
    else if (res && res.error) bits.push('<span class="tm-err">' + esc(res.error) + '</span>');
    else if (res) {
      bits.push(res.added ? '<b>' + res.added + ' new payment' + (res.added === 1 ? '' : 's') + ' added</b>' : 'all recorded');
      if (res.unmatched.length) bits.push('<button type="button" class="tm-link" id="bbun" aria-expanded="' + !!S.bbOpen + '">' + res.unmatched.length + ' not matched to a vendor</button>');
    }
    var list = res && res.unmatched && res.unmatched.length && S.bbOpen ? '<div class="tm-bbun"><p class="tm-muted">No ' + res.season + ' application has this email or name. Pick the vendor it belongs to:</p><ul class="tm-log tm-imp">' +
      res.unmatched.map(function (r, i) {
        return '<li><b>' + money(r.amount) + '</b> ' + esc(dayText(r.date)) + ' · ' + esc(r.name || '(no name)') + (r.email ? ' · ' + esc(r.email) : '') + ' <small>Blackbaud gift ' + esc(r.ref) + '</small>' +
          '<div class="tm-row"><label class="tm-sr" for="bba' + i + '">Vendor</label><select id="bba' + i + '"><option value="">Choose a vendor…</option>' +
          S.apps.filter(function (v) { return v.season === res.season; }).sort(function (a, c) { return titleOf(a).localeCompare(titleOf(c)); }).map(function (v) {
            return '<option value="' + esc(v.no) + '">' + esc(titleOf(v)) + ' (' + esc(v.no) + ')</option>'; }).join('') +
          '</select><button type="button" class="bf-btn" data-bba="' + i + '">Add to vendor</button></div></li>';
      }).join('') + '</ul></div>' : '';
    return '<p>' + bits.join(' · ') + ' <button type="button" class="tm-link" id="bbcheck"' + (S.bbBusy ? ' disabled' : '') + '>Check now</button></p>' + list;
  }
  function drawBbLine() { var el = $('#bbline'); if (el) { el.innerHTML = bbLineHtml(); wireBbLine(); } }
  function wireBbLine() {
    var c = $('#bbcheck'); if (c) c.onclick = function () { checkBlackbaud(true); };
    var u = $('#bbun'); if (u) u.onclick = function () { S.bbOpen = !S.bbOpen; drawBbLine(); };
    $all('[data-bba]').forEach(function (b) {
      b.onclick = async function () {
        var i = +b.getAttribute('data-bba'), r = S.bbResult.unmatched[i], v = find($('#bba' + i).value);
        if (!v) return;
        busy(b, 'Adding…');
        try {
          await saveRecord(v, function (rec) { addPayments(v, rec, [bbPayment(r)]); });
          S.bbResult.unmatched.splice(i, 1);
          vendorsView();
        } catch (x) { unbusy(b); S.bbResult.error = friendly(x); drawBbLine(); }
      };
    });
  }

  /* ---------- import Blackbaud payments (CSV from betterBB: bbreport booth-payments) ---------- */
  function rowsToPayments(rows) {
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    function col(re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; }
    var c = { ref: col(/^blackbaud id$|gift id/), amount: col(/^amount/), date: col(/^date/), email: col(/e-?mail/), name: col(/^name$/),
      first: col(/^first/), last: col(/^last/), method: col(/payment method/), source: col(/^source/) };
    if (c.ref < 0 || c.amount < 0 || (c.email < 0 && c.name < 0)) throw new Error("This doesn't look like the payments file from betterBB (no Blackbaud ID, Amount and Email columns).");
    var out = [];
    rows.slice(1).forEach(function (r) {
      var get = function (i) { return i >= 0 && r[i] != null ? String(r[i]).trim() : ''; };
      var amount = cents(get(c.amount)), ref = get(c.ref).slice(0, 60);
      if (!ref || !amount) return;
      var name = get(c.name) || (get(c.first) + ' ' + get(c.last)).trim(), date = get(c.date).slice(0, 10);
      out.push({ ref: ref, amount: amount, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '', email: get(c.email), name: name,
        method: get(c.method), online: !/entered/i.test(get(c.source)) });
    });
    return out;
  }
  function nameKey(s) { return key(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); }
  function matchPayment(row, apps) {
    var live = function (v) { return statusOf(v) !== 'withdrew' && statusOf(v) !== 'rejected'; };
    function pick(list) { var l = list.filter(live); l = l.length ? l : list; return l.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); })[0]; }
    var e = key(row.email), n = nameKey(row.name);
    var byEmail = e ? apps.filter(function (v) { return key(v.d.email) === e; }) : [];
    if (byEmail.length) return { v: pick(byEmail), by: 'email' };
    var byName = n ? apps.filter(function (v) { return nameKey(v.d.name) === n || nameKey(v.d.business) === n; }) : [];
    if (byName.length) return { v: pick(byName), by: 'name' };
    return null;
  }
  async function preparePayments(file) {
    var box = $('#payinfo');
    box.innerHTML = '<p class="tm-wait">Reading the file…</p>';
    var rows;
    try {
      rows = rowsToPayments(parseCsv((await file.text()).replace(/^﻿/, '')));
      await fetchApps();     // the latest records, so payments imported before (from any computer) are skipped
    } catch (x) { box.innerHTML = '<p class="tm-err">' + esc(friendly(x)) + '</p>'; return; }
    if (!rows.length) { box.innerHTML = '<p class="tm-err">No payments in this file.</p>'; return; }
    var seasons = {}; S.apps.forEach(function (v) { seasons[v.season] = 1; });
    var season = seasons[S.season] ? S.season : +Object.keys(seasons).sort().reverse()[0] || S.season;
    function draw() {
      var apps = S.apps.filter(function (v) { return v.season === season; });
      var have = {}; apps.forEach(function (v) { paymentsOf(v).forEach(function (p) { if (p.ref) have[p.ref] = v; }); });
      var already = [], match = [], unmatched = [], seen = {};
      rows.forEach(function (r) {
        if (have[r.ref] || seen[r.ref]) { already.push(r); return; }
        seen[r.ref] = 1;
        var m = matchPayment(r, apps);
        if (m) match.push({ r: r, v: m.v, by: m.by }); else unmatched.push(r);
      });
      var groups = {}; match.forEach(function (m) { (groups[m.v.no] = groups[m.v.no] || { v: m.v, rows: [] }).rows.push(m.r); });
      function line(r) { return '<b>' + money(r.amount) + '</b> ' + esc(dayText(r.date)) + ' · ' + esc(r.name || '(no name)') + (r.email ? ' · ' + esc(r.email) : '') + ' <small>Blackbaud gift ' + esc(r.ref) + '</small>'; }
      box.innerHTML = '<label class="tm-row"><span>Festival year</span><select id="payseason">' + Object.keys(seasons).sort().reverse().map(function (y) {
          return '<option value="' + y + '"' + (+y === season ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select></label>' +
        '<p>' + rows.length + ' payments in this file: <strong>' + match.length + '</strong> to add' +
        (already.length ? ', ' + already.length + ' already recorded' : '') + (unmatched.length ? ', <strong>' + unmatched.length + '</strong> not matched' : '') + '.</p>' +
        (match.length ? '<ul class="tm-log tm-imp">' + match.map(function (m) {
          var typed = handTyped(paymentsOf(m.v), m.r);
          return '<li>' + line(m.r) + '<br>→ ' + esc(m.v.no) + ' ' + esc(titleOf(m.v)) + ' <small>matched by ' + m.by + '</small>' +
            (typed ? '<br><span class="tm-muted">Will be linked to the ' + money(m.r.amount) + ' online payment already typed in by hand (not counted twice).</span>' : '') + '</li>'; }).join('') + '</ul>' +
          '<button class="bf-btn bf-btn-honey" id="dopay">Add ' + match.length + ' payment' + (match.length === 1 ? '' : 's') + '</button>' : '') +
        '<p class="tm-wait" id="payprog" hidden></p>' +
        (unmatched.length ? '<h3>Not matched</h3><p class="tm-muted">No ' + season + ' application with this email or name. Open the vendor in the Vendors tab and record these by hand (How: Online (Blackbaud)).</p>' +
          '<ul class="tm-log tm-imp" id="unmatched">' + unmatched.map(function (r) { return '<li>' + line(r) + '</li>'; }).join('') + '</ul>' : '');
      $('#payseason').onchange = function () { season = +this.value; draw(); };
      var go = $('#dopay'); if (!go) return;
      go.onclick = async function () {
        var btn = this, prog = $('#payprog'), keys = Object.keys(groups), added = 0; busy(btn, 'Adding…'); prog.hidden = false;
        try {
          for (var i = 0; i < keys.length; i++) {
            var g = groups[keys[i]], at = new Date().toISOString();
            var list = g.rows.map(function (r) {
              return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), amount: r.amount, how: r.online ? 'Online (Blackbaud)' : 'Other',
                date: r.date || today(), note: ((r.online ? '' : 'Entered in Raiser\'s Edge. ') + (r.method ? 'Paid by ' + r.method.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() + '.' : '')).trim().slice(0, 200),
                ref: r.ref, by: myName(), at: at };
            });
            var n = 0;
            await saveRecord(g.v, function (rec) { n = addPayments(g.v, rec, list); });
            added += n;
            S.bbResult = null;     // the automatic check's counts are out of date now
            prog.textContent = 'Added payments for ' + (i + 1) + ' of ' + keys.length + ' vendors…';
          }
          prog.textContent = 'Done. ' + added + ' payment' + (added === 1 ? '' : 's') + ' added. Vendors paid in full are now marked Paid; the rest show under "Owes a balance".';
          unbusy(btn); btn.hidden = true;
        } catch (x) { unbusy(btn); prog.textContent = 'Stopped: ' + friendly(x) + '. You can import the file again; payments already added are skipped.'; }
      };
    }
    draw();
  }

  /* ---------- import from the old Google Form sheet ---------- */
  function parseCsv(text) {
    var rows = [], row = [], f = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
  }
  function parseWhen(s) {     // "11/11/2024 17:53:26" from Google Forms (US order)
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s).trim());
    if (!m) return null;
    return new Date(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  function seasonFor(d) { return d.getMonth() >= 4 ? d.getFullYear() + 1 : d.getFullYear(); }   // after April: next spring's festival
  function legacyStatus(texts) {
    var t = texts.join(' ').toLowerCase();
    if (/withdr/.test(t)) return 'withdrew';
    if (/\bpaid\b/.test(t)) return 'paid';
    if (/reject/.test(t)) return 'rejected';
    if (/wait\s*-?\s*list/.test(t)) return 'waitlist';
    if (/accept|waiting/.test(t)) return 'accepted';     // "waiting" in the old sheet meant accepted, waiting on payment
    return null;
  }
  function boothsFrom(s) {     // "1", "One", "2", "Double", also "2-3" or "1 (corner)" (the note is kept too)
    var t = String(s || '').trim().toLowerCase();
    if (/^1\b|^one\b|single/.test(t)) return 1;
    if (/^2\b|^two\b|double/.test(t)) return 2;
    return null;
  }
  function plainBooths(s) { return /^\s*(1|2|one|two)\s*$/i.test(String(s || '')); }
  function rowsToApps(rows) {
    var head = rows[0].map(function (h) { return h.trim(); });
    function col(re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; }
    var c = { at: col(/^timestamp/i), email: col(/email/i), name: col(/name/i), phone: col(/phone/i), web: col(/website/i), genre: col(/genre|category|craft/i),
      address: col(/^(home |mailing |street )?address/i), about: col(/tell us|about your work/i), booths: col(/how many booths/i) };
    var photoCols = [], extraCols = [];
    head.forEach(function (h, i) { if (/photo/i.test(h)) photoCols.push(i); else if (/^column\s*\d+$/i.test(h) || /status|notes?|accepted|paid/i.test(h)) extraCols.push(i); });
    if (c.at < 0 || c.email < 0 || c.name < 0) throw new Error("This doesn't look like the vendor application sheet (no Timestamp, Email or Name column).");
    var out = [];
    rows.slice(1).forEach(function (r) {
      var get = function (i) { return i >= 0 && r[i] != null ? String(r[i]).trim() : ''; };
      var d = parseWhen(get(c.at));
      if (!d || !get(c.email)) return;
      var boothText = get(c.booths), booths = boothsFrom(boothText);
      var notes = extraCols.map(get).filter(Boolean);
      if (booths === null) {     // a status was typed over the booth answer; the count was sometimes moved to a spare column
        var moved = notes.filter(plainBooths)[0];
        if (moved) { booths = boothsFrom(moved); notes.splice(notes.indexOf(moved), 1); }
      }
      if (boothText && !plainBooths(boothText)) notes.unshift(boothText);
      out.push({
        season: seasonFor(d),
        at: d.toISOString(),
        app: {
          name: get(c.name), business: '', email: get(c.email), phone: get(c.phone), address: get(c.address), website: get(c.web),
          category: get(c.genre), about: get(c.about), booths: booths, photoLinks: photoCols.map(get).join(',').split(/[,\s]+/).filter(function (u) { return /^https?:/.test(u); }),
          submittedAt: d.toISOString(), legacyStamp: get(c.at), legacyStatus: legacyStatus(notes), legacyNotes: notes, source: 'Google Form'
        }
      });
    });
    return out;
  }
  async function prepareImport(file) {
    var box = $('#importinfo');
    box.innerHTML = '<p class="tm-wait">Reading the file…</p>';
    var items;
    try {
      items = rowsToApps(parseCsv((await file.text()).replace(/^﻿/, '')));
      await fetchApps();     // the latest list, so rows brought over before (from any computer) are skipped
    } catch (x) { box.innerHTML = '<p class="tm-err">' + esc(friendly(x)) + '</p>'; return; }
    var have = {};
    S.apps.forEach(function (v) { if (v.legacy) have[key(v.d.email) + '|' + (v.d.legacyStamp || v.d.submittedAt)] = 1; });
    var fresh = items.filter(function (it) {
      var k = key(it.app.email) + '|' + it.app.legacyStamp;
      if (have[k]) return false;
      have[k] = 1;     // the same row twice in one file
      return true;
    });
    var bySeason = {}; fresh.forEach(function (it) { bySeason[it.season] = (bySeason[it.season] || 0) + 1; });
    if (!fresh.length) { box.innerHTML = '<p class="tm-ok">All ' + items.length + ' rows in this file are already here. Nothing to import.</p>'; return; }
    box.innerHTML = '<p>Found <strong>' + fresh.length + '</strong> applications to bring over' + (items.length > fresh.length ? ' (' + (items.length - fresh.length) + ' already here)' : '') + ': ' +
      Object.keys(bySeason).sort().map(function (y) { return bySeason[y] + ' for ' + y; }).join(', ') + '. Statuses typed in the sheet ("Accepted", "Paid", "Rejected"…) come over too.</p>' +
      '<button class="bf-btn bf-btn-honey" id="doimport">Import ' + fresh.length + ' applications</button><p class="tm-wait" id="iprog" hidden></p>';
    $('#doimport').onclick = async function () {
      var btn = this, prog = $('#iprog'); busy(btn, 'Importing…'); prog.hidden = false;
      try {
        for (var i = 0; i < fresh.length; i += 50) {
          var batch = [];
          for (var j = i; j < Math.min(i + 50, fresh.length); j++) {
            var sealed = await V.sealApplication(S.session.pub, fresh[j].app, []);
            batch.push({ season: fresh[j].season, at: fresh[j].at, app: sealed.app });
          }
          var r = await V.call('importMany', { token: S.session.token, items: batch });
          if (r.error) throw new Error(r.error);
          prog.textContent = 'Imported ' + Math.min(i + 50, fresh.length) + ' of ' + fresh.length + '…';
        }
        prog.textContent = 'Done. ' + fresh.length + ' applications brought over. They are in the Vendors tab under their festival year.';
        unbusy(btn); btn.hidden = true;
      } catch (x) { unbusy(btn); prog.textContent = 'Stopped: ' + friendly(x) + '. You can run the import again; rows already sent are skipped.'; }
    };
  }

  boot();
})();
