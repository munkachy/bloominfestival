/* Bloomin' Festival map: Br. Nicholas's campus drawing with booths and site elements, all measured in feet.
 * Shared by the team's map (team/, via team-map.js) and the public map (map/). Plain SVG, no libraries.
 * A map document: { booths: [{id,n,n2,one,double,x,y,w,h,r,app,color,zone,power}], items: [{id,kind,icon,text,x,y,w,h,r,color}],
 *                   spots: [{id,x,y,r}], settings: {...} }   (x,y = centre in feet; r = degrees)
 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  // Br. Nicholas's drawing: page 1 (whole campus, 1 unit = 1 ft) with page 2 (the festival grounds, in detail) laid on top.
  var BASE = {
    campus: { href: '/images/map-campus.webp', x: 0, y: 0, w: 1900, h: 1728 },
    festival: { href: '/images/map-festival.webp', print: '/images/map-festival-print.webp', x: 364.78, y: 719.40, w: 838.07, h: 558.72 }
  };
  var HOME = { x: 476, y: 878, w: 450, h: 330 };          // the quad, the statue lawn and the library lawn
  // Colours from Br. Nicholas's map
  var PAL = { orange: '#fdb666', rust: '#a25903', cream: '#ffeda3', yellow: '#fecf33', gold: '#d8b95c', blue: '#4d81a7', navy: '#004069',
    red: '#7a0000', road: '#545454', dark: '#343434', white: '#ffffff', sage: '#6e8d53', leaf: '#68a92b' };
  var SWATCHES = [PAL.orange, PAL.rust, PAL.cream, PAL.yellow, PAL.gold, PAL.blue, PAL.navy, PAL.red, PAL.sage, PAL.leaf, PAL.road, PAL.white];
  var STATUS_DOT = { new: '#64748b', accepted: '#f59e0b', paid: '#16a34a', waitlist: '#2563eb', rejected: '#dc2626', withdrew: '#94a3b8' };

  /* ---------- icons (24 x 24, drawn for this map) ---------- */
  var S = ' fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  var F = ' fill="currentColor"';
  var ICONS = {
    restroom: { label: 'Restrooms', color: PAL.navy, svg: '<circle cx="7" cy="4.5" r="2"' + F + '/><path d="M4.5 8h5v6.5H8.6V21H5.4v-6.5H4.5z"' + F + '/><circle cx="17" cy="4.5" r="2"' + F + '/><path d="M17 8l3.4 8h-2.2v5h-2.4v-5h-2.2z"' + F + '/><path d="M12 3v18"' + S + '/>' },
    firstaid: { label: 'First aid', color: PAL.red, svg: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"' + F + '/>' },
    food: { label: 'Food', color: PAL.rust, svg: '<path d="M6 2v7a2 2 0 0 0 2 2v11M10 2v7a2 2 0 0 1-2 2M8 2v6"' + S + '/><path d="M18 2c-2.5 2-3 6-3 9h3v11"' + S + '/>' },
    drink: { label: 'Drinks', color: PAL.blue, svg: '<path d="M5.5 8h13L17 21H7z"' + S + '/><path d="M12 8l1.8-5.5H17"' + S + '/>' },
    info: { label: 'Information', color: PAL.blue, svg: '<circle cx="12" cy="12" r="9.5"' + S + '/><path d="M12 11v6"' + S + '/><circle cx="12" cy="7.3" r="1.4"' + F + '/>' },
    ticket: { label: 'Tickets & admission', color: PAL.blue, svg: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"' + S + '/><path d="M14.5 8v8"' + S + ' stroke-dasharray="1.6 2.4"/>' },
    entrance: { label: 'Entrance', color: PAL.yellow, ink: PAL.dark, svg: '<path d="M13 3h6v18h-6"' + S + '/><path d="M3 12h11M10 8l4 4-4 4"' + S + '/>' },
    exit: { label: 'Exit', color: PAL.yellow, ink: PAL.dark, svg: '<path d="M11 3H5v18h6"' + S + '/><path d="M10 12h11M17 8l4 4-4 4"' + S + '/>' },
    parking: { label: 'Parking', color: PAL.road, svg: '<rect x="4" y="3" width="16" height="18" rx="3"' + S + '/><path d="M10 17V7h3.4a3 3 0 0 1 0 6H10"' + S + '/>' },
    accessible: { label: 'Accessible', color: PAL.navy, svg: '<circle cx="11" cy="4" r="2"' + F + '/><path d="M11 7.5V13h5.5l2.5 6"' + S + '/><path d="M8.5 10.5a5.5 5.5 0 1 0 7.5 7.4"' + S + '/>' },
    music: { label: 'Music & stage', color: PAL.navy, svg: '<path d="M9 18V5.5l11-2.5v13"' + S + '/><circle cx="6.5" cy="18" r="2.6"' + F + '/><circle cx="17.5" cy="16" r="2.6"' + F + '/>' },
    tent: { label: 'Tent', color: PAL.rust, svg: '<path d="M12 3L2.5 20h19z"' + S + '/><path d="M12 3v17M9 20l3-6 3 6"' + S + '/>' },
    shop: { label: 'Shop', color: PAL.rust, svg: '<path d="M4 9h16l-1.6-5H5.6z"' + S + '/><path d="M5 9v11h14V9M10 20v-6h4v6"' + S + '/>' },
    art: { label: 'Art', color: PAL.rust, svg: '<path d="M12 3a9 9 0 1 0 0 18c1.6 0 2.2-1 2.2-2.1 0-1.2-1.1-1.6-1.1-2.6 0-1.1.9-1.6 2-1.6H17a4 4 0 0 0 4-4C21 6.3 17 3 12 3z"' + S + '/><circle cx="7.5" cy="11" r="1.3"' + F + '/><circle cx="10" cy="7" r="1.3"' + F + '/><circle cx="15" cy="7" r="1.3"' + F + '/>' },
    kids: { label: 'Kids', color: PAL.leaf, svg: '<ellipse cx="12" cy="9" rx="5.6" ry="6.5"' + S + '/><path d="M12 15.5v1.5c0 2-2 2.2-2 4.5"' + S + '/>' },
    train: { label: 'Train', color: PAL.blue, svg: '<rect x="5" y="3" width="14" height="13" rx="3"' + S + '/><path d="M5 10h14M8 16l-2 5M16 16l2 5"' + S + '/><circle cx="9" cy="13" r="1.1"' + F + '/><circle cx="15" cy="13" r="1.1"' + F + '/>' },
    seating: { label: 'Seating', color: PAL.sage, svg: '<path d="M5 10V6h14v4M3 10h18M4 14h16M6 14v6M18 14v6"' + S + '/>' },
    water: { label: 'Water', color: PAL.blue, svg: '<path d="M12 3s6.5 7.2 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 10.2 12 3 12 3z"' + S + '/>' },
    trash: { label: 'Trash & recycling', color: PAL.road, svg: '<path d="M4 7h16M9 7V4h6v3M6 7l1.2 14h9.6L18 7"' + S + '/>' },
    help: { label: 'Lost & found', color: PAL.blue, svg: '<circle cx="12" cy="12" r="9.5"' + S + '/><path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1 1-1.1 1.8v.6"' + S + '/><circle cx="12" cy="17.3" r="1.3"' + F + '/>' },
    money: { label: 'ATM', color: PAL.sage, svg: '<circle cx="12" cy="12" r="9.5"' + S + '/><path d="M15.2 8.8c-.5-.9-1.7-1.5-3.2-1.5-1.8 0-3.1.8-3.1 2.1s1.3 1.9 3.1 2.3 3.2 1 3.2 2.4-1.4 2.1-3.2 2.1c-1.5 0-2.8-.6-3.3-1.6M12 5.3v13.4"' + S + '/>' },
    power: { label: 'Power', color: PAL.yellow, ink: PAL.dark, svg: '<path d="M13.5 2L5 14h6l-1 8 8.5-12h-6z"' + F + '/>' },
    church: { label: 'Church', color: PAL.navy, svg: '<path d="M12 2.5v19M6.5 8h11"' + S + '/>' },
    pickup: { label: 'Pickup', color: PAL.sage, svg: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"' + S + '/><path d="M3 8l9 5 9-5M12 13v8"' + S + '/>' },
    bus: { label: 'Shuttle', color: PAL.road, svg: '<rect x="4" y="3.5" width="16" height="13.5" rx="2.5"' + S + '/><path d="M4 11h16"' + S + '/><circle cx="8" cy="19" r="1.7"' + F + '/><circle cx="16" cy="19" r="1.7"' + F + '/>' },
    photo: { label: 'Photos', color: PAL.navy, svg: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"' + S + '/><circle cx="12" cy="13" r="3.4"' + S + '/>' },
    security: { label: 'Security', color: PAL.navy, svg: '<path d="M12 2.8l8 3v6c0 5-3.5 8.3-8 9.4-4.5-1.1-8-4.4-8-9.4v-6z"' + S + '/>' },
    star: { label: 'Star', color: PAL.yellow, ink: PAL.dark, svg: '<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"' + F + '/>' },
    arrow: { label: 'Direction', color: PAL.dark, svg: '<path d="M4 12h15M13 6l6 6-6 6"' + S + '/>' },
    flower: { label: 'Garden', color: PAL.leaf, svg: '<circle cx="12" cy="9" r="2.4"' + F + '/><path d="M12 2.8a3.4 3.4 0 0 1 0 6.4 3.4 3.4 0 0 1 5.9-2.4A3.4 3.4 0 0 1 12 9.2a3.4 3.4 0 0 1 5.9 2.4A3.4 3.4 0 0 1 12 9.2a3.4 3.4 0 0 1-5.9 2.4A3.4 3.4 0 0 1 12 9.2a3.4 3.4 0 0 1-5.9-2.4A3.4 3.4 0 0 1 12 9.2"' + S + '/><path d="M12 12v9M12 17c-2-2.2-4.5-2.3-6-1.5M12 17c2-2.2 4.5-2.3 6-1.5"' + S + '/>' }
  };
  var KINDS = {
    stage: { label: 'Stage', w: 24, h: 16, color: PAL.navy, ink: '#fff', icon: 'music', text: 'Stage' },
    tent: { label: 'Tent', w: 20, h: 30, color: PAL.cream, ink: PAL.dark, icon: 'tent', text: 'Tent' },
    stand: { label: 'Stand or table', w: 10, h: 10, color: PAL.blue, ink: '#fff', icon: 'food', text: '' },
    area: { label: 'Area or section', w: 60, h: 40, color: PAL.yellow, ink: PAL.dark, icon: '', text: 'Area' },
    shape: { label: 'Shape', w: 20, h: 20, color: PAL.gold, ink: PAL.dark, icon: '', text: '' },
    marker: { label: 'Icon marker', w: 8, h: 8, color: '', ink: '#fff', icon: 'restroom', text: '' },
    label: { label: 'Text label', w: 50, h: 7, color: PAL.dark, ink: PAL.dark, icon: '', text: 'Label' }
  };

  /* ---------- helpers ---------- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function round(v, step) { step = step || 1; return Math.round(v / step) * step; }
  function rad(d) { return d * Math.PI / 180; }
  function rot(x, y, deg) { var c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return { x: x * c - y * s, y: x * s + y * c }; }
  function tf(o) { return 'translate(' + o.x.toFixed(2) + ' ' + o.y.toFixed(2) + ')' + (o.r ? ' rotate(' + o.r.toFixed(1) + ')' : ''); }
  function normRot(r) { r = ((r % 360) + 360) % 360; return r > 180 ? r - 360 : r; }
  function iconMarkup(name) { var i = ICONS[name]; return i ? i.svg : ''; }
  function boothSpaces(b) {         // the 12 ft spaces a booth stands on (two for a double booth)
    if (!b.double) return [{ x: b.x, y: b.y }];
    var d = rot(b.w / 4, 0, b.r || 0);
    return [{ x: b.x - d.x, y: b.y - d.y }, { x: b.x + d.x, y: b.y + d.y }];
  }
  function bounds(objs, pad) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    objs.forEach(function (o) { var h = Math.hypot(o.w || 8, o.h || 8) / 2; x0 = Math.min(x0, o.x - h); y0 = Math.min(y0, o.y - h); x1 = Math.max(x1, o.x + h); y1 = Math.max(y1, o.y + h); });
    pad = pad == null ? 20 : pad;
    return isFinite(x0) ? { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad } : Object.assign({}, HOME);
  }
  function textColor(fill) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fill || '');
    if (!m) return PAL.dark;
    var l = (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
    return l > 0.6 ? PAL.dark : '#ffffff';
  }

  /* ---------- the map ---------- */
  function create(host, opt) {
    opt = opt || {};
    var team = opt.mode === 'team';
    var doc = opt.doc || { booths: [], items: [], spots: [] };
    var st = { edit: false, snap: true, showSpots: false, sel: [], vb: Object.assign({}, opt.view || HOME), hi: null, drag: null, pointers: {}, k: 1 };
    var svg = el('svg', { class: 'bfm-svg' + (opt.static ? ' bfm-static' : ''), role: 'img', 'aria-label': opt.title || 'Festival map', preserveAspectRatio: 'xMidYMid meet' });
    var gBase = el('g', { class: 'bfm-base' }, svg);
    var gLow = el('g', {}, svg), gMid = el('g', {}, svg), gSpots = el('g', { class: 'bfm-spots' }, svg), gBooths = el('g', {}, svg),
      gTop = el('g', {}, svg), gSel = el('g', { class: 'bfm-sel' }, svg);
    host.appendChild(svg);
    var nodes = {};          // id -> svg group

    function all() { return doc.booths.concat(doc.items); }
    function byId(id) {
      var lists = [doc.booths, doc.items, doc.spots || []];
      for (var i = 0; i < lists.length; i++) for (var j = 0; j < lists[i].length; j++) if (lists[i][j].id === id) return lists[i][j];
      return null;
    }
    function typeOf(o) { return doc.booths.indexOf(o) !== -1 ? 'booth' : (doc.spots || []).indexOf(o) !== -1 ? 'spot' : 'item'; }

    /* ----- drawing ----- */
    function drawBase() {
      gBase.innerHTML = '';
      ['campus', 'festival'].forEach(function (k) {
        var b = BASE[k];
        el('image', { href: (opt.print && b.print) || b.href, x: b.x, y: b.y, width: b.w, height: b.h, preserveAspectRatio: 'none' }, gBase);
      });
    }
    function drawBooth(b) {
      var v = team && opt.vendorOf ? opt.vendorOf(b) : null;
      var empty = team && !b.app;
      var g = el('g', { class: 'bfm-item bfm-booth' + (empty ? ' bfm-open' : '') + (b.zone ? ' bfm-zoned' : ''), 'data-id': b.id, transform: tf(b) }, gBooths);
      var fill = b.color || PAL.orange;
      el('rect', { class: 'bfm-body', x: -b.w / 2, y: -b.h / 2, width: b.w, height: b.h, rx: 0.8, fill: empty ? '#fffdf8' : fill, stroke: empty ? PAL.rust : '#7a4300' }, g);
      if (empty && b.color) el('rect', { x: -b.w / 2, y: -b.h / 2, width: b.w, height: Math.min(2.4, b.h / 4), fill: b.color, 'pointer-events': 'none' }, g);
      var ink = empty ? PAL.rust : textColor(fill);
      var nums = b.double && !b.one && b.n2 ? [[b.n, -b.w / 4], [b.n2, b.w / 4]] : [[b.n, 0]];
      if (nums.length === 2) el('line', { class: 'bfm-div', x1: 0, y1: -b.h / 2, x2: 0, y2: b.h / 2, stroke: '#7a4300' }, g);
      var fs = Math.max(2, Math.min(b.h * 0.42, (b.w / nums.length) * 0.42));
      nums.forEach(function (n) {
        var t = el('text', { class: 'bfm-num', transform: 'translate(' + n[1] + ' 0) rotate(' + (-(b.r || 0)) + ')', 'font-size': fs, fill: ink }, g);
        t.textContent = n[0] || '';
      });
      if (v && v.status && STATUS_DOT[v.status]) el('circle', { class: 'bfm-dot', cx: b.w / 2 - 1.9, cy: -b.h / 2 + 1.9, r: 1.25, fill: STATUS_DOT[v.status], stroke: '#fff', 'stroke-width': 0.4 }, g);
      if (b.power || (v && v.power)) {
        var warn = v && v.power && !b.power;
        var p = el('g', { class: 'bfm-pow' + (warn ? ' bfm-warn' : ''), transform: 'translate(' + (-b.w / 2 + 0.6) + ' ' + (b.h / 2 - 4) + ') scale(0.15)', color: warn ? '#b91c1c' : '#7a4300' }, g);
        p.innerHTML = ICONS.power.svg;
      }
      nodes[b.id] = g;
    }
    function drawItem(it) {
      var k = KINDS[it.kind] || KINDS.shape, color = it.color || k.color, g;
      if (it.kind === 'marker') {
        var ic = ICONS[it.icon] || ICONS.star;
        color = it.color || ic.color;
        g = el('g', { class: 'bfm-item bfm-marker', 'data-id': it.id, transform: tf({ x: it.x, y: it.y }) }, gTop);
        var mk = el('g', { class: 'bfm-mk', style: '--d:' + (it.w || 8) }, g);
        el('circle', { r: (it.w || 8) / 2, fill: color, stroke: '#fff', 'stroke-width': Math.max(0.5, (it.w || 8) / 14) }, mk);
        var s = (it.w || 8) * 0.62 / 24;
        var ig = el('g', { transform: 'translate(' + (-12 * s) + ' ' + (-12 * s) + ') scale(' + s + ')', color: ic.ink || '#fff' }, mk);
        ig.innerHTML = ic.svg;
        if (it.text) { var t = el('text', { class: 'bfm-lbl', y: (it.w || 8) / 2 + 1, style: '--f:3.2' }, g); t.textContent = it.text; }
      } else if (it.kind === 'label') {
        g = el('g', { class: 'bfm-item bfm-free', 'data-id': it.id, transform: tf(it) }, gTop);
        el('rect', { class: 'bfm-hit', x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h, fill: 'transparent' }, g);
        var lt = el('text', { class: 'bfm-freetext', 'font-size': it.h * 0.8, fill: color }, g);
        lt.textContent = it.text || '';
      } else {
        var layer = it.kind === 'area' || it.kind === 'shape' ? gLow : gMid;
        g = el('g', { class: 'bfm-item bfm-' + it.kind, 'data-id': it.id, transform: tf(it) }, layer);
        var area = it.kind === 'area';
        el('rect', { class: 'bfm-body', x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h, rx: it.kind === 'tent' ? 1.5 : 0.8,
          fill: color, 'fill-opacity': area ? 0.3 : 1, stroke: area ? color : 'rgba(0,0,0,.45)', 'stroke-width': area ? 1 : 0.5, 'stroke-dasharray': area ? '3 2' : null }, g);
        var ink = area ? PAL.dark : textColor(color);
        var label = it.text || '';
        var icon = it.icon && ICONS[it.icon];
        // the label inside when it fits, otherwise under the shape
        var fs = Math.min(it.h * (icon ? 0.24 : 0.34), label ? (it.w * 0.9) / (0.56 * label.length) : 99);
        var inner = el('g', { transform: 'rotate(' + (-(it.r || 0)) + ')' }, g);
        if (icon) {
          var is = Math.min(it.w, it.h) * (label && fs >= 2 ? 0.42 : 0.62) / 24;
          var iy = label && fs >= 2 ? -it.h * 0.16 : 0;
          var ig2 = el('g', { transform: 'translate(' + (-12 * is) + ' ' + (iy - 12 * is) + ') scale(' + is + ')', color: area ? color : ink, opacity: area ? 0.9 : 1 }, inner);
          ig2.innerHTML = icon.svg;
        }
        if (label) {
          if (area) {
            var at = el('text', { class: 'bfm-area-t', y: -it.h / 2 + 1.2, style: '--f:' + Math.max(3, Math.min(9, it.w / 9)) }, inner);
            at.textContent = label;
          } else if (fs >= 2) {
            var tt = el('text', { class: 'bfm-in', y: icon ? it.h * 0.22 : 0, 'font-size': fs, fill: ink }, inner);
            tt.textContent = label;
          } else {
            var ot = el('text', { class: 'bfm-lbl', y: Math.max(it.w, it.h) / 2 + 1, style: '--f:3' }, inner);
            ot.textContent = label;
          }
        }
      }
      nodes[it.id] = g;
    }
    function drawSpots() {
      gSpots.innerHTML = '';
      var show = team && (st.showSpots || st.edit || (st.drag && st.drag.kind === 'move' && st.drag.objs.some(function (o) { return typeOf(o) === 'booth'; })));
      svg.classList.toggle('bfm-spots-on', !!show);
      if (!show) return;
      (doc.spots || []).forEach(function (s) {
        var g = el('g', { class: 'bfm-spot' + (st.edit ? ' bfm-item' : ''), 'data-id': s.id, transform: tf(s) }, gSpots);
        el('rect', { x: -6, y: -6, width: 12, height: 12, rx: 0.6 }, g);
        nodes[s.id] = g;
      });
    }
    function render() {
      nodes = {};
      [gLow, gMid, gBooths, gTop].forEach(function (g) { g.innerHTML = ''; });
      doc.items.forEach(drawItem);
      doc.booths.forEach(drawBooth);
      drawSpots();
      applyHighlight();
      drawSelection();
    }
    function redrawOne(o) {
      var t = typeOf(o), old = nodes[o.id];
      if (t === 'spot') { if (old) old.setAttribute('transform', tf(o)); return; }
      var parent = old && old.parentNode, next = old && old.nextSibling;
      if (old) old.remove();
      if (t === 'booth') drawBooth(o); else drawItem(o);
      if (parent && nodes[o.id].parentNode === parent) parent.insertBefore(nodes[o.id], next);
      applyHighlight();
    }

    /* ----- selection outline and handles ----- */
    function drawSelection() {
      gSel.innerHTML = '';
      var px = 1 / st.k;
      st.sel.forEach(function (o) {
        var w = o.kind === 'marker' ? (o.w || 8) : o.w, h = o.kind === 'marker' ? (o.w || 8) : o.h;
        if (typeOf(o) === 'spot') w = h = 12;
        var g = el('g', { transform: tf(o) }, gSel);
        el('rect', { class: 'bfm-selbox', x: -w / 2 - 3 * px, y: -h / 2 - 3 * px, width: w + 6 * px, height: h + 6 * px, 'stroke-width': 2 * px }, g);
      });
      if (st.sel.length !== 1 || opt.static) return;
      var o = st.sel[0];
      if (!canResize(o)) return;
      var hs = 10 * px, w2 = o.w / 2, h2 = o.h / 2;
      var g2 = el('g', { transform: tf(o) }, gSel);
      [['nw', -w2, -h2], ['n', 0, -h2], ['ne', w2, -h2], ['e', w2, 0], ['se', w2, h2], ['s', 0, h2], ['sw', -w2, h2], ['w', -w2, 0]].forEach(function (h) {
        el('rect', { class: 'bfm-handle', 'data-h': h[0], x: h[1] - hs / 2, y: h[2] - hs / 2, width: hs, height: hs, 'stroke-width': 1.5 * px }, g2);
      });
      if (canRotate(o)) {
        el('line', { class: 'bfm-rotline', x1: 0, y1: -h2, x2: 0, y2: -h2 - 22 * px, 'stroke-width': 1.5 * px }, g2);
        el('circle', { class: 'bfm-handle bfm-roth', 'data-h': 'rot', cx: 0, cy: -h2 - 22 * px, r: 6 * px, 'stroke-width': 1.5 * px }, g2);
      }
    }
    function canMove(o) { var t = typeOf(o); return team && !opt.static && (t === 'booth' || st.edit); }
    function canResize(o) { var t = typeOf(o); return team && (t === 'booth' || (st.edit && t === 'item' && o.kind !== 'marker')); }
    function canRotate(o) { var t = typeOf(o); return team && (t === 'booth' || (st.edit && t === 'item' && o.kind !== 'marker')); }

    function applyHighlight() {
      var any = false;
      Object.keys(nodes).forEach(function (id) {
        var o = byId(id); if (!o) return;
        var on = !!(st.hi && st.hi(o));
        nodes[id].classList.toggle('bfm-hi', on);
        if (on) any = true;
      });
      svg.classList.toggle('bfm-dim', any);
    }

    /* ----- view ----- */
    function setView(vb) {
      if (vb) st.vb = vb;
      var r = svg.getBoundingClientRect();
      var aspect = r.width && r.height ? r.width / r.height : 1.5;
      st.vb.w = Math.max(20, Math.min(2800, st.vb.w)); st.vb.h = st.vb.w / aspect;
      svg.setAttribute('viewBox', [st.vb.x, st.vb.y, st.vb.w, st.vb.h].map(function (v) { return v.toFixed(2); }).join(' '));
      st.k = r.width ? r.width / st.vb.w : 1;
      svg.style.setProperty('--k', st.k.toFixed(4));
      svg.classList.toggle('bfm-far', st.k < 1.3);
      svg.classList.toggle('bfm-near', st.k > 2.8);
      drawSelection();
      if (opt.onView) opt.onView(st.vb, st.k);
    }
    function fit(box, keep) {
      var r = svg.getBoundingClientRect();
      var aspect = r.width && r.height ? r.width / r.height : 1.5;
      var w = Math.max(box.w, box.h * aspect), h = w / aspect;
      setView({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w: w, h: h });
    }
    function zoomAt(f, cx, cy) {
      var vb = st.vb, nw = Math.max(20, Math.min(2800, vb.w / f)), ff = vb.w / nw;
      setView({ x: cx - (cx - vb.x) / ff, y: cy - (cy - vb.y) / ff, w: nw, h: vb.h / ff });
    }
    function toFt(e) {
      var m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
      var p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return { x: p.x, y: p.y };
    }

    /* ----- snapping ----- */
    var pairs = null;
    function spotPairs() {
      if (pairs) return pairs;
      pairs = [];
      var sp = doc.spots || [];
      for (var i = 0; i < sp.length; i++) for (var j = i + 1; j < sp.length; j++) {
        var a = sp[i], b = sp[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 11.2 || d > 13.2 || Math.abs(normRot(a.r - b.r)) > 3) continue;
        var ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, rel = Math.abs(normRot(ang - (a.r || 0))) % 90;
        if (Math.min(rel, 90 - rel) > 8) continue;                      // neighbours sharing a side (in a row or a column)
        pairs.push({ a: a, b: b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: normRot(ang > 90 || ang <= -90 ? ang + 180 : ang) });
      }
      return pairs;
    }
    function taken(moving) {
      var t = [];
      doc.booths.forEach(function (b) { if (moving.indexOf(b) === -1) t = t.concat(boothSpaces(b)); });
      return function (s) { return t.some(function (p) { return Math.hypot(p.x - s.x, p.y - s.y) < 3; }); };
    }
    function snapBooth(b, x, y, moving) {
      if (!st.snap) return { x: round(x, 0.5), y: round(y, 0.5), r: b.r || 0 };
      var used = taken(moving), best = null, bd = 1e9;
      if (b.double) {
        spotPairs().forEach(function (p) { var d = Math.hypot(p.x - x, p.y - y); if (d < 13 && d < bd && !used(p.a) && !used(p.b)) { bd = d; best = p; } });
      } else if (Math.abs(b.w - 12) < 0.6 && Math.abs(b.h - 12) < 0.6) {
        (doc.spots || []).forEach(function (s) { var d = Math.hypot(s.x - x, s.y - y); if (d < 10 && d < bd && !used(s)) { bd = d; best = s; } });
      }
      if (best) return { x: best.x, y: best.y, r: best.r || 0 };
      // anywhere else: the campus grid of 12 ft squares, square to the campus
      var r0 = Math.abs(normRot(b.r || 0)) % 180, turned = r0 > 45 && r0 < 135;
      var w = turned ? b.h : b.w, h = turned ? b.w : b.h;
      return { x: round(x - w / 2, 12) + w / 2, y: round(y - h / 2, 12) + h / 2, r: turned ? 90 : 0 };
    }

    /* ----- pointer handling ----- */
    function startDrag(e, kind, extra) {
      st.drag = Object.assign({ kind: kind, x0: e.clientX, y0: e.clientY, p0: toFt(e), moved: false, began: false }, extra);
    }
    function begin() {
      if (st.drag.began) return;
      st.drag.began = true;
      if (opt.onBegin) opt.onBegin();
      if (st.drag.kind === 'move') drawSpots();
    }
    svg.addEventListener('pointerdown', function (e) {
      if (opt.static || e.button > 0) return;
      st.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(st.pointers);
      if (ids.length === 2) {          // two fingers: pinch to zoom
        var a = st.pointers[ids[0]], b = st.pointers[ids[1]];
        st.drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), vb0: Object.assign({}, st.vb), c: toFt({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }) };
        return;
      }
      svg.setPointerCapture(e.pointerId);
      var h = e.target.closest('[data-h]');
      if (h && st.sel.length === 1) {
        var o = st.sel[0];
        startDrag(e, h.getAttribute('data-h') === 'rot' ? 'rotate' : 'resize', { h: h.getAttribute('data-h'), obj: o, orig: { x: o.x, y: o.y, w: o.w, h: o.h, r: o.r || 0 } });
        return;
      }
      var hit = e.target.closest('[data-id]'), obj = hit && byId(hit.getAttribute('data-id'));
      if (obj) {
        if (e.shiftKey && team) { toggleSel(obj); startDrag(e, 'none'); return; }
        if (st.sel.indexOf(obj) === -1) select([obj], true);
        var objs = st.sel.filter(canMove);
        startDrag(e, objs.length && objs.indexOf(obj) !== -1 ? 'move' : 'click', { anchor: obj, objs: objs, orig: objs.map(function (o) { return { x: o.x, y: o.y, r: o.r || 0 }; }) });
        return;
      }
      if (e.shiftKey && team) { startDrag(e, 'box'); return; }
      startDrag(e, 'pan', { vb0: Object.assign({}, st.vb) });
    });
    svg.addEventListener('pointermove', function (e) {
      if (st.pointers[e.pointerId]) st.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var d = st.drag; if (!d) return;
      if (d.kind === 'pinch') {
        var ids = Object.keys(st.pointers); if (ids.length < 2) return;
        var a = st.pointers[ids[0]], b = st.pointers[ids[1]], f = Math.hypot(a.x - b.x, a.y - b.y) / d.d0;
        st.vb = Object.assign({}, d.vb0); zoomAt(f, d.c.x, d.c.y);
        return;
      }
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.moved = true;
      var p = toFt(e);
      if (d.kind === 'pan') {
        setView({ x: d.vb0.x - (e.clientX - d.x0) / st.k, y: d.vb0.y - (e.clientY - d.y0) / st.k, w: d.vb0.w, h: d.vb0.h });
      } else if (d.kind === 'move') {
        begin();
        var dx = p.x - d.p0.x, dy = p.y - d.p0.y, ai = d.objs.indexOf(d.anchor), ao = d.orig[ai];
        var s;
        if (d.objs.length === 1 && typeOf(d.anchor) === 'booth') s = snapBooth(d.anchor, ao.x + dx, ao.y + dy, d.objs);
        else { var step = st.snap ? 1 : 0.25; s = { x: round(ao.x + dx, step), y: round(ao.y + dy, step), r: ao.r }; }
        var mx = s.x - ao.x, my = s.y - ao.y;
        d.objs.forEach(function (o, i) {
          o.x = d.orig[i].x + mx; o.y = d.orig[i].y + my;
          if (d.objs.length === 1) o.r = s.r;
          if (nodes[o.id]) nodes[o.id].setAttribute('transform', tf(typeOf(o) === 'item' && o.kind === 'marker' ? { x: o.x, y: o.y } : o));
          if (typeOf(o) === 'booth' && d.objs.length === 1) redrawOne(o);
        });
        drawSelection();
      } else if (d.kind === 'resize') {
        begin(); resizeTo(d, p, e.altKey);
      } else if (d.kind === 'rotate') {
        begin();
        var o = d.obj, ang = Math.atan2(p.y - o.y, p.x - o.x) * 180 / Math.PI + 90;
        o.r = normRot(st.snap && !e.altKey ? round(ang, 15) : round(ang, 1));
        redrawOne(o); drawSelection();
      } else if (d.kind === 'box') {
        var x0 = Math.min(d.p0.x, p.x), y0 = Math.min(d.p0.y, p.y);
        gSel.querySelectorAll('.bfm-boxsel').forEach(function (n) { n.remove(); });
        el('rect', { class: 'bfm-boxsel', x: x0, y: y0, width: Math.abs(p.x - d.p0.x), height: Math.abs(p.y - d.p0.y), 'stroke-width': 1.5 / st.k }, gSel);
        d.box = { x0: x0, y0: y0, x1: Math.max(d.p0.x, p.x), y1: Math.max(d.p0.y, p.y) };
      }
    });
    function endPointer(e) {
      delete st.pointers[e.pointerId];
      var d = st.drag; if (!d) return;
      if (d.kind === 'pinch') { if (!Object.keys(st.pointers).length) st.drag = null; return; }
      st.drag = null;
      if (d.kind === 'pan' && !d.moved) { select([], true); return; }
      if (d.kind === 'box' && d.box) {
        var inBox = all().concat(st.edit ? doc.spots || [] : []).filter(function (o) { return o.x >= d.box.x0 && o.x <= d.box.x1 && o.y >= d.box.y0 && o.y <= d.box.y1; });
        select(st.sel.concat(inBox.filter(function (o) { return st.sel.indexOf(o) === -1; })), true);
        return;
      }
      if ((d.kind === 'move' || d.kind === 'resize' || d.kind === 'rotate') && d.began) {
        var changed = d.kind === 'move' ? d.objs : [d.obj];
        drawSpots();
        changed.forEach(redrawOne);
        drawSelection();
        if (opt.onChange) opt.onChange(changed, d.kind);
      }
    }
    svg.addEventListener('pointerup', endPointer);
    svg.addEventListener('pointercancel', endPointer);
    svg.addEventListener('wheel', function (e) {
      if (opt.static) return;
      e.preventDefault();
      var p = toFt(e), f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      zoomAt(f, p.x, p.y);
    }, { passive: false });

    function resizeTo(d, p, free) {
      var o = d.obj, g = d.orig, h = d.h;
      var local = rot(p.x - g.x, p.y - g.y, -g.r);
      var x0 = -g.w / 2, x1 = g.w / 2, y0 = -g.h / 2, y1 = g.h / 2, step = st.snap && !free ? 1 : 0.25, min = 2;
      if (h.indexOf('w') !== -1) x0 = Math.min(round(local.x, step), x1 - min);
      if (h.indexOf('e') !== -1) x1 = Math.max(round(local.x, step), x0 + min);
      if (h.indexOf('n') !== -1) y0 = Math.min(round(local.y, step), y1 - min);
      if (h.indexOf('s') !== -1) y1 = Math.max(round(local.y, step), y0 + min);
      var c = rot((x0 + x1) / 2, (y0 + y1) / 2, g.r);
      o.w = round(x1 - x0, 0.25); o.h = round(y1 - y0, 0.25); o.x = g.x + c.x; o.y = g.y + c.y;
      if (typeOf(o) === 'booth' && o.double && o.w < 18) o.double = false;
      redrawOne(o); drawSelection();
    }

    /* ----- selection ----- */
    function select(objs, fromUser) {
      st.sel = objs.filter(Boolean);
      drawSelection();
      if (fromUser && opt.onSelect) opt.onSelect(st.sel.slice());
    }
    function toggleSel(o) {
      var i = st.sel.indexOf(o);
      if (i === -1) st.sel.push(o); else st.sel.splice(i, 1);
      select(st.sel, true);
    }

    drawBase();
    render();
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { setView(); }) : null;
    if (ro) ro.observe(svg);
    requestAnimationFrame(function () { setView(); });

    return {
      svg: svg,
      get doc() { return doc; },
      setDoc: function (d) { doc = d; pairs = null; st.sel = st.sel.map(function (o) { return byId(o.id); }).filter(Boolean); render(); },
      render: render,
      redraw: function (objs) { (objs || []).forEach(redrawOne); drawSelection(); },
      spotsChanged: function () { pairs = null; drawSpots(); },
      select: function (objs) { select(objs, false); },
      selection: function () { return st.sel.slice(); },
      setEdit: function (on) { st.edit = !!on; svg.classList.toggle('bfm-editing', st.edit); if (!on) st.sel = st.sel.filter(function (o) { return typeOf(o) === 'booth'; }); render(); },
      setSnap: function (on) { st.snap = !!on; },
      setShowSpots: function (on) { st.showSpots = !!on; drawSpots(); drawSelection(); },
      highlight: function (fn) { st.hi = fn; applyHighlight(); },
      fit: function (what) { fit(what === 'all' ? { x: 0, y: 0, w: 1900, h: 1728 } : what === 'home' || !what ? HOME : what); },
      fitObjects: function (objs, pad) { if (objs.length) fit(bounds(objs, pad == null ? 40 : pad)); },
      zoomBy: function (f) { zoomAt(f, st.vb.x + st.vb.w / 2, st.vb.y + st.vb.h / 2); },
      center: function () { return { x: st.vb.x + st.vb.w / 2, y: st.vb.y + st.vb.h / 2 }; },
      view: function () { return Object.assign({}, st.vb); },
      setView: function (vb) { setView(Object.assign({}, vb)); },
      snapBooth: function (b, x, y) { return snapBooth(b, x, y, [b]); },
      typeOf: typeOf,
      byId: byId,
      destroy: function () { if (ro) ro.disconnect(); svg.remove(); }
    };
  }

  /* ---------- legend, poster and picture ---------- */
  function legend(doc, names) {
    var icons = {}, zones = {};
    doc.items.forEach(function (it) {
      var ic = it.icon && ICONS[it.icon];
      if (ic && it.kind !== 'label') { var key = it.icon; if (!icons[key]) icons[key] = { icon: it.icon, text: it.kind === 'marker' && it.text ? it.text : ic.label, color: it.color || (it.kind === 'marker' ? ic.color : (KINDS[it.kind] || {}).color) }; }
    });
    doc.booths.forEach(function (b) { if (b.zone) zones[b.zone] = b.color || PAL.orange; });
    var list = doc.booths.filter(function (b) { return b.n; }).map(function (b) {
      return { n: b.n + (b.double && b.n2 && !b.one ? '–' + b.n2 : ''), name: names ? names(b) : '', zone: b.zone || '' };
    }).sort(function (a, b) { return (parseInt(a.n, 10) || 0) - (parseInt(b.n, 10) || 0) || String(a.n).localeCompare(String(b.n)); });
    return { icons: Object.keys(icons).map(function (k) { return icons[k]; }), zones: Object.keys(zones).map(function (z) { return { name: z, color: zones[z] }; }), booths: list };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function iconSvg(name, color, size) {
    var ic = ICONS[name]; if (!ic) return '';
    return '<svg viewBox="0 0 24 24" width="' + (size || 22) + '" height="' + (size || 22) + '" aria-hidden="true" style="color:' + (color || 'currentColor') + '">' + ic.svg + '</svg>';
  }
  function legendHtml(lg) {
    var h = '';
    if (lg.zones.length) h += '<section><h3>Areas</h3><ul class="bfm-lg-zones">' + lg.zones.map(function (z) { return '<li><i style="background:' + esc(z.color) + '"></i>' + esc(z.name) + '</li>'; }).join('') + '</ul></section>';
    if (lg.icons.length) h += '<section><h3>On the map</h3><ul class="bfm-lg-icons">' + lg.icons.map(function (i) { return '<li><span class="bfm-lg-ic" style="background:' + esc(i.color || PAL.dark) + ';color:' + esc((ICONS[i.icon] || {}).ink || '#fff') + '">' + iconSvg(i.icon, null, 16) + '</span>' + esc(i.text) + '</li>'; }).join('') + '</ul></section>';
    if (lg.booths.some(function (b) { return b.name; })) h += '<section class="bfm-lg-booths"><h3>Booths</h3><ol>' + lg.booths.filter(function (b) { return b.name; }).map(function (b) { return '<li><b>' + esc(b.n) + '</b> ' + esc(b.name) + '</li>'; }).join('') + '</ol></section>';
    return h;
  }
  // Prints the map as a poster: the drawing at full detail, the legend and (when allowed) the booth list.
  function printPoster(doc, o) {
    o = o || {};
    var sizes = { letter: ['11in', '8.5in'], tabloid: ['17in', '11in'], poster: ['36in', '24in'] }, sz = sizes[o.size] || sizes.tabloid;
    var wrap = document.createElement('div');
    wrap.className = 'bfm-print bfm-print-' + (o.size || 'tabloid');
    wrap.innerHTML = '<header><h1>' + esc(o.title || "Bloomin' Festival") + '</h1><p>' + esc(o.subtitle || '') + '</p></header><div class="bfm-print-map"></div><aside class="bfm-legend">' + legendHtml(legend(doc, o.names)) + '</aside>';
    document.body.appendChild(wrap);
    var page = document.createElement('style');
    page.textContent = '@page { size: ' + sz[0] + ' ' + sz[1] + '; margin: 0.35in; }';
    document.head.appendChild(page);
    var m = create(wrap.querySelector('.bfm-print-map'), { doc: doc, mode: o.mode || 'public', static: true, print: true, vendorOf: o.vendorOf, view: o.box || bounds(doc.booths.concat(doc.items), 30) });
    document.body.classList.add('bfm-printing');
    var done = function () { document.body.classList.remove('bfm-printing'); wrap.remove(); page.remove(); m.destroy(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () {
      m.setView(o.box || bounds(doc.booths.concat(doc.items), 30));
      var imgs = Array.prototype.slice.call(wrap.querySelectorAll('image'));
      Promise.all(imgs.map(function (i) { return new Promise(function (r) { var im = new Image(); im.onload = im.onerror = r; im.src = i.getAttribute('href'); }); })).then(function () {
        window.print();
        setTimeout(function () { if (document.body.contains(wrap) && !window.matchMedia('print').matches) done(); }, 1500);
      });
    }, 60);
  }
  // A picture of the map (PNG) for programs, signs and social media.
  async function downloadImage(doc, o) {
    o = o || {};
    var box = o.box || bounds(doc.booths.concat(doc.items), 30), width = o.width || 4000, height = Math.round(width * box.h / box.w);
    var holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + width + 'px;height:' + height + 'px';
    document.body.appendChild(holder);
    var m = create(holder, { doc: doc, mode: o.mode || 'public', static: true, print: true, vendorOf: o.vendorOf, view: box });
    m.setView(box);
    var svg = m.svg.cloneNode(true);
    svg.setAttribute('width', width); svg.setAttribute('height', height); svg.setAttribute('xmlns', NS);
    var style = document.createElementNS(NS, 'style');
    style.textContent = Array.prototype.map.call(document.styleSheets, function (sh) { try { return Array.prototype.map.call(sh.cssRules, function (r) { return r.cssText; }).filter(function (t) { return t.indexOf('.bfm') !== -1; }).join('\n'); } catch (e) { return ''; } }).join('\n') +
      '.bfm-svg{--k:' + (width / box.w) + ';font-family:Arial,Helvetica,sans-serif}';
    svg.insertBefore(style, svg.firstChild);
    var imgs = svg.querySelectorAll('image');
    for (var i = 0; i < imgs.length; i++) {
      var blob = await (await fetch(imgs[i].getAttribute('href'))).blob();
      imgs[i].setAttribute('href', await new Promise(function (r) { var fr = new FileReader(); fr.onload = function () { r(fr.result); }; fr.readAsDataURL(blob); }));
    }
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    var img = new Image();
    await new Promise(function (r, j) { img.onload = r; img.onerror = j; img.src = url; });
    var c = document.createElement('canvas'); c.width = width; c.height = height;
    var x = c.getContext('2d'); x.fillStyle = '#5a7443'; x.fillRect(0, 0, width, height); x.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url); m.destroy(); holder.remove();
    var png = await new Promise(function (r) { c.toBlob(r, 'image/png'); });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(png); a.download = o.filename || 'Bloomin-Festival-map.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  root.BFMap = { create: create, PAL: PAL, SWATCHES: SWATCHES, ICONS: ICONS, KINDS: KINDS, BASE: BASE, HOME: HOME, STATUS_DOT: STATUS_DOT,
    legend: legend, legendHtml: legendHtml, iconSvg: iconSvg, printPoster: printPoster, downloadImage: downloadImage, bounds: bounds, boothSpaces: boothSpaces, normRot: normRot };
})(window);
