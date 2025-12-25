/** @param {NS} ns */
/*
 * lib/augmentations.js
 *
 * Purchase-only augmentation automation helpers.
 *
 * Policy (Phase 1):
 *  - Never install/reset (purchase only)
 *  - Never buy NeuroFlux Governor by default (repeatable)
 *  - Keep a cash reserve before purchasing
 *  - Prefer "good" augmentations using simple heuristics (keywords + allowlist)
 *  - Probe-safe: if Singularity APIs aren't available, it returns ok:false
 *
 * Intended usage:
 *  - Call periodically from controller (e.g., every 60-120s or on milestone events)
 *  - Use the return summary to decide faction rep focus later (Phase 2)
 */

// ------------------------------------------------------------
// Defaults (keep these stable; tune later)
// ------------------------------------------------------------

export const AUG_DEFAULTS = {
  checkIntervalMs: 90_000,

  // Money safety:
  //  - minReserve: always keep at least this much cash
  //  - pctReserve: also keep this fraction of current cash (whichever is larger)
  minReserve: 1e9,
  pctReserve: 0.10,

  // What to buy:
  buyNeuroFlux: false,
  maxPurchasesPerCheck: 8, // safety cap to avoid spending spree from one tick

  // Filtering behavior:
  preferDesiredOnly: false, // if true: buy only "desired" augs; if false: buy any eligible unless blocked

  // Simple allowlist / blocklist
  // (Names are optional; heuristics also apply.)
  desiredNames: new Set([
    // Starter "usually good" list (not exhaustive; safe defaults)
    "The Red Pill",
    "Neuralstimulator",
    "Neural Accelerator",
    "BitWire",
    "Cranial Signal Processors - Gen I",
    "Cranial Signal Processors - Gen II",
    "Cranial Signal Processors - Gen III",
    "Cranial Signal Processors - Gen IV",
    "Neuroreceptor Management Implant",
    "DataJack",
    "Embedded Netburner Module",
    "Embedded Netburner Module Core Implant",
    "Embedded Netburner Module Core V2 Upgrade",
    "Artificial Synaptic Potentiation",
  ]),

  blockedNames: new Set([
    // Keep this tiny; expand only if you’re confident something is useless for your playstyle
    // "Something You Never Want"
  ]),
};

// Keywords: if aug name contains these (case-insensitive), it’s likely valuable
const DESIRED_KEYWORDS = [
  "hacking",
  "hack",
  "rep",
  "reputation",
  "faction",
  "company",
  "neural",
  "cranial",
  "bitwire",
  "datajack",
  "netburner",
  "synaptic",
  "cortex",
  "wires",
  "processor",
];

// ------------------------------------------------------------
// Capability probes
// ------------------------------------------------------------

export function hasAugApi(ns) {
  return Boolean(ns.singularity)
    && typeof ns.singularity.getOwnedAugmentations === "function"
    && typeof ns.singularity.getAugmentationsFromFaction === "function"
    && typeof ns.singularity.getAugmentationRepReq === "function"
    && typeof ns.singularity.getAugmentationPrice === "function"
    && typeof ns.singularity.purchaseAugmentation === "function";
}

// ------------------------------------------------------------
// Core helpers
// ------------------------------------------------------------

export function getCashReserve(ns, opts = {}) {
  const minReserve = Number(opts.minReserve ?? AUG_DEFAULTS.minReserve);
  const pctReserve = Number(opts.pctReserve ?? AUG_DEFAULTS.pctReserve);

  const money = ns.getServerMoneyAvailable("home");
  const pct = Math.max(0, pctReserve) * money;

  return Math.max(0, minReserve, pct);
}

/**
 * Returns { owned, purchased } sets.
 * - owned includes installed + purchased by default if includePurchased=true (Bitburner behavior)
 */
export function getOwnedAndPurchasedAugs(ns) {
  // getOwnedAugmentations(true) includes purchased but not installed
  // getOwnedAugmentations(false) includes only installed
  const ownedPlusPurchased = new Set(ns.singularity.getOwnedAugmentations(true) || []);
  const installedOnly = new Set(ns.singularity.getOwnedAugmentations(false) || []);

  const purchasedOnly = new Set();
  for (const a of ownedPlusPurchased) {
    if (!installedOnly.has(a)) purchasedOnly.add(a);
  }

  return {
    ownedPlusPurchased,
    installedOnly,
    purchasedOnly,
  };
}

export function isDesiredAug(name, opts = {}) {
  const desiredNames = opts.desiredNames ?? AUG_DEFAULTS.desiredNames;

  if (desiredNames instanceof Set && desiredNames.has(name)) return true;

  const lower = String(name || "").toLowerCase();
  for (const k of DESIRED_KEYWORDS) {
    if (lower.includes(k)) return true;
  }
  return false;
}

/**
 * Collect augmentations you can see from your current factions.
 * Returns a flat list of entries:
 *  { faction, name, repReq, price }
 */
export function listFactionAugmentations(ns, opts = {}) {
  if (!hasAugApi(ns)) return [];

  const player = ns.getPlayer();
  const factions = Array.from(player.factions || []);

  const out = [];
  for (const f of factions) {
    let augs = [];
    try {
      augs = ns.singularity.getAugmentationsFromFaction(f) || [];
    } catch (_e) {
      continue;
    }

    for (const name of augs) {
      try {
        const repReq = ns.singularity.getAugmentationRepReq(name);
        const price = ns.singularity.getAugmentationPrice(name);
        out.push({ faction: f, name, repReq, price });
      } catch (_e) {
        // ignore
      }
    }
  }

  return out;
}

/**
 * Determine whether an augmentation is buyable right now from a specific faction.
 */
export function isAugBuyableNow(ns, entry, opts = {}) {
  const name = entry?.name;
  if (!name) return false;

  const blockedNames = opts.blockedNames ?? AUG_DEFAULTS.blockedNames;
  if (blockedNames instanceof Set && blockedNames.has(name)) return false;

  if (!opts.buyNeuroFlux && name === "NeuroFlux Governor") return false;

  // Must have enough faction rep AND money (money check is handled later with reserve)
  try {
    const rep = ns.singularity.getFactionRep(entry.faction);
    return rep >= entry.repReq;
  } catch (_e) {
    return false;
  }
}

/**
 * Purchase augmentations according to Phase 1 policy.
 *
 * Options:
 *  - minReserve, pctReserve
 *  - buyNeuroFlux
 *  - desiredNames, blockedNames
 *  - preferDesiredOnly
 *  - maxPurchasesPerCheck
 *
 * Returns:
 *  {
 *    ok: boolean,
 *    purchased: Array<{ name, faction, price }>,
 *    skipped: Array<{ name, faction, reason }>,
 *    nextTargets: Array<{ name, faction, repReq, repHave, repNeeded, price, desired }>,
 *    reserve: number,
 *    money: number
 *  }
 */
export function purchaseAugs(ns, opts = {}) {
  if (!hasAugApi(ns)) {
    return {
      ok: false,
      purchased: [],
      skipped: [],
      nextTargets: [],
      reserve: 0,
      money: ns.getServerMoneyAvailable("home"),
      reason: "no-singularity-aug-api",
    };
  }

  const config = {
    minReserve: Number(opts.minReserve ?? AUG_DEFAULTS.minReserve),
    pctReserve: Number(opts.pctReserve ?? AUG_DEFAULTS.pctReserve),
    buyNeuroFlux: Boolean(opts.buyNeuroFlux ?? AUG_DEFAULTS.buyNeuroFlux),
    desiredNames: opts.desiredNames ?? AUG_DEFAULTS.desiredNames,
    blockedNames: opts.blockedNames ?? AUG_DEFAULTS.blockedNames,
    preferDesiredOnly: Boolean(opts.preferDesiredOnly ?? AUG_DEFAULTS.preferDesiredOnly),
    maxPurchasesPerCheck: Math.max(1, Number(opts.maxPurchasesPerCheck ?? AUG_DEFAULTS.maxPurchasesPerCheck)),
  };

  const money = ns.getServerMoneyAvailable("home");
  const reserve = getCashReserve(ns, config);

  const { ownedPlusPurchased } = getOwnedAndPurchasedAugs(ns);

  const entries = listFactionAugmentations(ns, config);

  // Collapse duplicates: same aug sold by multiple factions.
  // We keep all faction variants for "next target" analysis, but only buy once.
  const skipped = [];
  const candidates = [];

  for (const e of entries) {
    if (!e?.name) continue;
    if (ownedPlusPurchased.has(e.name)) {
      skipped.push({ name: e.name, faction: e.faction, reason: "already-owned-or-purchased" });
      continue;
    }

    const blockedNames = config.blockedNames;
    if (blockedNames instanceof Set && blockedNames.has(e.name)) {
      skipped.push({ name: e.name, faction: e.faction, reason: "blocked" });
      continue;
    }

    if (!config.buyNeuroFlux && e.name === "NeuroFlux Governor") {
      skipped.push({ name: e.name, faction: e.faction, reason: "neuroflux-disabled" });
      continue;
    }

    const desired = isDesiredAug(e.name, config);
    if (config.preferDesiredOnly && !desired) {
      skipped.push({ name: e.name, faction: e.faction, reason: "not-desired" });
      continue;
    }

    candidates.push({ ...e, desired });
  }

  // Build nextTargets list (rep gating) even if we can’t buy yet
  const nextTargets = [];
  for (const c of candidates) {
    try {
      const repHave = ns.singularity.getFactionRep(c.faction);
      const repNeeded = Math.max(0, c.repReq - repHave);
      nextTargets.push({
        name: c.name,
        faction: c.faction,
        repReq: c.repReq,
        repHave,
        repNeeded,
        price: c.price,
        desired: c.desired,
      });
    } catch (_e) {
      // ignore
    }
  }

  // Sort nextTargets: desired first, then lowest rep needed, then cheapest
  nextTargets.sort((a, b) => {
    if (a.desired !== b.desired) return a.desired ? -1 : 1;
    if (a.repNeeded !== b.repNeeded) return a.repNeeded - b.repNeeded;
    return (a.price ?? 0) - (b.price ?? 0);
  });

  // Now pick buyable-now candidates and sort by priority:
  // desired first, then cheapest first (conservative spending), then lowest repReq.
  const buyable = candidates
    .filter(c => isAugBuyableNow(ns, c, config))
    .sort((a, b) => {
      if (a.desired !== b.desired) return a.desired ? -1 : 1;
      if (a.price !== b.price) return (a.price ?? 0) - (b.price ?? 0);
      return (a.repReq ?? 0) - (b.repReq ?? 0);
    });

  const purchased = [];
  let spendable = money - reserve;
  let purchasesLeft = config.maxPurchasesPerCheck;

  // Track names purchased this pass (avoid duplicates across factions)
  const boughtNames = new Set();

  for (const c of buyable) {
    if (purchasesLeft <= 0) break;
    if (boughtNames.has(c.name)) continue;

    // Re-check money live (prices can change as you buy)
    const curMoney = ns.getServerMoneyAvailable("home");
    const curReserve = getCashReserve(ns, config);
    spendable = curMoney - curReserve;

    const price = Number(c.price ?? 0);
    if (!isFinite(price) || price <= 0) continue;

    if (price > spendable) {
      skipped.push({ name: c.name, faction: c.faction, reason: "reserve-budget" });
      continue;
    }

    try {
      const ok = ns.singularity.purchaseAugmentation(c.faction, c.name);
      if (ok) {
        purchased.push({ name: c.name, faction: c.faction, price });
        boughtNames.add(c.name);
        purchasesLeft--;
      } else {
        skipped.push({ name: c.name, faction: c.faction, reason: "purchase-failed" });
      }
    } catch (_e) {
      skipped.push({ name: c.name, faction: c.faction, reason: "error" });
    }
  }

  return {
    ok: true,
    purchased,
    skipped,
    nextTargets,
    reserve,
    money: ns.getServerMoneyAvailable("home"),
  };
}
