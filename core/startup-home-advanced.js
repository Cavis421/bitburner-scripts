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

function fmtMoney(ns, value) {
  // 2 decimal places, suffixes from 1k and up.
  // Signature is: formatNumber(value, fractionalDigits = 2, suffixStart = 1000)
  return "$" + ns.formatNumber(value, 2, 1e3);
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
    if (hackRatio < 0.2)       bandBonus = 0.7;  // too easy: slight penalty
    else if (hackRatio <= 0.8) bandBonus = 1.0;  // sweet spot
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
    ns.tprint("❓ No juicy advanced target found with current filters.");
    ns.tprint("   Falling back to n00dles.");
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   💰 Juiciest Advanced Target (v4: tuned money/sec)");
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
    //  - ~40–120% of your level = sweet band
    //  - way above = small penalty (still sometimes okay)
    let bandBonus;
    if (hackRatio < 0.4)       bandBonus = 0.5;  // way too easy
    else if (hackRatio <= 1.2) bandBonus = 1.1;  // prime XP band
    else if (hackRatio <= 1.6) bandBonus = 1.0;  // a bit above you
    else                       bandBonus = 0.7;  // too hard / slow

    // XP per second approx: difficulty-ish * success rate / time^1.2
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
    ns.tprint("❓ No distinct XP-optimized HGW target found.");
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

  return best.host;
}

// (Optional: keep the old money-based secondary in case you use it elsewhere)
function chooseSecondaryTarget(ns, primary) {
  const scored = getScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("❓ No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  ns.tprint(`💰 Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ────────────────────────────────────────────────
// MAIN (RAM-aware, prioritized launcher)
// ────────────────────────────────────────────────

export async function main(ns) {
  ns.disableLog("ALL");

  const formulasAvailable = hasFormulas(ns);
  ns.tprint(
    formulasAvailable
      ? "Formulas.exe detected — using formulas-based times/chance where possible."
      : "Formulas.exe not detected — using built-in timing/scoring APIs."
  );

  const flags = ns.flags([
    ["hgw", "money"],  // "xp" or "money" for HGW mode
    ["help", false],   // show help and exit
  ]);

  // --------------------------------------------------
  // --help short-circuit
  // --------------------------------------------------
  if (flags.help) {
    printHelp(ns);
    return;
  }

  const hgwMode = String(flags.hgw ?? "money").toLowerCase();

  // Snapshot of current hardware for decisions
  const homeMaxRam = ns.getServerMaxRam("home");
  const pservs = ns.getPurchasedServers();
  let minPservRam = 0;
  if (pservs.length > 0) {
    minPservRam = Infinity;
    for (const host of pservs) {
      const r = ns.getServerMaxRam(host);
      if (r < minPservRam) minPservRam = r;
    }
  }

  // Dynamic home RAM reserve: 10% of home, min 8GB, max 128GB
  const HOME_RAM_RESERVE = (() => {
    const max = homeMaxRam;
    return Math.min(128, Math.max(8, Math.floor(max * 0.10)));
  })();

  // Dynamic pserv target RAM:
  //  - Keep goals modest early so pserv-manager actually does work
  //  - Scale up as home gets beefier
  const PSERV_TARGET_RAM = (() => {
    if (homeMaxRam < 128)  return 32;   // tiny setup
    if (homeMaxRam < 256)  return 64;
    if (homeMaxRam < 512)  return 128;
    if (homeMaxRam < 1024) return 256;
    if (homeMaxRam < 2048) return 512;
    return 1024;
  })();

  // Auto-toggle low-RAM mode for timed-net-batcher2:
  // In "advanced" startup we only treat the environment as low-RAM when
  // home is still tiny.
  const USE_LOW_RAM_MODE =
    homeMaxRam < 128 &&
    (pservs.length === 0 || minPservRam < 64);

  if (USE_LOW_RAM_MODE) {
    ns.tprint(
      "Low-RAM batch mode ENABLED for timed-net-batcher2.js " +
      `(home=${homeMaxRam.toFixed(1)}GB, min pserv=${minPservRam || 0}GB).`
    );
  } else {
    ns.tprint(
      "Full batch mode (no --lowram) for timed-net-batcher2.js " +
      `(home=${homeMaxRam.toFixed(1)}GB, min pserv=${minPservRam || 0}GB).`
    );
  }

  // Positional argument: optional batch target override
  const override = flags._[0] || null;

  let batchTarget;
  let hgwTarget;

  if (override) {
    batchTarget = override;
    ns.tprint(`STARTUP-HOME: Manual override batch target: ${batchTarget}`);
  } else {
    const { target: autoTarget } = choosePrimaryTarget(ns);
    batchTarget = autoTarget || "n00dles";
    ns.tprint(`STARTUP-HOME: Auto-selected batch target: ${batchTarget}`);
  }

  // Choose HGW target (XP or money), distinct from batch target when possible
  if (hgwMode === "money") {
    ns.tprint("HGW Mode: MONEY");
    hgwTarget = chooseSecondaryTarget(ns, batchTarget);
  } else {
    ns.tprint("HGW Mode: XP");
    hgwTarget = chooseXpTarget(ns, batchTarget);
  }

  ns.tprint(`BATCH TARGET (money):      ${batchTarget}`);
  ns.tprint(`HGW TARGET (${hgwMode.toUpperCase()}): ${hgwTarget}`);

  // Kill everything on home except:
  //  - this startup script
  //  - corp/agri-structure.js
  //  - corp/agri-inputs.js
  //  - corp/agri-sales.js
  ns.tprint(
    "STARTUP-HOME: Killing all processes on home " +
    "(except startup + corp/agri-structure.js + corp/agri-inputs.js + corp/agri-sales.js)."
  );
  const myPid = ns.pid;
  const keepFiles = new Set([
    "corp/agri-structure.js",
    "corp/agri-inputs.js",
    "corp/agri-sales.js",
  ]);
  const processes = ns.ps("home");
  for (const p of processes) {
    if (p.pid === myPid) continue;
    if (keepFiles.has(p.filename)) continue;
    ns.kill(p.pid);
  }
  await ns.sleep(200); // allow cleanup
  ns.tprint("Home is clean. Relaunching core automation.");

  // --------------------------------------------------
  // RAM-aware scheduler
  // --------------------------------------------------

  // Helper: calculate RAM cost for a script@threads (or Infinity if missing)
  function cost(script, threads = 1) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`Missing script (skipping in plan): ${script}`);
      return Infinity;
    }
    return ns.getScriptRam(script, "home") * threads;
  }

  const maxRam = homeMaxRam;
  const budget = maxRam - HOME_RAM_RESERVE; // total RAM we are willing to spend on non-batcher stuff
  let usedPlanned = ns.getServerUsedRam("home"); // starts with just this script

  // 1) ALWAYS try to launch MONEY BATCHER first, ignoring the soft budget.
  const batcherArgs = USE_LOW_RAM_MODE ? [batchTarget, "--lowram"] : [batchTarget];
  const batcherRamCost = cost("core/timed-net-batcher2.js", 1);

  if (isFinite(batcherRamCost)) {
    if (batcherRamCost > maxRam) {
      ns.tprint(
        "MONEY BATCHER (core/timed-net-batcher2.js) alone needs " +
        `${batcherRamCost.toFixed(1)}GB, which exceeds home RAM (${maxRam.toFixed(1)}GB).`
      );
    } else {
      const pid = ns.exec("core/timed-net-batcher2.js", "home", 1, ...batcherArgs);
      if (pid === 0) {
        ns.tprint("Failed to launch MONEY BATCHER (core/timed-net-batcher2.js).");
      } else {
        usedPlanned = ns.getServerUsedRam("home"); // refresh from real usage
        const argInfo = batcherArgs.length ? ` ${JSON.stringify(batcherArgs)}` : "";
        ns.tprint(`Started REQUIRED MONEY BATCHER (pid ${pid})${argInfo}`);
      }
    }
  }

  // 2) Remaining jobs respect the RAM budget.
  const plan = [
    //{
    //  name: "pserv/pserv-manager.js",
    //  threads: 1,
    //  args: [PSERV_TARGET_RAM],
    //  label: "PSERV MANAGER",
    //  required: false,
    //},
    {
      name: "core/root-and-deploy.js",
      threads: 1,
      args: [],
      label: "ROOT + DEPLOY",
      required: true,
    },
    {
      name: "botnet/botnet-hgw-sync.js",
      threads: 1,
      args: [hgwTarget, hgwMode],
      label: "BOTNET HGW SYNC",
      required: true,
    },
    //{
    //  name: "hacknet/hacknet-smart.js",
    //  threads: 1,
    //  args: [],
    //  label: "HACKNET SMART",
    //  required: false,
    //},
    //{
    //  name: "ui/ops-dashboard.js",
    //  threads: 1,
    //  args: [batchTarget],
    //  label: "OPS DASHBOARD (one-shot)",
    //  required: false,
    //},
  ];

  for (const job of plan) {
    const jobRam = cost(job.name, job.threads);
    if (!isFinite(jobRam)) {
      if (job.required) {
        ns.tprint(`Required job ${job.label} (${job.name}) is missing.`);
      }
      continue;
    }

    const futureUsed = usedPlanned + jobRam;

    // Normal case: respect RAM budget
    if (futureUsed > budget) {
      ns.tprint(
        "Skipping " + job.label + " (" + job.name + ") — would exceed budget " +
        `${futureUsed.toFixed(1)}GB > ${budget.toFixed(1)}GB`
      );
      continue;
    }

    const pid = ns.exec(job.name, "home", job.threads, ...job.args);
    if (pid === 0) {
      ns.tprint(`Failed to launch ${job.label} (${job.name}).`);
    } else {
      usedPlanned = ns.getServerUsedRam("home"); // sync actual
      const argInfo = job.args && job.args.length ? ` ${JSON.stringify(job.args)}` : "";
      ns.tprint(`Started ${job.label} (pid ${pid})${argInfo}`);
    }
  }

  // Give botnet-hgw-sync time to deploy HGW scripts before showing status
  await ns.sleep(5000);

  if (ns.fileExists("botnet/botnet-hgw-status.js", "home")) {
    const pid = ns.exec("botnet/botnet-hgw-status.js", "home", 1);
    if (pid === 0) {
      ns.tprint("Failed to launch BOTNET STATUS after deployment delay.");
    } else {
      ns.tprint(`Started BOTNET STATUS (pid ${pid}) after deployment delay.`);
    }
  } else {
    ns.tprint("BOTNET STATUS script not found on home.");
  }

  ns.tprint(
    "STARTUP-HOME COMPLETE — automation online. " +
    `Home RAM: ${maxRam.toFixed(1)}GB, reserve: ${HOME_RAM_RESERVE.toFixed(1)}GB.`
  );
}

// --------------------------------------------------
// Help Function
// --------------------------------------------------

function printHelp(ns) {
  ns.tprint("core/startup-home-advanced.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Advanced home startup/launcher.");
  ns.tprint("  Picks a batch target, chooses an HGW target for XP or money,");
  ns.tprint("  kills existing scripts on home (except itself and corp/agri-* helpers),");
  ns.tprint("  and launches:");
  ns.tprint("    - core/timed-net-batcher2.js");
  ns.tprint("    - core/root-and-deploy.js");
  ns.tprint("    - pserv/pserv-manager.js");
  ns.tprint("    - botnet/botnet-hgw-sync.js");
  ns.tprint("    - hacknet/hacknet-smart.js (if present)");
  ns.tprint("    - optional UI/monitor scripts such as ui/ops-dashboard.js");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Safe to rerun; it will re-kill and restart your core automation.");
  ns.tprint("  - Uses Formulas.exe automatically when present for target scoring.");
  ns.tprint("  - Auto-enables timed-net-batcher2 --lowram mode on very small setups.");
  ns.tprint("  - HGW mode controls the secondary HGW target:");
  ns.tprint("      --hgw money  => distinct money server, separate from batch target");
  ns.tprint("      --hgw xp     => high-security XP target.");
  ns.tprint("  - Preserves corp/agri-structure.js, corp/agri-inputs.js, corp/agri-sales.js.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run core/startup-home-advanced.js");
  ns.tprint("  run core/startup-home-advanced.js omega-net");
  ns.tprint("  run core/startup-home-advanced.js --hgw xp");
  ns.tprint("  run core/startup-home-advanced.js omega-net --hgw money");
  ns.tprint("  run core/startup-home-advanced.js --help");
}
