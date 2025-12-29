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

  return programs.filter((p) => ns.fileExists(p, "home")).length;
}

function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

function fmtMoney(ns, value) {
  return "$" + ns.formatNumber(value, 2, 1e3);
}

// ------------------------------------------------
// Rooting helpers (FIX: remove botnet/root timing race)
// ------------------------------------------------
function getCrackerFns(ns) {
  const fns = [];

  if (ns.fileExists("BruteSSH.exe", "home")) fns.push((h) => ns.brutessh(h));
  if (ns.fileExists("FTPCrack.exe", "home")) fns.push((h) => ns.ftpcrack(h));
  if (ns.fileExists("relaySMTP.exe", "home")) fns.push((h) => ns.relaysmtp(h));
  if (ns.fileExists("HTTPWorm.exe", "home")) fns.push((h) => ns.httpworm(h));
  if (ns.fileExists("SQLInject.exe", "home")) fns.push((h) => ns.sqlinject(h));

  return fns;
}

/**
 * Returns true if host is rootable *right now* (by your level + crackers).
 */
function isRootableNow(ns, host, crackerCount) {
  const s = ns.getServer(host);

  if (s.hasAdminRights) return false;
  if (host === "home" || host === "darkweb") return false;
  if (s.purchasedByPlayer) return false;

  const reqHack = s.requiredHackingSkill;
  const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

  return reqHack <= ns.getHackingLevel() && reqPorts <= crackerCount;
}

/**
 * Attempt to root all servers that are rootable now.
 * Returns { rooted, attempted } counts.
 */
function rootAllPossible(ns) {
  const servers = getAllServers(ns);
  const crackerFns = getCrackerFns(ns);
  const crackerCount = crackerFns.length;

  let attempted = 0;
  let rooted = 0;

  for (const host of servers) {
    if (!isRootableNow(ns, host, crackerCount)) continue;
    attempted++;

    try {
      // Open whatever ports we can (order doesn't matter)
      for (const fn of crackerFns) {
        try {
          fn(host);
        } catch (_e) {
          /* ignore */
        }
      }

      try {
        ns.nuke(host);
      } catch (_e) {
        /* ignore */
      }

      if (ns.hasRootAccess(host)) rooted++;
    } catch (_e) {
      // Keep going; some servers can still fail if something weird happens.
    }
  }

  return { rooted, attempted };
}

/**
 * Wait until all currently-rootable servers are rooted (or timeout).
 * This is the key fix: prevents botnet from racing rooting.
 */
async function waitForRootCoverage(ns, opts = {}) {
  const timeoutMs = Math.max(1_000, Number(opts.timeoutMs ?? 30_000));
  const pollMs = Math.max(100, Number(opts.pollMs ?? 500));
  const start = Date.now();

  while (true) {
    const servers = getAllServers(ns);
    const crackerCount = countPortCrackers(ns);
    const hackingLevel = ns.getHackingLevel();

    let rootableNow = 0;
    let rootedNow = 0;

    for (const host of servers) {
      const s = ns.getServer(host);

      if (host === "home" || host === "darkweb") continue;
      if (s.purchasedByPlayer) continue;

      const reqHack = s.requiredHackingSkill;
      const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

      if (reqHack <= hackingLevel && reqPorts <= crackerCount) {
        rootableNow++;
        if (s.hasAdminRights) rootedNow++;
      }
    }

    // If everything we can root right now is rooted, we're good.
    if (rootedNow >= rootableNow) return true;
    if (Date.now() - start > timeoutMs) return false;

    await ns.sleep(pollMs);
  }
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

    const reqHack = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
    const maxMoney = s.moneyMax;
    const minSec = s.minDifficulty || 1;

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
    if (hackRatio < 0.2) bandBonus = 0.7;
    else if (hackRatio <= 0.8) bandBonus = 1.0;
    else bandBonus = 0.85;

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
    ns.tprint("[?] No juicy advanced target found with current filters.");
    ns.tprint("   Falling back to n00dles.");
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   ðŸ’° Juiciest Advanced Target (v4: tuned money/sec)");
  ns.tprint("=======================================");
  ns.tprint(`ðŸŽ¯ Host:       ${best.host}`);
  ns.tprint(`ðŸ’¸ Max Money:  ${fmtMoney(ns, best.maxMoney)}`);
  ns.tprint(`ðŸ§  Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`ðŸŽ¯ Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`ðŸ›¡ MinSec:     ${best.minSec.toFixed(2)}`);
  ns.tprint(`[TIME] Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`ðŸ’° Money/sec:  ${fmtMoney(ns, best.moneyPerSec * 1000)}`);
  ns.tprint(`ðŸ“ˆ Score:      ${best.score.toExponential(3)}`);

  const topN = Math.min(5, scored.length);

  ns.tprint("=======================================");
  ns.tprint("   ðŸ† Top Candidates (by money/sec)");
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

  const EXCLUDED = new Set(["home", "darkweb", ...extraExcluded]);
  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue;

    const s = ns.getServer(host);
    const reqHack = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);

    let bandBonus;
    if (hackRatio < 0.4) bandBonus = 0.5;
    else if (hackRatio <= 1.2) bandBonus = 1.1;
    else if (hackRatio <= 1.6) bandBonus = 1.0;
    else bandBonus = 0.7;

    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1);
    const baseXpScore = (reqHack * chanceModifier) / Math.pow(tHack, 1.2);
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
  const scored = getXpScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("[?] No distinct XP-optimized HGW target found.");
    ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    return "n00dles";
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   ðŸ§  XP-Optimized HGW Target (tweaked)");
  ns.tprint("=======================================");
  ns.tprint(`ðŸŽ¯ Host:       ${best.host}`);
  ns.tprint(`ðŸ§  Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`ðŸŽ¯ Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`[TIME] Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`ðŸ“ˆ XP Score:   ${best.score.toExponential(3)}`);
  ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

  const topN = Math.min(5, scored.length);

  ns.tprint("=======================================");
  ns.tprint("   ðŸ§  Top XP Candidates");
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

function chooseSecondaryTarget(ns, primary) {
  const scored = getScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("[?] No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  ns.tprint(`ðŸ’° Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ------------------------------------------------------------
// MAIN (RAM-aware, prioritized launcher)
// ------------------------------------------------------------
export async function main(ns) {
  ns.disableLog("ALL");

  const formulasAvailable = hasFormulas(ns);

  ns.tprint(
    formulasAvailable
      ? "Formulas.exe detected - using formulas-based times/chance where possible."
      : "Formulas.exe not detected - using built-in timing/scoring APIs."
  );

  const flags = ns.flags([
    ["hgw", "money"], // "xp" or "money" for HGW mode
    ["extras", ""], // comma/space separated extras: "pserv", "hacknet", "ui", "all"
    ["help", false], // show help and exit
  ]);

  if (flags.help) {
    printHelp(ns);
    return;
  }

  const hgwMode = String(flags.hgw ?? "money").toLowerCase();
  const extrasRaw = String(flags.extras || "").toLowerCase();

  const extrasTokens = extrasRaw
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const extrasSet = new Set();

  for (const token of extrasTokens) {
    if (token === "all" || token === "*") {
      extrasSet.add("pserv");
      extrasSet.add("hacknet");
      extrasSet.add("ui");
      continue;
    }

    if (["pserv", "pservs", "pserver", "pservers"].includes(token)) {
      extrasSet.add("pserv");
      continue;
    }

    if (["hacknet", "hn"].includes(token)) {
      extrasSet.add("hacknet");
      continue;
    }

    if (["ui", "dashboard", "ops"].includes(token)) {
      extrasSet.add("ui");
      continue;
    }
  }

  const wantPserv = extrasSet.has("pserv");
  const wantHacknet = extrasSet.has("hacknet");
  const wantUi = extrasSet.has("ui");

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

  const HOME_RAM_RESERVE = (() => {
    const max = homeMaxRam;
    return Math.min(128, Math.max(8, Math.floor(max * 0.1)));
  })();

  const PSERV_TARGET_RAM = (() => {
    if (homeMaxRam < 128) return 32;
    if (homeMaxRam < 256) return 64;
    if (homeMaxRam < 512) return 128;
    if (homeMaxRam < 1024) return 256;
    if (homeMaxRam < 2048) return 512;
    return 1024;
  })();

  const USE_LOW_RAM_MODE = homeMaxRam < 128 && (pservs.length === 0 || minPservRam < 64);

  ns.tprint(
    USE_LOW_RAM_MODE
      ? `Low-RAM batch mode ENABLED for timed-net-batcher2.js (home=${homeMaxRam.toFixed(
        1
      )}GB, min pserv=${minPservRam || 0}GB).`
      : `Full batch mode (no --lowram) for timed-net-batcher2.js (home=${homeMaxRam.toFixed(
        1
      )}GB, min pserv=${minPservRam || 0}GB).`
  );

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
    "(except startup and bootstrap.js)."
  );

  const myPid = ns.pid;

  const keepFiles = new Set(["bin/bootstrap.js"]);
  const processes = ns.ps("home");

  for (const p of processes) {
    if (p.pid === myPid) continue;
    if (keepFiles.has(p.filename)) continue;
    ns.kill(p.pid);
  }

  await ns.sleep(200);

  ns.tprint("Home is clean. Proceeding with rooting + relaunch.");

  // --------------------------------------------------
  // FIX: root first (so batcher + botnet don't race it)
  // --------------------------------------------------
  const before = rootAllPossible(ns);

  ns.tprint(`ROOT PASS: rooted=${before.rooted}/${before.attempted} newly-rootable targets (attempted).`);

  // Optional: if you still want bin/root-and-deploy.js to do copying/backdoor/etc
  // we can start it, but we no longer *depend* on it for initial rooting.
  if (ns.fileExists("bin/root-and-deploy.js", "home")) {
    const pid = ns.exec("bin/root-and-deploy.js", "home", 1);
    if (pid === 0) ns.tprint("WARN: Failed to launch bin/root-and-deploy.js (continuing).");
    else ns.tprint(`Started ROOT + DEPLOY daemon (pid ${pid}).`);
  } else {
    ns.tprint("WARN: bin/root-and-deploy.js missing; relying on startup rooting pass only.");
  }

  // Keep trying briefly in case you just bought a cracker / leveled / etc.
  const ok = await waitForRootCoverage(ns, { timeoutMs: 20_000, pollMs: 500 });

  if (!ok) ns.tprint("WARN: Root coverage not complete within timeout. Continuing anyway.");
  else ns.tprint("Root coverage OK: all currently-rootable servers are rooted.");

  // --------------------------------------------------
  // RAM-aware scheduler
  // --------------------------------------------------
  function cost(script, threads = 1) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`Missing script (skipping in plan): ${script}`);
      return Infinity;
    }

    return ns.getScriptRam(script, "home") * threads;
  }

  const maxRam = homeMaxRam;
  const budget = maxRam - HOME_RAM_RESERVE;
  let usedPlanned = ns.getServerUsedRam("home");

  // 1) Launch MONEY BATCHER (now target should be rooted)
  const batcherArgs = USE_LOW_RAM_MODE ? [batchTarget, "--lowram"] : [batchTarget];
  const batcherRamCost = cost("bin/timed-net-batcher2.js", 1);

  if (isFinite(batcherRamCost)) {
    if (batcherRamCost > maxRam) {
      ns.tprint(
        "MONEY BATCHER (bin/timed-net-batcher2.js) alone needs " +
        `${batcherRamCost.toFixed(1)}GB, which exceeds home RAM (${maxRam.toFixed(1)}GB).`
      );
    } else {
      const pid = ns.exec("bin/timed-net-batcher2.js", "home", 1, ...batcherArgs);

      if (pid === 0) ns.tprint("Failed to launch MONEY BATCHER (bin/timed-net-batcher2.js).");
      else {
        usedPlanned = ns.getServerUsedRam("home");
        ns.tprint(`Started REQUIRED MONEY BATCHER (pid ${pid}) ${JSON.stringify(batcherArgs)}`);
      }
    }
  }

  // 2) Launch BOTNET after rooting is handled (FIX)
  // NOTE: This is the big race fix vs your old ordering.
  {
    const botnetRam = cost("bin/botnet-hgw-sync.js", 1);

    if (isFinite(botnetRam)) {
      const futureUsed = usedPlanned + botnetRam;

      if (futureUsed > budget) {
        ns.tprint(`Skipping BOTNET HGW SYNC - would exceed budget ${futureUsed.toFixed(1)}GB > ${budget.toFixed(1)}GB`);
      } else {
        const pid = ns.exec("bin/botnet-hgw-sync.js", "home", 1, hgwTarget, hgwMode);

        if (pid === 0) ns.tprint("Failed to launch BOTNET HGW SYNC (bin/botnet-hgw-sync.js).");
        else {
          usedPlanned = ns.getServerUsedRam("home");
          ns.tprint(`Started BOTNET HGW SYNC (pid ${pid}) [${hgwTarget}, ${hgwMode}]`);
        }
      }
    }
  }

  // 3) Optional extras
  const plan = [];

  if (wantPserv) {
    plan.push({
      name: "bin/pserv-manager.js",
      threads: 1,
      args: [PSERV_TARGET_RAM],
      label: "PSERV MANAGER",
    });
  }

  if (wantHacknet) {
    plan.push({
      name: "hacknet/hacknet-smart.js",
      threads: 1,
      args: [],
      label: "HACKNET SMART",
    });
  }

  if (wantUi) {
    plan.push({
      name: "DISABLED:bin/ui/ops-dashboard.js",
      threads: 1,
      args: [batchTarget],
      label: "OPS DASHBOARD (one-shot)",
    });
  }

  for (const job of plan) {
    const jobRam = cost(job.name, job.threads);
    if (!isFinite(jobRam)) continue;

    const futureUsed = usedPlanned + jobRam;

    if (futureUsed > budget) {
      ns.tprint(
        `Skipping ${job.label} (${job.name}) - would exceed budget ` + `${futureUsed.toFixed(1)}GB > ${budget.toFixed(1)}GB`
      );
      continue;
    }

    const pid = ns.exec(job.name, "home", job.threads, ...(job.args || []));

    if (pid === 0) ns.tprint(`Failed to launch ${job.label} (${job.name}).`);
    else {
      usedPlanned = ns.getServerUsedRam("home");
      ns.tprint(`Started ${job.label} (pid ${pid}) ${job.args?.length ? JSON.stringify(job.args) : ""}`);
    }
  }

  // Give botnet-hgw-sync time to deploy HGW scripts before showing status
  await ns.sleep(5000);

  if (ns.fileExists("/botnet/botnet-hgw-status.js", "home")) {
    const pid = ns.exec("/botnet/botnet-hgw-status.js", "home", 1);
    if (pid === 0) ns.tprint("Failed to launch BOTNET STATUS after deployment delay.");
    else ns.tprint(`Started BOTNET STATUS (pid ${pid}) after deployment delay.`);
  } else {
    ns.tprint("BOTNET STATUS script not found on home.");
  }

  ns.tprint(
    "STARTUP-HOME COMPLETE - automation online. " +
    `Home RAM: ${maxRam.toFixed(1)}GB, reserve: ${HOME_RAM_RESERVE.toFixed(1)}GB.`
  );
}

// --------------------------------------------------
// Help Function
// --------------------------------------------------
function printHelp(ns) {
  ns.tprint("bin/startup-home-advanced.js");
  ns.tprint("");

  ns.tprint("Description");
  ns.tprint("  Advanced home startup/launcher.");
  ns.tprint("  Picks a batch target, chooses an HGW target for XP or money,");
  ns.tprint("  kills existing scripts on home (except itself and corp/agri-* helpers),");
  ns.tprint("  ROOTS all currently-rootable servers (fixes ordering/race), then launches:");
  ns.tprint("    - bin/timed-net-batcher2.js");
  ns.tprint("    - bin/botnet-hgw-sync.js");
  ns.tprint("  Optionally launches bin/root-and-deploy.js as a daemon for extra deploy work.");
  ns.tprint("  Optional extras via --extras:");
  ns.tprint("    - bin/pserv-manager.js");
  ns.tprint("    - hacknet/hacknet-smart.js");
  ns.tprint("    - ui/ops-dashboard.js (one-shot dashboard)");
  ns.tprint("");

  ns.tprint("Notes");
  ns.tprint("  - Safe to rerun; it will re-kill and restart your core automation.");
  ns.tprint("  - Uses Formulas.exe automatically when present for target scoring.");
  ns.tprint("  - Auto-enables timed-net-batcher2 --lowram mode on very small setups.");
  ns.tprint("  - Fix: rooting happens before botnet/batcher start to prevent race errors.");
  ns.tprint("");

  ns.tprint("Syntax");
  ns.tprint("  run bin/startup-home-advanced.js");
  ns.tprint("  run bin/startup-home-advanced.js --extras pserv");
  ns.tprint("  run bin/startup-home-advanced.js --extras pserv,hacknet,ui");
  ns.tprint("  run bin/startup-home-advanced.js --extras all");
  ns.tprint("  run bin/startup-home-advanced.js omega-net");
  ns.tprint("  run bin/startup-home-advanced.js --hgw xp");
  ns.tprint("  run bin/startup-home-advanced.js omega-net --hgw money --extras ui");
  ns.tprint("  run bin/startup-home-advanced.js --help");
}

// ooo fixed
