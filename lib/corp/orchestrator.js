/*
 * lib/corp/orchestrator.js
 *
 * Fresh corp orchestrator (state machine + spend gate).
 * One capex action per tick. Offer-aware slow spending.
 *
 * Canonical tick signature:
 *   runCorpTick(ns, corp, cfg, state, log)
 */

export function runCorpTick(ns, corp, cfg, stateRoot, log) {
  const state = initCorpState(stateRoot);

  const corpInfo = safeObj(() => corp.getCorporation(), null);
  if (!corpInfo) return;

  // Offer awareness
  const offer = (typeof corp.getInvestmentOffer === "function")
    ? safeObj(() => corp.getInvestmentOffer(), null)
    : null;
  state.offer = offer || null;

  // Maintenance plane (safe-ish)
  try {
    maintainSellAndSmartSupply(corp, cfg, state, log);
  } catch (e) {
    log.warn("maint", `Exception: ${String(e)}`);
  }

  // If funds are 0, only do maintenance and idle.
  const funds = Number(corpInfo.funds || 0);
  if (funds <= 0) {
    if (cfg?.logging?.debug) log.debug("tick", `funds=0; idle phase=${state.phase}`);
    return;
  }

  // Pick exactly ONE next capex intent
  const intent = pickNextIntent(ns, corp, cfg, state, log);
  if (!intent) {
    if (cfg?.logging?.debug) {
      log.debug("tick", `idle phase=${state.phase} funds=${fmt(funds)}`);
    }
    return;
  }

  // Offer-aware spend posture
  const posture = getSpendPosture(cfg, state, corpInfo);

  // Cooldown on repeated failures (check BEFORE spend math so we don't spam logs)
  const now = Date.now();
  const lastFail = Number(state.failAt[intent.key] || 0);
  if (now - lastFail < posture.failCooldownMs) return;

  // Hard throttle: one action per tick
  const gate = canSpend(funds, posture, intent.cost);

  if (!gate.ok) {
    if (cfg?.logging?.debug) {
      log.debug(
        "spend",
        `blocked ${intent.key} cost=${fmt(intent.cost)} spendable=${fmt(gate.spendable)} reserve=${fmt(gate.reserve)} posture=${posture.mode}`
      );
    }
    return;
  }

  try {
    intent.exec();
    log.info("capex", intent.desc);
  } catch (e) {
    state.failAt[intent.key] = now;
    log.warn("capex", `failed ${intent.key}: ${String(e)}`);
  }
}

// ------------------------------------------------------------
// State
// ------------------------------------------------------------

function initCorpState(root) {
  if (!root) throw new Error("stateRoot missing");

  // Ensure namespace exists
  if (!root.corp) root.corp = {};

  // IMPORTANT: declare s before using it
  const s = root.corp;

  // Core fields
  if (!s.phase) s.phase = "BOOTSTRAP";
  if (!s.failAt) s.failAt = {};
  if (!s.offer) s.offer = null;

  // Plan targets
  if (!s.plan) {
    s.plan = {
      agri: { type: "Agriculture", name: "Agri" },
      cities: ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"],
      cityIndex: 0,
      officeSizeTarget: 15,
      warehouseSizeTarget: 500,
      officeStep: 3,
      warehouseStep: 100,
    };
  }

  return s;
}


// ------------------------------------------------------------
// Planning: next intent (one step at a time)
// ------------------------------------------------------------

function pickNextIntent(ns, corp, cfg, state, log) {
  void ns; void log;
    if (state.phase === "BOOTSTRAP") {
    const next = planBootstrapFirstDivision(corp, state);
    if (next) return next;

    state.phase = "UNLOCKS";
  }

  // Phase 1: Unlocks (Export, Smart Supply)
  if (state.phase === "UNLOCKS") {
    const next = planUnlocks(corp);
    if (next) return next;

    state.phase = "AGRI_CITY";
  }

  // Phase 2+: Agriculture city-by-city build
  if (state.phase === "AGRI_CITY") {
    const plan = state.plan;
    const city = String(plan.cities[plan.cityIndex] || "").trim();
    if (!city) return null;

    const intent = planAgriCityStep(corp, cfg, state, plan, city);
    if (intent) return intent;

    // City complete -> advance to next city
    plan.cityIndex++;
    if (plan.cityIndex >= plan.cities.length) {
      state.phase = "AGRI_DONE";
    }
    return null;
  }

  return null;
}

function planBootstrapFirstDivision(corp, state) {
  // If you truly have zero divisions, we need a first revenue source.
  const corpInfo = safeObj(() => corp.getCorporation(), null);
  const divs = Array.isArray(corpInfo?.divisions) ? corpInfo.divisions : [];

  // If any division exists, bootstrap is done.
  if (divs.length > 0) return null;

  const divType = state.plan.agri.type; // "Agriculture"
  const divName = state.plan.agri.name; // "Agri"
  const city = String(state.plan.cities?.[0] || "Sector-12");

  // Create Agri first (cost ~40b)
  const div = safeObj(() => corp.getDivision(divName), null);
  if (!div) {
    return {
      key: `div:create:${divName}`,
      desc: `Create division ${divName} (${divType})`,
      cost: estimateDivisionCreateCostStrict(corp, divType),
      exec: () => corp.expandIndustry(divType, divName),
    };
  }

  // Ensure it's in the starter city (Sector-12). expandCity costs 4b, so this will happen earlier than 40b.
  const have = new Set(div.cities || []);
  if (!have.has(city)) {
    return {
      key: `div:expandCity:${divName}:${city}`,
      desc: `Expand ${divName} to ${city}`,
      cost: getOfficeInitialCost(corp),
      exec: () => corp.expandCity(divName, city),
    };
  }

  // Ensure warehouse exists so we can sell/operate
  if (!safeBool(() => corp.hasWarehouse(divName, city), false)) {
    return {
      key: `wh:purchase:${divName}:${city}`,
      desc: `Purchase warehouse (${divName} / ${city})`,
      cost: getWarehouseInitialCost(corp),
      exec: () => corp.purchaseWarehouse(divName, city),
    };
  }

  // Done with bootstrap
  return null;
}

// ------------------------------------------------------------
// Unlock planning
// ------------------------------------------------------------

function planUnlocks(corp) {
  if (!safeBool(() => corp.hasUnlock("Export"), false)) {
    return {
      key: "unlock:Export",
      desc: "Purchase unlock: Export",
      cost: safeNumber(() => corp.getUnlockCost("Export"), Infinity),
      exec: () => corp.purchaseUnlock("Export"),
    };
  }

  if (!safeBool(() => corp.hasUnlock("Smart Supply"), false)) {
    return {
      key: "unlock:SmartSupply",
      desc: "Purchase unlock: Smart Supply",
      cost: safeNumber(() => corp.getUnlockCost("Smart Supply"), Infinity),
      exec: () => corp.purchaseUnlock("Smart Supply"),
    };
  }

  return null;
}

// ------------------------------------------------------------
// Agriculture city step planner
// ------------------------------------------------------------

function planAgriCityStep(corp, cfg, state, plan, city) {
  const divName = plan.agri.name;
  const divType = plan.agri.type;

  // Ensure division exists
  const div = safeObj(() => corp.getDivision(divName), null);
  if (!div) {
    const cost = estimateDivisionCreateCostStrict(corp, divType); // uses startingCost
    return {
      key: `div:create:${divName}`,
      desc: `Create division ${divName} (${divType})`,
      cost,
      exec: () => corp.expandIndustry(divType, divName),
    };
  }

  // Ensure city expanded
  const have = new Set(div.cities || []);
  if (!have.has(city)) {
    const officeCost = getOfficeInitialCost(corp);
    return {
      key: `div:expandCity:${divName}:${city}`,
      desc: `Expand ${divName} to ${city}`,
      cost: officeCost,
      exec: () => corp.expandCity(divName, city),
    };
  }

    // Warehouse steps are not always available (API gating).
    // If purchaseWarehouse throws "no access", we skip warehouse work entirely for now.
    if (hasWarehouseApi(corp)) {
        if (!safeBool(() => corp.hasWarehouse(divName, city), false)) {
        const whCost = getWarehouseInitialCost(corp);
        return {
            key: `wh:purchase:${divName}:${city}`,
            desc: `Purchase warehouse (${divName} / ${city})`,
            cost: whCost,
            exec: () => corp.purchaseWarehouse(divName, city),
        };
        }
    } else {
        // One-time note
        if (!state.notes) state.notes = {};
        if (!state.notes.noWarehouseApi) {
        state.notes.noWarehouseApi = true;
        log.warn("bootstrap", "Warehouse API not available yet; skipping warehouse + Smart Supply steps for now.");
        }
    }


  // Ensure Smart Supply enabled (cheap, but do it as maintenance-style capex step if needed)
  if (hasWarehouseApi(corp) &&
      safeBool(() => corp.hasUnlock("Smart Supply"), false) &&
      safeBool(() => corp.hasWarehouse(divName, city), false)) {
    const wh = safeObj(() => corp.getWarehouse(divName, city), null);
    const ssEnabled = Boolean(wh?.smartSupplyEnabled);
    if (!ssEnabled) {
      return {
        key: `wh:smartSupplyOn:${divName}:${city}`,
        desc: `Enable Smart Supply (${divName} / ${city})`,
        cost: 0,
        exec: () => corp.setSmartSupply(divName, city, true),
      };
    }
  }


  // Ensure office size to target (incremental; cost best-effort with fallback estimate)
  const office = safeObj(() => corp.getOffice(divName, city), null);
  const target = Number(plan.officeSizeTarget || 15);

  if (office && Number(office.size || 0) < target) {
    const current = Number(office.size || 0);
    const remaining = target - current;
    const step = Math.max(1, Math.floor(Number(plan.officeStep || 3)));
    const add = Math.max(1, Math.min(step, remaining));

    const cost = bestEffortOfficeUpgradeCost(corp, divName, city, add);
    return {
      key: `office:upgrade:${divName}:${city}:+${add}`,
      desc: `Upgrade office size +${add} (${divName} / ${city})`,
      cost,
      exec: () => corp.upgradeOfficeSize(divName, city, add),
    };
  }

  // Ensure hired to fill
  if (office) {
    const emp = Number(office.numEmployees || 0);
    const size = Number(office.size || 0);
    if (emp < size) {
      return {
        key: `office:hireToFill:${divName}:${city}`,
        desc: `Hire employees to fill office (${divName} / ${city})`,
        cost: 0,
        exec: () => hireToFill(corp, divName, city),
      };
    }
  }

  // Ensure job assignments
  if (cfg?.jobs?.enabled !== false) {
    return {
      key: `office:jobs:${divName}:${city}`,
      desc: `Assign jobs (${divName} / ${city})`,
      cost: 0,
      exec: () => assignJobsBestEffort(corp, divName, city),
    };
  }

  // Ensure warehouse size target (incremental; cost best-effort with fallback estimate)
  const wh = safeObj(() => corp.getWarehouse(divName, city), null);
  const whTarget = Number(plan.warehouseSizeTarget || 500);

  if (wh && Number(wh.size || 0) < whTarget) {
    const current = Number(wh.size || 0);
    const remaining = whTarget - current;
    const step = Math.max(10, Math.floor(Number(plan.warehouseStep || 100)));
    const add = Math.max(10, Math.min(step, remaining));

    const cost = bestEffortWarehouseUpgradeCost(corp, divName, city, add);
    return {
      key: `wh:upgrade:${divName}:${city}:+${add}`,
      desc: `Upgrade warehouse size +${add} (${divName} / ${city})`,
      cost,
      exec: () => corp.upgradeWarehouse(divName, city, add),
    };
  }

  return null;
}

// ------------------------------------------------------------
// Maintenance plane (sell + Smart Supply toggles)
// ------------------------------------------------------------

function maintainSellAndSmartSupply(corp, cfg, state, log) {
  void state; void log;

  const agri = safeObj(() => corp.getDivision("Agri"), null);
  if (!agri) return;

  for (const city of agri.cities || []) {
    if (safeBool(() => corp.hasUnlock("Smart Supply"), false) &&
        safeBool(() => corp.hasWarehouse("Agri", city), false)) {
      try { corp.setSmartSupply("Agri", city, true); } catch {}
    }

    // Sell common Agri mats
    try { corp.sellMaterial("Agri", city, "Food", "MAX", "MP"); } catch {}
    try { corp.sellMaterial("Agri", city, "Plants", "MAX", "MP"); } catch {}
  }

  void cfg;
}

// ------------------------------------------------------------
// Spend posture / offer awareness
// ------------------------------------------------------------

function getSpendPosture(cfg, state, corpInfo) {
  const offer = state.offer;
  const funds = Number(corpInfo?.funds || 0);

  const offerSafe = {
    mode: "offer-safe",
    // allow up to 30% spend while offer is pending, but keep a huge cash reserve
    maxSpendFrac: 0.30,
    reserveFunds: Math.max(20_000_000_000, funds * 0.70),
    failCooldownMs: 60_000,
};


  const normal = {
    mode: "normal",
    maxSpendFrac: 0.35,
    reserveFunds: 2_000_000_000,
    failCooldownMs: 30_000,
  };

  if (offer && typeof offer.round === "number" && offer.round >= 1) {
    if (offer.round === 1) return offerSafe;
    return { ...offerSafe, maxSpendFrac: 0.15, reserveFunds: Math.max(5_000_000_000, funds * 0.80) };
  }

  const mode = String(cfg?.pacing?.mode || "");
  if (mode === "offerSafe") return offerSafe;
  if (mode === "normal") return normal;

  return normal;
}

function canSpend(corpFunds, posture, cost) {
  const funds = Number(corpFunds || 0);
  const c = Number(cost);

  if (!Number.isFinite(c) || c < 0) {
    return { ok: false, funds, reserve: funds, spendable: 0 };
  }

  const reserveA = Number(posture?.reserveFunds ?? 0);
  const maxSpendFrac = Number(posture?.maxSpendFrac ?? 1);

  const reserveB = funds * (1 - maxSpendFrac);
  const reserve = Math.max(reserveA, reserveB);

  const spendable = Math.max(0, funds - reserve);
  return { ok: c <= spendable, funds, reserve, spendable };
}

// ------------------------------------------------------------
// Actions (helpers)
// ------------------------------------------------------------

function hireToFill(corp, divName, city) {
  const office = corp.getOffice(divName, city);
  const size = Number(office?.size || 0);
  const emp = Number(office?.numEmployees || 0);
  const need = Math.max(0, size - emp);

  for (let i = 0; i < need; i++) {
    try { corp.hireEmployee(divName, city); } catch { break; }
  }
}

function assignJobsBestEffort(corp, divName, city) {
  const office = safeObj(() => corp.getOffice(divName, city), null);
  if (!office) return;

  const n = Number(office.numEmployees || 0);
  if (n <= 0) return;

  const interns = Math.max(0, Math.floor(n / 6));
  const remaining = n - interns;

  const ops = Math.floor(remaining * 0.35);
  const eng = Math.floor(remaining * 0.35);
  const bus = Math.floor(remaining * 0.15);
  const mgmt = Math.max(0, remaining - (ops + eng + bus));

  try { corp.setAutoJobAssignment(divName, city, "Intern", interns); } catch {}
  try { corp.setAutoJobAssignment(divName, city, "Operations", ops); } catch {}
  try { corp.setAutoJobAssignment(divName, city, "Engineer", eng); } catch {}
  try { corp.setAutoJobAssignment(divName, city, "Business", bus); } catch {}
  try { corp.setAutoJobAssignment(divName, city, "Management", mgmt); } catch {}
  try { corp.setAutoJobAssignment(divName, city, "Research & Development", 0); } catch {}
}

// ------------------------------------------------------------
// Cost helpers (use real costs where possible; fallback estimates otherwise)
// ------------------------------------------------------------

function getOfficeInitialCost(corp) {
  const c = safeObj(() => corp.getConstants(), null);
  const v = Number(c?.officeInitialCost);
  return Number.isFinite(v) ? v : Infinity;
}

function getWarehouseInitialCost(corp) {
  const c = safeObj(() => corp.getConstants(), null);
  const v = Number(c?.warehouseInitialCost);
  return Number.isFinite(v) ? v : Infinity;
}

function estimateDivisionCreateCostStrict(corp, divType) {
  const raw = safeObj(() => corp.getIndustryData(divType), null);
  const cost = Number(raw?.startingCost);
  return Number.isFinite(cost) && cost > 0 ? cost : Infinity;
}

function bestEffortOfficeUpgradeCost(corp, divName, city, add) {
  // Prefer API if it returns numeric. Your scratch currently returns "?" (non-numeric),
  // so fall back to a conservative estimate based on officeInitialCost.
  const api = (typeof corp.getOfficeSizeUpgradeCost === "function")
    ? safeNumber(() => corp.getOfficeSizeUpgradeCost(divName, city, add), NaN)
    : NaN;

  if (Number.isFinite(api) && api > 0) return api;

  // Conservative guess: treat each seat as 20% of opening a new office (very safe under offer-safe posture).
  const base = getOfficeInitialCost(corp);
  if (!Number.isFinite(base) || base <= 0) return Infinity;
  return base * 0.20 * add;
}

function bestEffortWarehouseUpgradeCost(corp, divName, city, add) {
  const api = (typeof corp.getUpgradeWarehouseCost === "function")
    ? safeNumber(() => corp.getUpgradeWarehouseCost(divName, city, add), NaN)
    : NaN;

  if (Number.isFinite(api) && api > 0) return api;

  // Conservative guess: per 100 size costs 25% of initial warehouse.
  const base = getWarehouseInitialCost(corp);
  if (!Number.isFinite(base) || base <= 0) return Infinity;

  const units = Math.max(1, add / 100);
  return base * 0.25 * units;
}

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------

function safeObj(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}
function safeBool(fn, fallback) {
  try { return Boolean(fn()); } catch { return fallback; }
}
function safeNumber(fn, fallback) {
  try {
    const x = Number(fn());
    return Number.isFinite(x) ? x : fallback;
  } catch {
    return fallback;
  }
}
function fmt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "?";
  if (x >= 1e12) return (x / 1e12).toFixed(2) + "t";
  if (x >= 1e9)  return (x / 1e9).toFixed(2) + "b";
  if (x >= 1e6)  return (x / 1e6).toFixed(2) + "m";
  if (x >= 1e3)  return (x / 1e3).toFixed(2) + "k";
  return String(Math.round(x));
}

function hasWarehouseApi(corp) {
  // Some corp functions exist but throw "You do not have access to this API."
  // We'll treat that as "API locked" and skip warehouse-related steps.
  try {
    // A harmless call that still exercises the permission gate:
    // getWarehouse will throw if API locked OR if warehouse doesn't exist.
    // So instead, we test by calling purchaseWarehouse costlessly? Can't.
    // Best option: call hasWarehouse on known-safe args only after division/city exists.
    // Here we just check function presence and rely on try/catch at call sites.
    return typeof corp.purchaseWarehouse === "function" &&
           typeof corp.hasWarehouse === "function" &&
           typeof corp.getWarehouse === "function";
  } catch {
    return false;
  }
}

