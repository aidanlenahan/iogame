# Tech Stack Specification: OpenFront.io Remake
**Target Environment:** Ubuntu VM (4 vCPU, 4GB RAM, 32GB SSD)

## 1. Core Architecture: The "Stateful" Model
To handle real-time troop movements and 80% land calculations without lag, we use a stateful server-authoritative model.

### 2. Backend (Logic & Real-time)
* **Language:** **Node.js (TypeScript)**
    * *Why:* Fast I/O for WebSockets and shared types between frontend/backend to prevent combat formula errors.
* **Communication:** **Socket.io**
    * *Why:* Handles binary data packets (faster than JSON) and automatic reconnections for mobile/browser users.
* **Concurrency:** **Cluster Mode (PM2)**
    * *Why:* Utilizes all 4 vCPUs of the VM by running 4 instances of the game server.

### 3. Frontend (Rendering)
* **Framework:** **React**
    * *Why:* Efficiently manages the UI (Build menus, Leaderboards, Chat).
* **Game Canvas:** **PixiJS (WebGL)**
    * *Why:* Standard HTML cannot render 10,000+ interactive tiles. PixiJS offloads the map rendering to the user's GPU, keeping your server RAM free.

### 4. Data Layer (Performance First)
* **In-Memory (Hot Data):** **Redis**
    * *Why:* Stores current match data (who owns which tile). 
    * *Constraint:* Capped at 1GB RAM to protect the VM.
* **Persistent (Cold Data):** **SQLite**
    * *Why:* Low storage overhead compared to Postgres. Perfect for user accounts and map templates on a 32GB drive.

### 5. Infrastructure
* **Containerization:** **Docker + Docker Compose**
    * *Why:* Ensures the environment is identical during dev and production.
* **Reverse Proxy:** **Nginx**
    * *Why:* Handles SSL termination and protects the Node.js app from direct internet exposure.