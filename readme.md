# 📘 Bitburner Scripts — Automated, Modular, Full-Stack Botnet Framework

This repo is a fully modular, production-grade Bitburner automation framework designed to **bootstrap**, **orchestrate**, **optimize**, and **monitor** every part of your hacking infrastructure.

It contains:

- A full **startup system**
- A complete **botnet HGW engine** (home + pservs + NPC servers)
- Tiered **batching systems**
- **Hacknet fleet management**
- XP grinding modes
- UI dashboards and monitoring tools
- Utilities for analysis, scanning, and target selection
- A master codebase file for easy Netscript deployment and versioning

This is intended to be a *complete endgame-ready automation suite*.

---

# 📁 Repository Structure

Your repo now uses category-driven directories that match the structure in `Bitburner_Master_Codebase.md`:

```
bitburner-scripts/
│
├── startup-orchestration/      # Startup systems, orchestration, one-button deploy
├── botnet-hgw/                 # Distributed HGW logic, swarm deployment, sync tools
├── batch-workers/              # Hack/Grow/Weaken workers + batching components
├── fleet-hacknet/              # Hacknet node automation & monitoring
├── ui-monitoring/              # Dashboards, process monitoring, XP throughput UI
├── utilities-info/             # Scanners, helpers, formulas logic, target finders
├── organize-bitburner-scripts.ps1   # Repo maintenance tool
└── Bitburner_Master_Codebase.md      # Single-file merged codebase for Netscript import
```

---

## 📂 startup-orchestration

Scripts responsible for **bootstrapping the entire system** from a clean save.

Includes:

- `startup-home-advanced.js` — Your “one button starts the machine”
- `startup-home.txt` — Documentation / template
- `startup.txt` — Minimal bootstrap
- Early-game helpers, backdoor assistants, etc.

These scripts:

- Scan & root servers  
- Deploy botnet workers  
- Configure batching  
- Start monitoring services  
- Initialize Hacknet fleet automation

---

## 📂 botnet-hgw

Distributed hack–grow–weaken orchestration for **home, pservs, and NPC servers**.

Includes:

- `remote-hgw.js` — Core HGW worker  
- `home-hgw-manager.js` — Home controller  
- `pserv-hgw-sync.js` — Private server synchronizer  
- `deploy-hgw-swarm.js` — Deploys full HGW swarm  
- `deploy-net.js`, `root-and-deploy.js`, `root-all.js`  
- Status and monitoring tools  

This subsystem:

- Balances threads across all nodes
- Supports money mode *and* XP mode
- Auto-detects rooted servers
- Synchronizes workloads dynamically

---

## 📂 batch-workers

Scripts directly supporting batching behavior.

Includes:

- `batch-hack.js`, `batch-grow.js`, `batch-weaken.js`  
- `hack-worker.js`, `grow-worker.js`, `weaken-worker.js`  
- `net-hwgw-batcher.js`  
- `timed-net-batcher.js`, `timed-net-batcher2.js`

These implement:

- Balanced batching  
- Timed netscript pipelines  
- Worker scripts  
- Distributed scheduling

---

## 📂 fleet-hacknet

Automation logic for Hacknet nodes.

Includes:

- `hacknet-smart.js` — Purchase/upgrade optimizer
- `hacknet-manager.js` — Live ROI management
- `hacknet-status.js` — Dashboard
- Purchase helpers

Handles:

- Optimal node ordering  
- Dynamic ROI evaluation  
- Continuous auto-upgrading  

---

## 📂 ui-monitoring

Realtime UI dashboards.

Includes:

- `ops-dashboard.js`
- `process-monitor.js`
- `xp-throughput-monitor.js`

Provides:

- Global operations overview  
- Process runtime visibility  
- XP throughput stats  

---

## 📂 utilities-info

Utility scripts, formulas helpers, scanning, and target analysis.

Includes:

- `find-juicy-target.js`, `find-juicy-advanced.js`
- `formulas-helper.js`
- `prep-target.js`
- `whats-my-bitNode.js`
- `hacktemplate.txt`
- `xp-to-next-level.js`
- `karma-watch.js`

These scripts assist with:

- Target selection  
- Formulas modeling  
- Server preparation  
- BitNode details  
- XP progress tracking  

---

# 📦 Master Codebase File

`Bitburner_Master_Codebase.md` is a **single-file flattened codebase**, containing every script in this repo bundled together in sections:

```md
/* == FILE: utilities-info/find-juicy-target.js == */
... contents ...
/* == END FILE == */
```

You can:

- Upload this directly into Bitburner  
- Sync with VS Code  
- Reconstruct the full repo structure via the organizer script  

This file is the **canonical source of truth**.

---


# 🚀 Usage in Bitburner

After syncing the scripts:

Start full automation:

```sh
run startup-home-advanced.js
```

Start XP grinding mode:

```sh
run xp-all.js
```

Deploy HGW swarm:

```sh
run deploy-hgw-swarm.js
```

Root everything:

```sh
run root-all.js
```

---

# 🧪 Recommended Workflow

1. Edit scripts locally  
2. Run organizer script  
3. Export updated `Bitburner_Master_Codebase.md`  
4. Sync/upload to game  
5. Run `startup-home-advanced.js`  
6. Use dashboards to monitor operations  

