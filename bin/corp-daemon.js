/** @param {NS} ns */
/*
 * bin/corp-daemon.js
 *
 * Description
 *  Corporation automation daemon (Option B layout).
 *  Orchestrates modular corp logic:
 *    - maintenance (no-spend, safe every tick)
 *    - exports (throttled)
 *    - bootstrap/capex planning (intents)
 *    - spend gate executes up to N capex actions per tick
 *
 * Usage
 *  run bin/corp-daemon.js
 *  run bin/corp-daemon.js --tickMs 5000 --debug
 *
 * Notes
 *  - This script is the ONLY long-running loop for corp automation.
 *  - Modules in lib/corp are import-only and should not spend directly.
 */

import { CORP_CONFIG } from "/config/corp-config.js";
import { initCorpState } from "/lib/corp/state.js";
import { makeLogger } from "/lib/corp/log.js";
import { runMaintenance } from "/lib/corp/maintenance.js";
import { maybeApplyExports } from "/lib/corp/exports.js";
import { getBootstrapIntents } from "/lib/corp/bootstrap.js";
import { tryExecuteIntent } from "/lib/corp/spend.js";

export function printHelp(ns) {
  ns.tprint(`
bin/corp-daemon.js

Description
  Corporation automation daemon (modular).
  Runs maintenance every tick and executes up to N capex actions per tick
  through a strict spend gate.

Usage
  run bin/corp-daemon.js [--tickMs <ms>] [--debug]

Notes
  - Requires Corporation API and an existing corporation.
  - Configure behavior in /config/corp-config.js
  - All spending should route through lib/corp/spend.js
`);
}

export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["tickMs", null],
    ["debug", false],
  ]);

  if (flags.help) {
    printHelp(ns);
    return;
  }

  const cfg = structuredCloneSafe(CORP_CONFIG);

  // allow quick overrides without editing config
  if (Number.isFinite(Number(flags.tickMs))) cfg.tickMs = Number(flags.tickMs);
  if (flags.debug) cfg.logging.debug = true;

  const stateRoot = initStateRoot(ns);
  const state = initCorpState(stateRoot);

  const msgs = [];
  const log = makeLogger(ns, cfg, msgs);

  while (true) {
    msgs.length = 0;

    if (!cfg.enabled) {
      await ns.sleep(1000);
      continue;
    }

    const now = Date.now();
    const tickMs = Number(cfg.tickMs || 5000);
    if (now - Number(state.lastTick || 0) < tickMs) {
      await ns.sleep(200);
      continue;
    }
    state.lastTick = now;

    const corp = ns.corporation;
    if (!corp || !safeBool(() => corp.hasCorporation(), false)) {
      await ns.sleep(1000);
      continue;
    }

    // 1) Maintenance (no spend)
    runMaintenance(ns, corp, cfg, log);

    // 2) Exports (throttled)
    maybeApplyExports(ns, corp, cfg, state, log);

    // 3) Capex planning
    if (cfg.capex?.enabled) {
      const intents = getBootstrapIntents(ns, corp, cfg, log);

      const maxActions = Math.max(0, Number(cfg.capex.maxActionsPerTick || 0));
      let actions = 0;

      for (const intent of intents) {
        if (actions >= maxActions) break;

        const r = tryExecuteIntent(ns, corp, state, cfg.capex, log, intent);
        if (r.did) actions++;
      }
    }

    // flush messages
    for (const m of msgs) ns.tprint(m);

    await ns.sleep(50);
  }
}

function initStateRoot(ns) {
  // You likely have your own controller state object.
  // For now, store in globalThis (works in BB runtime per script instance).
  if (!globalThis.__corpDaemonState) globalThis.__corpDaemonState = {};
  return globalThis.__corpDaemonState;
}

function structuredCloneSafe(obj) {
  try { return structuredClone(obj); } catch { return JSON.parse(JSON.stringify(obj)); }
}

function safeBool(fn, fallback) {
  try { return Boolean(fn()); } catch { return fallback; }
}
