/** @param {NS} ns */
/*
 * lib/work.js
 *
 * Description
 *  Small helpers for representing “current work” in a compact, log-friendly way,
 *  plus a few safe helpers for enforcing Singularity work policies.
 *
 * Notes
 *  - Formatting helpers are safe to use anywhere.
 *  - Singularity helpers are guarded (they no-op if Singularity API isn't available).
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

export const FACTION_DAEDALUS = "Daedalus";
export const DAEDALUS_DEFAULT_WORKTYPE = "Hacking Contracts";

export function formatWorkBrief(work) {
  if (!work) return "none";

  try {
    if (work.type === "CRIME") return `CRIME:${work.crimeType}`;
    if (work.type === "GYM") return `GYM:${work.gymStatType}`;
    if (work.type === "CLASS") return `CLASS:${work.classType ?? work.courseName ?? "?"}`;
    if (work.type === "FACTION") return `FACTION:${work.factionName}:${work.factionWorkType}`;
    return String(work.type || "unknown");
  } catch (_e) {
    return "unknown";
  }
}

/**
 * Ensure we are earning Daedalus rep once we are a member.
 *
 * This is designed to be called repeatedly (e.g., every controller tick).
 * It is idempotent and will only switch work if you're a Daedalus member and
 * you are NOT already doing Daedalus faction work.
 *
 * @param {NS} ns
 * @param {{
 *   workType?: string,
 *   focus?: boolean,
 *   verbose?: boolean,
 * }} [opts]
 * @returns {{didSwitch:boolean, reason:string}}
 */
export function ensureDaedalusFactionWork(ns, opts = {}) {
  const workType = String(opts.workType || DAEDALUS_DEFAULT_WORKTYPE);
  const focus = Boolean(opts.focus);
  const verbose = Boolean(opts.verbose);

  // Guard: Singularity API must exist
  if (!ns?.singularity || typeof ns.singularity.getCurrentWork !== "function") {
    return { didSwitch: false, reason: "no_singularity_api" };
  }

  const player = ns.getPlayer();
  const factions = player?.factions || [];

  // Only act if we are actually in Daedalus
  if (!factions.includes(FACTION_DAEDALUS)) {
    return { didSwitch: false, reason: "not_in_daedalus" };
  }

  // If already working for Daedalus, do nothing
  const cur = ns.singularity.getCurrentWork();
  if (cur && cur.type === "FACTION" && cur.factionName === FACTION_DAEDALUS) {
    return { didSwitch: false, reason: "already_working_daedalus" };
  }

  // Switch to Daedalus work
  const ok = ns.singularity.workForFaction(FACTION_DAEDALUS, workType, focus);

  if (verbose) {
    const before = formatWorkBrief(cur);
    ns.print(`[work] ensureDaedalusFactionWork: ${before} -> FACTION:${FACTION_DAEDALUS}:${workType} (ok=${ok})`);
  }

  return { didSwitch: Boolean(ok), reason: ok ? "switched" : "workForFaction_failed" };
}
