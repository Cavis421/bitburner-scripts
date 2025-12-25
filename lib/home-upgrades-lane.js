/** @param {NS} ns */
/*
 * lib/home-upgrades-lane.js
 *
 * Description
 *  Controller lane for automating home RAM + core upgrades (Singularity).
 *
 * Notes
 *  - Strictly purchase-only; no resets.
 *  - Budget-gated to avoid sabotaging aug/corp spending.
 *  - Terminal output only when an upgrade happens (pushes msgs[]).
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

import { fmtMoney } from "lib/format.js";

export const HOME_UPGRADES_DEFAULTS = {
  enabled: true,
  tickMs: 60_000,

  // Budget gating (home money)
  reserveCash: 2_000_000_000, // keep this much cash untouched
  maxSpendFrac: 0.20,         // also keep at least (1 - this) fraction liquid

  // What to buy
  buyRam: true,
  buyCores: true,

  // Soft priority:
  // - "cheapest": buy whichever upgrade is cheaper right now
  // - "ram-first": always prefer RAM if affordable, else cores
  policy: "cheapest",

  // Anti-spam
  failCooldownMs: 60_000,
};

export function runHomeUpgradesTick(ns, cfg, state, msgs, shared = null) {
  const laneCfg = { ...HOME_UPGRADES_DEFAULTS, ...((cfg && cfg.homeUpgrades) || {}) };
  if (!laneCfg.enabled) return;

  if (!state) return;
  if (!state.lastTick) state.lastTick = 0;
  if (!state.failAt) state.failAt = {};

  const now = Date.now();
  if (now - state.lastTick < laneCfg.tickMs) return;
  state.lastTick = now;

  const s = ns.singularity;
  if (!s) return;

  const augReserveHint = Number(shared?.augReserveHint || 0);

  // Capability checks (version-safe)
  const canRam = laneCfg.buyRam &&
    typeof s.getUpgradeHomeRamCost === "function" &&
    typeof s.upgradeHomeRam === "function";

  const canCores = laneCfg.buyCores &&
    typeof s.getUpgradeHomeCoresCost === "function" &&
    typeof s.upgradeHomeCores === "function";

  if (!canRam && !canCores) return;

  const money = safeNum(() => ns.getServerMoneyAvailable("home"), 0);

  // Spend governor: keep a cash reserve AND a liquidity floor
  const reserveA = laneCfg.reserveCash;
  const reserveB = money * (1 - laneCfg.maxSpendFrac);
  const reserveC = Math.max(0, Number(shared?.augReserveHint || 0));
  const reserve = Math.max(reserveA, reserveB, reserveC);

  const spendable = Math.max(0, money - reserve);
  if (spendable <= 0) return;

  const ramCost = canRam ? safeNum(() => s.getUpgradeHomeRamCost(), Infinity) : Infinity;
  const coreCost = canCores ? safeNum(() => s.getUpgradeHomeCoresCost(), Infinity) : Infinity;

  const choice = pickUpgrade(laneCfg.policy, ramCost, coreCost);
  if (!choice) return;

  // Cooldown repeated “can’t afford”
  if (!canAttempt(state, choice.key, laneCfg.failCooldownMs)) return;

  const cost = choice.key === "ram" ? ramCost : coreCost;
  if (!Number.isFinite(cost) || cost > spendable) {
    state.failAt[choice.key] = now;
    return;
  }

  // Execute
  let ok = false;
  try {
    ok = choice.key === "ram" ? Boolean(s.upgradeHomeRam()) : Boolean(s.upgradeHomeCores());
  } catch {
    ok = false;
  }

  if (ok) {
    msgs.push(`[home] upgraded ${choice.key.toUpperCase()} for ${fmtMoney(ns, cost)}`);
  } else {
    state.failAt[choice.key] = now;
  }
}

function pickUpgrade(policy, ramCost, coreCost) {
  const ramOk = Number.isFinite(ramCost);
  const coreOk = Number.isFinite(coreCost);

  if (!ramOk && !coreOk) return null;

  if (policy === "ram-first") {
    if (ramOk) return { key: "ram" };
    if (coreOk) return { key: "cores" };
    return null;
  }

  // cheapest (default)
  if (ramOk && coreOk) return ramCost <= coreCost ? { key: "ram" } : { key: "cores" };
  if (ramOk) return { key: "ram" };
  if (coreOk) return { key: "cores" };
  return null;
}

function canAttempt(state, key, cooldownMs) {
  const now = Date.now();
  const last = Number(state.failAt?.[key] || 0);
  return (now - last) >= cooldownMs;
}

function safeNum(fn, fallback) {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
