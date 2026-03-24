# Tech Stack Specification: OpenFront.io Remake
**Target Environment:** Ubuntu VM (4 vCPU, 4GB RAM, 32GB SSD)

## 1) Architecture Overview
OpenFront is a lightweight containerized game engine with:
- A backend REST API and game tick engine in Node.js
- A frontend browser app using Vanilla JavaScript + PixiJS for tile rendering
- A Redis in-memory store for all game state
- Nginx as the edge gateway serving static frontend and proxying API

## 2) Backend Stack (Actual Implementation)
### Core
- **Runtime:** Node.js (Docker image `node:20-alpine`)
- **File:** `backend/index.js`
- **Startup command:** `npm run start` (runs `node index.js`)

### Libraries (from `backend/package.json`)
- `redis` (v5) for persistent in-memory state
- `socket.io` declared but not directly used in current code

### Server Behavior
- Uses Node's built-in `http` module and manual request routing
- Exposes endpoints:
  - `GET /api/map`
  - `GET /api/player/1`
  - `POST /api/reset`
  - `POST /api/start`
  - `GET /tile/:x/:y`
  - `POST /tile/:x/:y`
  - `POST /api/action/attack`
  - `POST /building`
- Handles game logic, tile updates, population growth, and bot ticks in-process with `setInterval`.
- Stores tile data in Redis hashes (`tile:x:y`) and full map JSON string in key `map_grid`.
- Uses custom helper `safeHSet(...)` to normalize values before writing Redis hashes.

### Data Model
- Map grid: `map_grid` (JSON array of rows)
- Tile state: `tile:x:y` hash fields: `owner`, `type`, `pop`, `building`
- Player state: `player:player1` hash fields: `pop`, `gold`, `cap`
- Game initialization marker: `map_initialized`

## 3) Frontend Stack (Actual Implementation)
### Core
- **File:** `frontend/index.html`
- Vanilla HTML/CSS/JS with direct browser APIs
- No build toolchain or frontend framework

### Rendering
- **Library:** PixiJS (loaded via CDN `https://pixijs.download/release/pixi.js`)
- Renders a tile grid using WebGL through PixiJS containers/graphics
- Supports interactive pointer events and camera movement (WASD/arrow keys)

### Client API / UX
- Calls backend REST endpoints via `fetch(...)`
- Implements gameplay actions: select tile, attack adjacent tile, build city (Shift+click), start/reset
- Auto-refresh mechanism (`setInterval` every 1.2s) to poll map and update UI

## 4) Infrastructure Stack
### Docker Compose (`docker-compose.yml`)
- `backend`: Node.js app on port 3000 with 1.5GB memory limit
- `redis`: Redis container with `--maxmemory 1gb` and LRU eviction
- `nginx`: Static web server plus API proxy

### Nginx (`nginx.conf`)
- Serves `frontend/index.html` and static assets from `/usr/share/nginx/html`
- Proxies `/api/` (rewritten) to backend
- Proxy config includes Socket.io WebSocket headers for potential real-time operations

## 5) What is **not** actually used in this repo
- There is no React app in `frontend`
- There is no TypeScript source files in backend
- There is no SQLite persistence in this current code
- The backend does not currently use active Socket.io sockets; it is plain HTTP API

## 6) Local Dev Run
1. Start with Docker Compose:
   - `sudo docker compose up -d`
2. Open browser at `http://localhost`
3. Backend health endpoints:
   - `GET http://localhost/api/map`
   - `POST http://localhost/api/reset`

## 7) Next Evolution Opportunities
- Convert the backend to express + proper route handlers to improve maintainability
- Swap Redis map store to dedicated service with TTL or snapshot persistence
- Add true WebSocket game updates (Socket.io) and reduce polling overhead
- Add a frontend build pipeline (Vite/React) if UI complexity grows
