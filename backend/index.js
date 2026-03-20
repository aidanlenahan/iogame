const { createClient } = require('redis');
const http = require('http');

const redisClient = createClient({ url: 'redis://redis:6379' });
redisClient.on('error', err => console.error('Redis Client Error', err));

async function safeHSet(key, data) {
  if (Array.isArray(data)) {
    return await safeHSet(key, ...data);
  }
  if (typeof data !== 'object' || data === null) {
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
  return await safeHSet(key, normalized);
}

function pickTerrain(x, y) {
  const p = Math.random();
  if (p < 0.55) return 'plains';
  if (p < 0.75) return 'desert';
  if (p < 0.87) return 'mountain';
  if (p < 0.97) return 'water';
  return 'radioactive';
}

function computeMapStats(map) {
  let total = 0;
  let nonRadioactive = 0;
  let owned = 0;
  for (const row of map) {
    for (const tile of row) {
      total += 1;
      if (tile.type !== 'radioactive') nonRadioactive += 1;
      if (tile.owner === 'player1' && tile.type !== 'radioactive') owned += 1;
    }
  }
  const controlPct = nonRadioactive === 0 ? 0 : Number(((owned / nonRadioactive) * 100).toFixed(1));
  return { total, nonRadioactive, owned, controlPct };
}

async function getMap() {
  const raw = await redisClient.get('map_grid');
  if (!raw) return null;
  return JSON.parse(raw);
}

async function getPlayer(playerId) {
  const p = await redisClient.hGetAll(`player:${playerId}`);
  if (!p || Object.keys(p).length === 0) return null;
  return { pop: Number(p.pop || 0), gold: Number(p.gold || 0) };
}

async function updateTile(x, y, update) {
  const current = await redisClient.hGetAll(`tile:${x}:${y}`);
  if (!current || Object.keys(current).length === 0) return null;
  const merged = {
    owner: update.owner ?? current.owner,
    type: update.type ?? current.type,
    pop: update.pop ?? Number(current.pop || 0),
    building: update.building ?? current.building ?? ''
  };
  await safeHSet(`tile:${x}:${y}`, {
    owner: merged.owner,
    type: merged.type,
    pop: String(merged.pop),
    building: String(merged.building)
  });
  const mapRaw = await redisClient.get('map_grid');
  if (mapRaw) {
    const map = JSON.parse(mapRaw);
    if (map[y] && map[y][x]) {
      map[y][x] = merged;
      await redisClient.set('map_grid', JSON.stringify(map));
    }
  }
  return merged;
}

async function growPopulationTick() {
  const map = await getMap();
  if (!map) return;
  let ownedCount = 0;
  for (const row of map) {
    for (const tile of row) {
      if (tile.owner === 'player1' && tile.type !== 'water') ownedCount += 1;
    }
  }

  const growth = ownedCount * 3;
  const playerKey = 'player:player1';
  const existing = await redisClient.hGetAll(playerKey);
  if (!existing || Object.keys(existing).length === 0) {
    await safeHSet(playerKey, { pop: String(growth), gold: '1000', cap: String(100000) });
    return;
  }

  const cap = Number(existing.cap || 100000);
  const newPop = Math.min(cap, Number(existing.pop || 0) + growth);
  await safeHSet(playerKey, { pop: String(newPop), gold: String(Number(existing.gold || 0)), cap: String(cap) });
}

async function initGame() {
  await redisClient.connect();
  console.log('Connected to Redis!');

  const mapInitialized = await redisClient.exists('map_initialized');
  if (!mapInitialized) {
    console.log('Generating World Map...');
    const map = [];
    for (let y = 0; y < 100; y++) {
      const row = [];
      for (let x = 0; x < 100; x++) {
        const type = pickTerrain(x, y);
        const owner = (x === 0 && y === 0) ? 'player1' : 'neutral';
        const pop = type === 'water' ? 0 : 1;
        const tile = { owner, type, pop, building: '' };
        row.push(tile);
        await safeHSet(`tile:${x}:${y}`, { owner: tile.owner, type: tile.type, pop: String(tile.pop), building: tile.building || '' });
      }
      map.push(row);
    }
    await redisClient.set('map_grid', JSON.stringify(map));
    await safeHSet('player:player1', { pop: '1000', gold: '1000', cap: '100000' });
    await redisClient.set('map_initialized', 'true');
    console.log('Map generation complete.');
  }
  const hasPlayer1 = await redisClient.exists('player:player1');
  if (!hasPlayer1) await safeHSet('player:player1', { pop: '1000', gold: '1000', cap: '100000' });
}

async function start() {
  await initGame();
  setInterval(growPopulationTick, 1000);

  const server = http.createServer(async (req, res) => {
    try {
      const path = req.url.startsWith('/api/') ? req.url.slice(4) : req.url;

      if (req.method === 'GET' && path === '/map') {
        const map = await getMap();
        const player = await getPlayer('player1');
        const stats = map ? computeMapStats(map) : { total: 0, nonRadioactive: 0, owned: 0, controlPct: 0 };
        const win = stats.controlPct >= 80;
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ map, player, stats, win }));
        return;
      }

      if (req.method === 'GET' && path === '/player/1') {
        const player = await getPlayer('player1');
        const map = await getMap();
        const stats = map ? computeMapStats(map) : { total: 0, nonRadioactive: 0, owned: 0, controlPct: 0 };
        const win = stats.controlPct >= 80;
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ player, stats, win }));
        return;
      }

      if (req.method === 'GET' && path.startsWith('/tile/')) {
        const parts = path.split('/');
        const x = parseInt(parts[2], 10);
        const y = parseInt(parts[3], 10);
        const tile = await redisClient.hGetAll(`tile:${x}:${y}`);
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
        const updated = await updateTile(x, y, update);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ tile: updated }));
        return;
      }

      if (req.method === 'POST' && path === '/action/attack') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = body ? JSON.parse(body) : {};
        const { fromX, fromY, toX, toY, player } = payload;

        if ([fromX, fromY, toX, toY].some(v => Number.isNaN(v))) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Invalid coordinates' }));
          return;
        }

        if (Math.abs(fromX - toX) + Math.abs(fromY - toY) !== 1) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Target must be adjacent' }));
          return;
        }

        const fromTile = await redisClient.hGetAll(`tile:${fromX}:${fromY}`);
        const toTile = await redisClient.hGetAll(`tile:${toX}:${toY}`);
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

        if (toTile.owner === player) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Tile already owned' }));
          return;
        }

        const attackerBase = Number(fromTile.pop || 1) * 10;
        const defenderBase = Number(toTile.pop || 1) * 8;
        const terrainAttackBonus = fromTile.type === 'plains' ? 1.2 : fromTile.type === 'mountain' ? 0.9 : 1;
        const terrainDefenseBonus = toTile.type === 'mountain' ? 1.3 : toTile.type === 'plains' ? 0.9 : 1;
        const attackerStrength = Math.round(attackerBase * terrainAttackBonus);
        const defenderStrength = Math.round(defenderBase * terrainDefenseBonus);

        const playerKey = `player:${player}`;
        const playerState = await redisClient.hGetAll(playerKey);
        let playerPop = Number(playerState.pop || 0);
        if (playerPop <= 0) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Not enough population to attack' }));
          return;
        }

        const casualty = Math.max(1, Math.round(attackerStrength * 0.12));
        playerPop = Math.max(0, playerPop - casualty);
        await safeHSet(playerKey, { pop: String(playerPop), gold: String(Number(playerState.gold || 0)), cap: String(Number(playerState.cap || 100000)) });

        let result;
        if (attackerStrength >= defenderStrength) {
          const captured = await updateTile(toX, toY, { owner: player, pop: 1 });
          result = { message: `Victory! Captured ${toX},${toY} (atk ${attackerStrength} vs def ${defenderStrength}, -${casualty} pop).`, tile: captured, player: { pop: playerPop, gold: Number(playerState.gold || 0) } };
        } else {
          result = { message: `Defeat. Attack failed (atk ${attackerStrength} vs def ${defenderStrength}, -${casualty} pop).`, player: { pop: playerPop, gold: Number(playerState.gold || 0) } };
        }

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'POST' && path === '/building') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = body ? JSON.parse(body) : {};
        const { x, y, player, type } = payload;

        if (![x, y].every(v => Number.isInteger(v))) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Invalid coordinates' }));
          return;
        }

        const tile = await redisClient.hGetAll(`tile:${x}:${y}`);
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

        const cityCost = 125;
        const playerKey = `player:${player}`;
        const playerState = await redisClient.hGetAll(playerKey);
        let gold = Number(playerState.gold || 0);
        let cap = Number(playerState.cap || 100000);

        if (type === 'city') {
          if (gold < cityCost) {
            res.writeHead(400, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ error: 'Not enough gold to build city' }));
            return;
          }
          gold -= cityCost;
          cap += 25000;
          await safeHSet(playerKey, { pop: String(Number(playerState.pop || 0)), gold: String(gold), cap: String(cap) });
          await updateTile(x, y, { building: 'city' });
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ message: 'City built', player: { pop: Number(playerState.pop || 0), gold, cap } }));
          return;
        }

        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: 'Unsupported building type' }));
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
