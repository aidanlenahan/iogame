# Product Requirements Document (PRD)
# OpenFront.io — Game Remake

**Document Version:** 1.0  
**Date:** March 19, 2026  
**Purpose:** Full specification for remaking OpenFront.io based on all available wiki, guide, and community documentation.

---

## Table of Contents
1. [Game Overview](#1-game-overview)
2. [Victory Conditions](#2-victory-conditions)
3. [Player Types](#3-player-types)
4. [Map & Terrain System](#4-map--terrain-system)
5. [Population & Growth System](#5-population--growth-system)
6. [Gold & Economy System](#6-gold--economy-system)
7. [Buildings](#7-buildings)
8. [Units](#8-units)
9. [Combat System](#9-combat-system)
10. [Naval System](#10-naval-system)
11. [Nuclear Warfare System](#11-nuclear-warfare-system)
12. [Diplomacy & Alliance System](#12-diplomacy--alliance-system)
13. [Player Icons & Status Indicators](#13-player-icons--status-indicators)
14. [Playstyles & Strategies](#14-playstyles--strategies)
15. [UI & Controls](#15-ui--controls)
16. [Maps](#16-maps)
17. [Technical Notes & Formulas](#17-technical-notes--formulas)
18. [Phased Development Roadmap]

---

## 1. Game Overview

OpenFront.io is a **real-time strategy (RTS) browser game** (multiplayer) where players compete to dominate a world map. It combines:

- Territorial expansion
- Economic management
- Diplomatic alliances
- Nuclear warfare

Players compete against other **human players**, **AI bots**, and **Nations** (stronger AI) in real-time matches lasting approximately **10 minutes to 1 hour**.

### Core Loop
1. Spawn on the map and select a starting position
2. Expand territory by capturing neutral land and attacking bots/players
3. Build structures to grow population, generate gold, and develop military power
4. Manage alliances diplomatically
5. Reach 80% of non-irradiated land to win — or eliminate all rivals

---

## 2. Victory Conditions

- **Primary Win Condition:** Control **80% of all non-irradiated land** on the map
- Irradiated (radioactive) tiles from nuclear strikes do **not** count toward any player's percentage
- A player is **eliminated** when they lose all of their territory
- All units belonging to an eliminated player are also removed

---

## 3. Player Types

There are **3 types of players** in every match:

### 3.1 Human Players
- Controlled by real users
- Full access to all game mechanics, diplomacy, and building systems

### 3.2 Bots
- AI-controlled with generated names
- Weakest AI type
- Always attack with exactly **50% of their troops**
- Never build structures or use advanced tactics
- Provide significant gold rewards when defeated
- Can be "annexed" (surrounded and captured instantly)
- Pose a threat to careless players

### 3.3 Nations
- AI-controlled entities based on real-world countries
- Stronger than standard bots
- Have more strategic advantages
- Example: **Russia** on the Europe map typically expands fastest

---

## 4. Map & Terrain System

### 4.1 Available Maps
- **World**
- **Europe**
- **North America**
- **MENA** (Middle East & North Africa)
- **Oceania**
- **Black Sea**
- **Mars**

### 4.2 Terrain Types

| Name | Color | Resistance | Combat Notes |
|---|---|---|---|
| Grass (Plains) | Light Green | None | 15% speed bonus for attackers; 10% fewer casualties |
| Desert (Highlands) | Yellow/Brown | Low | Normal attack speed; standard casualties |
| Mountain | White | High | 25% speed penalty for attackers; 30% more casualties |
| Radioactive | Neon Green | High | Created by nuclear strikes; does not count toward victory % |

### 4.3 Terrain Properties
- Each tile owned provides **+3 population**
- Terrain proportionally increases **maximum population**
- Terrain proportionally increases **population growth rate**
- Troops can be sent on **land** to attack neighboring enemy terrain
- Troops can be sent on **water** from shorelines to attack enemy terrain

### 4.4 Spawn / Starting Position
- Players choose their starting position before the match begins
- **Ideal spawn criteria:**
  - Plains terrain (light green) for fast early expansion
  - Access to water for naval gameplay
  - Multiple bots nearby for easy early gold
  - Distance from other human players
- **Avoid:**
  - Mountain-heavy terrain
  - Being flanked by multiple human players at spawn
  - No coastal access

---

## 5. Population & Growth System

Population is the **core resource** of the game. All military and economic activity scales with it.

### 5.1 Population Basics
- Each owned tile provides **+3 population**
- Cities add **+25,000 population capacity** each
- Population is split between two roles: **Troops** and **Workers**

### 5.2 Population Roles

| Role | Function | Reproduction Rate |
|---|---|---|
| Troops | Attack and defend territory | Base rate |
| Workers | Generate gold income | 30% faster than troops |

### 5.3 Growth Curve
- Population grows **fastest at approximately 42% of maximum capacity**
- Growth slows significantly above **80% capacity**
- Workers reproduce **30% faster** than troops
- Optimal early-game population split: **80–90% troops**, shifting toward workers as the game progresses

### 5.4 Population Management Strategy
- Keep population near **42% of max capacity** for fastest growth during expansion
- Shift to more workers once frontlines stabilize
- Donate troops and gold to allies in coordinated play

---

## 6. Gold & Economy System

**Gold** is the only currency in the game, used to purchase all buildings and units.

### 6.1 Gold Sources
1. **Base income** (passive, scales with territory)
2. **Capturing enemy players** (one-time reward)
3. **Donations** from allies
4. **Trade ships** (passive income between ports)
5. **Trains** (income between connected land-based hubs)

### 6.2 Trade Ship Income Formula
```
Gold earned = 10,000 + 150 × (distance^1.1)
```
Examples:
- 20-tile route → ~13,680 gold
- 200-tile route → ~57,434 gold

Trade income **scales exponentially with distance** — long routes are far more valuable than short ones.

### 6.3 Trade Rules
- Trade ships automatically travel between your ports and other players' ports
- Allied players' ports are **prioritized** for trade
- Trade **stops automatically during active combat** and resumes after **5 minutes**

---

## 7. Buildings

All buildings are constructed via the **Build Menu** (right-click radial menu or Ctrl+Left-click).

---

### 7.1 City

**Purpose:** Increases maximum population capacity  
**Population Bonus:** +25,000 per city  
**Placement Tip:** Build on mountains in central locations, away from borders and coasts

**Cost Structure (doubling):**

| City # | Cost |
|---|---|
| 1st | 125,000 gold |
| 2nd | 250,000 gold |
| 3rd | 500,000 gold |
| 4th+ | 1,000,000 gold |

---

### 7.2 Port

**Purpose:** Enables naval units and generates passive trade income  
**Requirements:** Must be placed on a coastline  

**Functions:**
- Constructs **Warships**
- Generates **automatic Trade Ships** between ports
- Enables **amphibious attacks** across water
- Trade income scales with distance (see formula above)

---

### 7.3 Defense Post

**Purpose:** Provides powerful defensive multipliers to surrounding territory  
**Radius:** 30-tile radius

**Defensive Multipliers:**

| Terrain | Defense Bonus |
|---|---|
| Plains | 4.5× |
| Default | 5× |
| Mountain | 6× (stacks with terrain bonus) |

- Multiple defense posts **do not stack** with each other
- Best used at chokepoints, around cities, and along critical borders

---

### 7.4 Missile Silo

**Purpose:** Enables launching of nuclear weapons  
**Cost:** 1,000,000 gold  
**Strategic Note:** Best placed on islands to prevent easy capture

**Launchable weapons from Missile Silo:**
- Atom Bomb
- Hydrogen Bomb
- MIRV

---

### 7.5 SAM Launcher (Surface-to-Air Missile)

**Purpose:** Intercepts incoming nuclear missiles  
**Cost:** 1,500,000 gold  

| Stat | Value |
|---|---|
| Interception Rate | 75% |
| Range | 75-pixel radius |
| Cooldown | 7.5 seconds |
| Can intercept MIRVs? | ❌ No |

- Multiple SAM launchers should have **overlapping coverage** around key infrastructure
- Multiple quick strikes can **overwhelm** a single SAM due to cooldown

---

### 7.6 Factory

- Listed in the Build Menu
- Produces units (exact production stats not fully documented in current sources)

---

## 8. Units

### 8.1 Troops
- Primary land combat unit
- Split from total population
- Used to attack and defend territory

### 8.2 Workers
- Economic unit split from population
- Generate gold income
- Reproduce 30% faster than troops

### 8.3 Warship

**Purpose:** Naval combat and economic warfare  
**Built from:** Port

| Stat | Value |
|---|---|
| Starting Health | 500 HP |
| Maximum Health | 1,000 HP |
| Damage per Shot | 250 |
| Fire Rate | Every 2 seconds |
| Targeting Range | 130 tiles |

**Functions:**
- Automatically patrols assigned naval areas
- **Captures enemy trade ships** (economic warfare)
- Destroys enemy boats attempting naval invasion
- Controls sea lanes and strategic waterways
- Supports friendly trade routes

---

### 8.4 Transport Ship

**Purpose:** Moves troops across water for amphibious invasions  
**Built from:** Port  

**Usage Notes:**
- Send only **5–10% of troops** via transport ships initially (they can be instantly killed by Warships)
- Larger follow-up attacks can be sent once troops have safely landed
- Islands are ideal for isolating Missile Silos
- Capture island territory at the start for strategic missile placement

---

### 8.5 Trade Ship

**Purpose:** Passive NPC unit that generates gold income between ports  
**Type:** NPC (not directly controlled)  

- Automatically dispatched between ports of different players
- The farther it travels, the more gold it generates (see formula in Section 6.2)
- Can be **captured by enemy Warships** and switched to the capturing player's team

---

### 8.6 Train

**Purpose:** Generates gold income between land-connected hubs  
**Type:** Unit/Transport  
- Operates on land routes between connected train stations/factories
- Listed as a gold source in the economy system

---

### 8.7 Atom Bomb

**Cost:** 750,000 gold  
**Launched from:** Missile Silo  

| Stat | Value |
|---|---|
| Blast Radius | Small (precise) |
| Best Use | Destroying 1–2 enemy structures |
| Interception | Can be intercepted by SAM (75% chance) |

---

### 8.8 Hydrogen Bomb

**Cost:** 5,000,000 gold  
**Launched from:** Missile Silo  

| Stat | Value |
|---|---|
| Blast Radius | Large |
| Best Use | Area denial, destroying clustered infrastructure |
| Interception | Can be intercepted by SAM (75% chance), but can outrange SAMs if aimed correctly |
| Side Effect | Creates radioactive wasteland tiles |

---

### 8.9 MIRV (Multiple Independently Targetable Reentry Vehicle)

**Cost:** 25,000,000 gold  
**Launched from:** Missile Silo  

| Stat | Value |
|---|---|
| Effect | Destroys entire enemy nations |
| Interception | ❌ Cannot be intercepted by any defense |
| Use Case | Decisive late-game elimination |

---

## 9. Combat System

### 9.1 Troop Attack Ratio
- Controlled by the **attack ratio slider**
- Maximum effective attack ratio: **2:1** (anything above provides no additional benefit)
- Common ratio strategies:

| Ratio | Style |
|---|---|
| 10–30% | Conservative — strong defense maintained |
| 30–50% | Balanced expansion |
| 75–80% | Aggressive expansion, vulnerable to counterattack |
| 100% | High risk / high reward, used on single-front conflicts |

### 9.2 Enclosure (Annexation)
- **Completely surrounding** enemy terrain **instantly captures it**
- Zero troop losses on capture
- Works on: bots, human players, neutral territory
- **Cannot annex** territory that touches water or map edges
- Most efficient conquest mechanic in the game

### 9.3 Terrain Resistance in Combat

| Terrain | Attacker Speed | Casualty Rate |
|---|---|---|
| Grass/Plains | +15% | -10% for attacker |
| Desert/Highland | Normal | Normal |
| Mountain | -25% | +30% for attacker |
| Radioactive | High resistance | — |

### 9.4 Elimination
- A player who loses **all terrain** is eliminated
- All of that player's units are destroyed upon elimination

### 9.5 Combat Strategies (from official wiki)
- Capture the **smallest enemies first** to minimize harm
- Be willing to risk losing some terrain to capture enemy buildings and more terrain from large-but-weak enemies
- **Delay connecting with enemy terrain** as long as possible to avoid triggering war prematurely
- At game start, capture as much **wilderness terrain** as possible and send Transport Ships to islands (ideal for missile silos)
- **Join allied attacks** on enemies to share troop losses and gain terrain
- If facing an enemy on **only one front**, raise attack ratios to 80–100%

### 9.6 When to Switch to Defense
- An enemy is invading and is only **1–2 player territories away**
- Enemies are sending **Transport Ships** and you cannot produce a Warship in time

---

## 10. Naval System

### 10.1 Port Requirements
- Must be built on a **coastline tile**
- Unlocks Warship production and Trade Ship generation

### 10.2 Amphibious Attacks
- Troops can be sent across water from shorelines
- Transport Ships carry troops to enemy coastlines
- Warships can intercept and destroy Transport Ships before landing

### 10.3 Naval Combat
- Warships automatically patrol and engage enemies in **130-tile range**
- 250 damage per shot, every 2 seconds
- Warships grow from 500 to 1,000 HP over time
- Warships can **capture Trade Ships** from enemies

### 10.4 Trade Route Optimization
- Build ports on **multiple bodies of water** for income redundancy
- Longer routes = exponentially more gold
- Prioritize ports on **different continents** when possible
- A single long-distance route can outperform dozens of short ones

---

## 11. Nuclear Warfare System

### 11.1 Infrastructure Required
- **Missile Silo** (1,000,000 gold) to launch nukes
- **SAM Launcher** (1,500,000 gold) to defend against nukes

### 11.2 Weapon Comparison

| Weapon | Cost | Radius | Interceptable? | Use Case |
|---|---|---|---|---|
| Atom Bomb | 750,000 | Small | Yes (75%) | Precise structure destruction |
| Hydrogen Bomb | 5,000,000 | Large | Yes (75%), can outrange SAMs | Area denial, clustered targets |
| MIRV | 25,000,000 | Devastating | ❌ No | Full nation elimination |

### 11.3 Radioactive Tiles
- Nuclear strikes create **radioactive terrain** (neon green)
- Radioactive tiles have **high resistance** and are difficult to capture
- Radioactive land **does not count** toward any player's victory percentage
- Radioactive zones are **permanent** within the match

### 11.4 Nuclear Defense Strategy
- Build **overlapping SAM coverage** around cities and key infrastructure
- 75% interception rate is good but not perfect
- Multiple rapid strikes can **overwhelm a single SAM** (7.5s cooldown)
- MIRVs cannot be stopped — they are the ultimate threat

### 11.5 Nuclear Strategy
- **Deterrence:** Having nukes discourages enemies from using theirs
- **First strike:** Eliminate threats before they can respond
- **Economic targeting:** Destroy enemy cities and ports
- **Area denial:** Create radioactive barriers to prevent expansion
- **Silo placement:** Islands are ideal — hard to capture, easy to defend

---

## 12. Diplomacy & Alliance System

### 12.1 Alliance Mechanics
- Players can **send and accept alliance requests** (envelope icon)
- Alliances are **temporary** — they automatically expire after a few minutes
- Allies are shown with a **handshake icon**
- Allied ports are prioritized for trade ship routes

### 12.2 Betrayal Penalty
- When a player **betrays an ally** (breaks an active alliance):
  - They are marked as a **traitor** (broken shield icon)
  - They suffer a **-50% defense penalty for 30 seconds** from all attacks
  - This discourages alliance breaking but does not prevent it

### 12.3 Embargo
- Players can **embargo** other players (crossed dollar sign icon)
- Embargoing stops all trade between the two players

### 12.4 Diplomacy Timeline Strategy

| Phase | Strategy |
|---|---|
| Early Game | Form defensive pacts to focus on bot expansion; ally with players sharing borders with strong bots |
| Mid Game | Share nuclear intelligence; coordinate expansion into different regions |
| Late Game | Plan for inevitable betrayal as victory approaches; betray when 80% land is reachable; use alliances to stop the leading player |

---

## 13. Player Icons & Status Indicators

| Icon | Meaning |
|---|---|
| 👑 Crown | Top of the leaderboard |
| 🛡️ Broken Shield | Traitor — recently betrayed an ally |
| 🤝 Handshake | Current active ally |
| 💲 Crossed Dollar Sign | Embargo — no trade between you and this player |
| ✉️ Envelope | Player has sent you an alliance request |
| ☢️ Radiation Symbol | Player has a nuke currently in flight |
| 💤 Sleeping | Player is AFK or has left the match |

---

## 14. Playstyles & Strategies

### 14.1 Official Playstyle Archetypes

| Name | Location | Objectives | Attack Ratio |
|---|---|---|---|
| Skirmish | Frontline | Max troop production; capture bots fast for gold; rely on ports for money; build 2 cities first | Safe: 30% / Aggressive: 80% / YOLO: 100% |
| Tech | Backline | Max economy, then shift to combat; Option A: spam 2+ Atom Bombs to destroy key buildings; Option B: max cities + troops and donate to frontline allies | 30–100% |

### 14.2 Early Game Sequence (First ~10 Minutes)
1. Wait **2–3 seconds** after spawn for population to stabilize
2. Set attack ratio to **30–35%**
3. Capture all **neutral territory** nearby
4. Wait for **15,000+ population** before attacking bots
5. Build **first city** as soon as 125,000 gold is available

### 14.3 Bot Rush Technique
- Target **weakest bots first**
- Look for **annexation opportunities** — surround bots for zero-loss captures
- Maintain **30–50% population capacity** for optimal growth during expansion
- Save some troops to defend against human player surprise attacks

### 14.4 Mid-Game Development
- Build **3–4 cities** for massive population scaling
- Establish **multiple ports** for diversified trade income
- Develop **nuclear capabilities** for deterrence and offense
- Create **defensive networks** with SAM launchers and defense posts
- Control **chokepoints** to limit enemy movement

### 14.5 Late Game Victory Paths

**Expansion Victory:**
- Rapid annexation of smaller players and remaining bots
- Chain conquests to quickly hit 80% land

**Nuclear Victory:**
- MIRV enemy threats before they can reach 80%
- Destroy enemy infrastructure to cripple growth
- Create radioactive barriers to block expansion

**Diplomatic Victory:**
- Alliance manipulation to prevent any single player from winning
- Calculated betrayals when you can secure the win
- Information warfare to coordinate against the leading player

### 14.6 Common Beginner Mistakes
- Over-expanding early and leaving yourself defenseless
- Ignoring economy (not enough workers or ports)
- Poor city placement (plains terrain or near borders)
- Trusting alliances too much OR refusing all cooperation
- Not building SAM defenses or nuclear deterrence before others have nukes

---

## 15. UI & Controls

### 15.1 Keyboard Hotkeys

| Key | Action |
|---|---|
| Space | Toggle terrain view (see plains/mountains/highlands) |
| W/A/S/D | Move camera |
| C | Center camera on your territory |
| Q / E | Zoom in / Zoom out |
| Shift + Scroll | Adjust attack ratio in 5% increments |
| Left-click | Attack adjacent territory |
| Right-click | Open radial build/diplomacy menu |
| Ctrl + Left-click | Quick access to build menu |

### 15.2 Build Menu
The **Build Menu** is accessible via right-click (radial menu) or Ctrl+Left-click. It contains:

**Buildings:**
- City
- Port
- Defense Post
- Missile Silo
- SAM Launcher
- Factory

**Units:**
- Warship (from Port)
- Transport Ship (from Port)
- Trade Ship (auto-generated from Port)
- Train
- Atom Bomb (from Missile Silo)
- Hydrogen Bomb (from Missile Silo)
- MIRV (from Missile Silo)

### 15.3 HUD Elements
- **Leaderboard** showing territory percentages
- **Population display** (troops vs workers split)
- **Gold counter**
- **Attack ratio slider**
- **Player list with diplomacy icons**
- **Map overview**

---

## 16. Maps

| Map | Description |
|---|---|
| World | Global map, longest match length |
| Europe | Features Nation AI including Russia (fast expander) |
| North America | North American continent |
| MENA | Middle East and North Africa |
| Oceania | Pacific/Oceania region — heavy naval play |
| Black Sea | Smaller regional map, chokepoint-heavy |
| Mars | Fictional/alternate terrain map |

---

## 17. Technical Notes & Formulas

### 17.1 Key Formulas

**Trade Income:**
```
Gold = 10,000 + 150 × (distance^1.1)
```

**Population Growth Peak:**
- Fastest growth at **42% of maximum population capacity**
- Growth slows significantly above **80% capacity**

**City Cost Scaling:**
```
Cost(n) = 125,000 × 2^(n-1)
```
Where n = city number (1st, 2nd, 3rd, etc.)

### 17.2 Key Balance Numbers

| Stat | Value |
|---|---|
| Victory threshold | 80% of non-irradiated land |
| Optimal growth ratio | 42% population capacity |
| Population per tile | 3 |
| Population per city | +25,000 capacity |
| Worker reproduction bonus | +30% vs troops |
| SAM interception rate | 75% |
| SAM cooldown | 7.5 seconds |
| SAM range | 75-pixel radius |
| Defense post radius | 30 tiles |
| Max defense multiplier | 6× (mountain + defense post) |
| Warship range | 130 tiles |
| Warship damage | 250 per shot |
| Warship fire rate | Every 2 seconds |
| Max troop attack ratio benefit | 2:1 |
| Alliance betrayal defense penalty | -50% for 30 seconds |
| Trade halt after combat | 5 minutes |

### 17.3 Building Cost Summary

| Building | Cost |
|---|---|
| City (1st) | 125,000 gold |
| City (2nd) | 250,000 gold |
| City (3rd) | 500,000 gold |
| City (4th+) | 1,000,000 gold |
| Missile Silo | 1,000,000 gold |
| SAM Launcher | 1,500,000 gold |
| Atom Bomb | 750,000 gold |
| Hydrogen Bomb | 5,000,000 gold |
| MIRV | 25,000,000 gold |

Got it. I’ve integrated the roadmap into the document's native Markdown structure, using the same heading hierarchy, table styles, and LaTeX formatting for the formulas to ensure it looks like a seamless part of your original PRD.

I have also taken the liberty of clarifying the **Factory** and **Train** logic within this list to ensure those "undocumented" features have a clear development goal.

Add this to the end of your document:

---

## 18. Phased Development Roadmap (The Todo List)

To prioritize the most basic and important tasks first, development is divided into five functional milestones. Each milestone must be fully playable before moving to the next.

### 18.1 Phase 1: The "Mover" (Core Map Engine)
*Goal: Establish the environment and the concept of "ownership."*

* **Grid/Terrain System:** Generate the map with different terrain types (Plains, Mountains, Water) and their associated movement/combat modifiers.
* **Territory Ownership:** Implement the logic for "painting" tiles in a player's unique color upon contact or click.
* **Basic Camera & UI:** W/A/S/D movement, Zoom (Q/E), and the "Center on Home" (C) function.
* **Spawn Logic:** Allow a user to select a starting tile and initialize a base population.

### 18.2 Phase 2: The "Growth" (Economic Foundation)
*Goal: Implement the math that drives the game’s scaling.*

* **Population Clock:** Code the growth curve logic, ensuring population reproduces fastest at **42% of maximum capacity**.
* **Troops vs. Workers:** Create the UI toggle and backend logic to split population roles and growth rates ($+30\%$ for workers).
* **Gold Passive Income:** Basic gold generation based on worker count and total territory owned.
* **City Construction:** Implement the first building to increase population capacity by $+25,000$ and apply the doubling cost formula: $Cost(n) = 125,000 \times 2^{(n-1)}$.

### 18.3 Phase 3: The "Skirmish" (Basic Combat)
*Goal: Introduce conflict and AI opponents.*

* **Attack Ratio Slider:** Implement the 5% increment slider and logic for troop movement during attacks.
* **Basic Bot AI:** A script that automatically captures neutral land and attacks players with a fixed 50% troop ratio.
* **Combat Resolution:** Math for casualties based on terrain resistance (e.g., $+30\%$ attacker casualties on Mountains).
* **Annexation Logic:** The "Enclosure" mechanic—detecting when a group of tiles is completely surrounded and flipping ownership instantly.

### 18.4 Phase 4: The "Navy & Trade" (Expansion)
*Goal: Connect the map and diversify the economy.*

* **Port & Naval Units:** Logic for coastal placement requirements and the production of Warships and Transports.
* **Automated Trade Ships:** Implementation of NPC ships that travel between ports and generate gold using the distance formula: $10,000 + 150 \times (distance^{1.1})$.
* **Land Trade (Trains):** Utilize the **Factory** building as a hub to generate land-based trade income between connected territory.

### 18.5 Phase 5: The "Endgame" (Nukes & Diplomacy)
*Goal: Add high-stakes strategy and win conditions.*

* **Diplomacy System:** Alliance requests, Embargoes, and the "Traitor" penalty ($-50\%$ defense for 30 seconds).
* **Nuclear Warfare:** Launch logic for Missile Silos and interception logic for SAM Launchers (75% success rate, 7.5s cooldown).
* **Victory Tracker:** A real-time engine check that triggers a win state when a player hits **80% of non-irradiated land**.

---

## Appendix A: Source References

- OpenFront Pro Beginner's Guide: https://openfrontpro.com/beginners-guide/
- Openfront Fandom Wiki — Combat: https://openfront.fandom.com/wiki/Combat
- Openfront Fandom Wiki — Gold: https://openfront.fandom.com/wiki/Gold
- Openfront Fandom Wiki — Players: https://openfront.fandom.com/wiki/Players
- Openfront Fandom Wiki — Trade Ship: https://openfront.fandom.com/wiki/Trade_Ship
- Openfront Fandom Wiki — Build Menu: https://openfront.fandom.com/wiki/Build_Menu

---

*This PRD was compiled from all available public documentation, wiki pages, and community guides for OpenFront.io as of March 2026. It is intended to serve as a comprehensive reference for a faithful remake of the game.*\n---
## 17. Current Implementation Status (Alpha Build)

### 17.1 Completed (Working Now)
- Backend map generation + Redis storage for 100x100 tiles.
- API endpoints:
  - `GET /api/map` returns the full tile map.
  - `GET /api/tile/:x/:y` returns a specific tile.
  - `POST /api/tile/:x/:y` updates ownership/type/pop.
- Frontend Pixi.js rendering of the world map using backend tile data.
- Tile hover UI details and clickable capture action.
- Backend adjacency-validated attack action (`POST /api/action/attack`) implemented.
- Backend population tick and player resources implemented.
- Control percentage and victory detection added (80% non-radioactive land).
- Docker compose setup with nginx reverse proxy and backend services.

### 17.2 Current Gaps (Alpha to Beta Transition)
- Basic battle resolution is now implemented (strength, casualties, terrain modifiers).
- No building/unit production systems yet.
- Population growth and troop/worker system not implemented in gameplay.
- No player/session state, authentication, or multiplayer sync.
- No persistent match lifecycle (start/end conditions) in backend.
- UI currently draws static tile grid with basic interaction only.

---
## 18. Updated Engineering TODO (Next 2-3 Sprints)

### Sprint 1 (Core Gameplay Loop)
1. Implement adjacency validation and tile combat in backend:
   - Only allow actions on neighboring tiles.
   - Resolve attack with simple strength formula plus terrain modifiers.
2. Add tile ownership color state and occupant markers in frontend.
3. Add passive population growth per tile and base tile population (+3) logic.
4. Add player resources (gold/pop) and UI counters.
5. Add win condition check: own >= 80% non-radioactive land.

### Sprint 2 (Buildings + Units + Economy)
1. Implement building placement API (`/api/building`) and UI build menu.
2. Add City/Port/Defense/Post/Missile/Factory building effects.
3. Add troop and worker split + production plus gold income from tiles.
4. Add naval movement and port-based warship unit creation.
5. Add trade route gold generation and transport path data.

### Sprint 3 (Multiplayer, Diplomacy, Nuclear, Endgame)
1. Add player sessions and matchmaking API.
2. Add alliances, embargo, and diplomacy requests.
3. Add nuclear weapon launch flow and SAM interception logic.
4. Add end-of-game scoring, leaderboard, and elimination.
5. Add replay/sync and real-time updates via WebSocket.

---
## 19. Short-term Checklist (Next 4 dev tasks)
- [x] Add backend `POST /api/action/attack` for adjacency-based attacks.
- [x] Add frontend tile selection + enemy attack UI.
- [x] Implement population growth tick server-side (every second).
- [x] Add land ownership percentage and victory display in top UI.
- [x] Add battle resolution with strength and casualties.
- [x] Add building placement API and basic city building.
- [ ] Add unit production and building effects.
- [ ] Add multiplayer player session flows.
