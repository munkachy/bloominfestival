/* Bloomin' Festival team map: the Map tab on bloominfestival.com/team.
 * map.js draws Br. Nicholas's campus map; this file adds the team's tools: placing vendors in booths, moving and sizing
 * booths and site elements on the 12 ft grid, colour-coded areas, undo, saving (locked with the team key, like the
 * Vendor Desk), publishing the vendor map, the poster and the picture, and demo vendors for trying it out.
 */
(function () {
  'use strict';
  var V = window.BFVault, M = window.BFMap;
  var T = { doc: null, rev: 0, pending: [], undo: [], redo: [], timer: null, saving: false, edit: false, snap: true,
    placing: null, map: null, root: null, ctx: null, q: '' };
  var LIVE = ['accepted', 'paid'];

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function $(s) { return T.root.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(T.root.querySelectorAll(s)); }
  function normalize(d) { d = d || {}; d.booths = d.booths || []; d.items = d.items || []; d.settings = d.settings || {}; return d; }
  function listOf(o) { return T.doc.booths.indexOf(o) !== -1 ? 'booths' : 'items'; }
  // Version 2 (Nov 2026): no booth spots; booths stand square on the 12 ft grid. A map started before then is moved over once:
  // turned booths (the statue ring) go, the rest snap to the grid, and the building names are added. Their vendors go back
  // to "Vendors to place".
  function migrate(d) {
    if (d.settings.v >= 2) return false;
    delete d.spots;
    d.booths = d.booths.filter(function (b) { return M.square(b.r); });
    if (!d.settings.grid) d.settings.grid = M.bestGrid(d.booths);
    M.boothsToGrid(d.booths, d.settings.grid);
    if (!d.items.some(function (it) { return it.kind === 'building'; })) d.items = d.items.concat(M.buildingLabels(function () { return uid('n'); }));
    d.settings.v = 2;
    return true;
  }
  function migrated() { if (T.ctx && T.doc && migrate(T.doc)) { record({ type: 'all', doc: clone(T.doc) }); if (T.map) T.map.setDoc(T.doc); } }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function timeText(iso) { var d = new Date(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

  /* ---------- vendors (from the Vendor Desk) ---------- */
  function apps() { return (T.ctx ? T.ctx.apps() : []).concat(T.doc && T.doc.demo || []); }
  function stat(v) { return v.demo ? v.status : T.ctx.statusOf(v); }
  function title(v) { return v.demo ? v.d.business : T.ctx.titleOf(v); }
  function vendorByNo(no) { return apps().filter(function (v) { return v.no === no; })[0] || null; }
  function vendorOf(b) {
    if (!b.app) return null;
    var v = vendorByNo(b.app);
    if (!v) return { status: '', missing: true, name: b.app };
    return { status: stat(v), power: v.d.electricity === 'yes', name: title(v), v: v, demo: !!v.demo };
  }
  function boothFor(no) { return T.doc ? T.doc.booths.filter(function (b) { return b.app === no; })[0] || null : null; }
  function unplaced() {
    var placed = {};
    T.doc.booths.forEach(function (b) { if (b.app) placed[b.app] = 1; });
    return apps().filter(function (v) { return v.season === V.SEASON && LIVE.indexOf(stat(v)) !== -1 && !placed[v.no]; })
      .sort(function (a, b) { return LIVE.indexOf(stat(b)) - LIVE.indexOf(stat(a)) || title(a).localeCompare(title(b)); });
  }
  function boothName(b) { var v = vendorOf(b); return v && !v.missing ? v.name : ''; }
  function demoBadge(v) { return v && v.demo ? ' <span class="tmap-demo">Demo</span>' : ''; }
  function nextNumber() {
    var m = 0;
    T.doc.booths.forEach(function (b) { [b.n, b.n2].forEach(function (n) { var k = parseInt(n, 10); if (k > m) m = k; }); });
    return String(m + 1);
  }

  /* ---------- loading and saving (locked with the team key) ---------- */
  async function load(sealed, session) {
    if (T.pending.length) return;                      // keep changes not yet saved
    T.session = session;
    if (!sealed) { T.doc = null; T.rev = 0; return; }
    T.doc = normalize(await V.openTeam(session, sealed.ct));
    T.rev = sealed.rev;
    if (T.map) T.map.setDoc(T.doc);
    migrated();
  }
  function apply(d, op) {
    if (op.type === 'all') { var c = clone(op.doc); Object.keys(d).forEach(function (k) { delete d[k]; }); Object.assign(d, c); return; }
    if (op.type === 'settings') { d.settings = Object.assign(d.settings || {}, clone(op.value)); return; }
    var list = d[op.list] || (d[op.list] = []), id = op.obj ? op.obj.id : op.id, i = -1;
    for (var k = 0; k < list.length; k++) if (list[k].id === id) { i = k; break; }
    if (op.type === 'put') { if (i === -1) list.push(clone(op.obj)); else list[i] = clone(op.obj); }
    if (op.type === 'del' && i !== -1) list.splice(i, 1);
  }
  function record(op, keepRedo) { T.pending.push(op); if (!keepRedo) T.redo = []; scheduleSave(); buttons(); }
  function put(o) { record({ type: 'put', list: listOf(o), obj: clone(o) }); }
  function pushUndo() { T.undo.push(JSON.stringify(T.doc)); if (T.undo.length > 80) T.undo.shift(); }
  function scheduleSave() { clearTimeout(T.timer); status('Saving…'); T.timer = setTimeout(save, 700); }
  async function save() {
    if (T.saving) { T.again = true; return; }
    if (!T.pending.length) { status(savedText()); return; }
    T.saving = true;
    try {
      for (var attempt = 0; attempt < 4; attempt++) {
        var n = T.pending.length;
        T.doc.updatedAt = new Date().toISOString(); T.doc.by = T.ctx.myName();
        var r = await V.call('putMap', { token: T.ctx.session.token, rev: T.rev, ct: await V.sealTeam(T.ctx.session, T.doc) });
        if (r.ok) { T.rev = r.map.rev; T.pending.splice(0, n); T.savedAt = new Date(); break; }
        if (r.error === 'conflict' && r.current) {          // someone else saved first: take theirs and put ours on top
          var theirs = normalize(await V.openTeam(T.ctx.session, r.current.ct));
          T.pending.forEach(function (op) { apply(theirs, op); });
          T.rev = r.current.rev; T.doc = theirs;
          if (T.map) { T.map.setDoc(T.doc); side(); }
          continue;
        }
        throw new Error(r.error || 'not saved');
      }
      status(T.pending.length ? 'Saving…' : savedText());
    } catch (x) {
      status('Not saved yet (' + T.ctx.friendly(x) + '). Trying again…', true);
      setTimeout(save, 6000);
    }
    T.saving = false;
    if (T.pending.length && (T.again || !T.timer)) { T.again = false; scheduleSave(); }
    T.again = false;
  }
  function savedText() { return T.savedAt ? 'All changes saved · ' + T.savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Saved'; }
  function status(t, bad) { var s = T.root && $('#mstat'); if (s) { s.textContent = t; s.classList.toggle('tmap-bad', !!bad); } }
  window.addEventListener('beforeunload', function (e) { if (T.pending.length) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- opening the Map tab ---------- */
  function open(root, ctx) {
    T.root = root; T.ctx = ctx;
    if (!T.doc) return startScreen();
    migrated();
    shell();
  }
  function startScreen() {
    T.root.innerHTML = '<div class="bf-wrap"><div class="tm-card tm-narrow"><p class="bf-label">Festival map</p><h1>Set up the map</h1>' +
      '<p>The map is Br. Nicholas\'s drawing of the campus, with its buildings named. Start from last year\'s layout (the booths, stands, tents and stage from the Google Slides map, set square on a 12 ft grid), or start with an empty map.</p>' +
      '<div class="tm-row"><button class="bf-btn bf-btn-honey" id="mstart">Start from last year\'s layout</button><button class="bf-btn" id="mempty">Start empty</button></div>' +
      '<p class="tm-err" id="merr" role="alert" hidden></p></div></div>';
    async function begin(full) {
      try {
        var d = normalize(await (await fetch('/assets/map-start.json', { cache: 'no-cache' })).json());
        if (!full) { d.booths = []; d.items = d.items.filter(function (it) { return it.kind === 'building'; }); }
        d.settings = Object.assign(d.settings, { created: new Date().toISOString(), season: V.SEASON });
        T.doc = d; record({ type: 'all', doc: clone(d) }); shell();
      } catch (x) { var e = $('#merr'); e.textContent = T.ctx.friendly(x); e.hidden = false; }
    }
    $('#mstart').onclick = function () { begin(true); };
    $('#mempty').onclick = function () { begin(false); };
  }
  var ICON = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function bbtn(id, text, extra, pressed, icon) {
    return '<button type="button" class="tmap-btn ' + (extra || '') + '" id="' + id + '"' + (pressed != null ? ' aria-pressed="' + !!pressed + '"' : '') + '>' + (icon || '') + '<span class="tmap-t">' + text + '</span></button>';
  }
  function shell() {
    T.root.innerHTML = '<div class="tmap' + (T.edit ? ' tmap-editing' : '') + '" id="tmap">' +
      '<div class="tmap-bar">' +
      bbtn('medit', 'Edit map', 'tmap-edit', T.edit, ICON.edit) + bbtn('madd', '+ Add', '') +
      bbtn('msnap', 'Snap to grid', '', T.snap) +
      '<span class="tmap-sep"></span>' + bbtn('mundo', 'Undo', '', null, ICON.undo) + bbtn('mredo', 'Redo', '', null, ICON.redo) +
      '<input type="search" class="tmap-search" id="mq" placeholder="Find a vendor, booth or area" aria-label="Find on the map" value="' + esc(T.q) + '">' +
      bbtn('mprint', 'Poster', '') + bbtn('mpng', 'Picture', '') + bbtn('mpub', 'Publish vendor map', '') +
      '<span class="tmap-status" id="mstat" role="status">' + esc(T.pending.length ? 'Saving…' : savedText()) + '</span></div>' +
      '<div class="tmap-main" id="mmain"><div class="bfm-host" id="mhost"></div>' +
      '<div class="bfm-zoom"><button type="button" id="mfull" aria-label="Full screen"></button><button type="button" id="mzin" aria-label="Zoom in">+</button><button type="button" id="mzout" aria-label="Zoom out">−</button><button type="button" class="bfm-zfit" id="mzfit" aria-label="Show the festival grounds">FIT</button></div></div>' +
      '<aside class="tmap-side" id="mside" aria-label="Map details"></aside></div>' + addDialogHtml() + printDialogHtml();
    T.map = M.create($('#mhost'), { doc: T.doc, mode: 'team', title: "Bloomin' Festival map", vendorOf: vendorOf, view: T.view,
      onSelect: onSelect, onBegin: pushUndo, onChange: onChange, onView: function (vb) { T.view = vb; } });
    T.map.setEdit(T.edit); T.map.setSnap(T.snap);
    M.fullscreen($('#tmap'), $('#mfull'));
    $('#medit').onclick = function () { T.edit = !T.edit; this.setAttribute('aria-pressed', T.edit); $('#tmap').classList.toggle('tmap-editing', T.edit); T.map.setEdit(T.edit); buttons(); side(); };
    $('#madd').onclick = openAdd;
    $('#msnap').onclick = function () { T.snap = !T.snap; this.setAttribute('aria-pressed', T.snap); T.map.setSnap(T.snap); };
    $('#mundo').onclick = undo; $('#mredo').onclick = redo;
    $('#mq').oninput = function () { T.q = this.value; search(true); };
    $('#mprint').onclick = function () { $('#mprintd').showModal(); };
    $('#mpng').onclick = picture;
    $('#mpub').onclick = function () { publish(this); };
    $('#mzin').onclick = function () { T.map.zoomBy(1.5); };
    $('#mzout').onclick = function () { T.map.zoomBy(1 / 1.5); };
    $('#mzfit').onclick = function () { T.map.fit('home'); };
    wireAdd(); wirePrint(); wireDrop();
    buttons(); side(); search(false);
  }
  function buttons() {
    if (!T.root || !$('#tmap')) return;
    $('#mundo').disabled = !T.undo.length; $('#mredo').disabled = !T.redo.length;
    $('#madd').disabled = !T.edit;
  }

  /* ---------- map events ---------- */
  function onSelect(sel) {
    if (T.placing && sel.length === 1 && T.map.typeOf(sel[0]) === 'booth') { assign(sel[0], T.placing); stopPlacing(); return; }
    side();
  }
  function onChange(objs) {
    objs.forEach(put);
    side();
  }
  function change(objs, fn) {          // a change made from the panel
    pushUndo(); fn(); objs.forEach(function (o) { put(o); }); T.map.redraw(objs); side();
  }
  function undo() {
    if (!T.undo.length) return;
    T.redo.push(JSON.stringify(T.doc));
    T.doc = normalize(JSON.parse(T.undo.pop())); T.map.setDoc(T.doc);
    record({ type: 'all', doc: clone(T.doc) }, true); side();
  }
  function redo() {
    if (!T.redo.length) return;
    T.undo.push(JSON.stringify(T.doc));
    T.doc = normalize(JSON.parse(T.redo.pop())); T.map.setDoc(T.doc);
    record({ type: 'all', doc: clone(T.doc) }, true); side();
  }

  /* ---------- finding things ---------- */
  function matcher(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return null;
    return function (o) {
      if (T.map.typeOf(o) === 'booth') {
        if (String(o.n).toLowerCase() === q || String(o.n2 || '').toLowerCase() === q) return true;
        if (o.zone && o.zone.toLowerCase().indexOf(q) !== -1) return true;
        var v = vendorOf(o);
        return !!(v && v.v && [v.name, v.v.d.name, v.v.d.category, v.v.no].some(function (t) { return String(t || '').toLowerCase().indexOf(q) !== -1; }));
      }
      return String(o.text || '').toLowerCase().indexOf(q) !== -1 || (M.ICONS[o.icon] && M.ICONS[o.icon].label.toLowerCase().indexOf(q) !== -1);
    };
  }
  function search(zoom) {
    var fn = matcher(T.q);
    T.map.highlight(fn);
    if (fn && zoom) {
      var hits = T.doc.booths.concat(T.doc.items).filter(fn);
      if (hits.length && hits.length <= 12) T.map.fitObjects(hits, hits.length === 1 ? 60 : 30);
    }
  }
  function showBooth(no) {
    var b = boothFor(no); if (!b || !T.map) return;
    T.map.select([b]); T.map.fitObjects([b], 70); side();
  }

  /* ---------- placing vendors ---------- */
  function assign(b, no) {
    var changed = [b];
    pushUndo();
    T.doc.booths.forEach(function (o) { if (o !== b && o.app === no) { delete o.app; changed.push(o); } });     // one booth per vendor
    b.app = no;
    changed.forEach(put); T.map.redraw(changed); T.map.select([b]); side();
  }
  function startPlacing(no) {
    T.placing = no;
    var v = vendorByNo(no);
    $('#tmap').classList.add('tmap-placing');
    $('#mmain').setAttribute('data-placing', 'Click a booth for ' + (v ? title(v) : no) + ' (Esc to cancel)');
    T.map.highlight(function (o) { return T.map.typeOf(o) === 'booth' && !o.app; });
    side();
  }
  function stopPlacing() {
    T.placing = null;
    if ($('#tmap')) $('#tmap').classList.remove('tmap-placing');
    search(false); side();
  }
  function wireDrop() {
    var host = $('#mmain');
    host.addEventListener('dragover', function (e) { if (e.dataTransfer.types.indexOf('text/x-bf-app') !== -1) e.preventDefault(); });
    host.addEventListener('drop', function (e) {
      var no = e.dataTransfer.getData('text/x-bf-app'); if (!no) return;
      e.preventDefault();
      var hit = document.elementFromPoint(e.clientX, e.clientY), g = hit && hit.closest('[data-id]'), b = g && T.map.byId(g.getAttribute('data-id'));
      if (b && T.map.typeOf(b) === 'booth') assign(b, no);
    });
  }

  /* ---------- the side panel ---------- */
  function side() {
    var el = T.root && $('#mside'); if (!el) return;
    var sel = T.map.selection();
    if (!sel.length) el.innerHTML = overviewHtml();
    else if (sel.length > 1) el.innerHTML = multiHtml(sel);
    else if (T.map.typeOf(sel[0]) === 'booth') el.innerHTML = boothHtml(sel[0]);
    else el.innerHTML = itemHtml(sel[0]);
    wireSide(sel);
  }
  function swatches(cur, clear) {
    return '<div class="tmap-swatches" role="group" aria-label="Colour">' + (clear ? '<button type="button" class="tmap-clear" data-sw="" aria-label="No colour" aria-pressed="' + !cur + '"></button>' : '') +
      M.SWATCHES.map(function (c) { return '<button type="button" data-sw="' + c + '" style="background:' + c + '" aria-label="Colour ' + c + '" aria-pressed="' + (cur === c) + '"></button>'; }).join('') + '</div>';
  }
  function sizeHtml(o) {
    if (!T.edit) return '';
    return '<div class="tmap-size"><label class="tmap-field">Width (ft)<input type="number" id="mw" min="1" step="1" value="' + o.w + '"></label><span>×</span><label class="tmap-field">Depth (ft)<input type="number" id="mh" min="1" step="1" value="' + o.h + '"></label></div>' +
      '<div class="tmap-row"><button type="button" class="tmap-btn" id="mrl">↺ 15°</button><button type="button" class="tmap-btn" id="mrr">↻ 15°</button><button type="button" class="tmap-btn" id="mr0">Square up</button></div>';
  }
  function zonesList() { var z = {}; T.doc.booths.forEach(function (b) { if (b.zone) z[b.zone] = (z[b.zone] || 0) + 1; }); return z; }
  function zoneField(cur) {
    var z = zonesList();
    return '<label class="tmap-field">Area name <input type="text" id="mzone" list="mzones" placeholder="e.g. Garden row" value="' + esc(cur || '') + '"></label><datalist id="mzones">' +
      Object.keys(z).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
  }
  function overviewHtml() {
    var b = T.doc.booths, used = b.filter(function (x) { return x.app; }).length, todo = unplaced(), s = T.doc.settings, z = zonesList();
    return '<div><p class="bf-label">Festival map ' + V.SEASON + '</p><h2>' + b.length + ' booths</h2><p class="tmap-muted">' + used + ' with a vendor · ' + (b.length - used) + ' open</p></div>' +
      '<div class="tmap-card"><h3>Vendors to place (' + todo.length + ')</h3>' +
      (todo.length ? '<p class="tmap-help">Accepted and paid vendors without a booth. Drag one onto a booth, or click one and then click a booth.</p><ul class="tmap-vlist">' + todo.map(function (v) {
        var st = stat(v);
        return '<li><button type="button" draggable="true" data-place="' + esc(v.no) + '" aria-pressed="' + (T.placing === v.no) + '" style="--st:' + M.STATUS_DOT[st] + '"><b>' + esc(title(v)) + demoBadge(v) + '</b><small>' + esc([st === 'paid' ? 'Paid' : 'Awaiting payment', v.d.category, v.d.booths === 2 ? '2 spaces' : '', v.d.electricity === 'yes' ? '⚡ needs power' : ''].filter(Boolean).join(' · ')) + '</small></button></li>';
      }).join('') + '</ul>' : '<p class="tmap-muted">Everyone accepted has a booth.</p>') + '</div>' +
      '<div class="tmap-card"><h3>Vendor map</h3><p class="tmap-muted">' + (s.publishedAt ? 'Published ' + esc(timeText(s.publishedAt)) + (s.publishedBy ? ' by ' + esc(s.publishedBy) : '') + '. Publish again after changes.' : 'Not published yet. Vendors and visitors see it at bloominfestival.com/map once you publish.') + '</p>' +
      '<label class="tmap-switch">Show vendors\' names on the vendor map <input type="checkbox" id="mnames"' + (s.showNames ? ' checked' : '') + '></label>' +
      '<p class="tmap-help">When this is off, only booth numbers are published; each vendor finds theirs with their own link. Contact details are never published.</p>' +
      '<div class="tmap-row"><button type="button" class="tmap-btn" id="mpub2">Publish now</button><a class="tmap-btn" href="/map/" target="_blank" rel="noopener">Open it</a></div></div>' +
      (Object.keys(z).length ? '<div class="tmap-card"><h3>Areas</h3><ul class="tmap-vlist">' + Object.keys(z).map(function (n) {
        var c = (T.doc.booths.filter(function (b) { return b.zone === n; })[0] || {}).color || M.PAL.orange;
        return '<li><button type="button" data-zone="' + esc(n) + '" style="--st:' + c + '"><b>' + esc(n) + '</b><small>' + z[n] + ' booths</small></button></li>';
      }).join('') + '</ul></div>' : '') +
      '<div class="tmap-card"><h3>More</h3><div class="tmap-row"><button type="button" class="tmap-btn" id="mbak">Download a backup</button><button type="button" class="tmap-btn" id="mrest">Restore a backup</button></div>' +
      '<button type="button" class="tmap-btn" id="mnew">New festival year: clear vendors, keep the layout</button><input type="file" id="mrestf" accept=".json,application/json" hidden>' +
      ((T.doc.demo || []).length ? '<button type="button" class="tmap-btn" id="mdemox">Remove demo vendors (' + T.doc.demo.length + ')</button><p class="tmap-help">Demo vendors are only on this map, to try it out. They never reach the Vendor Desk or the published vendor map.</p>' :
        '<button type="button" class="tmap-btn" id="mdemo">Add demo vendors</button>') + '</div>' +
      '<p class="tmap-help">Tips: click a booth to see who is in it. Shift-click or Shift-drag selects several. Arrow keys move a booth one grid square (with "Snap to grid" off: 1 ft, Shift 12 ft). Ctrl+Z undoes. Turn on <b>Edit map</b> to add or change tents, stands, icons, areas and names, or to change a booth\'s size.</p>';
  }
  function boothHtml(b) {
    var v = vendorOf(b), vv = v && v.v, st = v && v.status;
    var vendor = !b.app ? '<p class="tmap-muted">No vendor yet.</p>' + assignHtml() :
      v.missing ? '<p class="tmap-warn">Application ' + esc(b.app) + ' was removed.</p><button type="button" class="tmap-x" id="munassign">Clear this booth</button>' :
      '<div><b>' + esc(v.name) + '</b>' + demoBadge(v) + (vv.d.business && vv.d.name ? '<br><span class="tmap-muted">' + esc(vv.d.name) + '</span>' : '') + '</div>' +
      '<p class="tmap-muted">' + esc([vv.d.category, vv.no].filter(Boolean).join(' · ')) + '</p>' +
      '<div class="tmap-row"><span class="tm-pill st-' + esc(st) + '">' + esc(st === 'accepted' ? 'Awaiting payment' : st) + '</span>' + (vv.d.booths === 2 ? '<span class="tmap-muted">asked for 2 spaces</span>' : '') + '</div>' +
      (vv.d.booths === 2 && !b.double ? '<p class="tmap-warn">This vendor asked for two spaces. ' + (T.edit ? 'Turn on "Two spaces side by side".' : 'Turn on <b>Edit map</b>, then "Two spaces side by side".') + '</p>' : '') +
      (v.power && !b.power ? '<p class="tmap-warn">⚡ This vendor needs electricity, and this booth isn\'t marked as having power.</p>' : v.power ? '<p class="tmap-muted">⚡ Needs electricity (this booth has power).</p>' : '') +
      '<div class="tmap-row">' + (vv.d.phone ? '<a class="tmap-btn" href="tel:' + esc(String(vv.d.phone).replace(/[^0-9+]/g, '')) + '">Call</a>' : '') + (vv.d.email ? '<a class="tmap-btn" href="mailto:' + esc(vv.d.email) + '">Email</a>' : '') +
      (v.demo ? '' : '<button type="button" class="tmap-btn" id="mdesk">Open in Vendor Desk</button>') + '</div><button type="button" class="tmap-x" id="munassign">Take them off this booth</button>';
    return '<div><p class="bf-label">Booth</p><h2>' + esc(b.n) + (b.double && b.n2 && !b.one ? ' &amp; ' + esc(b.n2) : '') + '</h2></div>' +
      '<div class="tmap-card"><h3>Vendor</h3>' + vendor + '</div>' +
      '<div class="tmap-card"><h3>Booth</h3><div class="tmap-row"><label class="tmap-field" style="flex:1">Number<input type="text" id="mn" value="' + esc(b.n) + '"></label>' +
      (b.double && !b.one ? '<label class="tmap-field" style="flex:1">Second number<input type="text" id="mn2" value="' + esc(b.n2 || '') + '"></label>' : '') + '</div>' +
      (T.edit ? '<label class="tmap-switch">Two spaces side by side <input type="checkbox" id="mdbl"' + (b.double ? ' checked' : '') + '></label>' : '') +
      (b.double && T.edit ? '<label class="tmap-switch">One number for both spaces <input type="checkbox" id="mone"' + (b.one ? ' checked' : '') + '></label>' : '') +
      '<label class="tmap-switch">Power outlet at this booth <input type="checkbox" id="mpow"' + (b.power ? ' checked' : '') + '></label>' +
      sizeHtml(b) + '<p class="tmap-help">' + (T.edit ? 'Drag the booth to move it. Drag its handles to change its size, or the yellow dot to turn it.' : 'Drag the booth to move it. Turn on <b>Edit map</b> to change its size or turn it.') + '</p></div>' +
      '<div class="tmap-card"><h3>Colour and area</h3>' + swatches(b.color, true) + zoneField(b.zone) + '</div>' +
      (T.edit ? '<div class="tmap-row"><button type="button" class="tmap-btn" id="mdup">Duplicate</button><button type="button" class="tmap-btn tmap-danger" id="mdel">Delete booth</button></div>' : '');
  }
  function assignHtml() {
    var todo = unplaced();
    if (!todo.length) return '<p class="tmap-help">No accepted vendors are waiting for a booth.</p>';
    return '<label class="tmap-field">Put a vendor here<select id="massign"><option value="">Choose a vendor…</option>' + todo.map(function (v) {
      return '<option value="' + esc(v.no) + '">' + esc(title(v) + (v.demo ? ' [demo]' : '') + (stat(v) === 'paid' ? ' (paid)' : ' (awaiting payment)') + (v.d.booths === 2 ? ' · 2 spaces' : '') + (v.d.electricity === 'yes' ? ' · ⚡' : '')) + '</option>';
    }).join('') + '</select></label>';
  }
  function itemHtml(it) {
    var k = M.KINDS[it.kind] || M.KINDS.shape;
    if (!T.edit) return '<div><p class="bf-label">' + esc(k.label) + '</p><h2>' + esc(it.text || (M.ICONS[it.icon] || {}).label || k.label) + '</h2></div><p class="tmap-help">Turn on <b>Edit map</b> to move or change it.</p>';
    return '<div><p class="bf-label">' + esc(k.label) + '</p><h2>' + esc(it.text || k.label) + '</h2></div>' +
      '<div class="tmap-card"><label class="tmap-field">Name on the map<input type="text" id="mtext" value="' + esc(it.text || '') + '"></label>' +
      (it.kind === 'label' || it.kind === 'building' ? '' : '<div class="tmap-field">Icon' + iconPicker(it.icon, it.kind !== 'marker') + '</div>') + '</div>' +
      '<div class="tmap-card"><h3>Colour</h3>' + swatches(it.color, true) + '</div>' +
      (it.kind === 'marker' ? '<div class="tmap-card"><label class="tmap-field">Size (ft across)<input type="number" id="mw" min="3" step="1" value="' + it.w + '"></label></div>' : '<div class="tmap-card"><h3>Size</h3>' + sizeHtml(it) + '</div>') +
      '<div class="tmap-row"><button type="button" class="tmap-btn" id="mdup">Duplicate</button><button type="button" class="tmap-btn tmap-danger" id="mdel">Delete</button></div>';
  }
  function iconPicker(cur, none) {
    return '<div class="tmap-icons" role="group" aria-label="Icon">' + (none ? '<button type="button" data-icon="" aria-pressed="' + !cur + '" aria-label="No icon">–</button>' : '') +
      Object.keys(M.ICONS).map(function (k) { return '<button type="button" data-icon="' + k + '" aria-pressed="' + (cur === k) + '" title="' + esc(M.ICONS[k].label) + '" aria-label="' + esc(M.ICONS[k].label) + '">' + M.iconSvg(k, null, 22) + '</button>'; }).join('') + '</div>';
  }
  function multiHtml(sel) {
    var bs = sel.filter(function (o) { return T.map.typeOf(o) === 'booth'; });
    return '<div><p class="bf-label">Selected</p><h2>' + sel.length + ' things</h2><p class="tmap-muted">' + bs.length + ' booths</p></div>' +
      '<div class="tmap-card"><h3>Line them up</h3><div class="tmap-row"><button type="button" class="tmap-btn" id="mrow">In a row</button><button type="button" class="tmap-btn" id="mcol">In a column</button><button type="button" class="tmap-btn" id="mspace">Space evenly</button></div>' +
      '<p class="tmap-help">"In a row" sets them side by side, touching, square to the campus.</p></div>' +
      (bs.length ? '<div class="tmap-card"><h3>Numbers</h3><div class="tmap-row"><label class="tmap-field" style="flex:1">Renumber from<input type="text" id="mrenum" value="' + esc(bs[0].n) + '"></label><button type="button" class="tmap-btn" id="mrenumgo">Renumber</button></div></div>' : '') +
      '<div class="tmap-card"><h3>Colour and area</h3>' + swatches(null, true) + (bs.length ? zoneField('') + '<button type="button" class="tmap-btn" id="mzoneall">Name this area</button>' : '') + '</div>' +
      (T.edit ? '<div class="tmap-row"><button type="button" class="tmap-btn" id="mrl">↺ 15°</button><button type="button" class="tmap-btn" id="mrr">↻ 15°</button>' +
        '<button type="button" class="tmap-btn" id="mdup">Duplicate</button><button type="button" class="tmap-btn tmap-danger" id="mdel">Delete</button></div>' : '');
  }
  function wireSide(sel) {
    var one = sel.length === 1 ? sel[0] : null;
    function on(id, ev, fn) { var e = $('#' + id); if (e) e[ev] = fn; }
    $all('[data-place]').forEach(function (b) {
      b.onclick = function () { if (T.placing === b.getAttribute('data-place')) stopPlacing(); else startPlacing(b.getAttribute('data-place')); };
      b.ondragstart = function (e) { e.dataTransfer.setData('text/x-bf-app', b.getAttribute('data-place')); e.dataTransfer.effectAllowed = 'move'; };
    });
    $all('[data-zone]').forEach(function (b) { b.onclick = function () { var z = b.getAttribute('data-zone'); T.q = z; $('#mq').value = z; search(true); }; });
    on('mnames', 'onchange', function () { var v = this.checked; pushUndo(); T.doc.settings.showNames = v; record({ type: 'settings', value: { showNames: v } }); });
    on('mpub2', 'onclick', function () { publish(this); });
    on('mbak', 'onclick', backup);
    on('mrest', 'onclick', function () { $('#mrestf').click(); });
    on('mrestf', 'onchange', function () { if (this.files[0]) restore(this.files[0]); });
    on('mnew', 'onclick', newYear);
    on('mdemo', 'onclick', addDemo);
    on('mdemox', 'onclick', removeDemo);
    if (!sel.length) return;
    var objs = sel;
    // booth
    on('massign', 'onchange', function () { if (this.value) assign(one, this.value); });
    on('munassign', 'onclick', function () { change([one], function () { delete one.app; }); });
    on('mdesk', 'onclick', function () { T.ctx.openVendor(one.app); });
    on('mn', 'onchange', function () { var v = this.value.trim(); change([one], function () { one.n = v; }); });
    on('mn2', 'onchange', function () { var v = this.value.trim(); change([one], function () { one.n2 = v; }); });
    on('mdbl', 'onchange', function () {
      var dbl = this.checked;
      change([one], function () {
        one.double = dbl; one.w = dbl ? 24 : 12; one.h = 12;
        if (dbl) { one.n2 = one.n2 || nextNumber(); one.one = false; } else { delete one.n2; delete one.one; }
        var s = T.map.snapTo(one, one.x, one.y); one.x = s.x; one.y = s.y; one.r = s.r;
      });
    });
    on('mone', 'onchange', function () { var v = this.checked; change([one], function () { one.one = v; }); });
    on('mpow', 'onchange', function () { var v = this.checked; change([one], function () { one.power = v; }); });
    on('mw', 'onchange', function () { var v = Math.max(1, num(this.value, one.w)); change([one], function () { one.w = v; if (one.kind === 'marker') one.h = v; if (one.double && v < 18) one.double = false; }); });
    on('mh', 'onchange', function () { var v = Math.max(1, num(this.value, one.h)); change([one], function () { one.h = v; }); });
    function turn(by) { change(objs, function () { objs.forEach(function (o) { o.r = M.normRot((o.r || 0) + (T.map.typeOf(o) === 'booth' && T.snap ? by * 6 : by)); if (T.map.typeOf(o) === 'booth') snap(o); }); }); }
    on('mrl', 'onclick', function () { turn(-15); });
    on('mrr', 'onclick', function () { turn(15); });
    on('mr0', 'onclick', function () { change(objs, function () { objs.forEach(function (o) { o.r = 0; }); }); });
    $all('[data-sw]').forEach(function (b) {
      b.onclick = function () { var c = b.getAttribute('data-sw'); change(objs, function () { objs.forEach(function (o) { if (c) o.color = c; else delete o.color; }); }); };
    });
    on('mzone', 'onchange', function () { if (one) { var z = this.value.trim(); change([one], function () { if (z) one.zone = z; else delete one.zone; }); } });
    on('mzoneall', 'onclick', function () {
      var z = $('#mzone').value.trim(), bs = objs.filter(function (o) { return T.map.typeOf(o) === 'booth'; });
      change(bs, function () { bs.forEach(function (o) { if (z) o.zone = z; else delete o.zone; }); });
    });
    // element
    on('mtext', 'onchange', function () { var v = this.value; change([one], function () { one.text = v; }); });
    $all('[data-icon]').forEach(function (b) { b.onclick = function () { var v = b.getAttribute('data-icon'); change([one], function () { one.icon = v; }); }; });
    // several
    on('mrow', 'onclick', function () { lineUp(objs, 'row'); });
    on('mcol', 'onclick', function () { lineUp(objs, 'col'); });
    on('mspace', 'onclick', function () { spaceEvenly(objs); });
    on('mrenumgo', 'onclick', function () { renumber(objs.filter(function (o) { return T.map.typeOf(o) === 'booth'; }), $('#mrenum').value.trim()); });
    on('mdup', 'onclick', function () { duplicate(objs); });
    on('mdel', 'onclick', function () { remove(objs); });
  }

  /* ---------- tools for several at once ---------- */
  function snap(o) { if (!T.snap) return; var s = T.map.snapTo(o, o.x, o.y); o.x = s.x; o.y = s.y; o.r = s.r; }
  function lineUp(objs, how) {
    var row = how === 'row';
    var sorted = objs.slice().sort(function (a, b) { return row ? a.x - b.x : a.y - b.y; });
    var mid = sorted.reduce(function (s, o) { return s + (row ? o.y : o.x); }, 0) / sorted.length;
    change(sorted, function () {
      var pos = row ? sorted[0].x - sorted[0].w / 2 : sorted[0].y - sorted[0].h / 2;
      sorted.forEach(function (o) {
        o.r = 0;
        var size = row ? o.w : o.h;
        if (row) { o.x = pos + size / 2; o.y = mid; } else { o.y = pos + size / 2; o.x = mid; }
        pos += size;
      });
      if (T.snap) {          // the row stays together; the first one sets it on the grid
        var f = sorted[0], s = T.map.snapTo(f, f.x, f.y), dx = s.x - f.x, dy = s.y - f.y;
        sorted.forEach(function (o) { o.x += dx; o.y += dy; });
      }
    });
  }
  function spaceEvenly(objs) {
    if (objs.length < 3) return;
    var xs = objs.map(function (o) { return o.x; }), ys = objs.map(function (o) { return o.y; });
    var row = Math.max.apply(null, xs) - Math.min.apply(null, xs) >= Math.max.apply(null, ys) - Math.min.apply(null, ys);
    var sorted = objs.slice().sort(function (a, b) { return row ? a.x - b.x : a.y - b.y; });
    var f = sorted[0], l = sorted[sorted.length - 1];
    change(sorted, function () {
      sorted.forEach(function (o, i) { var t = i / (sorted.length - 1); o.x = f.x + (l.x - f.x) * t; o.y = f.y + (l.y - f.y) * t; snap(o); });
    });
  }
  function renumber(bs, start) {
    if (!bs.length) return;
    var xs = bs.map(function (o) { return o.x; }), ys = bs.map(function (o) { return o.y; });
    var wide = Math.max.apply(null, xs) - Math.min.apply(null, xs) >= Math.max.apply(null, ys) - Math.min.apply(null, ys);
    var sorted = bs.slice().sort(function (a, b) { return wide ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x; });
    var n = parseInt(start, 10); if (!isFinite(n)) n = 1;
    change(sorted, function () {
      sorted.forEach(function (o) { o.n = String(n++); if (o.double && !o.one) o.n2 = String(n++); });
    });
  }
  function duplicate(objs) {
    pushUndo();
    var made = objs.map(function (o) {
      var c = clone(o), list = listOf(o), step = T.snap ? M.CELL : 14;
      c.id = uid(list === 'booths' ? 'b' : 'i'); c.x += step; c.y += step;
      if (list === 'booths') { delete c.app; c.n = nextNumber(); if (c.double) c.n2 = String(parseInt(c.n, 10) + 1); }
      T.doc[list].push(c); return c;
    });
    made.forEach(put); T.map.setDoc(T.doc); T.map.select(made); side();
  }
  function remove(objs) {
    var bs = objs.filter(function (o) { return T.map.typeOf(o) === 'booth' && o.app; });
    if (bs.length && !confirm('Delete ' + objs.length + (objs.length === 1 ? ' thing' : ' things') + '? ' + bs.length + ' of them ' + (bs.length === 1 ? 'has a vendor' : 'have vendors') + ', who will go back to "Vendors to place".')) return;
    pushUndo();
    objs.forEach(function (o) {
      var list = listOf(o); T.doc[list].splice(T.doc[list].indexOf(o), 1);
      record({ type: 'del', list: list, id: o.id });
    });
    T.map.select([]); T.map.setDoc(T.doc); side();
  }

  /* ---------- adding new things ---------- */
  var ADD = [
    { k: 'booth', label: 'Vendor booth', w: 12, h: 12, swatch: M.PAL.orange },
    { k: 'row', label: 'Row of booths', w: 12, h: 12, n: 5, swatch: M.PAL.orange },
    { k: 'stage', label: 'Stage' }, { k: 'tent', label: 'Tent' }, { k: 'stand', label: 'Stand or table' },
    { k: 'area', label: 'Area or section' }, { k: 'marker', label: 'Icon (restrooms, first aid…)' }, { k: 'label', label: 'Text label' }, { k: 'building', label: 'Building name' }, { k: 'shape', label: 'Other shape' }
  ];
  function addDialogHtml() {
    return '<dialog class="tmap-dialog" id="maddd" aria-labelledby="maddt"><form method="dialog" id="maddf">' +
      '<h2 id="maddt">Add to the map</h2><div class="tmap-kinds" role="group" aria-label="What to add">' + ADD.map(function (a) {
        var c = a.swatch || (M.KINDS[a.k] || {}).color || M.PAL.dark;
        return '<button type="button" data-kind="' + a.k + '" aria-pressed="false"><i style="background:' + (a.k === 'marker' ? M.ICONS.restroom.color : c) + '"></i>' + esc(a.label) + '</button>';
      }).join('') + '</div>' +
      '<label class="tmap-field" id="maf-text">Name on the map<input type="text" id="matext" placeholder="e.g. Kettle corn, Porta-potties"></label>' +
      '<div class="tmap-field" id="maf-icon">Icon<div id="maicons"></div></div>' +
      '<div class="tmap-size" id="maf-size"><label class="tmap-field">Width (ft)<input type="number" id="maw" min="1" step="1"></label><span>×</span><label class="tmap-field">Depth (ft)<input type="number" id="mah" min="1" step="1"></label></div>' +
      '<label class="tmap-field" id="maf-n">How many<input type="number" id="man" min="1" max="40" step="1" value="5"></label>' +
      '<p class="tmap-help">A rough guess at the size is fine. After it\'s placed, click it and drag its handles to make it bigger or smaller.</p>' +
      '<div class="tm-row"><button type="submit" value="ok" class="bf-btn bf-btn-honey" id="maok" disabled>Place it on the map</button><button type="submit" value="cancel" class="bf-btn" formnovalidate>Cancel</button></div></form></dialog>';
  }
  function openAdd() { if (!T.edit) return; var d = $('#maddd'); pickKind(null); d.showModal(); }
  function pickKind(k) {
    T.addKind = k;
    var a = ADD.filter(function (x) { return x.k === k; })[0], kind = M.KINDS[k];
    $all('[data-kind]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-kind') === k)); });
    var booths = k === 'booth' || k === 'row';
    $('#maf-text').hidden = !k || booths; $('#maf-icon').hidden = !k || booths || k === 'label' || k === 'building'; $('#maf-size').hidden = !k || k === 'marker' || booths;
    $('#maf-n').hidden = k !== 'row';
    $('#maok').disabled = !k;
    if (!k) return;
    $('#matext').value = kind ? kind.text : '';
    $('#maw').value = (a && a.w) || (kind && kind.w) || 12; $('#mah').value = (a && a.h) || (kind && kind.h) || 12;
    T.addIcon = kind ? kind.icon : '';
    $('#maicons').innerHTML = iconPicker(T.addIcon, k !== 'marker');
    $all('#maicons [data-icon]').forEach(function (b) {
      b.onclick = function () { T.addIcon = b.getAttribute('data-icon'); $all('#maicons [data-icon]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); if (k === 'marker' && !$('#matext').dataset.typed) $('#matext').value = M.ICONS[T.addIcon].label; };
    });
  }
  function wireAdd() {
    $all('[data-kind]').forEach(function (b) { b.onclick = function () { pickKind(b.getAttribute('data-kind')); }; });
    $('#matext').oninput = function () { this.dataset.typed = '1'; };
    $('#maddd').addEventListener('close', function () {
      if (this.returnValue !== 'ok' || !T.addKind) return;
      var c = T.map.center(), k = T.addKind;
      if (k === 'booth') return addBooths(1, c.x, c.y, 0);
      if (k === 'row') return addBooths(Math.max(1, Math.min(40, parseInt($('#man').value, 10) || 5)), c.x, c.y, 0, true);
      var w = Math.max(1, num($('#maw').value, 12)), h = Math.max(1, num($('#mah').value, 12));
      var it = { id: uid('i'), kind: k, icon: T.addIcon || '', text: $('#matext').value.trim(), x: Math.round(c.x), y: Math.round(c.y), w: k === 'marker' ? 8 : w, h: k === 'marker' ? 8 : h, r: 0 };
      if (T.snap) { var s = T.map.snapTo(it, it.x, it.y); it.x = s.x; it.y = s.y; }
      pushUndo(); T.doc.items.push(it); put(it); T.map.setDoc(T.doc); T.map.select([it]); side();
    });
  }
  function addBooths(n, x, y, r, row) {
    pushUndo();
    var made = [];
    for (var i = 0; i < n; i++) {
      var b = { id: uid('b'), n: nextNumber(), x: x + (i - (n - 1) / 2) * 12, y: y, w: 12, h: 12, r: r || 0 };
      if (!row || i === 0) { var s = T.map.snapTo(b, b.x, b.y); b.x = s.x; b.y = s.y; b.r = s.r; }
      else { var p = made[i - 1], d = { x: Math.cos((p.r || 0) * Math.PI / 180) * 12, y: Math.sin((p.r || 0) * Math.PI / 180) * 12 }; b.x = p.x + d.x; b.y = p.y + d.y; b.r = p.r; }
      T.doc.booths.push(b); made.push(b);
    }
    made.forEach(put); T.map.setDoc(T.doc); T.map.select(made); side();
  }

  /* ---------- demo vendors (only on this map, to try it out) ---------- */
  var DEMO = [
    ['Gnome Depot', 'Garden gnomes', 'paid', 1, false], ['Kiln Me Softly Pottery', 'Pottery', 'paid', 1, true],
    ['Wick-ed Good Candles', 'Candles', 'accepted', 1, false], ['Purl Jam Knitting', 'Knitwear', 'paid', 1, false],
    ['Thyme Travelers Herb Farm', 'Herbs and plants', 'accepted', 2, false], ['Saw-ry Not Sorry Woodworks', 'Woodworking', 'paid', 2, true],
    ['Pane in the Glass', 'Stained glass', 'accepted', 1, true], ['Brie-lliant Cheese Co.', 'Cheese', 'paid', 1, true],
    ['Just Bead It', 'Beaded jewelry', 'accepted', 1, false], ['Quilty Pleasures', 'Quilts', 'paid', 2, false],
    ['Honey, I\'m Home Apiary', 'Honey and beeswax', 'accepted', 1, true], ['Soap Opera Suds', 'Handmade soap', 'paid', 1, false]
  ];
  function addDemo() {
    pushUndo();
    T.doc.demo = DEMO.map(function (x, i) {
      var no = 'DEMO-' + (i < 9 ? '0' : '') + (i + 1);
      return { id: no, no: no, demo: true, season: V.SEASON, status: x[2], d: { business: x[0], category: x[1], booths: x[3], electricity: x[4] ? 'yes' : 'no' } };
    });
    T.doc.demo.forEach(function (v) { record({ type: 'put', list: 'demo', obj: clone(v) }); });
    side();
  }
  function removeDemo() {
    var nos = {}, freed = [];
    (T.doc.demo || []).forEach(function (v) { nos[v.no] = 1; });
    if (T.placing && nos[T.placing]) stopPlacing();
    pushUndo();
    T.doc.booths.forEach(function (b) { if (b.app && nos[b.app]) { delete b.app; freed.push(b); } });
    freed.forEach(put);
    (T.doc.demo || []).forEach(function (v) { record({ type: 'del', list: 'demo', id: v.id }); });
    delete T.doc.demo;
    T.map.redraw(freed); side();
  }

  /* ---------- publishing, printing, picture, backups ---------- */
  function website(u) {
    u = String(u || '').trim(); if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^@/, 'instagram.com/');
    return /^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(u) ? u : '';
  }
  function publicDoc() {
    var names = !!T.doc.settings.showNames;
    function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] != null && o[k] !== '' && o[k] !== false) r[k] = o[k]; }); return r; }
    return {
      v: 1, title: "Bloomin' Festival " + V.SEASON, season: V.SEASON, updatedAt: new Date().toISOString(), showNames: names,
      booths: T.doc.booths.map(function (b) {
        var o = pick(b, ['n', 'n2', 'one', 'double', 'x', 'y', 'w', 'h', 'r', 'color', 'zone']);
        var v = names && b.app && vendorByNo(b.app);
        if (v && !v.demo && LIVE.indexOf(stat(v)) !== -1) { o.name = title(v); if (v.d.category) o.cat = v.d.category; var w = website(v.d.website); if (w) o.web = w; }
        return o;
      }),
      items: T.doc.items.map(function (it) { return pick(it, ['kind', 'icon', 'text', 'x', 'y', 'w', 'h', 'r', 'color']); })
    };
  }
  async function publish(btn) {
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Publishing…';
    try {
      var r = await V.call('publish', { token: T.ctx.session.token, map: publicDoc() });
      if (r.error) throw new Error(r.error);
      var now = new Date().toISOString(), by = T.ctx.myName();
      pushUndo(); Object.assign(T.doc.settings, { publishedAt: now, publishedBy: by });
      record({ type: 'settings', value: { publishedAt: now, publishedBy: by } });
      btn.textContent = 'Published ✓';
      setTimeout(function () { btn.textContent = label; btn.disabled = false; side(); }, 1800);
    } catch (x) { btn.textContent = label; btn.disabled = false; alert('The vendor map was not published: ' + T.ctx.friendly(x)); }
  }
  function printDialogHtml() {
    return '<dialog class="tmap-dialog" id="mprintd" aria-labelledby="mprintt"><form method="dialog"><h2 id="mprintt">Print the map</h2>' +
      '<div class="tmap-kinds" role="group" aria-label="Paper size"><button type="submit" value="letter">Letter<br><small>11 × 8.5 in</small></button><button type="submit" value="tabloid">Tabloid<br><small>17 × 11 in</small></button><button type="submit" value="poster">Poster<br><small>36 × 24 in</small></button></div>' +
      '<label class="tmap-switch">Include the vendors\' names <input type="checkbox" id="mpnames" checked></label>' +
      '<p class="tmap-help">In the print window choose "Save as PDF" to take it to a print shop. The map prints at full detail at any size.</p>' +
      '<div class="tm-row"><button type="submit" value="cancel" class="bf-btn">Cancel</button></div></form></dialog>';
  }
  function wirePrint() {
    $('#mprintd').addEventListener('close', function () {
      var size = this.returnValue; if (!size || size === 'cancel') return;
      var names = $('#mpnames').checked;
      M.printPoster(T.doc, { size: size, mode: 'public', title: "Bloomin' Festival " + V.SEASON, subtitle: 'St. Bernard Abbey · April 17–18, 2027',
        names: names ? boothName : null, box: M.bounds(T.doc.booths.concat(T.doc.items), 25) });
    });
  }
  async function picture() {
    var b = $('#mpng'), t = b.innerHTML;
    b.disabled = true; b.textContent = 'Making the picture…';
    try { await M.downloadImage(T.doc, { mode: 'public', filename: 'Bloomin-Festival-' + V.SEASON + '-map.png' }); }
    catch (x) { alert('The picture could not be made: ' + T.ctx.friendly(x)); }
    b.disabled = false; b.innerHTML = t;
  }
  function backup() {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(T.doc, null, 1)], { type: 'application/json' }));
    a.download = 'Bloomin-Festival-map-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function restore(file) {
    try {
      var d = normalize(JSON.parse(await file.text()));
      if (!Array.isArray(d.booths) || !Array.isArray(d.items)) throw new Error("That file isn't a festival map backup.");
      migrate(d);
      if (!confirm('Replace the whole map with this backup? (Undo can bring the current map back.)')) return;
      pushUndo(); T.doc = d; T.map.setDoc(T.doc); record({ type: 'all', doc: clone(d) }); side();
    } catch (x) { alert(T.ctx.friendly(x)); }
  }
  function newYear() {
    if (!confirm('Start a new festival year? This keeps every booth, stand and tent where it is, and takes all vendors off their booths. (Download a backup first if you want a record.)')) return;
    var changed = T.doc.booths.filter(function (b) { return b.app; });
    pushUndo(); changed.forEach(function (b) { delete b.app; });
    T.doc.settings.season = V.SEASON;
    changed.forEach(put); record({ type: 'settings', value: { season: V.SEASON } });
    T.map.setDoc(T.doc); side();
  }

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    if (!T.root || !document.getElementById('tmap') || document.querySelector('dialog[open]')) return;
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') { if (T.placing) stopPlacing(); else if (!typing) { T.map.select([]); side(); } return; }
    if (typing) return;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
    var sel = T.map.selection().filter(function (o) { return T.edit || T.map.typeOf(o) === 'booth'; });
    if (!sel.length) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && T.edit) { e.preventDefault(); remove(sel); return; }
    if (mod && (e.key === 'd' || e.key === 'D') && T.edit) { e.preventDefault(); duplicate(sel); return; }
    var step = T.snap || e.shiftKey ? M.CELL : 1, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { e.preventDefault(); change(sel, function () { sel.forEach(function (o) { o.x += d[0]; o.y += d[1]; }); }); }
  });

  window.BFTeamMap = { load: load, open: open, boothFor: boothFor, showBooth: showBooth, get doc() { return T.doc; } };
})();
