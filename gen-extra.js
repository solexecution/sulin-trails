// Adds new MTB destinations reachable from the existing network, WITHOUT
// clearing the current trail files. Fetches BRouter (mtb, 3D) geometry for each
// route + its reverse, mirroring gen-mesh.js. Usage: node gen-extra.js (then: node build.js)
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'docs', 'trails');
const REGION = 'Ľubovnianska vrchovina';

// existing hubs (from gen-mesh.js) + new destinations
const NODES = {
  sulin:     { name: 'Sulín 136',           lon: 20.7470760, lat: 49.3615701 },
  ruzbachy:  { name: 'Ružbachy kráter',      lon: 20.5603999, lat: 49.3057148 },
  mnisek:    { name: 'Mníšek nad Popradom',  lon: 20.7384360, lat: 49.3993080 },
  jarabina:  { name: 'Jarabina',             lon: 20.6560470, lat: 49.3382840 },
  eliasovka: { name: 'Eliášovka 1023',       lon: 20.6425770, lat: 49.4008280 },
  lubovna:   { name: 'Ľubovniansky hrad',    lon: 20.6995470, lat: 49.3152240 },
};

// new routes to add (both directions generated for each)
const ROUTES = [
  ['sulin',    'mnisek',    '#ad1457'], // Poprad valley, north
  ['ruzbachy', 'jarabina',  '#558b2f'], // west to the gorge village
  ['sulin',    'eliasovka', '#4527a0'], // flagship climb to the range high point
  ['sulin',    'lubovna',   '#795548'], // to the regional hub: castle + skanzen
];

const R = 6371000, rad = d => d * Math.PI / 180;
const hav = (a, b) => {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const cumDist = c => { const d = [0]; for (let i = 1; i < c.length; i++) d[i] = d[i - 1] + hav(c[i - 1], c[i]); return d.map(x => Math.round(x * 10) / 10); };
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
      const fwd = makeTrail(aKey, bKey, coords, lengthM, color, asc, desc);
      fs.writeFileSync(path.join(OUT, fwd.id + '.json'), JSON.stringify(fwd));
      const rev = makeTrail(bKey, aKey, coords.slice().reverse(), lengthM, color, desc, asc);
      fs.writeFileSync(path.join(OUT, rev.id + '.json'), JSON.stringify(rev));
      n += 2;
      console.log(`  ${fwd.name}  ${fwd.km} km, ↑${fwd.asc}/↓${fwd.desc} m, ${coords.length} pts  (+ reverse)`);
    } catch (e) { console.warn(`  FAILED ${aKey}→${bKey}: ${e.message}`); }
    await sleep(1500);
  }
  console.log(`\nWrote ${n} trail files.`);
})();
