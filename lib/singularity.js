/** @param {NS} ns */
/*
 * lib/singularity.js
 *
 * Shared Singularity helpers for BN4 / SF4+:
 *  - Capability probes (safe to call even when Singularity isn't available)
 *  - TOR + Dark Web program automation (direct purchase helpers + "start buyer script" helper)
 *  - WSE/TIX/4S purchase automation (version-safe probing)
 *  - Faction invite acceptance
 *  - Stock API gating helpers (TIX + 4S)
 *
 * Notes
 *  - This is a library module (import-only). It is not intended to be run directly.
 *  - All functions are "probe-safe": they handle missing APIs gracefully.
 */

// ------------------------------------------------------------
// Capability probes
// ------------------------------------------------------------

export function hasSingularity(ns) {
  return Boolean(ns.singularity);
}

export function canPurchaseTor(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.purchaseTor === "function");
}

export function canBuyAugmentations(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.purchaseAugmentation === "function");
}

export function canCheckFactionInvites(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.checkFactionInvitations === "function");
}

// ------------------------------------------------------------
// TOR + Dark Web helpers
// ------------------------------------------------------------

export function hasTorAccess(ns) {
  // In many versions, ns.getPlayer().tor indicates TOR ownership; darkweb server may also exist.
  try {
    const p = ns.getPlayer();
    if (p && p.tor) return true;
  } catch (_e) {
    // ignore
  }

  try {
    return ns.serverExists("darkweb");
  } catch (_e) {
    return false;
  }
}

/**
 * Attempt to purchase TOR router.
 * Returns: { ok, changed, reason? }
 */
export function maybeBuyTor(ns) {
  if (!canPurchaseTor(ns)) return { ok: false, changed: false, reason: "no-singularity" };
  if (hasTorAccess(ns)) return { ok: true, changed: false, reason: "already-owned" };

  try {
    const changed = Boolean(ns.singularity.purchaseTor());
    return { ok: true, changed, reason: changed ? "purchased" : "not-affordable-or-unavailable" };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * Default "must-have" Dark Web programs you listed (plus Formulas).
 * (Exclude Deepscan/Virus/AutoLink if you don't want them.)
 */
export function defaultDarkwebTargets() {
  return [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
    "Formulas.exe",
  ];
}

export function hasAllDarkwebTargets(ns, targets = defaultDarkwebTargets()) {
  try {
    return (targets || []).every(p => ns.fileExists(p, "home"));
  } catch (_e) {
    return false;
  }
}

/**
 * If TOR is owned and not all targets are owned, ensure the given buyer script is running.
 * This is useful if you already have a dedicated script like darkweb/darkweb-auto-buyer.js.
 *
 * Returns: { ok, changed, reason?, pid? }
 */
export function ensureDarkwebBuyerScript(ns, buyerScript) {
  if (!buyerScript) return { ok: false, changed: false, reason: "no-script" };
  if (!hasTorAccess(ns)) return { ok: true, changed: false, reason: "no-tor" };

  if (hasAllDarkwebTargets(ns)) return { ok: true, changed: false, reason: "done" };

  try {
    if (!ns.fileExists(buyerScript, "home")) return { ok: false, changed: false, reason: "missing-file" };
    const running = ns.ps("home").some(p => p.filename === buyerScript);
    if (running) return { ok: true, changed: false, reason: "already-running" };

    const pid = ns.run(buyerScript, 1);
    if (!pid) return { ok: false, changed: false, reason: "start-failed" };
    return { ok: true, changed: true, reason: "started", pid };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * Buy a single program from Dark Web, if possible.
 * Returns: { ok, changed, reason? }
 *
 * Notes:
 *  - Requires Singularity and TOR.
 *  - This does not check cost; purchaseProgram will just return false if not affordable.
 */
export function maybeBuyDarkwebProgram(ns, programName) {
  if (!hasSingularity(ns) || typeof ns.singularity.purchaseProgram !== "function") {
    return { ok: false, changed: false, reason: "no-singularity" };
  }
  if (!hasTorAccess(ns)) return { ok: true, changed: false, reason: "no-tor" };

  try {
    if (ns.fileExists(programName, "home")) return { ok: true, changed: false, reason: "already-owned" };
    const changed = Boolean(ns.singularity.purchaseProgram(programName));
    return { ok: true, changed, reason: changed ? "purchased" : "not-affordable-or-unavailable" };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * Attempt to buy any missing programs from a target list.
 * Returns: { ok, bought: string[] }
 *
 * This is a “direct buy” alternative to starting a dedicated buyer script.
 */
export function maybeBuyDarkwebPrograms(ns, targets = defaultDarkwebTargets()) {
  const bought = [];
  if (!hasSingularity(ns) || typeof ns.singularity.purchaseProgram !== "function") {
    return { ok: false, bought };
  }
  if (!hasTorAccess(ns)) return { ok: true, bought };

  for (const prog of targets || []) {
    try {
      if (ns.fileExists(prog, "home")) continue;
      if (ns.singularity.purchaseProgram(prog)) bought.push(prog);
    } catch (_e) {
      // ignore and continue
    }
  }

  return { ok: true, bought };
}

// ------------------------------------------------------------
// WSE / Stock API gating + purchase automation
// ------------------------------------------------------------

export function hasStockApi(ns) {
  return Boolean(ns.stock);
}

export function hasTixAccess(ns) {
  try {
    return Boolean(ns.stock && typeof ns.stock.hasTIXAPIAccess === "function" && ns.stock.hasTIXAPIAccess());
  } catch (_e) {
    return false;
  }
}

export function has4SDataTix(ns) {
  try {
    return Boolean(ns.stock && typeof ns.stock.has4SDataTIXAPI === "function" && ns.stock.has4SDataTIXAPI());
  } catch (_e) {
    return false;
  }
}

export function hasTixAnd4S(ns) {
  return hasTixAccess(ns) && has4SDataTix(ns);
}

/**
 * Attempt to buy WSE account + TIX + 4S.
 * Uses probe-safe function calls because naming differs between Bitburner versions.
 *
 * Returns: { ok, purchased: string[] }
 */
export function maybeBuyWseBundle(ns) {
  const purchased = [];
  if (!hasSingularity(ns)) return { ok: false, purchased };

  // WSE account
  try {
    if (typeof ns.singularity.purchaseWseAccount === "function") {
      if (ns.singularity.purchaseWseAccount()) purchased.push("WSE");
    }
  } catch (_e) { /* ignore */ }

  // TIX API
  try {
    if (typeof ns.singularity.purchaseTixApiAccess === "function") {
      if (ns.singularity.purchaseTixApiAccess()) purchased.push("TIX");
    }
  } catch (_e) { /* ignore */ }

  // 4S Market Data (two variants across versions)
  try {
    if (typeof ns.singularity.purchase4SMarketDataTixApi === "function") {
      if (ns.singularity.purchase4SMarketDataTixApi()) purchased.push("4S-TIX");
    } else if (typeof ns.singularity.purchase4SMarketData === "function") {
      if (ns.singularity.purchase4SMarketData()) purchased.push("4S");
    }
  } catch (_e) { /* ignore */ }

  return { ok: true, purchased };
}

// ------------------------------------------------------------
// Factions (invites)
// ------------------------------------------------------------

/**
 * Accepts all pending faction invitations.
 * Returns: { ok, joined: string[] }
 */
export function acceptFactionInvites(ns) {
  const joined = [];
  if (!canCheckFactionInvites(ns) || typeof ns.singularity.joinFaction !== "function") {
    return { ok: false, joined };
  }

  try {
    const invites = ns.singularity.checkFactionInvitations() || [];
    for (const f of invites) {
      try {
        if (ns.singularity.joinFaction(f)) joined.push(f);
      } catch (_e) {
        // ignore
      }
    }
    return { ok: true, joined };
  } catch (_e) {
    return { ok: false, joined };
  }
}
