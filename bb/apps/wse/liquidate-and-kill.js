/**
 * wse/liquidate-and-kill.js
 *
 * Auto-liquidate all stock positions, then optionally kill scripts.
 *  - Sells ALL long positions (sellStock)
 *  - Closes ALL short positions if shorting is unlocked (sellShort)
 *  - Optionally kills scripts after liquidation (default: kill only basic-trader)
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],

    ["kill", true],                 // kill scripts after liquidation
    ["kill-self", true],            // kill this script at end
    ["kill-basic-trader", true],    // kill /bin/basic-trader.js if running
    ["basic-trader-path", "/bin/basic-trader.js"],

    ["kill-scripts", ""],           // CSV list of scripts to kill (paths)
    ["kill-all", false],            // DANGER: killall on home after liquidation

    ["wait-ms", 200],               // small delay after selling before killing
  ]);

  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  if (!ns.stock || typeof ns.stock.getSymbols !== "function") {
    ns.tprint("ERROR: Stock API not available.");
    return;
  }

  const allowShorts = canShortStocks(ns);

  const syms = ns.stock.getSymbols();
  let soldLong = 0;
  let closedShort = 0;

  for (const sym of syms) {
    const [longShares, , shortShares] = ns.stock.getPosition(sym);

    if (longShares > 0) {
      try {
        ns.stock.sellStock(sym, longShares);
        soldLong++;
        ns.print(`[${sym}] Sold LONG ${longShares}`);
      } catch (err) {
        ns.tprint(`[${sym}] ERROR selling long: ${String(err)}`);
      }
    }

    if (allowShorts && shortShares > 0) {
      try {
        ns.stock.sellShort(sym, shortShares);
        closedShort++;
        ns.print(`[${sym}] Closed SHORT ${shortShares}`);
      } catch (err) {
        ns.tprint(`[${sym}] ERROR closing short: ${String(err)}`);
      }
    }
  }

  ns.tprint(
    `liquidate: completed. Sold longs in ${soldLong} symbols, closed shorts in ${closedShort} symbols.`,
  );

  if (!flags.kill) {
    ns.tprint("liquidate: --kill false; not killing any scripts.");
    return;
  }

  await ns.sleep(Math.max(0, Number(flags["wait-ms"]) || 0));

  // -------------------------------------------------------------
  // Kill targets
  // -------------------------------------------------------------

  const host = "home";

  if (flags["kill-basic-trader"]) {
    const path = String(flags["basic-trader-path"] || "/bin/basic-trader.js");
    const killed = killByScript(ns, host, path);
    if (killed > 0) ns.tprint(`liquidate: killed ${killed} instance(s) of ${path} on ${host}.`);
  }

  const extra = String(flags["kill-scripts"] || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  for (const script of extra) {
    const killed = killByScript(ns, host, script);
    if (killed > 0) ns.tprint(`liquidate: killed ${killed} instance(s) of ${script} on ${host}.`);
  }

  if (flags["kill-all"]) {
    ns.tprint("liquidate: --kill-all true; running ns.killall('home').");
    ns.killall(host);
  }

  if (flags["kill-self"]) {
    // Just return; the script ends and stops running.
    ns.tprint("liquidate: done. Exiting (self-terminates).");
  }
}

// ---------------------------------------------------------------------------
// Helpers + help
// ---------------------------------------------------------------------------

function canShortStocks(ns) {
  // If shorting is locked, buyShort will throw. We catch it and treat as false.
  try {
    ns.stock.buyShort("ECP", 0);
    return true;
  } catch {
    return false;
  }
}

function killByScript(ns, host, script) {
  let killed = 0;
  const procs = ns.ps(host);
  for (const p of procs) {
    if (p.filename === script) {
      if (ns.kill(p.pid)) killed++;
    }
  }
  return killed;
}

function printHelp(ns) {
  ns.tprint("wse/liquidate-and-kill.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Liquidate (close) all stock positions, then optionally kill scripts.");
  ns.tprint("  Sells all long positions. If shorting is unlocked, closes all shorts.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Requires stock API access; does not require 4S.");
  ns.tprint("  - Short close is attempted only if shorting is unlocked (BN8 / SF8.2).");
  ns.tprint("  - By default kills /bin/basic-trader.js on home after selling.");
  ns.tprint("  - Use --kill-all carefully; it will stop EVERYTHING on home.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run wse/liquidate-and-kill.js");
  ns.tprint("  run wse/liquidate-and-kill.js --kill false                 # liquidate only");
  ns.tprint("  run wse/liquidate-and-kill.js --kill-basic-trader true");
  ns.tprint("  run wse/liquidate-and-kill.js --basic-trader-path /bin/basic-trader.js");
  ns.tprint("  run wse/liquidate-and-kill.js --kill-scripts /bin/a.js,/bin/b.js");
  ns.tprint("  run wse/liquidate-and-kill.js --kill-all true               # DANGER");
  ns.tprint("  run wse/liquidate-and-kill.js --help");
}
