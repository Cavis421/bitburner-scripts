/**
 * bin/controller.js
 *
 * Description
 *  Single controller daemon that checks free RAM and starts required daemons when affordable.
 *  Uses lib/targets.js for target selection and lib/rooting.js for race-free rooting.
 *  Uses Singularity for TOR/Darkweb/WSE/invite automation, plus purchase-only augmentation automation.
 *  Includes optional player automation (default ON): crime->gang->faction work.
 *  Sets a pserv purchase policy: cap at 2048 until (Formulas.exe + WSE+TIX+4S).
 *
 *  Corp handling:
 *   - Temporarily disabled (corp rewrite planned).
 *
 * Syntax
 *  run bin/controller.js
 *  run bin/controller.js --tick 5000 --reserveRam 64 --hgwMode xp
 *  run bin/controller.js --retarget true --restartOnRetarget true
 *  run bin/controller.js --player false
 *  run bin/controller.js --help
 */

/** @param {NS} ns */

import { rootAllPossible, waitForRootCoverage } from "/lib/rooting.js";
import { initTargets, runTargetingTick } from "/lib/target-lane.js";
import { maybeCreateGang } from "/lib/gang.js";
import { fmtTime } from "/lib/format.js";
import { getCurrentWorkSafe } from "/lib/player.js";
import { runHybridPlayerTick, PLAYER_POLICY_DEFAULTS } from "/lib/player-policy.js";
import { runDaemonLane } from "/lib/daemon-lane.js";
import { runAugmentationTick } from "/lib/augs-controller.js";
import { runSingularityTick } from "/lib/singularity-lane.js";
import { formatWorkBrief, ensureDaedalusFactionWork } from "/lib/work.js"; // NEW: Daedalus override helper
import { flushLog } from "/lib/logging.js";
import { runHacknetTick } from "/lib/hacknet-lane.js";
import { runHomeUpgradesTick } from "/lib/home-upgrades-lane.js";

// bbOS service config integration
import { getServiceRegistry } from "/lib/os/service-registry.js";
import {
  DEFAULT_SERVICE_CONFIG_PATH,
  loadServiceConfig,
  getEffectiveEnabledMap,
} from "/lib/os/service-config.js";

const FLAGS = [
  ["help", false],

  // Loop / RAM policy
  ["tick", 15000],
  ["reserveRam", 64],          // keep this much RAM free on home
  ["logMode", "changes"],      // changes | always | silent

  // Targeting
  ["hgwMode", "money"],        // money | xp
  ["batchTarget", ""],         // optional override (skip scoring)
  ["retarget", false],         // periodically re-score targets
  ["retargetEvery", 15 * 60 * 1000], // ms between re-score when --retarget true
  ["scoringVerbose", false],   // print scoring tables when retargeting

  // (Optional) restart managed daemons on retarget
  ["restartOnRetarget", false], // if true, will restart batcher/botnet when targets change

  // Must-have scripts (your list)
  ["batcher", "bin/timed-net-batcher2.js"],
  ["botnet", "bin/botnet-hgw-sync.js"],
  ["pserv", "bin/pserv-manager.js"],
  ["trader", "bin/basic-trader.js"],
  ["gangManager", "bin/gang-manager.js"],
  ["bladeburnerManager", "/bin/bladeburner-manager.js"],
  ["intTrainer", "bin/intelligence-trainer.js"],


  // Helper scripts you already have
  ["darkwebBuyer", "bin/darkweb-auto-buyer.js"],

  // bbOS service enablement integration
  ["services", true], // if true: read os-services config and compute enabled map
  ["servicesFile", DEFAULT_SERVICE_CONFIG_PATH],
  ["servicesVerbose", false], // if true: log effective enablement map changes

  // Singularity automation toggles
  ["autoTor", true],
  ["autoDarkweb", true],
  ["autoWse", true],
  ["autoInvites", true],
  ["autoGangCreate", true],

  // Gang creation preferences
  ["gangFaction", ""], // optional preferred faction

  // Rooting behavior
  ["rootPass", true],          // attempt rootAllPossible every tick
  ["rootCoverageWait", false], // if true, waitForRootCoverage each tick (more expensive)
  ["rootCoverageTimeout", 20000],
  ["rootCoveragePoll", 500],

  // Player automation
  ["player", true],            // default ON; set --player false to disable

  // Scheduled jobs (one-shots run periodically)
  ["jobs", true],
  ["jobIntervalMs", 600_000], // 10 minutes
  ["backdoorJob", "bin/backdoor-oneshot.js"],
  ["contractsJob", "bin/contracts-find-and-solve.js"],

  // Corp daemon
  //["corp", true],              // enable starting corp daemon when corp exists
  //["corpDaemon", "DISABLED:corp-daemon.js"], // script to run when corp exists
];

const PLAYER_DEFAULTS = PLAYER_POLICY_DEFAULTS;

export async function main(ns) {
  const flags = ns.flags(FLAGS);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  const cfg = {
    tick: Math.max(1000, Number(flags.tick) || 15000),
    reserveRam: Math.max(0, Number(flags.reserveRam) || 0),
    logMode: String(flags.logMode || "changes"),

    hgwMode: String(flags.hgwMode || "money").toLowerCase(),
    batchTargetOverride: String(flags.batchTarget || "").trim(),
    retarget: !!flags.retarget,
    retargetEvery: Math.max(30_000, Number(flags.retargetEvery) || 15 * 60 * 1000),
    scoringVerbose: !!flags.scoringVerbose,
    restartOnRetarget: !!flags.restartOnRetarget,

    batcher: String(flags.batcher),
    botnet: String(flags.botnet),
    pserv: String(flags.pserv),
    trader: String(flags.trader),
    gangManager: String(flags.gangManager),
    bladeburnerManager: String(flags.bladeburnerManager),
    intTrainer: String(flags.intTrainer),
    darkwebBuyer: String(flags.darkwebBuyer),


    // bbOS service enablement
    services: !!flags.services,
    servicesFile: String(flags.servicesFile || DEFAULT_SERVICE_CONFIG_PATH),
    servicesVerbose: !!flags.servicesVerbose,
    servicesEnabled: null, // filled by applyServiceEnablement()

    autoTor: !!flags.autoTor,
    autoDarkweb: !!flags.autoDarkweb,
    autoWse: !!flags.autoWse,
    autoInvites: !!flags.autoInvites,
    autoGangCreate: !!flags.autoGangCreate,

    gangFaction: String(flags.gangFaction || "").trim(),

    rootPass: !!flags.rootPass,
    rootCoverageWait: !!flags.rootCoverageWait,
    rootCoverageTimeout: Math.max(1000, Number(flags.rootCoverageTimeout) || 20000),
    rootCoveragePoll: Math.max(100, Number(flags.rootCoveragePoll) || 500),

    player: !!flags.player,

    // args for pserv manager (daemon-lane should pass these to ensureDaemon)
    pservArgs: [],

    // Scheduled jobs config
    jobs: !!flags.jobs,
    jobIntervalMs: Math.max(30_000, Number(flags.jobIntervalMs) || 600_000),
    backdoorJob: String(flags.backdoorJob || "bin/backdoor-oneshot.js"),
    contractsJob: String(flags.contractsJob || "bin/contracts-find-and-solve.js"),
  };

  // Target state (so we can avoid unnecessary restarts)
  let primaryTarget = cfg.batchTargetOverride || "n00dles";
  let hgwTarget = primaryTarget;
  let lastTargetCompute = 0;

  // Change-only log suppression memory (terminal)
  let lastMsgs = new Set();

  // Aug lane state (owned by augs-controller)
  const augState = { lastCheck: 0, lastNextBrief: "" };

  // Hacknet lane state (owned by hacknet-lane)
  const hacknetState = { lastTick: 0, lastHashTick: 0 };

  // Home Upgrade lane state
  const homeUpgradesState = {};

  // Shared lane hints
  const shared = { augReserveHint: 0 };

  // pserv policy memory (so we only log changes)
  const pservPolicyState = {
    lastMode: "", // "cap" | "lift"
  };

  // Scheduled jobs state (timestamps + throttled warnings)
  const jobState = {};

  // bbOS services enablement memory (anti-spam)
  const servicesState = {
    lastSig: "",
  };

  // Compute enablement once at startup
  applyServiceEnablement(ns, cfg, servicesState, /*msgs*/ null);

  // Initial target selection (unless overridden)
  {
    const init = initTargets(ns, cfg, true);
    primaryTarget = init.primaryTarget;
    hgwTarget = init.hgwTarget;
    lastTargetCompute = init.lastTargetCompute;
  }

  while (true) {
    const msgs = [];
    const tickStart = Date.now();

    // Refresh enablement (cheap; logs only on change)
    applyServiceEnablement(ns, cfg, servicesState, msgs);

    // Scheduled jobs (one-shots that run periodically)
    applyScheduledJobs(ns, cfg, jobState, msgs);

    // ---------------------------------------------------------------------
    // 1) Rooting pass (prevents deploy races)
    // ---------------------------------------------------------------------
    if (cfg.rootPass) {
      const before = rootAllPossible(ns);
      if (before.attempted > 0) {
        msgs.push(`[root] rooted=${before.rooted}/${before.attempted} newly-rootable targets (attempted)`);
      }
    }

    if (cfg.rootCoverageWait) {
      const ok = await waitForRootCoverage(ns, { timeoutMs: cfg.rootCoverageTimeout, pollMs: cfg.rootCoveragePoll });
      if (!ok) msgs.push("[root] WARN: coverage not complete within timeout (continuing)");
    }

    // ---------------------------------------------------------------------
    // 2) Target selection / retarget
    // ---------------------------------------------------------------------
    if (!cfg.batchTargetOverride && cfg.retarget) {
      const res = runTargetingTick(ns, cfg, { primaryTarget, hgwTarget, lastTargetCompute });
      primaryTarget = res.primaryTarget;
      hgwTarget = res.hgwTarget;
      lastTargetCompute = res.lastTargetCompute;
      msgs.push(...(res.msgs || []));
    }

    // ---------------------------------------------------------------------
    // 3) Singularity automation (non-blocking)
    // ---------------------------------------------------------------------
    runSingularityTick(ns, cfg, msgs);

    // ---------------------------------------------------------------------
    // 3b) Aug automation (purchase-only)
    // ---------------------------------------------------------------------
    runAugmentationTick(ns, augState, msgs);
    shared.augReserveHint = Number(augState.reserveHint || 0);

    // ---------------------------------------------------------------------
    // 4) Gang readiness + creation
    // ---------------------------------------------------------------------
    if (cfg.autoGangCreate) {
      const r = maybeCreateGang(ns, { preferredFaction: cfg.gangFaction });
      if (r.changed) msgs.push(`[gang] created: ${r.faction}`);
    }

    // ---------------------------------------------------------------------
    // 5) Player lane (hybrid) - default ON, can disable with --player false
    // ---------------------------------------------------------------------
    if (cfg.player) {
      msgs.push(...runHybridPlayerTick(ns, PLAYER_DEFAULTS));
    }

    // ---------------------------------------------------------------------
    // 5b) Hard override: if you're in Daedalus, always earn Daedalus rep
    // ---------------------------------------------------------------------
    {
      const res = ensureDaedalusFactionWork(ns, {
        focus: false,
        verbose: false,
      });

      if (res.didSwitch) {
        msgs.push("[work] switched faction work to Daedalus (override)");
      }
    }

    // ---------------------------------------------------------------------
    // 6) Hacknet lane (upgrades, hashes)
    // ---------------------------------------------------------------------
    runHacknetTick(ns, cfg, hacknetState, msgs);

    // ---------------------------------------------------------------------
    // 6.5) pserv policy (sets cfg.pservArgs)
    // ---------------------------------------------------------------------
    applyPservPolicy(ns, cfg, pservPolicyState, msgs);

    // ---------------------------------------------------------------------
    // 7) Ensure must-have daemons (RAM-gated)
    // ---------------------------------------------------------------------
    runDaemonLane(ns, cfg, { primary: primaryTarget, hgw: hgwTarget }, msgs);

    // ---------------------------------------------------------------------
    // 9) Home Upgrades Lane
    // ---------------------------------------------------------------------
    runHomeUpgradesTick(ns, cfg, homeUpgradesState, msgs, shared);

    // ---------------------------------------------------------------------
    // Telemetry to script log (not terminal)
    // ---------------------------------------------------------------------
    const tickMs = Date.now() - tickStart;
    const w = getCurrentWorkSafe(ns);
    ns.print(
      `[tick] ${fmtTime(tickMs)} | batch=${primaryTarget} hgw=${hgwTarget} (${cfg.hgwMode}) | ` +
      `work=${formatWorkBrief(w)}`
    );

    flushLog(ns, cfg.logMode, msgs, lastMsgs);
    lastMsgs = new Set(msgs.filter(Boolean));

    await ns.sleep(cfg.tick);
  }
}

// ------------------------------------------------------------
// bbOS service enablement integration
// ------------------------------------------------------------
function applyServiceEnablement(ns, cfg, state, msgsOrNull) {
  if (!cfg.services) {
    cfg.servicesEnabled = null;
    return;
  }

  const registry = getServiceRegistry();
  const file = String(cfg.servicesFile || DEFAULT_SERVICE_CONFIG_PATH);

  const conf = loadServiceConfig(ns, file);
  const effective = getEffectiveEnabledMap(registry, conf);

  // Keys lanes care about (daemon-lane + jobs)
  cfg.servicesEnabled = {
    batcher: !!effective.batcher,
    botnet: !!effective.botnet,
    pserv: !!effective.pserv,
    trader: !!effective.trader,
    gangManager: !!effective.gangManager,
    intTrainer: !!effective.intTrainer,
    darkwebBuyer: !!effective.darkwebBuyer,
    bladeburnerManager: !!effective.bladeburnerManager, // NEW
    backdoorJob: !!effective.backdoorJob,
    contractsJob: !!effective.contractsJob,
  };

  if (!cfg.servicesVerbose) return;

  const sig = [
    `batcher=${cfg.servicesEnabled.batcher ? "1" : "0"}`,
    `botnet=${cfg.servicesEnabled.botnet ? "1" : "0"}`,
    `pserv=${cfg.servicesEnabled.pserv ? "1" : "0"}`,
    `trader=${cfg.servicesEnabled.trader ? "1" : "0"}`,
    `gangManager=${cfg.servicesEnabled.gangManager ? "1" : "0"}`,
    `intTrainer=${cfg.servicesEnabled.intTrainer ? "1" : "0"}`,
    `bladeburnerManager=${cfg.servicesEnabled.bladeburnerManager ? "1" : "0"}`,
    `darkwebBuyer=${cfg.servicesEnabled.darkwebBuyer ? "1" : "0"}`,
    `backdoorJob=${cfg.servicesEnabled.backdoorJob ? "1" : "0"}`,
    `contractsJob=${cfg.servicesEnabled.contractsJob ? "1" : "0"}`,
  ].join("|");

  if (sig !== (state.lastSig || "")) {
    state.lastSig = sig;
    const msg =
      `[os] services (${file}): ` +
      `batcher=${cfg.servicesEnabled.batcher ? "ON" : "OFF"} ` +
      `botnet=${cfg.servicesEnabled.botnet ? "ON" : "OFF"} ` +
      `pserv=${cfg.servicesEnabled.pserv ? "ON" : "OFF"} ` +
      `trader=${cfg.servicesEnabled.trader ? "ON" : "OFF"} ` +
      `gangManager=${cfg.servicesEnabled.gangManager ? "ON" : "OFF"} ` +
      `bladeburnerManager=${cfg.servicesEnabled.bladeburnerManager ? "ON" : "OFF"} ` +
      `intTrainer=${cfg.servicesEnabled.intTrainer ? "ON" : "OFF"} ` +
      `darkwebBuyer=${cfg.servicesEnabled.darkwebBuyer ? "ON" : "OFF"} ` +
      `backdoorJob=${cfg.servicesEnabled.backdoorJob ? "ON" : "OFF"} ` +
      `contractsJob=${cfg.servicesEnabled.contractsJob ? "ON" : "OFF"}`;
    if (Array.isArray(msgsOrNull)) msgsOrNull.push(msg);
    else ns.tprint(msg);
  }
}

// ------------------------------------------------------------
// pserv policy helper (NO restarts here; we just set cfg.pservArgs)
// ------------------------------------------------------------
function applyPservPolicy(ns, cfg, state, msgs) {
  const hasFormulas = ns.fileExists("Formulas.exe", "home");

  const stock = ns.stock;
  const hasWSE = safeBool(() => stock?.hasWSEAccount?.(), false);
  const hasTIX = safeBool(() => stock?.hasTIXAPIAccess?.(), false);
  const has4SData = safeBool(() => stock?.has4SData?.(), false);
  const has4STix = safeBool(() => stock?.has4SDataTIXAPI?.(), false);

  const wseComplete = hasWSE && hasTIX && has4SData && has4STix;
  const shouldCap = (!hasFormulas || !wseComplete);

  cfg.pservArgs = shouldCap ? ["--maxRam", "2048"] : [];

  const mode = shouldCap ? "cap" : "lift";
  if (state.lastMode !== mode) {
    state.lastMode = mode;
    if (shouldCap) {
      msgs.push("[pserv] policy: cap pserv maxRam at 2048 until (Formulas.exe + WSE/TIX/4S)");
    } else {
      msgs.push("[pserv] policy: lift pserv cap (Formulas.exe + WSE/TIX/4S owned)");
    }
  }
}

function safeNum(fn, fallback) {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function safeBool(fn, fallback) {
  try { return Boolean(fn()); } catch { return fallback; }
}

// ------------------------------------------------------------
// Scheduled jobs (run one-shots periodically)
// ------------------------------------------------------------
function applyScheduledJobs(ns, cfg, state, msgs) {
  if (!cfg.jobs) return;

  const enabled = cfg.servicesEnabled || null;
  const isEnabled = (key) => {
    if (!enabled) return true;
    if (!Object.prototype.hasOwnProperty.call(enabled, key)) return true;
    return !!enabled[key];
  };

  const interval = Math.max(30_000, Number(cfg.jobIntervalMs) || 600_000);

  if (isEnabled("backdoorJob")) {
    runJob(ns, cfg, state, msgs, {
      key: "backdoor",
      script: cfg.backdoorJob,
      intervalMs: interval,
      threads: 1,
      args: [],
    });
  }

  if (isEnabled("contractsJob")) {
    runJob(ns, cfg, state, msgs, {
      key: "contracts",
      script: cfg.contractsJob,
      intervalMs: interval,
      threads: 1,
      args: [],
    });
  }
}

function runJob(ns, cfg, state, msgs, job) {
  const script = String(job.script || "").trim();
  if (!script) return;

  const lastKey = `jobLast_${job.key}`;
  const warnKey = `jobWarn_${job.key}`;
  const now = Date.now();
  const last = Number(state[lastKey] || 0);

  if (safeBool(() => ns.isRunning(script, "home"), false)) return;

  if (!safeBool(() => ns.fileExists(script, "home"), false)) {
    if (now - Number(state[warnKey] || 0) > 60_000) {
      state[warnKey] = now;
      msgs.push(`[job:${job.key}] WARN: missing ${script} on home`);
    }
    return;
  }

  if (now - last < job.intervalMs) return;

  const need = safeNum(() => ns.getScriptRam(script, "home"), Infinity) * Math.max(1, Math.floor(job.threads || 1));
  const max = safeNum(() => ns.getServerMaxRam("home"), 0);
  const used = safeNum(() => ns.getServerUsedRam("home"), 0);
  const free = Math.max(0, max - used);
  const avail = free - (Number(cfg.reserveRam || 0));

  if (!Number.isFinite(need) || need <= 0) return;

  if (avail < need) {
    if (now - Number(state[warnKey] || 0) > 60_000) {
      state[warnKey] = now;
      msgs.push(`[job:${job.key}] waiting for RAM to start ${script} (need=${need.toFixed(2)}GB avail=${avail.toFixed(2)}GB reserve=${Number(cfg.reserveRam || 0)}GB)`);
    }
    return;
  }

  const t = Math.max(1, Math.floor(job.threads || 1));
  const args = Array.isArray(job.args) ? job.args : [];

  const pid = safeNum(() => ns.run(script, t, ...args), 0);
  if (pid > 0) {
    state[lastKey] = now;
    msgs.push(`[job:${job.key}] started ${script} (pid=${pid})`);
  } else {
    if (now - Number(state[warnKey] || 0) > 60_000) {
      state[warnKey] = now;
      msgs.push(`[job:${job.key}] WARN: failed to start ${script} (ns.run returned ${pid})`);
    }
  }
}

// ------------------------------------------------------------
// Logging / Help
// ------------------------------------------------------------
function printHelp(ns) {
  ns.tprint("bin/controller.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Single controller daemon that checks free RAM and starts required daemons when affordable.");
  ns.tprint("  Uses lib/targets.js for target selection and lib/rooting.js for race-free rooting.");
  ns.tprint("  Uses Singularity for TOR/Darkweb/WSE/invite automation, plus purchase-only augmentation automation.");
  ns.tprint("  Includes optional player automation (default ON): crime->gang->faction work.");
  ns.tprint("  Sets a pserv purchase policy: cap at 2048 until (Formulas.exe + WSE+TIX+4S).");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --tick <ms>               Loop cadence (default 15000)");
  ns.tprint("  --reserveRam <gb>         Keep this much RAM free on home (default 64)");
  ns.tprint("  --logMode changes|always|silent");
  ns.tprint("  --hgwMode money|xp");
  ns.tprint("  --batchTarget <host>      Override target selection");
  ns.tprint("  --retarget true|false     Periodically re-score targets");
  ns.tprint("  --retargetEvery <ms>");
  ns.tprint("  --restartOnRetarget true|false");
  ns.tprint("  --player true|false");
  ns.tprint("  --jobs true|false         Enable scheduled jobs (default true)");
  ns.tprint("  --jobIntervalMs <ms>      Interval for scheduled jobs (default 600000)");
  ns.tprint("  --backdoorJob <path>      Backdoor job script (default bin/backdoor-oneshot.js)");
  ns.tprint("  --contractsJob <path>     Contracts job script (default bin/contracts-find-and-solve.js)");
  ns.tprint("  --intTrainer <path>      Intelligence trainer daemon (default bin/intelligence-trainer.js)");
  ns.tprint("");
  ns.tprint("bbOS Services");
  ns.tprint("  --services true|false         Enable service config gating (default true)");
  ns.tprint("  --servicesFile <path>         Service config file path (default data/os-services.json)");
  ns.tprint("  --servicesVerbose true|false  Log enablement changes (default false)");
  ns.tprint("");
  ns.tprint("Examples");
  ns.tprint("  run bin/controller.js");
  ns.tprint("  run bin/controller.js --tick 5000 --reserveRam 64");
  ns.tprint("  run bin/controller.js --servicesVerbose true");
}
