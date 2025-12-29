# Bitburner Scripts â€“ Master Codebase
This repository contains my **production Bitburner codebase**, structured and maintained for long-running playthroughs, automation, and iterative refactors.
**Source of truth:** everything under `bb/`
If it isnâ€™t in `bb/`, it does **not** exist in the game.
---
## Repository Structure
/
bb/                  (Bitburner in-game filesystem ONLY synced content)
  bin/                 Entry points, daemons, controllers
  lib/                 Shared libraries and logic lanes
  workers/             Stateless worker scripts (HGW, batch pieces, etc.)
  apps/                Feature-specific tools (WSE, Hacknet, etc.)
  ui/                  Terminal / tail / dashboard UIs

README.md              This file
.gitignore             Whitelist-based (tracks bb/ only)
                       tooling / docs / scripts (ignored by git)
---
## Design Principles
- **Single root of truth**
  `bb/` mirrors the Bitburner home filesystem exactly.
- **Explicit automation lanes**
  Hacking, Hacknet, Singularity, Gang, Player, WSE, and OS-style services are separated into focused lanes.
- **Controller-driven orchestration**
  One main controller coordinates RAM-gated daemons, jobs, and policies.
- **Restart-safe**
  Designed to survive BitNode resets, script restarts, and partial availability.
- **Refactor-friendly**
  Large restructures are expected; tooling and layout are built to tolerate churn.
---
## Getting Started (In-Game)
Typical entry flow after installing scripts:
run /bin/bootstrap.js
This:
- waits for sufficient free RAM
- runs lightweight early daemons
- launches the main controller when affordable
You can also start components directly if desired.
---
## Syncing With the Game
This repo is intended to be synced using the Bitburner Remote API and a filesystem sync tool.
Important rules:
- Only `bb/` is synced
- Deletes and moves must be reflected in `bb/`
- Tooling, archives, docs, and experiments live outside `bb/`
For large refactors:
1. Stop filesync
2. Restructure files
3. Restart filesync with a full push
---
## Master Codebase Document
A full, flattened snapshot of the entire in-game codebase is auto-generated as:
Bitburner_Master_Codebase_v3.md
This file:
- lists every script
- embeds full source contents
- is suitable for review, audits, or offline reference
It is generated, not edited by hand.
---
## Tooling & Scripts (Out of Scope)
PowerShell scripts, generators, archives, experiments, and historical code intentionally live outside `bb/` and are not tracked by git.
This is by design.
---
## Notes & Warnings
- Paths in scripts assume Bitburner-style absolute paths (/bin/...)
- Many scripts require Singularity or specific Source Files
- Some automation (WSE, shorting, corp) is BN-dependent
- This codebase favors clarity and correctness over minimal RAM
---
## Philosophy
Treat Bitburner like an operating system, not a script pile.
This repo reflects that mindset.
Happy hacking.
