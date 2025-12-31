/** @param {NS} ns */
/*
 * lib/player-policy.js
 *
 * SINGLE SOURCE OF TRUTH policy (hour-sliced):
 *
 * 1) Hacking 1-30: study "Computer Science" (bootstrap)
 * 2) Hacking >= 30, pre-gang:
 *    - Minute 00-09: INT slice (create missing programs else study)
 *    - Minute 50-59: faction rep work
 *    - Otherwise: crime logic
 * 3) In gang:
 *    - Minute 00-09: INT slice (same)
 *    - Otherwise: faction rep work
 * 4) If in Daedalus: prioritize Daedalus faction rep whenever doing faction work
 *
 * IMPORTANT:
 * - This policy assumes you DISABLE the separate bin/intelligence-trainer.js daemon,
 *   otherwise it will fight you by starting CLASS during its own slice.
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

  // ---- Hack bootstrap (FREE) ----
  bootstrapHackThreshold: 30,
  bootstrapCity: "Sector-12",
  bootstrapUniversity: "Rothman University",
  bootstrapCourse: "Computer Science",

  // ---- Faction work ----
  factionWorkType: "hacking",
  preferredFactions: ["Daedalus", "NiteSec", "The Black Hand", "BitRunners"],

  // ---- Hour windows ----
  hourWindows: {
    // INT slice: top of hour through minute 9 (00-09)
    intStartMin: 0,
    intEndMin: 10, // exclusive

    // Faction window: last 10 minutes (50-59)
    factionStartMin: 50,
    factionEndMin: 60, // exclusive
  },

  // ---- INT slice behavior ----
  intSlice: {
    // Prefer making missing programs first
    programPriority: [
      "AutoLink.exe",
      "DeepScanV1.exe",
      "ServerProfiler.exe",
      "BruteSSH.exe",
      "FTPCrack.exe",
      "relaySMTP.exe",
      "HTTPWorm.exe",
      "SQLInject.exe",
      "Formulas.exe",
    ],

    // Fallback: study (INT XP)
    city: "Sector-12",
    university: "Rothman University",
    course: "Computer Science",
  },
};

// Module-level state (lives as long as the importing script instance does)
let bootstrapActive = false;
let lastMode = ""; // "", "BOOTSTRAP", "INT", "FACTION_WIN", "NORMAL"

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
  // We only “own” CRIME/GYM/CLASS/FACTION/CREATE_PROGRAM.
  if (work && !["CRIME", "GYM", "CLASS", "FACTION", "CREATE_PROGRAM"].includes(work.type)) {
    return out;
  }

  const p = safePlayer(ns);
  const money = p.money ?? 0;

  // IMPORTANT: ns.getPlayer() doesn't reliably expose p.hacking (it's usually p.skills.hacking)
  // Use getHackingLevel() as the authoritative value.
  let hacking = 0;
  try { hacking = ns.getHackingLevel(); } catch { hacking = 0; }

  const minute = safeMinute();
  const win = cfg.hourWindows || {};
  const inIntSlice = minute >= (win.intStartMin ?? 0) && minute < (win.intEndMin ?? 10);
  const inFactionWindow = minute >= (win.factionStartMin ?? 50) && minute < (win.factionEndMin ?? 60);

  // ------------------------------------------------------------
  // 1) Hack bootstrap 1-30: study CS
  // ------------------------------------------------------------
  if (hacking < cfg.bootstrapHackThreshold) {
    bootstrapActive = true;
    mode(out, "BOOTSTRAP", `bootstrap: study until hacking>=${cfg.bootstrapHackThreshold}`);

    const r = ensureStudy(
      ns,
      { city: cfg.bootstrapCity, university: cfg.bootstrapUniversity, course: cfg.bootstrapCourse },
      false
    );
    if (r.changed) {
      out.push(`[player] study: ${cfg.bootstrapCourse} @ ${cfg.bootstrapUniversity} (hacking<${cfg.bootstrapHackThreshold})`);
    }
    return out;
  }

  if (bootstrapActive) {
    bootstrapActive = false;
    // fall through immediately to normal logic
  }

  // ------------------------------------------------------------
  // 2) INT slice: top of hour 00-09 (ALWAYS, even if in gang)
  // ------------------------------------------------------------
  if (inIntSlice) {
    mode(out, "INT", "INT slice (top of hour)");

    // HARD HANDOFF: stop prior work once so INT slice reliably takes over
    if (ns.singularity && typeof ns.singularity.stopAction === "function") {
      if (work && ["FACTION", "CRIME", "GYM", "CLASS", "CREATE_PROGRAM"].includes(work.type)) {
        try { ns.singularity.stopAction(); } catch { /* ignore */ }
      }
    }

    // Re-read after stopAction to avoid stale decisions
    const work2 = getCurrentWorkSafe(ns);

    const intCfg = cfg.intSlice || {};

    // Prefer creating missing programs during the slice (INT + utility)
    const missing = (intCfg.programPriority || []).find((pp) => !ns.fileExists(pp, "home"));
    if (missing && ns.singularity && typeof ns.singularity.createProgram === "function") {
      let ok = false;
      try { ok = ns.singularity.createProgram(missing, false); } catch { ok = false; }

      if (ok) {
        out.push(`[player] INT slice: createProgram ${missing}`);
        return out; // action started; slice owns tick
      }

      // Skill gated or otherwise unavailable -> fall through to study
      out.push(`[player] INT slice: cannot createProgram ${missing} -> fallback to study`);
    }

    // Fallback: study for INT
    const r = ensureStudy(
      ns,
      { city: intCfg.city, university: intCfg.university, course: intCfg.course },
      false
    );

    // If study didn't "change", it can be because we were already in CLASS; that's fine.
    if (r.changed) out.push(`[player] INT slice: study: ${intCfg.course} @ ${intCfg.university}`);
    else if (work2?.type !== "CLASS") out.push(`[player] INT slice: study already active or could not switch (work=${work2?.type || "NONE"})`);

    return out;
  }

  // If we just left INT slice and we're still doing INT-owned work, stop it so we can switch immediately.
  if (ns.singularity && typeof ns.singularity.stopAction === "function") {
    if (work && (work.type === "CLASS" || work.type === "CREATE_PROGRAM")) {
      try { ns.singularity.stopAction(); } catch { /* ignore */ }
    }
  }

  // ------------------------------------------------------------
  // 3) Post-bootstrap “broke” safety: crime first
  // ------------------------------------------------------------
  if (money < cfg.minCashFloor) {
    mode(out, "NORMAL", "recovery: low cash => crime");
    const crime = pickBestCrime(ns, cfg.crimePreference, cfg.crimeMinChance);
    const r = ensureCrime(ns, crime, false);
    if (r.changed) out.push(`[player] recovery: crime: ${crime} (cash low)`);
    return out;
  }

  // ------------------------------------------------------------
  // 4) Pre-gang phase
  //    - last 10 minutes: faction rep grind
  //    - otherwise: crime logic
  // ------------------------------------------------------------
  if (!inGang(ns)) {
    if (inFactionWindow) {
      mode(out, "FACTION_WIN", "pre-gang: faction window (last 10 min)");
      const faction = pickRepFaction(ns, cfg.preferredFactions);
      if (faction) {
        const r = ensureFactionWork(ns, faction, cfg.factionWorkType, false);
        if (r.changed) out.push(`[player] faction window: ${faction} (${cfg.factionWorkType})`);
        return out;
      }
      // no faction => fall back to crime
    }

    mode(out, "NORMAL", "pre-gang: crime logic");

    const crime = pickBestCrime(ns, cfg.crimePreference, cfg.crimeMinChance);
    const chance = getCrimeChanceSafe(ns, crime);

    // If chance is known and too low, train *only if* we can afford gym safely.
    if (chance !== null && chance < cfg.crimeMinChance) {
      if (money >= cfg.gymCashFloor) {
        const stat = pickLowestCombatStat(ns);
        const r = ensureGymTraining(ns, { city: cfg.trainCity, gym: cfg.trainGym, stat }, false);
        if (r.changed) out.push(`[player] training ${stat} @ ${cfg.trainGym}`);
        return out;
      }
      // Gym blocked -> crime anyway
      const r = ensureCrime(ns, crime, false);
      if (r.changed) out.push(`[player] crime: ${crime} (gym blocked: cash<${fmtMoney(ns, cfg.gymCashFloor)})`);
      return out;
    }

    const r = ensureCrime(ns, crime, false);
    if (r.changed) out.push(`[player] crime: ${crime}`);
    return out;
  }

  // ------------------------------------------------------------
  // 5) In gang: faction rep (Daedalus priority)
  // ------------------------------------------------------------
  mode(out, "NORMAL", "in gang: faction rep");

  const faction = pickRepFaction(ns, cfg.preferredFactions);
  if (!faction) return out;

  const r = ensureFactionWork(ns, faction, cfg.factionWorkType, false);
  if (r.changed) out.push(`[player] faction work: ${faction} (${cfg.factionWorkType})`);
  return out;
}

/**
 * Picks Daedalus if you have it, else preferred list, else any faction.
 * @param {NS} ns
 * @param {string[]} preferred
 * @returns {string}
 */
export function pickRepFaction(ns, preferred) {
  try {
    const my = ns.getPlayer().factions || [];
    if (my.includes("Daedalus")) return "Daedalus";

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
    const p = ns.getPlayer();
    // Normalize hacking into a stable place if you ever want it later
    const hk = (p?.skills?.hacking ?? p?.hacking);
    return { ...p, hacking: hk };
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

function safeMinute() {
  try {
    return new Date().getMinutes();
  } catch {
    return 0;
  }
}

function mode(out, m, why) {
  if (lastMode === m) return;
  lastMode = m;
  out.push(`[player] mode -> ${m} (${why})`);
}
