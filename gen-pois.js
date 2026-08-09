// Fetches useful trail POIs (water, springs, huts/shelters, viewpoints, passes)
// for the whole region from OpenStreetMap via Overpass, into docs/pois.json.
// Precached by build.js so they work offline. Usage: node gen-pois.js
const fs = require('fs');
const path = require('path');

// region bbox covering all four points + trails (s, w, n, e)
const BBOX = [49.275, 20.545, 49.378, 20.765];
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function classify(t) {
  if (t.amenity === 'drinking_water') return 'water';
  if (t.natural === 'spring') return 'spring';
  if (t.tourism === 'viewpoint') return 'viewpoint';
  if (t.tourism === 'alpine_hut' || t.tourism === 'wilderness_hut' || t.tourism === 'shelter' || t.amenity === 'shelter') return 'hut';
  if (t.mountain_pass === 'yes' || t.natural === 'saddle') return 'pass';
  return null;
}

async function overpass(q) {
  let last;
  for (const ep of OVERPASS) {
    try {
      const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'sulin-trails/1.0 (ai@solexecution.com)' },
        signal: AbortSignal.timeout(180000) });
      return JSON.parse(await r.text());
    } catch (e) { last = e; console.warn('  ' + ep + ' failed: ' + e.message); await sleep(1500); }
  }
  throw last;
}

(async () => {
  const [s, w, n, e] = BBOX;
  const q = `[out:json][timeout:120];
    (
      node["amenity"="drinking_water"](${s},${w},${n},${e});
      node["natural"="spring"](${s},${w},${n},${e});
      node["tourism"~"^(alpine_hut|wilderness_hut|viewpoint|shelter)$"](${s},${w},${n},${e});
      node["amenity"="shelter"](${s},${w},${n},${e});
      node["natural"="saddle"](${s},${w},${n},${e});
      node["mountain_pass"="yes"](${s},${w},${n},${e});
    );
    out qt;`;
  const j = await overpass(q);
  const pois = [];
  for (const el of j.elements) {
    if (el.type !== 'node' || !el.tags) continue;
    const t = classify(el.tags);
    if (!t) continue;
    pois.push({ t, n: el.tags.name || '', lat: Math.round(el.lat * 1e5) / 1e5, lon: Math.round(el.lon * 1e5) / 1e5 });
  }
  fs.writeFileSync(path.join(__dirname, 'docs', 'pois.json'), JSON.stringify(pois));
  const by = pois.reduce((a, p) => (a[p.t] = (a[p.t] || 0) + 1, a), {});
  console.log('pois.json:', pois.length, 'POIs ->', JSON.stringify(by));
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
