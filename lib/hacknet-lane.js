/** @param {NS} ns */
/*
 * lib/hacknet-lane.js
 *
 * Description
 *  Controller lane for Hacknet.
 *   - Budgeted upgrades (nodes/level/ram/core) with minimal terminal spam
 *   - ROI-gated upgrades (payback threshold) to avoid “money pit” behavior
 *   - Optional hash spending when Hacknet Servers / hashes are available
 *
 * Notes
 *  - This module is import-only; not intended to be run directly.
 *  - Designed for “quiet terminal / rich log” controller pattern:
 *      - pushes terminal-facing messages into msgs[] only when an action occurs
 *      - uses state to throttle work and avoid repeated spam
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

import { fmtMoney } from "lib/format.js";

export const HACKNET_LANE_DEFAULTS = {
  enabled: true,

  // How often we even consider Hacknet actions
  tickMs: 15_000,

  // Spend policy (money)
  spendFraction: 0.10,   // spend up to this fraction of current cash per tick
  minBudget: 100_000,    // if budget below this, skip

  // Optional “save for augs” gating (future-proof hook)
  pauseWhenCashAtOrAbove: 0, // 0 disables. If >0 and cash >= this, skip upgrades.

  // ROI gating
  roiMode: "payback",        // "payback" | "off"
  maxPaybackSec: 10 * 60,    // 10-minute gate (user requested)
  minDeltaPerSec: 0.5,       // ignore tiny deltas (noise / rounding)

  // Hash spending policy (when hashes exist)
  hashMode: "auto",      // "auto" | "on" | "off"
  hashSpendTickMs: 10_000,
  hashSpendAtCapacity: 0.90, // when hashes >= 90% capacity, start dumping
  hashDumpAction: "Sell for Money", // safest universal dump

  // Optional extra hash actions (applied only if affordable and not blocking dump)
  hashPreferredActions: [
    // "Increase Maximum Money",
    // "Reduce Minimum Security",
    // "Improve Studying",
    // "Improve Gym Training",
  ],
};

/**
 * Main lane tick: upgrades hacknet and/or spends hashes.
 * @param {NS} ns
 * @param {object} cfg  controller cfg (we’ll read optional hacknet overrides from cfg.hacknet)
 * @param {object} state mutable lane state object (owned by controller)
 * @param {string[]} msgs terminal-facing messages (only when actions occur)
 */
export function runHacknetTick(ns, cfg, state, msgs) {
  const laneCfg = { ...HACKNET_LANE_DEFAULTS, ...((cfg && cfg.hacknet) || {}) };
  if (!laneCfg.enabled) return;

  if (!state) return;
  if (state.lastTick === undefined) state.lastTick = 0;
  if (state.lastHashTick === undefined) state.lastHashTick = 0;

  const now = Date.now();
  if (now - state.lastTick < laneCfg.tickMs) {
    // Hash spending can run on its own cadence
    runHashSpendingTick(ns, laneCfg, state, msgs);
    return;
  }
  state.lastTick = now;

  // Optional “hard pause” hook (useful later when you compute aug budget in controller)
  const cash = safeMoney(ns);
  if (laneCfg.pauseWhenCashAtOrAbove > 0 && cash >= laneCfg.pauseWhenCashAtOrAbove) {
    runHashSpendingTick(ns, laneCfg, state, msgs);
    return;
  }

  // Spend hashes first (so we don’t waste production at cap)
  runHashSpendingTick(ns, laneCfg, state, msgs);

  // Then consider upgrades
  const budget = cash * laneCfg.spendFraction;
  if (!Number.isFinite(budget) || budget < laneCfg.minBudget) return;

  const best =
    laneCfg.roiMode === "payback"
      ? pickBestPaybackUpgrade(ns, laneCfg.maxPaybackSec, laneCfg.minDeltaPerSec)
      : pickCheapestHacknetUpgrade(ns);

  if (!best || !Number.isFinite(best.cost) || best.cost > budget) return;

  const ok = performHacknetUpgrade(ns, best);
  if (ok) {
    const pb = Number.isFinite(best.paybackSec) ? ` (payback~${Math.ceil(best.paybackSec)}s)` : "";
    msgs.push(`[hacknet] ${best.label} for ${fmtMoney(ns, best.cost)}${pb}`);
  }
}

// ------------------------------------------------------------
// Upgrade selection (ROI payback gate)
// ------------------------------------------------------------

function pickBestPaybackUpgrade(ns, maxPaybackSec, minDeltaPerSec) {
  if (!ns.hacknet) return null;

  const numNodes = safeNum(() => ns.hacknet.numNodes(), 0);
  const candidates = [];

  // Candidate: buy new node
  {
    const cost = safeNum(() => ns.hacknet.getPurchaseNodeCost(), Infinity);
    const delta = estimateNewNodeDelta(ns);
    if (Number.isFinite(cost) && delta >= minDeltaPerSec) {
      candidates.push(makeCandidate("node", -1, cost, delta, "buy node"));
    }
  }

  // Candidates: per-node upgrades
  for (let i = 0; i < numNodes; i++) {
    candidates.push(...estimateNodeUpgradeCandidates(ns, i, minDeltaPerSec));
  }

  const viable = candidates.filter(c => Number.isFinite(c.paybackSec) && c.paybackSec <= maxPaybackSec);
  if (!viable.length) return null;

  viable.sort((a, b) => a.paybackSec - b.paybackSec);
  return viable[0];
}

function makeCandidate(type, index, cost, deltaPerSec, label) {
  const paybackSec = deltaPerSec > 0 ? (cost / deltaPerSec) : Infinity;
  return { type, index, cost, deltaPerSec, paybackSec, label };
}

function estimateNodeUpgradeCandidates(ns, i, minDeltaPerSec) {
  const out = [];
  const stats = safeObj(() => ns.hacknet.getNodeStats(i), null);
  if (!stats) return out;

  const baseProd = estimateNodeProduction(ns, stats);

  const costLevel = safeNum(() => ns.hacknet.getLevelUpgradeCost(i, 1), Infinity);
  const costRam   = safeNum(() => ns.hacknet.getRamUpgradeCost(i, 1), Infinity);
  const costCore  = safeNum(() => ns.hacknet.getCoreUpgradeCost(i, 1), Infinity);

  // level+1
  if (Number.isFinite(costLevel)) {
    const prod2 = estimateNodeProduction(ns, { ...stats, level: stats.level + 1 });
    const delta = prod2 - baseProd;
    if (delta >= minDeltaPerSec) out.push(makeCandidate("level", i, costLevel, delta, `level+1 node ${i}`));
  }

  // ram+1 step (Hacknet node RAM doubles per "step")
  if (Number.isFinite(costRam)) {
    const prod2 = estimateNodeProduction(ns, { ...stats, ram: stats.ram * 2 });
    const delta = prod2 - baseProd;
    if (delta >= minDeltaPerSec) out.push(makeCandidate("ram", i, costRam, delta, `ram+1 node ${i}`));
  }

  // core+1
  if (Number.isFinite(costCore)) {
    const prod2 = estimateNodeProduction(ns, { ...stats, cores: stats.cores + 1 });
    const delta = prod2 - baseProd;
    if (delta >= minDeltaPerSec) out.push(makeCandidate("core", i, costCore, delta, `core+1 node ${i}`));
  }

  return out;
}

function hasHacknetFormulas(ns) {
  return Boolean(ns.formulas && ns.formulas.hacknetNodes && typeof ns.formulas.hacknetNodes.moneyGainRate === "function");
}

function estimateNodeProduction(ns, nodeStats) {
  // Best: formulas (requires Formulas.exe and API)
  if (hasHacknetFormulas(ns)) {
    try {
      // moneyGainRate(level, ramUsed, maxRam, cores, mult)
      // Mult handling is version-dependent; this field usually exists.
      const mult = ns.getPlayer()?.hacknet_node_money_mult ?? 1;
      return ns.formulas.hacknetNodes.moneyGainRate(
        nodeStats.level,
        0,
        nodeStats.ram,
        nodeStats.cores,
        mult
      );
    } catch (_e) {
      // fall through
    }
  }

  // Fallback: nodeStats.production is typically $/sec
  const p = Number(nodeStats.production ?? 0);
  return Number.isFinite(p) ? p : 0;
}

function estimateNewNodeDelta(ns) {
  // With formulas: estimate a baseline new node (lvl=1, ram=1, cores=1)
  if (hasHacknetFormulas(ns)) {
    try {
      const mult = ns.getPlayer()?.hacknet_node_money_mult ?? 1;
      return ns.formulas.hacknetNodes.moneyGainRate(1, 0, 1, 1, mult);
    } catch (_e) {
      // fall through
    }
  }

  // Fallback: assume at least small gain to avoid “free spam”
  return 1;
}

// ------------------------------------------------------------
// Upgrade selection (cheapest-first fallback / legacy behavior)
// ------------------------------------------------------------

function pickCheapestHacknetUpgrade(ns) {
  if (!ns.hacknet) return null;

  const numNodes = safeNum(() => ns.hacknet.numNodes(), 0);
  let best = { type: null, index: -1, cost: Infinity, label: "" };

  // Buy new node
  const newNodeCost = safeNum(() => ns.hacknet.getPurchaseNodeCost(), Infinity);
  if (Number.isFinite(newNodeCost) && newNodeCost < best.cost) {
    best = { type: "node", index: -1, cost: newNodeCost, label: "buy node" };
  }

  // Upgrade existing nodes
  for (let i = 0; i < numNodes; i++) {
    const costLevel = safeNum(() => ns.hacknet.getLevelUpgradeCost(i, 1), Infinity);
    const costRam   = safeNum(() => ns.hacknet.getRamUpgradeCost(i, 1), Infinity);
    const costCore  = safeNum(() => ns.hacknet.getCoreUpgradeCost(i, 1), Infinity);

    if (Number.isFinite(costLevel) && costLevel < best.cost) {
      best = { type: "level", index: i, cost: costLevel, label: `level+1 node ${i}` };
    }
    if (Number.isFinite(costRam) && costRam < best.cost) {
      best = { type: "ram", index: i, cost: costRam, label: `ram+1 node ${i}` };
    }
    if (Number.isFinite(costCore) && costCore < best.cost) {
      best = { type: "core", index: i, cost: costCore, label: `core+1 node ${i}` };
    }
  }

  if (!best.type || !Number.isFinite(best.cost)) return null;
  return best;
}

function performHacknetUpgrade(ns, best) {
  try {
    switch (best.type) {
      case "node": {
        const idx = ns.hacknet.purchaseNode();
        return idx !== -1;
      }
      case "level":
        return ns.hacknet.upgradeLevel(best.index, 1);
      case "ram":
        return ns.hacknet.upgradeRam(best.index, 1);
      case "core":
        return ns.hacknet.upgradeCore(best.index, 1);
      default:
        return false;
    }
  } catch (_e) {
    return false;
  }
}

// ------------------------------------------------------------
// Hash spending (works only when the hashes API exists)
// ------------------------------------------------------------

function runHashSpendingTick(ns, laneCfg, state, msgs) {
  const wantHashes =
    laneCfg.hashMode === "on" ||
    (laneCfg.hashMode === "auto" && hasHashesApi(ns));

  if (!wantHashes) return;
  if (!hasHashesApi(ns)) return;

  const now = Date.now();
  if (now - state.lastHashTick < laneCfg.hashSpendTickMs) return;
  state.lastHashTick = now;

  const hashes = safeNum(() => ns.hacknet.numHashes(), 0);
  const cap = safeNum(() => ns.hacknet.hashCapacity(), 0);

  if (cap <= 0) return;

  // If we’re near cap, dump hashes to avoid waste.
  const atCap = hashes >= cap * laneCfg.hashSpendAtCapacity;
  if (atCap) {
    const dumped = spendHashesLoop(ns, laneCfg.hashDumpAction, /*maxSpends*/ 20);
    if (dumped > 0) msgs.push(`[hacknet] hashes: dumped x${dumped} via "${laneCfg.hashDumpAction}"`);
    return;
  }

  // Otherwise, optionally apply “preferred” hash actions if affordable.
  for (const action of laneCfg.hashPreferredActions || []) {
    const cost = safeNum(() => ns.hacknet.hashCost(action), Infinity);
    if (!Number.isFinite(cost) || cost <= 0) continue;

    // Only spend if we have enough to pay once and still keep some buffer.
    if (hashes >= cost * 1.25) {
      const ok = safeBool(() => ns.hacknet.spendHashes(action), false);
      if (ok) msgs.push(`[hacknet] hashes: spent "${action}" (cost=${cost})`);
      break; // one preferred action per hash tick
    }
  }
}

function spendHashesLoop(ns, action, maxSpends = 20) {
  let spent = 0;
  for (let i = 0; i < maxSpends; i++) {
    const ok = safeBool(() => ns.hacknet.spendHashes(action), false);
    if (!ok) break;
    spent++;
  }
  return spent;
}

function hasHashesApi(ns) {
  try {
    return Boolean(
      ns.hacknet &&
      typeof ns.hacknet.numHashes === "function" &&
      typeof ns.hacknet.hashCapacity === "function" &&
      typeof ns.hacknet.spendHashes === "function" &&
      typeof ns.hacknet.hashCost === "function"
    );
  } catch (_e) {
    return false;
  }
}

// ------------------------------------------------------------
// Small safe helpers
// ------------------------------------------------------------

function safeMoney(ns) {
  try {
    return ns.getServerMoneyAvailable("home") || 0;
  } catch (_e) {
    return 0;
  }
}

function safeNum(fn, fallback) {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : fallback;
  } catch (_e) {
    return fallback;
  }
}

function safeBool(fn, fallback) {
  try {
    return Boolean(fn());
  } catch (_e) {
    return fallback;
  }
}

function safeObj(fn, fallback) {
  try {
    return fn();
  } catch (_e) {
    return fallback;
  }
}
