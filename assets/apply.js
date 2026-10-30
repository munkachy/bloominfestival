/* Bloomin' Festival exhibitor application (become-an-exhibitor/apply/).
 * The answers and photos are locked in the vendor's own browser with the festival's public key (vault.js) before
 * they are sent, so only the festival team can read them. What the vendor types (not the photos) is kept on this
 * device until the application is sent, so a closed tab or a dropped connection loses nothing.
 */
(function () {
  'use strict';
  var V = window.BFVault;
  var form = document.getElementById('ap-form');
  if (!form || !V) return;

  var DRAFT = 'bf-apply-draft';
  var TEXT = ['name', 'business', 'email', 'phone', 'website', 'street', 'city', 'state', 'zip', 'categoryOther', 'about', 'notes'];
  var CHOICES = ['category', 'booths', 'electricity', 'returning'];
  var SLOTS = { work: 'Your work', booth: 'Your booth', extra: 'Another photo' };
  var MAX_SIDE = 1600, QUALITY = 0.82;
  var photos = {};          // slot -> Uint8Array (a resized JPEG)
  var sending = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function val(name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }

  /* ---------- the festival's key (fetched early so sending is quick) ---------- */
  var keyPromise = null;
  function festivalKey() {
    if (!keyPromise) {
      keyPromise = V.hello().then(function (h) { if (!h.ready || !h.pub) throw new Error('not-ready'); return h.pub; });
      keyPromise.catch(function () { keyPromise = null; });
    }
    return keyPromise;
  }
  festivalKey().catch(function () {});

  /* ---------- keep what was typed on this device ---------- */
  function store(fn) { try { return fn(window.localStorage); } catch (e) { return null; } }
  var saveTimer = null;
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var v = {}, any = false;
      TEXT.concat(CHOICES).forEach(function (k) { v[k] = val(k); if (v[k]) any = true; });
      store(function (ls) { if (any) ls.setItem(DRAFT, JSON.stringify({ at: Date.now(), v: v })); else ls.removeItem(DRAFT); });
    }, 300);
  }
  function restoreDraft() {
    var d = store(function (ls) { return JSON.parse(ls.getItem(DRAFT) || 'null'); });
    if (!d || !d.v || Date.now() - d.at > 60 * 864e5) return;
    var any = false;
    TEXT.forEach(function (k) { if (d.v[k] && form.elements[k]) { form.elements[k].value = d.v[k]; any = true; } });
    CHOICES.forEach(function (k) {
      if (!d.v[k]) return;
      Array.prototype.forEach.call(form.querySelectorAll('input[name="' + k + '"]'), function (r) { r.checked = r.value === d.v[k]; });
      any = true;
    });
    if (any) $('ap-restored').hidden = false;
    showOther();
  }
  function clearDraft() { store(function (ls) { ls.removeItem(DRAFT); }); }
  $('ap-reset').addEventListener('click', function () {
    clearDraft();
    form.reset();
    Object.keys(SLOTS).forEach(clearPhoto);
    $('ap-restored').hidden = true;
    clearErrors();
    showOther();
    form.elements.name.focus();
  });

  function showOther() {
    var other = val('category') === 'Other';
    $('w-other').hidden = !other;
  }
  form.addEventListener('input', saveDraft);
  form.addEventListener('change', function (e) {
    saveDraft();
    if (e.target.name === 'category') showOther();
    if (e.target.name && fieldErr[e.target.name]) checkOne(e.target.name);
  });

  /* ---------- email typo check ("gmial.com" -> "gmail.com") ---------- */
  var DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'att.net', 'bellsouth.net', 'comcast.net', 'live.com', 'msn.com', 'me.com', 'charter.net', 'ymail.com'];
  function distance(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function suggestEmail() {
    var box = $('ap-suggest'), m = /^([^@\s]+)@([^@\s]+)$/.exec(val('email').toLowerCase());
    box.hidden = true;
    if (!m || DOMAINS.indexOf(m[2]) !== -1) return;
    var best = null, bestD = 3;
    DOMAINS.forEach(function (dm) { var dd = distance(m[2], dm); if (dd < bestD) { bestD = dd; best = dm; } });
    if (!best && /\.(con|cmo|co|om|comm)$/.test(m[2])) best = m[2].replace(/\.(con|cmo|co|om|comm)$/, '.com');
    if (!best) return;
    var fixed = m[1] + '@' + best;
    box.innerHTML = 'Did you mean <b>' + esc(fixed) + '</b>? <button type="button" class="ap-link">Yes, use that</button>';
    box.hidden = false;
    box.querySelector('button').onclick = function () { form.elements.email.value = fixed; box.hidden = true; saveDraft(); checkOne('email'); };
  }
  form.elements.email.addEventListener('blur', suggestEmail);

  /* ---------- photos: shrunk in the browser (smaller, and the phone's location data is left behind) ---------- */
  function decode(file) {
    try {
      if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); });
    } catch (e) {}
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('decode')); };
      img.src = url;
    });
  }
  async function shrink(file) {
    var img = await decode(file);
    var w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    if (!w || !h) throw new Error('decode');
    var s = Math.min(1, MAX_SIDE / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    var x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    if (img.close) img.close();
    if (img.src && img.src.indexOf('blob:') === 0) URL.revokeObjectURL(img.src);
    var blob = await new Promise(function (r) { c.toBlob(r, 'image/jpeg', QUALITY); });
    if (!blob) throw new Error('decode');
    return { blob: blob, bytes: new Uint8Array(await blob.arrayBuffer()) };
  }
  function slotEl(slot) { return form.querySelector('.ap-photo[data-slot="' + slot + '"]'); }
  function photoError(slot, text) {
    var e = $('e-ph-' + slot);
    e.textContent = text || ''; e.hidden = !text;
    slotEl(slot).classList.toggle('ap-bad', !!text);
  }
  async function takePhoto(slot, file) {
    var box = slotEl(slot), drop = box.querySelector('.ap-drop');
    photoError(slot, '');
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|heic|heif|webp|gif)$/i.test(file.name)) { photoError(slot, 'Please choose a photo (a JPG or PNG picture).'); return; }
    if (file.size > 60 * 1024 * 1024) { photoError(slot, 'That file is too large. Please choose a smaller photo.'); return; }
    drop.classList.add('ap-working');
    box.querySelector('.ap-ph-text small').textContent = 'Getting it ready…';
    try {
      var out = await shrink(file);
      photos[slot] = out.bytes;
      var img = box.querySelector('.ap-ph-img');
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      img.dataset.url = URL.createObjectURL(out.blob);
      img.style.backgroundImage = 'url("' + img.dataset.url + '")';
      box.classList.add('ap-has');
      box.querySelector('.ap-ph-text small').textContent = 'Tap to change';
      box.querySelector('.ap-ph-remove').hidden = false;
      if (fieldErr.photos) checkOne('photos');
    } catch (e) {
      clearPhoto(slot);
      photoError(slot, "We couldn't open that photo. Please choose a JPG or PNG picture (on a computer, you may need to save it as a JPG first).");
    } finally {
      drop.classList.remove('ap-working');
    }
  }
  function clearPhoto(slot) {
    var box = slotEl(slot), img = box.querySelector('.ap-ph-img');
    delete photos[slot];
    if (img.dataset.url) { URL.revokeObjectURL(img.dataset.url); delete img.dataset.url; }
    img.style.backgroundImage = '';
    box.classList.remove('ap-has');
    box.querySelector('.ap-ph-text small').textContent = slot === 'extra' ? 'Optional' : 'Tap to add a photo';
    box.querySelector('.ap-ph-remove').hidden = true;
    box.querySelector('.ap-file').value = '';
  }
  Object.keys(SLOTS).forEach(function (slot) {
    var box = slotEl(slot), input = box.querySelector('.ap-file'), drop = box.querySelector('.ap-drop');
    input.addEventListener('change', function () { takePhoto(slot, input.files && input.files[0]); });
    box.querySelector('.ap-ph-remove').addEventListener('click', function () { clearPhoto(slot); input.focus(); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('ap-over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('ap-over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('ap-over');
      if (e.dataTransfer && e.dataTransfer.files[0]) takePhoto(slot, e.dataTransfer.files[0]);
    });
  });

  /* ---------- checking the answers ---------- */
  var RULES = {
    name: function (v) { return v.length >= 2 ? '' : 'Please enter your name.'; },
    email: function (v) { return !v ? 'Please enter your email address.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : "That email address doesn't look complete. Please check it."; },
    phone: function (v) { return (v.replace(/\D/g, '').length >= 10) ? '' : 'Please enter your phone number, with the area code.'; },
    street: function (v) { return v ? '' : 'Please enter your street address.'; },
    city: function (v) { return v ? '' : 'Please enter your city.'; },
    state: function (v) { return v ? '' : 'Please enter your state.'; },
    zip: function (v) { return /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(v) ? '' : 'Please enter your ZIP code.'; },
    category: function (v) { return v ? '' : 'Please choose what you make.'; },
    categoryOther: function (v) { return val('category') !== 'Other' || v ? '' : 'Please tell us what you make.'; },
    about: function (v) { return v.length >= 10 ? '' : 'Please tell us a little about your work.'; },
    photos: function () { return photos.work && photos.booth ? '' : !photos.work && !photos.booth ? 'Please add a photo of your work and a photo of your booth.' : !photos.work ? 'Please add a photo of your work.' : 'Please add a photo of your booth.'; },
    booths: function (v) { return v ? '' : 'Please choose one or two booth spaces.'; },
    electricity: function (v) { return v ? '' : 'Please tell us whether you need electricity.'; },
    returning: function (v) { return v ? '' : "Please tell us whether you've exhibited before."; },
    agree: function () { return form.elements.agree.checked ? '' : 'Please read the festival rules and check the box to agree.'; }
  };
  var fieldErr = {};
  function target(name) {
    if (name === 'photos') return slotEl(photos.work ? 'booth' : 'work').querySelector('.ap-file');
    if (CHOICES.indexOf(name) !== -1) return form.querySelector('input[name="' + name + '"]');
    return form.elements[name];
  }
  function holder(name) {
    if (name === 'photos') return form.querySelector('.ap-photos');
    if (name === 'agree') return form.querySelector('.ap-agree');
    var t = target(name);
    return t.closest('.ap-field');
  }
  function errEl(name) {
    var id = 'err-' + name, el = $(id);
    if (!el) {
      el = document.createElement('p');
      el.className = 'ap-err'; el.id = id; el.hidden = true;
      if (name === 'agree') el = $('e-agree');
      else holder(name).appendChild(el);
    }
    return el;
  }
  function setErr(name, text) {
    var was = fieldErr[name];
    fieldErr[name] = text;
    var el = errEl(name), h = holder(name);
    el.textContent = text; el.hidden = !text;
    h.classList.toggle('ap-invalid', !!text);
    var inputs = name === 'photos' ? [] : CHOICES.indexOf(name) !== -1 ? form.querySelectorAll('input[name="' + name + '"]') : [target(name)];
    Array.prototype.forEach.call(inputs, function (i) {
      if (text) { i.setAttribute('aria-invalid', 'true'); i.setAttribute('aria-describedby', ((i.getAttribute('aria-describedby') || '').replace(el.id, '') + ' ' + el.id).trim()); }
      else i.removeAttribute('aria-invalid');
    });
    if (was && !text && !$('ap-summary').hidden) renderSummary(false);     // fixed: take it off the list
  }
  function checkOne(name) { setErr(name, RULES[name](val(name))); return !fieldErr[name]; }
  function clearErrors() { Object.keys(RULES).forEach(function (n) { if (fieldErr[n]) setErr(n, ''); }); $('ap-summary').hidden = true; }
  ['name', 'email', 'phone', 'street', 'city', 'state', 'zip', 'categoryOther', 'about'].forEach(function (n) {
    form.elements[n].addEventListener('blur', function () { if (val(n) || fieldErr[n]) checkOne(n); });
  });
  form.elements.agree.addEventListener('change', function () { if (fieldErr.agree) checkOne('agree'); });

  function checkAll() {
    Object.keys(RULES).forEach(checkOne);
    return renderSummary(true);
  }
  function renderSummary(focus) {
    var bad = Object.keys(RULES).filter(function (n) { return fieldErr[n]; });
    var box = $('ap-summary');
    if (!bad.length) { box.hidden = true; return true; }
    box.innerHTML = '<p><strong>' + (bad.length === 1 ? 'One thing needs' : bad.length + ' things need') + ' your attention:</strong></p><ul>' +
      bad.map(function (n) { return '<li><a href="#" data-go="' + n + '">' + esc(fieldErr[n]) + '</a></li>'; }).join('') + '</ul>';
    box.hidden = false;
    Array.prototype.forEach.call(box.querySelectorAll('[data-go]'), function (a) {
      a.onclick = function (e) { e.preventDefault(); var t = target(a.getAttribute('data-go')); t.focus(); t.scrollIntoView({ block: 'center' }); };
    });
    if (focus) { box.focus(); box.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    return false;
  }

  /* ---------- sending ---------- */
  function application() {
    var cat = val('category');
    return {
      name: val('name'), business: val('business'), email: val('email'), phone: val('phone'), website: val('website'),
      address: val('street') + ', ' + val('city') + ', ' + val('state') + ' ' + val('zip'),
      category: cat === 'Other' ? val('categoryOther') || 'Other' : cat,
      about: val('about'), booths: Number(val('booths')), electricity: val('electricity'), returning: val('returning'),
      notes: val('notes'), agree: true, submittedAt: new Date().toISOString(), source: 'website'
    };
  }
  function status(text, bad) { var s = $('ap-status'); s.textContent = text; s.classList.toggle('ap-err', !!bad); }
  function reason(err) {
    var m = err && err.message || '';
    if (m === 'busy') return 'A lot of applications are arriving right now. Please wait a minute and press "Send my application" again.';
    if (m === 'not-ready') return 'The online application isn\'t open yet. Please try again later, or call the festival office at 256-739-6682.';
    if (/reach|answer/.test(m)) return m + ' Your answers are still here.';
    return 'Something went wrong while sending (' + (m || 'unknown') + '). Your answers are still here; please press "Send my application" again. If it keeps happening, call the festival office at 256-739-6682.';
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (sending) return;
    if (!checkAll()) return;
    var app = application();
    if (val('company')) { finished(null, app); return; }     // the hidden field only robots fill in
    sending = true;
    var btn = $('ap-submit');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      status('Locking your application so only the festival team can read it…');
      var key = await festivalKey();
      var list = [], labels = [];
      Object.keys(SLOTS).forEach(function (slot) { if (photos[slot]) { list.push(photos[slot]); labels.push(SLOTS[slot]); } });
      app.photoLabels = labels;
      var sealed = await V.sealApplication(key, app, list);
      status('Sending your application and photos. This can take up to a minute…');
      var r = await V.call('submit', { season: V.SEASON, app: sealed.app, photos: sealed.photos });
      if (!r || !r.ok) throw new Error((r && r.error) || 'no answer');
      clearDraft();
      finished(r.no, app);
    } catch (x) {
      status(reason(x), true);
      btn.disabled = false;
      btn.textContent = 'Send my application';
    } finally {
      sending = false;
    }
  });

  function finished(no, app) {
    var first = app.name.split(/\s+/)[0];
    var rows = [['Name', app.name], ['Business', app.business], ['Email', app.email], ['Phone', app.phone], ['Mailing address', app.address],
      ['Website or social', app.website], ['What you make', app.category], ['About your work', app.about],
      ['Booth spaces', app.booths === 2 ? 'Two, side by side' : 'One'], ['Electricity', app.electricity === 'yes' ? 'Yes (+$25)' : 'No'],
      ['Exhibited before', app.returning === 'yes' ? 'Yes' : 'No'], ['Photos', (app.photoLabels || []).join(', ')], ['Anything else', app.notes]];
    var done = $('ap-done');
    done.innerHTML = '<p class="bf-label">Application received</p>' +
      '<h2>Thank you, ' + esc(first) + '!</h2>' +
      (no ? '<p>Your application number is</p><p class="ap-no">' + esc(no) + '</p><p>Please keep it: take a screenshot or print this page.</p>' : '') +
      '<h3>What happens next</h3><ol class="ap-next">' +
      '<li>The festival team reviews every application.</li>' +
      '<li>We\'ll email you at <strong>' + esc(app.email) + '</strong> when yours is approved.</li>' +
      '<li>Then pay your booth fee on the <a href="/become-an-exhibitor/#bf-apply">Exhibit page</a>.</li></ol>' +
      '<p>Questions? Call the festival office at 256-739-6682.</p>' +
      '<div class="bf-cta-row"><button type="button" class="bf-btn" id="ap-print">Print a copy</button><a class="bf-btn" href="/">Back to the festival site</a></div>' +
      '<details class="ap-copy" id="ap-copy"><summary>Your answers</summary><dl>' +
      rows.filter(function (r) { return r[1]; }).map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') +
      '</dl></details>';
    form.hidden = true;
    $('ap-restored').hidden = true;
    done.hidden = false;
    $('ap-print').onclick = function () { $('ap-copy').open = true; window.print(); };
    done.focus();
    done.scrollIntoView({ block: 'start' });
  }

  restoreDraft();
})();
