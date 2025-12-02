/**
 * corp/agri-inputs.js
 *
 * Water & Chemicals manager for an Agriculture division.
 *
 * Behavior:
 *  - For a given division (default "Agri"), in each city:
 *      * Reads warehouse capacity and current Water / Chemicals quantities.
 *      * Chooses target amounts based on a fraction of warehouse capacity,
 *        with roughly the correct Water:Chem ratio (2.5:1).
 *      * Adjusts buyMaterial() rates toward those targets over several corp cycles.
 *      * Pauses buying if the warehouse is almost full to avoid stalls.
 *
 *  - Does NOT:
 *      * Create divisions or cities
 *      * Modify offices, employees, or jobs
 *      * Touch sell orders (use corp/agri-sales.js for that)
 *
 * Intended to be used alongside:
 *  - corp/agri-structure.js  (one-shot structure + hiring)
 *  - corp/agri-sales.js      (Plants/Food sales)
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["division", "Agri"],   // Which division to manage
    ["loop", true],         // Run continuously (set --no-loop for one-shot)
    ["reserve-frac", 0.1],  // Fraction of warehouse capacity kept empty (0–0.5)
    ["fill-cycles", 20],    // Approx cycles to move from 0 → target stock
    ["max-rate", 500],      // Max buy rate per material per sec
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
  let CITIES;
  try {
    CITIES = corp.getDivision(divName).cities;
  } catch (err) {
    ns.tprint(`Division '${divName}' not found: ${String(err)}`);
    return;
  }

  if (!Array.isArray(CITIES) || CITIES.length === 0) {
    ns.tprint(`Division '${divName}' has no active cities; nothing to manage.`);
    return;
  }

  const reserveFrac = clamp(Number(flags["reserve-frac"]), 0, 0.5);
  const fillCycles = Math.max(5, Number(flags["fill-cycles"]) || 20);
  const maxRate = Math.max(10, Number(flags["max-rate"]) || 500);

  ns.tprint(
    `agri-inputs: managing '${divName}' Water/Chems in ${CITIES.length} cities; ` +
      `reserve=${(reserveFrac * 100).toFixed(0)}%, fill over ~${fillCycles} corp cycles.`,
  );

  if (flags.loop) {
    while (true) {
      try {
        await tickInputs(ns, divName, CITIES, reserveFrac, fillCycles, maxRate);
      } catch (err) {
        ns.print(`agri-inputs tick error: ${String(err)}`);
      }

      // Sync with corp cycle
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
    // One-shot adjustment
    try {
      await tickInputs(ns, divName, CITIES, reserveFrac, fillCycles, maxRate);
      ns.tprint("agri-inputs: one-shot Water/Chems adjustment complete.");
    } catch (err) {
      ns.tprint(`agri-inputs one-shot error: ${String(err)}`);
    }
  }
}

// Help printer
function printHelp(ns) {
  ns.tprint("corp/agri-inputs.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Maintain Water and Chemicals for an Agriculture division.");
  ns.tprint("  Uses warehouse capacity and real-time stock levels to set buyMaterial");
  ns.tprint("  rates, keeping Water/Chems near target levels with the correct ratio.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Only touches 'Water' and 'Chemicals' for the chosen division.");
  ns.tprint("  - Does NOT change jobs, offices, or sell orders.");
  ns.tprint("  - Designed to avoid warehouse stalls by:");
  ns.tprint("      * Targeting < 100% of warehouse capacity (reserve-frac).");
  ns.tprint("      * Pausing buys when warehouse is nearly full.");
  ns.tprint("      * Using the 0.5 Water / 0.2 Chem formula ratio (~2.5:1).");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run corp/agri-inputs.js");
  ns.tprint("  run corp/agri-inputs.js --division Agri");
  ns.tprint("  run corp/agri-inputs.js --no-loop        (single adjustment)");
  ns.tprint("  run corp/agri-inputs.js --reserve-frac 0.15 --fill-cycles 30");
  ns.tprint("  run corp/agri-inputs.js --max-rate 250");
  ns.tprint("  run corp/agri-inputs.js --help");
}

/**
 * One adjustment step for all cities of a division.
 * Uses warehouse capacity and current Water/Chem stocks to compute targets
 * and buy rates that move toward those targets over a number of cycles.
 */
async function tickInputs(ns, divName, CITIES, reserveFrac, fillCycles, maxRate) {
  const corp = ns.corporation;

  // Agriculture formula: 0.5 Water + 0.2 Chemicals => 1 Plants + 1 Food
  // Desired ratio by *units* is ~2.5 Water : 1 Chemicals
  const desiredRatio = 2.5; // Water / Chem

  for (const city of CITIES) {
    if (!corp.hasWarehouse(divName, city)) continue;

    let wh;
    try {
      wh = corp.getWarehouse(divName, city);
    } catch (err) {
      ns.print(`getWarehouse(${divName}, ${city}) failed: ${String(err)}`);
      continue;
    }

    const capacity = wh.size;
    const used = wh.sizeUsed ?? 0;
    if (!capacity || capacity <= 0) continue;

    const usedFrac = used / capacity;

    // If we're near full, stop buying to avoid stalls; let consumption + sales drain it.
    if (usedFrac >= 0.98) {
      try {
        corp.buyMaterial(divName, city, "Water", 0);
        corp.buyMaterial(divName, city, "Chemicals", 0);
      } catch (err) {
        ns.print(`buyMaterial zero-out near cap [${divName}/${city}] failed: ${String(err)}`);
      }
      ns.print(
        `[${divName}/${city}] warehouse near full (${ns.formatNumber(
          used,
        )}/${ns.formatNumber(capacity)}); paused Water/Chems buying.`,
      );
      continue;
    }

    const usableCap = capacity * (1 - reserveFrac);

    // Split usable capacity into Water/Chems targets with 2.5:1 ratio.
    // waterFrac = 2.5 / 3.5, chemFrac = 1 / 3.5
    const waterFrac = desiredRatio / (desiredRatio + 1);
    const chemFrac = 1 / (desiredRatio + 1);

    const waterTarget = usableCap * waterFrac;
    const chemTarget = usableCap * chemFrac;

    let water, chems;
    try {
      water = corp.getMaterial(divName, city, "Water");
      chems = corp.getMaterial(divName, city, "Chemicals");
    } catch (err) {
      ns.print(`getMaterial(${divName}, ${city}) failed: ${String(err)}`);
      continue;
    }

    const waterQty = typeof water?.qty === "number" ? water.qty : 0;
    const chemsQty = typeof chems?.qty === "number" ? chems.qty : 0;

    // Compute base buy rates toward targets
    // Compute base buy rates toward targets
    const waterDiff = waterTarget - waterQty;
    const chemDiff  = chemTarget  - chemsQty;

    // Start with "move toward target over fillCycles"
    let waterRate =
        waterDiff <= 0 ? 0 : Math.min(maxRate, waterDiff / fillCycles);
    let chemRate =
        chemDiff  <= 0 ? 0 : Math.min(maxRate, chemDiff  / fillCycles);

    // Extra ratio guard, but ONLY when we actually have both materials.
    // This avoids the chems=0 → ratio=Infinity bug at startup.
      if (waterQty > 0 && chemsQty > 0) {
        const ratio = waterQty / chemsQty; // Water / Chem

      if (ratio > desiredRatio * 1.5) {
    // Too much Water compared to Chem → stop Water, favor Chems
        waterRate = 0;
        chemRate = Math.max(
            chemRate,
            Math.min(maxRate, chemTarget / fillCycles),
        );
    } else if (ratio < desiredRatio * 0.6) {
        // Too little Water → give Water a boost
        waterRate = Math.max(
        waterRate,
        Math.min(maxRate, waterTarget / fillCycles),
        );
    }
}

try {
  corp.buyMaterial(divName, city, "Water", waterRate);
} catch (err) {
  ns.print(`buyMaterial Water [${divName}/${city}] failed: ${String(err)}`);
}

try {
  corp.buyMaterial(divName, city, "Chemicals", chemRate);
} catch (err) {
  ns.print(`buyMaterial Chemicals [${divName}/${city}] failed: ${String(err)}`);
}


    ns.print(
      `[${divName}/${city}] WH=${ns.formatNumber(used)}/${ns.formatNumber(
        capacity,
      )} ` +
        `Water=${ns.formatNumber(waterQty)}/${ns.formatNumber(
          waterTarget,
        )} (rate=${waterRate.toFixed(1)}/s), ` +
        `Chems=${ns.formatNumber(chemsQty)}/${ns.formatNumber(
          chemTarget,
        )} (rate=${chemRate.toFixed(1)}/s).`,
    );
  }
}

function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}
