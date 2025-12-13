/** 
 * corp/bn3-corp-pipeline.js
 *
 * End-to-end BN3 corporation bootstrap:
 *  - Create corp with seed money (BN3 only) if it doesn't exist
 *  - Create Agriculture division, optionally expand to 6 cities, buy warehouses
 *  - Upgrade offices and assign basic jobs (unless --assign-none)
 *  - Start producing + selling Food (do NOT sell Plants) in all active cities
 *  - Maintain a simple "Smart Supply" for Water & Chemicals via API
 *  - (Optional) Create Chemical division and wire exports (when --chem-support)
 * 
 * This is deliberately conservative:
 *  - No auto IPO, no share tricks, no dividends
 *  - Investment offers, research choices, and Tobacco setup are left
 *    to either other scripts or manual control.
 *
 * Run on home in BN3:
 *  > run corp/bn3-corp-pipeline.js
 *
 * Behavior:
 *  - Default: one-shot bootstrap, performs a single corp "tick" and exits.
 *  - With --loop: acts as a long-running corp daemon, stepping each cycle.
 *
 * RAM: all corp API calls, so expect this to be chunky.
 * 
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["loop", false],
    // When true, do NOT auto-assign jobs; only create/expand/hire.
    ["assign-none", false],
    // When true, allow expanding Agri to all 6 cities (otherwise only touch existing cities).
    ["expand-all", false],
    // When true, allow creating/maintaining Chemical support division.
    ["chem-support", false],
  ]);

  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  const corp = ns.corporation;
  if (!corp) {
    ns.tprint("Corporation API not available. You must be in BN3 or have SF3.3.");
    return;
  }

  const CORP_NAME = "BN3 Holdings";
  const AGRI_DIV = "Agri";
  const CHEM_DIV = "Chem";
  const CITIES = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];

  const assignJobs = !flags["assign-none"];
  const expandAll = !!flags["expand-all"];
  const chemSupport = !!flags["chem-support"];

  // --------------------------------------------------------------------------------
  // 0. Ensure corporation exists (BN3: use seed money)
  // --------------------------------------------------------------------------------

  if (!corp.hasCorporation()) {
    try {
      // Use seed money in BN3 (second arg = useSeedMoney)
      corp.createCorporation(CORP_NAME, true);
      ns.tprint(`Created corporation '${CORP_NAME}' with seed money.`);
    } catch (err) {
      ns.tprint(`Failed to create corporation: ${String(err)}`);
      return;
    }
  } else {
    const info = corp.getCorporation();
    ns.print(`Using existing corporation '${info.name}'.`);
  }

  // --------------------------------------------------------------------------------
  // 1. Run either once (default) or in a continuous loop (--loop)
  // --------------------------------------------------------------------------------

  if (flags.loop) {
    ns.tprint(
      "bn3-corp-pipeline: starting in --loop mode (continuous corp daemon)" +
      (assignJobs ? "" : " with --assign-none (no auto job rebalance).") +
      (expandAll ? " (will expand Agri to all cities)" : " (no auto expansion)") +
      (chemSupport ? " (Chemical support enabled)" : " (no Chemical support)")
    );
    while (true) {
      try {
        await tick(ns, AGRI_DIV, CHEM_DIV, CITIES, assignJobs, expandAll, chemSupport);
      } catch (err) {
        ns.print(`bn3-corp-pipeline tick error: ${String(err)}`);
      }

      // Sync to corp mechanic using official API when available
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
  } else {
    // One-shot bootstrap
    try {
      await tick(ns, AGRI_DIV, CHEM_DIV, CITIES, assignJobs, expandAll, chemSupport);
    } catch (err) {
      ns.tprint(`bn3-corp-pipeline tick error: ${String(err)}`);
      return;
    }

    ns.tprint(
      "BN3 corp bootstrap tick complete. Re-run or use --loop for continuous control." +
      (assignJobs ? "" : " (--assign-none: job assignments were not modified.)") +
      (expandAll ? " (Agri expansion to all cities allowed.)" : " (no auto expansion.)") +
      (chemSupport ? " (Chemical support enabled.)" : " (no Chemical support.)")
    );
  }
}

// Help printer for this script.
// Follows the shared Description / Notes / Syntax layout.
function printHelp(ns) {
  ns.tprint("corp/bn3-corp-pipeline.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Bootstrap and optionally maintain a simple BN3 corporation focused on Agriculture.");
  ns.tprint("  Creates an Agriculture division, sets up existing cities, and optionally:");
  ns.tprint("   - Expands Agri to all 6 cities (with --expand-all)");
  ns.tprint("   - Adds a Chemical support division (with --chem-support).");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  Intended for BN3 with seed money, or any BitNode with Corporation API.");
  ns.tprint("  Default behavior is one-shot: perform a single bootstrap 'tick' and exit.");
  ns.tprint("  With --loop, runs continuously, stepping the corp each corporation cycle.");
  ns.tprint("  With --assign-none, offices are sized + employees hired, but job assignments");
  ns.tprint("  are left untouched so you can manage them manually in the UI.");
  ns.tprint("  With --expand-all, Agri will expand into all standard cities as funds allow.");
  ns.tprint("  With --chem-support, a Chemical division will be created once funds are high.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run corp/bn3-corp-pipeline.js [--help] [--loop] [--assign-none]");
  ns.tprint("                                 [--expand-all] [--chem-support]");
}

/**
 * One "brain" step: ensure our basic BN3 corp structure exists and is healthy.
 *
 *  Phase A: Agriculture bootstrap (always active)
 *  Phase B: Chemical support division (optional, gated by funds + --chem-support)
 *  Phase C: (Hook) Tobacco + products (to be implemented later)
 *
 * @param {NS} ns
 */
async function tick(ns, AGRI_DIV, CHEM_DIV, CITIES, assignJobs, expandAll, chemSupport) {
  const corp = ns.corporation;
  const corpInfo = corp.getCorporation();

  // A. Agriculture division: make sure it's fully bootstrapped
  await ensureAgricultureDivision(ns, AGRI_DIV, CITIES, assignJobs, expandAll);

  // B. Once we have some money, optionally spin up Chemical as support
  if (chemSupport && corpInfo.funds > 5e11) {
    await ensureChemicalSupport(ns, CHEM_DIV, AGRI_DIV, CITIES, assignJobs);
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
 *  - Optionally in all 6 cities (if expandAll = true; otherwise only existing cities)
 *  - Has warehouses in all active cities
 *  - Has offices with basic job spread (unless --assign-none)
 *  - Sells Food (NOT Plants) at MAX / MP in every active city
 *  - Keeps Water & Chemicals topped up with a simple scripted "Smart Supply"
 *
 * Idempotent: safe to re-run many times.
 *
 * @param {NS} ns
 * @param {string} divName
 * @param {string[]} CITIES
 * @param {boolean} assignJobs   Whether to auto-assign jobs or leave them alone.
 * @param {boolean} expandAll    Whether to expand to all CITIES or only manage existing ones.
 */
async function ensureAgricultureDivision(ns, divName, CITIES, assignJobs, expandAll) {
  const corp = ns.corporation;
  let anyChanges = false; // track whether this pass actually did anything

  // 1) Create Agriculture division if needed
  if (!divisionExists(corp, divName)) {
    try {
      corp.expandIndustry("Agriculture", divName);
      ns.tprint(`Created Agriculture division '${divName}'.`);
      anyChanges = true;
    } catch (err) {
      ns.tprint(`Failed to create Agriculture division: ${String(err)}`);
      return;
    }
  }

  const officeSizeTarget = 4;

  for (const city of CITIES) {
    try {
      const div = corp.getDivision(divName);

      // 2) Expand to city if we aren't there yet
      if (!div.cities.includes(city)) {
        if (!expandAll) {
          // Respect user's desire to avoid automatic expansion.
          ns.print(
            `[${divName}/${city}] Not present and --expand-all is false; skipping expansion for now.`,
          );
          continue;
        }

        const funds = corp.getCorporation().funds;
        const minFundsToExpand = 5e9; // conservative safety floor

        if (funds < minFundsToExpand) {
          ns.tprint(
            `[${divName}/${city}] Not enough funds to expand to this city yet (have ${ns.formatNumber(
              funds,
            )}, want at least ${ns.formatNumber(minFundsToExpand)}).`,
          );
          continue;
        }

        corp.expandCity(divName, city);
        ns.tprint(`[${divName}] expanded to ${city}.`);
        anyChanges = true;
      }

      // Re-fetch to ensure the city list is up to date
      const div2 = corp.getDivision(divName);
      if (!div2.cities.includes(city)) {
        ns.print(`[${divName}/${city}] City not active after expandCity attempt; skipping setup.`);
        continue;
      }

      // 3) Ensure warehouse
      try {
        if (!corp.hasWarehouse(divName, city)) {
          corp.purchaseWarehouse(divName, city);
          ns.tprint(`[${divName}] purchased warehouse in ${city}.`);
          anyChanges = true;
        }
      } catch (err) {
        ns.print(`purchaseWarehouse(${divName}, ${city}) failed: ${String(err)}`);
        continue;
      }

      // 4) Ensure office size >= officeSizeTarget, with optional job assignment
      const beforeOffice = corp.getOffice(divName, city);
      const beforeSize = beforeOffice.size;
      const officeChanged = await ensureOfficeWithJobs(
        ns,
        divName,
        city,
        officeSizeTarget,
        assignJobs,
      );
      if (officeChanged || corp.getOffice(divName, city).size > beforeSize) {
        anyChanges = true;
      }

      // 5) Ensure we are selling Food only (clear Plants sells)
      ensureAgriSales(ns, divName, city);

      // 6) Maintain Water + Chemicals via API "Smart Supply" substitute
      maintainAgriInputs(ns, divName, city);
    } catch (err) {
      ns.tprint(`[${divName}/${city}] Error while bootstrapping city: ${String(err)}`);
    }
  }

  if (anyChanges) {
    ns.tprint(`[${divName}] Agriculture bootstrap pass complete (changes applied).`);
  } else {
    ns.print(`[${divName}] Agriculture bootstrap pass: no changes needed.`);
  }
}

/**
 * Ensure an office exists with at least `targetSize` employees.
 *
 * If assignJobs is true:
 *   - Split them evenly across Operations / Engineer / Business / Management.
 * If assignJobs is false:
 *   - Only ensure size + hiring; leave existing job assignments untouched.
 *
 * @returns {boolean} true if we changed office size or job layout in this call.
 */
async function ensureOfficeWithJobs(ns, divName, city, targetSize, assignJobs) {
  const corp = ns.corporation;
  let changed = false;

  let office;
  try {
    office = corp.getOffice(divName, city);
  } catch {
    // Newly expanded city with no office yet
    corp.hireEmployee(divName, city, "Operations"); // triggers office creation
    office = corp.getOffice(divName, city);
    changed = true;
  }

  let size = office.size;
  if (size < targetSize) {
    const increaseBy = targetSize - size;
    try {
      corp.upgradeOfficeSize(divName, city, increaseBy);
      ns.tprint(`[${divName}/${city}] office size upgraded by +${increaseBy} to ${targetSize}.`);
      size = targetSize;
      changed = true;
    } catch (err) {
      ns.print(`upgradeOfficeSize(${divName}, ${city}) failed: ${String(err)}`);
      return changed;
    }
  }

  // Hire up to the office size
  const toHire = size - office.numEmployees;
  if (toHire > 0) {
    for (let i = 0; i < toHire; i++) {
      try {
        corp.hireEmployee(divName, city);
        changed = true;
      } catch (err) {
        ns.print(`hireEmployee(${divName}, ${city}) failed: ${String(err)}`);
        break;
      }
    }
  }

  if (!assignJobs) {
    // User wants manual control over jobs; do not touch assignments.
    ns.print(
      `[${divName}/${city}] office size=${size}, jobs left to manual control (--assign-none).`,
    );
    return changed;
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
        changed = true;
      } catch (err) {
        ns.print(`setAutoJobAssignment(${divName}, ${city}, ${job}) failed: ${String(err)}`);
      }
      remaining -= count;
    }
  }

  ns.print(`[${divName}/${city}] office jobs auto-refreshed (size=${size}).`);
  return changed;
}

/**
 * Ensure we are selling Food in the given city, and *not* selling Plants.
 *
 * Plants should be treated as a side output / potential input for other
 * divisions; Food is the primary revenue source in Agriculture.
 */
function ensureAgriSales(ns, divName, city) {
  const corp = ns.corporation;

  // 1) Clear any existing Plants sell order by setting amount to "0".
  try {
    corp.sellMaterial(divName, city, "Plants", "0", "MP");
  } catch (err) {
    ns.print(`sellMaterial(${divName}, ${city}, Plants=0) failed: ${String(err)}`);
  }

  // 2) Sell all Food at market price.
  try {
    corp.sellMaterial(divName, city, "Food", "MAX", "MP");
  } catch (err) {
    ns.print(`sellMaterial(${divName}, ${city}, Food) failed: ${String(err)}`);
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

  let wh;
  try {
    wh = corp.getWarehouse(divName, city);
  } catch (err) {
    ns.print(`getWarehouse(${divName}, ${city}) failed: ${String(err)}`);
    return;
  }

  let water, chems;
  try {
    water = corp.getMaterial(divName, city, "Water");
    chems = corp.getMaterial(divName, city, "Chemicals");
  } catch (err) {
    ns.print(`getMaterial(${divName}, ${city}) failed: ${String(err)}`);
    return;
  }

  const waterQty = typeof water?.qty === "number" ? water.qty : 0;
  const chemsQty = typeof chems?.qty === "number" ? chems.qty : 0;

  const waterTarget = 20_000 + 5_000 * wh.level;
  const chemTarget = 10_000 + 2_500 * wh.level;

  // Water
  try {
    const buyRate = waterQty < waterTarget ? 500 : 0;
    corp.buyMaterial(divName, city, "Water", buyRate);
  } catch (err) {
    ns.print(`buyMaterial Water [${divName}/${city}] failed: ${String(err)}`);
  }

  // Chemicals
  try {
    const buyRate = chemsQty < chemTarget ? 250 : 0;
    corp.buyMaterial(divName, city, "Chemicals", buyRate);
  } catch (err) {
    ns.print(`buyMaterial Chemicals [${divName}/${city}] failed: ${String(err)}`);
  }

  // Log with safe numbers only
  try {
    ns.print(
      `[${divName}/${city}] Water=${ns.formatNumber(waterQty)} / ${ns.formatNumber(
        waterTarget,
      )}, Chems=${ns.formatNumber(chemsQty)} / ${ns.formatNumber(chemTarget)}.`,
    );
  } catch (err) {
    ns.print(
      `[${divName}/${city}] Water=${waterQty}/${waterTarget}, Chems=${chemsQty}/${chemTarget} (raw log; formatNumber failed).`,
    );
  }
}

// --------------------------------------------------------------------------------
// Chemical: support division + exports
// --------------------------------------------------------------------------------

/**
 * Once we have some funds, create a Chemical division as a support industry.
 *
 * - Minimal offices/warehouses (we do not care about its direct profit)
 * - Make Chemicals to boost Agriculture's material quality
 * - Wire exports:
 *     Agriculture -> Chemical : Plants (for Chem input)
 *     Chemical    -> Agriculture : Chemicals
 *
 * Only called when --chem-support is set AND funds are high.
 */
async function ensureChemicalSupport(ns, chemDiv, agriDiv, CITIES, assignJobs) {
  const corp = ns.corporation;

  // 1) Ensure division exists
  if (!divisionExists(corp, chemDiv)) {
    try {
      corp.expandIndustry("Chemical", chemDiv);
      ns.tprint(`Created Chemical division '${chemDiv}' as support.`);
    } catch (err) {
      ns.print(`Failed to create Chemical division: ${String(err)}`);
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
        ns.tprint(`[${chemDiv}] expanded to ${city}.`);
      }
    } catch (err) {
      ns.print(`expandCity(${chemDiv}, ${city}) failed: ${String(err)}`);
    }

    // warehouse
    try {
      if (!corp.hasWarehouse(chemDiv, city)) {
        corp.purchaseWarehouse(chemDiv, city);
        ns.tprint(`[${chemDiv}] purchased warehouse in ${city}.`);
      }
    } catch (err) {
      ns.print(`purchaseWarehouse(${chemDiv}, ${city}) failed: ${String(err)}`);
    }

    // one tiny warehouse upgrade so it's not starved
    try {
      const wh = corp.getWarehouse(chemDiv, city);
      if (wh.level < 1) {
        corp.upgradeWarehouse(chemDiv, city);
        ns.tprint(`[${chemDiv}/${city}] warehouse upgraded to level 1.`);
      }
    } catch (err) {
      ns.print(`upgradeWarehouse(${chemDiv}, ${city}) failed: ${String(err)}`);
    }

    // small office with Ops/Eng/R&D
    await ensureChemOfficeWithJobs(ns, chemDiv, city, officeSizeTarget, assignJobs);

    // Chemicals are output; sell overflow at market price
    try {
      corp.sellMaterial(chemDiv, city, "Chemicals", "MAX", "MP");
    } catch (err) {
      ns.print(`sellMaterial(${chemDiv}, ${city}, Chemicals) failed: ${String(err)}`);
    }
  }

  // 3) Wire exports between Agri and Chem
  wireExportsAgriChem(ns, agriDiv, chemDiv, CITIES);
}

/**
 * Chemical office: small Ops/Eng/R&D mix to generate RP + quality.
 *
 * If assignJobs is false, we just ensure size/hiring and leave jobs alone.
 */
async function ensureChemOfficeWithJobs(ns, divName, city, targetSize, assignJobs) {
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
      ns.tprint(
        `[${divName}/${city}] Chem office size increased by +${increaseBy} up to ${targetSize}.`,
      );
      size = targetSize;
    } catch (err) {
      ns.print(`upgradeOfficeSize(${divName}, ${city}) failed: ${String(err)}`);
      return;
    }
  }

  const toHire = size - office.numEmployees;
  for (let i = 0; i < toHire; i++) {
    try {
      corp.hireEmployee(divName, city);
    } catch (err) {
      ns.print(`hireEmployee(${divName}, ${city}) failed: ${String(err)}`);
      break;
    }
  }

  if (!assignJobs) {
    ns.print(`[${divName}/${city}] Chem office size=${size}, jobs left to manual control (--assign-none).`);
    return;
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
        const current = corp.getOffice(divName, city).employeeJobs[job] || 0;
        corp.setAutoJobAssignment(divName, city, job, current + 1);
      } catch (err) {
        ns.print(`setAutoJobAssignment(${divName}, ${city}, ${job}) failed: ${String(err)}`);
      }
      remaining--;
    }
  }

  ns.print(`[${divName}/${city}] Chem jobs auto-refreshed (size=${size}).`);
}

/**
 * Wire exports using the recommended formula: (IPROD + IINV / 10) * (-1)
 *   - Agriculture exports Plants to Chemical
 *   - Chemical exports Chemicals to Agriculture
 *
 * Warning: the corp API does not let us list existing exports, so we
 *          cancel and re-add the exact same expression every tick.
 */
function wireExportsAgriChem(ns, agriDiv, chemDiv, CITIES) {
  const corp = ns.corporation;
  const amtExpr = "(IPROD+IINV/10)*(-1)";

  for (const city of CITIES) {
    // Agri -> Chem : Plants
    try {
      corp.cancelExportMaterial(agriDiv, city, chemDiv, city, "Plants", amtExpr);
    } catch (_) {
      // ignore if none existed
    }
    try {
      corp.exportMaterial(agriDiv, city, chemDiv, city, "Plants", amtExpr);
    } catch (err) {
      ns.print(`export Plants ${agriDiv}/${city} -> ${chemDiv}/${city} failed: ${String(err)}`);
    }

    // Chem -> Agri : Chemicals
    try {
      corp.cancelExportMaterial(chemDiv, city, agriDiv, city, "Chemicals", amtExpr);
    } catch (_) {
      // ignore
    }
    try {
      corp.exportMaterial(chemDiv, city, agriDiv, city, "Chemicals", amtExpr);
    } catch (err) {
      ns.print(`export Chemicals ${chemDiv}/${city} -> ${agriDiv}/${city} failed: ${String(err)}`);
    }
  }

  ns.print(`Agri/Chem exports refreshed using ${amtExpr}.`);
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
    // getDivision throws if the division does not exist
    corp.getDivision(divName);
    return true;
  } catch {
    return false;
  }
}
