// Fetches useful trail POIs (water, springs, huts/shelters, viewpoints, passes)
// for the whole region from OpenStreetMap via Overpass, into docs/pois.json.
// Precached by build.js so they work offline. Usage: node gen-pois.js
const fs = require('fs');
const path = require('path');

// region bbox covering all hubs + trails, incl. new N/W reach (Mníšek, Eliášovka, Jarabina)
const BBOX = [49.275, 20.545, 49.405, 20.765];
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
  if (['pub', 'restaurant', 'fast_food', 'cafe', 'biergarten'].includes(t.amenity)) return 'food';
  if (['convenience', 'supermarket', 'bakery', 'greengrocer'].includes(t.shop)) return 'shop';
  if (t.shop === 'bicycle' || t.amenity === 'bicycle_repair_station') return 'bike';
  if (t.tourism === 'picnic_site' || t.leisure === 'picnic_table') return 'picnic';
  if (['castle', 'ruins', 'archaeological_site', 'monastery'].includes(t.historic)) return 'castle';
  if (t.tourism === 'camp_site') return 'camp';
  if (t.waterway === 'waterfall') return 'waterfall';
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
      node["tourism"~"^(alpine_hut|wilderness_hut|viewpoint|shelter|picnic_site|camp_site)$"](${s},${w},${n},${e});
      node["amenity"~"^(shelter|pub|restaurant|fast_food|cafe|biergarten|bicycle_repair_station)$"](${s},${w},${n},${e});
      node["natural"="saddle"](${s},${w},${n},${e});
      node["mountain_pass"="yes"](${s},${w},${n},${e});
      node["shop"~"^(convenience|supermarket|bakery|greengrocer|bicycle)$"](${s},${w},${n},${e});
      node["historic"~"^(castle|ruins|archaeological_site|monastery)$"](${s},${w},${n},${e});
      node["leisure"="picnic_table"](${s},${w},${n},${e});
      node["waterway"="waterfall"](${s},${w},${n},${e});
      way["historic"~"^(castle|ruins|archaeological_site|monastery)$"](${s},${w},${n},${e});
      way["tourism"~"^(picnic_site|camp_site)$"](${s},${w},${n},${e});
      way["amenity"~"^(pub|restaurant|fast_food|cafe)$"](${s},${w},${n},${e});
      way["shop"~"^(convenience|supermarket)$"](${s},${w},${n},${e});
    );
    out center qt;`;
  const j = await overpass(q);
  const pois = [];
  for (const el of j.elements) {
    if (!el.tags) continue;
    const lat = el.type === 'node' ? el.lat : el.center && el.center.lat;
    const lon = el.type === 'node' ? el.lon : el.center && el.center.lon;
    if (lat == null || lon == null) continue;
    const t = classify(el.tags);
    if (!t) continue;
    pois.push({ t, n: el.tags.name || '', lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 });
  }
  fs.writeFileSync(path.join(__dirname, 'docs', 'pois.json'), JSON.stringify(pois));
  const by = pois.reduce((a, p) => (a[p.t] = (a[p.t] || 0) + 1, a), {});
  console.log('pois.json:', pois.length, 'POIs ->', JSON.stringify(by));
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
