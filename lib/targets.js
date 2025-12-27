/** @param {NS} ns */
/*
 * lib/targets.js
 *
 * Shared target selection helpers:
 *  - Formulas.exe auto-detect + safe fallback
 *  - Money/sec scoring for primary batch target
 *  - XP scoring for HGW farm target
 */

import { getAllServers, countPortCrackers } from "/lib/rooting.js";

// ------------------------------------------------
// Small helpers
// ------------------------------------------------

export function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

export function fmtMoney(ns, value) {
  return "$" + ns.formatNumber(value, 2, 1e3);
}

// ------------------------------------------------
// Formulas.exe helpers (auto-detect + safe fallback)
// ------------------------------------------------

export function hasFormulas(ns) {
  try {
    return (
      ns.fileExists("Formulas.exe", "home") &&
      ns.formulas &&
      ns.formulas.hacking &&
      typeof ns.formulas.hacking.hackTime === "function"
    );
  } catch (_e) {
    return false;
  }
}

export function getHackTimeAndChance(ns, host) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(host),
      chance: ns.hackAnalyzeChance(host),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(host);

  // Compute optimistic baseline (min difficulty, max money)
  s.hackDifficulty = s.minDifficulty;
  s.moneyAvailable = Math.max(1, s.moneyMax || 0);

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    chance: ns.formulas.hacking.hackChance(s, player),
    usingFormulas: true,
  };
}

// ------------------------------------------------
// MONEY/sec SCORING (for main batch target)
// ------------------------------------------------

export function getScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  const MIN_MONEY_ABS = 1_000_000;
  const MIN_HACK_RATIO = 0.02;
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    "n00dles",
    "foodnstuff",
    "sigma-cosmetics",
    "joesguns",
    "harakiri-sushi",
    "hong-fang-tea",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue;

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;
    if (!maxMoney || maxMoney < MIN_MONEY_ABS) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);
    if (hackRatio < MIN_HACK_RATIO) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const moneyPerSec = maxMoney / tHack;

    const secPenalty = 1 + (minSec - 1) / 100;

    let bandBonus;
    if (hackRatio < 0.2)       bandBonus = 0.7;
    else if (hackRatio <= 0.8) bandBonus = 1.0;
    else                       bandBonus = 0.85;

    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1);

    const score = (moneyPerSec * bandBonus * chanceModifier) / secPenalty;

    scored.push({
      host,
      maxMoney,
      minSec,
      tHack,
      score,
      reqHack,
      chance,
      moneyPerSec,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function choosePrimaryTarget(ns, opts = {}) {
  const extraExcluded = opts.extraExcluded ?? [];
  const verbose = opts.verbose ?? true;

  const scored = getScoredServers(ns, extraExcluded);

  if (scored.length === 0) {
    if (verbose) {
      ns.tprint("❓ No juicy advanced target found with current filters.");
      ns.tprint("   Falling back to n00dles.");
    }
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  if (verbose) {
    ns.tprint("=======================================");
    ns.tprint("   💰 Juiciest Advanced Target (money/sec)");
    ns.tprint("=======================================");
    ns.tprint(`🎯 Host:       ${best.host}`);
    ns.tprint(`💸 Max Money:  ${fmtMoney(ns, best.maxMoney)}`);
    ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
    ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
    ns.tprint(`🛡 MinSec:     ${best.minSec.toFixed(2)}`);
    ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
    ns.tprint(`💰 Money/sec:  ${fmtMoney(ns, best.moneyPerSec * 1000)}`);
    ns.tprint(`📈 Score:      ${best.score.toExponential(3)}`);

    const topN = Math.min(5, scored.length);
    ns.tprint("=======================================");
    ns.tprint("   🏆 Top Candidates (by money/sec)");
    ns.tprint("=======================================");
    for (let i = 0; i < topN; i++) {
      const h = scored[i];
      ns.tprint(
        `${i + 1}. ${h.host} | ` +
        `Score=${h.score.toExponential(2)} | ` +
        `Money=${fmtMoney(ns, h.maxMoney)} | ` +
        `ReqHack=${h.reqHack} | ` +
        `Chance=${(h.chance * 100).toFixed(1)}% | ` +
        `Sec=${h.minSec.toFixed(1)} | ` +
        `T=${(h.tHack / 1000).toFixed(1)}s | ` +
        `hackRatio=${(h.hackRatio * 100).toFixed(0)}% | ` +
        `$/sec=${fmtMoney(ns, h.moneyPerSec * 1000)}`
      );
    }
  }

  return { target: best.host, scored };
}

export function chooseSecondaryTarget(ns, primary, opts = {}) {
  const extraExcluded = opts.extraExcluded ?? [];
  const verbose = opts.verbose ?? true;

  const scored = getScoredServers(ns, [primary, ...extraExcluded]);

  if (scored.length === 0) {
    if (verbose) ns.tprint("❓ No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  if (verbose) ns.tprint(`💰 Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ------------------------------------------------
// XP SCORING (for HGW farm target)
// ------------------------------------------------

export function getXpScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  const EXCLUDED = new Set([
    "home",
    "darkweb",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue;

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);

    let bandBonus;
    if (hackRatio < 0.4)       bandBonus = 0.5;
    else if (hackRatio <= 1.2) bandBonus = 1.1;
    else if (hackRatio <= 1.6) bandBonus = 1.0;
    else                       bandBonus = 0.7;

    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1);
    const baseXpScore    = (reqHack * chanceModifier) / Math.pow(tHack, 1.2);

    const score = baseXpScore * bandBonus;

    scored.push({
      host,
      score,
      reqHack,
      chance,
      tHack,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function chooseXpTarget(ns, primary, opts = {}) {
  const extraExcluded = opts.extraExcluded ?? [];
  const verbose = opts.verbose ?? true;

  const scored = getXpScoredServers(ns, [primary, ...extraExcluded]);

  if (scored.length === 0) {
    if (verbose) {
      ns.tprint("❓ No distinct XP-optimized HGW target found.");
      ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    }
    return "n00dles";
  }

  const best = scored[0];

  if (verbose) {
    ns.tprint("=======================================");
    ns.tprint("   🧠 XP-Optimized HGW Target");
    ns.tprint("=======================================");
    ns.tprint(`🎯 Host:       ${best.host}`);
    ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
    ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
    ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
    ns.tprint(`📈 XP Score:   ${best.score.toExponential(3)}`);
    ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

    const topN = Math.min(5, scored.length);
    ns.tprint("=======================================");
    ns.tprint("   🧠 Top XP Candidates");
    ns.tprint("=======================================");
    for (let i = 0; i < topN; i++) {
      const h = scored[i];
      ns.tprint(
        `${i + 1}. ${h.host} | ` +
        `XPScore=${h.score.toExponential(2)} | ` +
        `ReqHack=${h.reqHack} | ` +
        `Chance=${(h.chance * 100).toFixed(1)}% | ` +
        `T=${(h.tHack / 1000).toFixed(1)}s | ` +
        `hackRatio=${(h.hackRatio * 100).toFixed(0)}%`
      );
    }
  }

  return best.host;
}
