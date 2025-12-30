/** @param {NS} ns */
/*
 * lib/player-policy.js
 *
 * UPDATED POLICY (FIXED):
 *  - Bootstrap on restart: while hacking < threshold, take FREE "Computer Science" at Rothman University (Sector-12).
 *  - Once hacking >= threshold: if bootstrap was active, immediately fall through to normal policy (crime-first, etc).
 *  - Safety / Recovery: if cash < minCashFloor, do CRIME FIRST (never paid gym/class).
 *  - Pre-gang: choose best crime meeting minChance; if none meets it, train lowest combat stat
 *              BUT ONLY if cash >= gymCashFloor; otherwise crime anyway.
 *  - Post-gang: do faction rep work for preferred factions (unless broke -> crime).
 */

import { inGang } from "lib/gang.js";
import {
  getCurrentWorkSafe,
  getCrimeChanceSafe,
  ensureCrime,
  ensureGymTraining,
  pickLowestCombatStat,
  ensureFactionWork,
  ensureStudy,
} from "lib/player.js";

export const PLAYER_POLICY_DEFAULTS = {
  // ---- Crime policy ----
  crimeMinChance: 0.55,
  crimePreference: ["homicide", "mug", "larceny", "rob store", "shoplift"],

  // ---- Cash guardrails ----
  minCashFloor: 5_000_000,
  gymCashFloor: 25_000_000,

  // ---- Training ----
  trainCity: "Sector-12",
  trainGym: "Powerhouse Gym",

  // ---- Restart bootstrap (FREE) ----
  bootstrapHackThreshold: 30,
  bootstrapCity: "Sector-12",
  bootstrapUniversity: "Rothman University",
  bootstrapCourse: "Computer Science",

  // ---- Faction work (post-gang) ----
  factionWorkType: "hacking",
  preferredFactions: ["Daedalus", "NiteSec", "The Black Hand", "BitRunners"],
};

// Module-level state (lives as long as the importing script instance does)
let bootstrapActive = false;

/**
 * Run one policy tick. Returns terminal-facing messages (only on state changes).
 * @param {NS} ns
 * @param {object} opts
 * @returns {string[]}
 */
export function runHybridPlayerTick(ns, opts = PLAYER_POLICY_DEFAULTS) {
  const cfg = { ...PLAYER_POLICY_DEFAULTS, ...(opts || {}) };
  const out = [];

  const work = getCurrentWorkSafe(ns);

  // Guard: do not override non-automation work types.
  // We only “own” CRIME/GYM/CLASS/FACTION. If user is doing company/program/etc, leave it alone.
  if (work && !["CRIME", "GYM", "CLASS", "FACTION"].includes(work.type)) {
    return out;
  }

  const p = safePlayer(ns);
  const money = p.money ?? 0;
  const hacking = p.hacking ?? 0;

  // ------------------------------------------------------------
  // 0) Restart bootstrap: keep studying until hacking >= threshold (FREE)
  // ------------------------------------------------------------
  if (hacking < cfg.bootstrapHackThreshold) {
    bootstrapActive = true;

    const r = ensureStudy(
      ns,
      {
        city: cfg.bootstrapCity,
        university: cfg.bootstrapUniversity,
        course: cfg.bootstrapCourse,
      },
      false
    );

    if (r.changed) {
      out.push(
        `[player] study: ${cfg.bootstrapCourse} @ ${cfg.bootstrapUniversity} (hacking<${cfg.bootstrapHackThreshold})`
      );
    }

    // While below threshold, bootstrap owns the tick.
    return out;
  }

  // If we were bootstrapping and have now crossed the threshold, we should transition away.
  // We don't need to explicitly "stop studying" — starting a crime/faction/gym will replace CLASS.
  if (bootstrapActive) {
    bootstrapActive = false;
    // Optional: you can log the transition if you want it visible.
    // out.push(`[player] bootstrap complete (hacking>=${cfg.bootstrapHackThreshold})`);
    // Do NOT return here; fall through to normal policy to switch immediately.
  }

  // ------------------------------------------------------------
  // 1) Recovery mode: if broke/low cash, ALWAYS do crime first
  // ------------------------------------------------------------
  if (money < cfg.minCashFloor) {
    const crime = pickBestCrime(ns, cfg.crimePreference, cfg.crimeMinChance);
    const r = ensureCrime(ns, crime, false);
    if (r.changed) out.push(`[player] recovery: crime: ${crime} (cash low)`);
    return out;
  }

  // ------------------------------------------------------------
  // 2) Pre-gang policy
  // ------------------------------------------------------------
  if (!inGang(ns)) {
    const crime = pickBestCrime(ns, cfg.crimePreference, cfg.crimeMinChance);
    const chance = getCrimeChanceSafe(ns, crime);

    // If chance is known and too low, train *only if* we can afford gym safely.
    if (chance !== null && chance < cfg.crimeMinChance) {
      if (money >= cfg.gymCashFloor) {
        const stat = pickLowestCombatStat(ns);
        const r = ensureGymTraining(
          ns,
          { city: cfg.trainCity, gym: cfg.trainGym, stat },
          false
        );
        if (r.changed) out.push(`[player] training ${stat} @ ${cfg.trainGym}`);
        return out;
      }

      // Gym blocked (too expensive) -> crime anyway
      const r = ensureCrime(ns, crime, false);
      if (r.changed) out.push(`[player] crime: ${crime} (gym blocked: cash<${fmtMoney(ns, cfg.gymCashFloor)})`);
      return out;
    }

    // Crime is acceptable -> do it
    const r = ensureCrime(ns, crime, false);
    if (r.changed) out.push(`[player] crime: ${crime}`);
    return out;
  }

  // ------------------------------------------------------------
  // 3) In gang: grind faction rep
  // ------------------------------------------------------------
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

/**
 * Crime chooser: returns the first crime in preference list that meets minChance (if chance is available),
 * otherwise falls back to the first item in list.
 */
function pickBestCrime(ns, preference, minChance) {
  const prefs = (preference && preference.length)
    ? preference
    : ["homicide", "mug", "larceny", "rob store", "shoplift"];

  for (const c of prefs) {
    const ch = getCrimeChanceSafe(ns, c);
    if (ch === null) return prefs[0];
    if (ch >= minChance) return c;
  }
  return prefs[prefs.length - 1];
}

function safePlayer(ns) {
  try {
    return ns.getPlayer();
  } catch (_e) {
    return { money: 0, hacking: 0 };
  }
}

function fmtMoney(ns, v) {
  try {
    return "$" + ns.formatNumber(v, 2, 1e3);
  } catch (_e) {
    return String(v);
  }
}
