# Ubuntu Setup Guide: OpenFront Tech Stack

Follow these steps in order to configure your 4GB RAM Ubuntu VM.

### 1. System Preparation
Update the OS and install the core Docker engine.
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install docker.io docker-compose -y
sudo systemctl enable --now docker
```

### 2. Optimize for 4GB RAM
Create a Swap file. This acts as "Emergency RAM" on your 32GB SSD to prevent the game server from crashing if Redis peaks.
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Make it permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3. The Docker Compose Structure
Create a folder for your project and create a `docker-compose.yml` file. This defines how your stack talks to each other.

```yaml
version: '3.8'
services:
  # The Game Logic
  backend:
    image: node:20-alpine
    restart: always
    deploy:
      resources:
        limits:
          memory: 1.5G # Cap RAM usage
    ports:
      - "3000:3000"
    volumes:
      - ./backend:/app
    command: npm run start

  # The High-Speed Cache
  redis:
    image: redis:alpine
    command: redis-server --maxmemory 1gb --maxmemory-policy allkeys-lru
    deploy:
      resources:
        limits:
          memory: 1G

  # The Gateway
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

### 4. Project Initialization
1.  **Clone your repo** (or create the folders `backend` and `frontend`).
2.  **Inside /backend**: Run `npm init` and install `socket.io` and `typescript`.
3.  **Inside /frontend**: Run `npx create-react-app` and install `pixi.js`.
4.  **Launch the stack**:
    ```bash
    sudo docker-compose up -d
    ```

### 5. Verifying the Setup
Check if your containers are respecting the 4GB limit:
```bash
sudo docker stats
```
This command will show you exactly how much CPU and RAM each part of your game is using in real-time.