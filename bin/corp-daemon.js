/** @param {NS} ns */
/*
 * bin/corp-daemon.js
 *
 * Description
 *  Corporation automation daemon.
 *  This runner is intentionally boring: it just loops and calls the single
 *  orchestrator tick in /lib/corp/tick.js.
 *
 * Usage
 *  run bin/corp-daemon.js
 *  run bin/corp-daemon.js --tickMs 5000 --debug
 *
 * Notes
 *  - Requires Corporation API + an existing corporation.
 *  - Configure behavior in /config/corp-config.js
 *  - All corp logic lives in /lib/corp/* (tick orchestrates maintenance/exports/capex)
 */

import { CORP_CONFIG } from "/config/corp-config.js";
import { initCorpState } from "/lib/corp/state.js";
import { makeLogger } from "/lib/corp/log.js";
import { runCorpTick } from "/lib/corp/tick.js";

export function printHelp(ns) {
  ns.tprint(`
bin/corp-daemon.js

Description
  Corporation automation daemon (modular).
  Calls /lib/corp/tick.js in a safe loop.

Usage
  run bin/corp-daemon.js [--tickMs <ms>] [--debug]

Flags
  --help        Show this help.
  --tickMs      Override cfg.tickMs (ms).
  --debug       Enable debug logging (cfg.logging.debug = true).

Notes
  - Requires Corporation API and an existing corporation.
  - Configure behavior in /config/corp-config.js
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

  ns.disableLog("ALL");

  // Clone config so flags can safely override without mutating import singleton
  const cfg = structuredCloneSafe(CORP_CONFIG);

  // Quick overrides
  if (Number.isFinite(Number(flags.tickMs))) cfg.tickMs = Number(flags.tickMs);
  if (flags.debug) {
    if (!cfg.logging) cfg.logging = {};
    cfg.logging.debug = true;
  }

  // Shared state root (survives across ticks while daemon runs)
  const stateRoot = initStateRoot(ns);
  const state = initCorpState(stateRoot);

  const msgs = [];
  const log = makeLogger(ns, cfg, msgs);

  while (true) {
    msgs.length = 0;

    // Global enable gate
    if (!cfg.enabled) {
      await ns.sleep(1000);
      continue;
    }

    const corp = ns.corporation;
    if (!corp || !safeBool(() => corp.hasCorporation(), false)) {
      // Corp not created yet (or no API) -> just idle
      await ns.sleep(1000);
      continue;
    }

    try {
      // Single orchestrator tick owns: maintenance -> exports -> capex
      runCorpTick(ns, corp, cfg, state, log);
    } catch (e) {
      ns.tprint(`[corp-daemon] EXCEPTION: ${String(e)}`);
      try { ns.tprint(String(e?.stack || "")); } catch {}
    }

    // If logger pushed terminal-worthy messages, print them
    // (makeLogger should already respect cfg.logging + avoid spam)
    for (const m of msgs) {
      if (m) ns.tprint(m);
    }

    await ns.sleep(200); // tick.js has its own tick gating via cfg.tickMs/state.lastTick
  }
}

// ------------------------
// small helpers (daemon-local)
// ------------------------

function initStateRoot(ns) {
  // keep state in a global so it survives accidental re-import/reload within same runtime
  const g = globalThis;
  if (!g.__bb_state) g.__bb_state = {};
  if (!g.__bb_state.corpDaemon) g.__bb_state.corpDaemon = {};
  return g.__bb_state.corpDaemon;
}

function structuredCloneSafe(x) {
  try {
    // Bitburner supports structuredClone in most environments, but keep a fallback.
    return structuredClone(x);
  } catch {
    return JSON.parse(JSON.stringify(x ?? {}));
  }
}

function safeBool(fn, fallback) {
  try { return Boolean(fn()); } catch { return fallback; }
}
