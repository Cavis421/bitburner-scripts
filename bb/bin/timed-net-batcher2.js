// Global health thresholds (more relaxed)
const MONEY_THRESHOLD = 0.90; // Accept 90%+ money in normal mode
const SEC_TOLERANCE = 0.90; // Allow some security above min

// Softer thresholds for low-RAM mode
const LOWRAM_MONEY_THRESHOLD = 0.90; // Accept 90%+ money
const LOWRAM_SEC_TOLERANCE = 1.50; // Allow more security drift

// Interval for status + profit summaries
const STATUS_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Each batch will only try to use this fraction of *currently free* RAM.
const BATCH_RAM_FRACTION = 0.9; // 90% of free RAM per batch

// Target hack fraction per money batch (aggressive, but capped)
const TARGET_HACK_FRACTION = 0.10; // Aim to hack ~10% money per batch
const MAX_HACK_FRACTION = 0.30; // Never hack more than 30% per batch

// Prep behavior
const WEAKEN_FIRST_DELTA = 5; // If secDelta > this, do weaken-only prep

// Hot-reload thresholds
const PSERV_MIN_TOTAL_RAM = 64; // below this => home-only mode
const FLEET_REFRESH_MS = 5_000; // how often to rescan pserv fleet
const FLEET_STABLE_MS = 8_000; // hysteresis: must remain above/below threshold this long to switch

// Simple formatter wrapper for money values
function fmtMoney(ns, value) {
  return "$" + ns.formatNumber(value, 2, 1e3);
}

// ------------------------------------------------
// Home RAM reserve helper (shared by both modes)
// ------------------------------------------------
function getHomeReserve(ns) {
  const max = ns.getServerMaxRam("home");
  // 10% of home, clamped between 8GB and 128GB
  return Math.min(128, Math.max(8, Math.floor(max * 0.10)));
}

// ------------------------------------------------
// Formulas.exe helpers
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
 * Compute hack/grow/weaken times.
 * - assumePrepped=true  => min security + max money
 * - assumePrepped=false => CURRENT server state
 *
 * Uses formulas if available, otherwise falls back to ns.getHack/Grow/WeakenTime.
 */
function getHackGrowWeakenTimes(ns, target, assumePrepped = true) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(target),
      tGrow: ns.getGrowTime(target),
      tWeaken: ns.getWeakenTime(target),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(target);

  if (assumePrepped) {
    s.hackDifficulty = s.minDifficulty;
    s.moneyAvailable = Math.max(1, s.moneyMax || 0);
  } else {
    // Keep current hackDifficulty; ensure moneyAvailable is non-zero
    s.moneyAvailable = Math.max(1, s.moneyAvailable || 0);
  }

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    tGrow: ns.formulas.hacking.growTime(s, player),
    tWeaken: ns.formulas.hacking.weakenTime(s, player),
    usingFormulas: true,
  };
}

// ------------------------------------------------
// HELP
// ------------------------------------------------
function printHelp(ns) {
  const script = "bin/timed-net-batcher2.js";

  ns.tprint("==============================================================");
  ns.tprint(`HELP - ${script}`);
  ns.tprint("==============================================================");
  ns.tprint("");

  ns.tprint("DESCRIPTION");
  ns.tprint("  Advanced timed HWGW batch controller that:");
  ns.tprint("    - Uses Formulas.exe when available for precise timings,");
  ns.tprint("    - Runs multi-batch pipelines in normal mode,");
  ns.tprint("    - Falls back to simpler HOME-only HWGW when pserv capacity is low,");
  ns.tprint("    - HOT-RELOADS purchased server fleet changes (pserv upgrades) without restart.");
  ns.tprint("");

  ns.tprint("NOTES");
  ns.tprint("  - Requires batch/batch-hack.js, batch/batch-grow.js, batch/batch-weaken.js on home.");
  ns.tprint("  - Expects the target to be rooted.");
  ns.tprint("  - --lowram:");
  ns.tprint("      * Uses softer money/security thresholds when prepping.");
  ns.tprint("      * Forces single-batch behavior (no overlap) when applicable.");
  ns.tprint("  - Hot reload:");
  ns.tprint("      * Periodically re-scans purchased servers and SCPs workers to new/changed pservs.");
  ns.tprint("      * Switches between HOME-only and HYBRID mode automatically based on total pserv RAM.");
  ns.tprint("  - Timing:");
  ns.tprint("      * During PREP, uses CURRENT-state hack/grow/weaken times.");
  ns.tprint("      * During MONEY batching, uses PREPPED-state times for tight alignment.");
  ns.tprint("");

  ns.tprint("SYNTAX");
  ns.tprint("  run bin/timed-net-batcher2.js <target>");
  ns.tprint("  run bin/timed-net-batcher2.js <target> --lowram");
  ns.tprint("  run bin/timed-net-batcher2.js <target> --concurrency <n>");
  ns.tprint("  run bin/timed-net-batcher2.js <target> --concurrency 0 --maxconc <n>");
  ns.tprint("  run bin/timed-net-batcher2.js <target> --debug");
  ns.tprint("  run bin/timed-net-batcher2.js --help");
  ns.tprint("");

  ns.tprint("==============================================================");
  ns.tprint("");
}

// ------------------------------------------------
// MAIN
// ------------------------------------------------

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["lowram", false],
    ["help", false],
    ["debug", false],
    ["concurrency", 0], // 0 = auto (based on available RAM)
    ["maxconc", 64], // cap for auto/explicit concurrency
  ]);

  if (flags.help) {
    printHelp(ns);
    return;
  }

  const target = flags._[0];
  const lowRamMode = !!flags.lowram;
  const debug = !!flags.debug;
  const requestedConcurrency = Number(flags.concurrency) || 0; // 0 => auto
  const maxConcurrency = Math.max(1, Math.floor(Number(flags.maxconc) || 64));

  if (!target) {
    ns.tprint("No batch target provided. bin/timed-net-batcher2.js requires a target.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run bin/timed-net-batcher2.js <target>");
    ns.tprint("  run bin/timed-net-batcher2.js <target> --lowram");
    return;
  }

  const hackScript = "workers/hwgw/batch-hack.js";
  const growScript = "workers/hwgw/batch-grow.js";
  const weakenScript = "workers/hwgw/batch-weaken.js";

  for (const s of [hackScript, growScript, weakenScript]) {
    if (!ns.fileExists(s, "home")) {
      ns.tprint(`Missing script on home: ${s}`);
      return;
    }
  }

  // Startup banner
  const usingFormulas = hasFormulas(ns);

  ns.tprint(`Timed HWGW batcher targeting: ${target}`);
  ns.tprint(usingFormulas ? "Using Formulas.exe for batch timing." : "Formulas.exe not detected; using ns.getHack/Grow/WeakenTime.");
  ns.tprint(lowRamMode ? "LOW-RAM MODE enabled." : "Normal mode enabled.");
  ns.tprint(
    `Hot reload enabled: rescan=${(FLEET_REFRESH_MS / 1000).toFixed(1)}s, ` +
      `stable=${(FLEET_STABLE_MS / 1000).toFixed(1)}s, threshold=${PSERV_MIN_TOTAL_RAM}GB`
  );

  const HOME_RAM_RESERVE = getHomeReserve(ns);
  const GAP = 200; // ms

  // Fleet hot-reload state
  // Track SCP state by "host:maxRam" so same-name upgrades re-SCP properly
  const scpDone = new Set();
  const scpKey = (host) => `${host}:${ns.getServerMaxRam(host)}`;

  let lastFleetRefresh = 0;

  // Mode hysteresis state
  let mode = "UNKNOWN"; // "HOME" | "HYBRID"
  let pendingMode = null;
  let pendingSince = 0;

  let lastStatusPrint = 0;

  // Small helper to refresh fleet + SCP new/changed pservs
  const refreshFleet = async () => {
    const purchased = ns.getPurchasedServers();

    let totalPservRam = 0;
    for (const host of purchased) totalPservRam += ns.getServerMaxRam(host);

    for (const host of purchased) {
      const key = scpKey(host);
      if (scpDone.has(key)) continue;

      await ns.scp([hackScript, growScript, weakenScript], host);
      scpDone.add(key);

      ns.print(`Fleet hot-reload: SCP'd batch workers to ${host} (key=${key})`);
    }

    // Clean up old keys for removed servers and old RAM sizes
    const keep = new Set(purchased.map((h) => scpKey(h)));
    for (const key of Array.from(scpDone)) {
      if (!keep.has(key)) scpDone.delete(key);
    }

    return { purchased, totalPservRam };
  };

  const desiredModeFromFleet = (totalPservRam) => {
    return totalPservRam >= PSERV_MIN_TOTAL_RAM ? "HYBRID" : "HOME";
  };

  const updateMode = (desired, now, totalPservRam) => {
    if (mode === "UNKNOWN") {
      mode = desired;
      pendingMode = null;
      pendingSince = 0;

      ns.tprint(
        `Mode set: ${mode === "HYBRID" ? "HYBRID (home+pservs)" : "HOME-only"} (initial) ` +
          `(total pserv RAM=${totalPservRam.toFixed(1)}GB)`
      );
      return;
    }

    if (desired === mode) {
      pendingMode = null;
      pendingSince = 0;
      return;
    }

    if (pendingMode !== desired) {
      pendingMode = desired;
      pendingSince = now;
      ns.print(`Mode change pending: ${mode} -> ${desired} (waiting for stability)`);
      return;
    }

    if (now - pendingSince >= FLEET_STABLE_MS) {
      mode = desired;
      pendingMode = null;
      pendingSince = 0;

      ns.tprint(
        `Mode switched: ${mode === "HYBRID" ? "HYBRID (home+pservs)" : "HOME-only"} ` +
          `(total pserv RAM=${totalPservRam.toFixed(1)}GB)`
      );
    }
  };

  while (true) {
    const now = Date.now();

    if (now - lastFleetRefresh >= FLEET_REFRESH_MS) {
      const fleet = await refreshFleet();
      updateMode(desiredModeFromFleet(fleet.totalPservRam), now, fleet.totalPservRam);
      lastFleetRefresh = now;
    }

    if (now - lastStatusPrint >= STATUS_INTERVAL) {
      printTargetStatus(ns, target);
      lastStatusPrint = now;
    }

    if (mode === "HOME") {
      await runHomeOnlyTick(ns, {
        target,
        hackScript,
        growScript,
        weakenScript,
        lowRamMode,
        debug,
        HOME_RAM_RESERVE,
        GAP,
      });
      continue;
    }

    await runHybridTick(ns, {
      target,
      hackScript,
      growScript,
      weakenScript,
      lowRamMode,
      debug,
      requestedConcurrency,
      maxConcurrency,
      HOME_RAM_RESERVE,
      GAP,
      purchased: ns.getPurchasedServers(),
    });
  }
}

// ------------------------------------------------
// HYBRID tick (one iteration)
// ------------------------------------------------
async function runHybridTick(ns, ctx) {
  const {
    target,
    hackScript,
    growScript,
    weakenScript,
    lowRamMode,
    debug,
    requestedConcurrency,
    maxConcurrency,
    HOME_RAM_RESERVE,
    GAP,
    purchased,
  } = ctx;

  const pservSet = new Set(purchased);
  const hosts = ["home", ...purchased];

  const workers = [];
  let totalFree = 0;

  for (const host of hosts) {
    const maxRam = ns.getServerMaxRam(host);
    const usedRam = ns.getServerUsedRam(host);

    let freeRam = maxRam - usedRam;

    if (host === "home") {
      freeRam = Math.max(0, maxRam - usedRam - HOME_RAM_RESERVE);
    }

    if (freeRam < 0.1) continue;

    workers.push({
      host,
      freeRam,
      isHome: host === "home",
      isPserv: pservSet.has(host),
    });

    totalFree += freeRam;
  }

  const money = ns.getServerMoneyAvailable(target);
  const max = ns.getServerMaxMoney(target);
  const sec = ns.getServerSecurityLevel(target);
  const minSec = ns.getServerMinSecurityLevel(target);

  const moneyRatio = max > 0 ? money / max : 0;
  const secDelta = sec - minSec;

  const moneyThresh = lowRamMode ? LOWRAM_MONEY_THRESHOLD : MONEY_THRESHOLD;
  const secThresh = lowRamMode ? LOWRAM_SEC_TOLERANCE : SEC_TOLERANCE;

  const moneyOk = moneyRatio >= moneyThresh;
  const secOk = secDelta <= secThresh;
  const prepping = !(moneyOk && secOk);

  const times = getHackGrowWeakenTimes(ns, target, !prepping);

  const tHack = times.tHack;
  const tGrow = times.tGrow;
  const tWeaken = times.tWeaken;

  const T = tWeaken + 4 * GAP;
  const cycleTime = T + GAP;

  const delayHack = Math.max(0, T - 3 * GAP - tHack);
  const delayGrow = Math.max(0, T - 2 * GAP - tGrow);
  const delayWeak1 = Math.max(0, T - 1 * GAP - tWeaken);
  const delayWeak2 = Math.max(0, T - tWeaken);

  if (totalFree <= 0) {
    ns.print("No free RAM available for a new batch. Sleeping.");
    await ns.sleep(Math.max(GAP, Math.floor(cycleTime / (lowRamMode ? 1 : 16))));
    return;
  }

  workers.sort((a, b) => b.freeRam - a.freeRam);

  const allowedRam = totalFree * BATCH_RAM_FRACTION;

  const hackRam = ns.getScriptRam(hackScript);
  const growRam = ns.getScriptRam(growScript);
  const weakenRam = ns.getScriptRam(weakenScript);

  let hackThreads = 0;
  let growThreads = 0;
  let weakenThreads = 0;

  if (prepping) {
    const weakenPerThread = ns.weakenAnalyze(1);
    const secPerGrowThread = ns.growthAnalyzeSecurity(1);

    if (secDelta > WEAKEN_FIRST_DELTA) {
      growThreads = 0;
      weakenThreads = weakenPerThread > 0 ? Math.max(1, Math.ceil(secDelta / weakenPerThread)) : 1;
    } else {
      if (moneyRatio < moneyThresh) {
        const growMult = max > 0 && money > 0 ? max / Math.max(1, money) : 2;
        growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target, growMult)));
      } else {
        growThreads = 0;
      }

      const secFromGrow = growThreads * secPerGrowThread;
      const totalSecToRemove = Math.max(0, secDelta) + secFromGrow;

      weakenThreads = weakenPerThread > 0 ? Math.max(1, Math.ceil(totalSecToRemove / weakenPerThread)) : 1;
    }

    let totalRamNeeded = growThreads * growRam + weakenThreads * weakenRam;

    if (totalRamNeeded > allowedRam && totalRamNeeded > 0) {
      const scale = allowedRam / totalRamNeeded;
      growThreads = Math.max(0, Math.floor(growThreads * scale));
      weakenThreads = Math.max(1, Math.floor(weakenThreads * scale));
      totalRamNeeded = growThreads * growRam + weakenThreads * weakenRam;
    }

    ns.print(`Prep batch: G=${growThreads}, W=${weakenThreads} (RAM=${totalRamNeeded.toFixed(1)}GB)`);

    const homeHost = workers.find((w) => w.isHome);
    const nonHome = workers.filter((w) => !w.isHome);
    const gwHosts = homeHost ? [...nonHome, homeHost] : nonHome;

    const launchedW = allocToHosts(ns, gwHosts, weakenScript, target, weakenThreads, 0, tWeaken);
    const launchedG = growThreads > 0 ? allocToHosts(ns, gwHosts, growScript, target, growThreads, 0, tGrow) : 0;

    if (launchedW < weakenThreads) ns.print(`WARN: Only launched W=${launchedW}/${weakenThreads} threads (prep).`);
    if (growThreads > 0 && launchedG < growThreads) ns.print(`WARN: Only launched G=${launchedG}/${growThreads} threads (prep).`);

    if (debug) {
      ns.print(
        `DEBUG: PREP sleeping ${ns.tFormat(tWeaken + 2 * GAP)} ` +
          `(secDelta=${secDelta.toFixed(2)}, money=${(moneyRatio * 100).toFixed(2)}%)`
      );
    }

    await ns.sleep(tWeaken + 2 * GAP);
    return;
  }

  // MONEY batch
  const pctPerHackThread = ns.hackAnalyze(target);

  if (pctPerHackThread > 0) {
    let desiredThreads = Math.floor(TARGET_HACK_FRACTION / pctPerHackThread);
    const maxThreads = Math.floor(MAX_HACK_FRACTION / pctPerHackThread);
    if (maxThreads > 0) desiredThreads = Math.min(desiredThreads, maxThreads);
    hackThreads = Math.max(1, desiredThreads);
  } else {
    hackThreads = 1;
  }

  const growMult = 1 / (1 - TARGET_HACK_FRACTION);
  growThreads = Math.ceil(ns.growthAnalyze(target, growMult));
  if (growThreads < 1) growThreads = 1;

  const secIncHack = ns.hackAnalyzeSecurity(hackThreads);
  const secIncGrow = ns.growthAnalyzeSecurity(growThreads);
  const totalSec = secIncHack + secIncGrow;

  const weakenPerThread = ns.weakenAnalyze(1);
  weakenThreads = weakenPerThread > 0 ? Math.ceil(totalSec / weakenPerThread) : 1;
  if (weakenThreads < 1) weakenThreads = 1;

  let totalRamNeeded =
    hackThreads * hackRam +
    growThreads * growRam +
    weakenThreads * weakenRam * 2;

  if (totalRamNeeded > allowedRam && totalRamNeeded > 0) {
    const scale = allowedRam / totalRamNeeded;

    hackThreads = Math.max(1, Math.floor(hackThreads * scale));
    growThreads = Math.max(1, Math.floor(growThreads * scale));
    weakenThreads = Math.max(1, Math.floor(weakenThreads * scale));

    totalRamNeeded =
      hackThreads * hackRam +
      growThreads * growRam +
      weakenThreads * weakenRam * 2;
  }

  let concurrency = lowRamMode ? 1 : 16;

  if (!lowRamMode) {
    const maxByTiming = Math.max(1, Math.floor(cycleTime / GAP) - 1);

    if (requestedConcurrency > 0) {
      concurrency = clampInt(requestedConcurrency, 1, Math.min(maxConcurrency, maxByTiming));
    } else {
      const ramPerBatch = Math.max(1, totalRamNeeded);
      const maxByRam = Math.max(1, Math.floor(allowedRam / ramPerBatch));
      concurrency = clampInt(maxByRam, 1, Math.min(maxConcurrency, maxByTiming));
    }
  }

  const batchInterval = Math.max(GAP, Math.floor(cycleTime / concurrency));

  ns.print(
    `Money batch: H=${hackThreads}, G=${growThreads}, ` +
      `W1=${weakenThreads}, W2=${weakenThreads} (RAM=${totalRamNeeded.toFixed(1)}GB, conc=${concurrency})`
  );

  const homeHost = workers.find((w) => w.isHome);
  const nonHome = workers.filter((w) => !w.isHome);
  const gwHosts = homeHost ? [...nonHome, homeHost] : nonHome;

  const launchedW1 = allocToHosts(ns, gwHosts, weakenScript, target, weakenThreads, delayWeak1, tWeaken);

  let launchedH = 0;

  if (hackThreads > 0) {
    let remainingH = hackThreads;

    if (homeHost) {
      const launchedHome = allocToHosts(ns, [homeHost], hackScript, target, remainingH, delayHack, tHack);
      launchedH += launchedHome;
      remainingH -= launchedHome;
    }

    if (remainingH > 0) {
      const launchedElsewhere = allocToHosts(ns, nonHome, hackScript, target, remainingH, delayHack, tHack);
      launchedH += launchedElsewhere;
      remainingH -= launchedElsewhere;
    }
  }

  const launchedG = growThreads > 0 ? allocToHosts(ns, gwHosts, growScript, target, growThreads, delayGrow, tGrow) : 0;
  const launchedW2 = allocToHosts(ns, gwHosts, weakenScript, target, weakenThreads, delayWeak2, tWeaken);

  if (launchedW1 < weakenThreads) ns.print(`WARN: Only launched W1=${launchedW1}/${weakenThreads}`);
  if (launchedH < hackThreads) ns.print(`WARN: Only launched H=${launchedH}/${hackThreads}`);
  if (launchedG < growThreads) ns.print(`WARN: Only launched G=${launchedG}/${growThreads}`);
  if (launchedW2 < weakenThreads) ns.print(`WARN: Only launched W2=${launchedW2}/${weakenThreads}`);

  if (debug) {
    ns.print(`DEBUG: batchInterval=${ns.tFormat(batchInterval)} conc=${concurrency}, freeRAM~${totalFree.toFixed(0)}GB`);
  }

  await ns.sleep(batchInterval);
}

// ------------------------------------------------
// HOME-only tick (one iteration)
// ------------------------------------------------
async function runHomeOnlyTick(ns, ctx) {
  const { target, hackScript, growScript, weakenScript, lowRamMode, debug, HOME_RAM_RESERVE, GAP } = ctx;

  const tHack = ns.getHackTime(target);
  const tGrow = ns.getGrowTime(target);
  const tWeaken = ns.getWeakenTime(target);

  const T = tWeaken + 4 * GAP;

  const delayHack = Math.max(0, T - 3 * GAP - tHack);
  const delayGrow = Math.max(0, T - 2 * GAP - tGrow);
  const delayWeak1 = Math.max(0, T - 1 * GAP - tWeaken);
  const delayWeak2 = Math.max(0, T - tWeaken);

  const cycleTime = T + GAP;
  const DESIRED_CONCURRENCY = lowRamMode ? 1 : 8;
  const batchInterval = Math.max(GAP, Math.floor(cycleTime / DESIRED_CONCURRENCY));

  const maxRam = ns.getServerMaxRam("home");
  const usedRam = ns.getServerUsedRam("home");

  let freeRam = maxRam - usedRam - HOME_RAM_RESERVE;
  if (freeRam < 0) freeRam = 0;

  // LowRAM safety: wait for worker scripts to finish (no overlap)
  if (lowRamMode) {
    const procs = ns.ps("home");
    const busy = procs.some(
      (p) => p.filename === hackScript || p.filename === growScript || p.filename === weakenScript
    );

    if (busy) {
      if (debug) ns.print("Home-only lowram: workers still running. Sleeping.");
      await ns.sleep(GAP);
      return;
    }
  }

  const hackRam = ns.getScriptRam(hackScript);
  const growRam = ns.getScriptRam(growScript);
  const weakenRam = ns.getScriptRam(weakenScript);

  const baseHack = 2;
  const baseGrow = 4;
  const baseWeak = 4;

  // Minimum "full batch" RAM footprint (must be fully affordable)
  const ramBase =
    baseHack * hackRam +
    baseGrow * growRam +
    2 * baseWeak * weakenRam;

  // FIX: avoid partial launches
  if (freeRam < ramBase) {
    ns.print(
      `Home-only mode: insufficient free RAM for full batch ` +
        `(free=${freeRam.toFixed(1)}GB, need=${ramBase.toFixed(1)}GB). Sleeping.`
    );
    await ns.sleep(batchInterval);
    return;
  }

  let mult = Math.floor(freeRam / ramBase);
  if (mult < 1) mult = 1;

  const pctPerHackThread = ns.hackAnalyze(target);
  const basePct = baseHack * pctPerHackThread;

  const MAX_HACK_FRACTION_HOME = 0.9;

  if (basePct > 0) {
    const safeMult = Math.floor(MAX_HACK_FRACTION_HOME / basePct);
    if (safeMult > 0 && safeMult < mult) mult = safeMult;
  }

  const hackThreads = Math.max(1, baseHack * mult);
  const growThreads = Math.max(1, baseGrow * mult);
  const weaken1Threads = Math.max(1, baseWeak * mult);
  const weaken2Threads = Math.max(1, baseWeak * mult);

  const ramUsed =
    hackThreads * hackRam +
    growThreads * growRam +
    (weaken1Threads + weaken2Threads) * weakenRam;

  ns.print(
    "Home batch: " +
      `H=${hackThreads}, G=${growThreads}, ` +
      `W1=${weaken1Threads}, W2=${weaken2Threads} ` +
      `(RAM=${ramUsed.toFixed(1)}GB${lowRamMode ? ", lowram" : ""})`
  );

  if (debug) {
    ns.print(
      `DEBUG: home free=${freeRam.toFixed(1)}GB reserve=${HOME_RAM_RESERVE.toFixed(1)}GB ` +
        `ramBase=${ramBase.toFixed(1)}GB mult=${mult}`
    );
  }

  const host = { host: "home", freeRam };

  allocToHosts(ns, [host], weakenScript, target, weaken1Threads, delayWeak1, tWeaken);
  allocToHosts(ns, [host], hackScript, target, hackThreads, delayHack, tHack);
  allocToHosts(ns, [host], growScript, target, growThreads, delayGrow, tGrow);
  allocToHosts(ns, [host], weakenScript, target, weaken2Threads, delayWeak2, tWeaken);

  await ns.sleep(batchInterval);
}

// ------------------------------------------------
// ALLOCATION HELPERS
// ------------------------------------------------

/**
 * Allocate threads for a given script across a list of hosts.
 * Returns the number of threads successfully launched.
 */
function allocToHosts(ns, hosts, script, target, threadsNeeded, delay = 0, extraArg = null) {
  if (threadsNeeded <= 0) return 0;

  const ramPerThread = ns.getScriptRam(script);
  if (ramPerThread <= 0) return 0;

  let launched = 0;

  for (const h of hosts) {
    if (threadsNeeded <= 0) break;
    if (h.freeRam < ramPerThread) continue;

    const maxThreadsHere = Math.floor(h.freeRam / ramPerThread);
    if (maxThreadsHere <= 0) continue;

    const allocate = Math.min(maxThreadsHere, threadsNeeded);

    const pid =
      extraArg == null
        ? ns.exec(script, h.host, allocate, target, delay)
        : ns.exec(script, h.host, allocate, target, delay, extraArg);

    if (pid !== 0) {
      h.freeRam -= allocate * ramPerThread;
      threadsNeeded -= allocate;
      launched += allocate;
    }
  }

  return launched;
}

// ------------------------------------------------
// STATUS HELPERS
// ------------------------------------------------
function printTargetStatus(ns, target) {
  const money = ns.getServerMoneyAvailable(target);
  const max = ns.getServerMaxMoney(target);
  const sec = ns.getServerSecurityLevel(target);
  const minSec = ns.getServerMinSecurityLevel(target);

  const moneyPct = max > 0 ? (money / max) * 100 : 0;
  const secDelta = sec - minSec;

  const now = new Date();
  const ts = now.toLocaleTimeString();

  ns.print("--------------------------------------");
  ns.print(`TARGET STATUS - ${target} @ ${ts}`);
  ns.print(`Money:       ${ns.nFormat(money, "$0.00a")} / ${ns.nFormat(max, "$0.00a")} (${moneyPct.toFixed(2)}%)`);
  ns.print(`Security:    ${sec.toFixed(2)} (min ${minSec.toFixed(2)})  delta=${secDelta.toFixed(2)}`);
  ns.print("--------------------------------------");
}

function clampInt(value, min, max) {
  const v = Math.floor(Number(value) || 0);
  return Math.min(max, Math.max(min, v));
}

