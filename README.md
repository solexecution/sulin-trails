# Sulín Trails

Offline trail-navigation **PWA** for hiking and MTB routes around Sulín
(Ľubovnianska vrchovina / Pieniny, northern Slovakia). Built to grow — adding a
new trail is dropping one JSON file in and rebuilding.

Live: **https://solexecution.github.io/sulin-trails/**

## Features

- **Offline-first** — service worker precaches the whole app shell and every
  trail; map tiles you view are cached for offline reuse. Installable to the
  home screen.
- **Multiple trails** — a trail picker driven by `docs/trails/index.json`.
- **GPS navigation** — live position with a **direction cone**, accuracy circle,
  distance-to-trail and distance-to-finish, and current **altitude**.
- **Heading-up mode** — the whole map rotates to your compass heading (like car
  navigation), toggled against the default north-up. Uses `leaflet-rotate` so
  the GPS position stays correctly aligned while turning.
- **Live compass** — magnetometer with a GPS-course fallback.
- **Elevation profile** — interactive, with your live position projected onto it.
- **Record your walk** — GPS breadcrumb trail, exportable as **GPX**.
- **Screen wake-lock** while GPS is active.

Base layers: Esri World Imagery (satellite), OpenTopoMap, Freemap Outdoor, OSM.

## Add a trail

1. Create `docs/trails/<id>.json`:

   ```json
   {
     "id": "my-trail",
     "name": "Start → Finish",
     "region": "Sulín",
     "type": "mtb",
     "color": "#e65100",
     "km": 12.3, "asc": 400, "desc": 380, "min": 80,
     "elevMin": 450, "elevMax": 850,
     "start": { "name": "Start", "lat": 49.36, "lon": 20.74, "elev": 480 },
     "end":   { "name": "Finish", "lat": 49.29, "lon": 20.68, "elev": 580 },
     "coords": [[20.74, 49.36, 480], [20.73, 49.35, 500]],
     "dist":   [0, 142.5]
   }
   ```

   - `type`: `mtb` | `hike` | `bike` | `walk`.
   - `coords` are `[lon, lat, elev?]`. `elev`, `dist`, `desc`, `elevMin/Max`
     are optional — omit them and the trail simply has no elevation profile.
   - `dist` is cumulative metres per point (used for the profile x-axis and
     distance-to-finish). Generate it from `coords` if you don't have it.

2. Rebuild and commit:

   ```bash
   node build.js
   git add docs/trails docs/sw.js && git commit -m "Add my-trail" && git push
   ```

   `build.js` regenerates `trails/index.json` and re-stamps the service worker
   (new version + precache list) so the new trail ships and works offline.

## Layout

```
docs/                 GitHub Pages root
  index.html app.js app.css manifest.webmanifest sw.js icon-*.png
  vendor/             Leaflet + leaflet-rotate (local, no CDN)
  trails/             one JSON per trail + generated index.json
build.js              registry + versioned service worker
sw.template.js        service worker source (stamped by build.js)
```

Trail geometry originates from BRouter (hiking / mtb profiles); elevation from
the route's per-point samples. Distances are along-track; GPS accuracy is
3–10 m.
