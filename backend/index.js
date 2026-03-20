const { createClient } = require('redis');
const http = require('http');

// 1. Connect to Redis (using the service name from docker-compose)
const redisClient = createClient({
    url: 'redis://redis:6379'
});

redisClient.on('error', err => console.log('Redis Client Error', err));

async function initGame() {
    await redisClient.connect();
    console.log("Connected to Redis!");

    // 2. Initialize a 100x100 Map Grid in Redis if it doesn't exist
    // We store tiles as "tile:x:y" -> { owner: "neutral", type: "plains", pop: 0 }
    const mapExists = await redisClient.exists('map_initialized');
    if (!mapExists) {
        console.log("Generating World Map...");
        for (let x = 0; x < 100; x++) {
            for (let y = 0; y < 100; y++) {
                await redisClient.hSet(`tile:${x}:${y}`, {
                    owner: 'neutral',
                    type: Math.random() > 0.1 ? 'plains' : 'mountain',
                    pop: 0
                });
            }
        }
        await redisClient.set('map_initialized', 'true');
        console.log("Map Generation Complete.");
    }
}

initGame();

// 3. Simple API to check a tile status
const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/tile/')) {
        const coords = req.url.split('/');
        const x = coords[2];
        const y = coords[3];
        const data = await redisClient.hGetAll(`tile:${x}:${y}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    } else {
        res.writeHead(200);
        res.end('OpenFront Engine is Running. Map is Initialized.');
    }
});

server.listen(3000);
