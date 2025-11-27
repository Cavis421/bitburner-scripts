/** 
 * corp/bn3-corp-pipeline.js
 *
 * End-to-end BN3 corporation bootstrap:
 *  - Create corp with seed money (BN3 only) if it doesn't exist
 *  - Create Agriculture division, expand to 6 cities, buy warehouses
 *  - Upgrade offices to 4 employees and assign basic jobs
 *  - Start producing + selling Plants and Food in all cities
 *  - Maintain a simple "Smart Supply" for Water & Chemicals via API
 *  - (Optional, later) Create Chemical division and wire exports
 * 
 * This is deliberately conservative:
 *  - No auto IPO, no share tricks, no dividends
 *  - Investment offers, research choices, and Tobacco setup are left
 *    to either other scripts or manual control.
 *
 * Run on home in BN3:
 *  > run corp/bn3-corp-pipeline.js
 *
 * RAM: all corp API calls, so expect this to be chunky.
 * 
 * @param {NS} ns
 */
export async function main(ns) {
  ns.disableLog("ALL");

  const corp = ns.corporation;
  if (!corp) {
    ns.tprint("? Corporation API not available. You must be in BN3 or have SF3.3.");
    return;
  }

  const CORP_NAME = "BN3 Holdings";
  const AGRI_DIV = "Agri";
  const CHEM_DIV = "Chem";
  const CITIES = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];

  // --------------------------------------------------------------------------------
  // 0. Ensure corporation exists (BN3: use seed money)
  // --------------------------------------------------------------------------------

  if (!corp.hasCorporation()) {
    try {
      // Use seed money in BN3 (second arg = useSeedMoney)
      corp.createCorporation(CORP_NAME, true);
      ns.tprint(`?? Created corporation '${CORP_NAME}' with seed money.`);
    } catch (err) {
      ns.tprint(`? Failed to create corporation: ${String(err)}`);
      return;
    }
  } else {
    const info = corp.getCorporation();
    ns.print(`Using existing corporation '${info.name}'.`);
  }

  // --------------------------------------------------------------------------------
  // Main loop: drive phases each corporation cycle
  // --------------------------------------------------------------------------------

  while (true) {
    try {
      await tick(ns, AGRI_DIV, CHEM_DIV, CITIES);
    } catch (err) {
      ns.print(`?? bn3-corp-pipeline tick error: ${String(err)}`);
    }

    // Best-case: sync to corp mechanic using the official API
    try {
      if (corp.nextUpdate) {
        await corp.nextUpdate();
      } else {
        await ns.sleep(10_000);
      }
    } catch {
      await ns.sleep(10_000);
    }
  }
}

/**
 * One "brain" step: ensure our basic BN3 corp structure exists and is healthy.
 *
 *  Phase A: Agriculture bootstrap (always active)
 *  Phase B: Chemical support division (optional, gated by funds)
 *  Phase C: (Hook) Tobacco + products (to be implemented later)
 *
 * @param {NS} ns
 */
async function tick(ns, AGRI_DIV, CHEM_DIV, CITIES) {
  const corp = ns.corporation;
  const corpInfo = corp.getCorporation();

  // A. Agriculture division: make sure it's fully bootstrapped
  await ensureAgricultureDivision(ns, AGRI_DIV, CITIES);

  // B. Once we have some money, spin up Chemical as support
  if (corpInfo.funds > 5e11) {
    await ensureChemicalSupport(ns, CHEM_DIV, AGRI_DIV, CITIES);
  }

  // C. Tobacco + products would sit here later:
  //    await ensureTobaccoDivision(ns, "Tobacco", AGRI_DIV, CITIES);
}

// --------------------------------------------------------------------------------
// Agriculture: core round-1 automation
// --------------------------------------------------------------------------------

/**
 * Make sure we have an Agriculture division that:
 *  - Exists (industry "Agriculture")
 *  - Is in all 6 cities
 *  - Has warehouses in all cities
 *  - Has 4-person offices with basic job spread
 *  - Sells Plants and Food in every city
 *  - Keeps Water & Chemicals topped up with a simple scripted "Smart Supply"
 *
 * @param {NS} ns
 * @param {string} divName
 * @param {string[]} CITIES
 */
async function ensureAgricultureDivision(ns, divName, CITIES) {
  const corp = ns.corporation;

  // 1) Create Agriculture division if needed
  if (!divisionExists(corp, divName)) {
    try {
      corp.expandIndustry("Agriculture", divName);
      ns.tprint(`?? Created Agriculture division '${divName}'.`);
    } catch (err) {
      ns.print(`?? Failed to create Agriculture division: ${String(err)}`);
      return;
    }
  }

  const officeSizeTarget = 4;

  for (const city of CITIES) {
    // 2) Expand to city (division.cities guards this normally, but we idempotently call expandCity)
    try {
      const div = corp.getDivision(divName);
      if (!div.cities.includes(city)) {
        corp.expandCity(divName, city);
        ns.tprint(`???  [${divName}] expanded to ${city}.`);
      }
    } catch (err) {
      ns.print(`?? expandCity(${divName}, ${city}) failed: ${String(err)}`);
    }

    // 3) Ensure warehouse
    try {
      if (!corp.hasWarehouse(divName, city)) {
        corp.purchaseWarehouse(divName, city);
        ns.tprint(`??  [${divName}] purchased warehouse in ${city}.`);
      }
    } catch (err) {
      ns.print(`?? purchaseWarehouse(${divName}, ${city}) failed: ${String(err)}`);
    }

    // 4) Ensure office size 4, with basic job assignment
    await ensureOfficeWithJobs(ns, divName, city, officeSizeTarget);

    // 5) Ensure we are selling Plants and Food at MAX / MP
    ensureAgriSales(ns, divName, city);

    // 6) Maintain Water + Chemicals via API "Smart Supply" substitute
    maintainAgriInputs(ns, divName, city);
  }
}

/**
 * Ensure an office exists with at least `targetSize` employees,
 * and split them evenly across Operations / Engineer / Business / Management.
 */
async function ensureOfficeWithJobs(ns, divName, city, targetSize) {
  const corp = ns.corporation;

  let office;
  try {
    office = corp.getOffice(divName, city);
  } catch {
    // Newly expanded city with no office yet
    corp.hireEmployee(divName, city, "Operations"); // triggers office creation
    office = corp.getOffice(divName, city);
  }

  let size = office.size;
  if (size < targetSize) {
    const increaseBy = targetSize - size;
    try {
      corp.upgradeOfficeSize(divName, city, increaseBy);
      ns.tprint(`??  [${divName}/${city}] office size upgraded by +${increaseBy} to ${targetSize}.`);
      size = targetSize;
    } catch (err) {
      ns.print(`?? upgradeOfficeSize(${divName}, ${city}) failed: ${String(err)}`);
      return;
    }
  }

  // Hire up to the office size
  const toHire = size - office.numEmployees;
  for (let i = 0; i < toHire; i++) {
    try {
      corp.hireEmployee(divName, city);
    } catch (err) {
      ns.print(`?? hireEmployee(${divName}, ${city}) failed: ${String(err)}`);
      break;
    }
  }

  // Distribute jobs: 1 Ops, 1 Eng, 1 Biz, 1 Management (or as close as possible)
  const jobs = ["Operations", "Engineer", "Business", "Management"];
  const perJob = Math.max(1, Math.floor(size / jobs.length));

  for (const job of jobs) {
    try {
      corp.setAutoJobAssignment(divName, city, job, 0); // clear
    } catch (_) {
      // ignore
    }
  }

  let remaining = size;
  for (const job of jobs) {
    const count = Math.min(perJob, remaining);
    if (count > 0) {
      try {
        corp.setAutoJobAssignment(divName, city, job, count);
      } catch (err) {
        ns.print(`?? setAutoJobAssignment(${divName}, ${city}, ${job}) failed: ${String(err)}`);
      }
      remaining -= count;
    }
  }

  ns.print(`??  [${divName}/${city}] office jobs refreshed (size=${size}).`);
}

/**
 * Ensure we are selling Plants and Food in the given city.
 */
function ensureAgriSales(ns, divName, city) {
  const corp = ns.corporation;
  const outputs = ["Plants", "Food"];

  for (const mat of outputs) {
    try {
      // Sell all production at market price
      corp.sellMaterial(divName, city, mat, "MAX", "MP");
    } catch (err) {
      ns.print(`?? sellMaterial(${divName}, ${city}, ${mat}) failed: ${String(err)}`);
    }
  }
}

/**
 * "Poor-man's Smart Supply" for Agriculture.
 *
 * Instead of buying the expensive Smart Supply upgrade in round 1,
 * we keep Water & Chemicals above a city-specific target using buyMaterial().
 *
 * Heuristic:
 *  - Target Water   ~= 20k + 5k * warehouse level
 *  - Target Chems   ~= 10k + 2.5k * warehouse level
 *  - When below target, buy at a fixed per-second rate; otherwise set buy = 0.
 */
function maintainAgriInputs(ns, divName, city) {
  const corp = ns.corporation;

  if (!corp.hasWarehouse(divName, city)) return;

  const wh = corp.getWarehouse(divName, city);
  const water = corp.getMaterial(divName, city, "Water");
  const chems = corp.getMaterial(divName, city, "Chemicals");

  const waterTarget = 20_000 + 5_000 * wh.level;
  const chemTarget = 10_000 + 2_500 * wh.level;

  // Water
  try {
    const buyRate = water.qty < waterTarget ? 500 : 0;
    corp.buyMaterial(divName, city, "Water", buyRate);
  } catch (err) {
    ns.print(`?? buyMaterial Water [${divName}/${city}] failed: ${String(err)}`);
  }

  // Chemicals
  try {
    const buyRate = chems.qty < chemTarget ? 250 : 0;
    corp.buyMaterial(divName, city, "Chemicals", buyRate);
  } catch (err) {
    ns.print(`?? buyMaterial Chemicals [${divName}/${city}] failed: ${String(err)}`);
  }

  ns.print(
    `?? [${divName}/${city}] Water=${ns.formatNumber(water.qty)} / ${ns.formatNumber(
      waterTarget,
    )}, Chems=${ns.formatNumber(chems.qty)} / ${ns.formatNumber(chemTarget)}.`,
  );
}

// --------------------------------------------------------------------------------
// Chemical: support division + exports
// --------------------------------------------------------------------------------

/**
 * Once we have some funds, create a Chemical division as a *support* industry.
 *
 * - Minimal offices/warehouses (we don't care about its direct profit)
 * - Make Chemicals to boost Agriculture's material quality
 * - Wire exports:
 *     Agriculture ? Chemical : Plants (for Chem input)
 *     Chemical    ? Agriculture : Chemicals (for Agri input)
 *
 * @param {NS} ns
 * @param {string} chemDiv
 * @param {string} agriDiv
 * @param {string[]} CITIES
 */
async function ensureChemicalSupport(ns, chemDiv, agriDiv, CITIES) {
  const corp = ns.corporation;

  // 1) Create Chemical division if needed
  if (!divisionExists(corp, chemDiv)) {
    try {
      corp.expandIndustry("Chemical", chemDiv);
      ns.tprint(`?? Created Chemical division '${chemDiv}' as support.`);
    } catch (err) {
      ns.print(`?? Failed to create Chemical division: ${String(err)}`);
      return;
    }
  }

  // 2) Minimal rollout in all 6 cities
  const officeSizeTarget = 3;

  for (const city of CITIES) {
    // expand city
    try {
      const div = corp.getDivision(chemDiv);
      if (!div.cities.includes(city)) {
        corp.expandCity(chemDiv, city);
        ns.tprint(`???  [${chemDiv}] expanded to ${city}.`);
      }
    } catch (err) {
      ns.print(`?? expandCity(${chemDiv}, ${city}) failed: ${String(err)}`);
    }

    // warehouse
    try {
      if (!corp.hasWarehouse(chemDiv, city)) {
        corp.purchaseWarehouse(chemDiv, city);
        ns.tprint(`??  [${chemDiv}] purchased warehouse in ${city}.`);
      }
    } catch (err) {
      ns.print(`?? purchaseWarehouse(${chemDiv}, ${city}) failed: ${String(err)}`);
    }

    // one tiny warehouse upgrade so it's not starved
    try {
      const wh = corp.getWarehouse(chemDiv, city);
      if (wh.level < 1) {
        corp.upgradeWarehouse(chemDiv, city);
        ns.tprint(`??  [${chemDiv}/${city}] warehouse upgraded to level 1.`);
      }
    } catch (err) {
      ns.print(`?? upgradeWarehouse(${chemDiv}, ${city}) failed: ${String(err)}`);
    }

    // small office with Ops/Eng/R&D
    await ensureChemOfficeWithJobs(ns, chemDiv, city, officeSizeTarget);

    // Chemicals are output; sell overflow at market price
    try {
      corp.sellMaterial(chemDiv, city, "Chemicals", "MAX", "MP");
    } catch (err) {
      ns.print(`?? sellMaterial(${chemDiv}, ${city}, Chemicals) failed: ${String(err)}`);
    }
  }

  // 3) Wire exports between Agri and Chem
  wireExportsAgriChem(ns, agriDiv, chemDiv, CITIES);
}

/**
 * Chemical office: small Ops/Eng/R&D mix to generate RP + quality.
 */
async function ensureChemOfficeWithJobs(ns, divName, city, targetSize) {
  const corp = ns.corporation;

  let office;
  try {
    office = corp.getOffice(divName, city);
  } catch {
    // create with one hire
    corp.hireEmployee(divName, city, "Operations");
    office = corp.getOffice(divName, city);
  }

  let size = office.size;
  if (size < targetSize) {
    const increaseBy = targetSize - size;
    try {
      corp.upgradeOfficeSize(divName, city, increaseBy);
      ns.tprint(`??  [${divName}/${city}] Chem office size +${increaseBy} ? ${targetSize}.`);
      size = targetSize;
    } catch (err) {
      ns.print(`?? upgradeOfficeSize(${divName}, ${city}) failed: ${String(err)}`);
      return;
    }
  }

  const toHire = size - office.numEmployees;
  for (let i = 0; i < toHire; i++) {
    try {
      corp.hireEmployee(divName, city);
    } catch (err) {
      ns.print(`?? hireEmployee(${divName}, ${city}) failed: ${String(err)}`);
      break;
    }
  }

  // Distribution: prioritize Engineers for quality, then Ops, then R&D
  const jobs = ["Engineer", "Operations", "Research & Development"];

  for (const job of jobs) {
    try {
      corp.setAutoJobAssignment(divName, city, job, 0);
    } catch (_) {
      // ignore
    }
  }

  let remaining = size;
  while (remaining > 0) {
    for (const job of jobs) {
      if (remaining <= 0) break;
      try {
        corp.setAutoJobAssignment(divName, city, job, corp.getOffice(divName, city).employeeJobs[job] + 1);
      } catch (err) {
        ns.print(`?? setAutoJobAssignment(${divName}, ${city}, ${job}) failed: ${String(err)}`);
      }
      remaining--;
    }
  }

  ns.print(`?? [${divName}/${city}] Chem jobs refreshed (size=${size}).`);
}

/**
 * Wire exports using the recommended formula: (IPROD + IINV / 10) * (-1)
 *   - Agriculture exports Plants to Chemical
 *   - Chemical exports Chemicals to Agriculture
 *
 * Warning: the corp API does not let us *list* existing exports, so we
 *          cancel and re-add the exact same expression every tick.
 */
function wireExportsAgriChem(ns, agriDiv, chemDiv, CITIES) {
  const corp = ns.corporation;
  const amtExpr = "(IPROD+IINV/10)*(-1)";

  for (const city of CITIES) {
    // Agri ? Chem : Plants
    try {
      corp.cancelExportMaterial(agriDiv, city, chemDiv, city, "Plants", amtExpr);
    } catch (_) {
      // ignore if none existed
    }
    try {
      corp.exportMaterial(agriDiv, city, chemDiv, city, "Plants", amtExpr);
    } catch (err) {
      ns.print(`?? export Plants ${agriDiv}/${city} ? ${chemDiv}/${city} failed: ${String(err)}`);
    }

    // Chem ? Agri : Chemicals
    try {
      corp.cancelExportMaterial(chemDiv, city, agriDiv, city, "Chemicals", amtExpr);
    } catch (_) {
      // ignore
    }
    try {
      corp.exportMaterial(chemDiv, city, agriDiv, city, "Chemicals", amtExpr);
    } catch (err) {
      ns.print(`?? export Chemicals ${chemDiv}/${city} ? ${agriDiv}/${city} failed: ${String(err)}`);
    }
  }

  ns.print(`?? Agri?Chem exports refreshed using ${amtExpr}.`);
}

// --------------------------------------------------------------------------------
// Small helpers
// --------------------------------------------------------------------------------

/**
 * @param {Corporation} corp
 * @param {string} divName
 * @returns {boolean}
 */
function divisionExists(corp, divName) {
  try {
    const info = corp.getCorporation();
    return info.divisions.some((d) => d.name === divName);
  } catch {
    return false;
  }
}