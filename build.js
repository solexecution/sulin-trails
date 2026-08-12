// Build step for Sulín Trails.
//  1. Scans docs/trails/*.json and writes docs/trails/index.json (the registry
//     the app loads to build the trail picker).
//  2. Stamps docs/sw.js from sw.template.js with a content hash + the precache
//     list (shell + vendor + every trail file), so each deploy busts the cache
//     and the whole app + all trails work offline.
//
// Add a trail: drop a JSON in docs/trails/ (schema below), run `node build.js`.
//
// Trail schema:
//   { id (sourceKey-from-to), name, region, type (mtb|hike|bike|walk), color, km, asc,
//     source (human label), sourceKey, surfaces:[{label,pct}],
//     desc?, min, elevMin?, elevMax?,
//     start:{name,lat,lon,elev?}, end:{name,lat,lon,elev?},
//     coords:[[lon,lat,elev?],...], dist?:[cumulative metres] }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DOCS = path.join(__dirname, 'docs');
const TRAILS = path.join(DOCS, 'trails');

// 1) registry ---------------------------------------------------------------
const trailFiles = fs.readdirSync(TRAILS).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
const registry = trailFiles.map(f => {
  const t = JSON.parse(fs.readFileSync(path.join(TRAILS, f), 'utf8'));
  if (t.id + '.json' !== f) console.warn(`  ! ${f}: id "${t.id}" does not match filename`);
  return {
    id: t.id, name: t.name, region: t.region, type: t.type, color: t.color,
    source: t.source, sourceKey: t.sourceKey, surfaces: t.surfaces || [],
    km: t.km, asc: t.asc, desc: t.desc, min: t.min,
    elevMin: t.elevMin, elevMax: t.elevMax, hasElev: t.elevMin != null,
    points: t.coords.length,
  };
});
fs.writeFileSync(path.join(TRAILS, 'index.json'), JSON.stringify(registry));
console.log(`registry: ${registry.length} trail(s) -> trails/index.json`);
registry.forEach(t => console.log(`  · ${t.id} (${t.name}) ${t.km} km${t.hasElev ? ', elev' : ''}`));

// 2) precache list + versioned service worker -------------------------------
const vendorImages = fs.readdirSync(path.join(DOCS, 'vendor', 'images')).map(f => 'vendor/images/' + f);
const precache = [
  './', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/leaflet-rotate.js',
  ...vendorImages,
  'trails/index.json',
  ...trailFiles.map(f => 'trails/' + f),
  ...(fs.existsSync(path.join(DOCS, 'pois.json')) ? ['pois.json'] : []),
];

// version hash covers every precached file's content
const hash = crypto.createHash('sha1');
for (const rel of precache) {
  if (rel === './') continue;
  hash.update(fs.readFileSync(path.join(DOCS, rel)));
}
const version = hash.digest('hex').slice(0, 12);

const swTpl = fs.readFileSync(path.join(__dirname, 'sw.template.js'), 'utf8');
const sw = swTpl.split('__VERSION__').join(version).split('__PRECACHE__').join(JSON.stringify(precache));
fs.writeFileSync(path.join(DOCS, 'sw.js'), sw);
console.log(`service worker: version ${version}, ${precache.length} precached files -> docs/sw.js`);
