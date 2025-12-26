/** @param {NS} ns */
/*
 * lib/corp-lane.js
 *
 * Description
 *  Corporation automation lane with strict spend gating.
 *  Primary goal: NEVER “run away” with spending early and sabotage investments.
 *
 * UPDATED (bootstrap, per-tick capex burst)
 *  - When bootstrapEnabled=true, performs up to bootstrapMaxCapexActionsPerTick CAPEX actions
 *    per runCorpTick() call (your “B” requirement).
 *  - Bootstrap progression matches your intended setup:
 *      1) Create division (one at a time, in plan order)
 *      2) Expand first city
 *      3) Create warehouse
 *      4) Upgrade office to 15 and hire to fill
 *      5) Staff employees (intern rule already handled in maintenance)
 *      6) Set max/mp for sales (Agri materials + products already handled in maintenance)
 *      7) For Agri only, between city 1 and 2: buy must-have unlocks/upgrades
 *      8) Expand next city and repeat until all cities have offices
 *      9) Move to next division and repeat
 *
 *  - After bootstrap is complete, reverts to the original conservative behavior
 *    (one capex per corp cycle if oneCapexActionPerCycle=true).
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

  // Export planner (NEW)
  enableExports: true,

  // How often to (re)apply export routes (prevents pointless spam calls)
  exportRefreshMs: 60_000,

  // Default export routes (same city -> same city)
  // amount: "IPROD" exports a fraction of production
  exportPlan: [
    { from: "Agri", to: "Tobacco", mat: "Plants", amount: "IPROD" },
    { from: "Agri", to: "Tobacco", mat: "Food",   amount: "IPROD" },

    { from: "Agri", to: "Chem",    mat: "Plants", amount: "IPROD" },
    { from: "Agri", to: "Chem",    mat: "Food",   amount: "IPROD" },

    { from: "Agri", to: "Robo",    mat: "Plants", amount: "IPROD" },
    { from: "Agri", to: "Robo",    mat: "Food",   amount: "IPROD" },
  ],

  // Jobs
  assignJobs: true,

  // Capex spend governor (default conservative)
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
  // (Kept for non-bootstrap mode; bootstrap has its own must-have list)
  unlockPriority: [
    "Smart Supply",
    "Market Research - Demand",
    "Market Data - Competition",
  ],

  // Research purchase order (per division)
  researchPriority: [
    "AutoPartyManager",
    "Market-TA.I",
    "Market-TA.II",
    "uPgrade: Capacity.I",
    "uPgrade: Capacity.II",
  ],

  // ------------------------------------------------------------
  // Bootstrap mode (NEW)
  // ------------------------------------------------------------
  bootstrapEnabled: true,

  // Perform up to N CAPEX actions per tick (per runCorpTick call)
  bootstrapMaxCapexActionsPerTick: 8,

  // Bootstrap spend governor (more permissive so you can actually build out)
  bootstrapReserveFunds: 200_000_000,
  bootstrapMaxSpendFracPerCycle: 0.80, // spend up to 80% of current funds (per action gate)

  // Your initial staffing target: 15 max for now
  bootstrapOfficeSizeTarget: 15,

  // Must-have “between city 1 and city 2 for Agri”
  bootstrapAgriMustHaveUnlocks: [
    "Smart Supply",
    "Export",
  ],
  bootstrapAgriMustHaveUpgrades: [
    { name: "Smart Factories", level: 5 },
    { name: "Smart Storage",   level: 5 },
    { name: "FocusWires",      level: 5 },
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

  // Per-tick capex counter for bootstrap mode
  if (!state.capexThisTick) state.capexThisTick = 0;

  // Export throttle state (NEW)
  if (!state.lastExportAt) state.lastExportAt = 0;

  const now = Date.now();
  if (now - state.lastTick < laneCfg.tickMs) return;
  state.lastTick = now;

  // Reset per-tick capex counter
  state.capexThisTick = 0;

  const corp = ns.corporation;
  if (!corp) return;
  if (!safeBool(() => corp.hasCorporation(), false)) return;

  const corpInfo = safeObj(() => corp.getCorporation(), null);
  if (!corpInfo) return;

  // Reset per-cycle capex allowance on START (for non-bootstrap mode)
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
  // A) Bootstrap progression (per tick burst) OR legacy division ensure
  // ------------------------------------------------------------
  if (laneCfg.bootstrapEnabled) {
    runBootstrap(ns, laneCfg, state, msgs, plan);
  } else {
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
  }

  // ------------------------------------------------------------
  // B) Maintenance (no capex)
  // ------------------------------------------------------------
  const shouldRefreshExports = laneCfg.enableExports
    && (now - state.lastExportAt >= laneCfg.exportRefreshMs);

  for (const d of plan) {
    const divName = String(d?.name || "").trim();
    if (!divName || !divisionExists(corp, divName)) continue;

    const div = safeObj(() => corp.getDivision(divName), null);
    if (!div) continue;

    for (const city of div.cities || []) {
      ensureSmartSupplyEnabledSafe(ns, divName, city);

      if (div.type === "Agriculture") {
        ensureAgriSalesFoodOnlySafe(ns, divName, city);
        maintainAgriInputsSafe(ns, divName, city);
      }

      // Exports (throttled)
      if (shouldRefreshExports) {
        ensureExportsSafe(ns, laneCfg, divName, city);
      }

      ensureProductSalesSafe(ns, divName, city);
      ensureMarketTASafe(ns, divName, city);

      if (laneCfg.assignJobs) {
        refreshJobSpreadSafe(ns, divName, city);
      }
    }
  }

  if (shouldRefreshExports) state.lastExportAt = now;

  // If we're in bootstrap, we don't run the old capex progression (bootstrap owns capex).
  if (laneCfg.bootstrapEnabled) return;

  // If we already did capex this cycle, stop.
  if (laneCfg.oneCapexActionPerCycle && state.didCapexThisCycle) return;

  // ------------------------------------------------------------
  // C) Capex progression (one action per cycle total), in plan order
  // ------------------------------------------------------------
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

    if (tryBuyResearch(ns, laneCfg, state, msgs, divName)) return;

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

    if (laneCfg.enableProductDiscontinue) {
      const okDisc = tryDiscontinueWorstProductIfAtCap(ns, laneCfg, state, msgs, divName, div);
      if (okDisc) return;
    }
    const okProd = tryMakeProductIfReady(ns, laneCfg, state, msgs, divName, div);
    if (okProd) return;

    if (laneCfg.enableAdVert) {
      const okAd = tryHireAdVert(ns, laneCfg, state, msgs, divName, div);
      if (okAd) return;
    }
  }
}

// ---------------------------------------------------------------------
// Bootstrap progression (per tick capex burst)
// ---------------------------------------------------------------------

function runBootstrap(ns, laneCfg, state, msgs, plan) {
  const corp = ns.corporation;
  const cities = Array.isArray(laneCfg.cities) ? laneCfg.cities : [];
  const firstCity = String(cities[0] || "Sector-12");
  const secondCity = String(cities[1] || "");

  const maxActions = Math.max(1, Number(laneCfg.bootstrapMaxCapexActionsPerTick || 1));
  const officeTarget = Math.max(1, Number(laneCfg.bootstrapOfficeSizeTarget || 15));

  for (let step = 0; step < maxActions; step++) {
    const next = pickNextDivisionNeedingBootstrap(ns, laneCfg, plan, officeTarget);
    if (!next) return;

    const {
      divName,
      divType,
      divObj,
      needCreate,
      needExpandCity,
      expandCity,
      needWarehouseCity,
      needOfficeCity,
      needAgriGate,
    } = next;

    if (needCreate) {
      const ok = tryCapexBootstrap(
        ns,
        laneCfg,
        state,
        msgs,
        `bootstrap:expandIndustry:${divName}`,
        () => getExpandIndustryCostSafe(corp, divType),
        (cost) => {
          corp.expandIndustry(divType, divName);
          return { changed: true, msg: `[corp/bootstrap] Created division "${divName}" (${divType}) cost~${fmt(cost)}` };
        }
      );
      if (!ok) return;
      continue;
    }

    const div = divObj || safeObj(() => corp.getDivision(divName), null);
    if (!div) return;

    if (needExpandCity && expandCity) {
      const ok = tryCapexBootstrap(
        ns,
        laneCfg,
        state,
        msgs,
        `bootstrap:expandCity:${divName}:${expandCity}`,
        () => getExpandCityCostSafe(corp),
        (cost) => {
          corp.expandCity(divName, expandCity);
          return { changed: true, msg: `[corp/bootstrap] [${divName}] expanded to ${expandCity} cost~${fmt(cost)}` };
        }
      );
      if (!ok) return;
      continue;
    }

    if (needWarehouseCity) {
      const ok = tryCapexBootstrap(
        ns,
        laneCfg,
        state,
        msgs,
        `bootstrap:purchaseWarehouse:${divName}:${needWarehouseCity}`,
        () => getPurchaseWarehouseCostSafe(corp, needWarehouseCity),
        (cost) => {
          corp.purchaseWarehouse(divName, needWarehouseCity);
          return { changed: true, msg: `[corp/bootstrap] [${divName}/${needWarehouseCity}] bought warehouse cost~${fmt(cost)}` };
        }
      );
      if (!ok) return;
      continue;
    }

    if (needOfficeCity) {
      const ok = tryCapexBootstrap(
        ns,
        laneCfg,
        state,
        msgs,
        `bootstrap:upgradeOffice:${divName}:${needOfficeCity}:${officeTarget}`,
        () => getOfficeUpgradeCostSafe(corp, divName, needOfficeCity, officeTarget),
        (cost) => {
          ensureOfficeSizeAndHireSafe(corp, divName, needOfficeCity, officeTarget);
          return { changed: true, msg: `[corp/bootstrap] [${divName}/${needOfficeCity}] office->${officeTarget} (incl hire) cost~${fmt(cost)}` };
        }
      );
      if (!ok) return;
      continue;
    }

    if (needAgriGate && divName === "Agri" && secondCity) {
      const didUnlock = tryBuyUnlocksInOrderBootstrap(
        ns,
        laneCfg,
        state,
        msgs,
        laneCfg.bootstrapAgriMustHaveUnlocks || []
      );
      if (didUnlock) continue;

      const didUpg = tryBuyUpgradesToTargetsBootstrap(
        ns,
        laneCfg,
        state,
        msgs,
        laneCfg.bootstrapAgriMustHaveUpgrades || []
      );
      if (didUpg) continue;

      return;
    }

    return;
  }

  void firstCity;
}

function pickNextDivisionNeedingBootstrap(ns, laneCfg, plan, officeTarget) {
  const corp = ns.corporation;
  const cities = Array.isArray(laneCfg.cities) ? laneCfg.cities : [];
  const firstCity = String(cities[0] || "Sector-12");
  const secondCity = String(cities[1] || "");

  for (const d of plan) {
    const divName = String(d?.name || "").trim();
    const divType = String(d?.type || "").trim();
    if (!divName || !divType) continue;

    if (!divisionExists(corp, divName)) {
      return { divName, divType, divObj: null, needCreate: true };
    }

    const divObj = safeObj(() => corp.getDivision(divName), null);
    if (!divObj) continue;

    const haveCities = new Set(divObj.cities || []);

    if (!haveCities.has(firstCity)) {
      return {
        divName,
        divType,
        divObj,
        needCreate: false,
        needExpandCity: true,
        expandCity: firstCity,
      };
    }

    const needWarehouseCity = pickCityNeedingWarehouse(corp, divName, divObj.cities || []);
    if (needWarehouseCity) {
      return { divName, divType, divObj, needWarehouseCity };
    }

    const needOfficeCity = pickCityNeedingOfficeSize(corp, divName, divObj.cities || [], officeTarget);
    if (needOfficeCity) {
      return { divName, divType, divObj, needOfficeCity };
    }

    if (
      divName === "Agri"
      && secondCity
      && !haveCities.has(secondCity)
      && isCityBuilt(corp, divName, firstCity, officeTarget)
      && (
        (laneCfg.bootstrapAgriMustHaveUnlocks && laneCfg.bootstrapAgriMustHaveUnlocks.length > 0)
        || (laneCfg.bootstrapAgriMustHaveUpgrades && laneCfg.bootstrapAgriMustHaveUpgrades.length > 0)
      )
      && !agriGateSatisfied(corp, laneCfg)
    ) {
      return { divName, divType, divObj, needAgriGate: true };
    }

    const nextCity = pickNextMissingCity(divObj, cities);
    if (nextCity) {
      return { divName, divType, divObj, needExpandCity: true, expandCity: nextCity };
    }
  }

  return null;
}

function isCityBuilt(corp, divName, city, officeTarget) {
  try {
    if (!corp.hasWarehouse(divName, city)) return false;
  } catch { return false; }

  try {
    const o = corp.getOffice(divName, city);
    if ((o?.size || 0) < officeTarget) return false;
    if ((o?.numEmployees || 0) < (o?.size || 0)) return false;
  } catch { return false; }

  return true;
}

function agriGateSatisfied(corp, laneCfg) {
  const unlocks = Array.isArray(laneCfg.bootstrapAgriMustHaveUnlocks) ? laneCfg.bootstrapAgriMustHaveUnlocks : [];
  for (const u of unlocks) {
    const name = String(u || "").trim();
    if (!name) continue;
    if (!safeBool(() => corp.hasUnlock(name), false)) return false;
  }

  const upgrades = Array.isArray(laneCfg.bootstrapAgriMustHaveUpgrades) ? laneCfg.bootstrapAgriMustHaveUpgrades : [];
  for (const t of upgrades) {
    const name = String(t?.name || "").trim();
    const level = Number(t?.level || 0);
    if (!name || !Number.isFinite(level) || level <= 0) continue;

    let cur = 0;
    try { cur = Number(corp.getUpgradeLevel(name) || 0); } catch { cur = 0; }
    if (cur < level) return false;
  }

  return true;
}

// ---------------------------------------------------------------------
// Spend governor + capex helpers
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

function tryCapexBootstrap(ns, laneCfg, state, msgs, actionKey, getCostFn, doFn) {
  const maxActions = Math.max(1, Number(laneCfg.bootstrapMaxCapexActionsPerTick || 1));
  if (state.capexThisTick >= maxActions) return false;

  const now = Date.now();
  const lastFail = Number(state.failAt[actionKey] || 0);
  if (now - lastFail < laneCfg.failCooldownMs) return false;

  const corp = ns.corporation;
  const info = safeObj(() => corp.getCorporation(), null);
  if (!info) return false;

  const funds = Number(info.funds || 0);
  const reserveA = Number(laneCfg.bootstrapReserveFunds ?? laneCfg.reserveFunds);
  const maxSpendFrac = Number(laneCfg.bootstrapMaxSpendFracPerCycle ?? laneCfg.maxSpendFracPerCycle);
  const reserveB = funds * (1 - maxSpendFrac);
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
      state.capexThisTick++;
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

function ensureExportsSafe(ns, laneCfg, divName, city) {
  const corp = ns.corporation;
  try {
    if (!safeBool(() => corp.hasUnlock("Export"), false)) return;

    const plan = Array.isArray(laneCfg.exportPlan) ? laneCfg.exportPlan : [];
    if (plan.length === 0) return;

    for (const r of plan) {
      const from = String(r?.from || "").trim();
      const to = String(r?.to || "").trim();
      const mat = String(r?.mat || "").trim();
      const amount = (r?.amount ?? "IPROD");

      if (!from || !to || !mat) continue;
      if (from !== divName) continue;

      // Target division must exist
      if (!divisionExists(corp, to)) continue;

      // Must have warehouses on both sides in this city
      if (!safeBool(() => corp.hasWarehouse(from, city), false)) continue;
      if (!safeBool(() => corp.hasWarehouse(to, city), false)) continue;

      try {
        corp.exportMaterial(from, city, to, city, mat, amount);
      } catch {}
    }
  } catch {}
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
// Unlock + Upgrade lanes (global)
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

function tryBuyUnlocksInOrderBootstrap(ns, laneCfg, state, msgs, order) {
  const corp = ns.corporation;
  const list = Array.isArray(order) ? order : [];
  for (const u of list) {
    const name = String(u || "").trim();
    if (!name) continue;
    if (safeBool(() => corp.hasUnlock(name), false)) continue;

    const ok = tryCapexBootstrap(
      ns,
      laneCfg,
      state,
      msgs,
      `bootstrap:purchaseUnlock:${name}`,
      () => safeNum(() => corp.getUnlockCost(name), Infinity),
      (cost) => {
        corp.purchaseUnlock(name);
        return { changed: true, msg: `[corp/bootstrap] bought unlock "${name}" cost~${fmt(cost)}` };
      }
    );
    if (ok) return true;
  }
  return false;
}

function tryBuyUpgradesToTargetsBootstrap(ns, laneCfg, state, msgs, targets) {
  const corp = ns.corporation;
  const list = Array.isArray(targets) ? targets : [];
  for (const t of list) {
    const name = String(t?.name || "").trim();
    const target = Number(t?.level || 0);
    if (!name || !Number.isFinite(target) || target <= 0) continue;

    let cur = 0;
    try { cur = Number(corp.getUpgradeLevel(name) || 0); } catch { cur = 0; }
    if (cur >= target) continue;

    const ok = tryCapexBootstrap(
      ns,
      laneCfg,
      state,
      msgs,
      `bootstrap:levelUpgrade:${name}:${cur + 1}`,
      () => safeNum(() => corp.getUpgradeLevelCost(name), Infinity),
      (cost) => {
        corp.levelUpgrade(name);
        const after = safeNum(() => corp.getUpgradeLevel(name), cur + 1);
        return { changed: true, msg: `[corp/bootstrap] upgraded "${name}" -> ${Math.floor(after)} cost~${fmt(cost)}` };
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
    try { corp.setSmartSupply(divName, city, true); } catch {}
  } catch {}
}

function ensureMarketTASafe(ns, divName, city) {
  const corp = ns.corporation;
  try {
    const div = corp.getDivision(divName);
    if (!div) return;

    const hasMTA1 = safeBool(() => corp.hasResearched(divName, "Market-TA.I"), false);
    const hasMTA2 = safeBool(() => corp.hasResearched(divName, "Market-TA.II"), false);

    if (div.type === "Agriculture") {
      try { corp.setMaterialMarketTA1(divName, city, "Food", hasMTA1); } catch {}
      try { corp.setMaterialMarketTA2(divName, city, "Food", hasMTA2); } catch {}
    }

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
// NOTE: defined ONCE (fixes duplicate-declaration bug)
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

    productInfos.sort((a, b) => a.rating - b.rating);
    const worst = productInfos[0];
    if (!worst?.name) return false;

    return tryCapex(
      ns,
      laneCfg,
      state,
      msgs,
      `discontinueProduct:${divName}:${worst.name}`,
      () => 1,
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

    if (!safeBool(() => corp.hasWarehouse(divName, buildCity), false)) {
      const anyWhCity = cities.find(c => safeBool(() => corp.hasWarehouse(divName, c), false));
      if (!anyWhCity) return false;
    }

    const products = Array.isArray(divObj?.products) ? divObj.products : [];
    const maxProducts = getMaxProductsSafe(corp, divName, divObj);
    if (products.length >= maxProducts) return false;

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
  const corp = ns.corporation;
  try {
    if (!corp.hasWarehouse(divName, city)) return;

    if (safeBool(() => corp.hasUnlock("Smart Supply"), false)) {
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

    const cap = Math.max(1, officeSize * 2);
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
