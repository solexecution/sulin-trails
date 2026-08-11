// Generates the trail network between the four reference points, every pair,
// both directions, via BRouter (mtb profile, elevation-bearing 3D geometry).
// Plus the Nestville -> Ružbachy kráter trail, now with elevation.
// Usage: node gen-mesh.js   (then: node build.js)
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'docs', 'trails');

// canonical labels + slugs, using the addresses requested
const NODES = {
  sulin:     { name: 'Sulín 136',        lon: 20.7470760, lat: 49.3615701 },
  lackova:   { name: 'Lacková 46',       lon: 20.5929004, lat: 49.3099418 },
  vsetinska: { name: 'Vsetínska 56',     lon: 20.6797161, lat: 49.2938543 },
  ruzbachy:  { name: 'Ružbachy kráter',  lon: 20.5603999, lat: 49.3057148 },
  nestville: { name: 'Nestville Park',   lon: 20.6405260, lat: 49.3012203 },
};

// undirected routes to fetch: all 6 pairs among the 4 addresses + Nestville→Ružbachy
const ROUTES = [
  ['sulin', 'lackova',     '#e65100'],
  ['sulin', 'vsetinska',   '#1565ff'],
  ['sulin', 'ruzbachy',    '#6a1b9a'],
  ['lackova', 'vsetinska', '#2e7d32'],
  ['lackova', 'ruzbachy',  '#c62828'],
  ['vsetinska', 'ruzbachy','#00838f'],
  ['nestville', 'ruzbachy','#455a64'],
];
const REGION = 'Ľubovnianska vrchovina';

const R = 6371000, rad = d => d * Math.PI / 180;
const hav = (a, b) => {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const cumDist = c => { const d = [0]; for (let i = 1; i < c.length; i++) d[i] = d[i - 1] + hav(c[i - 1], c[i]); return d.map(x => Math.round(x * 10) / 10); };
// ascend / descend with 2 m hysteresis to suppress DEM noise
function ascDesc(elev) {
  let asc = 0, desc = 0, ref = elev[0];
  for (let i = 1; i < elev.length; i++) {
    const d = elev[i] - ref;
    if (d > 2) { asc += d; ref = elev[i]; } else if (d < -2) { desc += -d; ref = elev[i]; }
  }
  return { asc: Math.round(asc), desc: Math.round(desc) };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function brouter(a, b) {
  const url = `https://brouter.de/brouter?lonlats=${a.lon},${a.lat}|${b.lon},${b.lat}&profile=mtb&alternativeidx=0&format=geojson`;
  const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error(t.slice(0, 120)); }
  const f = j.features[0];
  return { coords: f.geometry.coordinates, lengthM: Number(f.properties['track-length']) };
}

function makeTrail(fromKey, toKey, coords, lengthM, color, asc, desc) {
  const elev = coords.map(c => c[2]);
  const from = NODES[fromKey], to = NODES[toKey];
  const km = Math.round(lengthM / 100) / 10;
  const min = Math.round(lengthM / 13000 * 60 + asc / 8);
  return {
    id: `mtb-${fromKey}-${toKey}`,
    name: `${from.name} → ${to.name}`,
    region: REGION, type: 'mtb', color,
    km, asc, desc, min,
    elevMin: Math.round(Math.min(...elev) * 10) / 10,
    elevMax: Math.round(Math.max(...elev) * 10) / 10,
    start: { name: from.name, lat: coords[0][1], lon: coords[0][0], elev: coords[0][2] },
    end: { name: to.name, lat: coords[coords.length - 1][1], lon: coords[coords.length - 1][0], elev: coords[coords.length - 1][2] },
    coords, dist: cumDist(coords),
  };
}

(async () => {
  let n = 0;
  for (const [aKey, bKey, color] of ROUTES) {
    try {
      const { coords, lengthM } = await brouter(NODES[aKey], NODES[bKey]);
      const { asc, desc } = ascDesc(coords.map(c => c[2]));
      // forward
      const fwd = makeTrail(aKey, bKey, coords, lengthM, color, asc, desc);
      fs.writeFileSync(path.join(OUT, fwd.id + '.json'), JSON.stringify(fwd));
      // reverse (same path back): reverse coords, swap asc/desc
      const rev = makeTrail(bKey, aKey, coords.slice().reverse(), lengthM, color, desc, asc);
      fs.writeFileSync(path.join(OUT, rev.id + '.json'), JSON.stringify(rev));
      n += 2;
      console.log(`  ${fwd.name}  ${fwd.km} km, ↑${fwd.asc}/↓${fwd.desc} m, ${coords.length} pts  (+ reverse)`);
    } catch (e) { console.warn(`  FAILED ${aKey}→${bKey}: ${e.message}`); }
    await sleep(1500);
  }
  console.log(`\nWrote ${n} trail files.`);
})();
