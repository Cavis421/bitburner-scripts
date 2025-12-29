/** @param {NS} ns */
/*
 * lib/augs-controller.js
 *
 * Description
 *  Controller lane wrapper for purchase-only augmentation automation.
 *   - Runs purchaseAugs() on an interval
 *   - Terminal output only when purchases happen (msgs[])
 *   - “Next targets” go to ns.print (tail log)
 *
 * Phase policy (your requested behavior):
 *  - Pre-gang: combat aug focus (aggressive)
 *  - Post-gang: switch to hacking/rep allowlist (Hacking Augs.txt)
 *      - Slow purchases to avoid sabotaging corp creation bankroll
 *      - Keep $150b reserved until corp exists
 *  - Post-corp: reserve mirrors corp-lane governor (reserveFunds + maxSpendFracPerCycle)
 *  - NFG cadence:
 *      - Once installed augs >= 20:
 *          After any non-NFG purchase, next two purchases must be NFG
 *          (strict: if NFG isn’t buyable/affordable, skip instead of buying other augs)
 *
 * Notes
 *  - Import-only; not intended to be run directly.
 */

import {
  purchaseAugs,
  AUG_DEFAULTS,
  HACKING_AUG_ALLOWLIST,
  COMBAT_AUG_PREFER,
  getOwnedAndPurchasedAugs,
} from "lib/augmentations.js";

import { fmtMoney } from "lib/format.js";
import { inGang } from "lib/gang.js";
import { CORP_LANE_DEFAULTS } from "lib/corp-lane.js";

const CORP_CREATION_RESERVE = 150_000_000_000;

// Small convenience
function hasCorp(ns) {
  const c = ns.corporation;
  if (!c || typeof c.hasCorporation !== "function") return false;
  try { return Boolean(c.hasCorporation()); } catch { return false; }
}

function getInstalledAugCount(ns) {
  try {
    // installed only
    return (ns.singularity.getOwnedAugmentations(false) || []).length;
  } catch {
    return 0;
  }
}

export function runAugmentationTick(ns, state, msgs) {
  // state is owned by controller, but this lane defines expected keys:
  // {
  //   lastCheck:number,
  //   lastNextBrief:string,
  //   nfgDebt:number
  // }
  if (!state) return;

  if (state.nfgDebt === undefined) state.nfgDebt = 0;

  const now = Date.now();
  const last = Number(state.lastCheck || 0);
  if (now - last < AUG_DEFAULTS.checkIntervalMs) return;
  state.lastCheck = now;

  const gang = inGang(ns);
  const corp = hasCorp(ns);

  const installedAugs = getInstalledAugCount(ns);
  const nfgModeActive = installedAugs >= 20;

  // ------------------------------------------------------------
  // 1) Build policy for this tick
  // ------------------------------------------------------------

  // If we owe NFG purchases, we go strict: ONLY attempt NFG.
  // (This guarantees your “next two purchases should be NFG” rule.)
  let opts = { ...AUG_DEFAULTS };

  if (nfgModeActive && state.nfgDebt > 0) {
    opts = {
      ...opts,
      buyNeuroFlux: true,
      preferDesiredOnly: true,
      desiredNames: new Set(["NeuroFlux Governor"]),
      desiredMode: "hacking",
      maxPurchasesPerCheck: 1, // one NFG per interval to reduce “spend shock”
    };
  } else if (!gang) {
    // Pre-gang: combat focus
    opts = {
      ...opts,
      buyNeuroFlux: false,
      preferDesiredOnly: false, // allow keyword matches too (combat mode)
      desiredNames: COMBAT_AUG_PREFER,
      desiredMode: "combat",
      maxPurchasesPerCheck: opts.maxPurchasesPerCheck,
    };
  } else {
    // Post-gang: hacking/rep allowlist (your txt)
    opts = {
      ...opts,
      buyNeuroFlux: false,
      preferDesiredOnly: true, // strict allowlist so you don’t drift into random combat augs
      desiredNames: HACKING_AUG_ALLOWLIST,
      desiredMode: "hacking",
      maxPurchasesPerCheck: 1, // slow down after gang as requested
    };

    // Pre-corp: dynamic spending based on progression (installed augmentations).
    // Goal: early/mid-game can buy hacking augs to accelerate income,
    // while still preventing runaway “spend shock” before corp exists.
    if (!corp) {
      const a = Number(installedAugs || 0);

      // More aggressive early, tighter later.
      // Tune these thresholds later if you want; this is intentionally simple.
      let cap = 0.20;
      if (a < 5) cap = 0.50;
      else if (a < 10) cap = 0.35;
      else if (a < 15) cap = 0.25;
      else cap = 0.20;

      // Use existing reserve mechanics (no new system, no redesign)
      opts.spendFracCap = cap;

      // Keep a safety cash floor (defaults already include minReserve=1e9, but make it explicit)
      opts.minReserve = Math.max(Number(opts.minReserve || 0), 1e9);

      // IMPORTANT: remove the $150b hard block
      opts.hardReserve = 0;
    } else {
      // Post-corp: mirror corp-lane spend governor (your requested option C)
      // Apply corp-lane reserveFunds and maxSpendFracPerCycle to PLAYER aug spending.
      opts.minReserve = Math.max(Number(opts.minReserve), Number(CORP_LANE_DEFAULTS.reserveFunds || 0));
      opts.spendFracCap = Number(CORP_LANE_DEFAULTS.maxSpendFracPerCycle || 0.20);
    }
  }
  // ------------------------------------------------------------
  // 2) Run purchase pass
  // ------------------------------------------------------------

  const beforeOwned = getOwnedAndPurchasedAugs(ns);

  const res = purchaseAugs(ns, opts);

  // Reserve hint for other lanes (home upgrades, etc.)
  state.reserveHint = computeAugReserveHint(res.nextTargets);

  if (!res.ok) {
    ns.print(`[augs] skip: ok=false reason=${res.reason ?? "unknown"}`);
    return;
  }

  // Script log: “next targets”
  const brief = formatAugTargetsBrief(res.nextTargets, 3);
  if (brief) {
    ns.print(`[augs] next: ${brief}`);
    state.lastNextBrief = brief;
  }

  // Terminal: only when purchases happen
  if (res.purchased?.length) {
    for (const p of res.purchased) {
      msgs.push(`[augs] bought ${p.name} @ ${p.faction} for ${fmtMoney(ns, p.price)}`);
    }
  }

  // ------------------------------------------------------------
  // 3) Update NFG debt state (strict cadence)
  // ------------------------------------------------------------

  if (!nfgModeActive) return;
  if (!res.purchased?.length) return;

  // Determine what we bought this pass (names only)
  const boughtNames = new Set(res.purchased.map(x => x?.name).filter(Boolean));

  if (boughtNames.has("NeuroFlux Governor")) {
    // Paying down debt
    if (state.nfgDebt > 0) state.nfgDebt = Math.max(0, Number(state.nfgDebt) - 1);
    return;
  }

  // If we bought ANY non-NFG aug, set debt to 2 (your exact rule)
  // (We don’t stack debt; we enforce “next two” after each non-NFG purchase.)
  state.nfgDebt = 2;

  // Defensive: if somehow NFG was purchased but name mismatch, ignore
  // (we handled the common case above)
  void beforeOwned;
}

function formatAugTargetsBrief(nextTargets, max = 3) {
  const list = (nextTargets || []).slice(0, Math.max(0, max));
  if (!list.length) return "";

  return list.map(t => {
    const tag = t.desired ? "[D]" : "[ ]";
    const repNeed = Math.ceil(Number(t.repNeeded ?? 0));
    return `${tag} ${t.name} @ ${t.faction} repNeed=${repNeed}`;
  }).join(" | ");
}

function computeAugReserveHint(nextTargets) {
  const list = nextTargets || [];
  const desired = list.filter(t => t && t.desired);
  const pick = (desired.length ? desired : list)[0];
  if (!pick) return 0;

  const price = Number(pick.price || 0);
  if (!Number.isFinite(price) || price <= 0) return 0;

  return Math.ceil(price * 1.10);
}
