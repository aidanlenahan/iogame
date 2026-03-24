# OpenFront Remake TODO

## Immediate (Now)
- [x] Fix backend safeHSet recursion and ensure stable Redis hSet.
- [x] Add backend /api/reset and /api/start endpoints.
- [x] Add bot attack tick and growth tick.
- [x] Implement frontend start/reset button and map render update.
- [x] Implement attack flow and city build (shift click).
- [x] Enable Docker stack and verify /api/map and frontend serve.

## Next dev tasks (Playability)
- [x] Add population split (troops/workers) and UI slider.
- [x] Add gold generation formula and dynamic resource display on UI.
- [ ] Add unit movement and train/ship prototype.
- [x] Add match end state and restart button with scoreboard.
- [ ] Add simple multiplayer session API (join/match state).

## Medium-term (Alpha → Beta)
- [ ] Add additional building types: port, missile silo, defense post.
- [ ] Add diplomacy API and alliance state.
- [ ] Add nuclear war mechanics and SAM interception.
- [ ] Add map save/load and replay system.
