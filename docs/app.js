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
  rec: $('recBtn'), toast: $('toast'),
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
let nodeName = {}, adj = {}, routeId = {};
const NODE_ORDER = ['sulin', 'lackova', 'vsetinska', 'ruzbachy', 'nestville'];
const ord = s => { const i = NODE_ORDER.indexOf(s); return i < 0 ? 99 : i; };
function buildRouteGraph() {
  nodeName = {}; adj = {}; routeId = {};
  for (const t of registry) {
    const p = t.id.split('-'); if (p.length < 3) continue;   // ['mtb', from, to]
    const from = p[1], to = p[2], nm = t.name.split(' → ');
    nodeName[from] = nm[0] || from; nodeName[to] = nm[1] || to;
    (adj[from] = adj[from] || new Set()).add(to);
    (routeId[from] = routeId[from] || {})[to] = t.id;
  }
}
const opt = slug => '<option value="' + slug + '">' + escapeHtml(nodeName[slug]) + '</option>';
function fillStart() { startSel.innerHTML = Object.keys(nodeName).sort((a, b) => ord(a) - ord(b)).map(opt).join(''); }
function fillEnd(start) {
  const ends = [...(adj[start] || [])].sort((a, b) => ord(a) - ord(b)), prev = endSel.value;
  endSel.innerHTML = ends.map(opt).join('');
  endSel.value = ends.includes(prev) ? prev : ends[0];
}
function pickRoute() {
  const id = routeId[startSel.value] && routeId[startSel.value][endSel.value];
  if (id) selectTrail(id);
}
startSel.addEventListener('change', () => { fillEnd(startSel.value); pickRoute(); });
endSel.addEventListener('change', () => { pickRoute(); closePanel(); });

fetch('trails/index.json')
  .then(r => r.json())
  .then(list => {
    registry = list; buildRouteGraph(); fillStart();
    startSel.value = nodeName['sulin'] ? 'sulin' : startSel.options[0].value;
    fillEnd(startSel.value);
    if ([...(adj[startSel.value] || [])].includes('vsetinska')) endSel.value = 'vsetinska';
    pickRoute();
  })
  .catch(() => toast('Failed to load trails.'));
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function selectTrail(id) {
  const load = trailCache[id]
    ? Promise.resolve(trailCache[id])
    : fetch('trails/' + id + '.json').then(r => r.json()).then(t => (trailCache[id] = t));
  load.then(t => {
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
      + t.km.toString() + ' km · ↑' + t.asc + ' m' + (t.desc != null ? ' · ↓' + t.desc + ' m' : '') + ' · ~' + t.min + ' min' + elevTxt).addTo(trailLayer);
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

  let path = '';
  for (let i = 0; i < N; i++) path += (i ? 'L' : 'M') + xOf(i).toFixed(1) + ',' + yOf(elev[i]).toFixed(1);
  const area = path + 'L' + xOf(N - 1).toFixed(1) + ',' + (pad.t + iH) + 'L' + xOf(0).toFixed(1) + ',' + (pad.t + iH) + 'Z';

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

  elevSvg.innerHTML = ticks
    + '<path class="area" d="' + area + '"/><path class="line" d="' + path + '"/>'
    + '<line class="cross" id="elevCross" x1="0" y1="' + pad.t + '" x2="0" y2="' + (pad.t + iH) + '"/>'
    + '<circle class="cdot" id="elevDot" r="4"/><circle class="gpsdot" id="elevGps" r="5"/>';

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
    const grade = i > 0 ? (elev[i] - elev[i - 1]) / Math.max(1, dist[i] - dist[i - 1]) * 100 : 0;
    read.innerHTML = '<b>' + Math.round(elev[i]) + ' m a.s.l.</b> · ' + (dist[i] / 1000).toFixed(2)
      + ' km <span>· grade ' + (grade >= 0 ? '+' : '') + grade.toFixed(1) + ' %</span>';
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
const hoverMarker = L.circleMarker([0, 0], { radius: 6, color: '#fff', weight: 2, fillColor: '#2e7d32', fillOpacity: 1, interactive: false });

// ---------- GPS ----------
let userMarker = null, accCircle = null, watching = false, follow = true, lastHeading = null;
let track = [], trackLine = null, recording = false;

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
  const c = activeTrail.coords; let best = Infinity, bi = 0;
  for (let i = 0; i < c.length; i++) { const d = haversine(lat, lon, c[i][1], c[i][0]); if (d < best) { best = d; bi = i; } }
  return { idx: bi, dist: best };
}

els.gps.addEventListener('click', () => {
  if (watching) { closePanel(); return; }
  if (!('geolocation' in navigator)) { toast('This browser does not support GPS.'); return; }
  if (!window.isSecureContext) toast('GPS only works over HTTPS or localhost.', 8000);
  els.gpsLbl.textContent = 'Starting GPS…'; els.gps.disabled = true;
  navigator.geolocation.watchPosition(onPos, onGpsErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  acquireWake(); closePanel();
});

function onPos(pos) {
  watching = true;
  els.gpsLbl.textContent = 'GPS active'; els.gps.disabled = false; els.rec.disabled = false;
  const lat = pos.coords.latitude, lon = pos.coords.longitude, acc = pos.coords.accuracy || 0;
  const alt = pos.coords.altitude, head = pos.coords.heading;
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
    if (near.dist <= 25) {
      els.status.classList.add('inside');
      els.stL1.textContent = '✔ On trail · ' + fmtKm(remain) + ' to finish';
    } else {
      els.status.classList.remove('inside');
      els.stL1.textContent = fmtKm(near.dist) + ' from trail · ' + fmtKm(remain) + ' to finish';
    }
    if (elevState && elevState.gps) {
      const g = elevState.gps, i = near.idx;
      g.setAttribute('cx', elevState.xOf(i)); g.setAttribute('cy', elevState.yOf(elevState.elev[i])); g.setAttribute('opacity', 1);
    }
  } else {
    els.stL1.textContent = activeTrail ? activeTrail.name : 'GPS active';
  }
  els.stL2.textContent = parts.join(' · ') + (head != null && !isNaN(head) ? ' · ' + cardinal(head) + ' ' + Math.round(head) + '°' : '');
}
function onGpsErr(err) {
  els.gpsLbl.textContent = 'Start GPS'; els.gps.disabled = false; watching = false;
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
async function acquireWake() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && watching && !wakeLock) acquireWake(); });

// ---------- compass widget ----------
(function () {
  const btn = $('compassBtn'), box = $('compass'), needle = $('needle'), read = $('compassRead');
  let on = false, listening = false, lastGps = null;
  function render(heading, src) {
    const h = ((heading % 360) + 360) % 360;
    needle.style.transform = 'rotate(' + h + 'deg)';
    read.innerHTML = cardinal(h) + ' · ' + Math.round(h) + '°<small>' + src + '</small>';
    if (window.__onHeading) window.__onHeading(h, src);
  }
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
  window.__compassGps = h => { lastGps = h; if (h == null || listening) return; if (on) render(h, 'GPS heading'); };
  window.__ensureHeadingSensors = enable;
})();

// ---------- orientation: North-up <-> Heading-up ----------
(function () {
  const btn = $('orientBtn'), roseDial = $('roseDial');
  const BEARING_SIGN = -1;
  let mode = 'north', smoothed = null, target = 0, raf = 0;
  const delta = (a, b) => ((b - a + 540) % 360) - 180;
  function tick() {
    raf = 0;
    const cur = map.getBearing(), d = delta(cur, target);
    const next = Math.abs(d) < 0.4 ? target : cur + d * 0.25;
    map.setBearing(next);
    if (roseDial) roseDial.style.transform = 'rotate(' + next + 'deg)';
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
    toast('Rain radar · ' + new Date(f.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 3000);
  } catch (e) { toast('Rain radar needs a connection.', 4000); }
});

// ---------- points: water / huts / viewpoints (OSM, precached) ----------
let poiLayer = null, poisLoaded = null;
$('poiBtn').addEventListener('click', async () => {
  const btn = $('poiBtn');
  if (poiLayer) { map.removeLayer(poiLayer); poiLayer = null; btn.setAttribute('aria-pressed', 'false'); return; }
  if (!poisLoaded) { try { poisLoaded = await (await fetch('pois.json')).json(); } catch (e) { toast('Points unavailable.'); return; } }
  const LABEL = { water: 'Drinking water', spring: 'Spring', hut: 'Hut / shelter', viewpoint: 'Viewpoint', pass: 'Pass' };
  const GLY = { water: 'water', spring: 'water', hut: 'hut', viewpoint: 'view', pass: 'pass' };
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
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (!navigator.serviceWorker.controller) toast('Saving for offline use…', 4000);
    const promote = w => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) w.postMessage('skipWaiting'); });
    if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage('skipWaiting');
    reg.addEventListener('updatefound', () => promote(reg.installing));
  }).catch(() => { /* not served as PWA */ });
}
