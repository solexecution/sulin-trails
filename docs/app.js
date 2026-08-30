'use strict';
/* Sulín Trails — offline trail-navigation PWA.
   Trails are data files in ./trails/, listed in ./trails/index.json (built by build.js).
   All controls live behind one gear button in a single opaque panel. */

L.Icon.Default.imagePath = 'vendor/images/';

// ---------- map ----------
const map = L.map('map', {
  zoomControl: true, maxZoom: 20,
  rotate: true, rotateControl: false, touchRotate: true, bearing: 0,
});
map.setView([49.33, 20.66], 12);

const BASES = {
  esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 20, maxNativeZoom: 19, attribution: 'Esri World Imagery' }),
  otm: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { maxZoom: 17, subdomains: 'abc', attribution: '© OpenTopoMap (CC-BY-SA)' }),
  freemap: L.tileLayer('https://outdoor.tiles.freemap.sk/{z}/{x}/{y}',
    { maxZoom: 18, attribution: '© Freemap.sk' }),
  osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap' }),
};
let currentBase = BASES.esri.addTo(map);

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const els = {
  gps: $('gpsBtn'), gpsLbl: $('gpsBtn').querySelector('.lbl'),
  stL1: $('stL1'), stL2: $('stL2'), status: $('status'),
  rec: $('recBtn'), toast: $('toast'), routeList: $('routeList'),
};
let toastTimer = null;
function toast(msg, ms = 3500) {
  els.toast.textContent = msg; els.toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.hidden = true, ms);
}
const R = 6371000, rad = d => d * Math.PI / 180;
function haversine(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const fmtKm = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2) + ' km';
const CARD8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const cardinal = h => CARD8[Math.round(((h % 360) + 360) % 360 / 45) % 8];

// shared inline icon set (stroke, currentColor)
const ICON = {
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96 5.5 5.5 0 0 1 10.55-1.3A4 4 0 0 1 17 18H7z"/>',
  rain: '<path d="M7 15a4 4 0 0 1-.5-7.97 5 5 0 0 1 9.6-1.2A3.5 3.5 0 0 1 18 15"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  snow: '<path d="M7 15a4 4 0 0 1-.5-7.97 5 5 0 0 1 9.6-1.2A3.5 3.5 0 0 1 18 15"/><path d="M9 18v.01M12 20v.01M15 18v.01"/>',
  thunder: '<path d="M7 15a4 4 0 0 1-.5-7.97 5 5 0 0 1 9.6-1.2A3.5 3.5 0 0 1 18 15"/><path d="M12 14l-2 3.5h3L11 21"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  hut: '<path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/>',
  view: '<circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/>',
  pass: '<path d="M3 18l6-9 4 5 3-4 5 8z"/>',
  food: '<path d="M6 3v18M6 3v5a2 2 0 0 0 4 0V3"/><path d="M17 3c-2 2-2.5 5-2.5 7 0 2 1.2 3 2.5 3v8"/>',
  shop: '<path d="M6 8h12l-1.2 12H7.2L6 8z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
  bike: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  picnic: '<path d="M3 9h18M7.5 9L4.5 20M16.5 9l3 11M5.5 15h13"/>',
  castle: '<path d="M5 21V9M19 21V9M5 9V4h3v2h2V4h4v2h2V4h3v5M5 9h14M10 21v-5h4v5"/><path d="M3 21h18"/>',
  camp: '<path d="M12 4L3 20h18L12 4z"/><path d="M12 11l-4 9M12 11l4 9"/>',
};
function svgIcon(name, cls) {
  return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
}
function wxSvg(code) {
  const g = (code === 0 || code === 1) ? 'sun'
    : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow'
    : code >= 95 ? 'thunder'
    : (code >= 51) ? 'rain' : 'cloud';
  const col = g === 'sun' ? 'wx-sun' : g === 'snow' ? 'wx-snow' : (g === 'rain' || g === 'thunder') ? 'wx-rain' : 'wx-cloud';
  return svgIcon(g, col);
}

// ---------- one gear panel ----------
const gearBtn = $('gearBtn'), panel = $('panel');
function closePanel() { panel.hidden = true; gearBtn.setAttribute('aria-pressed', 'false'); }
gearBtn.addEventListener('click', () => {
  const open = panel.hidden; panel.hidden = !open; gearBtn.setAttribute('aria-pressed', String(open));
});

// base map selector
$('baseSel').addEventListener('change', e => {
  const next = BASES[e.target.value]; if (!next) return;
  map.removeLayer(currentBase); currentBase = next.addTo(map); currentBase.bringToBack();
});

// ---------- trail registry + rendering ----------
const trailLayer = L.featureGroup().addTo(map);
let activeTrail = null;
const trailCache = {};
let registry = [];

// route graph derived from the trail registry (ids are mtb-<from>-<to>)
const startSel = $('startSel'), endSel = $('endSel');
const startBtn = $('startBtn'), endBtn = $('endBtn');
let nodeName = {}, adj = {}, routeId = {}, routeWeight = {}, variants = {};
const NODE_ORDER = ['sulin', 'mnisek', 'eliasovka', 'jarabina', 'lubovna', 'vsetinska', 'lackova', 'nestville', 'ruzbachy'];
const ord = s => { const i = NODE_ORDER.indexOf(s); return i < 0 ? 99 : i; };
// Trail ids are `sourceKey-from-to` (e.g. foot-sulin-vsetinska). A from→to pair can have
// several source variants; variants[from][to] holds them all, routeId/routeWeight keep one
// representative each so multi-hop Dijkstra still works.
function buildRouteGraph() {
  nodeName = {}; adj = {}; routeId = {}; routeWeight = {}; variants = {};
  for (const t of registry) {
    const p = t.id.split('-'); if (p.length < 3) continue;   // [sourceKey, from, to]
    const from = p[1], to = p[2], nm = t.name.split(' → ');
    nodeName[from] = nm[0] || from; nodeName[to] = nm[1] || to;
    (adj[from] = adj[from] || new Set()).add(to);
    const list = ((variants[from] = variants[from] || {})[to] = (variants[from][to] || []));
    list.push(t);
    // representative = shortest variant for this pair
    if (routeWeight[from]?.[to] == null || (t.km || 10) < routeWeight[from][to]) {
      (routeId[from] = routeId[from] || {})[to] = t.id;
      (routeWeight[from] = routeWeight[from] || {})[to] = t.km || 10;
    }
  }
  // order each pair's variants most-off-road first: least paved %, then by
  // profile preference (MTB/gravel/dirt over paths), then shortest. The first
  // one is what the picker auto-selects, so the default avoids roads.
  const pavedPct = t => { const s = (t.surfaces || []).find(x => x.label === 'Paved'); return s ? s.pct : 0; };
  const srcOrd = k => { const i = SOURCE_ORDER.indexOf(k); return i < 0 ? 99 : i; };
  for (const a in variants) for (const b in variants[a])
    variants[a][b].sort((x, y) => pavedPct(x) - pavedPct(y) || srcOrd(x.sourceKey) - srcOrd(y.sourceKey) || x.km - y.km);
}
// profile preference when two variants are equally paved — MTB/gravel/dirt ahead of paths and paved
const SOURCE_ORDER = ['mtb', 'gravel', 'foot', 'trek', 'short'];
const opt = slug => '<option value="' + slug + '">' + escapeHtml(nodeName[slug]) + '</option>';
function fillStart() { startSel.innerHTML = Object.keys(nodeName).sort((a, b) => ord(a) - ord(b)).map(opt).join(''); }
function fillEnd(start) {
  const ends = Object.keys(nodeName).filter(k => k !== start).sort((a, b) => ord(a) - ord(b));
  const prev = endSel.value;
  endSel.innerHTML = ends.map(opt).join('');
  endSel.value = ends.includes(prev) ? prev : ends[0];
  syncTrigger(endSel, endBtn);
}

function findPath(start, end) {
  if (start === end) return [];
  if (routeId[start] && routeId[start][end]) return [routeId[start][end]];

  const dist = {}, prev = {};
  const nodes = Object.keys(nodeName);
  for (const n of nodes) dist[n] = Infinity;
  dist[start] = 0;
  const unvisited = new Set(nodes);

  while (unvisited.size > 0) {
    let u = null, minD = Infinity;
    for (const n of unvisited) {
      if (dist[n] < minD) { minD = dist[n]; u = n; }
    }
    if (u === null || u === end || dist[u] === Infinity) break;
    unvisited.delete(u);

    for (const v of (adj[u] || [])) {
      if (!unvisited.has(v)) continue;
      const w = (routeWeight[u] && routeWeight[u][v]) || 10;
      const alt = dist[u] + w;
      if (alt < dist[v]) { dist[v] = alt; prev[v] = u; }
    }
  }

  if (dist[end] === Infinity) return [];
  const nodePath = [];
  let curr = end;
  while (curr) { nodePath.unshift(curr); curr = prev[curr]; }
  const trailIds = [];
  for (let i = 0; i < nodePath.length - 1; i++) {
    trailIds.push(routeId[nodePath[i]][nodePath[i + 1]]);
  }
  return trailIds;
}

const cumDistCalc = c => {
  const d = [0];
  for (let i = 1; i < c.length; i++) {
    d[i] = d[i - 1] + haversine(c[i - 1][1], c[i - 1][0], c[i][1], c[i][0]);
  }
  return d.map(x => Math.round(x * 10) / 10);
};

function stitchTrailSegments(segments) {
  let combinedCoords = [];
  let combinedAsc = 0, combinedDesc = 0, combinedMin = 0;
  let elevMin = Infinity, elevMax = -Infinity;
  let color = segments[0].color;
  let viaNames = [];

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    combinedAsc += s.asc;
    combinedDesc += (s.desc != null ? s.desc : 0);
    combinedMin += s.min;
    if (s.elevMin != null) elevMin = Math.min(elevMin, s.elevMin);
    if (s.elevMax != null) elevMax = Math.max(elevMax, s.elevMax);
    if (i > 0 && i < segments.length) viaNames.push(s.start.name);

    const c = s.coords;
    if (i === 0) {
      combinedCoords = combinedCoords.concat(c);
    } else {
      combinedCoords = combinedCoords.concat(c.slice(1));
    }
  }

  const first = segments[0], last = segments[segments.length - 1];
  const viaStr = viaNames.length ? ' (via ' + viaNames.join(', ') + ')' : '';
  const name = first.start.name + ' → ' + last.end.name + viaStr;
  const dist = cumDistCalc(combinedCoords);
  const totalM = dist[dist.length - 1] || 0;
  const km = Math.round(totalM / 100) / 10;

  return {
    id: `multi-${first.start.name}-${last.end.name}`,
    name,
    region: first.region,
    type: first.type,
    color,
    km,
    asc: Math.round(combinedAsc),
    desc: Math.round(combinedDesc),
    min: Math.round(combinedMin),
    elevMin: elevMin === Infinity ? null : Math.round(elevMin * 10) / 10,
    elevMax: elevMax === -Infinity ? null : Math.round(elevMax * 10) / 10,
    start: first.start,
    end: last.end,
    coords: combinedCoords,
    dist,
  };
}

// ---------- multi-source route selection (list + draw all) ----------
let routeSet = [];            // [{ meta, trail|null }] candidate routes for the current pair
let selectedRouteId = null;
const loadTrail = id => trailCache[id]
  ? Promise.resolve(trailCache[id])
  : fetch('trails/' + id + '.json').then(r => r.json()).then(t => (trailCache[id] = t));

// Ride time riding with kids (see gen-all.js for the pace model). Shown as
// "~2h30" / "~45 min" so long family rides read at a glance.
function fmtDur(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? '~' + h + 'h' + (m ? String(m).padStart(2, '0') : '') : '~' + m + ' min';
}

// ---------- incline (slope) colouring ----------
// Slope % → colour: warm ramp for climbs (steeper = redder), green flat, cool
// blue for descents. Shared by the map trail line and the elevation profile so
// the two always read the same. Bands are ordered high→low.
const GRADE_BANDS = [
  { min: 15, color: '#7f1d1d', label: '≥15%' },   // brutal climb — pushing
  { min: 10, color: '#dc2626', label: '10–15%' }, // steep
  { min: 6,  color: '#f97316', label: '6–10%' },  // moderate
  { min: 3,  color: '#eab308', label: '3–6%' },   // gentle climb
  { min: -3, color: '#22c55e', label: 'flat' },   // flat / rolling
  { min: -8, color: '#38bdf8', label: 'descent' },// gentle descent
  { min: -Infinity, color: '#2563eb', label: '' },// steep descent
];
function gradeColor(pct) { for (const b of GRADE_BANDS) if (pct >= b.min) return b.color; return '#2563eb'; }
// Signed grade % at point i, measured over a ~win-metre window so DEM noise
// doesn't make the colour flicker point-to-point.
function gradeAt(dist, elev, i, win) {
  const N = dist.length; let a = i, b = i;
  while (a > 0 && dist[i] - dist[a] < win / 2) a--;
  while (b < N - 1 && dist[b] - dist[i] < win / 2) b++;
  const dd = dist[b] - dist[a];
  return dd > 0 ? (elev[b] - elev[a]) / dd * 100 : 0;
}
// Split the track into maximal runs of one colour band; adjacent runs share the
// boundary index so drawn segments join up.
function gradeRuns(dist, elev, win = 40) {
  const N = dist.length, runs = []; let start = 0, cur = gradeColor(gradeAt(dist, elev, 0, win));
  for (let i = 1; i < N; i++) {
    const col = gradeColor(gradeAt(dist, elev, i, win));
    if (col !== cur) { runs.push({ from: start, to: i, color: cur }); start = i; cur = col; }
  }
  runs.push({ from: start, to: N - 1, color: cur });
  return runs;
}
function hasElev(t) { return t && t.coords && t.coords.length > 2 && t.coords[0].length > 2 && t.elevMin != null; }

function surfaceBar(surfaces) {
  if (!surfaces || !surfaces.length) return '';
  return '<span class="sfbar">' + surfaces.map(s =>
    '<span class="sf sf-' + s.label.toLowerCase() + '" style="width:' + s.pct + '%" title="' + s.label + ' ' + s.pct + '%"></span>'
  ).join('') + '</span>';
}
const surfaceText = surfaces => (surfaces || []).map(s => s.label + ' ' + s.pct + '%').join(' · ');

function renderRouteList() {
  const box = els.routeList;
  if (routeSet.length < 1) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = '<div class="rt-hd">' + routeSet.length + ' route' + (routeSet.length > 1 ? 's' : '') + ' · tap to pick</div>'
    + routeSet.map(r => {
      const m = r.meta, sel = m.id === selectedRouteId;
      return '<button type="button" class="rt' + (sel ? ' sel' : '') + '" data-id="' + m.id + '">'
        + '<span class="rt-sw" style="background:' + (m.color || '#888') + '"></span>'
        + '<span class="rt-main">'
        + '<span class="rt-top"><b>' + escapeHtml(m.source || 'Route') + '</b>'
        + '<span class="rt-stat">' + m.km + ' km · ↑' + m.asc + ' m' + (m.min != null ? ' · ' + fmtDur(m.min) : '') + '</span></span>'
        + surfaceBar(m.surfaces)
        + (surfaceText(m.surfaces) ? '<span class="rt-surf">' + surfaceText(m.surfaces) + '</span>' : '')
        + '</span></button>';
    }).join('');
  box.querySelectorAll('.rt').forEach(b => b.addEventListener('click', () => chooseRoute(b.dataset.id, false)));
}

function drawRoutes(fit) {
  trailLayer.clearLayers();
  // faint dashed line for every non-selected candidate
  for (const r of routeSet) {
    if (!r.trail || r.meta.id === selectedRouteId) continue;
    L.polyline(r.trail.coords.map(c => [c[1], c[0]]), { color: r.meta.color || '#888', weight: 3, opacity: 0.45, dashArray: '3 6' })
      .on('click', () => chooseRoute(r.meta.id, false)).addTo(trailLayer);
  }
  // bold selected line on top, with halo, popup and end markers
  const sel = routeSet.find(r => r.meta.id === selectedRouteId);
  if (sel && sel.trail) {
    const t = sel.trail, line = t.coords.map(c => [c[1], c[0]]);
    L.polyline(line, { color: '#fff', weight: 7, opacity: 0.6 }).addTo(trailLayer);
    const elevTxt = (t.elevMin != null) ? '<br>' + Math.round(t.elevMin) + '–' + Math.round(t.elevMax) + ' m a.s.l.' : '';
    const surf = surfaceText(t.surfaces) ? '<br>' + surfaceText(t.surfaces) : '';
    const popupHtml = '<b>' + escapeHtml(t.name) + '</b><br>' + (t.source ? escapeHtml(t.source) + ' · ' : '')
      + t.km + ' km · ↑' + t.asc + ' m' + (t.desc != null ? ' · ↓' + t.desc + ' m' : '') + ' · ' + fmtDur(t.min) + surf + elevTxt;
    if (hasElev(t)) {
      // colour the line by slope, one polyline per grade-band run
      for (const run of gradeRuns(t.dist, t.coords.map(c => c[2])))
        L.polyline(line.slice(run.from, run.to + 1), { color: run.color, weight: 4, opacity: 0.98 })
          .bindPopup(popupHtml).addTo(trailLayer);
    } else {
      L.polyline(line, { color: t.color, weight: 4, opacity: 0.97 }).bindPopup(popupHtml).addTo(trailLayer);
    }
    [['start', t.start], ['end', t.end]].forEach(([role, pt]) => {
      if (!pt) return;
      const el = pt.elev != null ? ' · ' + Math.round(pt.elev) + ' m' : '';
      L.circleMarker([pt.lat, pt.lon], { radius: 6, color: '#fff', weight: 2, fillColor: role === 'start' ? '#16a34a' : '#ef4444', fillOpacity: 1 }).addTo(trailLayer);
      L.marker([pt.lat - 0.0004, pt.lon], { icon: L.divIcon({ className: 'pin-label ' + role, html: escapeHtml(pt.name) + el, iconSize: null }) }).addTo(trailLayer);
    });
  }
  if (fit && trailLayer.getLayers().length) { if (map.getBearing()) map.setBearing(0); map.fitBounds(trailLayer.getBounds().pad(0.12)); }
}

function chooseRoute(id, fit) {
  const r = routeSet.find(x => x.meta.id === id); if (!r) return;
  selectedRouteId = id;
  const apply = t => {
    if (activeTrail !== t) resetAlertState(); // don't carry off-track state onto a new route
    activeTrail = t; drawRoutes(fit); buildElevation(t);
    els.stL1.textContent = t.name;
    els.stL2.textContent = (t.source ? t.source + ' · ' : '') + t.km + ' km · ↑' + t.asc + ' m'
      + (t.min != null ? ' · ' + fmtDur(t.min) : '')
      + (surfaceText(t.surfaces) ? ' · ' + surfaceText(t.surfaces) : '');
    loadWeatherFor(t); renderRouteList();
  };
  if (r.trail) apply(r.trail);
  else loadTrail(r.meta.id).then(t => { r.trail = t; apply(t); }).catch(() => toast('Failed to load the route.'));
}

function selectRoute(start, end) {
  if (start === end) return;

  // Direct pair with one or more source variants → list them all.
  if (variants[start] && variants[start][end]) {
    routeSet = variants[start][end].map(m => ({ meta: m, trail: trailCache[m.id] || null }));
    if (!routeSet.some(r => r.meta.id === selectedRouteId)) selectedRouteId = routeSet[0].meta.id;
    renderRouteList();
    Promise.all(routeSet.map(r => r.trail ? Promise.resolve(r.trail) : loadTrail(r.meta.id).then(t => (r.trail = t))))
      .then(() => chooseRoute(selectedRouteId, true))
      .catch(() => toast('Failed to load routes.'));
    return;
  }

  // No direct pair → stitch a multi-hop path into a single synthetic route.
  const pathIds = findPath(start, end);
  if (!pathIds.length) { toast('No route available.'); routeSet = []; renderRouteList(); trailLayer.clearLayers(); return; }
  Promise.all(pathIds.map(loadTrail)).then(segments => {
    const stitched = stitchTrailSegments(segments);
    stitched.source = 'Route'; stitched.surfaces = [];
    trailCache[stitched.id] = stitched;
    routeSet = [{ meta: { id: stitched.id, source: 'Route', km: stitched.km, asc: stitched.asc, color: stitched.color, surfaces: [] }, trail: stitched }];
    selectedRouteId = stitched.id;
    chooseRoute(stitched.id, true);
  }).catch(() => toast('Failed to load route.'));
}

function pickRoute() {
  selectRoute(startSel.value, endSel.value);
}
startSel.addEventListener('change', () => { fillEnd(startSel.value); pickRoute(); });
endSel.addEventListener('change', () => { pickRoute(); closePanel(); });

fetch('trails/index.json')
  .then(r => r.json())
  .then(list => {
    registry = list; buildRouteGraph(); fillStart();
    startSel.value = nodeName['sulin'] ? 'sulin' : startSel.options[0].value;
    fillEnd(startSel.value);
    if (nodeName['vsetinska']) endSel.value = 'vsetinska';
    syncTrigger(startSel, startBtn); syncTrigger(endSel, endBtn);
    pickRoute();
  })
  .catch(() => toast('Failed to load trails.'));
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- custom opaque option picker (replaces native <select> popups) ----------
const pickOverlay = $('pickOverlay'), pickList = $('pickList'), pickTitle = $('pickTitle');
let pickSel = null, pickBtn = null;
function syncTrigger(sel, btn) {
  if (!sel || !btn) return;
  const o = sel.options[sel.selectedIndex];
  btn.textContent = o ? o.textContent : '';
  btn.disabled = sel.disabled || sel.options.length === 0;
}
function closePicker() { pickOverlay.hidden = true; pickSel = null; pickBtn = null; }
function openPicker(sel, btn, title) {
  if (btn.disabled) return;
  pickSel = sel; pickBtn = btn; pickTitle.textContent = title;
  pickList.innerHTML = '';
  for (const o of sel.options) {
    const row = document.createElement('button');
    row.type = 'button'; row.className = 'pk-opt'; row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', o.value === sel.value ? 'true' : 'false');
    const lbl = document.createElement('span'); lbl.className = 'pk-lbl'; lbl.textContent = o.textContent;
    const rad = document.createElement('span'); rad.className = 'pk-radio';
    row.append(lbl, rad);
    row.addEventListener('click', () => {
      if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      syncTrigger(sel, btn); closePicker();
    });
    pickList.appendChild(row);
  }
  pickOverlay.hidden = false;
}
function wirePicker(sel, btn, title) {
  btn.addEventListener('click', () => openPicker(sel, btn, title));
  sel.addEventListener('change', () => syncTrigger(sel, btn));
  syncTrigger(sel, btn);
}
pickOverlay.addEventListener('click', e => { if (e.target === pickOverlay) closePicker(); });
$('pickClose').addEventListener('click', closePicker);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pickOverlay.hidden) closePicker(); });
wirePicker(startSel, startBtn, 'Start point');
wirePicker(endSel, endBtn, 'End point');
wirePicker($('baseSel'), $('baseBtn'), 'Base map');

function selectTrail(id) {
  const load = trailCache[id]
    ? Promise.resolve(trailCache[id])
    : fetch('trails/' + id + '.json').then(r => r.json()).then(t => (trailCache[id] = t));
  load.then(t => {
    if (activeTrail !== t) resetAlertState();
    activeTrail = t; drawTrail(t); buildElevation(t);
    els.stL1.textContent = t.name; els.stL2.textContent = t.region + ' · ' + t.km.toString() + ' km · ↑' + t.asc + ' m';
    loadWeatherFor(t);
  }).catch(() => toast('Failed to load the trail.'));
}

function drawTrail(t) {
  trailLayer.clearLayers();
  const line = t.coords.map(c => [c[1], c[0]]);
  L.polyline(line, { color: '#fff', weight: 7, opacity: 0.6 }).addTo(trailLayer);
  const elevTxt = (t.elevMin != null) ? '<br>' + Math.round(t.elevMin) + '–' + Math.round(t.elevMax) + ' m a.s.l.' : '';
  L.polyline(line, { color: t.color, weight: 4, opacity: 0.97 })
    .bindPopup('<b>' + escapeHtml(t.name) + '</b><br>' + t.region + '<br>'
      + t.km.toString() + ' km · ↑' + t.asc + ' m' + (t.desc != null ? ' · ↓' + t.desc + ' m' : '') + ' · ' + fmtDur(t.min) + elevTxt).addTo(trailLayer);
  [['start', t.start], ['end', t.end]].forEach(([role, pt]) => {
    if (!pt) return;
    const el = pt.elev != null ? ' · ' + Math.round(pt.elev) + ' m' : '';
    L.circleMarker([pt.lat, pt.lon], { radius: 6, color: '#fff', weight: 2, fillColor: role === 'start' ? '#16a34a' : '#ef4444', fillOpacity: 1 }).addTo(trailLayer);
    L.marker([pt.lat - 0.0004, pt.lon], { icon: L.divIcon({ className: 'pin-label ' + role, html: escapeHtml(pt.name) + el, iconSize: null }) }).addTo(trailLayer);
  });
  if (map.getBearing()) map.setBearing(0);
  map.fitBounds(trailLayer.getBounds().pad(0.12));
}

// ---------- elevation profile (opaque, toggled) ----------
const elevPanel = $('elevPanel'), elevSvg = $('elevSvg'), elevToggle = $('elevToggle');
let elevState = null, elevWanted = false;
function refreshElev() { elevPanel.hidden = !(elevWanted && elevState); }
elevToggle.addEventListener('click', () => {
  elevWanted = !elevWanted; elevToggle.setAttribute('aria-pressed', String(elevWanted));
  if (elevWanted && !elevState) toast('This trail has no elevation data.');
  refreshElev();
});
$('elevClose').addEventListener('click', () => { elevWanted = false; elevToggle.setAttribute('aria-pressed', 'false'); refreshElev(); });

function buildElevation(t) {
  elevState = null;
  if (!t.dist || !t.coords.length || t.coords[0].length < 3 || t.elevMin == null) { refreshElev(); return; }
  const read = $('elevRead'), meta = $('elevMeta'), title = $('elevTitle');
  title.textContent = t.name;
  meta.textContent = t.km.toString() + ' km · ' + Math.round(t.elevMin) + '–' + Math.round(t.elevMax)
    + ' m · ↑' + t.asc + (t.desc != null ? ' / ↓' + t.desc : '') + ' m';

  const N = t.coords.length, elev = t.coords.map(c => c[2]), dist = t.dist;
  const totalM = dist[N - 1] || t.km * 1000, eMin = t.elevMin, eMax = t.elevMax;
  const pad = { l: 36, r: 10, t: 10, b: 22 }, W = 640, H = 110;
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const xOf = i => pad.l + (dist[i] / totalM) * iW;
  const yOf = e => pad.t + (1 - (e - eMin) / Math.max(1, eMax - eMin)) * iH;

  // slope-coloured profile: one filled slab + top stroke per grade-band run,
  // so the incline reads straight off the colour (matches the map line).
  const baseY = pad.t + iH;
  let slopeSvg = '';
  for (const run of gradeRuns(dist, elev)) {
    let top = '';
    for (let i = run.from; i <= run.to; i++) top += (i === run.from ? 'M' : 'L') + xOf(i).toFixed(1) + ',' + yOf(elev[i]).toFixed(1);
    const poly = top + 'L' + xOf(run.to).toFixed(1) + ',' + baseY + 'L' + xOf(run.from).toFixed(1) + ',' + baseY + 'Z';
    slopeSvg += '<path d="' + poly + '" fill="' + run.color + '" fill-opacity="0.42" stroke="none"/>'
      + '<path d="' + top + '" fill="none" stroke="' + run.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  }

  let ticks = '';
  [eMin, (eMin + eMax) / 2, eMax].map(Math.round).forEach(tk => {
    const y = yOf(tk);
    ticks += '<line class="grid" x1="' + pad.l + '" y1="' + y + '" x2="' + (W - pad.r) + '" y2="' + y + '"/>'
      + '<text class="tick" x="' + (pad.l - 4) + '" y="' + (y + 3) + '" text-anchor="end">' + tk + '</text>';
  });
  const kmMax = Math.floor(totalM / 1000), step = kmMax > 12 ? 2 : 1;
  for (let k = 0; k <= kmMax; k += step)
    ticks += '<text class="tick" x="' + (pad.l + (k * 1000 / totalM) * iW) + '" y="' + (H - 4) + '" text-anchor="middle">' + k + '</text>';
  ticks += '<text class="tick" x="' + (W - pad.r) + '" y="' + (H - 4) + '" text-anchor="end">km</text>';

  elevSvg.innerHTML = ticks + slopeSvg
    + '<line class="cross" id="elevCross" x1="0" y1="' + pad.t + '" x2="0" y2="' + (pad.t + iH) + '"/>'
    + '<circle class="cdot" id="elevDot" r="4"/><circle class="gpsdot" id="elevGps" r="5"/>';
  buildGradeLegend();

  const cross = $('elevCross'), dot = $('elevDot');
  elevState = { dist, elev, xOf, yOf, N, gps: $('elevGps') };
  refreshElev();

  function nearestIdx(clientX) {
    const rect = elevSvg.getBoundingClientRect();
    const target = Math.max(0, Math.min(1, ((clientX - rect.left) / rect.width * W - pad.l) / iW)) * totalM;
    let lo = 0, hi = N - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (dist[mid] < target) lo = mid + 1; else hi = mid; }
    return (lo > 0 && Math.abs(dist[lo - 1] - target) < Math.abs(dist[lo] - target)) ? lo - 1 : lo;
  }
  function showAt(i) {
    const x = xOf(i), y = yOf(elev[i]);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', 1);
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('opacity', 1);
    const grade = gradeAt(dist, elev, i, 40);
    read.innerHTML = '<b>' + Math.round(elev[i]) + ' m a.s.l.</b> · ' + (dist[i] / 1000).toFixed(2)
      + ' km <span>· grade </span><b style="color:' + gradeColor(grade) + '">' + (grade >= 0 ? '+' : '') + grade.toFixed(1) + ' %</b>';
    const c = activeTrail.coords[i];
    hoverMarker.setLatLng([c[1], c[0]]); if (!map.hasLayer(hoverMarker)) hoverMarker.addTo(map);
  }
  function hideHover() {
    cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0);
    read.textContent = 'Drag along the profile';
    if (map.hasLayer(hoverMarker)) map.removeLayer(hoverMarker);
  }
  elevSvg.onpointermove = e => { e.preventDefault(); showAt(nearestIdx(e.clientX)); };
  elevSvg.onpointerdown = e => showAt(nearestIdx(e.clientX));
  elevSvg.onpointerleave = hideHover;
}
// One-time colour legend under the profile (steep climb → flat → descent).
function buildGradeLegend() {
  const el = $('elevLegend'); if (!el || el.dataset.built) return;
  el.innerHTML = GRADE_BANDS.filter(b => b.label).map(b =>
    '<span class="lg"><i style="background:' + b.color + '"></i>' + b.label + '</span>').join('');
  el.dataset.built = '1';
}
const hoverMarker = L.circleMarker([0, 0], { radius: 6, color: '#fff', weight: 2, fillColor: '#2e7d32', fillOpacity: 1, interactive: false });

// ---------- GPS ----------
let userMarker = null, accCircle = null, watching = false, follow = true, lastHeading = null;
let track = [], trackLine = null, recording = false, geoWatchId = null;
let lastFixLat = null, lastFixLon = null; // last GPS position (compass trail-arrow)

function userGlyphHtml() {
  return '<svg width="28" height="28" viewBox="0 0 28 28">'
    + '<path class="user-cone" d="M14 1 L21 13 A8 8 0 0 0 7 13 Z" fill="rgba(198,40,40,0.4)" opacity="0"/>'
    + '<circle cx="14" cy="14" r="6" fill="#c62828" stroke="#fff" stroke-width="2.5"/></svg>';
}
function updateCone() {
  if (!userMarker) return;
  const el = userMarker.getElement(); if (!el) return;
  const cone = el.querySelector('.user-cone'); if (!cone) return;
  if (lastHeading == null) { cone.setAttribute('opacity', 0); return; }
  cone.setAttribute('opacity', 1);
  cone.style.transform = 'rotate(' + (lastHeading + map.getBearing()) + 'deg)';
}

function nearestOnTrail(lat, lon) {
  if (!activeTrail) return null;
  const c = activeTrail.coords;
  if (!c || c.length < 2) return null;
  // Point-to-segment distance in a local equirectangular projection — vertex-only
  // distance can overshoot by half the vertex spacing, which matters vs a 40 m alarm.
  const kx = Math.cos(rad(lat)) * 111320, ky = 110540; // metres per degree of lon / lat
  const px = lon * kx, py = lat * ky;
  let best = Infinity, bi = 0;
  for (let i = 0; i < c.length - 1; i++) {
    const ax = c[i][0] * kx, ay = c[i][1] * ky;
    const bx = c[i + 1][0] * kx, by = c[i + 1][1] * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx - px, qy = ay + t * dy - py;
    const d2 = qx * qx + qy * qy;
    if (d2 < best) { best = d2; bi = t > 0.5 ? i + 1 : i; }
  }
  return { idx: bi, dist: Math.sqrt(best) };
}

els.gps.addEventListener('click', () => {
  if (watching) { closePanel(); return; }
  if (!('geolocation' in navigator)) { toast('This browser does not support GPS.'); return; }
  if (!window.isSecureContext) toast('GPS only works over HTTPS or localhost.', 8000);
  els.gpsLbl.textContent = 'Starting GPS…'; els.gps.disabled = true;
  if (geoWatchId != null) navigator.geolocation.clearWatch(geoWatchId); // never stack two watches
  geoWatchId = navigator.geolocation.watchPosition(onPos, onGpsErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  ensureAudio(); // user gesture: unlock beeps + speech for later pocket alerts
  startKeepAlive(); // keep tracking + off-track alerts alive with the screen off
  acquireWake(); closePanel();
  toast('Tracking will keep running with the screen off.', 4500);
});

function onPos(pos) {
  watching = true;
  lastFixAt = Date.now();
  if (gpsLost) { gpsLost = false; beep([523, 784], 0.15, 0.6); setTimeout(() => speak('GPS signal back'), 400); }
  els.gpsLbl.textContent = 'GPS active'; els.gps.disabled = false; els.rec.disabled = false;
  const lat = pos.coords.latitude, lon = pos.coords.longitude, acc = pos.coords.accuracy || 0;
  const alt = pos.coords.altitude, head = pos.coords.heading;
  lastFixLat = lat; lastFixLon = lon;
  if (window.__compassFix) window.__compassFix();
  if (head != null && !isNaN(head)) { lastHeading = head; if (window.__onHeading) window.__onHeading(((head % 360) + 360) % 360, 'GPS heading'); }

  if (!userMarker) {
    accCircle = L.circle([lat, lon], { radius: acc, color: '#c62828', weight: 1, fillColor: '#c62828', fillOpacity: 0.12, interactive: false }).addTo(map);
    userMarker = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: userGlyphHtml(), iconSize: [28, 28], iconAnchor: [14, 14] }), interactive: false, keyboard: false }).addTo(map);
    map.setView([lat, lon], Math.max(map.getZoom(), 16));
  } else {
    userMarker.setLatLng([lat, lon]); accCircle.setLatLng([lat, lon]).setRadius(acc);
    if (follow) map.panTo([lat, lon], { animate: true });
  }
  updateCone();
  if (recording) addTrackPoint(lat, lon, alt);

  const near = nearestOnTrail(lat, lon);
  const parts = [];
  if (alt != null) parts.push(Math.round(alt) + ' m a.s.l.');
  parts.push('±' + Math.round(acc) + ' m');
  if (near && activeTrail.dist) {
    const remain = (activeTrail.dist[activeTrail.dist.length - 1] || 0) - activeTrail.dist[near.idx];
    trackAlert(near.dist, acc); // update off-track state first so the texts below reflect it
    if (near.dist <= 25) {
      els.status.classList.add('inside');
      els.stL1.textContent = '✔ On trail · ' + fmtKm(remain) + ' to finish';
      pocketSetStatus('✓ ON TRACK\n' + fmtKm(remain) + ' to go', false);
    } else {
      els.status.classList.remove('inside');
      els.stL1.textContent = fmtKm(near.dist) + ' from trail · ' + fmtKm(remain) + ' to finish';
      pocketSetStatus((offTrack ? 'OFF TRACK\n' : '') + fmtKm(near.dist) + ' from route', offTrack);
    }
    if (elevState && elevState.gps) {
      const g = elevState.gps, i = near.idx;
      g.setAttribute('cx', elevState.xOf(i)); g.setAttribute('cy', elevState.yOf(elevState.elev[i])); g.setAttribute('opacity', 1);
    }
  } else {
    els.stL1.textContent = activeTrail ? activeTrail.name : 'GPS active';
    pocketSetStatus('GPS active', false);
  }
  els.stL2.textContent = parts.join(' · ') + (head != null && !isNaN(head) ? ' · ' + cardinal(head) + ' ' + Math.round(head) + '°' : '');
}
function onGpsErr(err) {
  if (err.code === 3) {
    // timeout: the watch is still alive and fixes may resume — announce, don't tear down
    announceGpsLost('GPS LOST\nno signal');
    toast('GPS signal lost — still searching…', 6000);
    return;
  }
  els.gpsLbl.textContent = 'Start GPS'; els.gps.disabled = false; watching = false;
  if (pocketOverlay.hidden) stopKeepAlive(); // tracking is dead and not in pocket mode — release audio
  announceGpsLost(err.code === 1 ? 'GPS LOST\nlocation denied' : 'GPS LOST\nno signal');
  toast(err.code === 1 ? 'Location access denied. Enable location and try again.' : 'GPS error: ' + err.message, 8000);
}
map.on('dragstart', () => { follow = false; });
map.on('dblclick', () => { follow = true; if (userMarker) map.panTo(userMarker.getLatLng()); });

// ---------- record ride + GPX ----------
function addTrackPoint(lat, lon, ele) {
  const last = track[track.length - 1];
  if (last && haversine(last[0], last[1], lat, lon) < 3) return;
  track.push([lat, lon, ele, Date.now()]);
  const line = track.map(p => [p[0], p[1]]);
  if (!trackLine) trackLine = L.polyline(line, { color: '#c62828', weight: 3, dashArray: '5 4', opacity: 0.9 }).addTo(map);
  else trackLine.setLatLngs(line);
}
els.rec.addEventListener('click', () => {
  if (els.rec.disabled) return;
  if (!recording) { recording = true; els.rec.setAttribute('aria-pressed', 'true'); toast('Recording your ride. Tap again to save a GPX.', 4000); }
  else {
    recording = false; els.rec.setAttribute('aria-pressed', 'false');
    if (track.length < 2) { toast('No points to save yet.'); return; }
    exportGpx();
  }
});
function exportGpx() {
  const name = 'Sulín Trails — ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
  const seg = track.map(p => '<trkpt lat="' + p[0].toFixed(6) + '" lon="' + p[1].toFixed(6) + '">'
    + (p[2] != null ? '<ele>' + p[2].toFixed(1) + '</ele>' : '') + '<time>' + new Date(p[3]).toISOString() + '</time></trkpt>').join('');
  const gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Sulin Trails" xmlns="http://www.topografix.com/GPX/1/1">'
    + '<trk><name>' + escapeHtml(name) + '</name><trkseg>' + seg + '</trkseg></trk></gpx>';
  const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'ride-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.gpx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('GPX saved (' + track.length + ' points).', 4000);
}

// ---------- screen wake lock ----------
let wakeLock = null;
async function acquireWake() {
  try {
    if (!('wakeLock' in navigator)) return;
    wakeLock = await navigator.wakeLock.request('screen');
    // The OS can release the lock at any time (tab hidden, battery saver) — null the
    // sentinel so the visibilitychange re-acquisition below actually fires.
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !wakeLock && (watching || !pocketOverlay.hidden)) acquireWake();
});

// ---------- off-track voice / sound alerts ----------
// Off when > OFF_M from the route for OFF_FIXES consecutive good fixes; back when < ON_M
// (two thresholds so it doesn't flap at the boundary). Fixes with accuracy worse than
// ACC_MAX_M are ignored — forest-canopy GPS noise must not trigger false alarms.
const OFF_M = 40, ON_M = 25, OFF_FIXES = 3, REMIND_MS = 25000, ACC_MAX_M = 60;
let alertsOn = localStorage.getItem('voiceAlerts') !== 'off';
let audioCtx = null, offTrack = false, offCount = 0, lastRemind = 0;
let lastFixAt = 0, gpsLost = false;
const voiceBtn = $('voiceBtn');

function resetAlertState() { offTrack = false; offCount = 0; lastRemind = 0; }

// GPS-loss announcer: pocket text goes red immediately; sound fires once per outage.
function announceGpsLost(msg) {
  pocketSetStatus(msg, true);
  if (gpsLost) return;
  gpsLost = true;
  if (alertsOn) {
    beep([440, 440, 440], 0.3, 0.85);
    if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
    setTimeout(() => speak('G P S signal lost'), 900);
  }
}
// Watchdog: Android can simply stop delivering fixes with no error callback (canopy,
// power saving). No fix for 30 s while watching => audible warning + red pocket status.
setInterval(() => {
  if (watching && lastFixAt && Date.now() - lastFixAt > 30000)
    announceGpsLost('GPS LOST\nno fix for ' + Math.round((Date.now() - lastFixAt) / 1000) + ' s');
}, 5000);

function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* no audio */ }
  // warm speech synthesis inside the user gesture so later pocket announcements work
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) { /* ignore */ }
}

// ---------- background keep-alive (run with the screen off) ----------
// A foreground page is frozen when the screen locks, which stops GPS fixes and
// the off-track watchdog. While media is *playing*, the browser keeps the tab
// alive in the background — so we loop a silent clip for the whole GPS session.
// Must be started from a user gesture (GPS-start / pocket), like any autoplay.
let keepAudio = null, keepUrl = null;
function silentWavUrl(seconds = 2, rate = 8000) {
  const n = seconds * rate, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * 2, true); // samples stay zero = silence
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function startKeepAlive() {
  try {
    if (!keepAudio) {
      keepUrl = silentWavUrl();
      keepAudio = new Audio(keepUrl);
      keepAudio.loop = true; keepAudio.volume = 0.02; // silent content; nonzero so it isn't culled as muted
      keepAudio.setAttribute('playsinline', '');
      // OS may pause it (audio-focus loss); resume while we're still navigating.
      keepAudio.addEventListener('pause', () => { if (watching || !pocketOverlay.hidden) setTimeout(() => keepAudio.play().catch(() => {}), 400); });
    }
    keepAudio.play().catch(() => {});
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: 'Sulín Trails', artist: 'Navigating — off-track alerts on' });
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.setActionHandler('pause', () => {}); // ignore lock-screen pause so tracking continues
        navigator.mediaSession.setActionHandler('play', () => { keepAudio && keepAudio.play().catch(() => {}); });
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
}
function stopKeepAlive() {
  try { if (keepAudio) { keepAudio.pause(); keepAudio.currentTime = 0; } } catch (e) { /* ignore */ }
  try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'; } catch (e) { /* ignore */ }
}
// If the OS throttled the clip while hidden, kick it back on return to foreground.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && keepAudio && (watching || !pocketOverlay.hidden)) keepAudio.play().catch(() => {});
});
function beep(freqs, dur, vol) {
  if (!audioCtx) return;
  // The context suspends after phone calls / audio-focus loss — resume, then play.
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => beepNow(freqs, dur, vol)).catch(() => { /* ignore */ });
    return;
  }
  beepNow(freqs, dur, vol);
}
function beepNow(freqs, dur, vol) {
  try {
    const t0 = audioCtx.currentTime; dur = dur || 0.18; vol = vol || 0.7;
    freqs.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'square'; o.frequency.value = f;
      const at = t0 + i * (dur + 0.08);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(at); o.stop(at + dur + 0.05);
    });
  } catch (e) { /* ignore */ }
}
function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 1.05; u.volume = 1;
    // Chrome/Android drops utterances queued synchronously after cancel() — defer a beat.
    setTimeout(() => { try { speechSynthesis.speak(u); } catch (e) { /* ignore */ } }, 80);
  } catch (e) { /* ignore */ }
}
const spokenM = m => m >= 950 ? (Math.round(m / 100) / 10) + ' kilometers' : Math.max(10, Math.round(m / 10) * 10) + ' meters';
function alertOff(d, again) {
  beep([880, 660, 440], 0.22, 0.85);
  if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]);
  setTimeout(() => speak((again ? 'Still off track, ' : 'Off track, ') + spokenM(d)), 900);
}
function alertBack() {
  beep([523, 784], 0.15, 0.6);
  if (navigator.vibrate) navigator.vibrate(150);
  setTimeout(() => speak('Back on track'), 500);
}
function trackAlert(d, acc) {
  if (!alertsOn || d == null || acc > 100) return; // >100 m accuracy = garbage fix, ignore
  const now = Date.now();
  // Noise-adjusted trip distance: a 40 m deviation measured with ±50 m accuracy proves
  // nothing, so the alarm only trips when the deviation exceeds threshold + fix accuracy.
  const effOff = OFF_M + Math.min(acc, ACC_MAX_M);
  if (!offTrack) {
    if (d > effOff) { if (++offCount >= OFF_FIXES) { offTrack = true; lastRemind = now; alertOff(d, false); } }
    else offCount = 0;
  } else if (d <= ON_M) {
    offTrack = false; offCount = 0; alertBack();
  } else if (now - lastRemind >= REMIND_MS) {
    lastRemind = now; alertOff(d, true);
  }
}
function syncVoiceBtn() { voiceBtn.setAttribute('aria-pressed', String(alertsOn)); }
syncVoiceBtn();
voiceBtn.addEventListener('click', () => {
  alertsOn = !alertsOn; syncVoiceBtn();
  localStorage.setItem('voiceAlerts', alertsOn ? 'on' : 'off');
  offTrack = false; offCount = 0;
  if (alertsOn) { ensureAudio(); toast('Voice alerts on — you’ll hear a warning when off the route.', 4000); }
  else toast('Voice alerts off.');
});
$('testBtn').addEventListener('click', () => {
  ensureAudio();
  setTimeout(() => alertOff(60, false), 150);
  toast('This is the off-track alert (sample: 60 m).', 4500);
});

// ---------- pocket mode: black touch-guard overlay ----------
const pocketOverlay = $('pocketOverlay'), pocketStatus = $('pocketStatus'), pocketClock = $('pocketClock'), pocketHint = $('pocketHint');
let pocketHold = null, pocketTick = null;
function pocketSetStatus(text, off) {
  pocketStatus.textContent = text;
  pocketStatus.classList.toggle('off', !!off);
}
function openPocket() {
  pocketOverlay.hidden = false;
  pocketClock.textContent = new Date().toTimeString().slice(0, 5);
  pocketTick = setInterval(() => { pocketClock.textContent = new Date().toTimeString().slice(0, 5); }, 30000);
  if (!watching) pocketSetStatus('GPS is not running', true);
  // fullscreen hides Android's edge gestures (back swipe, notification shade pull)
  try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (e) { /* ignore */ }
  ensureAudio(); startKeepAlive(); acquireWake(); closePanel();
}
function closePocket() {
  pocketOverlay.hidden = true;
  clearInterval(pocketTick); clearTimeout(pocketHold); pocketHold = null;
  pocketHint.textContent = 'Hold 2 s to exit';
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* ignore */ }
}
$('pocketBtn').addEventListener('click', openPocket);
pocketOverlay.addEventListener('pointerdown', e => {
  e.preventDefault();
  pocketHint.textContent = 'Keep holding…';
  clearTimeout(pocketHold);
  pocketHold = setTimeout(closePocket, 2000);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
  pocketOverlay.addEventListener(ev, () => { clearTimeout(pocketHold); pocketHold = null; pocketHint.textContent = 'Hold 2 s to exit'; }));

// ---------- route GPX export (for Garmin / Komoot / OsmAnd) ----------
$('routeGpxBtn').addEventListener('click', () => {
  const t = activeTrail;
  if (!t || !t.coords || !t.coords.length) { toast('Pick a route first.'); return; }
  const seg = t.coords.map(c => '<trkpt lat="' + c[1].toFixed(6) + '" lon="' + c[0].toFixed(6) + '">'
    + (c[2] != null ? '<ele>' + (+c[2]).toFixed(1) + '</ele>' : '') + '</trkpt>').join('');
  const nm = t.name + (t.source ? ' — ' + t.source : '');
  const gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Sulin Trails" xmlns="http://www.topografix.com/GPX/1/1">'
    + '<trk><name>' + escapeHtml(nm) + '</name><trkseg>' + seg + '</trkseg></trk></gpx>';
  const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  const a = document.createElement('a');
  a.href = url; a.download = (t.id || 'route') + '.gpx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Route GPX saved — import it into Garmin Connect, Komoot or OsmAnd.', 5000);
});

// ---------- compass widget ----------
// Dial + red needle rotate to true north; the green arrow points toward the nearest
// point of the selected route ("which way back to the trail"), with a text readout.
(function () {
  const btn = $('compassBtn'), box = $('compass'), needle = $('needle'), dial = $('roseDial'),
    tArrow = $('trailArrow'), read = $('compassRead'), tRead = $('compassTrail');
  let on = false, listening = false, lastGps = null, sm = null;
  const dlt = (a, b) => ((b - a + 540) % 360) - 180;
  function bearingTo(lat1, lon1, lat2, lon2) {
    const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lon2 - lon1);
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function trailInfo(h) {
    if (lastFixLat == null || !activeTrail) { tArrow.setAttribute('opacity', 0); tRead.hidden = true; return; }
    const near = nearestOnTrail(lastFixLat, lastFixLon);
    if (!near) { tArrow.setAttribute('opacity', 0); tRead.hidden = true; return; }
    tRead.hidden = false;
    if (near.dist < 15) { tArrow.setAttribute('opacity', 0); tRead.textContent = '✓ on the trail'; return; }
    const p = activeTrail.coords[near.idx];
    const b = bearingTo(lastFixLat, lastFixLon, p[1], p[0]);
    tArrow.style.transform = 'rotate(' + (b - h) + 'deg)';
    tArrow.setAttribute('opacity', 1);
    const rel = dlt(h, b);
    const dir = Math.abs(rel) <= 20 ? 'ahead' : Math.abs(rel) >= 160 ? 'behind you' : Math.round(Math.abs(rel)) + '° ' + (rel > 0 ? 'right' : 'left');
    tRead.textContent = 'trail ' + dir + ' · ' + fmtKm(near.dist);
  }
  function render(heading, src) {
    let h = ((heading % 360) + 360) % 360;
    // shortest-path smoothing so 359°→1° doesn't spin the rose the long way round
    if (sm == null) sm = h; else sm = ((sm + dlt(sm, h) * 0.3) % 360 + 360) % 360;
    dial.style.transform = 'rotate(' + (-sm) + 'deg)';
    needle.style.transform = 'rotate(' + (-sm) + 'deg)';
    read.innerHTML = cardinal(sm) + ' · ' + Math.round(sm) + '°<small>' + src + '</small>';
    trailInfo(sm);
    if (window.__onHeading) window.__onHeading(h, src);
  }
  window.__compassFix = () => { if (!box.hidden && sm != null) trailInfo(sm); };
  function onOrient(e) {
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
    else if (e.absolute && typeof e.alpha === 'number') heading = 360 - e.alpha;
    if (heading == null) return;
    const so = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    render(heading - so, 'phone compass');
  }
  function startSensors() {
    if (listening) return; listening = true;
    if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOrient);
    window.addEventListener('deviceorientation', onOrient);
  }
  async function enable() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') { toast('Compass access denied.'); return false; }
      }
    } catch (e) { /* not iOS */ }
    startSensors(); return true;
  }
  btn.addEventListener('click', async () => {
    on = !on;
    if (on) { if (!await enable()) { on = false; return; } box.hidden = false; btn.setAttribute('aria-pressed', 'true'); if (lastGps != null) render(lastGps, 'GPS heading'); }
    else { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); }
  });
  window.__ensureHeadingSensors = enable;
})();

// ---------- orientation: North-up <-> Heading-up ----------
(function () {
  const btn = $('orientBtn');
  const BEARING_SIGN = -1;
  let mode = 'north', smoothed = null, target = 0, raf = 0;
  const delta = (a, b) => ((b - a + 540) % 360) - 180;
  function tick() {
    raf = 0;
    const cur = map.getBearing(), d = delta(cur, target);
    const next = Math.abs(d) < 0.4 ? target : cur + d * 0.25;
    map.setBearing(next);
    updateCone();
    if (Math.abs(delta(next, target)) > 0.4) raf = requestAnimationFrame(tick);
  }
  function aim(b) { target = b; if (!raf) raf = requestAnimationFrame(tick); }
  window.__onHeading = (h, src) => {
    if (h == null) return;
    lastHeading = h; updateCone();
    if (mode !== 'heading') return;
    if (smoothed == null) smoothed = h; else { smoothed += delta(smoothed, h) * 0.2; smoothed = ((smoothed % 360) + 360) % 360; }
    aim(BEARING_SIGN * smoothed); follow = true;
    if (userMarker) map.panTo(userMarker.getLatLng(), { animate: true });
  };
  async function setMode(m) {
    if (m === 'heading') {
      if (window.__ensureHeadingSensors && !await window.__ensureHeadingSensors()) return;
      mode = 'heading'; btn.setAttribute('aria-pressed', 'true'); follow = true;
      if (userMarker) map.panTo(userMarker.getLatLng());
      toast('Map now rotates to your heading. Tap again for north-up.', 4000);
    } else { mode = 'north'; btn.setAttribute('aria-pressed', 'false'); smoothed = null; aim(0); }
  }
  btn.addEventListener('click', () => setMode(mode === 'heading' ? 'north' : 'heading'));
})();

// ---------- weather (Open-Meteo — free, no key, cached for offline) ----------
const WMO = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Severe thunderstorm',
};
let wxData = null, wxExpanded = false;
async function loadWeatherFor(t) {
  const lat = t.start.lat, lon = t.start.lon, key = 'wx:' + lat.toFixed(2) + ',' + lon.toFixed(2);
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon
    + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,surface_pressure,cloud_cover,precipitation,dew_point_2m'
    + '&hourly=temperature_2m,precipitation_probability,weather_code'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max'
    + '&timezone=auto&forecast_days=10&wind_speed_unit=kmh';
  let payload = null, cached = false, ts = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    payload = await r.json();
    if (payload && payload.current) localStorage.setItem(key, JSON.stringify({ t: ts, j: payload }));
  } catch (e) {
    const s = localStorage.getItem(key);
    if (s) { const o = JSON.parse(s); payload = o.j; cached = true; ts = o.t; }
  }
  if (!payload || !payload.current) return;
  wxData = { j: payload, cached, ts };
  renderWx();
}
function renderWx() {
  if (!wxData) return;
  const j = wxData.j, c = j.current, d = j.daily, H = j.hourly;
  const hm = s => s.slice(11, 16);
  $('wxIcon').innerHTML = wxSvg(c.weather_code);
  $('wxTemp').textContent = Math.round(c.temperature_2m) + '°';
  $('wxChip').hidden = false;

  const ti = Math.max(0, d.time.indexOf(c.time.slice(0, 10)));
  const now = new Date(c.time), sr = new Date(d.sunrise[ti]), ss = new Date(d.sunset[ti]);
  let dl;
  if (now < sr) dl = 'daylight from ' + hm(d.sunrise[ti]);
  else if (now < ss) { const m = Math.round((ss - now) / 60000); dl = Math.floor(m / 60) + 'h ' + (m % 60) + 'm daylight left'; }
  else dl = 'after sunset';

  $('wxTitle').textContent = activeTrail ? activeTrail.region : 'Weather';
  $('wxAsOf').textContent = (wxData.cached ? 'cached · ' : '') + 'as of ' + hm(c.time);
  $('wxNow').innerHTML =
    '<div class="big">' + wxSvg(c.weather_code) + '<span class="t">' + Math.round(c.temperature_2m) + '°</span></div>'
    + '<div class="side">' + (WMO[c.weather_code] || '') + '<br>Feels <b>' + Math.round(c.apparent_temperature) + '°</b>'
    + ' · Wind <b>' + Math.round(c.wind_speed_10m) + '</b>–' + Math.round(c.wind_gusts_10m) + ' km/h ' + cardinal(c.wind_direction_10m)
    + '<br>Humidity <b>' + c.relative_humidity_2m + '%</b> · UV <b>' + Math.round(d.uv_index_max[ti]) + '</b></div>';
  // expanded analysis block
  const cell = (k, v) => '<div><span>' + k + '</span><b>' + v + '</b></div>';
  $('wxMore').hidden = !wxExpanded;
  $('wxMore').innerHTML = !wxExpanded ? '' : '<div class="wxgrid">'
    + cell('Pressure', Math.round(c.surface_pressure) + ' hPa')
    + cell('Cloud', Math.round(c.cloud_cover) + '%')
    + cell('Dew point', Math.round(c.dew_point_2m) + '°')
    + cell('Precip now', (c.precipitation || 0) + ' mm')
    + cell('Rain today', (d.precipitation_sum[ti] || 0).toFixed(1) + ' mm')
    + cell('Max gust', Math.round(d.wind_gusts_10m_max[ti]) + ' km/h')
    + '</div>';

  $('wxSun').innerHTML = '<span>&#9728; <b>' + hm(d.sunrise[ti]) + '</b></span><span>' + dl + '</span><span><b>' + hm(d.sunset[ti]) + '</b> &#9790;</span>';

  let start = H.time.findIndex(x => x.slice(0, 13) >= c.time.slice(0, 13)); if (start < 0) start = 0;
  let hh = '';
  for (let i = start; i < Math.min(start + 12, H.time.length); i++)
    hh += '<div class="h"><div>' + H.time[i].slice(11, 13) + '</div>' + wxSvg(H.weather_code[i])
      + '<div class="ht">' + Math.round(H.temperature_2m[i]) + '°</div>'
      + '<div class="hp">' + (H.precipitation_probability[i] >= 20 ? H.precipitation_probability[i] + '%' : '') + '</div></div>';
  $('wxHourly').innerHTML = hh;

  const days = Math.min(ti + (wxExpanded ? 10 : 3), d.time.length);
  let dd = '';
  for (let i = ti; i < days; i++) {
    const nm = i === ti ? 'Today' : i === ti + 1 ? 'Tomorrow' : new Date(d.time[i]).toLocaleDateString([], { weekday: 'short', day: 'numeric' });
    const wind = wxExpanded ? '<span class="dw">' + Math.round(d.wind_speed_10m_max[i]) + ' km/h</span>' : '';
    dd += '<div class="d">' + wxSvg(d.weather_code[i]) + '<span class="dn">' + nm + '</span>' + wind
      + '<span class="dp">' + (d.precipitation_probability_max[i] >= 20 ? d.precipitation_probability_max[i] + '%' : '') + '</span>'
      + '<span class="dt"><b>' + Math.round(d.temperature_2m_max[i]) + '°</b> <span class="mn">' + Math.round(d.temperature_2m_min[i]) + '°</span></span></div>';
  }
  $('wxDaily').innerHTML = dd;
}
$('wxChip').addEventListener('click', () => { $('wxPanel').hidden = false; $('wxChip').hidden = true; });
$('wxClose').addEventListener('click', () => { $('wxPanel').hidden = true; $('wxChip').hidden = false; });
$('wxExpand').addEventListener('click', () => { wxExpanded = !wxExpanded; $('wxExpand').setAttribute('aria-pressed', String(wxExpanded)); renderWx(); });

// ---------- rain radar (RainViewer — free) ----------
let radarLayer = null;
$('radarBtn').addEventListener('click', async () => {
  const btn = $('radarBtn');
  if (radarLayer) { map.removeLayer(radarLayer); radarLayer = null; btn.setAttribute('aria-pressed', 'false'); return; }
  try {
    const j = await (await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: AbortSignal.timeout(12000) })).json();
    const past = j.radar && j.radar.past;
    if (!past || !past.length) throw new Error('no frames');
    const f = past[past.length - 1];
    // RainViewer radar exists only to ~zoom 7; cap native zoom so Leaflet upscales
    // instead of requesting the "Zoom Level Not Supported" placeholder tiles.
    radarLayer = L.tileLayer(j.host + f.path + '/256/{z}/{x}/{y}/2/1_1.png', { opacity: 0.6, zIndex: 450, maxNativeZoom: 7, maxZoom: 20, attribution: 'RainViewer' }).addTo(map);
    btn.setAttribute('aria-pressed', 'true');
    const when = new Date(f.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // A dry sky renders fully transparent tiles, which looks broken — probe the three
    // z7 tiles covering this region and say so explicitly when there's nothing to show.
    try {
      const sizes = await Promise.all([[71, 43], [70, 43], [71, 42]].map(([x, y]) =>
        fetch(j.host + f.path + '/256/7/' + x + '/' + y + '/2/1_1.png').then(r => r.blob()).then(b => b.size).catch(() => 0)));
      if (Math.max(...sizes) < 1500) toast('Radar on (' + when + ') — no rain around right now, so nothing to see.', 6000);
      else toast('Rain radar · ' + when, 3000);
    } catch (e) { toast('Rain radar · ' + when, 3000); }
  } catch (e) { toast('Rain radar needs a connection.', 4000); }
});

// ---------- points: water / huts / viewpoints (OSM, precached) ----------
let poiLayer = null, poisLoaded = null;
$('poiBtn').addEventListener('click', async () => {
  const btn = $('poiBtn');
  if (poiLayer) { map.removeLayer(poiLayer); poiLayer = null; btn.setAttribute('aria-pressed', 'false'); return; }
  if (!poisLoaded) { try { poisLoaded = await (await fetch('pois.json')).json(); } catch (e) { toast('Points unavailable.'); return; } }
  const LABEL = {
    water: 'Drinking water', spring: 'Spring', hut: 'Hut / shelter', viewpoint: 'Viewpoint', pass: 'Pass',
    food: 'Food / pub', shop: 'Shop', bike: 'Bike service', picnic: 'Picnic spot',
    castle: 'Castle / ruins', camp: 'Campsite', waterfall: 'Waterfall',
  };
  const GLY = {
    water: 'water', spring: 'water', hut: 'hut', viewpoint: 'view', pass: 'pass',
    food: 'food', shop: 'shop', bike: 'bike', picnic: 'picnic',
    castle: 'castle', camp: 'camp', waterfall: 'water',
  };
  poiLayer = L.layerGroup();
  for (const p of poisLoaded) {
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: '<div class="poi ' + p.t + '">' + svgIcon(GLY[p.t]) + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) })
      .bindPopup('<b>' + (p.n ? escapeHtml(p.n) : LABEL[p.t]) + '</b>' + (p.n ? '<br>' + LABEL[p.t] : '')).addTo(poiLayer);
  }
  poiLayer.addTo(map); btn.setAttribute('aria-pressed', 'true');
  toast(poisLoaded.length + ' points shown', 2500);
});

// ---------- service worker ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  let reloading = false;
  // Only reload when an *existing* controller is replaced by an update.
  // On the very first install there is no controller yet, and skipWaiting()
  // would otherwise fire controllerchange and reload the page mid-use.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (!navigator.serviceWorker.controller) toast('Saving for offline use…', 4000);
    const promote = w => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) w.postMessage('skipWaiting'); });
    if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage('skipWaiting');
    reg.addEventListener('updatefound', () => promote(reg.installing));
  }).catch(() => { /* not served as PWA */ });
}
