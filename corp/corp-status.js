/** 
 * corp/corp-status.js
 *
 * Snapshot-style corporation status report.
 *
 *  - Shows overall corp funds, revenue, and profit
 *  - For each selected division:
 *      - Division revenue/expenses/profit (this + last cycle)
 *      - Per-city warehouse usage
 *      - Per-city material snapshot for:
 *          Water, Chemicals, Plants, Food
 *
 * Usage:
 *   run corp/corp-status.js
 *   run corp/corp-status.js --division Agri
 *   run corp/corp-status.js --all-divisions
 *
 * RAM: corp API only, one-shot.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["division", "Agri"],
    ["all-divisions", false],
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

  const corpInfo = corp.getCorporation();

  // ---------------------------------------------------------------------------
  // Corp summary
  // ---------------------------------------------------------------------------
  ns.tprint("============================================================");
  ns.tprint("CORPORATION STATUS");
  ns.tprint("============================================================");
  ns.tprint(`Name:        ${corpInfo.name}`);
  ns.tprint(`Funds:       ${fmtMoney(ns, corpInfo.funds)}`);
  ns.tprint(
    `This cycle:  Revenue=${fmtMoney(ns, corpInfo.revenue)}  ` +
    `Expenses=${fmtMoney(ns, corpInfo.expenses)}  ` +
    `Profit=${fmtMoney(ns, corpInfo.revenue - corpInfo.expenses)}`
  );
  ns.tprint(
    `Last cycle:  Revenue=${fmtMoney(ns, corpInfo.lastCycleRevenue)}  ` +
    `Expenses=${fmtMoney(ns, corpInfo.lastCycleExpenses)}  ` +
    `Profit=${fmtMoney(ns, corpInfo.lastCycleRevenue - corpInfo.lastCycleExpenses)}`
  );
  ns.tprint("");

  // ---------------------------------------------------------------------------
  // Determine which divisions to show
  // ---------------------------------------------------------------------------
  let divNames = [];
  if (flags["all-divisions"]) {
    divNames = corp.getCorporation().divisions.slice();
  } else {
    const name = String(flags.division);
    divNames = [name];
  }

  for (const divName of divNames) {
    let div;
    try {
      div = corp.getDivision(divName);
    } catch {
      ns.tprint(`Division '${divName}' does not exist; skipping.`);
      continue;
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint(`DIVISION: ${divName}  (Industry: ${div.type})`);
    ns.tprint("------------------------------------------------------------");
    ns.tprint(
      `Last cycle:  Revenue=${fmtMoney(ns, div.lastCycleRevenue)}  ` +
      `Expenses=${fmtMoney(ns, div.lastCycleExpenses)}  ` +
      `Profit=${fmtMoney(ns, div.lastCycleRevenue - div.lastCycleExpenses)}`
    );
    ns.tprint(
      `This cycle:  Revenue=${fmtMoney(ns, div.thisCycleRevenue)}  ` +
      `Expenses=${fmtMoney(ns, div.thisCycleExpenses)}  ` +
      `Profit=${fmtMoney(ns, div.thisCycleRevenue - div.thisCycleExpenses)}`
    );
    ns.tprint("");

    if (!div.cities || div.cities.length === 0) {
      ns.tprint("  (No active cities in this division.)");
      ns.tprint("");
      continue;
    }

    ns.tprint(
      pad("City", 12) +
      pad("WH Used/Cap", 18) +
      pad("Water (qty|prod)", 24) +
      pad("Chem  (qty|prod)", 24) +
      pad("Plants(qty|prod)", 24) +
      pad("Food  (qty|prod)", 24)
    );

    for (const city of div.cities) {
      const whInfo = getWarehouseSafe(ns, corp, divName, city);

      const water = getMaterialSafe(ns, corp, divName, city, "Water");
      const chems = getMaterialSafe(ns, corp, divName, city, "Chemicals");
      const plants = getMaterialSafe(ns, corp, divName, city, "Plants");
      const food = getMaterialSafe(ns, corp, divName, city, "Food");

      const whStr = whInfo
        ? `${fmtNum(ns, whInfo.sizeUsed)}/${fmtNum(ns, whInfo.size)}`
        : "no-warehouse";

      const line =
        pad(city, 12) +
        pad(whStr, 18) +
        pad(formatMatSnapshot(ns, water), 24) +
        pad(formatMatSnapshot(ns, chems), 24) +
        pad(formatMatSnapshot(ns, plants), 24) +
        pad(formatMatSnapshot(ns, food), 24);

      ns.tprint(line);
    }

    ns.tprint("");
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function printHelp(ns) {
  ns.tprint("corp/corp-status.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Print a snapshot of your corporation: funds, profit, and per-division");
  ns.tprint("  status. For each selected division, shows per-city warehouse usage and");
  ns.tprint("  material levels for Water, Chemicals, Plants, and Food.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  This is a one-shot status script; it runs once and exits.");
  ns.tprint("  Use --division to focus on a single division (default: Agri).");
  ns.tprint("  Use --all-divisions to show every division.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run corp/corp-status.js [--help]");
  ns.tprint("  run corp/corp-status.js --division Agri");
  ns.tprint("  run corp/corp-status.js --all-divisions");
}

function fmtMoney(ns, n) {
  try {
    return ns.formatNumber(n, 2);
  } catch {
    return `${Math.round(n)}`;
  }
}

function fmtNum(ns, n) {
  try {
    return ns.formatNumber(n, 1);
  } catch {
    return `${Math.round(n)}`;
  }
}

function pad(s, width) {
  s = String(s);
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

function getWarehouseSafe(ns, corp, divName, city) {
  try {
    if (!corp.hasWarehouse(divName, city)) return null;
    return corp.getWarehouse(divName, city);
  } catch (err) {
    ns.print(`getWarehouse(${divName}, ${city}) failed: ${String(err)}`);
    return null;
  }
}

function getMaterialSafe(ns, corp, divName, city, name) {
  try {
    return corp.getMaterial(divName, city, name);
  } catch (err) {
    ns.print(`getMaterial(${divName}, ${city}, ${name}) failed: ${String(err)}`);
    return null;
  }
}

function formatMatSnapshot(ns, mat) {
  if (!mat) return "-";
  const qty = fmtNum(ns, mat.qty ?? 0);
  const prod = fmtNum(ns, mat.prod ?? 0);
  return `${qty}|${prod}/s`;
}
