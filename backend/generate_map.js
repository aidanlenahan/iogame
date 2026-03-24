/**
 * generate_map.js — One-time map seeder.
 *
 * Reads ne_110m_admin_0_countries.geojson and rasterizes it into a
 * WIDTH x HEIGHT grid using equirectangular projection.
 *
 * Each cell gets:
 *   type     : 'plains' | 'desert' | 'mountain' | 'water' | 'snow'
 *   country  : ISO country name, or '' for water
 *   owner    : 'neutral'
 *   pop      : 0 (water) or 1 (land)
 *   building : ''
 *
 * Output: data/world_map_seed.json
 */

const fs = require('fs');
const path = require('path');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { point } = require('@turf/helpers');

const WIDTH  = 160;
const HEIGHT = 80;

// Latitude-based terrain assignment (land only)
function landTerrain(lat, lon) {
  const absLat = Math.abs(lat);
  if (absLat >= 65)                     return 'snow';       // polar
  if (absLat >= 40)                     return 'mountain';   // high latitudes — mix of mountain / temperate
  // Sahara / Arabian / Australian / North American desert belts
  if (absLat >= 15 && absLat <= 35) {
    // Rough desert longitude bands
    if ((lon >= -20  && lon <= 60)  ||  // North Africa & Middle East
        (lon >= 60   && lon <= 80)  ||  // South Asia (partial)
        (lon >= 110  && lon <= 155) ||  // Australia
        (lon >= -120 && lon <= -70 && lat >= 20 && lat <= 35)) { // N America Sonora/Chihuahua
      return 'desert';
    }
  }
  return 'plains';
}

async function main() {
  const geojsonPath = path.join(__dirname, 'data', 'ne_110m_admin_0_countries.geojson');
  console.log('Loading GeoJSON...');
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const features = geojson.features;
  console.log(`Loaded ${features.length} country features.`);

  const map = [];
  let landCount = 0;

  for (let y = 0; y < HEIGHT; y++) {
    const row = [];
    const lat = 90 - (y / HEIGHT) * 180;   // +90 (top) → -90 (bottom)

    for (let x = 0; x < WIDTH; x++) {
      const lon = (x / WIDTH) * 360 - 180; // -180 (left) → +180 (right)
      const pt  = point([lon, lat]);

      let matched  = null;
      let countryName = '';

      for (const feature of features) {
        try {
          if (booleanPointInPolygon(pt, feature)) {
            matched = feature;
            countryName = feature.properties.NAME || feature.properties.ADMIN || '';
            break;
          }
        } catch (_) { /* skip degenerate polygons */ }
      }

      if (matched) {
        landCount++;
        row.push({
          type:     landTerrain(lat, lon),
          country:  countryName,
          owner:    'neutral',
          pop:      1,
          building: ''
        });
      } else {
        row.push({
          type:     'water',
          country:  '',
          owner:    'neutral',
          pop:      0,
          building: ''
        });
      }
    }

    map.push(row);
    if ((y + 1) % 10 === 0) {
      process.stdout.write(`  Row ${y + 1}/${HEIGHT} done\n`);
    }
  }

  const outPath = path.join(__dirname, 'data', 'world_map_seed.json');
  fs.writeFileSync(outPath, JSON.stringify(map));
  const total = WIDTH * HEIGHT;
  console.log(`\nDone! ${landCount}/${total} tiles are land (${((landCount/total)*100).toFixed(1)}%).`);
  console.log(`Written to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
