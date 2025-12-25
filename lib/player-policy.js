/** @param {NS} ns */
/*
 * lib/player-policy.js
 *
 * Description
 *  Player automation policy layer (BN4/SF4+ expected):
 *   - Pre-gang: homicide if chance >= threshold, else train lowest combat stat
 *   - Post-gang: do faction rep work for preferred factions
 *   - Safety: does NOT override company work / special actions / programs, etc.
 *
 * Notes
 *  - This module contains *policy* (what to do), not Singularity primitives.
 *  - It uses lib/player.js for safe Singularity wrappers.
 *  - Designed to be called from core/controller.js once per tick.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

import { inGang } from "lib/gang.js";
import {
  getCurrentWorkSafe,
  getCrimeChanceSafe,
  ensureCrime,
  ensureGymTraining,
  pickLowestCombatStat,
  ensureFactionWork,
} from "lib/player.js";

export const PLAYER_POLICY_DEFAULTS = {
  crime: "homicide",
  crimeMinChance: 0.55,
  trainCity: "Sector-12",
  trainGym: "Powerhouse Gym",
  factionWorkType: "hacking",
  preferredFactions: ["NiteSec", "The Black Hand", "BitRunners"],
};

/**
 * Run one policy tick. Returns terminal-facing messages (only on state changes).
 * @param {NS} ns
 * @param {object} opts
 * @returns {string[]}
 */
export function runHybridPlayerTick(ns, opts = PLAYER_POLICY_DEFAULTS) {
  const cfg = { ...PLAYER_POLICY_DEFAULTS, ...(opts || {}) };
  const out = [];

  // If Singularity isn’t available, wrappers will return ok:false/changed:false.
  // We keep policy quiet in that case.
  const work = getCurrentWorkSafe(ns);

  // Guard: do not override non-automation work types.
  // We only “own” CRIME/GYM/CLASS/FACTION. If user is doing company/program/etc, leave it alone.
  if (work && !["CRIME", "GYM", "CLASS", "FACTION"].includes(work.type)) {
    return out;
  }

  if (!inGang(ns)) {
    // Pre-gang: crime for karma if chance is decent, otherwise train.
    const chance = getCrimeChanceSafe(ns, cfg.crime);

    if (chance !== null && chance < cfg.crimeMinChance) {
      const stat = pickLowestCombatStat(ns);
      const r = ensureGymTraining(
        ns,
        { city: cfg.trainCity, gym: cfg.trainGym, stat },
        false
      );
      if (r.changed) out.push(`[player] training ${stat} @ ${cfg.trainGym}`);
      return out;
    }

    const r = ensureCrime(ns, cfg.crime, false);
    if (r.changed) out.push(`[player] crime: ${cfg.crime}`);
    return out;
  }

  // In gang: grind faction rep (simple heuristic).
  const faction = pickRepFaction(ns, cfg.preferredFactions);
  if (!faction) return out;

  const r = ensureFactionWork(ns, faction, cfg.factionWorkType, false);
  if (r.changed) out.push(`[player] faction work: ${faction} (${cfg.factionWorkType})`);
  return out;
}

/**
 * Picks the first preferred faction you’re currently in, otherwise any faction.
 * @param {NS} ns
 * @param {string[]} preferred
 * @returns {string}
 */
export function pickRepFaction(ns, preferred) {
  try {
    const my = ns.getPlayer().factions || [];
    for (const f of preferred || []) {
      if (my.includes(f)) return f;
    }
    return my[0] || "";
  } catch (_e) {
    return "";
  }
}
