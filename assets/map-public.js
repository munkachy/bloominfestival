/* Bloomin' Festival public map (map/): the vendor map the festival team publishes from bloominfestival.com/team.
 * It holds booth numbers and site elements, and vendors' names only when the team chooses to show them.
 * ?booth=12 highlights a vendor's own booth. A copy is kept on the device for festival-day signal trouble.
 */
(function () {
  'use strict';
  var V = window.BFVault, M = window.BFMap;
  var KEEP = 'bf-public-map';
  var doc = null, map = null;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function keep(d) { try { localStorage.setItem(KEEP, JSON.stringify(d)); } catch (e) {} }
  function kept() { try { return JSON.parse(localStorage.getItem(KEEP) || 'null'); } catch (e) { return null; } }
  var params = new URLSearchParams(location.search), mine = (params.get('booth') || '').trim();

  function show(d) {
    doc = { booths: d.booths || [], items: d.items || [], spots: [] };
    doc.booths.forEach(function (b, i) { b.id = 'b' + i; });
    doc.items.forEach(function (it, i) { it.id = 'i' + i; });
    $('pm-empty').hidden = true; $('pm-frame').hidden = false; $('pm-tools').hidden = false;
    if (map) map.destroy();
    map = M.create($('pm-host'), { doc: doc, mode: 'public', title: "Bloomin' Festival map", onSelect: card });
    var cats = {};
    doc.booths.forEach(function (b) { if (b.cat) cats[b.cat] = 1; });
    var sel = $('pm-cat');
    sel.innerHTML = '<option value="">All vendors</option>' + Object.keys(cats).sort().map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    sel.hidden = !Object.keys(cats).length;
    $('pm-legend').innerHTML = M.legendHtml(M.legend(doc, d.showNames ? function (b) { return b.name || ''; } : null));
    var target = mine && doc.booths.filter(function (b) { return String(b.n) === mine || String(b.n2 || '') === mine; })[0];
    if (target) {
      $('pm-yours').hidden = false;
      $('pm-yours').textContent = 'Your booth: ' + mine + (target.zone ? ' (' + target.zone + ')' : '') + '. It is highlighted on the map.';
      map.highlight(function (o) { return o === target; });
      setTimeout(function () { map.fitObjects([target], 80); }, 30);
    } else {
      if (mine) { $('pm-yours').hidden = false; $('pm-yours').textContent = 'Booth ' + mine + ' isn\'t on the map yet. Please check back later.'; }
      setTimeout(function () { map.fitObjects(doc.booths.concat(doc.items), 25); }, 30);
    }
  }
  function card(sel) {
    var c = $('pm-card'), o = sel[0];
    if (!o) { c.hidden = true; return; }
    var html;
    if (map.typeOf(o) === 'booth') {
      html = '<p class="bf-label">Booth ' + esc(o.n) + (o.double && o.n2 && !o.one ? ' &amp; ' + esc(o.n2) : '') + (o.zone ? ' · ' + esc(o.zone) : '') + '</p>' +
        (o.name ? '<h2>' + esc(o.name) + '</h2>' + (o.cat ? '<p>' + esc(o.cat) + '</p>' : '') + (o.web ? '<p><a href="' + esc(o.web) + '" target="_blank" rel="noopener">Visit their website</a></p>' : '') : '<h2>Booth ' + esc(o.n) + '</h2>');
    } else {
      var ic = M.ICONS[o.icon];
      html = '<h2>' + esc(o.text || (ic && ic.label) || 'On the map') + '</h2>' + (ic && o.text && ic.label !== o.text ? '<p>' + esc(ic.label) + '</p>' : '');
    }
    c.innerHTML = html + '<button type="button" class="pmap-close" aria-label="Close">×</button>';
    c.hidden = false;
    c.querySelector('.pmap-close').onclick = function () { c.hidden = true; map.select([]); };
  }
  function filter() {
    if (!map) return;
    var q = $('pm-q').value.trim().toLowerCase(), cat = $('pm-cat').value;
    if (!q && !cat) { map.highlight(mine ? function (o) { return String(o.n) === mine; } : null); return; }
    var fn = function (o) {
      if (cat && !(o.cat === cat)) return false;
      if (!q) return true;
      if (map.typeOf(o) === 'booth') return String(o.n).toLowerCase() === q || String(o.n2 || '').toLowerCase() === q || [o.name, o.cat, o.zone].some(function (t) { return String(t || '').toLowerCase().indexOf(q) !== -1; });
      var ic = M.ICONS[o.icon];
      return [o.text, ic && ic.label].some(function (t) { return String(t || '').toLowerCase().indexOf(q) !== -1; });
    };
    map.highlight(fn);
    var hits = doc.booths.concat(doc.items).filter(fn);
    if (hits.length && hits.length <= 12) map.fitObjects(hits, hits.length === 1 ? 70 : 30);
  }

  async function start() {
    var cached = kept();
    if (cached) show(cached);
    try {
      var r = await V.call('publicmap');
      if (r && r.map) { keep(r.map); if (!cached || JSON.stringify(cached) !== JSON.stringify(r.map)) show(r.map); }
      else if (!cached) $('pm-empty').hidden = false;
    } catch (e) {
      if (!cached) $('pm-empty').hidden = false;
    }
  }
  $('pm-q').addEventListener('input', filter);
  $('pm-cat').addEventListener('change', filter);
  $('pm-zin').onclick = function () { map && map.zoomBy(1.5); };
  $('pm-zout').onclick = function () { map && map.zoomBy(1 / 1.5); };
  $('pm-zfit').onclick = function () { map && map.fitObjects(doc.booths.concat(doc.items), 25); };
  $('pm-print').onclick = function () {
    if (!doc) return;
    M.printPoster(doc, { size: 'letter', mode: 'public', title: "Bloomin' Festival", subtitle: 'St. Bernard Abbey · April 17–18, 2027',
      names: function (b) { return b.name || ''; }, box: M.bounds(doc.booths.concat(doc.items), 25) });
  };
  start();
})();
