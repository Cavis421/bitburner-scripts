/** 
 * corp/agri-sales.js
 *
 * Agriculture sales manager:
 *  - Ensures Plants and Food are sold in all cities for a given division
 *  - Uses sellMaterial(div, city, material, "MAX", "MP")
 *  - Can run once (one-shot) or continuously (--loop)
 *
 * This script is intentionally narrow:
 *  - Does NOT create divisions, cities, or warehouses
 *  - Does NOT hire or assign employees
 *  - Does NOT buy Water/Chemicals
 *
 * Intended to be used alongside:
 *  - corp/agri-structure.js  (structure & hiring)
 *  - corp/agri-inputs.js     (Water/Chem buy logic)
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["loop", false],
    ["division", "Agri"], // which division's Plants/Food to sell
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

  const divName = String(flags.division);

  // Verify division exists up front
  let CITIES;
  try {
    const div = corp.getDivision(divName);
    CITIES = div.cities;
    if (!Array.isArray(CITIES) || CITIES.length === 0) {
      ns.tprint(`Division '${divName}' has no active cities yet; nothing to sell.`);
      return;
    }
  } catch (err) {
    ns.tprint(`Division '${divName}' not found: ${String(err)}`);
    return;
  }

  if (flags.loop) {
    ns.tprint(
      `agri-sales: starting in --loop mode for division '${divName}' (Plants/Food sales only).`,
    );
    while (true) {
      try {
        ensureAgriSalesForDivision(ns, divName, CITIES);
      } catch (err) {
        ns.print(`agri-sales tick error: ${String(err)}`);
      }

      // Step once per corp cycle
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
    // One-shot: apply sales config once and exit
    try {
      ensureAgriSalesForDivision(ns, divName, CITIES);
      ns.tprint(
        `agri-sales: one-shot sales setup complete for '${divName}' (Plants/Food in ${CITIES.length} cities).`,
      );
    } catch (err) {
      ns.tprint(`agri-sales one-shot error: ${String(err)}`);
    }
  }
}

// Help printer for this script.
// Follows the Description / Notes / Syntax layout.
function printHelp(ns) {
  ns.tprint("corp/agri-sales.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Manage sales of Plants and Food for an Agriculture-style division.");
  ns.tprint("  Ensures sell orders are set to 'MAX @ MP' for each active city.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Only affects the 'Plants' and 'Food' materials for the chosen division.");
  ns.tprint("  - Does NOT create divisions, expand cities, or modify employees.");
  ns.tprint("  - Safe to use alongside corp/agri-structure.js and corp/agri-inputs.js.");
  ns.tprint("  - With --loop, it re-applies sales orders each corp cycle.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run corp/agri-sales.js");
  ns.tprint("  run corp/agri-sales.js --division Agri");
  ns.tprint("  run corp/agri-sales.js --loop");
  ns.tprint("  run corp/agri-sales.js --division Agri --loop");
  ns.tprint("  run corp/agri-sales.js --help");
}

/**
 * Ensure Plants and Food are being sold at MAX / MP in all cities
 * for the given division. Idempotent and safe to call repeatedly.
 *
 * @param {NS} ns
 * @param {string} divName
 * @param {string[]} CITIES
 */
function ensureAgriSalesForDivision(ns, divName, CITIES) {
  const corp = ns.corporation;
  const outputs = ["Plants", "Food"];

  for (const city of CITIES) {
    if (!corp.hasWarehouse(divName, city)) {
      ns.print(`[${divName}/${city}] No warehouse; skipping sales setup.`);
      continue;
    }

    for (const mat of outputs) {
      try {
        corp.sellMaterial(divName, city, mat, "MAX", "MP");
      } catch (err) {
        ns.print(`sellMaterial(${divName}, ${city}, ${mat}) failed: ${String(err)}`);
      }
    }

    ns.print(`[${divName}/${city}] Sales set: Plants/Food => MAX @ MP.`);
  }
}
