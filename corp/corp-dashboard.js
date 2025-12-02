/**
 * corp/corp-dashboard.js
 *
 * Lightweight corporation status dashboard:
 *  - Summarizes corp funds, revenue, expenses, and valuation
 *  - Shows per-division revenue/expenses/profit and city count
 *  - Warns about warehouses that are close to full
 *  - Optional loop mode to refresh every corp cycle
 *
 * Safe: read-only. Does not buy, sell, hire, or modify anything.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["loop", true],          // If false, run once then exit
    ["interval", 10_000],    // Fallback sleep if corp.nextUpdate() not available
    ["warn-threshold", 0.9], // Warn if warehouse > this fraction of capacity
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

  const warnThreshold = clamp01(Number(flags["warn-threshold"]) || 0.9);
  const fallbackInterval = Math.max(1000, Number(flags.interval) || 10_000);

  if (!flags.loop) {
    ns.clearLog();
    renderDashboard(ns, warnThreshold);
    return;
  }

  ns.tprint(
    `corp-dashboard: starting in --loop mode (warn when warehouses > ${(warnThreshold * 100).toFixed(
      0,
    )}% full).`,
  );
  ns.clearLog();

  while (true) {
    try {
      ns.clearLog();
      renderDashboard(ns, warnThreshold);
    } catch (err) {
      ns.print(`corp-dashboard error: ${String(err)}`);
    }

    // Try to step once per corp cycle if API supports it
    try {
      if (corp.nextUpdate) {
        await corp.nextUpdate();
      } else {
        await ns.sleep(fallbackInterval);
      }
    } catch {
      await ns.sleep(fallbackInterval);
    }
  }
}

// -----------------------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------------------

/**
 * Render one snapshot of the corp dashboard into the script log.
 */
function renderDashboard(ns, warnThreshold) {
  const corp = ns.corporation;
  const info = corp.getCorporation();

  const funds = info.funds;
  const revenue = info.revenue;
  const expenses = info.expenses;
  const profit = revenue - expenses;
  const valuation = info.valuation ?? 0;

  const divisions = info.divisions ?? [];

  ns.print("==================================================");
  ns.print("                 CORPORATION STATUS               ");
  ns.print("==================================================");
  ns.print(`Name:       ${info.name}`);
  ns.print(`Funds:      ${fmtMoney(ns, funds)}`);
  ns.print(`Revenue:    ${fmtMoney(ns, revenue)}/s`);
  ns.print(`Expenses:   ${fmtMoney(ns, expenses)}/s`);
  ns.print(
    `Profit:     ${fmtMoney(ns, profit)}/s ${profit >= 0 ? "(in the black ✅)" : "(loss ❌)"}`,
  );
  if (valuation > 0) {
    ns.print(`Valuation:  ${fmtMoney(ns, valuation)}`);
  }
  ns.print("");

  if (!divisions.length) {
    ns.print("No divisions yet.");
    return;
  }

  ns.print("Divisions:");
  ns.print("----------");

  for (const divName of divisions) {
    let div;
    try {
      div = corp.getDivision(divName);
    } catch (err) {
      ns.print(`  [${divName}] Error fetching division: ${String(err)}`);
      continue;
    }

    const dRev = div.lastCycleRevenue ?? 0;
    const dExp = div.lastCycleExpenses ?? 0;
    const dProfit = dRev - dExp;
    const cityCount = (div.cities ?? []).length;

    ns.print(
      `  [${div.name}] ${div.type} | Cities=${cityCount} | ` +
        `Rev=${fmtMoney(ns, dRev)}/s | Exp=${fmtMoney(ns, dExp)}/s | ` +
        `Profit=${fmtMoney(ns, dProfit)}/s ${dProfit >= 0 ? "✅" : "❌"}`,
    );

    // Warehouse warnings per division
    const warnings = getWarehouseWarnings(ns, corp, div, warnThreshold);
    for (const w of warnings) {
      ns.print(
        `    ⚠ WH near full in ${w.city}: ` +
          `${ns.formatNumber(w.used)} / ${ns.formatNumber(w.size)} ` +
          `(${(w.used / w.size * 100).toFixed(1)}% used)`,
      );
    }
  }

  ns.print("");
  ns.print("Tip: tail corp/corp-dashboard.js to watch this live.");
}

// Return array of { city, used, size } where usage > warnThreshold
function getWarehouseWarnings(ns, corp, div, warnThreshold) {
  const warnings = [];
  const cities = div.cities ?? [];
  for (const city of cities) {
    if (!corp.hasWarehouse(div.name, city)) continue;

    try {
      const wh = corp.getWarehouse(div.name, city);
      const size = wh.size;
      const used = wh.sizeUsed ?? 0;
      if (!size || size <= 0) continue;

      const frac = used / size;
      if (frac >= warnThreshold) {
        warnings.push({ city, used, size });
      }
    } catch (err) {
      ns.print(`Error reading warehouse for ${div.name}/${city}: ${String(err)}`);
    }
  }
  return warnings;
}

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

function fmtMoney(ns, value) {
  return "$" + ns.formatNumber(value ?? 0, 2, 1e3);
}

function clamp01(x) {
  if (!isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

// -----------------------------------------------------------------------------
// Help
// -----------------------------------------------------------------------------

function printHelp(ns) {
  ns.tprint("corp/corp-dashboard.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Read-only corporation dashboard.");
  ns.tprint("  Shows corp-wide funds/revenue/expenses/profit and per-division stats.");
  ns.tprint("  Highlights warehouses that are close to full so you can avoid stalls.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Does NOT modify any corp state (no buys, hires, sales, etc.).");
  ns.tprint("  - With --loop, it refreshes once per corporation cycle using corp.nextUpdate().");
  ns.tprint("  - Use 'tail corp/corp-dashboard.js' to keep the panel visible.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run corp/corp-dashboard.js");
  ns.tprint("  run corp/corp-dashboard.js --loop false         # one-shot snapshot");
  ns.tprint("  run corp/corp-dashboard.js --warn-threshold 0.85");
  ns.tprint("  run corp/corp-dashboard.js --interval 15000     # fallback ms if needed");
  ns.tprint("  run corp/corp-dashboard.js --help");
}
