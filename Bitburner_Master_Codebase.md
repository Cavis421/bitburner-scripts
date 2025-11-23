# Bitburner Master Codebase

> This file holds the full Bitburner script toolkit for my runs.  
> Each script is stored in its own section, with the exact filename  
> as used in-game. ChatGPT should treat these as the source of truth.

---

## Table of Contents

Startup & Orchestration  
- [startup-home-advanced.js](#startup-home-advancedjs) — Main home bootstrap  
- [root-and-deploy.js](#root-and-deployjs) — Root everything + initial deploy  
- [timed-net-batcher2.js](#timed-net-batcher2js) — Hybrid HWGW batcher (v2)

Batch Workers  
- [batch-hack.js](#batch-hackjs) — Timed hack worker  
- [batch-grow.js](#batch-growjs) — Timed grow worker  
- [batch-weaken.js](#batch-weakenjs) — Timed weaken worker  

Botnet / HGW  
- [auto-hgw.js](#auto-hgwjs) — Simple autonomous single-target HGW loop  
- [botnet-hgw-sync.js](#botnet-hgw-syncjs) — Maintains HGW deployments  
- [botnet-hgw-status.js](#botnet-hgw-statusjs) — Status of HGW swarm  
- [remote-hgw.js](#remote-hgwjs) — Simple remote HGW worker (optional)

Fleet & Hacknet  
- [pserv-manager.js](#pserv-managerjs) — Purchase/upgrade server fleet  
- [hacknet-smart.js](#hacknet-smartjs) — Smart Hacknet upgrade logic  
- [hacknet-status.js](#hacknet-statusjs) — Snapshot of Hacknet production

UI / Monitoring  
- [ops-dashboard.js](#ops-dashboardjs) — One-shot full operational dashboard  
- [process-monitor.js](#process-monitorjs) — Live RAM/thread/PID monitor

Utilities / Info  
- [whats-my-bitnode.js](#whats-my-bitnodejs) — Prints current BitNode number  
- [xp-to-next-level.js](#xp-to-next-leveljs) — XP needed to next hacking level  
- [karma-watch.js](#karma-watchjs) — (Optional) logs karma in real-time


---

## startup-home-advanced.js
> Main bootstrap: selects targets, kills old processes, launches managers + batchers.
```js
/** @param {NS} ns */

// ────────────────────────────────────────────────
// Network helpers
// ────────────────────────────────────────────────

function getAllServers(ns) {
  const visited = new Set();
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return Array.from(visited);
}

function countPortCrackers(ns) {
  const programs = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
  ];
  return programs.filter(p => ns.fileExists(p, "home")).length;
}

function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

// ────────────────────────────────────────────────
// Formulas.exe helpers (auto-detect + safe fallback)
// ────────────────────────────────────────────────

function hasFormulas(ns) {
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

/**
 * Return { tHack, chance, usingFormulas } for a given host.
 * Uses ns.formulas.hacking.* if Formulas.exe is available, otherwise
 * falls back to ns.getHackTime / ns.hackAnalyzeChance.
 */
function getHackTimeAndChance(ns, host) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(host),
      chance: ns.hackAnalyzeChance(host),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(host);

  // For scoring we assume a "prepped" target: min sec, max money.
  s.hackDifficulty = s.minDifficulty;
  s.moneyAvailable = Math.max(1, s.moneyMax || 0);

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    chance: ns.formulas.hacking.hackChance(s, player),
    usingFormulas: true,
  };
}

// ────────────────────────────────────────────────
// MONEY/sec SCORING (for main batch target)
// ────────────────────────────────────────────────

function getScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // Basic filters
  const MIN_MONEY_ABS = 1_000_000; // ignore truly trash servers
  const MIN_HACK_RATIO = 0.02;     // at least 2% of your level
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    // ultra-early game stuff we never want to main-target late:
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
    if (pservs.has(host)) continue; // never target purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    // Capability checks
    if (reqHack > hackingLevel) continue;                // can't hack yet
    if (reqPorts > portCrackers) continue;               // can't root yet
    if (!maxMoney || maxMoney < MIN_MONEY_ABS) continue; // too poor

    // Avoid *super* trivial stuff relative to current level
    const hackRatio = reqHack / Math.max(1, hackingLevel);
    if (hackRatio < MIN_HACK_RATIO) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const moneyPerSec = maxMoney / tHack;

    // Slight penalties / modifiers
    const secPenalty = 1 + (minSec - 1) / 100; // very gentle

    // Hack level band preference: targets ~20–80% of your level are "ideal"
    let bandBonus;
    if (hackRatio < 0.2)      bandBonus = 0.7;  // too easy: slight penalty
    else if (hackRatio <= 0.8) bandBonus = 1.0; // sweet spot
    else                       bandBonus = 0.85; // slightly above level: small penalty

    // Chance modifier: 0.5–1.0 range
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

function choosePrimaryTarget(ns) {
  const scored = getScoredServers(ns);

  if (scored.length === 0) {
    ns.tprint("❌ No juicy advanced target found with current filters.");
    ns.tprint("   Falling back to n00dles.");
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧃 Juiciest Advanced Target (v4: tuned money/sec)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`💰 Max Money:  ${ns.nFormat(best.maxMoney, "$0.00a")}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`🛡 MinSec:     ${best.minSec.toFixed(2)}`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`💸 Money/sec:  ${ns.nFormat(best.moneyPerSec * 1000, "$0.00a")}`);
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
      `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `Sec=${h.minSec.toFixed(1)} | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}% | ` +
      `$/sec=${ns.nFormat(h.moneyPerSec * 1000, "$0.00a")}`
    );
  }

  return { target: best.host, scored };
}

// ────────────────────────────────────────────────
// XP SCORING (for HGW farm target - tweaked)
// ────────────────────────────────────────────────

function getXpScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // XP farming cares less about money; we just want good hack-time & reqHack.
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue; // never farm purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

    // Capability checks – must be hackable/rootable
    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);

    // XP sweet spot:
    //  - below ~40% of your level = too easy → penalty
    //  - ~40%–120% of your level = sweet band
    //  - way above = small penalty (still sometimes okay)
    let bandBonus;
    if (hackRatio < 0.4)       bandBonus = 0.5;  // way too easy
    else if (hackRatio <= 1.2) bandBonus = 1.1;  // prime XP band
    else if (hackRatio <= 1.6) bandBonus = 1.0;  // a bit above you
    else                       bandBonus = 0.7;  // too hard / slow

    // XP per second is roughly "difficulty-ish" * success rate / time.
    // Approximate difficulty with reqHack, and reward fast hack times by / tHack^1.2
    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1); // 0.5–1.0
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

function chooseXpTarget(ns, primary) {
  // Explicitly exclude the main batch target to avoid conflict
  const scored = getXpScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("⚠️ No distinct XP-optimized HGW target found.");
    ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    return "n00dles";
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧠 XP-Optimized HGW Target (tweaked)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`📈 XP Score:   ${best.score.toExponential(3)}`);
  ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   🏆 Top XP Candidates");
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

  return best.host;
}

// (Optional: keep the old money-based secondary in case you use it elsewhere)
function chooseSecondaryTarget(ns, primary) {
  const scored = getScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("ℹ️ No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  ns.tprint(`🎯 Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────

export async function main(ns) {
  ns.disableLog("ALL");

  const formulasAvailable = hasFormulas(ns);
  ns.tprint(
    formulasAvailable
      ? "🧮 Formulas.exe detected — using formulas-based times/chance where possible."
      : "ℹ️ Formulas.exe not detected — using built-in timing/scoring APIs."
  );

  // Parse flags *inside* main
  const flags = ns.flags([
    ["hgw", "xp"],   // xp | money
  ]);

  const hgwMode = String(flags.hgw ?? "xp").toLowerCase();

  const HOME_RAM_RESERVE = 32;   // Leave a bit free for ad-hoc scripts
  const PSERV_TARGET_RAM = 2048; // GB per purchased server (tweak as you upgrade)

  // flags._ contains positional args after flags
  const override = flags._[0] || null;

  let batchTarget;
  let hgwTarget;

  if (override) {
    batchTarget = override;
    ns.tprint(`🎯 STARTUP-HOME: Manual override batch target: ${batchTarget}`);
  } else {
    const { target: autoTarget } = choosePrimaryTarget(ns);
    batchTarget = autoTarget || "n00dles";
    ns.tprint(`🎯 STARTUP-HOME: Auto-selected batch target: ${batchTarget}`);
  }

  // Pick HGW target based on flag
  if (hgwMode === "money") {
    ns.tprint("💰 HGW Mode: MONEY");
    hgwTarget = chooseSecondaryTarget(ns, batchTarget);
  } else {
    ns.tprint("🧠 HGW Mode: XP");
    hgwTarget = chooseXpTarget(ns, batchTarget);
  }

  ns.tprint(`🎯 BATCH TARGET (money):      ${batchTarget}`);
  ns.tprint(`🎯 HGW TARGET (${hgwMode.toUpperCase()}): ${hgwTarget}`);

  ns.tprint("🏠 STARTUP-HOME: Killing all processes on home...");

  const myPid = ns.pid;
  const processes = ns.ps("home");

  for (const p of processes) {
    if (p.pid === myPid) continue;
    ns.kill(p.pid);
  }

  await ns.sleep(200); // allow cleanup

  ns.tprint("✔️ Home is clean. Relaunching core automation...");

  function safeExec(script, threads = 1, ...args) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`⚠️ Missing script: ${script}`);
      return;
    }

    const ramCost = ns.getScriptRam(script, "home") * threads;
    const used    = ns.getServerUsedRam("home");
    const max     = ns.getServerMaxRam("home");
    const free    = max - used - HOME_RAM_RESERVE;

    if (ramCost > free) {
      ns.tprint(`❌ Not enough RAM to start ${script} (${threads} threads)`);
      return;
    }

    const pid = ns.exec(script, "home", threads, ...args);
    if (pid === 0) {
      ns.tprint(`❌ Failed to launch ${script}`);
    } else {
      const argInfo = args.length ? ` ${JSON.stringify(args)}` : "";
      ns.tprint(`▶️ Started ${script} (pid ${pid})${argInfo}`);
    }
  }

  // Core stack
  safeExec("pserv-manager.js",       1, PSERV_TARGET_RAM);
  safeExec("timed-net-batcher2.js",  1, batchTarget); // money target
  safeExec("root-and-deploy.js",     1, batchTarget);
  safeExec("botnet-hgw-sync.js",     1, hgwTarget, hgwMode);   // XP or money target
  // safeExec("hacknet-smart.js",    1);
  await ns.sleep(3000);
  // Status / visibility
  safeExec("botnet-hgw-status.js",   1);
  safeExec("hacknet-status.js",      1);
  // safeExec("ops-dashboard.js",    1, batchTarget); // optional one-shot

  ns.tprint("🎉 STARTUP-HOME COMPLETE — full automation online.");
}

```

---

## root-and-deploy.js
> Roots all reachable servers; deploys initial scripts where needed
```js
/** @param {NS} ns */

// ────────────────────────────────────────────────
// Network helpers
// ────────────────────────────────────────────────

function getAllServers(ns) {
  const visited = new Set();
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return Array.from(visited);
}

function countPortCrackers(ns) {
  const programs = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
  ];
  return programs.filter(p => ns.fileExists(p, "home")).length;
}

function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

// ────────────────────────────────────────────────
// Formulas.exe helpers (auto-detect + safe fallback)
// ────────────────────────────────────────────────

function hasFormulas(ns) {
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

/**
 * Return { tHack, chance, usingFormulas } for a given host.
 * Uses ns.formulas.hacking.* if Formulas.exe is available, otherwise
 * falls back to ns.getHackTime / ns.hackAnalyzeChance.
 */
function getHackTimeAndChance(ns, host) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(host),
      chance: ns.hackAnalyzeChance(host),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(host);

  // For scoring we assume a "prepped" target: min sec, max money.
  s.hackDifficulty = s.minDifficulty;
  s.moneyAvailable = Math.max(1, s.moneyMax || 0);

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    chance: ns.formulas.hacking.hackChance(s, player),
    usingFormulas: true,
  };
}

// ────────────────────────────────────────────────
// MONEY/sec SCORING (for main batch target)
// ────────────────────────────────────────────────

function getScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // Basic filters
  const MIN_MONEY_ABS = 1_000_000; // ignore truly trash servers
  const MIN_HACK_RATIO = 0.02;     // at least 2% of your level
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    // ultra-early game stuff we never want to main-target late:
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
    if (pservs.has(host)) continue; // never target purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    // Capability checks
    if (reqHack > hackingLevel) continue;                // can't hack yet
    if (reqPorts > portCrackers) continue;               // can't root yet
    if (!maxMoney || maxMoney < MIN_MONEY_ABS) continue; // too poor

    // Avoid *super* trivial stuff relative to current level
    const hackRatio = reqHack / Math.max(1, hackingLevel);
    if (hackRatio < MIN_HACK_RATIO) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const moneyPerSec = maxMoney / tHack;

    // Slight penalties / modifiers
    const secPenalty = 1 + (minSec - 1) / 100; // very gentle

    // Hack level band preference: targets ~20–80% of your level are "ideal"
    let bandBonus;
    if (hackRatio < 0.2)      bandBonus = 0.7;  // too easy: slight penalty
    else if (hackRatio <= 0.8) bandBonus = 1.0; // sweet spot
    else                       bandBonus = 0.85; // slightly above level: small penalty

    // Chance modifier: 0.5–1.0 range
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

function choosePrimaryTarget(ns) {
  const scored = getScoredServers(ns);

  if (scored.length === 0) {
    ns.tprint("❌ No juicy advanced target found with current filters.");
    ns.tprint("   Falling back to n00dles.");
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧃 Juiciest Advanced Target (v4: tuned money/sec)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`💰 Max Money:  ${ns.nFormat(best.maxMoney, "$0.00a")}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`🛡 MinSec:     ${best.minSec.toFixed(2)}`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`💸 Money/sec:  ${ns.nFormat(best.moneyPerSec * 1000, "$0.00a")}`);
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
      `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `Sec=${h.minSec.toFixed(1)} | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}% | ` +
      `$/sec=${ns.nFormat(h.moneyPerSec * 1000, "$0.00a")}`
    );
  }

  return { target: best.host, scored };
}

// ────────────────────────────────────────────────
// XP SCORING (for HGW farm target - tweaked)
// ────────────────────────────────────────────────

function getXpScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // XP farming cares less about money; we just want good hack-time & reqHack.
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue; // never farm purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

    // Capability checks – must be hackable/rootable
    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);

    // XP sweet spot:
    //  - below ~40% of your level = too easy → penalty
    //  - ~40%–120% of your level = sweet band
    //  - way above = small penalty (still sometimes okay)
    let bandBonus;
    if (hackRatio < 0.4)       bandBonus = 0.5;  // way too easy
    else if (hackRatio <= 1.2) bandBonus = 1.1;  // prime XP band
    else if (hackRatio <= 1.6) bandBonus = 1.0;  // a bit above you
    else                       bandBonus = 0.7;  // too hard / slow

    // XP per second is roughly "difficulty-ish" * success rate / time.
    // Approximate difficulty with reqHack, and reward fast hack times by / tHack^1.2
    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1); // 0.5–1.0
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

function chooseXpTarget(ns, primary) {
  // Explicitly exclude the main batch target to avoid conflict
  const scored = getXpScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("⚠️ No distinct XP-optimized HGW target found.");
    ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    return "n00dles";
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧠 XP-Optimized HGW Target (tweaked)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`📈 XP Score:   ${best.score.toExponential(3)}`);
  ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   🏆 Top XP Candidates");
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

  return best.host;
}

// (Optional: keep the old money-based secondary in case you use it elsewhere)
function chooseSecondaryTarget(ns, primary) {
  const scored = getScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("ℹ️ No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  ns.tprint(`🎯 Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────

export async function main(ns) {
  ns.disableLog("ALL");

  const formulasAvailable = hasFormulas(ns);
  ns.tprint(
    formulasAvailable
      ? "🧮 Formulas.exe detected — using formulas-based times/chance where possible."
      : "ℹ️ Formulas.exe not detected — using built-in timing/scoring APIs."
  );

  // Parse flags *inside* main
  const flags = ns.flags([
    ["hgw", "xp"],   // xp | money
  ]);

  const hgwMode = String(flags.hgw ?? "xp").toLowerCase();

  const HOME_RAM_RESERVE = 32;   // Leave a bit free for ad-hoc scripts
  const PSERV_TARGET_RAM = 2048; // GB per purchased server (tweak as you upgrade)

  // flags._ contains positional args after flags
  const override = flags._[0] || null;

  let batchTarget;
  let hgwTarget;

  if (override) {
    batchTarget = override;
    ns.tprint(`🎯 STARTUP-HOME: Manual override batch target: ${batchTarget}`);
  } else {
    const { target: autoTarget } = choosePrimaryTarget(ns);
    batchTarget = autoTarget || "n00dles";
    ns.tprint(`🎯 STARTUP-HOME: Auto-selected batch target: ${batchTarget}`);
  }

  // Pick HGW target based on flag
  if (hgwMode === "money") {
    ns.tprint("💰 HGW Mode: MONEY");
    hgwTarget = chooseSecondaryTarget(ns, batchTarget);
  } else {
    ns.tprint("🧠 HGW Mode: XP");
    hgwTarget = chooseXpTarget(ns, batchTarget);
  }

  ns.tprint(`🎯 BATCH TARGET (money):      ${batchTarget}`);
  ns.tprint(`🎯 HGW TARGET (${hgwMode.toUpperCase()}): ${hgwTarget}`);

  ns.tprint("🏠 STARTUP-HOME: Killing all processes on home...");

  const myPid = ns.pid;
  const processes = ns.ps("home");

  for (const p of processes) {
    if (p.pid === myPid) continue;
    ns.kill(p.pid);
  }

  await ns.sleep(200); // allow cleanup

  ns.tprint("✔️ Home is clean. Relaunching core automation...");

  function safeExec(script, threads = 1, ...args) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`⚠️ Missing script: ${script}`);
      return;
    }

    const ramCost = ns.getScriptRam(script, "home") * threads;
    const used    = ns.getServerUsedRam("home");
    const max     = ns.getServerMaxRam("home");
    const free    = max - used - HOME_RAM_RESERVE;

    if (ramCost > free) {
      ns.tprint(`❌ Not enough RAM to start ${script} (${threads} threads)`);
      return;
    }

    const pid = ns.exec(script, "home", threads, ...args);
    if (pid === 0) {
      ns.tprint(`❌ Failed to launch ${script}`);
    } else {
      const argInfo = args.length ? ` ${JSON.stringify(args)}` : "";
      ns.tprint(`▶️ Started ${script} (pid ${pid})${argInfo}`);
    }
  }

  // Core stack
  safeExec("pserv-manager.js",       1, PSERV_TARGET_RAM);
  safeExec("timed-net-batcher2.js",  1, batchTarget); // money target
  safeExec("root-and-deploy.js",     1, batchTarget);
  safeExec("botnet-hgw-sync.js",     1, hgwTarget, hgwMode);   // XP or money target
  // safeExec("hacknet-smart.js",    1);
  await ns.sleep(3000);
  // Status / visibility
  safeExec("botnet-hgw-status.js",   1);
  safeExec("hacknet-status.js",      1);
  // safeExec("ops-dashboard.js",    1, batchTarget); // optional one-shot

  ns.tprint("🎉 STARTUP-HOME COMPLETE — full automation online.");
}

```

--- 

## timed-net-batcher2.js
> Hybrid HWGW batcher: HOME = hack, pservs = grow/weaken with timing alignment
```js
/** @param {NS} ns */

// ────────────────────────────────────────────────
// Network helpers
// ────────────────────────────────────────────────

function getAllServers(ns) {
  const visited = new Set();
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return Array.from(visited);
}

function countPortCrackers(ns) {
  const programs = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
  ];
  return programs.filter(p => ns.fileExists(p, "home")).length;
}

function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

// ────────────────────────────────────────────────
// Formulas.exe helpers (auto-detect + safe fallback)
// ────────────────────────────────────────────────

function hasFormulas(ns) {
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

/**
 * Return { tHack, chance, usingFormulas } for a given host.
 * Uses ns.formulas.hacking.* if Formulas.exe is available, otherwise
 * falls back to ns.getHackTime / ns.hackAnalyzeChance.
 */
function getHackTimeAndChance(ns, host) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(host),
      chance: ns.hackAnalyzeChance(host),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(host);

  // For scoring we assume a "prepped" target: min sec, max money.
  s.hackDifficulty = s.minDifficulty;
  s.moneyAvailable = Math.max(1, s.moneyMax || 0);

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    chance: ns.formulas.hacking.hackChance(s, player),
    usingFormulas: true,
  };
}

// ────────────────────────────────────────────────
// MONEY/sec SCORING (for main batch target)
// ────────────────────────────────────────────────

function getScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // Basic filters
  const MIN_MONEY_ABS = 1_000_000; // ignore truly trash servers
  const MIN_HACK_RATIO = 0.02;     // at least 2% of your level
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    // ultra-early game stuff we never want to main-target late:
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
    if (pservs.has(host)) continue; // never target purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    // Capability checks
    if (reqHack > hackingLevel) continue;                // can't hack yet
    if (reqPorts > portCrackers) continue;               // can't root yet
    if (!maxMoney || maxMoney < MIN_MONEY_ABS) continue; // too poor

    // Avoid *super* trivial stuff relative to current level
    const hackRatio = reqHack / Math.max(1, hackingLevel);
    if (hackRatio < MIN_HACK_RATIO) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const moneyPerSec = maxMoney / tHack;

    // Slight penalties / modifiers
    const secPenalty = 1 + (minSec - 1) / 100; // very gentle

    // Hack level band preference: targets ~20–80% of your level are "ideal"
    let bandBonus;
    if (hackRatio < 0.2)      bandBonus = 0.7;  // too easy: slight penalty
    else if (hackRatio <= 0.8) bandBonus = 1.0; // sweet spot
    else                       bandBonus = 0.85; // slightly above level: small penalty

    // Chance modifier: 0.5–1.0 range
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

function choosePrimaryTarget(ns) {
  const scored = getScoredServers(ns);

  if (scored.length === 0) {
    ns.tprint("❌ No juicy advanced target found with current filters.");
    ns.tprint("   Falling back to n00dles.");
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧃 Juiciest Advanced Target (v4: tuned money/sec)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`💰 Max Money:  ${ns.nFormat(best.maxMoney, "$0.00a")}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`🛡 MinSec:     ${best.minSec.toFixed(2)}`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`💸 Money/sec:  ${ns.nFormat(best.moneyPerSec * 1000, "$0.00a")}`);
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
      `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `Sec=${h.minSec.toFixed(1)} | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}% | ` +
      `$/sec=${ns.nFormat(h.moneyPerSec * 1000, "$0.00a")}`
    );
  }

  return { target: best.host, scored };
}

// ────────────────────────────────────────────────
// XP SCORING (for HGW farm target - tweaked)
// ────────────────────────────────────────────────

function getXpScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // XP farming cares less about money; we just want good hack-time & reqHack.
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue; // never farm purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

    // Capability checks – must be hackable/rootable
    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);

    // XP sweet spot:
    //  - below ~40% of your level = too easy → penalty
    //  - ~40%–120% of your level = sweet band
    //  - way above = small penalty (still sometimes okay)
    let bandBonus;
    if (hackRatio < 0.4)       bandBonus = 0.5;  // way too easy
    else if (hackRatio <= 1.2) bandBonus = 1.1;  // prime XP band
    else if (hackRatio <= 1.6) bandBonus = 1.0;  // a bit above you
    else                       bandBonus = 0.7;  // too hard / slow

    // XP per second is roughly "difficulty-ish" * success rate / time.
    // Approximate difficulty with reqHack, and reward fast hack times by / tHack^1.2
    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1); // 0.5–1.0
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

function chooseXpTarget(ns, primary) {
  // Explicitly exclude the main batch target to avoid conflict
  const scored = getXpScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("⚠️ No distinct XP-optimized HGW target found.");
    ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    return "n00dles";
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧠 XP-Optimized HGW Target (tweaked)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`📈 XP Score:   ${best.score.toExponential(3)}`);
  ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   🏆 Top XP Candidates");
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

  return best.host;
}

// (Optional: keep the old money-based secondary in case you use it elsewhere)
function chooseSecondaryTarget(ns, primary) {
  const scored = getScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("ℹ️ No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  ns.tprint(`🎯 Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────

export async function main(ns) {
  ns.disableLog("ALL");

  const formulasAvailable = hasFormulas(ns);
  ns.tprint(
    formulasAvailable
      ? "🧮 Formulas.exe detected — using formulas-based times/chance where possible."
      : "ℹ️ Formulas.exe not detected — using built-in timing/scoring APIs."
  );

  // Parse flags *inside* main
  const flags = ns.flags([
    ["hgw", "xp"],   // xp | money
  ]);

  const hgwMode = String(flags.hgw ?? "xp").toLowerCase();

  const HOME_RAM_RESERVE = 32;   // Leave a bit free for ad-hoc scripts
  const PSERV_TARGET_RAM = 2048; // GB per purchased server (tweak as you upgrade)

  // flags._ contains positional args after flags
  const override = flags._[0] || null;

  let batchTarget;
  let hgwTarget;

  if (override) {
    batchTarget = override;
    ns.tprint(`🎯 STARTUP-HOME: Manual override batch target: ${batchTarget}`);
  } else {
    const { target: autoTarget } = choosePrimaryTarget(ns);
    batchTarget = autoTarget || "n00dles";
    ns.tprint(`🎯 STARTUP-HOME: Auto-selected batch target: ${batchTarget}`);
  }

  // Pick HGW target based on flag
  if (hgwMode === "money") {
    ns.tprint("💰 HGW Mode: MONEY");
    hgwTarget = chooseSecondaryTarget(ns, batchTarget);
  } else {
    ns.tprint("🧠 HGW Mode: XP");
    hgwTarget = chooseXpTarget(ns, batchTarget);
  }

  ns.tprint(`🎯 BATCH TARGET (money):      ${batchTarget}`);
  ns.tprint(`🎯 HGW TARGET (${hgwMode.toUpperCase()}): ${hgwTarget}`);

  ns.tprint("🏠 STARTUP-HOME: Killing all processes on home...");

  const myPid = ns.pid;
  const processes = ns.ps("home");

  for (const p of processes) {
    if (p.pid === myPid) continue;
    ns.kill(p.pid);
  }

  await ns.sleep(200); // allow cleanup

  ns.tprint("✔️ Home is clean. Relaunching core automation...");

  function safeExec(script, threads = 1, ...args) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`⚠️ Missing script: ${script}`);
      return;
    }

    const ramCost = ns.getScriptRam(script, "home") * threads;
    const used    = ns.getServerUsedRam("home");
    const max     = ns.getServerMaxRam("home");
    const free    = max - used - HOME_RAM_RESERVE;

    if (ramCost > free) {
      ns.tprint(`❌ Not enough RAM to start ${script} (${threads} threads)`);
      return;
    }

    const pid = ns.exec(script, "home", threads, ...args);
    if (pid === 0) {
      ns.tprint(`❌ Failed to launch ${script}`);
    } else {
      const argInfo = args.length ? ` ${JSON.stringify(args)}` : "";
      ns.tprint(`▶️ Started ${script} (pid ${pid})${argInfo}`);
    }
  }

  // Core stack
  safeExec("pserv-manager.js",       1, PSERV_TARGET_RAM);
  safeExec("timed-net-batcher2.js",  1, batchTarget); // money target
  safeExec("root-and-deploy.js",     1, batchTarget);
  safeExec("botnet-hgw-sync.js",     1, hgwTarget, hgwMode);   // XP or money target
  // safeExec("hacknet-smart.js",    1);
  await ns.sleep(3000);
  // Status / visibility
  safeExec("botnet-hgw-status.js",   1);
  safeExec("hacknet-status.js",      1);
  // safeExec("ops-dashboard.js",    1, batchTarget); // optional one-shot

  ns.tprint("🎉 STARTUP-HOME COMPLETE — full automation online.");
}

```

---

## batch-hack.js
> Worker script for timed hack operations
```js
/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const startDelay = Number(ns.args[1] ?? 0);
    const expectedTime = Number(ns.args[2] ?? 0);  // MUST be hack time

    if (!target) return;

    // Delay until batch start
    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.hack(target);
    const end = performance.now();

    const actual = end - start;
    const drift = expectedTime - actual;

    if (drift > 1) await ns.sleep(drift);
}
```

---

## batch-grow.js
>Worker script for timed grow operations
```js
/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const startDelay = Number(ns.args[1] ?? 0);
    const expectedTime = Number(ns.args[2] ?? 0); // grow time

    if (!target) return;

    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.grow(target);
    const end = performance.now();

    const drift = expectedTime - (end - start);
    if (drift > 1) await ns.sleep(drift);
}

```

---

## batch-weaken.js
> Worker script for timed weaken operations
```js
/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const startDelay = Number(ns.args[1] ?? 0);
    const expectedTime = Number(ns.args[2] ?? 0); // weaken time

    if (!target) return;

    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.weaken(target);
    const end = performance.now();

    const drift = expectedTime - (end - start);
    if (drift > 1) await ns.sleep(drift);
}
```

--- 
## auto-hgw.js
> Simple standalone HGW script: auto-selects a good target and maintains it at high money / low security

```js
/** @param {NS} ns */
export async function main(ns) {
    const target = findBestTarget(ns);

    if (!target) {
        ns.tprint("❌ No suitable target found.");
        return;
    }

    // Make sure we have root on the target
    if (!ns.hasRootAccess(target)) {
        openPortsAndNuke(ns, target);
    }

    if (!ns.hasRootAccess(target)) {
        ns.tprint(`❌ Still no root on ${target}. Need more port crackers or hacking level.`);
        return;
    }

    ns.tprint(`🎯 Best target: ${target}`);

    const maxMoney = ns.getServerMaxMoney(target);
    const minSec   = ns.getServerMinSecurityLevel(target);

    // With your stats, we can be a little more aggressive
    const moneyThresh    = maxMoney * 0.95;       // 95% of max
    const securityThresh = minSec + 1;            // keep it close to min

    ns.tprint(`💰 Max: ${ns.nFormat(maxMoney, "$0.00a")} | Thresh: ${ns.nFormat(moneyThresh, "$0.00a")}`);
    ns.tprint(`🛡 MinSec: ${minSec.toFixed(2)} | Thresh: ${securityThresh.toFixed(2)}`);

    while (true) {
        const curSec   = ns.getServerSecurityLevel(target);
        const curMoney = ns.getServerMoneyAvailable(target);

        if (curSec > securityThresh) {
            await ns.weaken(target);
        } else if (curMoney < moneyThresh) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}

/** Find all servers reachable from 'home' */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);
        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/** Count how many port crackers we have */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}

/** Try to open ports and nuke target */
function openPortsAndNuke(ns, target) {
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(target);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(target);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(target);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(target);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(target);
    try {
        ns.nuke(target);
    } catch {
        // hasRootAccess will tell us if it worked
    }
}

/** Pick the “best” target: money × growth / security, with some filters */
function findBestTarget(ns) {
    const servers       = getAllServers(ns);
    const hackingLevel  = ns.getHackingLevel();
    const portCrackers  = countPortCrackers(ns);

    let bestTarget = null;
    let bestScore  = 0;

    for (const server of servers) {
        if (server === "home") continue;

        const maxMoney   = ns.getServerMaxMoney(server);
        const minSec     = ns.getServerMinSecurityLevel(server);
        const growth     = ns.getServerGrowth(server);
        const reqHack    = ns.getServerRequiredHackingLevel(server);
        const reqPorts   = ns.getServerNumPortsRequired(server);

        // Skip junk servers
        if (maxMoney <= 250_000) continue;   // ignore tiny ones
        if (growth < 10) continue;           // ignore low-growth
        if (reqHack > hackingLevel) continue;
        if (reqPorts > portCrackers) continue;

        const score = (maxMoney * growth) / minSec;

        if (score > bestScore) {
            bestScore  = score;
            bestTarget = server;
        }
    }

    return bestTarget;
}
```

--- 

## botnet-hgw-sync.js
> deploys/refreshes HGW workers across purchased servers
```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = ns.args[0] || "omega-net";
    const mode = String(ns.args[1] || "xp").toLowerCase();
    const workerScript = "remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`❌ ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`🔄 Botnet HGW sync started. Target: ${target} | Mode: ${mode.toUpperCase()}`);

    const lastRam = {};
    const pservs = new Set(ns.getPurchasedServers());

    while (true) {
        const allServers = getAllServers(ns);

        for (const host of allServers) {
            // We let home + pservs be handled by the batcher.
            if (host === "home") continue;
            if (pservs.has(host)) continue;

            if (!ns.hasRootAccess(host)) continue;

            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < 2) {
                ns.print(`💤 Skipping ${host}: only ${maxRam}GB RAM`);
                continue;
            }

            const running = ns.isRunning(workerScript, host, target, mode);
            const previousRam = lastRam[host] ?? 0;

            const needsDeploy =
                !running ||
                maxRam > previousRam ||
                !ns.fileExists(workerScript, host);

            if (!needsDeploy) continue;

            ns.tprint(`🚀 (re)deploying HGW on ${host}: RAM ${previousRam}GB → ${maxRam}GB`);

            ns.killall(host);

            const ok = await ns.scp(workerScript, host);
            if (!ok) {
                ns.tprint(`⚠️ Failed to SCP ${workerScript} to ${host}`);
                continue;
            }

            const scriptRam = ns.getScriptRam(workerScript);
            const threads = Math.floor(maxRam / scriptRam);

            if (threads < 1) {
                ns.tprint(`⚠️ ${host}: not enough RAM for even 1 thread.`);
                continue;
            }

            const pid = ns.exec(workerScript, host, threads, target, mode);
            if (pid === 0) {
                ns.tprint(`❌ Failed to start ${workerScript} on ${host}`);
                continue;
            }

            lastRam[host] = maxRam;
            ns.print(`✅ ${host}: running ${workerScript} x${threads} vs ${target} [${mode}]`);
        }

        await ns.sleep(10_000); // every 10s, resync
    }
}

/** Breadth-first search of the network */
function getAllServers(ns) {
    const visited = new Set();
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) queue.push(neighbor);
        }
    }

    return Array.from(visited);
}

```

--- 

## botnet-hgw-status.js
> Shows all HGW workers and targets running on pservs
```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const workerScript = "remote-hgw.js";

    // --- Discover ALL servers ---
    const allServers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());

    ns.tprint("🛰  FULL BOTNET HGW STATUS");
    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("Server               Type     RAM(GB)   Threads   Target");
    ns.tprint("────────────────────────────────────────────────────────────");

    // Collect info entries
    const entries = [];

    for (const host of allServers) {
        if (!ns.hasRootAccess(host)) continue; // skip unrooted

        const ram = ns.getServerMaxRam(host);
        if (ram < 2) continue; // too small to matter

        const procs = ns.ps(host);
        const hgwProcs = procs.filter(p => p.filename === workerScript);

        let threads = 0;
        let target = "-";

        if (hgwProcs.length > 0) {
            threads = hgwProcs.reduce((sum, p) => sum + p.threads, 0);
            target = hgwProcs[0].args[0] ?? "-";
        }

        const type =
            host === "home" ? "HOME" :
            pservs.has(host) ? "PSERV" :
            "NPC";

        entries.push({ host, type, ram, threads, target });
    }

    // Sort: by type group first (HOME / PSERV / NPC), then by RAM desc
    const typeOrder = { "HOME":0, "PSERV":1, "NPC":2 };
    entries.sort((a, b) => {
        if (typeOrder[a.type] !== typeOrder[b.type])
            return typeOrder[a.type] - typeOrder[b.type];
        return b.ram - a.ram; // RAM desc
    });

    // Print nicely
    for (const e of entries) {
        const hostPad = e.host.padEnd(18, " ");
        const typePad = e.type.padEnd(7, " ");
        const ramPad  = String(e.ram).padStart(7, " ");
        const thrPad  = String(e.threads).padStart(8, " ");

        ns.tprint(`${hostPad} ${typePad} ${ramPad}   ${thrPad}   ${e.target}`);
    }

    ns.tprint("────────────────────────────────────────────────────────────");
}


// --- Breadth-first server discovery ---
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const n of ns.scan(host)) {
            if (!visited.has(n)) stack.push(n);
        }
    }

    return Array.from(visited);
}

```

---

## pserv-manager.js
> Purchases and upgrades servers toward target RAM; prints progress
```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Max RAM you ultimately want per server (default 2048 GB)
    const maxDesiredRam = Number(ns.args[0] ?? 8192); // pass 2048 if you want larger cap

    // How aggressively to spend money:
    // 0.5 = use up to 50% of current money on a single purchase/upgrade
    const spendFraction = 0.5;

    const minRam = 8; // minimum pserv size in GB (Bitburner default)

    ns.tprint(`🧠 pserv-manager started. Target max RAM: ${maxDesiredRam}GB`);

    while (true) {
        const limit = ns.getPurchasedServerLimit();
        let servers = ns.getPurchasedServers();
        const money = ns.getServerMoneyAvailable("home");

        // Build list of {name, ram}
        const info = servers.map(name => ({
            name,
            ram: ns.getServerMaxRam(name)
        })).sort((a, b) => a.ram - b.ram);

        // If we have no servers yet, we treat smallestRam as 0
        const smallestRam = info.length > 0 ? info[0].ram : 0;

        // If all servers already at or above desired max, chill
        if (info.length === limit && smallestRam >= maxDesiredRam) {
            ns.print("✅ All purchased servers at or above target RAM. Sleeping longer.");
            await ns.sleep(60000);
            continue;
        }

        // Decide best RAM we can afford right now
        const budget = money * spendFraction;
        let bestAffordableRam = 0;

        for (let ram = minRam; ram <= maxDesiredRam; ram *= 2) {
            const cost = ns.getPurchasedServerCost(ram);
            if (cost <= budget) {
                bestAffordableRam = ram;
            } else {
                break; // costs only go up from here
            }
        }

        if (bestAffordableRam === 0) {
            ns.print("💸 Not enough money to afford even the smallest upgrade. Waiting...");
            await ns.sleep(10000);
            continue;
        }

        // If we have fewer than the max number of servers: buy a new one
        if (servers.length < limit) {
            const ram = bestAffordableRam;
            const cost = ns.getPurchasedServerCost(ram);

            if (cost > money) {
                ns.print("💸 Not enough money to buy new server with chosen RAM. Waiting...");
                await ns.sleep(10000);
                continue;
            }

            const newName = nextServerName(ns);
            const result = ns.purchaseServer(newName, ram);

            if (result) {
                ns.tprint(`🆕 Purchased ${newName} with ${ram}GB for \$${ns.nFormat(cost, "0.00a")}`);
            } else {
                ns.print("❌ purchaseServer failed unexpectedly.");
            }

            await ns.sleep(500); // small delay
            continue;
        }

        // Else: we are at server limit → upgrade the weakest server if possible
        const weakest = info[0]; // sorted ascending by RAM

        // If the best we can afford is not better than what weakest already has, wait
        if (bestAffordableRam <= weakest.ram) {
            ns.print(`😴 Best affordable RAM (${bestAffordableRam}GB) <= weakest server (${weakest.name}: ${weakest.ram}GB). Waiting...`);
            await ns.sleep(15000);
            continue;
        }

        const upgradeRam = bestAffordableRam;
        const upgradeCost = ns.getPurchasedServerCost(upgradeRam);

        if (upgradeCost > money) {
            ns.print("💸 Not enough money to perform upgrade. Waiting...");
            await ns.sleep(10000);
            continue;
        }

        // Upgrade weakest server by deleting & repurchasing with same name
        ns.tprint(`⬆️ Upgrading ${weakest.name} from ${weakest.ram}GB → ${upgradeRam}GB for \$${ns.nFormat(upgradeCost, "0.00a")}`);

        // Kill scripts and delete
        ns.killall(weakest.name);
        const deleted = ns.deleteServer(weakest.name);
        if (!deleted) {
            ns.tprint(`❌ Failed to delete ${weakest.name}. Maybe scripts still running?`);
            await ns.sleep(5000);
            continue;
        }

        const newServer = ns.purchaseServer(weakest.name, upgradeRam);
        if (!newServer) {
            ns.tprint(`❌ Failed to repurchase ${weakest.name} with ${upgradeRam}GB.`);
        } else {
            ns.tprint(`✅ ${weakest.name} now has ${upgradeRam}GB RAM.`);
        }

        await ns.sleep(1000);
    }
}

/**
 * Generate a new server name if we are below the server limit.
 * Tries pserv-0, pserv-1, ... until it finds a free name.
 */
function nextServerName(ns) {
    const existing = new Set(ns.getPurchasedServers());
    let i = 0;
    while (true) {
        const name = `pserv-${i}`;
        if (!existing.has(name)) return name;
        i++;
    }
}

```

--- 

## hacknet-smart.js
> Smart Hacknet logic: buys and upgrades nodes that maximize gain
```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Max RAM you ultimately want per server (default 2048 GB)
    const maxDesiredRam = Number(ns.args[0] ?? 8192); // pass 2048 if you want larger cap

    // How aggressively to spend money:
    // 0.5 = use up to 50% of current money on a single purchase/upgrade
    const spendFraction = 0.5;

    const minRam = 8; // minimum pserv size in GB (Bitburner default)

    ns.tprint(`🧠 pserv-manager started. Target max RAM: ${maxDesiredRam}GB`);

    while (true) {
        const limit = ns.getPurchasedServerLimit();
        let servers = ns.getPurchasedServers();
        const money = ns.getServerMoneyAvailable("home");

        // Build list of {name, ram}
        const info = servers.map(name => ({
            name,
            ram: ns.getServerMaxRam(name)
        })).sort((a, b) => a.ram - b.ram);

        // If we have no servers yet, we treat smallestRam as 0
        const smallestRam = info.length > 0 ? info[0].ram : 0;

        // If all servers already at or above desired max, chill
        if (info.length === limit && smallestRam >= maxDesiredRam) {
            ns.print("✅ All purchased servers at or above target RAM. Sleeping longer.");
            await ns.sleep(60000);
            continue;
        }

        // Decide best RAM we can afford right now
        const budget = money * spendFraction;
        let bestAffordableRam = 0;

        for (let ram = minRam; ram <= maxDesiredRam; ram *= 2) {
            const cost = ns.getPurchasedServerCost(ram);
            if (cost <= budget) {
                bestAffordableRam = ram;
            } else {
                break; // costs only go up from here
            }
        }

        if (bestAffordableRam === 0) {
            ns.print("💸 Not enough money to afford even the smallest upgrade. Waiting...");
            await ns.sleep(10000);
            continue;
        }

        // If we have fewer than the max number of servers: buy a new one
        if (servers.length < limit) {
            const ram = bestAffordableRam;
            const cost = ns.getPurchasedServerCost(ram);

            if (cost > money) {
                ns.print("💸 Not enough money to buy new server with chosen RAM. Waiting...");
                await ns.sleep(10000);
                continue;
            }

            const newName = nextServerName(ns);
            const result = ns.purchaseServer(newName, ram);

            if (result) {
                ns.tprint(`🆕 Purchased ${newName} with ${ram}GB for \$${ns.nFormat(cost, "0.00a")}`);
            } else {
                ns.print("❌ purchaseServer failed unexpectedly.");
            }

            await ns.sleep(500); // small delay
            continue;
        }

        // Else: we are at server limit → upgrade the weakest server if possible
        const weakest = info[0]; // sorted ascending by RAM

        // If the best we can afford is not better than what weakest already has, wait
        if (bestAffordableRam <= weakest.ram) {
            ns.print(`😴 Best affordable RAM (${bestAffordableRam}GB) <= weakest server (${weakest.name}: ${weakest.ram}GB). Waiting...`);
            await ns.sleep(15000);
            continue;
        }

        const upgradeRam = bestAffordableRam;
        const upgradeCost = ns.getPurchasedServerCost(upgradeRam);

        if (upgradeCost > money) {
            ns.print("💸 Not enough money to perform upgrade. Waiting...");
            await ns.sleep(10000);
            continue;
        }

        // Upgrade weakest server by deleting & repurchasing with same name
        ns.tprint(`⬆️ Upgrading ${weakest.name} from ${weakest.ram}GB → ${upgradeRam}GB for \$${ns.nFormat(upgradeCost, "0.00a")}`);

        // Kill scripts and delete
        ns.killall(weakest.name);
        const deleted = ns.deleteServer(weakest.name);
        if (!deleted) {
            ns.tprint(`❌ Failed to delete ${weakest.name}. Maybe scripts still running?`);
            await ns.sleep(5000);
            continue;
        }

        const newServer = ns.purchaseServer(weakest.name, upgradeRam);
        if (!newServer) {
            ns.tprint(`❌ Failed to repurchase ${weakest.name} with ${upgradeRam}GB.`);
        } else {
            ns.tprint(`✅ ${weakest.name} now has ${upgradeRam}GB RAM.`);
        }

        await ns.sleep(1000);
    }
}

/**
 * Generate a new server name if we are below the server limit.
 * Tries pserv-0, pserv-1, ... until it finds a free name.
 */
function nextServerName(ns) {
    const existing = new Set(ns.getPurchasedServers());
    let i = 0;
    while (true) {
        const name = `pserv-${i}`;
        if (!existing.has(name)) return name;
        i++;
    }
}

```


--- 

## hacknet-status.js
> Snapshot of Hacknet node levels, RAM, cores, and total production.
```js
/** @param {NS} ns */
function fmt(ns, val, decimals = 3) {
    // Universal formatter using nFormat as fallback
    return ns.nFormat(val, `0.${"0".repeat(decimals)}a`);
}

export async function main(ns) {
    ns.disableLog("ALL");

    const count = ns.hacknet.numNodes();
    if (count === 0) {
        ns.tprint("❌ You don't own any Hacknet nodes yet.");
        return;
    }

    ns.tprint("💻 HACKNET STATUS");
    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("Idx  Level   RAM   Cores   Prod/sec        Lifetime");
    ns.tprint("────────────────────────────────────────────────────────────");

    let totalProd = 0;
    let totalLife = 0;
    let totalLevels = 0;
    let totalRam = 0;
    let totalCores = 0;

    for (let i = 0; i < count; i++) {
        const s = ns.hacknet.getNodeStats(i);

        totalProd  += s.production;
        totalLife  += s.totalProduction;
        totalLevels += s.level;
        totalRam    += s.ram;
        totalCores  += s.cores;

        const idxStr  = String(i).padStart(2, " ");
        const lvlStr  = String(s.level).padStart(5, " ");
        const ramStr  = String(s.ram).padStart(5, " ");
        const coreStr = String(s.cores).padStart(6, " ");

        const prodStr = fmt(ns, s.production, 3).padStart(10, " ");
        const lifeStr = fmt(ns, s.totalProduction, 3).padStart(12, " ");

        ns.tprint(`${idxStr}  ${lvlStr}  ${ramStr}  ${coreStr}   ${prodStr}   ${lifeStr}`);
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint(`Nodes:      ${count}`);
    ns.tprint(`Avg Level:  ${(totalLevels / count).toFixed(1)}`);
    ns.tprint(`Avg RAM:    ${(totalRam / count).toFixed(1)} GB`);
    ns.tprint(`Avg Cores:  ${(totalCores / count).toFixed(1)}`);
    ns.tprint(`Total Prod: ${fmt(ns, totalProd, 3)} / sec`);
    ns.tprint(`Lifetime:   $${fmt(ns, totalLife, 3)}`);
    ns.tprint("────────────────────────────────────────────────────────────");
}

```

---

## ops-dashboard.js
> One-shot operational snapshot: stats, targets, pservs, Hacknet, botnet
```js
/** Combined operational dashboard for Bitburner
 *  Shows: player/home, target snapshot, botnet, pservs, Hacknet
 *  Usage: run ops-dashboard.js [optional-target-override]
 */

/** Simple number formatter using nFormat (works on all versions) */
/** @param {NS} ns */
function fmt(ns, val, decimals = 3) {
    return ns.nFormat(val, `0.${"0".repeat(decimals)}a`);
}

/** Formulas.exe detection */
function hasFormulas(ns) {
    return (
        typeof ns.formulas !== "undefined" &&
        ns.formulas &&
        typeof ns.formulas.hacking !== "undefined"
    );
}

/**
 * Get hack/grow/weaken times (ms) + chance for a target.
 * Uses Formulas.exe when available, falls back to vanilla timing otherwise.
 */
function getHackGrowWeakenTimes(ns, target) {
    const player = ns.getPlayer();

    if (hasFormulas(ns)) {
        const s = ns.getServer(target);

        // Normalize to "ideal" batch conditions
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        const tHack  = ns.formulas.hacking.hackTime(s, player);
        const tGrow  = ns.formulas.hacking.growTime(s, player);
        const tWeaken = ns.formulas.hacking.weakenTime(s, player);
        const chance = ns.formulas.hacking.hackChance(s, player);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: true };
    } else {
        const tHack  = ns.getHackTime(target);
        const tGrow  = ns.getGrowTime(target);
        const tWeaken = ns.getWeakenTime(target);
        const chance = ns.hackAnalyzeChance(target);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: false };
    }
}

/**
 * Pretty-print a target snapshot (timings, chance, money/sec cap).
 */
function printTargetTiming(ns, target) {
    if (!target || target === "unknown") {
        ns.tprint("📊 Target snapshot: (no active target detected)");
        return;
    }

    const maxMoney = ns.getServerMaxMoney(target);
    const minSec   = ns.getServerMinSecurityLevel(target);

    const { tHack, tGrow, tWeaken, chance, usingFormulas } =
        getHackGrowWeakenTimes(ns, target);

    const moneyPerSecCap =
        maxMoney > 0 && tHack > 0 ? (maxMoney / tHack) * 1000 : 0;

    ns.tprint("📊 TARGET SNAPSHOT");
    ns.tprint(`   Host: ${target}`);
    ns.tprint(
        "   ⏱ Times: " +
        `H=${(tHack / 1000).toFixed(1)}s, ` +
        `G=${(tGrow / 1000).toFixed(1)}s, ` +
        `W=${(tWeaken / 1000).toFixed(1)}s`
    );
    ns.tprint(
        `   🎯 Chance: ${(chance * 100).toFixed(1)}% | ` +
        `MinSec=${minSec.toFixed(2)}`
    );

    if (maxMoney > 0) {
        ns.tprint(
            "   💸 Theo cap: " +
            `Max=${ns.nFormat(maxMoney, "$0.00a")} | ` +
            `~${ns.nFormat(moneyPerSecCap, "$0.00a")}/sec (if perfectly farmed)`
        );
    }

    ns.tprint(
        usingFormulas
            ? "   🧮 Timing model: Formulas.exe"
            : "   🧮 Timing model: vanilla API (no Formulas.exe detected)"
    );
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const targetOverride = ns.args[0];

    // 1) PLAYER / HOME SUMMARY
    const player = ns.getPlayer();

    // Name may not exist in your version; fall back to a generic label
    const playerName =
        player && typeof player.name === "string" && player.name.length > 0
            ? player.name
            : "Player";

    // Hacking level is always safe via ns.getHackingLevel()
    const hackingLevel = ns.getHackingLevel();

    const money    = ns.getServerMoneyAvailable("home");
    const homeMax  = ns.getServerMaxRam("home");
    const homeUsed = ns.getServerUsedRam("home");
    const homeFree = homeMax - homeUsed;

    const guessedTarget = targetOverride || guessMainTarget(ns) || "unknown";

    ns.tprint("🧠 OPS DASHBOARD");
    ns.tprint("=================================================================");
    ns.tprint(`Player: ${playerName}   |   Hacking: ${hackingLevel}`);
    ns.tprint(`Money:  $${fmt(ns, money, 3)}`);
    ns.tprint(`Home RAM: ${homeUsed.toFixed(1)} / ${homeMax.toFixed(1)} GB (free ${homeFree.toFixed(1)} GB)`);
    ns.tprint(`Main target (guessed): ${guessedTarget}`);
    ns.tprint("=================================================================\n");

    // 1b) TARGET SNAPSHOT (formulas-aware when available)
    printTargetTiming(ns, guessedTarget);
    ns.tprint("");

    // 2) BOTNET STATUS (HOME + PSERV + NPC, HGW + BATCH)
    printBotnetStatus(ns, guessedTarget);

    // 3) PSERV FLEET DETAILS
    ns.tprint("");
    printPservStatus(ns);

    // 4) HACKNET SUMMARY
    ns.tprint("");
    printHacknetStatus(ns);

    ns.tprint("\n✅ Dashboard snapshot complete.");
}


/* ---------------- BOTNET STATUS ---------------- */

function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const n of ns.scan(host)) {
            if (!visited.has(n)) stack.push(n);
        }
    }
    return Array.from(visited);
}

function guessMainTarget(ns) {
    const hosts = getAllServers(ns);
    const candidates = ["timed-net-batcher2.js", "remote-hgw.js"];

    for (const host of hosts) {
        const procs = ns.ps(host);
        for (const p of procs) {
            if (candidates.includes(p.filename) && p.args.length > 0) {
                return p.args[0];
            }
        }
    }
    return null;
}

function printBotnetStatus(ns, guessedTarget) {
    const allServers = getAllServers(ns);
    const pservsSet = new Set(ns.getPurchasedServers());

    const workerScript = "remote-hgw.js";
    const batchScripts = new Set(["batch-hack.js", "batch-grow.js", "batch-weaken.js"]);

    let totalRooted = 0;
    let totalHGWThreads = 0;
    let totalBatchThreads = 0;

    let homeHGW = 0, homeBatch = 0;
    let pservHGW = 0, pservBatch = 0;
    let npcHGW = 0, npcBatch = 0;

    for (const host of allServers) {
        if (!ns.hasRootAccess(host)) continue;
        totalRooted++;

        const procs = ns.ps(host);
        const maxRam = ns.getServerMaxRam(host);

        let hgwThreads = 0;
        let batchThreads = 0;

        for (const p of procs) {
            if (p.filename === workerScript) {
                hgwThreads += p.threads;
            } else if (batchScripts.has(p.filename)) {
                batchThreads += p.threads;
            }
        }

        totalHGWThreads += hgwThreads;
        totalBatchThreads += batchThreads;

        const type =
            host === "home" ? "HOME" :
            pservsSet.has(host) ? "PSERV" :
            "NPC";

        if (type === "HOME") {
            homeHGW += hgwThreads;
            homeBatch += batchThreads;
        } else if (type === "PSERV") {
            pservHGW += hgwThreads;
            pservBatch += batchThreads;
        } else {
            npcHGW += hgwThreads;
            npcBatch += batchThreads;
        }
    }

    ns.tprint("🛰  BOTNET STATUS (HGW + BATCH)");
    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint(`Rooted servers:       ${totalRooted}`);
    ns.tprint("");
    ns.tprint("                 HGW Threads   Batch Threads");
    ns.tprint("                 -----------   -------------");
    ns.tprint(`Home:            ${String(homeHGW).padStart(11)}   ${String(homeBatch).padStart(13)}`);
    ns.tprint(`Purchased (pserv)${String(pservHGW).padStart(11)}   ${String(pservBatch).padStart(13)}`);
    ns.tprint(`NPC Servers:      ${String(npcHGW).padStart(11)}   ${String(npcBatch).padStart(13)}`);
    ns.tprint("                 -----------   -------------");
    ns.tprint(`TOTAL:           ${String(totalHGWThreads).padStart(11)}   ${String(totalBatchThreads).padStart(13)}`);
    ns.tprint("────────────────────────────────────────────────────────────");
}


/* ---------------- PSERV STATUS ---------------- */

function printPservStatus(ns) {
    const pservs = ns.getPurchasedServers();
    const workerScript = "remote-hgw.js";

    ns.tprint("🖥️  PURCHASed SERVER FLEET");
    if (pservs.length === 0) {
        ns.tprint("────────────────────────────────────────────────────────────");
        ns.tprint("You don't own any purchased servers yet.");
        return;
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("Server          RAM(GB)   HGW Threads   Target");
    ns.tprint("────────────────────────────────────────────────────────────");

    let totalRam = 0;
    let totalThreads = 0;

    for (const host of pservs) {
        const ram = ns.getServerMaxRam(host);
        totalRam += ram;

        const procs = ns.ps(host);
        const hgwProcs = procs.filter(p => p.filename === workerScript);

        let threads = 0;
        let target = "-";

        if (hgwProcs.length > 0) {
            threads = hgwProcs.reduce((sum, p) => sum + p.threads, 0);
            target = hgwProcs[0].args[0] ?? "-";
        }

        totalThreads += threads;

        const namePad = host.padEnd(14, " ");
        const ramPad  = String(ram).padStart(7, " ");
        const thrPad  = String(threads).padStart(11, " ");

        ns.tprint(`${namePad}  ${ramPad}   ${thrPad}   ${target}`);
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint(`Total pservs:   ${pservs.length}`);
    ns.tprint(`Total RAM:      ${totalRam.toFixed(1)} GB`);
    ns.tprint(`Total HGW threads: ${totalThreads}`);
    ns.tprint("────────────────────────────────────────────────────────────");
}


/* ---------------- HACKNET STATUS ---------------- */

function printHacknetStatus(ns) {
    const count = ns.hacknet.numNodes();
    ns.tprint("💻 HACKNET STATUS");
    ns.tprint("────────────────────────────────────────────────────────────");

    if (count === 0) {
        ns.tprint("You don't own any Hacknet nodes yet.");
        return;
    }

    ns.tprint("Idx  Level   RAM   Cores   Prod/sec        Lifetime");
    ns.tprint("────────────────────────────────────────────────────────────");

    let totalProd = 0;
    let totalLife = 0;
    let totalLevels = 0;
    let totalRam = 0;
    let totalCores = 0;

    for (let i = 0; i < count; i++) {
        const s = ns.hacknet.getNodeStats(i);

        totalProd   += s.production;
        totalLife   += s.totalProduction;
        totalLevels += s.level;
        totalRam    += s.ram;
        totalCores  += s.cores;

        const idxStr  = String(i).padStart(2, " ");
        const lvlStr  = String(s.level).padStart(5, " ");
        const ramStr  = String(s.ram).padStart(5, " ");
        const coreStr = String(s.cores).padStart(6, " ");

        const prodStr = fmt(ns, s.production, 3).padStart(10, " ");
        const lifeStr = fmt(ns, s.totalProduction, 3).padStart(12, " ");

        ns.tprint(`${idxStr}  ${lvlStr}  ${ramStr}  ${coreStr}   ${prodStr}   ${lifeStr}`);
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint(`Nodes:      ${count}`);
    ns.tprint(`Avg Level:  ${(totalLevels / count).toFixed(1)}`);
    ns.tprint(`Avg RAM:    ${(totalRam / count).toFixed(1)} GB`);
    ns.tprint(`Avg Cores:  ${(totalCores / count).toFixed(1)}`);
    ns.tprint(`Total Prod: ${fmt(ns, totalProd, 3)} / sec`);
    ns.tprint(`Lifetime:   $${fmt(ns, totalLife, 3)}`);
    ns.tprint("────────────────────────────────────────────────────────────");
}

```

---

## process-monitor.js
> Live process monitor: RAM usage, threads, PIDs, hosts. 
```js 
/** process-monitor.js
 * Live-ish snapshot of running processes across the network.
 * Highlights critical scripts and shows formulas-aware batch $/sec.
 *
 * Usage: run process-monitor.js
 */

/** @param {NS} ns */
function fmt(ns, val, decimals = 2) {
    return ns.nFormat(val, `0.${"0".repeat(decimals)}a`);
}

/** @param {NS} ns */
function hasFormulas(ns) {
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

/**
 * Get hack/grow/weaken times (ms) + chance for a target.
 * Uses ns.formulas.hacking when available, falls back otherwise.
 * @param {NS} ns
 */
function getHackGrowWeakenTimes(ns, target) {
    const player = ns.getPlayer();

    if (hasFormulas(ns)) {
        const s = ns.getServer(target);

        // Assume prepped-ish for planning
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        const tHack   = ns.formulas.hacking.hackTime(s, player);
        const tGrow   = ns.formulas.hacking.growTime(s, player);
        const tWeaken = ns.formulas.hacking.weakenTime(s, player);
        const chance  = ns.formulas.hacking.hackChance(s, player);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: true };
    } else {
        const tHack   = ns.getHackTime(target);
        const tGrow   = ns.getGrowTime(target);
        const tWeaken = ns.getWeakenTime(target);
        const chance  = ns.hackAnalyzeChance(target);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: false };
    }
}

/** @param {NS} ns */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const n of ns.scan(host)) {
            if (!visited.has(n)) stack.push(n);
        }
    }
    return Array.from(visited);
}

/** @param {NS} ns */
function findBatchTarget(ns) {
    const servers = getAllServers(ns);
    const batchController = "timed-net-batcher2.js";

    for (const host of servers) {
        for (const p of ns.ps(host)) {
            if (p.filename === batchController && p.args.length > 0) {
                return p.args[0];
            }
        }
    }
    return null;
}

/**
 * Estimate current batch money/sec based on:
 * - total batch-hack threads
 * - hackAnalyze
 * - formulas-based (or vanilla) timing
 *
 * @param {NS} ns
 */
function printBatchOverview(ns) {
    const target = findBatchTarget(ns);

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("💰 BATCH OVERVIEW (timed-net-batcher2.js)");
    if (!target) {
        ns.tprint("No active timed-net-batcher2.js controller found.");
        return;
    }

    const servers = getAllServers(ns);

    let totalHackThreads = 0;
    for (const host of servers) {
        for (const p of ns.ps(host)) {
            if (p.filename === "batch-hack.js") {
                totalHackThreads += p.threads;
            }
        }
    }

    if (totalHackThreads === 0) {
        ns.tprint(`Controller target: ${target} (no batch-hack.js threads detected)`);
        return;
    }

    const maxMoney   = ns.getServerMaxMoney(target);
    const hackPerThr = ns.hackAnalyze(target);
    const rawFrac    = hackPerThr * totalHackThreads;
    const MAX_HACK_FRACTION = 0.9;
    const hackFrac   = Math.min(MAX_HACK_FRACTION, rawFrac);

    const { tHack, tGrow, tWeaken, usingFormulas } = getHackGrowWeakenTimes(ns, target);

    const GAP = 200; // ms – same shape as timed-net-batcher2
    const cycleTime = tWeaken + 4 * GAP;
    const estBatchMoney = maxMoney * hackFrac;
    const estMoneyPerSec = cycleTime > 0 ? estBatchMoney / (cycleTime / 1000) : 0;

    ns.tprint(`Target: ${target}`);
    ns.tprint(
        `Threads (hack): ${totalHackThreads}  |  ` +
        `HackFrac≈${(hackFrac * 100).toFixed(1)}% (capped at ${(MAX_HACK_FRACTION * 100).toFixed(0)}%)`
    );
    ns.tprint(
        `Times: H=${(tHack/1000).toFixed(1)}s, ` +
        `G=${(tGrow/1000).toFixed(1)}s, ` +
        `W=${(tWeaken/1000).toFixed(1)}s  |  cycle≈${ns.tFormat(cycleTime)}`
    );
    ns.tprint(
        `Est batch: ${ns.nFormat(estBatchMoney, "$0.00a")}  |  ` +
        `Est ~${ns.nFormat(estMoneyPerSec, "$0.00a")}/sec`
    );
    ns.tprint(
        usingFormulas
            ? "Timing model: Formulas.exe (ns.formulas.hacking)"
            : "Timing model: vanilla API (no Formulas.exe detected)"
    );
}

/** @param {NS} ns */
function printCriticalProcesses(ns) {
    const CRITICAL = new Set([
        "startup-home-advanced.js",
        "timed-net-batcher2.js",
        "pserv-manager.js",
        "root-and-deploy.js",
        "botnet-hgw-sync.js",
        "remote-hgw.js",
        "hacknet-smart.js",
        "ops-dashboard.js",
        "process-monitor.js",
    ]);

    const servers = getAllServers(ns);
    const rows = [];

    for (const host of servers) {
        const procs = ns.ps(host);
        const maxRam = ns.getServerMaxRam(host);

        for (const p of procs) {
            if (!CRITICAL.has(p.filename)) continue;

            const ramPerThread = ns.getScriptRam(p.filename, host) || 0;
            const ramUsage = ramPerThread * p.threads;

            rows.push({
                host,
                script: p.filename,
                threads: p.threads,
                ram: ramUsage,
                maxRam,
            });
        }
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("🚨 CRITICAL PROCESS WATCH");
    if (rows.length === 0) {
        ns.tprint("No critical scripts currently running.");
        return;
    }

    rows.sort((a, b) => b.ram - a.ram);

    ns.tprint("Host           Script                        Thr   RAM(GB)");
    ns.tprint("────────────────────────────────────────────────────────────");
    for (const r of rows) {
        const hostStr   = r.host.padEnd(13, " ");
        const scriptStr = r.script.padEnd(28, " ");
        const thrStr    = String(r.threads).padStart(3, " ");
        const ramStr    = r.ram.toFixed(1).padStart(7, " ");

        ns.tprint(`${hostStr}  ${scriptStr}  ${thrStr}  ${ramStr}`);
    }
}

/** @param {NS} ns */
function printRamSummary(ns) {
    const servers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());

    let homeUsed = 0, homeMax = 0;
    let pservUsed = 0, pservMax = 0;
    let npcUsed = 0, npcMax = 0;

    for (const host of servers) {
        const maxRam  = ns.getServerMaxRam(host);
        const usedRam = ns.getServerUsedRam(host);

        if (host === "home") {
            homeUsed += usedRam;
            homeMax  += maxRam;
        } else if (pservs.has(host)) {
            pservUsed += usedRam;
            pservMax  += maxRam;
        } else {
            npcUsed += usedRam;
            npcMax  += maxRam;
        }
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("💾 RAM SUMMARY");
    ns.tprint(
        `Home:   ${homeUsed.toFixed(1)} / ${homeMax.toFixed(1)} GB` +
        (homeMax > 0 ? ` (${(homeUsed/homeMax*100).toFixed(1)}%)` : "")
    );
    ns.tprint(
        `Pserv:  ${pservUsed.toFixed(1)} / ${pservMax.toFixed(1)} GB` +
        (pservMax > 0 ? ` (${(pservUsed/pservMax*100).toFixed(1)}%)` : "")
    );
    ns.tprint(
        `NPC:    ${npcUsed.toFixed(1)} / ${npcMax.toFixed(1)} GB` +
        (npcMax > 0 ? ` (${(npcUsed/npcMax*100).toFixed(1)}%)` : "")
    );
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    ns.tprint("🧩 PROCESS MONITOR");
    printRamSummary(ns);
    printCriticalProcesses(ns);
    printBatchOverview(ns);

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("Snapshot complete.");
}

```

---

## karma-watch.js
> Logs real-time karma changes using both heart.break and player stats
```js
/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.tail(); // open a small log window

    while (true) {
        ns.clearLog();

        // "Secret" karma function (now semi-documented)
        const karma = ns.heart.break();

        // On newer versions, it's also on getPlayer().karma
        const p = ns.getPlayer();

        ns.print(`Karma (heart.break): ${karma}`);
        if (p.karma !== undefined) {
            ns.print(`Karma (getPlayer):  ${p.karma}`);
        }

        await ns.sleep(1000);
    }
}

```
