/** @param {NS} ns */
/*
 * lib/corp-lane.js
 *
 * Description
 *  Corporation automation lane with strict spend gating.
 *  Primary goal: NEVER “run away” with spending early and sabotage investments.
 *
 * Behavior (high level)
 *  - Only acts when Corporation API exists + corp exists
 *  - Runs “maintenance” freely (sales, Smart Supply enablement, job assignment)
 *  - Performs at most ONE capex action per corp cycle (START->...->...):
 *      - create division
 *      - expand ONE city
 *      - buy ONE warehouse
 *      - upgrade ONE warehouse
 *      - upgrade ONE office size (and hire)
 *      - start ONE product (product divisions)
 *      - discontinue ONE product (product divisions, when at capacity)
 *      - buy ONE unlock (Smart Supply / Market Research / etc.)
 *      - buy ONE research (AutoPartyManager, Market-TA, Capacity, etc.)
 *      - hire ONE AdVert (product divisions)
 *
 * Notes
 *  - Import-only module. Not meant to be run directly.
 *  - Designed for “quiet terminal / rich log” controller style:
 *      - pushes terminal-facing messages into msgs[] only when a real action occurs
 *      - avoids repeated “can’t afford” spam via cooldowns
 */

export const CORP_LANE_DEFAULTS = {
  enabled: true,

  // Which cities to expand to (in order)
  cities: ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"],

  // Division plan (creation + expansion order)
  divisions: [
    { type: "Agriculture", name: "Agri",    officeSizeTarget: 4 },
    { type: "Tobacco",     name: "Tobacco", officeSizeTarget: 4 },
    { type: "Chemical",    name: "Chem",    officeSizeTarget: 4 },
    { type: "Robotics",    name: "Robo",    officeSizeTarget: 4 },
  ],

  // Jobs
  assignJobs: true,

  // Capex spend governor
  reserveFunds: 2_000_000_000,
  maxSpendFracPerCycle: 0.20,
  oneCapexActionPerCycle: true,

  // Tick cadence
  tickMs: 5_000,

  // Anti-spam cooldown on failed “can’t afford”
  failCooldownMs: 60_000,

  // Warehouse upgrade policy (conservative)
  warehouseFillUpgradeThreshold: 0.85,   // if used/size >= this, consider upgrade (capex)
  warehouseMinSizeForUpgrade: 200,       // don't churn upgrades on tiny warehouses
  warehouseUpgradeLevelsPerAction: 1,    // upgradeWarehouse(div, city, levels)

  // Product policy
  productDivTypes: ["Tobacco", "Robotics"],
  productDevCityPreference: "Sector-12", // try this city first for makeProduct/getProduct
  productBudgetFracOfSpendable: 0.50,    // portion of spendable to allocate to product (capped below)
  productBudgetMin: 100_000_000,
  productBudgetMax: 50_000_000_000,

  // When at capacity and all products are finished, discontinue the weakest before creating next
  enableProductDiscontinue: true,

  // AdVert policy (product divisions only)
  enableAdVert: true,
  advertBudgetFracOfSpendable: 0.10,     // conservative
  advertBudgetMin: 50_000_000,
  advertBudgetMax: 5_000_000_000,

  // Unlock purchase order (global). (No flags; always-on, but gated by spend.)
  unlockPriority: [
    "Smart Supply",
    "Market Research - Demand",
    "Market Data - Competition",
  ],

  // Research purchase order (per division)
  // Notes:
  // - AutoPartyManager is your stated need (interns go away when researched)
  // - Market-TA.* enables setProductMarketTA*, setMaterialMarketTA*
  // - Capacity upgrades increase max products
  researchPriority: [
    "AutoPartyManager",
    "Market-TA.I",
    "Market-TA.II",
    "uPgrade: Capacity.I",
    "uPgrade: Capacity.II",
  ],
};

export function runCorpTick(ns, cfg, state, msgs) {
  const laneCfg = { ...CORP_LANE_DEFAULTS, ...((cfg && cfg.corp) || {}) };
  if (!laneCfg.enabled) return;

  if (!state) return;
  if (!state.lastTick) state.lastTick = 0;
  if (!state.lastCycleKey) state.lastCycleKey = "";
  if (!state.cycleSpent) state.cycleSpent = 0;
  if (!state.failAt) state.failAt = {}; // actionKey -> timestamp

  const now = Date.now();
  if (now - state.lastTick < laneCfg.tickMs) return;
  state.lastTick = now;

  const corp = ns.corporation;
  if (!corp) return;
  if (!safeBool(() => corp.hasCorporation(), false)) return;

  const corpInfo = safeObj(() => corp.getCorporation(), null);
  if (!corpInfo) return;

  // Reset per-cycle capex allowance on START
  const cycleKey = `${corpInfo.state}`;
  if (cycleKey !== state.lastCycleKey) {
    state.lastCycleKey = cycleKey;
    if (corpInfo.state === "START") {
      state.cycleSpent = 0;
      state.didCapexThisCycle = false;
    }
  }

  const plan = Array.isArray(laneCfg.divisions) ? laneCfg.divisions : [];
  if (plan.length === 0) return;

  // ------------------------------------------------------------
  // A) Ensure divisions exist (capex-gated), in order.
  //     If we can't create the first missing division, we stop.
  // ------------------------------------------------------------
  for (const d of plan) {
    const divName = String(d?.name || "").trim();
    const divType = String(d?.type || "").trim();
    if (!divName || !divType) continue;

    if (!divisionExists(corp, divName)) {
      const ok = tryCapex(
        ns,
        laneCfg,
        state,
        msgs,
        `expandIndustry:${divName}`,
        () => getExpandIndustryCostSafe(corp, divType),
        (cost) => {
          corp.expandIndustry(divType, divName);
          return { changed: true, msg: `[corp] Created division "${divName}" (${divType}) cost~${fmt(cost)}` };
        }
      );
      if (!ok) return;
    }
  }

  // ------------------------------------------------------------
  // B) Maintenance (no capex):
  //    - Smart Supply enabling (if unlocked)
  //    - Sales: Agri materials + product selling
  //    - Market-TA toggles if researched
  //    - Jobs (intern policy + ratios)
  // ------------------------------------------------------------
  for (const d of plan) {
    const divName = String(d?.name || "").trim();
    if (!divName || !divisionExists(corp, divName)) continue;

    const div = safeObj(() => corp.getDivision(divName), null);
    if (!div) continue;

    for (const city of div.cities || []) {
      // Always attempt to enable smart supply if unlock exists (safe/no-spend)
      ensureSmartSupplyEnabledSafe(ns, divName, city);

      // Agri-specific: sell Food; do not sell Plants; buffer Water/Energy unless Smart Supply
      if (div.type === "Agriculture") {
        ensureAgriSalesFoodOnlySafe(ns, divName, city);
        maintainAgriInputsSafe(ns, divName, city);
      }

      // Product selling (independent of assignJobs)
      ensureProductSalesSafe(ns, divName, city);

      // Market-TA toggles (safe; no-spend)
      ensureMarketTASafe(ns, divName, city);

      // Jobs (optional)
      if (laneCfg.assignJobs) {
        refreshJobSpreadSafe(ns, divName, city);
      }
    }
  }

  // If we already did capex this cycle, stop.
  if (laneCfg.oneCapexActionPerCycle && state.didCapexThisCycle) return;

  // ------------------------------------------------------------
  // C) Capex progression (one action per cycle total), in plan order
  //     For each division, priority:
  //       1) buy unlock(s) (global)
  //       2) buy research (per division)
  //       3) expand to next city
  //       4) buy one missing warehouse
  //       5) upgrade one warehouse (if too full)
  //       6) upgrade one office to target size + hire
  //       7) product maintenance: discontinue (if at cap) then start product
  //       8) hire AdVert (product divs)
  // ------------------------------------------------------------
  // 1) Global unlocks (Smart Supply, Market Research, etc.)
  if (tryBuyUnlocks(ns, laneCfg, state, msgs)) return;

  for (const d of plan) {
    const divName = String(d?.name || "").trim();
    if (!divName || !divisionExists(corp, divName)) continue;

    const div = safeObj(() => corp.getDivision(divName), null);
    if (!div) continue;

    const officeTarget = Math.max(
      1,
      Number.isFinite(Number(d?.officeSizeTarget)) ? Number(d.officeSizeTarget) : 4
    );

    // 2) Per-division research
    if (tryBuyResearch(ns, laneCfg, state, msgs, divName)) return;

    // 3) Expand to next missing city
    const nextCityToExpand = pickNextMissingCity(div, laneCfg.cities);
    if (nextCityToExpand) {
      const ok = tryCapex(
        ns,
        laneCfg,
        state,
        msgs,
        `expandCity:${divName}:${nextCityToExpand}`,
        () => getExpandCityCostSafe(corp),
        (cost) => {
          corp.expandCity(divName, nextCityToExpand);
          return { changed: true, msg: `[corp] [${divName}] expanded to ${nextCityToExpand} cost~${fmt(cost)}` };
        }
      );
      if (ok) return;
    }

    // 4) Warehouse in one active city
    const cityNeedingWarehouse = pickCityNeedingWarehouse(corp, divName, div.cities || []);
    if (cityNeedingWarehouse) {
      const ok = tryCapex(
        ns,
        laneCfg,
        state,
        msgs,
        `purchaseWarehouse:${divName}:${cityNeedingWarehouse}`,
        () => getPurchaseWarehouseCostSafe(corp, cityNeedingWarehouse),
        (cost) => {
          corp.purchaseWarehouse(divName, cityNeedingWarehouse);
          return { changed: true, msg: `[corp] [${divName}/${cityNeedingWarehouse}] bought warehouse cost~${fmt(cost)}` };
        }
      );
      if (ok) return;
    }

    // 5) Warehouse upgrade if too full (one city per cycle)
    const whUpgradeCity = pickCityForWarehouseUpgrade(corp, divName, div.cities || [], laneCfg);
    if (whUpgradeCity) {
      const ok = tryCapex(
        ns,
        laneCfg,
        state,
        msgs,
        `upgradeWarehouse:${divName}:${whUpgradeCity}:${laneCfg.warehouseUpgradeLevelsPerAction}`,
        () => getWarehouseUpgradeCostSafe(corp, divName, whUpgradeCity, laneCfg.warehouseUpgradeLevelsPerAction),
        (cost) => {
          corp.upgradeWarehouse(divName, whUpgradeCity, laneCfg.warehouseUpgradeLevelsPerAction);
          return {
            changed: true,
            msg: `[corp] [${divName}/${whUpgradeCity}] warehouse +${laneCfg.warehouseUpgradeLevelsPerAction} cost~${fmt(cost)}`
          };
        }
      );
      if (ok) return;
    }

    // 6) Office size baseline (one city per cycle)
    const cityNeedingOffice = pickCityNeedingOfficeSize(corp, divName, div.cities || [], officeTarget);
    if (cityNeedingOffice) {
      const ok = tryCapex(
        ns,
        laneCfg,
        state,
        msgs,
        `upgradeOffice:${divName}:${cityNeedingOffice}:${officeTarget}`,
        () => getOfficeUpgradeCostSafe(corp, divName, cityNeedingOffice, officeTarget),
        (cost) => {
          ensureOfficeSizeAndHireSafe(corp, divName, cityNeedingOffice, officeTarget);
          return { changed: true, msg: `[corp] [${divName}/${cityNeedingOffice}] office->${officeTarget} (incl hire) cost~${fmt(cost)}` };
        }
      );
      if (ok) return;
    }

    // 7) Product lifecycle (product divisions only)
    if (laneCfg.enableProductDiscontinue) {
      const okDisc = tryDiscontinueWorstProductIfAtCap(ns, laneCfg, state, msgs, divName, div);
      if (okDisc) return;
    }
    const okProd = tryMakeProductIfReady(ns, laneCfg, state, msgs, divName, div);
    if (okProd) return;

    // 8) AdVert (product divisions only)
    if (laneCfg.enableAdVert) {
      const okAd = tryHireAdVert(ns, laneCfg, state, msgs, divName, div);
      if (okAd) return;
    }
  }
}

// ---------------------------------------------------------------------
// Spend governor + capex helper
// ---------------------------------------------------------------------

function tryCapex(ns, laneCfg, state, msgs, actionKey, getCostFn, doFn) {
  if (laneCfg.oneCapexActionPerCycle && state.didCapexThisCycle) return false;

  const now = Date.now();
  const lastFail = Number(state.failAt[actionKey] || 0);
  if (now - lastFail < laneCfg.failCooldownMs) return false;

  const corp = ns.corporation;
  const info = safeObj(() => corp.getCorporation(), null);
  if (!info) return false;

  const funds = Number(info.funds || 0);
  const reserveA = laneCfg.reserveFunds;
  const reserveB = funds * (1 - laneCfg.maxSpendFracPerCycle);
  const reserve = Math.max(reserveA, reserveB);

  const spendable = Math.max(0, funds - reserve);
  if (spendable <= 0) return false;

  const cost = Number(safeNum(getCostFn, Infinity));
  if (!Number.isFinite(cost) || cost <= 0) {
    if (spendable < reserveA) return false;
  } else if (cost > spendable) {
    state.failAt[actionKey] = now;
    return false;
  }

  try {
    const r = doFn(cost);
    if (r?.changed) {
      state.cycleSpent += Number.isFinite(cost) ? cost : 0;
      state.didCapexThisCycle = true;
      if (r.msg) msgs.push(r.msg);
      return true;
    }
  } catch {
    state.failAt[actionKey] = now;
    return false;
  }

  return false;
}

// ---------------------------------------------------------------------
// Corporate “safe wrappers”
// ---------------------------------------------------------------------

function divisionExists(corp, divName) {
  try { corp.getDivision(divName); return true; } catch { return false; }
}

function pickNextMissingCity(div, allCities) {
  const have = new Set(div.cities || []);
  for (const c of allCities || []) {
    if (!have.has(c)) return c;
  }
  return "";
}

function pickCityNeedingWarehouse(corp, divName, cities) {
  for (const c of cities || []) {
    try {
      if (!corp.hasWarehouse(divName, c)) return c;
    } catch {}
  }
  return "";
}

function pickCityNeedingOfficeSize(corp, divName, cities, targetSize) {
  for (const c of cities || []) {
    try {
      const o = corp.getOffice(divName, c);
      if ((o?.size || 0) < targetSize) return c;
      if ((o?.numEmployees || 0) < (o?.size || 0)) return c;
    } catch {
      return c;
    }
  }
  return "";
}

function pickCityForWarehouseUpgrade(corp, divName, cities, laneCfg) {
  for (const c of cities || []) {
    try {
      if (!corp.hasWarehouse(divName, c)) continue;
      const wh = corp.getWarehouse(divName, c);
      const size = Number(wh?.size || 0);
      const used = Number(wh?.sizeUsed || 0);
      if (size < laneCfg.warehouseMinSizeForUpgrade) continue;
      if (size > 0 && used / size >= laneCfg.warehouseFillUpgradeThreshold) return c;
    } catch {}
  }
  return "";
}

// ---- Cost probes ----

function getExpandIndustryCostSafe(corp, industry) {
  return safeNum(() => corp.getExpandIndustryCost(industry), Infinity);
}

function getExpandCityCostSafe(corp) {
  return safeNum(() => corp.getExpandCityCost(), Infinity);
}

function getPurchaseWarehouseCostSafe(corp, city) {
  return safeNum(() => corp.getPurchaseWarehouseCost(city), Infinity);
}

function getWarehouseUpgradeCostSafe(corp, divName, city, levels) {
  return safeNum(() => corp.getUpgradeWarehouseCost(divName, city, levels), Infinity);
}

function getOfficeUpgradeCostSafe(corp, divName, city, targetSize) {
  try {
    const office = corp.getOffice(divName, city);
    const need = Math.max(0, targetSize - (office?.size || 0));
    if (need <= 0) return 0;
    return safeNum(() => corp.getOfficeSizeUpgradeCost(divName, city, need), Infinity);
  } catch {
    return Infinity;
  }
}

// ---------------------------------------------------------------------
// Unlock lane (global)
// ---------------------------------------------------------------------

function tryBuyUnlocks(ns, laneCfg, state, msgs) {
  const corp = ns.corporation;
  const order = Array.isArray(laneCfg.unlockPriority) ? laneCfg.unlockPriority : [];
  for (const u of order) {
    const name = String(u || "").trim();
    if (!name) continue;
    if (safeBool(() => corp.hasUnlock(name), false)) continue;

    const ok = tryCapex(
      ns,
      laneCfg,
      state,
      msgs,
      `purchaseUnlock:${name}`,
      () => safeNum(() => corp.getUnlockCost(name), Infinity),
      (cost) => {
        corp.purchaseUnlock(name);
        return { changed: true, msg: `[corp] bought unlock "${name}" cost~${fmt(cost)}` };
      }
    );
    if (ok) return true;
  }
  return false;
}

// ---------------------------------------------------------------------
// Research lane (per division)
// ---------------------------------------------------------------------

function tryBuyResearch(ns, laneCfg, state, msgs, divName) {
  const corp = ns.corporation;
  const list = Array.isArray(laneCfg.researchPriority) ? laneCfg.researchPriority : [];
  for (const r of list) {
    const name = String(r || "").trim();
    if (!name) continue;
    if (safeBool(() => corp.hasResearched(divName, name), false)) continue;

    const ok = tryCapex(
      ns,
      laneCfg,
      state,
      msgs,
      `research:${divName}:${name}`,
      () => safeNum(() => corp.getResearchCost(divName, name), Infinity),
      (cost) => {
        // research() returns boolean; treat success as changed
        const success = safeBool(() => corp.research(divName, name), false);
        if (!success) return { changed: false };
        return { changed: true, msg: `[corp] [${divName}] researched "${name}" cost~${fmt(cost)}` };
      }
    );
    if (ok) return true;
  }
  return false;
}

// ---------------------------------------------------------------------
// Smart Supply / Market-TA maintenance (no capex)
// ---------------------------------------------------------------------

function ensureSmartSupplyEnabledSafe(ns, divName, city) {
  const corp = ns.corporation;
  try {
    if (!corp.hasWarehouse(divName, city)) return;
    if (!safeBool(() => corp.hasUnlock("Smart Supply"), false)) return;
    // Turn on Smart Supply for the division/city (no cost once unlocked)
    try { corp.setSmartSupply(divName, city, true); } catch {}
    // Use default smart supply option; keep conservative (no explicit config here)
    // try { corp.setSmartSupplyOption(divName, city, "none"); } catch {}
  } catch {}
}

function ensureMarketTASafe(ns, divName, city) {
  const corp = ns.corporation;
  try {
    const div = corp.getDivision(divName);
    if (!div) return;

    const hasMTA1 = safeBool(() => corp.hasResearched(divName, "Market-TA.I"), false);
    const hasMTA2 = safeBool(() => corp.hasResearched(divName, "Market-TA.II"), false);

    // Materials: only apply in Agri here; other divisions may be product-only or handled later
    if (div.type === "Agriculture") {
      try { corp.setMaterialMarketTA1(divName, city, "Food", hasMTA1); } catch {}
      try { corp.setMaterialMarketTA2(divName, city, "Food", hasMTA2); } catch {}
      // Plants are set to sell 0 anyway
    }

    // Products: apply for product divisions (if any products exist)
    if (isProductDivisionType(div.type)) {
      const products = Array.isArray(div.products) ? div.products : [];
      for (const p of products) {
        try { corp.setProductMarketTA1(divName, p, hasMTA1); } catch {}
        try { corp.setProductMarketTA2(divName, p, hasMTA2); } catch {}
      }
    }
  } catch {}
}

// ---------------------------------------------------------------------
// Actions: office sizing/hiring
// ---------------------------------------------------------------------

function ensureOfficeSizeAndHireSafe(corp, divName, city, targetSize) {
  let office = null;

  try {
    office = corp.getOffice(divName, city);
  } catch {
    // Best-effort: hire one to force initialization if allowed
    try { corp.hireEmployee(divName, city); } catch {}
    try { office = corp.getOffice(divName, city); } catch { return; }
  }

  const size = Number(office?.size || 0);
  if (size < targetSize) {
    corp.upgradeOfficeSize(divName, city, targetSize - size);
  }

  let updated;
  try { updated = corp.getOffice(divName, city); } catch { return; }
  const toHire = Math.max(0, (updated?.size || 0) - (updated?.numEmployees || 0));
  for (let i = 0; i < toHire; i++) {
    try { corp.hireEmployee(divName, city); } catch { break; }
  }
}

// ---------------------------------------------------------------------
// Product lane (sell + discontinue + create)
// ---------------------------------------------------------------------

function isProductDivisionType(divType) {
  return divType === "Tobacco" || divType === "Robotics";
}

function pickProductCity(cities, preferred) {
  if (!Array.isArray(cities) || cities.length === 0) return "";
  if (preferred && cities.includes(preferred)) return preferred;
  return cities[0];
}

function ensureProductSalesSafe(ns, divName, city) {
  const corp = ns.corporation;
  try {
    const div = corp.getDivision(divName);
    if (!div) return;
    if (!isProductDivisionType(div.type)) return;
    if (!corp.hasWarehouse(divName, city)) return;

    const products = Array.isArray(div.products) ? div.products : [];
    if (products.length === 0) return;

    const useMTA2 = safeBool(() => corp.hasResearched(divName, "Market-TA.II"), false);

    for (const p of products) {
      const prod = safeObj(() => corp.getProduct(divName, city, p), null);
      if (!prod) continue;
      const done = Number(prod.developmentProgress || 0) >= 100;
      if (done) {
        try { corp.sellProduct(divName, city, p, "MAX", "MP", useMTA2); } catch {}
      }
    }
  } catch {}
}

function getMaxProductsSafe(corp, divName, divObj) {
  const direct = Number(divObj?.maxProducts);
  if (Number.isFinite(direct) && direct > 0) return direct;

  let max = 3;
  if (safeBool(() => corp.hasResearched(divName, "uPgrade: Capacity.I"), false)) max += 1;
  if (safeBool(() => corp.hasResearched(divName, "uPgrade: Capacity.II"), false)) max += 1;
  return max;
}

function getSpendableCorpFunds(ns, laneCfg) {
  const corp = ns.corporation;
  const info = safeObj(() => corp.getCorporation(), null);
  if (!info) return 0;

  const funds = Number(info.funds || 0);
  const reserveA = laneCfg.reserveFunds;
  const reserveB = funds * (1 - laneCfg.maxSpendFracPerCycle);
  const reserve = Math.max(reserveA, reserveB);
  return Math.max(0, funds - reserve);
}

function tryDiscontinueWorstProductIfAtCap(ns, laneCfg, state, msgs, divName, divObj) {
  const corp = ns.corporation;
  try {
    if (!isProductDivisionType(String(divObj?.type || ""))) return false;

    const cities = Array.isArray(divObj?.cities) ? divObj.cities : [];
    const city = pickProductCity(cities, laneCfg.productDevCityPreference);
    if (!city) return false;
    if (!safeBool(() => corp.hasWarehouse(divName, city), false)) return false;

    const products = Array.isArray(divObj?.products) ? divObj.products : [];
    if (products.length === 0) return false;

    const maxProducts = getMaxProductsSafe(corp, divName, divObj);
    if (products.length < maxProducts) return false;

    // Only discontinue if all are finished (don't nuke in-dev)
    const productInfos = [];
    for (const p of products) {
      const prod = safeObj(() => corp.getProduct(divName, city, p), null);
      if (!prod) continue;
      const prog = Number(prod.developmentProgress || 0);
      if (prog < 100) return false;
      const rating = Number(prod.rating || 0);
      productInfos.push({ name: p, rating });
    }
    if (productInfos.length === 0) return false;

    // Pick lowest rating
    productInfos.sort((a, b) => a.rating - b.rating);
    const worst = productInfos[0];
    if (!worst?.name) return false;

    // Discontinue is a "capex action" (strategic irreversible change)
    return tryCapex(
      ns,
      laneCfg,
      state,
      msgs,
      `discontinueProduct:${divName}:${worst.name}`,
      () => 1, // no direct cost, but gate via spendable > 0 in tryCapex
      (_cost) => {
        corp.discontinueProduct(divName, worst.name);
        return { changed: true, msg: `[corp] [${divName}] discontinued product "${worst.name}" (rating=${worst.rating.toFixed(2)})` };
      }
    );
  } catch {
    return false;
  }
}

function tryMakeProductIfReady(ns, laneCfg, state, msgs, divName, divObj) {
  const corp = ns.corporation;
  try {
    const divType = String(divObj?.type || "");
    if (!isProductDivisionType(divType)) return false;

    const cities = Array.isArray(divObj?.cities) ? divObj.cities : [];
    const buildCity = pickProductCity(cities, laneCfg.productDevCityPreference);
    if (!buildCity) return false;

    // Need at least one warehouse city
    if (!safeBool(() => corp.hasWarehouse(divName, buildCity), false)) {
      // fall back to any warehouse city
      const anyWhCity = cities.find(c => safeBool(() => corp.hasWarehouse(divName, c), false));
      if (!anyWhCity) return false;
      // if found, use it
      // eslint-disable-next-line no-param-reassign
      // (we won't reassign buildCity; just use anyWhCity in calls)
    }

    const products = Array.isArray(divObj?.products) ? divObj.products : [];
    const maxProducts = getMaxProductsSafe(corp, divName, divObj);
    if (products.length >= maxProducts) return false;

    // Don't start a new product if any existing product is still developing
    const cityForReads = cities.find(c => safeBool(() => corp.hasWarehouse(divName, c), false)) || buildCity;
    for (const p of products) {
      const prod = safeObj(() => corp.getProduct(divName, cityForReads, p), null);
      if (!prod) continue;
      if (Number(prod.developmentProgress || 0) < 100) return false;
    }

    const spendable = getSpendableCorpFunds(ns, laneCfg);
    if (spendable <= 0) return false;

    const totalBudget = clamp(
      spendable * laneCfg.productBudgetFracOfSpendable,
      laneCfg.productBudgetMin,
      laneCfg.productBudgetMax
    );
    const design = Math.floor(totalBudget * 0.50);
    const adv = Math.floor(totalBudget * 0.50);

    const name = makeProductName(divName, products.length + 1);

    const cityToUse = cities.find(c => safeBool(() => corp.hasWarehouse(divName, c), false)) || buildCity;

    return tryCapex(
      ns,
      laneCfg,
      state,
      msgs,
      `makeProduct:${divName}:${name}`,
      () => design + adv,
      (_cost) => {
        corp.makeProduct(divName, cityToUse, name, design, adv);
        return {
          changed: true,
          msg: `[corp] [${divName}] started product "${name}" in ${cityToUse} budget~${fmt(design + adv)} (design=${fmt(design)} adv=${fmt(adv)})`
        };
      }
    );
  } catch {
    return false;
  }
}

function tryHireAdVert(ns, laneCfg, state, msgs, divName, divObj) {
  const corp = ns.corporation;
  try {
    if (!isProductDivisionType(String(divObj?.type || ""))) return false;

    const spendable = getSpendableCorpFunds(ns, laneCfg);
    if (spendable <= 0) return false;

    const cost = safeNum(() => corp.getHireAdVertCost(divName), Infinity);
    if (!Number.isFinite(cost) || cost <= 0) return false;

    // Additional advert budget gate (on top of tryCapex)
    const advertBudget = clamp(
      spendable * laneCfg.advertBudgetFracOfSpendable,
      laneCfg.advertBudgetMin,
      laneCfg.advertBudgetMax
    );
    if (cost > advertBudget) return false;

    return tryCapex(
      ns,
      laneCfg,
      state,
      msgs,
      `hireAdVert:${divName}`,
      () => cost,
      (_cost) => {
        corp.hireAdVert(divName);
        const n = safeNum(() => corp.getHireAdVertCount(divName), 0);
        return { changed: true, msg: `[corp] [${divName}] hired AdVert (count=${Math.floor(n)}) cost~${fmt(cost)}` };
      }
    );
  } catch {
    return false;
  }
}

function makeProductName(divName, n) {
  const short = String(divName).replace(/\s+/g, "").slice(0, 8);
  return `${short}-P${String(n).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------
// Agriculture maintenance
// ---------------------------------------------------------------------

function ensureAgriSalesFoodOnlySafe(ns, divName, city) {
  const corp = ns.corporation;
  try {
    if (!corp.hasWarehouse(divName, city)) return;
    corp.sellMaterial(divName, city, "Food", "MAX", "MP");
    corp.sellMaterial(divName, city, "Plants", "0", "MP");
  } catch {}
}

function maintainAgriInputsSafe(ns, divName, city) {
  // For Agriculture: keep ONLY Water + Energy buffered if Smart Supply is not unlocked.
  const corp = ns.corporation;
  try {
    if (!corp.hasWarehouse(divName, city)) return;

    if (safeBool(() => corp.hasUnlock("Smart Supply"), false)) {
      // Smart Supply handles purchasing; zero manual buy rates.
      for (const mat of ["Water", "Energy"]) {
        try { corp.buyMaterial(divName, city, mat, 0); } catch {}
      }
      return;
    }

    const wh = safeObj(() => corp.getWarehouse(divName, city), null);
    if (!wh) return;

    const used = Number(wh.sizeUsed || 0);
    const total = Math.max(1, Number(wh.size || 0));
    const fill = used / total;

    if (fill >= 0.90) {
      for (const mat of ["Water", "Energy"]) {
        try { corp.buyMaterial(divName, city, mat, 0); } catch {}
      }
      return;
    }

    const office = safeObj(() => corp.getOffice(divName, city), null);
    const size = Number(office?.size || 0);

    const buffers = [
      ["Water",  Math.max(100, size * 75)],
      ["Energy", Math.max(100, size * 75)],
    ];

    for (const [mat, target] of buffers) {
      maintainMaterialBuffer(corp, divName, city, mat, target, size);
    }
  } catch {}
}

function maintainMaterialBuffer(corp, divName, city, mat, targetAmt, officeSize) {
  try {
    const m = corp.getMaterial(divName, city, mat);
    const stored = Number(m?.stored || 0);

    if (stored >= targetAmt * 1.25) {
      corp.buyMaterial(divName, city, mat, 0);
      return;
    }

    const deficit = Math.max(0, targetAmt - stored);
    if (deficit <= 0) {
      corp.buyMaterial(divName, city, mat, 0);
      return;
    }

    const cap = Math.max(1, officeSize * 2); // units/sec
    const rate = Math.min(cap, deficit / 10);

    corp.buyMaterial(divName, city, mat, rate);
  } catch {}
}

// ---------------------------------------------------------------------
// Job assignments (Interns until AutoPartyManager)
// ---------------------------------------------------------------------

function refreshJobSpreadSafe(ns, divName, city) {
  const corp = ns.corporation;
  try {
    const o = corp.getOffice(divName, city);
    const size = Number(o?.size || 0);
    if (size <= 0) return;

    const hasAutoParty = safeBool(() => corp.hasResearched(divName, "AutoPartyManager"), false);
    const interns = hasAutoParty ? 0 : Math.floor(size / 6);

    const coreJobs = ["Operations", "Engineer", "Business", "Management"];
    const allJobs = [...coreJobs, "Intern"];

    for (const j of allJobs) {
      try { corp.setAutoJobAssignment(divName, city, j, 0); } catch {}
    }

    if (interns > 0) {
      try { corp.setAutoJobAssignment(divName, city, "Intern", interns); } catch {}
    }

    const remaining = size - interns;
    if (remaining <= 0) return;

    const ratios = getJobRatiosForDivision(corp, divName);
    const allocation = allocateByRatios(remaining, coreJobs, ratios);

    for (const [job, count] of Object.entries(allocation)) {
      if (count > 0) {
        try { corp.setAutoJobAssignment(divName, city, job, count); } catch {}
      }
    }
  } catch {}
}

function getJobRatiosForDivision(corp, divName) {
  let type = "";
  try { type = String(corp.getDivision(divName)?.type || ""); } catch {}

  const BALANCED = { Operations: 0.30, Engineer: 0.30, Business: 0.20, Management: 0.20 };

  switch (type) {
    case "Agriculture":
      return { Operations: 0.36, Engineer: 0.36, Business: 0.14, Management: 0.14 };
    case "Tobacco":
      return { Operations: 0.22, Engineer: 0.22, Business: 0.36, Management: 0.20 };
    case "Chemical":
      return { Operations: 0.32, Engineer: 0.34, Business: 0.16, Management: 0.18 };
    case "Robotics":
      return { Operations: 0.18, Engineer: 0.46, Business: 0.16, Management: 0.20 };
    default:
      return BALANCED;
  }
}

function allocateByRatios(total, jobs, ratios) {
  const raw = jobs.map(j => {
    const r = Number(ratios?.[j] ?? 0);
    const v = total * r;
    return { job: j, v, base: Math.floor(v), frac: v - Math.floor(v) };
  });

  let used = raw.reduce((s, x) => s + x.base, 0);
  let remaining = total - used;

  raw.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < raw.length && remaining > 0; i++) {
    raw[i].base++;
    remaining--;
  }

  const out = {};
  for (const x of raw) out[x.job] = x.base;
  return out;
}

// ---------------------------------------------------------------------
// small safe helpers
// ---------------------------------------------------------------------

function safeNum(fn, fallback) {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function safeBool(fn, fallback) {
  try { return Boolean(fn()); } catch { return fallback; }
}

function safeObj(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function fmt(n) {
  if (!Number.isFinite(n)) return "?";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "t";
  if (n >= 1e9)  return (n / 1e9).toFixed(2) + "b";
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + "m";
  if (n >= 1e3)  return (n / 1e3).toFixed(2) + "k";
  return String(Math.round(n));
}
