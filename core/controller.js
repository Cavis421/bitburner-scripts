/** @param {NS} ns */
/*
 * core/controller.js
 *
 * Description
 *  Single “brain” daemon that:
 *    - Picks targets (money + HGW XP/money) using lib/targets.js
 *    - Roots all currently-rootable servers (race-free) using lib/rooting.js
 *    - Checks free RAM on home and starts required daemons only when affordable (lib/orchestrator.js via lib/daemon-lane.js)
 *    - Uses Singularity (BN4/SF4+) to auto-buy TOR, Dark Web programs, and WSE/TIX/4S (lib/singularity-lane.js)
 *    - Creates a gang as soon as possible and starts gang/gang-manager.js (lib/gang.js + lib/daemon-lane.js)
 *    - Optional player automation (default ON): hybrid crime -> gang -> faction rep (lib/player-policy.js)
 *    - Purchase-only augmentation automation (lib/augs-controller.js): buys when possible, no installs/resets
 *
 * Notes
 *  - Intended to replace core/startup-home-advanced.js as your “one script you run”.
 *  - Does NOT kill other processes by default; it only “ensures” required daemons exist.
 *  - Adds a pserv policy by setting cfg.pservArgs:
 *      - caps pserv maxRam at 2048 until you have BOTH:
 *          - Formulas.exe
 *          - WSE + TIX + 4S Data + 4S TIX
 *
 * IMPORTANT
 *  - For this to actually apply, lib/daemon-lane.js must pass cfg.pservArgs into ensureDaemon() for pserv.
 *    (One small change there—ask if you want me to paste the drop-in.)
 *
 * Syntax
 *  run core/controller.js
 *  run core/controller.js --tick 5000 --reserveRam 64 --hgwMode xp
 *  run core/controller.js --retarget true --restartOnRetarget true
 *  run core/controller.js --player false
 *  run core/controller.js --help
 */

import { rootAllPossible, waitForRootCoverage } from "lib/rooting.js";
import { initTargets, runTargetingTick } from "lib/target-lane.js";
import { maybeCreateGang } from "lib/gang.js";
import { fmtTime } from "lib/format.js";
import { getCurrentWorkSafe } from "lib/player.js";
import { runHybridPlayerTick, PLAYER_POLICY_DEFAULTS } from "lib/player-policy.js";
import { runDaemonLane } from "lib/daemon-lane.js";
import { runAugmentationTick } from "lib/augs-controller.js";
import { runSingularityTick } from "lib/singularity-lane.js";
import { formatWorkBrief } from "lib/work.js";
import { flushLog } from "lib/logging.js";
import { runHacknetTick } from "lib/hacknet-lane.js";
import { runCorpTick } from "lib/corp-lane.js";
import { runHomeUpgradesTick } from "lib/home-upgrades-lane.js";

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
  ["batcher", "core/timed-net-batcher2.js"],
  ["botnet", "botnet/botnet-hgw-sync.js"],
  ["pserv",  "pserv/pserv-manager.js"],
  ["trader", "wse/basic-trader.js"],
  ["gangManager", "gang/gang-manager.js"],

  // Helper scripts you already have
  ["darkwebBuyer", "darkweb/darkweb-auto-buyer.js"],

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

    darkwebBuyer: String(flags.darkwebBuyer),

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

    // NEW: args for pserv manager (daemon-lane should pass these to ensureDaemon)
    pservArgs: [],
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

  // Corp lane state
  const corpState = {};

  // Home Upgrade lane state
  const homeUpgradesState = {};

  // Shared lane hints
  const shared = { augReserveHint: 0 };

  // pserv policy memory (so we only log changes)
  const pservPolicyState = {
    lastMode: "", // "cap" | "lift"
  };

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
      msgs.push(...res.msgs);
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
    // 8) Corp lane
    // ---------------------------------------------------------------------
    runCorpTick(ns, cfg, corpState, msgs);

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
// pserv policy helper (NO restarts here; we just set cfg.pservArgs)
// ------------------------------------------------------------

function applyPservPolicy(ns, cfg, state, msgs) {
  // Cap at 2048 until:
  // - Formulas.exe exists, AND
  // - WSE + TIX + 4S Data + 4S TIX all exist
  const hasFormulas = ns.fileExists("Formulas.exe", "home");

  const stock = ns.stock;
  const hasWSE = safeBool(() => stock?.hasWSEAccount?.(), false);
  const hasTIX = safeBool(() => stock?.hasTIXAPIAccess?.(), false);
  const has4SData = safeBool(() => stock?.has4SData?.(), false);
  const has4STix = safeBool(() => stock?.has4SDataTIXAPI?.(), false);

  const wseComplete = hasWSE && hasTIX && has4SData && has4STix;

  const shouldCap = (!hasFormulas || !wseComplete);

  // Update cfg.pservArgs (daemon-lane must pass these to ensureDaemon for pserv)
  cfg.pservArgs = shouldCap ? ["--maxRam", "2048"] : [];

  // One-time log when mode changes
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

function safeBool(fn, fallback) {
  try { return Boolean(fn()); } catch { return fallback; }
}

// ------------------------------------------------------------
// Logging / Help
// ------------------------------------------------------------

function printHelp(ns) {
  ns.tprint("core/controller.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Single controller daemon that checks free RAM and starts required daemons when affordable.");
  ns.tprint("  Uses lib/targets.js for target selection and lib/rooting.js for race-free rooting.");
  ns.tprint("  Uses Singularity for TOR/Darkweb/WSE/invite automation, plus purchase-only augmentation automation.");
  ns.tprint("  Includes optional player automation (default ON): crime->gang->faction work.");
  ns.tprint("  Sets a pserv purchase policy: cap at 2048 until (Formulas.exe + WSE+TIX+4S).");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Designed to replace core/startup-home-advanced.js as the only script you manually run.");
  ns.tprint("  - Does not kill other scripts by default; it only ensures required daemons are running.");
  ns.tprint("  - pserv cap is enforced via cfg.pservArgs (daemon-lane must pass args to ensureDaemon).");
  ns.tprint("  - Tick telemetry is written to the script log (tail) instead of the terminal.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run core/controller.js");
  ns.tprint("  run core/controller.js --tick 5000 --reserveRam 64 --hgwMode xp");
  ns.tprint("  run core/controller.js --retarget true --restartOnRetarget true");
  ns.tprint("  run core/controller.js --player false");
  ns.tprint("  run core/controller.js --help");
}
