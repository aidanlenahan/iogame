const { createClient } = require('redis');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SEED_PATH = path.join(__dirname, 'data', 'world_map_seed.json');
let worldSeed = null;
function loadSeed() {
  if (!worldSeed) {
    worldSeed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    console.log(`Loaded world seed: ${worldSeed[0].length}x${worldSeed.length}`);
  }
  return worldSeed;
}

const redisClient = createClient({ url: 'redis://redis:6379' });
redisClient.on('error', err => console.error('Redis Client Error', err));

async function safeHSet(key, data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('safeHSet requires object field/value map');
  }
  const normalized = {};
  for (const [field, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null) {
      console.error('safeHSet got an object value', { key, field, value });
      throw new Error(`hSet field ${field} for key ${key} cannot be object`);
    }
    normalized[field] = String(value);
  }
  return await redisClient.hSet(key, normalized);
}


function computeMapStats(map) {
  let total = 0;
  let nonRadioactive = 0;
  const ownership = {};
  for (const row of map) {
    for (const tile of row) {
      total += 1;
      if (tile.type !== 'radioactive') nonRadioactive += 1;
      if (tile.type !== 'radioactive') {
        ownership[tile.owner] = (ownership[tile.owner] || 0) + 1;
      }
    }
  }
  const playerStats = {};
  for (const [owner, count] of Object.entries(ownership)) {
    playerStats[owner] = nonRadioactive === 0 ? 0 : Number(((count / nonRadioactive) * 100).toFixed(1));
  }
  return { total, nonRadioactive, ownership, playerStats };
}

async function getMap(matchId = 'default') {
  const raw = await redisClient.get(`match:${matchId}:map_grid`);
  if (!raw) return null;
  return JSON.parse(raw);
}

async function getPlayer(playerId, matchId = 'default') {
  const p = await redisClient.hGetAll(`match:${matchId}:player:${playerId}`);
  if (!p || Object.keys(p).length === 0) return null;
  const troops = Number(p.troops || 0);
  const workers = Number(p.workers || 0);
  const eliminated = p.eliminated === 'true';
  return {
    pop: troops + workers,
    troops,
    workers,
    gold: Number(p.gold || 0),
    cap: Number(p.cap || 100000),
    troopRatio: Number(p.troopRatio || 80),
    eliminated
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function getGameState(matchId = 'default') {
  const map = await getMap(matchId);
  const player = await getPlayer('player1', matchId);
  const stats = map ? computeMapStats(map) : { total: 0, nonRadioactive: 0, ownership: {}, playerStats: {} };
  const controlPct = stats.playerStats['player1'] || 0;
  return {
    win: controlPct >= 80,
    eliminated: player?.eliminated || false,
    controlPct,
    player,
    stats
  };
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

async function getPendingAttackCount(playerId, matchId = 'default') {
  const orderKeys = await redisClient.keys(`match:${matchId}:order:*`);
  let count = 0;
  for (const key of orderKeys) {
    const order = await redisClient.hGetAll(key);
    if (!order || Object.keys(order).length === 0) continue;
    if (order.type !== 'attack') continue;
    if (order.player !== playerId) continue;
    if (Number(order.arriveAt || 0) <= Date.now()) continue;
    count += 1;
  }
  return count;
}

async function processAttackOrdersTick(matchId = 'default') {
  const now = Date.now();
  const orderKeys = await redisClient.keys(`match:${matchId}:order:*`);
  for (const key of orderKeys) {
    const order = await redisClient.hGetAll(key);
    if (!order || Object.keys(order).length === 0) continue;
    if (order.type !== 'attack') continue;

    const arriveAt = Number(order.arriveAt || 0);
    if (arriveAt > now) continue;

    const player = order.player;
    const toX = asInt(order.toX);
    const toY = asInt(order.toY);
    const fromType = order.fromType || 'plains';
    const troopsSent = Math.max(1, asInt(order.troopsSent, 1));

    const toTile = await redisClient.hGetAll(`match:${matchId}:tile:${toX}:${toY}`);
    if (!toTile || Object.keys(toTile).length === 0) {
      await redisClient.del(key);
      continue;
    }

    if (toTile.type === 'water') {
      await redisClient.del(key);
      continue;
    }

    if (toTile.owner === player) {
      await redisClient.del(key);
      continue;
    }

    const attackerBase = troopsSent;
    const defenderBase = Math.max(1, Number(toTile.pop || 1) * 8);
    const terrainAttackBonus = fromType === 'plains' ? 1.2 : fromType === 'mountain' ? 0.9 : 1;
    const terrainDefenseBonus = toTile.type === 'mountain' ? 1.3 : toTile.type === 'plains' ? 0.9 : 1;
    const attackerStrength = Math.max(1, Math.round(attackerBase * terrainAttackBonus));
    const defenderStrength = Math.max(1, Math.round(defenderBase * terrainDefenseBonus));

    let actionMessage;
    if (attackerStrength >= defenderStrength) {
      await updateTile(toX, toY, { owner: player, pop: 1 }, matchId);
      actionMessage = `Order resolved: captured ${toX},${toY} (atk ${attackerStrength} vs def ${defenderStrength}).`;
    } else {
      actionMessage = `Order resolved: failed at ${toX},${toY} (atk ${attackerStrength} vs def ${defenderStrength}).`;
    }

    const playerKey = `match:${matchId}:player:${player}`;
    const playerState = await redisClient.hGetAll(playerKey);
    if (playerState && Object.keys(playerState).length > 0) {
      await safeHSet(playerKey, {
        troops: String(Number(playerState.troops || 0)),
        workers: String(Number(playerState.workers || 0)),
        pop: String(Number(playerState.troops || 0) + Number(playerState.workers || 0)),
        gold: String(Number(playerState.gold || 0)),
        cap: String(Number(playerState.cap || 100000)),
        troopRatio: String(Number(playerState.troopRatio || 80)),
        eliminated: String(playerState.eliminated || 'false'),
        lastAction: actionMessage,
        lastActionAt: String(Date.now())
      });
    }

    await redisClient.del(key);
  }
}

async function updateTile(x, y, update, matchId = 'default') {
  const current = await redisClient.hGetAll(`match:${matchId}:tile:${x}:${y}`);
  if (!current || Object.keys(current).length === 0) return null;
  const merged = {
    owner:    update.owner    ?? current.owner,
    type:     update.type     ?? current.type,
    country:  update.country  ?? current.country ?? '',
    pop:      update.pop      ?? Number(current.pop || 0),
    building: update.building ?? current.building ?? ''
  };

  // Water is never ownable; keep it neutral and non-buildable.
  if (merged.type === 'water') {
    merged.owner = 'neutral';
    merged.pop = 0;
    merged.building = '';
  }

  await safeHSet(`match:${matchId}:tile:${x}:${y}`, {
    owner:    merged.owner,
    type:     merged.type,
    country:  merged.country,
    pop:      String(merged.pop),
    building: String(merged.building)
  });
  const mapRaw = await redisClient.get(`match:${matchId}:map_grid`);
  if (mapRaw) {
    const map = JSON.parse(mapRaw);
    if (map[y] && map[y][x]) {
      map[y][x] = merged;
      await redisClient.set(`match:${matchId}:map_grid`, JSON.stringify(map));
    }
  }
  return merged;
}

async function growPopulationTick(matchId = 'default') {
  const map = await getMap(matchId);
  if (!map) return;
  
  const playerTiles = {};
  for (const row of map) {
    for (const tile of row) {
      if (tile.owner && tile.owner !== 'neutral' && tile.type !== 'water') {
        playerTiles[tile.owner] = (playerTiles[tile.owner] || 0) + 1;
      }
    }
  }

  for (const playerKey of Object.keys(playerTiles)) {
    const fullKey = `match:${matchId}:player:${playerKey}`;
    const existing = await redisClient.hGetAll(fullKey);
    if (!existing || Object.keys(existing).length === 0) continue;

    const eliminated = existing.eliminated === 'true';
    if (eliminated) continue;

    if (playerTiles[playerKey] === 0) {
      await safeHSet(fullKey, { eliminated: 'true', ...existing });
      continue;
    }

    let troops = Number(existing.troops || 0);
    let workers = Number(existing.workers || 0);
    const gold = Number(existing.gold || 0);
    const cap = Number(existing.cap || 100000);
    const troopRatio = clamp(Number(existing.troopRatio || 80), 10, 90);

    const ownedCount = playerTiles[playerKey];
    const growth = ownedCount * 3;
    const troopGrowth = Math.floor(growth * (troopRatio / 100));
    const workerGrowth = growth - troopGrowth;

    troops = clamp(troops + troopGrowth, 0, cap);
    workers = clamp(workers + workerGrowth, 0, cap - troops);
    const totalPop = clamp(troops + workers, 0, cap);

    const goldIncome = Math.floor(ownedCount * 0.25 + workers * 0.5 + 5);
    const newGold = Math.max(0, gold + goldIncome);

    await safeHSet(fullKey, {
      troops: String(troops),
      workers: String(workers),
      gold: String(newGold),
      cap: String(cap),
      troopRatio: String(troopRatio),
      pop: String(totalPop),
      eliminated: String(eliminated)
    });
  }

  // Mark any known player with 0 tiles as eliminated
  const allKnownPlayers = await redisClient.keys(`match:${matchId}:player:*`);
  for (const fullKey of allKnownPlayers) {
    const pid = fullKey.replace(`match:${matchId}:player:`, '');
    if (playerTiles[pid]) continue;
    const existing = await redisClient.hGetAll(fullKey);
    if (!existing || Object.keys(existing).length === 0) continue;
    if (existing.eliminated === 'true') continue;
    console.log(`Player ${pid} has no tiles, marking eliminated`);
    await safeHSet(fullKey, { ...existing, eliminated: 'true' });
  }
}

async function initGame(matchId = 'default', startX = 10, startY = 35, botX = 130, botY = 35) {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log('Connected to Redis!');
  }

  const mapKey = `match:${matchId}:map_grid`;
  const initKey = `match:${matchId}:map_initialized`;
  const mapInitialized = await redisClient.exists(initKey);
  if (!mapInitialized) {
    console.log(`Loading world seed for match ${matchId}...`);
    const seed = loadSeed();
    const height = seed.length;       // 80
    const width  = seed[0].length;    // 160
    const map = [];

    // Find nearest land cell to a requested spawn coordinate
    function nearestLand(tx, ty) {
      if (seed[ty] && seed[ty][tx] && seed[ty][tx].type !== 'water') return { x: tx, y: ty };
      for (let r = 1; r < 20; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = tx + dx, ny = ty + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (seed[ny][nx].type !== 'water') return { x: nx, y: ny };
          }
        }
      }
      return { x: tx, y: ty };
    }

    const p1spawn  = nearestLand(startX, startY);
    const bot1spawn = nearestLand(botX, botY);

    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const seedTile = seed[y][x];
        let owner = 'neutral';
        if (x === p1spawn.x  && y === p1spawn.y)  owner = 'player1';
        if (x === bot1spawn.x && y === bot1spawn.y) owner = 'bot1';
        const tile = {
          owner,
          type:     seedTile.type,
          country:  seedTile.country || '',
          pop:      seedTile.type === 'water' ? 0 : 1,
          building: ''
        };
        row.push(tile);
        await safeHSet(`match:${matchId}:tile:${x}:${y}`, {
          owner: tile.owner,
          type:  tile.type,
          country: tile.country,
          pop:   String(tile.pop),
          building: ''
        });
      }
      map.push(row);
    }
    await redisClient.set(mapKey, JSON.stringify(map));
    await safeHSet(`match:${matchId}:player:player1`, { pop: '1000', troops: '800', workers: '200', gold: '1000', cap: '100000', troopRatio: '80', eliminated: 'false' });
    await safeHSet(`match:${matchId}:player:bot1`,    { pop: '500',  troops: '400', workers: '100', gold: '500',  cap: '100000', troopRatio: '80', eliminated: 'false' });
    await redisClient.set(initKey, 'true');
    console.log(`World map loaded for match ${matchId} (${width}x${height}).`);
  }
  const hasPlayer1 = await redisClient.exists(`match:${matchId}:player:player1`);
  if (!hasPlayer1) {
    await safeHSet(`match:${matchId}:player:player1`, { pop: '1000', troops: '800', workers: '200', gold: '1000', cap: '100000', troopRatio: '80', eliminated: 'false' });
    await safeHSet(`match:${matchId}:player:bot1`, { pop: '500', troops: '400', workers: '100', gold: '500', cap: '100000', troopRatio: '80', eliminated: 'false' });
  }
}


function getNeighbors(x, y, width, height) {
  const dirs = [ [1,0], [-1,0], [0,1], [0,-1] ];
  return dirs.map(([dx,dy]) => ({ x: x+dx, y: y+dy })).filter(p => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height);
}

async function botAttackTick(matchId = 'default') {
  const map = await getMap(matchId);
  if (!map || !map.length) return;
  const width = map[0].length;
  const height = map.length;
  const botTiles = {};
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = map[y][x];
      if (tile.owner && tile.owner.startsWith('bot')) {
        if (!botTiles[tile.owner]) botTiles[tile.owner] = [];
        botTiles[tile.owner].push({ x, y, tile });
      }
    }
  }
  
  for (const [botId, tiles] of Object.entries(botTiles)) {
    if (!tiles.length) continue;
    const attacker = tiles[Math.floor(Math.random() * tiles.length)];
    const neighbors = getNeighbors(attacker.x, attacker.y, width, height);
    const neutral = neighbors.filter(n => map[n.y][n.x].owner === 'neutral' && map[n.y][n.x].type !== 'water');
    if (!neutral.length) continue;
    const target = neutral[Math.floor(Math.random() * neutral.length)];
    await updateTile(target.x, target.y, { owner: botId, pop: 1 }, matchId);
  }
}

async function resetGame(matchId = 'default') {
  await redisClient.del(`match:${matchId}:map_initialized`);
  for (const key of await redisClient.keys(`match:${matchId}:tile:*`)) {
    await redisClient.del(key);
  }
  for (const key of await redisClient.keys(`match:${matchId}:order:*`)) {
    await redisClient.del(key);
  }
  for (const key of await redisClient.keys(`match:${matchId}:player:*`)) {
    await redisClient.del(key);
  }
  await redisClient.del(`match:${matchId}:map_grid`);
}

async function start() {
  await initGame();
  setInterval(() => growPopulationTick('default'), 1000);
  setInterval(() => botAttackTick('default'), 2500);
  setInterval(() => processAttackOrdersTick('default'), 500);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname.replace(/^\/api/, '');
      const matchId = url.searchParams.get('matchId') || 'default';

      if (req.method === 'GET' && path === '/map') {
        const map = await getMap(matchId);
        const player = await getPlayer('player1', matchId);
        const pendingAttacks = await getPendingAttackCount('player1', matchId);
        const stats = map ? computeMapStats(map) : { total: 0, nonRadioactive: 0, ownership: {}, playerStats: {} };
        const player1ControlPct = stats.playerStats['player1'] || 0;
        const win = player1ControlPct >= 80;
        const allPlayerKeys = await redisClient.keys(`match:${matchId}:player:*`);
        const scoreboard = [];
        for (const key of allPlayerKeys) {
          const pid = key.replace(`match:${matchId}:player:`, '');
          const pd = await redisClient.hGetAll(key);
          scoreboard.push({
            id: pid,
            troops: Number(pd.troops || 0),
            workers: Number(pd.workers || 0),
            gold: Number(pd.gold || 0),
            eliminated: pd.eliminated === 'true',
            controlPct: stats.playerStats[pid] || 0
          });
        }
        scoreboard.sort((a, b) => b.controlPct - a.controlPct);
        const gameState = { map, player, stats: { ...stats, controlPct: player1ControlPct, pendingAttacks }, win, matchId, scoreboard };
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(gameState));
        return;
      }

      if (req.method === 'GET' && path === '/player/1') {
        const player = await getPlayer('player1', matchId);
        const map = await getMap(matchId);
        const pendingAttacks = await getPendingAttackCount('player1', matchId);
        const stats = map ? computeMapStats(map) : { total: 0, nonRadioactive: 0, ownership: {}, playerStats: {} };
        const player1ControlPct = stats.playerStats['player1'] || 0;
        const win = player1ControlPct >= 80;
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ player, stats: { ...stats, controlPct: player1ControlPct, pendingAttacks }, win, matchId }));
        return;
      }

      if (req.method === 'POST' && path === '/player/1/ratio') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = body ? JSON.parse(body) : {};
        const ratio = Number(payload.ratio || 80);
        const normalized = clamp(ratio, 10, 90);
        const playerState = await redisClient.hGetAll(`match:${matchId}:player:player1`);
        const troops = Number(playerState.troops || 0);
        const workers = Number(playerState.workers || 0);
        const gold = Number(playerState.gold || 0);
        const cap = Number(playerState.cap || 100000);
        const eliminated = playerState.eliminated || 'false';
        await safeHSet(`match:${matchId}:player:player1`, { troops: String(troops), workers: String(workers), pop: String(troops + workers), gold: String(gold), cap: String(cap), troopRatio: String(normalized), eliminated });
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ message: 'Ratio updated', ratio: normalized }));
        return;
      }

      if (req.method === 'POST' && path === '/reset') {
        await resetGame(matchId);
        await initGame(matchId);
        const map = await getMap(matchId);
        const player = await getPlayer('player1', matchId);
        const stats = computeMapStats(map);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ message: 'Game reset', map, player, stats, matchId }));
        return;
      }

      if (req.method === 'POST' && path === '/start') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = body ? JSON.parse(body) : {};
        const startX = Number.isInteger(payload.startX) ? payload.startX : 10;
        const startY = Number.isInteger(payload.startY) ? payload.startY : 35;
        const botX = Number.isInteger(payload.botX) ? payload.botX : 130;
        const botY = Number.isInteger(payload.botY) ? payload.botY : 35;
        await resetGame(matchId);
        await initGame(matchId, startX, startY, botX, botY);
        const map = await getMap(matchId);
        const player = await getPlayer('player1', matchId);
        const stats = computeMapStats(map);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ message: 'Game started', map, player, stats, matchId, startX, startY }));
        return;
      }

      if (req.method === 'GET' && path.startsWith('/tile/')) {
        const parts = path.split('/');
        const x = parseInt(parts[2], 10);
        const y = parseInt(parts[3], 10);
        const tile = await redisClient.hGetAll(`match:${matchId}:tile:${x}:${y}`);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(tile));
        return;
      }

      if (req.method === 'POST' && path.startsWith('/tile/')) {
        const parts = path.split('/');
        const x = parseInt(parts[2], 10);
        const y = parseInt(parts[3], 10);
        let body = '';
        for await (const chunk of req) body += chunk;
        const update = body ? JSON.parse(body) : {};
        const updated = await updateTile(x, y, update, matchId);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ tile: updated }));
        return;
      }

      if (req.method === 'POST' && path === '/action/attack') {
        const gameState = await getGameState(matchId);
        if (gameState.win || gameState.eliminated) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Game over. Reset to start a new match.' }));
          return;
        }

        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = body ? JSON.parse(body) : {};
        const { fromX, fromY, toX, toY, player } = payload;

        if (![fromX, fromY, toX, toY].every(v => Number.isInteger(v))) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Invalid coordinates' }));
          return;
        }

        const fromTile = await redisClient.hGetAll(`match:${matchId}:tile:${fromX}:${fromY}`);
        const toTile = await redisClient.hGetAll(`match:${matchId}:tile:${toX}:${toY}`);
        if (!fromTile || !fromTile.owner) {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Origin tile not found' }));
          return;
        }

        if (fromTile.owner !== player) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'You must own the source tile' }));
          return;
        }

        if (!toTile || !toTile.owner) {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Target tile not found' }));
          return;
        }

        if (toTile.type === 'water') {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Water tiles cannot be captured' }));
          return;
        }

        if (toTile.owner === player) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Tile already owned' }));
          return;
        }

        const distance = Math.abs(fromX - toX) + Math.abs(fromY - toY);
        if (distance <= 0) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Source and target must be different' }));
          return;
        }

        const playerKey = `match:${matchId}:player:${player}`;
        const playerState = await redisClient.hGetAll(playerKey);
        let troops = Number(playerState.troops || 0);
        let workers = Number(playerState.workers || 0);
        const gold = Number(playerState.gold || 0);
        const cap = Number(playerState.cap || 100000);
        if (troops <= 0) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Not enough troops to attack' }));
          return;
        }

        const sendPct = clamp(Number(payload.sendPct || 50), 10, 90);
        const troopsSent = Math.max(1, Math.floor(troops * (sendPct / 100)));
        troops = Math.max(0, troops - troopsSent);
        const totalPop = troops + workers;
        const eliminated = playerState.eliminated || 'false';
        const travelMs = Math.max(800, distance * 250);
        const orderId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        await safeHSet(`match:${matchId}:order:${orderId}`, {
          type: 'attack',
          player,
          fromX: String(fromX),
          fromY: String(fromY),
          toX: String(toX),
          toY: String(toY),
          fromType: String(fromTile.type || 'plains'),
          troopsSent: String(troopsSent),
          createdAt: String(Date.now()),
          arriveAt: String(Date.now() + travelMs)
        });

        const queueMessage = `Attack order sent: ${troopsSent} troops from ${fromX},${fromY} to ${toX},${toY}. ETA ${(travelMs / 1000).toFixed(1)}s.`;
        await safeHSet(playerKey, {
          troops: String(troops),
          workers: String(workers),
          pop: String(totalPop),
          gold: String(gold),
          cap: String(cap),
          troopRatio: String(Number(playerState.troopRatio || 80)),
          eliminated,
          lastAction: queueMessage,
          lastActionAt: String(Date.now())
        });

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          message: queueMessage,
          order: { fromX, fromY, toX, toY, troopsSent, travelMs },
          player: { troops, workers, pop: totalPop, gold }
        }));
        return;
      }

      if (req.method === 'POST' && path === '/building') {
        const gameState = await getGameState(matchId);
        if (gameState.win || gameState.eliminated) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Game over. Reset to start a new match.' }));
          return;
        }

        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = body ? JSON.parse(body) : {};
        const { x, y, player, type } = payload;

        if (![x, y].every(v => Number.isInteger(v))) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Invalid coordinates' }));
          return;
        }

        const tile = await redisClient.hGetAll(`match:${matchId}:tile:${x}:${y}`);
        if (!tile || !tile.owner) {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Tile not found' }));
          return;
        }

        if (tile.owner !== player) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Tile not owned by player' }));
          return;
        }

        if (tile.building) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Tile already has a building' }));
          return;
        }

        const costs = { city: 125, port: 200, silo: 300, defense: 150 };
        const cost = costs[type] || 0;
        if (!cost) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Unsupported building type' }));
          return;
        }

        const playerKey = `match:${matchId}:player:${player}`;
        const playerState = await redisClient.hGetAll(playerKey);
        let gold = Number(playerState.gold || 0);
        let cap = Number(playerState.cap || 100000);
        let troops = Number(playerState.troops || 0);
        let workers = Number(playerState.workers || 0);
        let troopRatio = Number(playerState.troopRatio || 80);
        const eliminated = playerState.eliminated || 'false';
        const totalPop = troops + workers;

        if (type === 'city') {
          if (gold < cost) {
            res.writeHead(400, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ error: 'Not enough gold to build city' }));
            return;
          }
          gold -= cost;
          cap += 25000;
          await safeHSet(playerKey, { pop: String(totalPop), troops: String(troops), workers: String(workers), gold: String(gold), cap: String(cap), troopRatio: String(troopRatio), eliminated });
          await updateTile(x, y, { building: 'city' }, matchId);
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ message: 'City built', player: { pop: totalPop, troops, workers, gold, cap } }));
          return;
        }

        if (type === 'port') {
          if (gold < cost) {
            res.writeHead(400, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ error: 'Not enough gold to build port' }));
            return;
          }
          gold -= cost;
          await safeHSet(playerKey, { pop: String(totalPop), troops: String(troops), workers: String(workers), gold: String(gold), cap: String(cap), troopRatio: String(troopRatio), eliminated });
          await updateTile(x, y, { building: 'port' }, matchId);
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ message: 'Port built. Enable trade routes!', player: { pop: totalPop, troops, workers, gold, cap } }));
          return;
        }

        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: 'Building type not yet implemented' }));
        return;
      }

      if (req.method === 'POST' && path === '/action/train') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = body ? JSON.parse(body) : {};
        const { fromX, fromY, toX, toY, player } = payload;

        if ([fromX, fromY, toX, toY].some(v => Number.isNaN(v))) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Invalid coordinates' }));
          return;
        }

        const fromTile = await redisClient.hGetAll(`match:${matchId}:tile:${fromX}:${fromY}`);
        const toTile = await redisClient.hGetAll(`match:${matchId}:tile:${toX}:${toY}`);
        if (!fromTile || !fromTile.owner || fromTile.owner !== player) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Invalid origin tile' }));
          return;
        }
        if (!toTile || !toTile.owner || toTile.owner !== player) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Destination must be owned by you' }));
          return;
        }

        if (fromTile.building !== 'city') {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Train must originate from a city' }));
          return;
        }

        const trainKey = `match:${matchId}:train:${fromX}:${fromY}`;
        const distance = Math.abs(toX - fromX) + Math.abs(toY - fromY);
        const trainData = { fromX, fromY, toX, toY, distance, travelTime: distance * 2, createdAt: Date.now() };
        await safeHSet(trainKey, trainData);

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ message: `Train departed from ${fromX},${fromY} to ${toX},${toY}. ETA: ${distance * 2}s`, train: trainData }));
        return;
      }

      if (req.method === 'POST' && path === '/action/ship') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = body ? JSON.parse(body) : {};
        const { fromX, fromY, toX, toY, player } = payload;

        if ([fromX, fromY, toX, toY].some(v => Number.isNaN(v))) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Invalid coordinates' }));
          return;
        }

        const fromTile = await redisClient.hGetAll(`match:${matchId}:tile:${fromX}:${fromY}`);
        const toTile = await redisClient.hGetAll(`match:${matchId}:tile:${toX}:${toY}`);
        
        if (!fromTile || !fromTile.owner || fromTile.owner !== player || fromTile.type !== 'water') {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Ship must originate from water owned by you' }));
          return;
        }
        if (!toTile || !toTile.owner || toTile.owner !== player || toTile.type !== 'water') {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Ship destination must be water owned by you' }));
          return;
        }

        const shipKey = `match:${matchId}:ship:${fromX}:${fromY}`;
        const distance = Math.abs(toX - fromX) + Math.abs(toY - fromY);
        const goldEarned = Math.floor(10000 + 150 * Math.pow(distance, 1.1));
        const shipData = { fromX, fromY, toX, toY, distance, travelTime: distance, goldEarned, createdAt: Date.now() };
        await safeHSet(shipKey, shipData);

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ message: `Trade ship departed from ${fromX},${fromY} to ${toX},${toY}. Gold per trip: ${goldEarned}`, ship: shipData }));
        return;
      }

      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('OpenFront Engine running. Use /api/map or /api/tile/x/y');
    } catch (err) {
      console.error(err);
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(3000, () => {
    console.log('Backend running on port 3000');
  });
}

start();
