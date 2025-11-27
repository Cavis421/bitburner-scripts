# ⚡ Bitburner Scripts — Modular, Automated, Endgame-Ready Framework

This repository contains a fully modular, production-grade automation framework for **Bitburner**.  
It manages **startup**, **batching**, **botnet HGW**, **Hacknet automation**, **server orchestration**, and **UI dashboards** in a unified, scalable architecture.

Designed for mid–late game and BitNode resets, this framework allows you to start from a completely clean save and bootstrap to endgame automation with a single command.

---

# 📁 Repository Structure

Your local repo is structured into clean, category-based directories:

bitburner-scripts/
│
├── batch/ # HGW batch workers + timed batch controllers
├── botnet/ # Distributed HGW engine, swarm deployment, syncing
├── core/ # Startup, network deployment, batch controllers
├── corp/ # Corporation automation (BN3 and beyond)
├── darkweb/ # Dark web utilities and buyers
├── hacknet/ # Hacknet node automation and dashboards
├── pserv/ # Purchased server management tools
├── ui/ # UI dashboards and monitoring tools
├── util/ # Scanners, analysis tools, formulas helpers
└── Bitburner_Master_Codebase.md # Flattened single-file codebase

markdown
Copy code

Each folder contains scripts with a tightly defined purpose, mirroring the in-game pseudo-filesystem introduced by the refactor.

---

## 📂 `core/` — Startup & Orchestration

Contains all scripts responsible for **bootstrapping and managing** your entire hacking infrastructure.

Key scripts:

- `startup-home-advanced.js` – One-button full boot sequence  
- `startup-home.js` – Lightweight bootstrap  
- `early-backdoor-helper.js` – Auto-find backdoor targets  
- `deploy-net.js` – Recursive server deployment  
- `root-all.js` / `root-and-deploy.js` – Rooting utilities  
- `timed-net-batcher.js` / `timed-net-batcher2.js` – Main batching controllers  

This subsystem performs:

- Full network scan  
- Auto rooting  
- Swarm deployment  
- Batch scheduler initialization  
- Dashboard/UI service startup  
- Early BitNode bootstrap  

---

## 📂 `batch/` — Worker Scripts & Batch Engines

Implements the core HGW batching logic.

Includes:

- `batch-hack.js`, `batch-grow.js`, `batch-weaken.js`  
- `hack-worker.js`, `grow-worker.js`, `weaken-worker.js`  
- `timed-net-batcher.js`, `timed-net-batcher2.js`  
- `net-hwgw-batcher.js`  

Features:

- Balanced worker dispatch  
- Batching pipeline orchestration  
- Timed gap execution  
- Multi-host synchronized workers  
- Support for XP and money modes  

---

## 📂 `botnet/` — Distributed HGW Network

Controls the distributed hacking swarm across **home**, **pservs**, and **NPC servers**.

Includes:

- `remote-hgw.js` — Remote HGW worker  
- `home-hgw-manager.js` — Home execution orchestrator  
- `pserv-hgw-sync.js` — Sync controller for purchased servers  
- `botnet-hgw-sync.js`, `botnet-hgw-status.js`  
- `deploy-hgw-swarm.js` — Deploy entire HGW network  
- `auto-hgw.js` — Quick-start HGW dispatcher  

Supports:

- Thread load balancing  
- Auto-scaling with server upgrades  
- Dynamic target switching  
- Swarm-wide synchronization  

---

## 📂 `hacknet/` — Automated Node Management

Complete Hacknet fleet automation.

Scripts include:

- `hacknet-smart.js` — ROI-driven purchasing & upgrading  
- `hacknet-manager.js` — Continuous optimization loop  
- `hacknet-status.js` — Dashboard  
- Purchase helpers  

Handles:

- Optimal upgrade ordering  
- Value-per-dollar analysis  
- Full passive-income automation  

---

## 📂 `pserv/` — Purchased Server Management

Responsible for:

- Server purchase/upgrade  
- Fleet summary dashboards  
- Cleanup & recycling  

Key scripts:

- `pserv-manager.js`  
- `pserv-status.js`  
- `pserv-process-report.js`  
- `purchase_server_8gb.js`  
- `clean-pservs.js`  

---

## 📂 `ui/` — Dashboards & Live Monitoring

Graphical (terminal-based) monitoring tools.

Includes:

- `ops-dashboard.js` — Global op status  
- `process-monitor.js` — Live process/watchdog  
- `xp-throughput-monitor.js` — XP/sec tracking  
- `karma-watch.js` — Faction/karma grinding helper  

---

## 📂 `util/` — Analysis, Helpers & Scanners

Utility scripts for data modeling and analysis.

Includes:

- `find-juicy-target.js` / `find-juicy-advanced.js`  
- `formulas-helper.js`  
- `prep-target.js`  
- `xp-to-next-level.js`  
- `whats-my-bitNode.js`  
- `hacktemplate.txt`  

Handles:

- Target selection  
- Server prep calculations  
- Formulas.exe integration  
- XP projections  

---

# 📦 `Bitburner_Master_Codebase.md`

This file is a **flattened, single-file version of the entire codebase**, used for:

- Importing into in-game editor  
- Sharing combined builds  
- Quick copying into Bitburner  
- Debugging Netscript execution order  

Automatic tools can reconstruct the original folder layout from this file.

---

# 🚀 Running the Framework In-Game

Once synced (via filesync or manual upload):

### Start full automation:

```sh
run core/startup-home-advanced.js
Deploy entire HGW swarm:
sh
Copy code
run botnet/deploy-hgw-swarm.js
Begin XP grinding mode:
sh
Copy code
run botnet/xp-all.js
Root everything:
sh
Copy code
run core/root-all.js
Monitor operations:
sh
Copy code
run ui/process-monitor.js
🧪 Recommended Development Workflow
Edit scripts locally (VS Code)

Auto-sync via bitburner-filesync

Export/update Bitburner_Master_Codebase.md when needed

Launch automation using startup-home-advanced.js

Monitor using UI dashboards

Iterate & refine

🛠 Requirements
Bitburner (Steam or browser)

Remote API enabled

bitburner-filesync (recommended)

Node.js (for filesync & tooling)

📜 License
MIT License — free to use, modify, and distribute.

🤖 Contributions / Pull Requests
PRs and suggestions are welcome!
If you have improvements to batching logic, HGW scheduling, Hacknet math, or server orchestration, feel free to contribute.