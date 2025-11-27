/** @param {NS} ns */

// ------------------------------------------------
// Network helpers
// ------------------------------------------------

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

// ------------------------------------------------
// Formulas.exe helpers (auto-detect + safe fallback)
// ------------------------------------------------

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

// ------------------------------------------------
// MONEY/sec SCORING (for main batch target)
// ------------------------------------------------

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
    ns.tprint("? No juicy advanced target found with current filters.");
    ns.tprint("   Falling back to n00dles.");
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   ?? Juiciest Advanced Target (v4: tuned money/sec)");
  ns.tprint("=======================================");
  ns.tprint(`?? Host:       ${best.host}`);
  ns.tprint(`?? Max Money:  ${ns.nFormat(best.maxMoney, "$0.00a")}`);
  ns.tprint(`?? Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`?? Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`?? MinSec:     ${best.minSec.toFixed(2)}`);
  ns.tprint(`? Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`?? Money/sec:  ${ns.nFormat(best.moneyPerSec * 1000, "$0.00a")}`);
  ns.tprint(`?? Score:      ${best.score.toExponential(3)}`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   ?? Top Candidates (by money/sec)");
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

// ------------------------------------------------
// XP SCORING (for HGW farm target - tweaked)
// ------------------------------------------------

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
    //  - below ~40% of your level = too easy ? penalty
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
    ns.tprint("?? No distinct XP-optimized HGW target found.");
    ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    return "n00dles";
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   ?? XP-Optimized HGW Target (tweaked)");
  ns.tprint("=======================================");
  ns.tprint(`?? Host:       ${best.host}`);
  ns.tprint(`?? Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`?? Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`? Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`?? XP Score:   ${best.score.toExponential(3)}`);
  ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   ?? Top XP Candidates");
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
    ns.tprint("?? No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  ns.tprint(`?? Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ------------------------------------------------
// MAIN
// ------------------------------------------------

export async function main(ns) {
  ns.disableLog("ALL");

  const formulasAvailable = hasFormulas(ns);
  ns.tprint(
    formulasAvailable
      ? "?? Formulas.exe detected — using formulas-based times/chance where possible."
      : "?? Formulas.exe not detected — using built-in timing/scoring APIs."
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
    ns.tprint(`?? STARTUP-HOME: Manual override batch target: ${batchTarget}`);
  } else {
    const { target: autoTarget } = choosePrimaryTarget(ns);
    batchTarget = autoTarget || "n00dles";
    ns.tprint(`?? STARTUP-HOME: Auto-selected batch target: ${batchTarget}`);
  }

  // Pick HGW target based on flag
  if (hgwMode === "money") {
    ns.tprint("?? HGW Mode: MONEY");
    hgwTarget = chooseSecondaryTarget(ns, batchTarget);
  } else {
    ns.tprint("?? HGW Mode: XP");
    hgwTarget = chooseXpTarget(ns, batchTarget);
  }

  ns.tprint(`?? BATCH TARGET (money):      ${batchTarget}`);
  ns.tprint(`?? HGW TARGET (${hgwMode.toUpperCase()}): ${hgwTarget}`);

  ns.tprint("?? STARTUP-HOME: Killing all processes on home...");

  const myPid = ns.pid;
  const processes = ns.ps("home");

  for (const p of processes) {
    if (p.pid === myPid) continue;
    ns.kill(p.pid);
  }

  await ns.sleep(200); // allow cleanup

  ns.tprint("?? Home is clean. Relaunching core automation...");

  function safeExec(script, threads = 1, ...args) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`?? Missing script: ${script}`);
      return;
    }

    const ramCost = ns.getScriptRam(script, "home") * threads;
    const used    = ns.getServerUsedRam("home");
    const max     = ns.getServerMaxRam("home");
    const free    = max - used - HOME_RAM_RESERVE;

    if (ramCost > free) {
      ns.tprint(`? Not enough RAM to start ${script} (${threads} threads)`);
      return;
    }

    const pid = ns.exec(script, "home", threads, ...args);
    if (pid === 0) {
      ns.tprint(`? Failed to launch ${script}`);
    } else {
      const argInfo = args.length ? ` ${JSON.stringify(args)}` : "";
      ns.tprint(`?? Started ${script} (pid ${pid})${argInfo}`);
    }
  }

  // Core stack
  safeExec("darkweb/darkweb-auto-buyer.js");
  safeExec("pserv/pserv-manager.js",       1, PSERV_TARGET_RAM);
  safeExec("core/timed-net-batcher2.js",  1, batchTarget); // money target
  safeExec("core/root-and-deploy.js",     1, batchTarget);
  safeExec("botnet/botnet-hgw-sync.js",     1, hgwTarget, hgwMode);   // XP or money target
  // safeExec("hacknet/hacknet-smart.js",    1);
  await ns.sleep(3000);
  // Status / visibility
  safeExec("botnet/botnet-hgw-status.js",   1);
  safeExec("hacknet/hacknet-status.js",      1);
  // safeExec("ui/ops-dashboard.js",    1, batchTarget); // optional one-shot

  ns.tprint("?? STARTUP-HOME COMPLETE — full automation online.");
}