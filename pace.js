// Family MTB pace model — riding with kids, gradient-aware.
//
// The old model ran every kilometre at a flat ~9 km/h and bolted on a small
// climbing term, so a steep route read almost as fast as a flat one. Real riding
// with kids is dominated by the climbs: they grind up at walking speed or push
// the bike. So we walk the route's actual elevation profile segment by segment
// and pick a speed from the local gradient — climbs are slow, descents capped for
// safety. Distance alone no longer sets the time; how it goes up does.
//
// Used by gen-all.js (at generation) and the recompute step, so both agree.

const R = 6371000, rad = d => d * Math.PI / 180;
function hav(a, b) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Riding speed (km/h) for a gradient g = rise / run, tuned for kids on
// track/gravel. Uphill drops steeply; downhill is faster but capped because
// you brake and hold back with children.
function speedKmh(g) {
  if (g >= 0.15) return 1.5;   // very steep — hike-a-bike / pushing the bike
  if (g >= 0.10) return 2.2;   // steep climb — granny gear, barely moving
  if (g >= 0.06) return 3.2;   // moderate climb
  if (g >= 0.03) return 4.8;   // gentle climb
  if (g >= -0.03) return 7;    // flat / rolling
  if (g >= -0.08) return 7.5;  // gentle descent — only a touch faster than flat
  return 6;                    // steep descent — braking hard, keeping kids safe
}

// Minutes to ride the route. coords: [[lon,lat,elev?],...]; dist: optional
// cumulative-metre array. Gradient is judged over ~30 m windows to smooth DEM
// noise before choosing a speed.
function rideMinutes(coords, dist) {
  if (!coords || coords.length < 2) return 0;
  const hasElev = coords.every(c => c.length > 2 && c[2] != null);
  const D = (dist && dist.length === coords.length)
    ? dist
    : (() => { const d = [0]; for (let i = 1; i < coords.length; i++) d[i] = d[i - 1] + hav(coords[i - 1], coords[i]); return d; })();

  const WINDOW = 30; // metres
  let min = 0, accM = 0, accDz = 0;
  for (let i = 1; i < coords.length; i++) {
    const segM = D[i] - D[i - 1];
    if (segM <= 0) continue;
    accM += segM;
    if (hasElev) accDz += coords[i][2] - coords[i - 1][2];
    if (accM >= WINDOW || i === coords.length - 1) {
      const g = hasElev ? accDz / accM : 0;
      min += (accM / 1000) / speedKmh(g) * 60;
      accM = 0; accDz = 0;
    }
  }
  return Math.round(min);
}

module.exports = { rideMinutes, speedKmh };
