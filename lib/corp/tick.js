// /lib/corp/tick.js

import { runMaintenance } from "/lib/corp/maintenance.js";
import { maybeApplyExports } from "/lib/corp/exports.js";
import { getBootstrapIntents } from "/lib/corp/bootstrap.js";
import { tryExecuteIntent } from "/lib/corp/spend.js";

/**
 * Flexible runner:
 * - Old-style: runCorpTick(ns, cfg, state, msgsArray)
 * - New-style: runCorpTick(ns, corp, cfg, state, log)
 */
export function runCorpTick(ns, a, b, c, d) {
  // Detect call shape
  const isCorpApi = (x) =>
    x && typeof x.getCorporation === "function" && typeof x.hasCorporation === "function";

  /** @type {*} */
  let corp;
  /** @type {*} */
  let cfg;
  /** @type {*} */
  let state;
  /** @type {*} */
  let log;

  // New-style: (ns, corp, cfg, state, log)
  if (isCorpApi(a)) {
    corp = a;
    cfg = b || {};
    state = c || {};
    log = d || makeNoopLogger();
  } else {
    // Old-style: (ns, cfg, state, msgs)
    corp = ns.corporation;
    cfg = a || {};
    state = b || {};
    const msgs = Array.isArray(c) ? c : [];
    log = makeMsgsLogger(msgs, cfg?.logging?.debug);
  }

  if (!corp || typeof corp.hasCorporation !== "function") {
    log.warn("tick", "Corporation API not available.");
    return;
  }
  if (!safeBool(() => corp.hasCorporation(), false)) {
    log.info("tick", "No corporation yet (hasCorporation() = false).");
    return;
  }

  // Ensure state object has the fields other modules expect
  if (!state) state = {};
  if (!state.lastExportAt) state.lastExportAt = 0;
  if (!state.failAt) state.failAt = {};
  if (!state.lastTick) state.lastTick = 0;

  // Tick gating (prevents over-ticking; matches daemon comment)
  const tickMs = Math.max(0, Math.floor(Number(cfg?.tickMs ?? 0)));
  if (tickMs > 0) {
    const now = Date.now();
    const last = Number(state.lastTick || 0);
    if (now - last < tickMs) return;
    state.lastTick = now;
  }

  // 1) Maintenance (no-spend)
  try {
    if (cfg?.maintenance?.enabled !== false) {
      runMaintenance(ns, corp, cfg, log);
    }
  } catch (e) {
    log.error("maintenance", `Exception: ${String(e)}`);
  }

  // 2) Exports (throttled)
  try {
    maybeApplyExports(ns, corp, cfg, state, log);
  } catch (e) {
    log.error("exports", `Exception: ${String(e)}`);
  }

  // 3) Capex (planned intents executed through spend gate)
  const capex = cfg?.capex;
  if (capex?.enabled) {
    const max = Math.max(0, Math.floor(Number(capex.maxActionsPerTick || 0)));

    let intents = [];
    try {
      // bootstrap.js is a planner: returns intents (or [])
      intents = getBootstrapIntents(ns, corp, cfg, log) || [];
    } catch (e) {
      log.error("bootstrap", `Exception: ${String(e)}`);
      intents = [];
    }

    let actions = 0;
    for (const intent of intents) {
      if (actions >= max) break;

      try {
        const res = tryExecuteIntent(ns, corp, state, capex, log, intent);
        if (res?.did) actions++;
      } catch (e) {
        log.error("spend", `Exception executing intent "${intent?.key || "?"}": ${String(e)}`);
      }
    }
  }
}

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------

function makeNoopLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function makeMsgsLogger(msgs, debugEnabled = false) {
  const push = (lvl, area, msg) => {
    msgs.push(`[corp/${lvl}] ${area}: ${msg}`);
  };
  return {
    info: (area, msg) => push("info", area, msg),
    warn: (area, msg) => push("warn", area, msg),
    error: (area, msg) => push("error", area, msg),
    debug: (area, msg) => {
      if (debugEnabled) push("debug", area, msg);
    },
  };
}

function safeBool(fn, fallback) {
  try {
    return Boolean(fn());
  } catch {
    return fallback;
  }
}
