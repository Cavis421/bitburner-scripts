/** @param {NS} ns */
/*
 * lib/gang.js
 *
 * Shared gang helpers:
 *  - Capability / readiness checks
 *  - Choosing a candidate faction for gang creation
 *  - Attempting to create a gang (safe, retryable)
 *
 * Notes
 *  - This is a library module (import-only). It is not intended to be run directly.
 *  - createGang will fail until the game conditions are met (karma, faction membership, etc.).
 *    These helpers are designed for “try each tick until it works” patterns.
 */

// ------------------------------------------------------------
// Capability / readiness checks
// ------------------------------------------------------------

export function hasGangApi(ns) {
  return Boolean(ns.gang) && typeof ns.gang.inGang === "function";
}

export function inGang(ns) {
  if (!hasGangApi(ns)) return false;
  try {
    return Boolean(ns.gang.inGang());
  } catch (_e) {
    return false;
  }
}

/**
 * True if the createGang API exists (does NOT guarantee it will succeed).
 */
export function canAttemptCreateGang(ns) {
  return Boolean(ns.gang && typeof ns.gang.createGang === "function");
}

/**
 * Convenience: “is it meaningful to attempt gang creation now?”
 * - must have gang API
 * - must NOT already be in a gang
 * - must have createGang function
 */
export function shouldAttemptCreateGang(ns) {
  return hasGangApi(ns) && !inGang(ns) && canAttemptCreateGang(ns);
}

// ------------------------------------------------------------
// Faction selection
// ------------------------------------------------------------

/**
 * Default candidate factions (covers both combat and hacking gangs).
 * Order matters: earlier ones will be preferred if you’re a member.
 */
export function defaultGangFactions() {
  return [
    "Slum Snakes",
    "Tetrads",
    "The Syndicate",
    "Speakers for the Dead",
    "The Dark Army",
    "NiteSec",
    "The Black Hand",
  ];
}

/**
 * Pick a gang faction that the player is currently in.
 * If preferredFaction is provided, it will be returned only if the player has joined it.
 */
export function pickGangFactionFromPlayer(ns, {
  preferredFaction = "",
  candidates = defaultGangFactions(),
} = {}) {
  const pref = String(preferredFaction || "").trim();
  const joined = new Set((ns.getPlayer().factions || []).map(String));

  if (pref && joined.has(pref)) return pref;

  for (const f of candidates || []) {
    if (joined.has(f)) return f;
  }

  return "";
}

// ------------------------------------------------------------
// Gang creation
// ------------------------------------------------------------

/**
 * Attempt to create a gang.
 *
 * Returns:
 *  { ok: boolean, changed: boolean, reason?: string, faction?: string }
 *
 * - ok=false indicates a hard inability (no API) or an error
 * - changed=true indicates gang was created successfully
 * - changed=false with ok=true indicates “not ready yet” (common; safe to retry)
 */
export function maybeCreateGang(ns, {
  preferredFaction = "",
  candidates = defaultGangFactions(),
} = {}) {
  if (!shouldAttemptCreateGang(ns)) {
    if (!hasGangApi(ns)) return { ok: false, changed: false, reason: "no-gang-api" };
    if (inGang(ns)) return { ok: true, changed: false, reason: "already-in-gang" };
    if (!canAttemptCreateGang(ns)) return { ok: false, changed: false, reason: "no-createGang" };
    return { ok: true, changed: false, reason: "not-ready" };
  }

  const faction = pickGangFactionFromPlayer(ns, { preferredFaction, candidates });
  if (!faction) return { ok: true, changed: false, reason: "no-eligible-faction" };

  try {
    const success = Boolean(ns.gang.createGang(faction));
    if (success) return { ok: true, changed: true, reason: "created", faction };
    return { ok: true, changed: false, reason: "create-failed", faction };
  } catch (_e) {
    // Failure is common when karma/requirements aren't met.
    return { ok: true, changed: false, reason: "error-or-not-ready", faction };
  }
}
