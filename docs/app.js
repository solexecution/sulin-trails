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

const trailToggle = $('trailToggle'), trailList = $('trailList');
trailToggle.addEventListener('click', () => {
  const open = trailList.hidden; trailList.hidden = !open;
  trailToggle.setAttribute('aria-expanded', String(open));
});

fetch('trails/index.json')
  .then(r => r.json())
  .then(list => { registry = list; renderTrailList();
    const def = list.find(t => t.id === 'mtb-sulin-vsetinska') || list[0];
    if (def) selectTrail(def.id); })
  .catch(() => { trailList.textContent = 'Failed to load the trail list.'; });

function renderTrailList() {
  trailList.innerHTML = '';
  for (const t of registry) {
    const b = document.createElement('button');
    b.className = 'trail-item' + (activeTrail && activeTrail.id === t.id ? ' active' : '');
    const meta = [t.km.toString() + ' km', '↑' + t.asc + ' m', (t.desc != null ? '↓' + t.desc + ' m' : null), '~' + t.min + ' min'].filter(Boolean).join(' · ');
    b.innerHTML = '<span class="sw" style="background:' + t.color + '"></span>'
      + '<span class="ti-main"><span class="ti-name">' + escapeHtml(t.name) + '</span>'
      + '<span class="ti-meta">' + meta + '</span></span>';
    b.addEventListener('click', () => selectTrail(t.id));
    trailList.appendChild(b);
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function selectTrail(id) {
  const load = trailCache[id]
    ? Promise.resolve(trailCache[id])
    : fetch('trails/' + id + '.json').then(r => r.json()).then(t => (trailCache[id] = t));
  load.then(t => {
    activeTrail = t; drawTrail(t); buildElevation(t); renderTrailList();
    els.stL1.textContent = t.name; els.stL2.textContent = t.region + ' · ' + t.km.toString() + ' km · ↑' + t.asc + ' m';
    closePanel();
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
