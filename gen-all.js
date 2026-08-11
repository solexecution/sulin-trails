// Generates direct trail routes between all pairs of nodes in the network via BRouter (mtb, 3D).
// Skips files that already exist to avoid unnecessary network requests.
// Usage: node gen-all.js (then: node build.js)

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'docs', 'trails');
const REGION = 'Ľubovnianska vrchovina';

const NODES = {
  sulin:     { name: 'Sulín 136',           lon: 20.7470760, lat: 49.3615701 },
  lackova:   { name: 'Lacková 46',          lon: 20.5929004, lat: 49.3099418 },
  vsetinska: { name: 'Vsetínska 56',        lon: 20.6797161, lat: 49.2938543 },
  ruzbachy:  { name: 'Ružbachy kráter',     lon: 20.5603999, lat: 49.3057148 },
  nestville: { name: 'Nestville Park',      lon: 20.6405260, lat: 49.3012203 },
  mnisek:    { name: 'Mníšek nad Popradom', lon: 20.7384360, lat: 49.3993080 },
  jarabina:  { name: 'Jarabina',            lon: 20.6560470, lat: 49.3382840 },
  eliasovka: { name: 'Eliášovka 1023',      lon: 20.6425770, lat: 49.4008280 },
  lubovna:   { name: 'Ľubovniansky hrad',   lon: 20.6995470, lat: 49.3152240 },
};

const COLORS = [
  '#e65100', '#1565ff', '#6a1b9a', '#2e7d32', '#c62828', '#00838f',
  '#455a64', '#ad1457', '#558b2f', '#4527a0', '#795548', '#d81b60',
  '#00796b', '#f57c00', '#303f9f', '#5d4037', '#0288d1', '#8e24aa'
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
  const keys = Object.keys(NODES);
  let created = 0, skipped = 0, failed = 0;
  let colorIdx = 0;

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const aKey = keys[i], bKey = keys[j];
      const fwdFile = path.join(OUT, `mtb-${aKey}-${bKey}.json`);
      const revFile = path.join(OUT, `mtb-${bKey}-${aKey}.json`);

      if (fs.existsSync(fwdFile) && fs.existsSync(revFile)) {
        skipped += 2;
        continue;
      }

      const color = COLORS[colorIdx++ % COLORS.length];
      console.log(`Fetching ${aKey} ↔ ${bKey}...`);
      try {
        const { coords, lengthM } = await brouter(NODES[aKey], NODES[bKey]);
        const { asc, desc } = ascDesc(coords.map(c => c[2]));

        const fwd = makeTrail(aKey, bKey, coords, lengthM, color, asc, desc);
        fs.writeFileSync(fwdFile, JSON.stringify(fwd));

        const rev = makeTrail(bKey, aKey, coords.slice().reverse(), lengthM, color, desc, asc);
        fs.writeFileSync(revFile, JSON.stringify(rev));

        created += 2;
        console.log(`  ✓ Wrote mtb-${aKey}-${bKey} and mtb-${bKey}-${aKey} (${fwd.km} km)`);
      } catch (e) {
        failed += 2;
        console.warn(`  ✗ FAILED ${aKey} ↔ ${bKey}: ${e.message}`);
      }
      await sleep(1200);
    }
  }

  console.log(`\nFinished: ${created} created, ${skipped} skipped (already existed), ${failed} failed.`);
})();
