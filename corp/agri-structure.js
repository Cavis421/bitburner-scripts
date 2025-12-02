/** 
 * corp/agri-structure.js
 *
 * One-shot Agriculture structure bootstrap:
 *  - Ensure corp exists (optional BN3 seed money)
 *  - Ensure Agriculture division exists
 *  - Expand Agri to 6 main cities
 *  - Buy warehouses in those cities
 *  - Ensure offices have at least N employees (configurable)
 *  - Optionally auto-assign jobs (or leave them manual)
 *
 * This script does NOT:
 *  - Buy Water/Chemicals
 *  - Set sell orders
 *  - Loop
 *
 * Run:
 *  > run corp/agri-structure.js
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["office-size", 4],   // minimum office size per city
    ["assign-none", false], // if true, don't auto-assign jobs
    ["no-seed", false],   // if true, don't try BN3 seed money corp creation
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
  const CITIES = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];
  const assignJobs = !flags["assign-none"];
  const officeSizeTarget = Number(flags["office-size"]) || 4;

  // 0) Ensure corporation exists
  if (!corp.hasCorporation()) {
    try {
      corp.createCorporation(CORP_NAME, !flags["no-seed"]);
      ns.tprint(`Created corporation '${CORP_NAME}'.`);
    } catch (err) {
      ns.tprint(`Failed to create corporation: ${String(err)}`);
      return;
    }
  } else {
    const info = corp.getCorporation();
    ns.print(`Using existing corporation '${info.name}'.`);
  }

  // 1) Ensure Agriculture division exists
  if (!divisionExists(corp, AGRI_DIV)) {
    try {
      corp.expandIndustry("Agriculture", AGRI_DIV);
      ns.tprint(`Created Agriculture division '${AGRI_DIV}'.`);
    } catch (err) {
      ns.tprint(`Failed to create Agriculture division: ${String(err)}`);
      return;
    }
  }

  // 2) Per-city build-out
  for (const city of CITIES) {
    try {
      const div = corp.getDivision(AGRI_DIV);

      // 2a) Expand city if needed
      if (!div.cities.includes(city)) {
        corp.expandCity(AGRI_DIV, city);
        ns.tprint(`[${AGRI_DIV}] expanded to ${city}.`);
      }

      // 2b) Ensure warehouse
      if (!corp.hasWarehouse(AGRI_DIV, city)) {
        corp.purchaseWarehouse(AGRI_DIV, city);
        ns.tprint(`[${AGRI_DIV}] purchased warehouse in ${city}.`);
      }

      // 2c) Ensure office + hiring + optional jobs
      await ensureOfficeWithJobs(ns, AGRI_DIV, city, officeSizeTarget, assignJobs);
    } catch (err) {
      ns.tprint(`[${AGRI_DIV}/${city}] error during structure bootstrap: ${String(err)}`);
    }
  }

  ns.tprint(
    `[${AGRI_DIV}] structure bootstrap complete. ` +
    `Offices>=${officeSizeTarget}, warehouses ensured in 6 cities.` +
    (assignJobs ? " Jobs auto-assigned." : " Jobs left to manual control."),
  );
}

// Help for this script
function printHelp(ns) {
  ns.tprint("corp/agri-structure.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  One-shot Agriculture structure bootstrap.");
  ns.tprint("  Ensures the corporation, Agriculture division, 6-city rollout, warehouses,");
  ns.tprint("  and offices with at least the requested number of employees.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Does NOT buy materials or set sell orders.");
  ns.tprint("  - Use --assign-none to keep full manual control of job assignments.");
  ns.tprint("  - Safe to re-run; operations are idempotent where possible.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run corp/agri-structure.js");
  ns.tprint("  run corp/agri-structure.js --office-size 9");
  ns.tprint("  run corp/agri-structure.js --assign-none");
  ns.tprint("  run corp/agri-structure.js --no-seed");
}

/**
 * Ensure an office exists with at least `targetSize` employees.
 * If assignJobs is true, we spread people across Ops/Eng/Biz/Mgmt.
 */
async function ensureOfficeWithJobs(ns, divName, city, targetSize, assignJobs) {
  const corp = ns.corporation;
  let office;

  try {
    office = corp.getOffice(divName, city);
  } catch {
    // No office yet: hiring triggers creation
    corp.hireEmployee(divName, city, "Operations");
    office = corp.getOffice(divName, city);
    ns.tprint(`[${divName}/${city}] created initial office with 1 employee.`);
  }

  let size = office.size;
  if (size < targetSize) {
    const increaseBy = targetSize - size;
    try {
      corp.upgradeOfficeSize(divName, city, increaseBy);
      ns.tprint(`[${divName}/${city}] office size upgraded by +${increaseBy} to ${targetSize}.`);
      size = targetSize;
    } catch (err) {
      ns.print(`upgradeOfficeSize(${divName}, ${city}) failed: ${String(err)}`);
      return;
    }
  }

  // Hire up to office capacity
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
    ns.print(`[${divName}/${city}] office size=${size}, jobs left to manual control.`);
    return;
  }

  // Simple equal split Ops/Eng/Biz/Mgmt
  const jobs = ["Operations", "Engineer", "Business", "Management"];
  const perJob = Math.max(1, Math.floor(size / jobs.length));

  for (const job of jobs) {
    try {
      corp.setAutoJobAssignment(divName, city, job, 0); // clear
    } catch (_) {}
  }

  let remaining = size;
  for (const job of jobs) {
    const count = Math.min(perJob, remaining);
    if (count > 0) {
      try {
        corp.setAutoJobAssignment(divName, city, job, count);
      } catch (err) {
        ns.print(`setAutoJobAssignment(${divName}, ${city}, ${job}) failed: ${String(err)}`);
      }
      remaining -= count;
    }
  }

  ns.print(`[${divName}/${city}] office jobs auto-assigned (size=${size}).`);
}

/** Lightweight division existence helper */
function divisionExists(corp, divName) {
  try {
    corp.getDivision(divName);
    return true;
  } catch {
    return false;
  }
}
