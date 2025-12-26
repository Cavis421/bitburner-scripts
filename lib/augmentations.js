/** @param {NS} ns */
/*
 * lib/augmentations.js
 *
 * Purchase-only augmentation automation helpers.
 *
 * Policy (Phase 2+):
 *  - Supports multiple “desired sets” (combat vs hacking allowlist)
 *  - Optional strict allowlist-only mode
 *  - Optional “force NeuroFlux only” mode (for NFG cadence)
 *  - Cash reserve supports:
 *      - base minReserve / pctReserve
 *      - hardReserve (absolute floor)
 *      - spendFracCap (cap spending to X% of current money, like corp lane)
 *
 * Notes
 *  - Probe-safe: if Singularity APIs aren't available, returns ok:false
 *  - This module is import-only (no --help; not intended to run directly)
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

  // Spend governor (optional):
  // If set (0..1), reserve will also include money * (1 - spendFracCap)
  // Example: spendFracCap=0.20 means “spend at most 20% of current cash per pass”.
  spendFracCap: null,

  // Optional hard floor reserve (absolute dollars, independent of pctReserve)
  hardReserve: 0,

  // What to buy:
  buyNeuroFlux: false,
  maxPurchasesPerCheck: 8, // safety cap to avoid spending spree from one tick

  // Filtering behavior:
  preferDesiredOnly: false, // if true: buy only desired augs; else: buy any eligible unless blocked

  // Desired/blocked are passed in by caller per-phase.
  desiredNames: new Set(),
  blockedNames: new Set(),
};

// ------------------------------------------------------------
// Allowlists (Phase sets)
// ------------------------------------------------------------

// Your “after gang” allowlist from Hacking Augs.txt
export const HACKING_AUG_ALLOWLIST = new Set([
  "Neurotrainer I",
  "Hacknet Node NIC Architecture Neural-Upload",
  "Hacknet Node Cache Architecture Neural-Upload",
  "Synaptic Enhancement Implant",
  "BitWire",
  "ADR-V1 Pheromone Gene",
  "Social Negotiation Assistant (S.N.A)",
  "Neurotrainer II",
  "Hacknet Node Core Direct-Neural Interface",
  "Cranial Signal Processors - Gen I",
  "Artificial Synaptic Potentiation",
  "Cranial Signal Processors - Gen II",
  "Neurotrainer III",
  "Power Recirculation Core",
  "Neural-Retention Enhancement",
  "Embedded Netburner Module",
  "Neuregen Gene Modification",
  "The Shadow's Simulacrum",
  "DataJack",
  "Cranial Signal Processors - Gen III",
  "ADR-V2 Pheromone Gene",
  "FocusWire",
  "Cranial Signal Processors - Gen IV",
  "Enhanced Myelin Sheathing",
  "Embedded Netburner Module Core Implant",
  "HyperSight Corneal Implant",
  "Artificial Bio-neural Network Implant",
  "Neuralstimulator",
  "PC Direct-Neural Interface",
  "Xanipher",
  "BitRunners Neurolink",
  "Embedded Netburner Module Core V2 Upgrade",
  "PC Direct-Neural Interface Optimization Submodule",
  "SPTN-97 Gene Modification",
  "Embedded Netburner Module Analyze Engine",
  "Embedded Netburner Module Direct Memory Access Upgrade",
  "Embedded Netburner Module Core V3 Upgrade",
  "PC Direct-Neural Interface NeuroNet Injector",
  "QLink",
  "CRTX42-AA Gene Modification",
]);

// “Pre-gang” combat focus: keep this conservative + keyword assisted.
// (If you want a stricter/expanded combat set later, we can tune it.)
export const COMBAT_AUG_PREFER = new Set([
  // Common “good early combat” augs (names can vary by version/mods; keywords catch the rest)
  "Bionic Arms",
  "Bionic Legs",
  "Bionic Spine",
  "Synthetic Heart",
  "Graphene Bone Lacings",
  "Synfibril Muscle",
  "Nanofiber Weave",
  "NEMEAN Subdermal Weave",
  "Wired Reflexes",
]);

// Keywords for “combat-ish” augment names (fallback when allowlist doesn’t include it)
const COMBAT_KEYWORDS = [
  "strength",
  "defense",
  "dexterity",
  "agility",
  "combat",
  "blade",
  "reflex",
  "muscle",
  "bone",
  "skin",
  "weave",
  "heart",
  "arm",
  "leg",
  "spine",
];

// Keywords: if aug name contains these (case-insensitive), it’s likely valuable (hacking/rep)
const HACKING_KEYWORDS = [
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
    && typeof ns.singularity.purchaseAugmentation === "function"
    && typeof ns.singularity.getFactionRep === "function";
}

// ------------------------------------------------------------
// Core helpers
// ------------------------------------------------------------

export function getCashReserve(ns, opts = {}) {
  const minReserve = Number(opts.minReserve ?? AUG_DEFAULTS.minReserve);
  const pctReserve = Number(opts.pctReserve ?? AUG_DEFAULTS.pctReserve);
  const hardReserve = Number(opts.hardReserve ?? AUG_DEFAULTS.hardReserve ?? 0);

  const spendFracCap = (opts.spendFracCap ?? AUG_DEFAULTS.spendFracCap);
  const spendFrac = (spendFracCap === null || spendFracCap === undefined) ? null : Number(spendFracCap);

  const money = ns.getServerMoneyAvailable("home");

  const pct = Math.max(0, pctReserve) * money;
  const base = Math.max(0, minReserve, pct, hardReserve);

  // Mirror corp-lane style: reserve also includes money*(1-maxSpendFracPerCycle)
  // so spendable is capped to money*spendFracCap (when spendFracCap is set).
  if (Number.isFinite(spendFrac) && spendFrac > 0 && spendFrac < 1) {
    const fracReserve = money * (1 - spendFrac);
    return Math.max(base, fracReserve);
  }

  return base;
}

/**
 * Returns { ownedPlusPurchased, installedOnly, purchasedOnly } sets.
 */
export function getOwnedAndPurchasedAugs(ns) {
  const ownedPlusPurchased = new Set(ns.singularity.getOwnedAugmentations(true) || []);
  const installedOnly = new Set(ns.singularity.getOwnedAugmentations(false) || []);

  const purchasedOnly = new Set();
  for (const a of ownedPlusPurchased) {
    if (!installedOnly.has(a)) purchasedOnly.add(a);
  }

  return { ownedPlusPurchased, installedOnly, purchasedOnly };
}

export function isDesiredAug(name, opts = {}) {
  const desiredNames = opts.desiredNames ?? AUG_DEFAULTS.desiredNames;
  if (desiredNames instanceof Set && desiredNames.has(name)) return true;

  const mode = String(opts.desiredMode || "hacking"); // "hacking" | "combat"
  const lower = String(name || "").toLowerCase();

  const keys = mode === "combat" ? COMBAT_KEYWORDS : HACKING_KEYWORDS;
  for (const k of keys) {
    if (lower.includes(k)) return true;
  }
  return false;
}

/**
 * Collect augmentations you can see from your current factions.
 * Returns: { faction, name, repReq, price }
 */
export function listFactionAugmentations(ns) {
  if (!hasAugApi(ns)) return [];

  const player = ns.getPlayer();
  const factions = Array.from(player.factions || []);

  const out = [];
  for (const f of factions) {
    let augs = [];
    try {
      augs = ns.singularity.getAugmentationsFromFaction(f) || [];
    } catch {
      continue;
    }

    for (const name of augs) {
      try {
        const repReq = ns.singularity.getAugmentationRepReq(name);
        const price = ns.singularity.getAugmentationPrice(name);
        out.push({ faction: f, name, repReq, price });
      } catch {
        // ignore
      }
    }
  }

  return out;
}

/**
 * Determine whether an augmentation is buyable right now from a specific faction (rep gate only).
 */
export function isAugBuyableNow(ns, entry, opts = {}) {
  const name = entry?.name;
  if (!name) return false;

  const blockedNames = opts.blockedNames ?? AUG_DEFAULTS.blockedNames;
  if (blockedNames instanceof Set && blockedNames.has(name)) return false;

  if (!opts.buyNeuroFlux && name === "NeuroFlux Governor") return false;

  try {
    const rep = ns.singularity.getFactionRep(entry.faction);
    return rep >= entry.repReq;
  } catch {
    return false;
  }
}

/**
 * Purchase augmentations according to caller-supplied policy.
 *
 * Options (subset):
 *  - minReserve, pctReserve, hardReserve, spendFracCap
 *  - buyNeuroFlux
 *  - desiredNames, blockedNames
 *  - preferDesiredOnly
 *  - maxPurchasesPerCheck
 *  - desiredMode: "combat" | "hacking"  (keyword fallback)
 *
 * Returns:
 *  {
 *    ok: boolean,
 *    purchased: Array<{ name, faction, price }>,
 *    skipped: Array<{ name, faction, reason }>,
 *    nextTargets: Array<{ name, faction, repReq, repHave, repNeeded, price, desired }>,
 *    reserve: number,
 *    money: number,
 *    reason?: string
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
    hardReserve: Number(opts.hardReserve ?? AUG_DEFAULTS.hardReserve ?? 0),
    spendFracCap: (opts.spendFracCap ?? AUG_DEFAULTS.spendFracCap),

    buyNeuroFlux: Boolean(opts.buyNeuroFlux ?? AUG_DEFAULTS.buyNeuroFlux),

    desiredNames: (opts.desiredNames ?? AUG_DEFAULTS.desiredNames),
    blockedNames: (opts.blockedNames ?? AUG_DEFAULTS.blockedNames),

    preferDesiredOnly: Boolean(opts.preferDesiredOnly ?? AUG_DEFAULTS.preferDesiredOnly),
    maxPurchasesPerCheck: Math.max(1, Number(opts.maxPurchasesPerCheck ?? AUG_DEFAULTS.maxPurchasesPerCheck)),

    desiredMode: String(opts.desiredMode || "hacking"),
  };

  const money = ns.getServerMoneyAvailable("home");
  const reserve = getCashReserve(ns, config);

  const { ownedPlusPurchased } = getOwnedAndPurchasedAugs(ns);
  const entries = listFactionAugmentations(ns);

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

    // NOTE: keep e's fields + add desired flag
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
    } catch {
      // ignore
    }
  }

  // Sort nextTargets: desired first, then lowest rep needed, then cheapest
  nextTargets.sort((a, b) => {
    if (a.desired !== b.desired) return a.desired ? -1 : 1;
    if (a.repNeeded !== b.repNeeded) return a.repNeeded - b.repNeeded;
    return (a.price ?? 0) - (b.price ?? 0);
  });

  // Pick buyable-now candidates and sort by priority:
  // desired first, then cheapest first, then lowest repReq.
  const buyable = candidates
    .filter(c => isAugBuyableNow(ns, c, config))
    .sort((a, b) => {
      if (a.desired !== b.desired) return a.desired ? -1 : 1;
      if (a.price !== b.price) return (a.price ?? 0) - (b.price ?? 0);
      return (a.repReq ?? 0) - (b.repReq ?? 0);
    });

  const purchased = [];
  let purchasesLeft = config.maxPurchasesPerCheck;
  const boughtNames = new Set();

  for (const c of buyable) {
    if (purchasesLeft <= 0) break;
    if (boughtNames.has(c.name)) continue;

    // Re-check money live (prices can change as you buy)
    const curMoney = ns.getServerMoneyAvailable("home");
    const curReserve = getCashReserve(ns, config);
    const spendable = curMoney - curReserve;

    const price = Number(c.price ?? 0);
    if (!Number.isFinite(price) || price <= 0) continue;

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
    } catch {
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
