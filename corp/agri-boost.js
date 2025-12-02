/**
 * corp/agri-boost.js
 *
 * Agriculture "boost materials" manager:
 *  - For a given division (default "Agri"), in each city:
 *      * Ensures we have at least some Hardware, Robots, AI Cores, and Real Estate
 *      * Buys toward per-city targets at a gentle rate
 *      * Skips buying if the warehouse is already too full
 *
 * This script does NOT:
 *  - Touch Water/Chemicals (that's corp/agri-inputs.js)
 *  - Change offices or job assignments
 *  - Set sell orders (use corp/agri-sales.js)
 *
 * Run:
 *  > run corp/agri-boost.js
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["loop", true],            // run continuously by default
    ["division", "Agri"],      // division to boost
    ["fill-cycles", 20],       // how many corp cycles to reach target from 0
    ["warn-threshold", 0.85],  // skip buying if warehouse > 85% full
    // Per-city target amounts (safe, modest defaults for small warehouses)
    ["hw-target", 50],         // Hardware units per city
    ["rob-target", 10],        // Robots per city
    ["ai-target", 10],         // AI Cores per city
    ["re-target", 5000],       // Real Estate units per city
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
  let cities;
  try {
    cities = corp.getDivision(divName).cities;
  } catch (err) {
    ns.tprint(`Division '${divName}' not found: ${String(err)}`);
    return;
  }

  if (!Array.isArray(cities) || cities.length === 0) {
    ns.tprint(`Division '${divName}' has no active cities; nothing to boost.`);
    return;
  }

  const fillCycles = Math.max(5, Number(flags["fill-cycles"]) || 20);
  const warnThreshold = clamp01(Number(flags["warn-threshold"]) || 0.85);

  const hwTarget  = Math.max(0, Number(flags["hw-target"])  || 50);
  const robTarget = Math.max(0, Number(flags["rob-target"]) || 10);
  const aiTarget  = Math.max(0, Number(flags["ai-target"])  || 10);
  const reTarget  = Math.max(0, Number(flags["re-target"])  || 5000);

  ns.tprint(
    `agri-boost: managing '${divName}' boosts in ${cities.length} cities. ` +
      `Targets per city: HW=${hwTarget}, Robots=${robTarget}, AI=${aiTarget}, RE=${reTarget}.`,
  );

  if (!flags.loop) {
    await boostTick(ns, divName, cities, {
      hwTarget,
      robTarget,
      aiTarget,
      reTarget,
      fillCycles,
      warnThreshold,
    });
    ns.tprint("agri-boost: one-shot boost tick complete.");
    return;
  }

  ns.tprint("agri-boost: starting in --loop mode (one pass per corp cycle).");

  while (true) {
    try {
      await boostTick(ns, divName, cities, {
        hwTarget,
        robTarget,
        aiTarget,
        reTarget,
        fillCycles,
        warnThreshold,
      });
    } catch (err) {
      ns.print(`agri-boost tick error: ${String(err)}`);
    }

    // Sync with corp cycle if possible
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

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function boostTick(ns, divName, cities, opts) {
  const corp = ns.corporation;
  const {
    hwTarget,
    robTarget,
    aiTarget,
    reTarget,
    fillCycles,
    warnThreshold,
  } = opts;

  // Modest caps on per-second rates so we don't spike too hard
  const MAX_HW_RATE  = 10;    // units/sec
  const MAX_ROB_RATE = 2;     // units/sec
  const MAX_AI_RATE  = 2;     // units/sec
  const MAX_RE_RATE  = 500;   // units/sec (RE is cheap & tiny)

  for (const city of cities) {
    if (!corp.hasWarehouse(divName, city)) {
      ns.print(`[${divName}/${city}] No warehouse; skipping boost materials.`);
      continue;
    }

    let wh;
    try {
      wh = corp.getWarehouse(divName, city);
    } catch (err) {
      ns.print(`getWarehouse(${divName}, ${city}) failed: ${String(err)}`);
      continue;
    }

    const size = wh.size;
    const used = wh.sizeUsed ?? 0;
    if (!size || size <= 0) continue;

    const usedFrac = used / size;
    if (usedFrac >= warnThreshold) {
      // Warehouse is getting tight; do not stuff it with boosts.
      ns.print(
        `[${divName}/${city}] WH near full (${ns.formatNumber(used)}/${ns.formatNumber(
          size,
        )}); skipping boost buys this tick.`,
      );
      // Also zero out boost buys to avoid lingering non-zero rates if user had set them manually.
      safeBuy(corp, divName, city, "Hardware", 0, ns);
      safeBuy(corp, divName, city, "Robots", 0, ns);
      safeBuy(corp, divName, city, "AI Cores", 0, ns);
      safeBuy(corp, divName, city, "Real Estate", 0, ns);
      continue;
    }

    let hw, rob, ai, re;
    try {
      hw  = corp.getMaterial(divName, city, "Hardware");
      rob = corp.getMaterial(divName, city, "Robots");
      ai  = corp.getMaterial(divName, city, "AI Cores");
      re  = corp.getMaterial(divName, city, "Real Estate");
    } catch (err) {
      ns.print(`getMaterial(${divName}, ${city}, ...) failed: ${String(err)}`);
      continue;
    }

    const hwQty  = typeof hw?.qty  === "number" ? hw.qty  : 0;
    const robQty = typeof rob?.qty === "number" ? rob.qty : 0;
    const aiQty  = typeof ai?.qty  === "number" ? ai.qty  : 0;
    const reQty  = typeof re?.qty  === "number" ? re.qty  : 0;

    const hwDiff  = hwTarget  - hwQty;
    const robDiff = robTarget - robQty;
    const aiDiff  = aiTarget  - aiQty;
    const reDiff  = reTarget  - reQty;

    const hwRate =
      hwDiff <= 0 ? 0 : Math.min(MAX_HW_RATE,  hwDiff  / fillCycles);
    const robRate =
      robDiff <= 0 ? 0 : Math.min(MAX_ROB_RATE, robDiff / fillCycles);
    const aiRate =
      aiDiff <= 0 ? 0 : Math.min(MAX_AI_RATE,  aiDiff  / fillCycles);
    const reRate =
      reDiff <= 0 ? 0 : Math.min(MAX_RE_RATE,  reDiff  / fillCycles);

    safeBuy(corp, divName, city, "Hardware", hwRate, ns);
    safeBuy(corp, divName, city, "Robots", robRate, ns);
    safeBuy(corp, divName, city, "AI Cores", aiRate, ns);
    safeBuy(corp, divName, city, "Real Estate", reRate, ns);

    ns.print(
      `[${divName}/${city}] WH=${ns.formatNumber(used)}/${ns.formatNumber(
        size,
      )} | ` +
        `HW=${ns.formatNumber(hwQty)}/${hwTarget} (rate=${hwRate.toFixed(2)}/s), ` +
        `Rob=${ns.formatNumber(robQty)}/${robTarget} (rate=${robRate.toFixed(2)}/s), ` +
        `AI=${ns.formatNumber(aiQty)}/${aiTarget} (rate=${aiRate.toFixed(2)}/s), ` +
        `RE=${ns.formatNumber(reQty)}/${reTarget} (rate=${reRate.toFixed(2)}/s).`,
    );
  }
}

function safeBuy(corp, divName, city, mat, rate, ns) {
  try {
    corp.buyMaterial(divName, city, mat, rate);
  } catch (err) {
    ns.print(`buyMaterial(${divName}, ${city}, ${mat}, ${rate}) failed: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers + help
// ---------------------------------------------------------------------------

function clamp01(x) {
  if (!isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function printHelp(ns) {
  ns.tprint("corp/agri-boost.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Maintain a baseline of boost materials (Hardware, Robots, AI Cores,");
  ns.tprint("  Real Estate) for an Agriculture division. Tends toward per-city targets");
  ns.tprint("  with gentle buy rates, and skips buying when warehouses are nearly full.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Only affects boost materials; Water/Chemicals are handled elsewhere.");
  ns.tprint("  - Does not change employee jobs, offices, or sell orders.");
  ns.tprint("  - Safe to run alongside corp/agri-structure.js, corp/agri-inputs.js,");
  ns.tprint("    and corp/agri-sales.js.");
  ns.tprint("  - Default targets are conservative and meant for early 300-size warehouses.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run corp/agri-boost.js");
  ns.tprint("  run corp/agri-boost.js --loop false              # one-shot tick");
  ns.tprint("  run corp/agri-boost.js --division Agri");
  ns.tprint("  run corp/agri-boost.js --hw-target 75 --rob-target 15");
  ns.tprint("  run corp/agri-boost.js --ai-target 15 --re-target 8000");
  ns.tprint("  run corp/agri-boost.js --fill-cycles 30 --warn-threshold 0.9");
  ns.tprint("  run corp/agri-boost.js --help");
}
