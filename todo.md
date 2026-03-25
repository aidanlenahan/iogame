# OpenFront Remake TODO

## Immediate (Now)
- [x] Fix backend safeHSet recursion and ensure stable Redis hSet.
- [x] Add backend /api/reset and /api/start endpoints.
- [x] Add bot attack tick and growth tick.
- [x] Implement frontend start/reset button and map render update.
- [x] Implement attack flow and city build (shift click).
- [x] Enable Docker stack and verify /api/map and frontend serve.
- [x] MAKE SURE MAP BORDERS ARE SECURE, CANNOT ESCAPE MAP
- [x] WORK ON PERFORMANCE, ESPECIALLY WITH MAP ZOOMING
- [x] CRITICAL PERFORMANCE — Stop destroying and recreating 192,200 PIXI.Graphics
      every 1200ms tick. Instead: create tile objects ONCE on first load, store
      them in mapTiles[y][x], and on each refresh only update the fill color /
      owner overlay of tiles whose owner or building has changed. This eliminates
      the GC pressure causing STATUS_BREAKPOINT / OOM crashes.
- [x] CRITICAL PERFORMANCE — Replace per-tile PIXI.Graphics with a single flat
      PIXI.Graphics (or RenderTexture) for the base terrain layer (which never
      changes after map load) and a second Graphics for the dynamic ownership
      overlay layer. Terrain draw commands can be issued once and cached. Only
      the dynamic layer needs redraws on tick.
- [x] CRITICAL PERFORMANCE — Reduce auto-refresh rate from 1200ms to 2500ms, or
      switch to a dirty-flag model: only re-render when the API returns changed
      tile data (compare a server-side tick counter or map hash before re-drawing).
- [x] CRITICAL PERFORMANCE — Paginate /api/map: instead of sending the full
      192,200-tile JSON blob every 1200ms, add a /api/map/diff endpoint that
      returns only changed tiles since a given tick number. This cuts network
      overhead by 99% during steady state.
- [x] CRITICAL PERFORMANCE — Backend: avoid re-serializing the full map_grid JSON
      on every /api/map request. Cache the serialized string in memory and
      invalidate only when a tile changes (updateTile() sets a dirty flag).

## Next dev tasks (Playability)
- [x] Add population split (troops/workers) and UI slider.
- [x] Add gold generation formula and dynamic resource display on UI.
- [ ] Add unit movement and train/ship prototype.
- [x] Add match end state and restart button with scoreboard.
- [ ] Add simple multiplayer session API (join/match state).
- [ ] Build menu UI — right-click or panel with City / Port buttons
      (currently Shift+click only; Port has no frontend trigger at all).
- [ ] Port building: wire port placement to gold-generating trade tick
      (backend /building accepts type='port' but no income tick exists).

## Medium-term (Alpha → Beta)
- [ ] Add additional building types: port, missile silo, defense post.
- [ ] Add diplomacy API and alliance state.
- [ ] Add nuclear war mechanics and SAM interception.
- [ ] Add map save/load and replay system.
- [ ] Country name tile overlays using ne_110m_admin_0_countries.geojson.
- [ ] Nations AI: stronger AI entities based on real-world countries.
- [ ] Naval system: ships, trade lanes, port blockades.
- [ ] Mobile / touch input support.
- [ ] Tile LOD (level of detail): skip drawing tiny tiles when zoomed far out
      to reduce draw calls during full-map view.
