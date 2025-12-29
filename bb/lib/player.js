/** @param {NS} ns */
/*
 * lib/player.js
 *
 * Shared “player action” helpers (Singularity-driven):
 *  - Safe wrappers around getCurrentWork() and work state checks
 *  - Crime helpers (chance + ensure crime)
 *  - Training helpers (gym + university) with simple “don’t restart same work” logic
 *  - Faction work helpers (ensure faction work)
 *
 * Design notes
 *  - These helpers are probe-safe: if Singularity APIs are missing, they fail gracefully.
 *  - They’re intended for controllers/orchestrators that run every tick.
 *  - “Ensure” functions do NOT spam-restart work; they check currentWork first.
 */

// ------------------------------------------------------------
// Capability probes
// ------------------------------------------------------------

export function hasSingularity(ns) {
  return Boolean(ns.singularity);
}

export function canGetCurrentWork(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.getCurrentWork === "function");
}

export function canCommitCrime(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.commitCrime === "function");
}

export function canGetCrimeChance(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.getCrimeChance === "function");
}

export function canGymWorkout(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.gymWorkout === "function");
}

export function canUniversityCourse(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.universityCourse === "function");
}

export function canWorkForFaction(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.workForFaction === "function");
}

export function canTravel(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.travelToCity === "function");
}

// ------------------------------------------------------------
// Current work (safe wrappers)
// ------------------------------------------------------------

/**
 * Returns ns.singularity.getCurrentWork() or null if unavailable/throws.
 */
export function getCurrentWorkSafe(ns) {
  if (!canGetCurrentWork(ns)) return null;
  try {
    return ns.singularity.getCurrentWork();
  } catch (_e) {
    return null;
  }
}

/**
 * True if player is currently working on a crime (any crime).
 */
export function isDoingCrime(ns) {
  const w = getCurrentWorkSafe(ns);
  return Boolean(w && w.type === "CRIME");
}

/**
 * True if player is currently training at gym.
 */
export function isDoingGym(ns) {
  const w = getCurrentWorkSafe(ns);
  return Boolean(w && w.type === "GYM");
}

/**
 * True if player is currently taking a class at university.
 */
export function isDoingClass(ns) {
  const w = getCurrentWorkSafe(ns);
  return Boolean(w && w.type === "CLASS");
}

/**
 * True if player is currently doing faction work.
 */
export function isDoingFactionWork(ns) {
  const w = getCurrentWorkSafe(ns);
  return Boolean(w && w.type === "FACTION");
}

// ------------------------------------------------------------
// Crime helpers
// ------------------------------------------------------------

/**
 * Returns crime success chance [0..1], or null if unavailable.
 */
export function getCrimeChanceSafe(ns, crimeName) {
  if (!canGetCrimeChance(ns)) return null;
  try {
    const v = ns.singularity.getCrimeChance(crimeName);
    return isFinite(v) ? v : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Ensure player is committing the specified crime.
 * Returns:
 *  { ok, changed, reason?, ms? }
 *
 * - changed=true means we started the crime (or switched to it)
 * - changed=false means we were already doing it, or couldn't start
 */
export function ensureCrime(ns, crimeName, focus = false) {
  if (!canCommitCrime(ns)) return { ok: false, changed: false, reason: "no-singularity" };

  const w = getCurrentWorkSafe(ns);
  if (w && w.type === "CRIME" && w.crimeType === crimeName) {
    return { ok: true, changed: false, reason: "already-doing" };
  }

  try {
    const ms = ns.singularity.commitCrime(crimeName, focus);
    if (ms > 0) return { ok: true, changed: true, reason: "started", ms };
    return { ok: true, changed: false, reason: "commit-returned-0", ms };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

// ------------------------------------------------------------
// Training helpers
// ------------------------------------------------------------

/**
 * Travel to a city if possible and not already there.
 * Returns { ok, changed }.
 */
export function ensureCity(ns, city) {
  const target = String(city || "").trim();
  if (!target) return { ok: true, changed: false };

  if (!canTravel(ns)) return { ok: false, changed: false };

  try {
    const p = ns.getPlayer();
    if (p.city === target) return { ok: true, changed: false };
    const ok = ns.singularity.travelToCity(target);
    return { ok: true, changed: Boolean(ok) };
  } catch (_e) {
    return { ok: false, changed: false };
  }
}

/**
 * Ensure player is training a given stat at a gym.
 * stat: "strength" | "defense" | "dexterity" | "agility"
 *
 * Returns { ok, changed, reason? }.
 */
export function ensureGymTraining(ns, { city = "", gym = "", stat = "strength" } = {}, focus = false) {
  if (!canGymWorkout(ns)) return { ok: false, changed: false, reason: "no-gym-api" };

  // Avoid restarting if already training at gym (any gym/stat is “good enough” unless you want strict matching)
  const w = getCurrentWorkSafe(ns);
  if (w && w.type === "GYM") return { ok: true, changed: false, reason: "already-doing" };

  // Travel first if requested
  if (city) ensureCity(ns, city);

  try {
    const ok = ns.singularity.gymWorkout(gym, stat, focus);
    return ok ? { ok: true, changed: true, reason: "started" } : { ok: true, changed: false, reason: "start-failed" };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * Ensure player is studying a given course at a university.
 *
 * Returns { ok, changed, reason? }.
 */
export function ensureStudy(ns, { city = "", university = "", course = "Algorithms" } = {}, focus = false) {
  if (!canUniversityCourse(ns)) return { ok: false, changed: false, reason: "no-university-api" };

  const w = getCurrentWorkSafe(ns);
  if (w && w.type === "CLASS") return { ok: true, changed: false, reason: "already-doing" };

  if (city) ensureCity(ns, city);

  try {
    const ok = ns.singularity.universityCourse(university, course, focus);
    return ok ? { ok: true, changed: true, reason: "started" } : { ok: true, changed: false, reason: "start-failed" };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * Convenience: pick the lowest combat stat.
 * Returns one of: "strength" | "defense" | "dexterity" | "agility"
 */
export function pickLowestCombatStat(ns) {
  const p = ns.getPlayer();
  const stats = [
    ["strength", p.strength],
    ["defense", p.defense],
    ["dexterity", p.dexterity],
    ["agility", p.agility],
  ];
  stats.sort((a, b) => a[1] - b[1]);
  return stats[0][0];
}

// ------------------------------------------------------------
// Faction work helpers
// ------------------------------------------------------------

/**
 * Ensure player is working for a faction in a given mode:
 *  mode: "hacking" | "field" | "security"
 *
 * Returns { ok, changed, reason? }.
 */
export function ensureFactionWork(ns, faction, mode = "hacking", focus = false) {
  if (!canWorkForFaction(ns)) return { ok: false, changed: false, reason: "no-faction-api" };

  const f = String(faction || "").trim();
  if (!f) return { ok: false, changed: false, reason: "no-faction" };

  const m = (mode === "field" || mode === "security") ? mode : "hacking";

  const w = getCurrentWorkSafe(ns);
  if (w && w.type === "FACTION" && w.factionName === f && w.factionWorkType === m) {
    return { ok: true, changed: false, reason: "already-doing" };
  }

  try {
    const ok = ns.singularity.workForFaction(f, m, focus);
    return ok ? { ok: true, changed: true, reason: "started" } : { ok: true, changed: false, reason: "start-failed" };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}
