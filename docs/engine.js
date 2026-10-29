/**
 * engine.js — In-browser port of backend/index.js for the static demo.
 *
 * The real game runs a Node + Redis server behind nginx. GitHub Pages can only
 * serve static files, so this file re-implements the same game rules and tick
 * loops in the browser and answers the frontend's /api/* fetch() calls locally.
 * Redis hashes become plain objects; tile objects are replaced (never mutated)
 * on update so the frontend's change detection keeps working.
 */
(function () {
  'use strict';

  const SEED_URL = 'world_seed.json';
  const TARGET_PIXEL_MULTIPLIER = 15;
  const MAX_TICK_HISTORY = 20;
  const STARTING_STATS = {
    player1: { troops: 800, workers: 200, gold: 1000, cap: 100000, troopRatio: 80 },
    bot1:    { troops: 400, workers: 100, gold: 500,  cap: 100000, troopRatio: 80 }
  };

  let seed = null;          // rows of { type, country } at seed resolution
  let map = null;           // rows of { owner, type, country, pop, building }
  let width = 0;
  let height = 0;
  let players = {};         // playerId -> { troops, workers, gold, cap, troopRatio, eliminated, lastAction }
  let orders = [];          // queued attack orders
  let statsCache = null;
  let serverTick = 0;
  let changesByTick = new Map();
  let pendingTickChanges = [];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function asInt(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  }

  function freshPlayer(id) {
    return { ...STARTING_STATS[id], eliminated: false, lastAction: '' };
  }

  function computeMapStats() {
    if (statsCache) return statsCache;
    let total = 0;
    let nonRadioactive = 0;
    const ownership = {};
    for (const row of map) {
      for (const tile of row) {
        total += 1;
        if (tile.type !== 'radioactive') {
          nonRadioactive += 1;
          ownership[tile.owner] = (ownership[tile.owner] || 0) + 1;
        }
      }
    }
    const playerStats = {};
    for (const [owner, count] of Object.entries(ownership)) {
      playerStats[owner] = nonRadioactive === 0 ? 0 : Number(((count / nonRadioactive) * 100).toFixed(1));
    }
    statsCache = { total, nonRadioactive, ownership, playerStats };
    return statsCache;
  }

  function getPlayer(playerId) {
    const p = players[playerId];
    if (!p) return null;
    return {
      pop: p.troops + p.workers,
      troops: p.troops,
      workers: p.workers,
      gold: p.gold,
      cap: p.cap,
      troopRatio: p.troopRatio,
      eliminated: p.eliminated
    };
  }

  function getPendingAttackCount(playerId) {
    const now = Date.now();
    return orders.filter(o => o.player === playerId && o.arriveAt > now).length;
  }

  function isGameOver() {
    const controlPct = computeMapStats().playerStats['player1'] || 0;
    return controlPct >= 80 || !!players.player1?.eliminated;
  }

  function updateTile(x, y, update) {
    const current = map[y] && map[y][x];
    if (!current) return null;
    const merged = {
      owner:    update.owner    ?? current.owner,
      type:     update.type     ?? current.type,
      country:  update.country  ?? current.country ?? '',
      pop:      update.pop      ?? current.pop,
      building: update.building ?? current.building ?? ''
    };
    // Water is never ownable; keep it neutral and non-buildable.
    if (merged.type === 'water') {
      merged.owner = 'neutral';
      merged.pop = 0;
      merged.building = '';
    }
    map[y][x] = merged;
    statsCache = null;
    pendingTickChanges.push({ x, y, tile: merged });
    return merged;
  }

  // ── Map generation (same upscaling as initGame in backend/index.js) ─────────
  function getSeedTile(x, y) {
    const seedHeight = seed.length;
    const seedWidth = seed[0].length;
    const fx = ((x + 0.5) * seedWidth) / width - 0.5;
    const fy = ((y + 0.5) * seedHeight) / height - 0.5;
    const x0 = clamp(Math.floor(fx), 0, seedWidth - 1);
    const y0 = clamp(Math.floor(fy), 0, seedHeight - 1);
    const x1 = clamp(x0 + 1, 0, seedWidth - 1);
    const y1 = clamp(y0 + 1, 0, seedHeight - 1);
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);

    const weighted = new Map();
    const add = (tile, weight) => {
      const key = `${tile.type}|${tile.country || ''}`;
      const prev = weighted.get(key) || { score: 0, tile };
      prev.score += weight;
      weighted.set(key, prev);
    };
    add(seed[y0][x0], (1 - tx) * (1 - ty));
    add(seed[y0][x1], tx * (1 - ty));
    add(seed[y1][x0], (1 - tx) * ty);
    add(seed[y1][x1], tx * ty);

    let best = null;
    for (const candidate of weighted.values()) {
      if (!best || candidate.score > best.score) best = candidate;
    }
    return best ? best.tile : seed[y0][x0];
  }

  function nearestLand(tx, ty, maxRadius) {
    const cx = clamp(Math.round(tx), 0, width - 1);
    const cy = clamp(Math.round(ty), 0, height - 1);
    if (map[cy][cx].type !== 'water') return { x: cx, y: cy };
    for (let r = 1; r < maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && map[ny][nx].type !== 'water') {
            return { x: nx, y: ny };
          }
        }
      }
    }
    return { x: cx, y: cy };
  }

  function initGame(startX = 22, startY = 78, botX = 291, botY = 78) {
    const axisScale = Math.sqrt(TARGET_PIXEL_MULTIPLIER);
    height = Math.max(seed.length, Math.round(seed.length * axisScale));
    width = Math.max(seed[0].length, Math.round(seed[0].length * axisScale));
    map = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const s = getSeedTile(x, y);
        row.push({ owner: 'neutral', type: s.type, country: s.country || '', pop: s.type === 'water' ? 0 : 1, building: '' });
      }
      map.push(row);
    }
    const p1 = nearestLand(startX, startY, 20);
    const bot1 = nearestLand(botX, botY, 20);
    map[p1.y][p1.x] = { ...map[p1.y][p1.x], owner: 'player1' };
    map[bot1.y][bot1.x] = { ...map[bot1.y][bot1.x], owner: 'bot1' };
    players = { player1: freshPlayer('player1'), bot1: freshPlayer('bot1') };
    orders = [];
    statsCache = null;
    pendingTickChanges = [];
    changesByTick.clear();
    serverTick = 0;
  }

  // quickRestart: reuse the existing map; just reset ownership + player stats.
  function quickRestart(startX = 22, startY = 78) {
    const p1 = nearestLand(startX, startY, 80);
    // Place bot on opposite side, with some variance
    const botRawX = (width - 1 - p1.x) + (Math.random() - 0.5) * width * 0.25;
    const botRawY = (height - 1 - p1.y) + (Math.random() - 0.5) * height * 0.25;
    const bot1 = nearestLand(botRawX, botRawY, 80);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = map[y][x];
        if (t.owner !== 'neutral' || t.building) {
          map[y][x] = { type: t.type, country: t.country, owner: 'neutral', pop: t.type === 'water' ? 0 : 1, building: '' };
        }
      }
    }
    map[p1.y][p1.x] = { ...map[p1.y][p1.x], owner: 'player1', pop: 1 };
    map[bot1.y][bot1.x] = { ...map[bot1.y][bot1.x], owner: 'bot1', pop: 1 };
    statsCache = null;
    orders = [];

    // Bust client diff caches — any stored clientTick is now stale
    pendingTickChanges = [];
    serverTick += MAX_TICK_HISTORY + 1;
    changesByTick.clear();

    players = { player1: freshPlayer('player1'), bot1: freshPlayer('bot1') };
  }

  // ── Tick loops ──────────────────────────────────────────────────────────────
  function growPopulationTick() {
    const playerTiles = {};
    const playerPorts = {};
    for (const row of map) {
      for (const tile of row) {
        if (tile.owner && tile.owner !== 'neutral' && tile.type !== 'water') {
          playerTiles[tile.owner] = (playerTiles[tile.owner] || 0) + 1;
          if (tile.building === 'port') playerPorts[tile.owner] = (playerPorts[tile.owner] || 0) + 1;
        }
      }
    }

    for (const [pid, p] of Object.entries(players)) {
      if (p.eliminated) continue;
      const ownedCount = playerTiles[pid] || 0;
      if (ownedCount === 0) {
        p.eliminated = true;
        continue;
      }
      const troopRatio = clamp(p.troopRatio, 10, 90);
      const growth = ownedCount * 3;
      const troopGrowth = Math.floor(growth * (troopRatio / 100));
      const workerGrowth = growth - troopGrowth;
      p.troops = clamp(p.troops + troopGrowth, 0, p.cap);
      p.workers = clamp(p.workers + workerGrowth, 0, p.cap - p.troops);
      p.troopRatio = troopRatio;
      const goldIncome = Math.floor(ownedCount * 0.25 + p.workers * 0.5 + 5 + (playerPorts[pid] || 0) * 15);
      p.gold = Math.max(0, p.gold + goldIncome);
    }
  }

  function getNeighbors(x, y) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    return dirs.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
      .filter(p => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height);
  }

  function botAttackTick() {
    const botTiles = {};
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const owner = map[y][x].owner;
        if (owner && owner.startsWith('bot')) {
          if (!botTiles[owner]) botTiles[owner] = [];
          botTiles[owner].push({ x, y });
        }
      }
    }
    for (const [botId, tiles] of Object.entries(botTiles)) {
      const attacker = tiles[Math.floor(Math.random() * tiles.length)];
      const neutral = getNeighbors(attacker.x, attacker.y)
        .filter(n => map[n.y][n.x].owner === 'neutral' && map[n.y][n.x].type !== 'water');
      if (!neutral.length) continue;
      const target = neutral[Math.floor(Math.random() * neutral.length)];
      updateTile(target.x, target.y, { owner: botId, pop: 1 });
    }
  }

  function processAttackOrdersTick() {
    const now = Date.now();
    const remaining = [];
    for (const order of orders) {
      if (order.arriveAt > now) { remaining.push(order); continue; }
      const toTile = map[order.toY] && map[order.toY][order.toX];
      if (!toTile || toTile.type === 'water' || toTile.owner === order.player) continue;

      const defenderBase = Math.max(1, Number(toTile.pop || 1) * 8);
      const terrainAttackBonus = order.fromType === 'plains' ? 1.2 : order.fromType === 'mountain' ? 0.9 : 1;
      const terrainDefenseBonus = toTile.type === 'mountain' ? 1.3 : toTile.type === 'plains' ? 0.9 : 1;
      const attackerStrength = Math.max(1, Math.round(order.troopsSent * terrainAttackBonus));
      const defenderStrength = Math.max(1, Math.round(defenderBase * terrainDefenseBonus));

      let actionMessage;
      if (attackerStrength >= defenderStrength) {
        updateTile(order.toX, order.toY, { owner: order.player, pop: 1 });
        actionMessage = `Order resolved: captured ${order.toX},${order.toY} (atk ${attackerStrength} vs def ${defenderStrength}).`;
      } else {
        actionMessage = `Order resolved: failed at ${order.toX},${order.toY} (atk ${attackerStrength} vs def ${defenderStrength}).`;
      }
      if (players[order.player]) players[order.player].lastAction = actionMessage;
    }
    orders = remaining;
  }

  function flushTick() {
    serverTick++;
    if (pendingTickChanges.length > 0) {
      changesByTick.set(serverTick, pendingTickChanges);
      pendingTickChanges = [];
    }
    changesByTick.delete(serverTick - MAX_TICK_HISTORY);
  }

  // ── Request handlers (mirror the routes in backend/index.js) ───────────────
  function scoreboard(stats) {
    return Object.entries(players).map(([id, p]) => ({
      id,
      troops: p.troops,
      workers: p.workers,
      gold: p.gold,
      eliminated: p.eliminated,
      controlPct: stats.playerStats[id] || 0
    })).sort((a, b) => b.controlPct - a.controlPct);
  }

  function summary() {
    const stats = computeMapStats();
    const controlPct = stats.playerStats['player1'] || 0;
    return {
      player: getPlayer('player1'),
      stats: { ...stats, controlPct, pendingAttacks: getPendingAttackCount('player1') },
      win: controlPct >= 80,
      matchId: 'default',
      scoreboard: scoreboard(stats),
      serverTick
    };
  }

  function reply(status, body) {
    return { status, body };
  }

  function handleAttack(payload) {
    if (isGameOver()) return reply(400, { error: 'Game over. Reset to start a new match.' });
    const { fromX, fromY, toX, toY, player } = payload;
    if (![fromX, fromY, toX, toY].every(v => Number.isInteger(v))) return reply(400, { error: 'Invalid coordinates' });
    const fromTile = map[fromY] && map[fromY][fromX];
    const toTile = map[toY] && map[toY][toX];
    if (!fromTile) return reply(404, { error: 'Origin tile not found' });
    if (fromTile.owner !== player) return reply(403, { error: 'You must own the source tile' });
    if (!toTile) return reply(404, { error: 'Target tile not found' });
    if (toTile.type === 'water') return reply(400, { error: 'Water tiles cannot be captured' });
    if (toTile.owner === player) return reply(400, { error: 'Tile already owned' });
    const distance = Math.abs(fromX - toX) + Math.abs(fromY - toY);
    if (distance <= 0) return reply(400, { error: 'Source and target must be different' });

    const p = players[player];
    if (!p || p.troops <= 0) return reply(403, { error: 'Not enough troops to attack' });
    const sendPct = clamp(Number(payload.sendPct || 50), 10, 90);
    const troopsSent = Math.max(1, Math.floor(p.troops * (sendPct / 100)));
    p.troops = Math.max(0, p.troops - troopsSent);
    const travelMs = Math.max(800, distance * 250);
    orders.push({
      type: 'attack', player, fromX, fromY, toX, toY,
      fromType: fromTile.type || 'plains',
      troopsSent,
      createdAt: Date.now(),
      arriveAt: Date.now() + travelMs
    });
    const message = `Attack order sent: ${troopsSent} troops from ${fromX},${fromY} to ${toX},${toY}. ETA ${(travelMs / 1000).toFixed(1)}s.`;
    p.lastAction = message;
    return reply(200, {
      message,
      order: { fromX, fromY, toX, toY, troopsSent, travelMs },
      player: { troops: p.troops, workers: p.workers, pop: p.troops + p.workers, gold: p.gold }
    });
  }

  function handleBuilding(payload) {
    if (isGameOver()) return reply(400, { error: 'Game over. Reset to start a new match.' });
    const { x, y, player, type } = payload;
    if (![x, y].every(v => Number.isInteger(v))) return reply(400, { error: 'Invalid coordinates' });
    const tile = map[y] && map[y][x];
    if (!tile) return reply(404, { error: 'Tile not found' });
    if (tile.owner !== player) return reply(403, { error: 'Tile not owned by player' });
    if (tile.building) return reply(400, { error: 'Tile already has a building' });

    const costs = { city: 125, port: 200, silo: 300, defense: 150 };
    const cost = costs[type] || 0;
    if (!cost) return reply(400, { error: 'Unsupported building type' });
    if (type !== 'city' && type !== 'port') return reply(400, { error: 'Building type not yet implemented' });

    const p = players[player];
    if (p.gold < cost) return reply(400, { error: `Not enough gold to build ${type}` });
    p.gold -= cost;
    if (type === 'city') p.cap += 25000;
    updateTile(x, y, { building: type });
    return reply(200, {
      message: type === 'city' ? 'City built' : 'Port built. Enable trade routes!',
      player: { pop: p.troops + p.workers, troops: p.troops, workers: p.workers, gold: p.gold, cap: p.cap }
    });
  }

  function route(method, path, params, payload) {
    if (method === 'GET' && path === '/map') {
      // Copy the row arrays so the client's view isn't swapped out from under it;
      // tile objects themselves are never mutated by the engine.
      return reply(200, { map: map.map(row => row.slice()), ...summary() });
    }

    if (method === 'GET' && path === '/map/diff') {
      const since = parseInt(params.get('since') || '0', 10);
      if (serverTick > MAX_TICK_HISTORY && since < serverTick - MAX_TICK_HISTORY) {
        return reply(200, { needsFullRefresh: true, serverTick });
      }
      const seenTiles = new Set();
      const changes = [];
      for (let t = serverTick; t > since; t--) {
        for (const c of changesByTick.get(t) || []) {
          const key = `${c.x}:${c.y}`;
          if (!seenTiles.has(key)) { seenTiles.add(key); changes.push(c); }
        }
      }
      return reply(200, { needsFullRefresh: false, changes, ...summary() });
    }

    if (method === 'GET' && path === '/player/1') {
      const { player, stats, win, matchId } = summary();
      return reply(200, { player, stats, win, matchId });
    }

    if (method === 'POST' && path === '/player/1/ratio') {
      const normalized = clamp(Number(payload.ratio || 80), 10, 90);
      players.player1.troopRatio = normalized;
      return reply(200, { message: 'Ratio updated', ratio: normalized });
    }

    if (method === 'POST' && path === '/reset') {
      initGame();
      return reply(200, { message: 'Game reset', map: map.map(row => row.slice()), player: getPlayer('player1'), stats: computeMapStats(), matchId: 'default' });
    }

    if (method === 'POST' && path === '/start') {
      const startX = Number.isFinite(payload.startX) ? payload.startX : 22;
      const startY = Number.isFinite(payload.startY) ? payload.startY : 78;
      quickRestart(startX, startY);
      return reply(200, { message: 'Game started', player: getPlayer('player1'), matchId: 'default', startX, startY });
    }

    if (path.startsWith('/tile/')) {
      const parts = path.split('/');
      const x = parseInt(parts[2], 10);
      const y = parseInt(parts[3], 10);
      if (method === 'GET') return reply(200, (map[y] && map[y][x]) || {});
      if (method === 'POST') return reply(200, { tile: updateTile(x, y, payload) });
    }

    if (method === 'POST' && path === '/action/attack') return handleAttack(payload);
    if (method === 'POST' && path === '/building') return handleBuilding(payload);

    return reply(404, { error: `No demo route for ${method} ${path}` });
  }

  // ── Boot + fetch shim ───────────────────────────────────────────────────────
  const ready = fetch(SEED_URL)
    .then(res => {
      if (!res.ok) throw new Error(`Could not load ${SEED_URL} (${res.status})`);
      return res.json();
    })
    .then(packed => {
      seed = [];
      for (let y = 0; y < packed.height; y++) {
        const row = [];
        for (let x = 0; x < packed.width; x++) {
          const i = y * packed.width + x;
          row.push({ type: packed.types[packed.t[i]], country: packed.countries[packed.c[i]] });
        }
        seed.push(row);
      }
      initGame();
      setInterval(growPopulationTick, 1000);
      setInterval(botAttackTick, 2500);
      setInterval(processAttackOrdersTick, 500);
      setInterval(flushTick, 2500);
    });

  // A minimal Response stand-in: avoids JSON-serialising the 192K-tile map on
  // every request, which is what a real Response would force us to do.
  function fakeResponse({ status, body }) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body)
    };
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return nativeFetch(input, init);
    }
    await ready;
    const method = (init.method || 'GET').toUpperCase();
    const path = url.pathname.replace(/^\/api/, '');
    let payload = {};
    try { payload = init.body ? JSON.parse(init.body) : {}; } catch (_) { /* keep {} */ }
    try {
      return fakeResponse(route(method, path, url.searchParams, payload));
    } catch (err) {
      console.error(err);
      return fakeResponse(reply(500, { error: err.message }));
    }
  };

  window.DemoEngine = { ready };
})();
