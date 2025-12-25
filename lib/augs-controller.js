/** @param {NS} ns */
/*
 * lib/augs-controller.js
 *
 * Description
 *  Controller lane wrapper for purchase-only augmentation automation.
 *   - Runs purchaseAugs() on an interval (default: AUG_DEFAULTS.checkIntervalMs)
 *   - Terminal output only when purchases happen (pushes into msgs[])
 *   - “Next targets” go to ns.print (tail log)
 *
 * Notes
 *  - Calls into lib/augmentations.js (purchase-only logic).
 *  - Import-only; not intended to be run directly.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

import { purchaseAugs, AUG_DEFAULTS } from "lib/augmentations.js";
import { fmtMoney } from "lib/format.js";

export function runAugmentationTick(ns, state, msgs) {
  // state is owned by controller, but this lane defines expected keys:
  // { lastCheck:number, lastNextBrief:string }
  if (!state) return;

  const now = Date.now();
  const last = Number(state.lastCheck || 0);

  if (now - last < AUG_DEFAULTS.checkIntervalMs) return;
  state.lastCheck = now;

  const res = purchaseAugs(ns, AUG_DEFAULTS);

  // Suggest a cash reserve to other lanes (e.g., home upgrades).
  // We treat the next "desired" target as the immediate savings goal.
  state.reserveHint = computeAugReserveHint(res.nextTargets);

  if (!res.ok) {
    ns.print(`[augs] skip: ok=false reason=${res.reason ?? "unknown"}`);
    return;
  }

  // Script log: “next targets” (top few). De-dupe to reduce log spam.
  const brief = formatAugTargetsBrief(res.nextTargets, 3);
  if (brief && brief !== (state.lastNextBrief || "")) {
    ns.print(`[augs] next: ${brief}`);
    state.lastNextBrief = brief;
  } else if (brief) {
    // If you want it every interval regardless, you can remove the de-dupe above.
    ns.print(`[augs] next: ${brief}`);
  }

  // Terminal: only when purchases happen
  if (res.purchased?.length) {
    for (const p of res.purchased) {
      msgs.push(`[augs] bought ${p.name} @ ${p.faction} for ${fmtMoney(ns, p.price)}`);
    }
  }
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
  // Prefer desired items first, then anything.
  const desired = list.filter(t => t && t.desired);
  const pick = (desired.length ? desired : list)[0];
  if (!pick) return 0;

  const price = Number(pick.price || 0);
  if (!Number.isFinite(price) || price <= 0) return 0;

  // Add a small buffer so we don’t buy home RAM and miss the aug by a hair.
  return Math.ceil(price * 1.10);
}
