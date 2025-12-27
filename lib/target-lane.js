/** @param {NS} ns */
/*
 * lib/target-lane.js
 *
 * Description
 *  Target selection + retarget policy for the controller.
 *   - Computes primary â€œbatchâ€ target and secondary HGW target
 *   - Optionally re-scores on an interval when cfg.retarget=true
 *   - Optionally restarts managed scripts on target change (safe killScripts set)
 *
 * Notes
 *  - This module is policy/orchestration for targeting, not the scoring implementation.
 *  - Scoring is delegated to lib/targets.js.
 *  - Designed to be called from /bin/controller.js once per tick.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

import { choosePrimaryTarget, chooseXpTarget, chooseSecondaryTarget } from "lib/targets.js";
import { killScripts } from "lib/orchestrator.js";

/**
 * Initialize targets once at startup.
 * @param {NS} ns
 * @param {object} cfg
 * @param {boolean} verbose
 * @returns {{primaryTarget:string, hgwTarget:string, lastTargetCompute:number, msgs:string[]}}
 */
export function initTargets(ns, cfg, verbose = true) {
  const { primaryTarget, hgwTarget, lastTargetCompute } = computeTargets(ns, cfg, verbose);
  const msgs = [];
  if (verbose) msgs.push(`[target] init: batch=${primaryTarget} hgw=${hgwTarget} (${cfg.hgwMode})`);
  return { primaryTarget, hgwTarget, lastTargetCompute, msgs };
}

/**
 * Run one tick of retargeting logic. Returns updated targets + any terminal-facing messages.
 * @param {NS} ns
 * @param {object} cfg
 * @param {{primaryTarget:string, hgwTarget:string, lastTargetCompute:number}} state
 * @returns {{primaryTarget:string, hgwTarget:string, lastTargetCompute:number, msgs:string[]}}
 */
export function runTargetingTick(ns, cfg, state) {
  let { primaryTarget, hgwTarget, lastTargetCompute } = state;
  const msgs = [];

  // If user overrides batch target, we never retarget.
  if (cfg.batchTargetOverride) {
    return { primaryTarget: cfg.batchTargetOverride, hgwTarget: cfg.batchTargetOverride, lastTargetCompute, msgs };
  }

  if (!cfg.retarget) {
    return { primaryTarget, hgwTarget, lastTargetCompute, msgs };
  }

  const due = (Date.now() - lastTargetCompute) >= cfg.retargetEvery;
  if (!due) return { primaryTarget, hgwTarget, lastTargetCompute, msgs };

  const prevPrimary = primaryTarget;
  const prevHGW = hgwTarget;

  ({ primaryTarget, hgwTarget, lastTargetCompute } = computeTargets(ns, cfg, cfg.scoringVerbose));

  const changed = (primaryTarget !== prevPrimary) || (hgwTarget !== prevHGW);
  if (!changed) return { primaryTarget, hgwTarget, lastTargetCompute, msgs };

  msgs.push(`[target] updated: batch=${primaryTarget} hgw=${hgwTarget} (${cfg.hgwMode})`);

  if (cfg.restartOnRetarget) {
    // Only restart managed scripts (safe). Controller stays alive.
    const managed = new Set([cfg.batcher, cfg.botnet]);
    const res = killScripts(ns, "home", managed);
    msgs.push(`[retarget] restarted managed scripts: killed=${res.killed}/${res.attempted}`);
  }

  return { primaryTarget, hgwTarget, lastTargetCompute, msgs };
}

// ------------------------------------------------------------
// Internal: computes targets using lib/targets.js
// ------------------------------------------------------------

function computeTargets(ns, cfg, verbose) {
  const now = Date.now();

  // Batch target override
  if (cfg.batchTargetOverride) {
    const primaryTarget = cfg.batchTargetOverride;
    const hgwTarget = primaryTarget;
    if (verbose) ns.tprint(`[target] override: batch=${primaryTarget}, hgw=${hgwTarget} (${cfg.hgwMode})`);
    return { primaryTarget, hgwTarget, lastTargetCompute: now };
  }

  const { target: primaryTarget } = choosePrimaryTarget(ns, { verbose });

  let hgwTarget;
  if (cfg.hgwMode === "xp") {
    hgwTarget = chooseXpTarget(ns, primaryTarget, { verbose });
  } else {
    hgwTarget = chooseSecondaryTarget(ns, primaryTarget, { verbose });
  }

  return { primaryTarget, hgwTarget, lastTargetCompute: now };
}
