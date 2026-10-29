/**
 * build_seed.js — Packs backend/data/world_map_seed.json into the compact
 * docs/world_seed.json used by the static GitHub Pages demo.
 *
 * Usage (from repo root): node docs/tools/build_seed.js
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'backend', 'data', 'world_map_seed.json');
const OUT = path.join(__dirname, '..', 'world_seed.json');

const seed = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const types = [];
const countries = [];
const t = [];
const c = [];

for (const row of seed) {
  for (const tile of row) {
    if (!types.includes(tile.type)) types.push(tile.type);
    const country = tile.country || '';
    if (!countries.includes(country)) countries.push(country);
    t.push(types.indexOf(tile.type));
    c.push(countries.indexOf(country));
  }
}

const packed = { width: seed[0].length, height: seed.length, types, countries, t, c };
fs.writeFileSync(OUT, JSON.stringify(packed));
console.log(`Wrote ${OUT} (${packed.width}x${packed.height}, ${fs.statSync(OUT).size} bytes)`);
