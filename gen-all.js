// Generates trail routes between node pairs via BRouter, one route per "source"
// (routing profile: footpath / bike / dirt-gravel / trekking / shortest). Each route
// carries a surface breakdown (Path / Track / Paved / Unpaved) derived from the OSM
// way tags BRouter returns, so the app can always show what a route is made of.
// Usage: node gen-all.js (then: node build.js)

const fs = require('fs');
const path = require('path');
const { rideMinutes } = require('./pace');

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
  staralubovna: { name: 'Stará Ľubovňa',    lon: 20.6888700, lat: 49.2985700 },
};

// The trail network as an explicit list of edges. Add/remove a line to add/remove a
// connection (both directions are generated). Optional `via` waypoints force a corridor.
const EDGES = [
  { from: 'sulin', to: 'vsetinska' },
  { from: 'staralubovna', to: 'lackova' },
  { from: 'vsetinska', to: 'lackova' },
  { from: 'sulin', to: 'lackova' },
];

// Each "source" is one BRouter routing profile — it prefers a different kind of way,
// so the same pair yields a footpath route, a bike route, a dirt-road route, etc.
// `key` prefixes the trail id (key-from-to) and `color` styles its line on the map.
const PROFILES = [
  { key: 'foot',   label: 'Footpath',      profile: 'hiking-mountain', color: '#2e7d32' },
  { key: 'mtb',    label: 'Bike trail',    profile: 'mtb',             color: '#1565c0' },
  { key: 'gravel', label: 'Dirt / gravel', profile: 'gravel',          color: '#b45309' },
  { key: 'trek',   label: 'Trekking',      profile: 'trekking',        color: '#6a1b9a' },
  { key: 'short',  label: 'Shortest',      profile: 'shortest',        color: '#c62828' },
];

// Build the directed via-lookup from EDGES (forward + reversed) so brouter() can find it by key.
const VIAS = {};
for (const e of EDGES) {
  const via = e.via || [];
  VIAS[`${e.from}-${e.to}`] = via;
  VIAS[`${e.to}-${e.from}`] = [...via].reverse();
}

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

// ---- surface breakdown from BRouter's per-segment way tags --------------------
const SURF_ORDER = ['Paved', 'Track', 'Path', 'Unpaved', 'Other'];
function classifyWay(tags) {
  const hw = (/highway=([^\s]+)/.exec(tags || '') || [])[1] || '';
  const sf = (/surface=([^\s]+)/.exec(tags || '') || [])[1] || '';
  if (/^(path|footway|bridleway|steps|pedestrian)$/.test(hw)) return 'Path';
  if (/^(asphalt|paved|concrete|concrete:plates|paving_stones|sett|cobblestone|metal|wood)$/.test(sf)) return 'Paved';
  if (hw === 'track') return 'Track';
  if (/^(gravel|fine_gravel|compacted|pebblestone|unpaved|ground|dirt|earth|grass|sand|mud|rock|stone)$/.test(sf)) return 'Unpaved';
  if (/^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified|service|road|cycleway)$/.test(hw)) return 'Paved';
  return 'Other';
}
function surfaceBreakdown(messages) {
  if (!Array.isArray(messages) || messages.length < 2) return [];
  const head = messages[0];
  const di = head.indexOf('Distance') >= 0 ? head.indexOf('Distance') : 3;
  const wi = head.indexOf('WayTags') >= 0 ? head.indexOf('WayTags') : 9;
  const tally = {}; let total = 0;
  for (let i = 1; i < messages.length; i++) {
    const m = Number(messages[i][di]) || 0;
    const cat = classifyWay(messages[i][wi]);
    tally[cat] = (tally[cat] || 0) + m; total += m;
  }
  if (!total) return [];
  return SURF_ORDER.filter(c => tally[c])
    .map(c => ({ label: c, pct: Math.round(tally[c] / total * 100) }))
    .filter(s => s.pct > 0)
    .sort((a, b) => b.pct - a.pct);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function brouter(aKey, bKey, profile) {
  const a = NODES[aKey], b = NODES[bKey];
  const viaList = VIAS[`${aKey}-${bKey}`] || [];
  let pointsStr = `${a.lon},${a.lat}`;
  for (const v of viaList) pointsStr += `|${v.lon},${v.lat}`;
  pointsStr += `|${b.lon},${b.lat}`;

  const url = `https://brouter.de/brouter?lonlats=${pointsStr}&profile=${profile}&alternativeidx=0&format=geojson`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
      const t = await r.text();
      let j; try { j = JSON.parse(t); } catch { throw new Error(t.slice(0, 120)); }
      const f = j.features[0];
      return { coords: f.geometry.coordinates, lengthM: Number(f.properties['track-length']), messages: f.properties.messages };
    } catch (e) {
      lastErr = e;
      await sleep(2000);
    }
  }
  throw lastErr;
}

function makeTrail(fromKey, toKey, data, src) {
  const { coords, lengthM, messages } = data;
  const elev = coords.map(c => c[2]);
  const { asc, desc } = ascDesc(elev);
  const from = NODES[fromKey], to = NODES[toKey];
  const km = Math.round(lengthM / 100) / 10;
  // Gradient-aware family-MTB time from the elevation profile (see pace.js):
  // climbs are ridden/pushed slowly, descents capped for safety with kids.
  const min = rideMinutes(coords, cumDist(coords));
  return {
    id: `${src.key}-${fromKey}-${toKey}`,
    name: `${from.name} → ${to.name}`,
    region: REGION, type: 'mtb',
    source: src.label, sourceKey: src.key, color: src.color,
    surfaces: surfaceBreakdown(messages),
    km, asc, desc, min,
    elevMin: Math.round(Math.min(...elev) * 10) / 10,
    elevMax: Math.round(Math.max(...elev) * 10) / 10,
    start: { name: from.name, lat: coords[0][1], lon: coords[0][0], elev: coords[0][2] },
    end: { name: to.name, lat: coords[coords.length - 1][1], lon: coords[coords.length - 1][0], elev: coords[coords.length - 1][2] },
    coords, dist: cumDist(coords),
  };
}

(async () => {
  let created = 0, failed = 0;

  for (const edge of EDGES) {
    const aKey = edge.from, bKey = edge.to;
    const seenLen = []; // dedup: two profiles sometimes return the identical path

    for (const src of PROFILES) {
      console.log(`Routing ${aKey} ↔ ${bKey} as ${src.label} (${src.profile})...`);
      try {
        const fwdData = await brouter(aKey, bKey, src.profile);
        const roundedKm = Math.round(fwdData.lengthM / 100);
        if (seenLen.includes(roundedKm)) {
          console.log(`  – ${src.label} duplicates an earlier route (${fwdData.lengthM / 1000} km), skipped`);
          continue;
        }
        seenLen.push(roundedKm);

        const fwd = makeTrail(aKey, bKey, fwdData, src);
        fs.writeFileSync(path.join(OUT, `${fwd.id}.json`), JSON.stringify(fwd));

        const revData = await brouter(bKey, aKey, src.profile);
        const rev = makeTrail(bKey, aKey, revData, src);
        fs.writeFileSync(path.join(OUT, `${rev.id}.json`), JSON.stringify(rev));

        created += 2;
        const surf = fwd.surfaces.map(s => `${s.label} ${s.pct}%`).join(' · ');
        console.log(`  ✓ ${fwd.id} + ${rev.id} — ${fwd.km} km · ${surf}`);
      } catch (e) {
        failed += 2;
        console.warn(`  ✗ FAILED ${aKey} ↔ ${bKey} ${src.label}: ${e.message}`);
      }
      await sleep(1200);
    }
  }

  console.log(`\nFinished: ${created} written, ${failed} failed.`);
})();
