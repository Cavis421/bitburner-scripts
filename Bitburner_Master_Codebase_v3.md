# Bitburner Master Codebase v3

> Auto-generated on 2025-12-30 19:28:34.

> Root: C:\Users\campi\projects\bitburner-scripts2\bb

/* == INDEX == */

## Files

- apps/hacknet/hacknet-smart.js
- apps/wse/liquidate-and-kill.js
- apps/wse/stock-api-probe.js
- bin/backdoor-oneshot.js
- bin/basic-trader.js
- bin/bladeburner-manager.js
- bin/bootstrap.js
- bin/botnet-hgw-sync.js
- bin/contracts-find-and-solve.js
- bin/controller.js
- bin/darkweb-auto-buyer.js
- bin/early-money.js
- bin/gang-manager.js
- bin/intelligence-trainer.js
- bin/legacy-real/gang/gang-review.js
- bin/legacy-real/hacknet/hacknet-manager.js
- bin/legacy-real/hacknet/hacknet-status.js
- bin/legacy-real/pserv/clean-pservs.js
- bin/legacy-real/pserv/list-pservs.js
- bin/legacy-real/pserv/pserv-process-report.js
- bin/legacy-real/pserv/pserv-ram-upgrade.js
- bin/legacy-real/pserv/pserv-status.js
- bin/legacy-real/pserv/purchase_server_8gb.js
- bin/legacy-real/wse/asset-ui.js
- bin/legacy-real/wse/stock-snapshot.js
- bin/pserv-manager.js
- bin/startup-home-advanced.js
- bin/timed-net-batcher2.js
- bin/tools/augs.js
- bin/tools/cleanup-everything.js
- bin/tools/connect-path.js
- bin/tools/deploy-net.js
- bin/tools/find.js
- bin/tools/find-juicy-advanced.js
- bin/tools/find-juicy-target.js
- bin/tools/lib/network.js
- bin/tools/os-restart.js
- bin/tools/os-services.js
- bin/tools/os-status.js
- bin/tools/prep-target.js
- bin/tools/root-all.js
- bin/tools/root-and-deploy.js
- bin/tools/target-status.js
- bin/tools/xp-target-compare.js
- bin/tools/xp-to-next-level.js
- bin/ui/asset-ui.js
- bin/ui/controller-hud.js
- bin/ui/gang-ui.js
- bin/ui/hacknet-ui.js
- bin/ui/karma-watch.js
- bin/ui/money-tracker.js
- bin/ui/network-visualizer.js
- bin/ui/ops-dashboard.js
- bin/ui/process-monitor.js
- bin/ui/pserv-status.js
- bin/ui/territory-ui.js
- bin/ui/timed-net-batcher-ui.js
- bin/ui/xp-throughput-monitor.js
- lib/augmentations.js
- lib/augs-controller.js
- lib/corp-lane.js
- lib/daemon-lane.js
- lib/format.js
- lib/gang.js
- lib/hacknet-lane.js
- lib/home-upgrades-lane.js
- lib/logging.js
- lib/orchestrator.js
- lib/os/service-config.js
- lib/os/service-registry.js
- lib/player.js
- lib/player-policy.js
- lib/rooting.js
- lib/singularity.js
- lib/singularity-lane.js
- lib/solvers.js
- lib/target-lane.js
- lib/targets.js
- lib/work.js
- workers/hwgw/batch-grow.js
- workers/hwgw/batch-hack.js
- workers/hwgw/batch-weaken.js

/* == END INDEX == */


/* == FILE: apps/hacknet/hacknet-smart.js == */
```js
/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    // Positional args: [mode, spendFraction, stopFraction]
    const modeRaw = (flags._[0] ?? "hack").toString().toLowerCase();

    // Clamp + NaN-guard
    const spendFraction = clampNum(
        flags._[1] !== undefined ? Number(flags._[1]) : 0.10,
        0.01,
        0.50,
        0.10,
    );

    const stopFraction = clampNum(
        flags._[2] !== undefined ? Number(flags._[2]) : 0.70,
        0.10,
        0.99,
        0.70,
    );

    const mode = modeRaw === "hack" ? "hack" : "hack";
    if (modeRaw !== "hack") {
        ns.tprint("Only 'hack' mode is implemented for now. Using hacking-focused augmentation bundle.");
    }

    ns.tprint(
        `hacknet-smart started (mode=${mode}, spend=${(spendFraction * 100).toFixed(
            0,
        )}% money, pause at ${(stopFraction * 100).toFixed(0)}% of aug bundle).`,
    );

    while (true) {
        const money = ns.getServerMoneyAvailable("home");

        if (money < 1e5) {
            await ns.sleep(5000);
            continue;
        }

        // 1) Compute ideal hacking aug bundle cost (approx)
        const bundleCost = getIdealHackingBundleCost(ns);
        if (bundleCost > 0) {
            if (money >= bundleCost * stopFraction) {
                ns.print(
                    `Close to ideal aug bundle. Money=${ns.nFormat(
                        money,
                        "0.00a",
                    )} | Bundle~${ns.nFormat(bundleCost, "0.00a")}.`,
                );
                ns.print("Pausing Hacknet upgrades to save for augmentations and reset.");
                await ns.sleep(10000);
                continue;
            }
        } else {
            ns.print("No suitable aug bundle found (maybe no factions or no reputation). Proceeding with normal Hacknet upgrades.");
        }

        // 2) Decide Hacknet upgrade under budget
        const budget = money * spendFraction;
        const numNodes = ns.hacknet.numNodes();

        let best = {
            type: null, // "node" | "level" | "ram" | "core"
            index: -1,
            cost: Infinity,
        };

        // Option 1: buy a new node
        const newNodeCost = ns.hacknet.getPurchaseNodeCost();
        if (Number.isFinite(newNodeCost) && newNodeCost < best.cost) {
            best = { type: "node", index: -1, cost: newNodeCost };
        }

        // Option 2-4: upgrade existing nodes
        for (let i = 0; i < numNodes; i++) {
            const costLevel = ns.hacknet.getLevelUpgradeCost(i, 1);
            const costRam   = ns.hacknet.getRamUpgradeCost(i, 1);
            const costCore  = ns.hacknet.getCoreUpgradeCost(i, 1);

            if (Number.isFinite(costLevel) && costLevel < best.cost) best = { type: "level", index: i, cost: costLevel };
            if (Number.isFinite(costRam)   && costRam   < best.cost) best = { type: "ram",   index: i, cost: costRam   };
            if (Number.isFinite(costCore)  && costCore  < best.cost) best = { type: "core",  index: i, cost: costCore  };
        }

        if (!Number.isFinite(best.cost) || best.cost > budget) {
            await ns.sleep(5000);
            continue;
        }

        // Perform the chosen upgrade
        switch (best.type) {
            case "node": {
                const nodeIdx = ns.hacknet.purchaseNode();
                if (nodeIdx !== -1) {
                    ns.print(`Bought Hacknet node #${nodeIdx} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;
            }
            case "level":
                if (ns.hacknet.upgradeLevel(best.index, 1)) {
                    ns.print(`Level +1 on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;
            case "ram":
                if (ns.hacknet.upgradeRam(best.index, 1)) {
                    ns.print(`RAM +1 step on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;
            case "core":
                if (ns.hacknet.upgradeCore(best.index, 1)) {
                    ns.print(`Core +1 on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;
        }

        await ns.sleep(1000);
    }
}

function clampNum(x, lo, hi, fallback) {
    if (!Number.isFinite(x)) return fallback;
    return Math.min(hi, Math.max(lo, x));
}

function printHelp(ns) {
    ns.tprint("hacknet/hacknet-smart.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Smart Hacknet manager that considers hacking-focused augmentation costs.");
    ns.tprint("  Upgrades Hacknet while keeping money available to buy a strong aug bundle.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Positional arguments are: mode, spendFraction, stopFraction.");
    ns.tprint("  mode: currently only 'hack' is implemented.");
    ns.tprint("  spendFraction: fraction of current money used per upgrade (default 0.10).");
    ns.tprint("  stopFraction: pause Hacknet when money reaches this fraction of bundle cost (default 0.70).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run hacknet/hacknet-smart.js [mode] [spendFraction] [stopFraction] [--help]");
}
```
/* == END FILE == */

/* == FILE: apps/wse/liquidate-and-kill.js == */
```js
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
```
/* == END FILE == */

/* == FILE: apps/wse/stock-api-probe.js == */
```js
/**
 * wse/stock-api-probe.js
 *
 * Print which stock trading functions exist in this install.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const s = ns.stock;
  const fns = [
    "buy", "sell", "short", "buyShort", "sellShort",
    "buyStock", "sellStock", "shortStock",
    "getForecast", "getPrice", "getPosition",
    "hasTIXAPIAccess", "has4SDataTIXAPI",
  ];

  ns.tprint("stock api probe:");
  for (const name of fns) {
    ns.tprint(`  ${name}: ${typeof s[name]}`);
  }
}
```
/* == END FILE == */

/* == FILE: bin/backdoor-oneshot.js == */
```js
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["tail", false],

    // One-shot behavior
    ["dryRun", false],     // print paths, don't connect/install
    ["skipAlready", true], // skip servers with backdoorInstalled
    ["delay", 25],         // ms between connect hops
    ["verbose", true],     // print per-server actions
  ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  if (flags.help) return printHelp(ns);
  if (flags.tail) ns.tail();

  ns.disableLog("sleep");
  ns.disableLog("scan");
  ns.disableLog("getHackingLevel");

  // Needs Singularity (SF4)
  if (!ns.singularity || typeof ns.singularity.connect !== "function" || typeof ns.singularity.installBackdoor !== "function") {
    ns.tprint("ERROR: Requires Singularity (Source-File 4): ns.singularity.connect/installBackdoor.");
    return;
  }

  const all = discoverAll(ns)
    .filter(s => s !== "home" && s !== "darkweb" && !ns.getPurchasedServers().includes(s))
    .sort((a, b) => a.localeCompare(b));

  let installed = 0, skipped = 0, failed = 0;

  for (const target of all) {
    const info = ns.getServer(target);

    // You said rooting is handled elsewhere; assume rooted-only.
    if (!info.hasAdminRights) {
      if (flags.verbose) ns.print(`[skip] ${target}: no root`);
      skipped++;
      continue;
    }

    if (flags.skipAlready && info.backdoorInstalled) {
      if (flags.verbose) ns.print(`[skip] ${target}: already backdoored`);
      skipped++;
      continue;
    }

    const myHack = ns.getHackingLevel();
    if (myHack < info.requiredHackingSkill) {
      if (flags.verbose) ns.print(`[skip] ${target}: hack too low (${myHack} < ${info.requiredHackingSkill})`);
      skipped++;
      continue;
    }

    const path = findPath(ns, target);
    if (!path) {
      ns.print(`[fail] ${target}: no route from home`);
      failed++;
      continue;
    }

    if (flags.dryRun) {
      ns.print(`[dry] ${target}: home -> ${path.join(" -> ")}`);
      installed++;
      continue;
    }

    try {
      // Always start from home for a deterministic route
      ns.singularity.connect("home");
      await ns.sleep(flags.delay);

      for (const hop of path) {
        const ok = ns.singularity.connect(hop);
        if (!ok) throw new Error(`connect failed at ${hop}`);
        await ns.sleep(flags.delay);
      }

      if (flags.verbose) ns.print(`[bd] ${target}: installing backdoor...`);
      await ns.singularity.installBackdoor();
      installed++;
      if (flags.verbose) ns.print(`[ok] ${target}: backdoor installed`);
    } catch (e) {
      failed++;
      ns.print(`[fail] ${target}: ${String(e)}`);
    } finally {
      try { ns.singularity.connect("home"); } catch {}
    }
  }

  ns.tprint(`One-shot backdoor complete: installed=${installed}, skipped=${skipped}, failed=${failed}`);
}

/** @returns {string[]} */
function discoverAll(ns) {
  const seen = new Set(["home"]);
  const stack = ["home"];
  while (stack.length) {
    const cur = stack.pop();
    for (const next of ns.scan(cur)) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return [...seen];
}

/** BFS parent map from home; returns hops excluding home. @returns {string[] | null} */
function findPath(ns, target) {
  const q = ["home"];
  const parent = new Map([["home", null]]);
  while (q.length) {
    const cur = q.shift();
    for (const next of ns.scan(cur)) {
      if (parent.has(next)) continue;
      parent.set(next, cur);
      if (next === target) q.length = 0;
      else q.push(next);
    }
  }
  if (!parent.has(target)) return null;

  const path = [];
  let cur = target;
  while (cur && cur !== "home") {
    path.push(cur);
    cur = parent.get(cur);
  }
  path.reverse();
  return path;
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
backdoor-oneshot.js
Description:
  One-shot backdoor installer. Discovers all servers reachable from home, then:
    - skips home/darkweb/purchased servers
    - requires ROOT access (assumes your controller already rooted everything)
    - requires hacking level >= required
    - connects hop-by-hop and runs ns.singularity.installBackdoor()

Usage:
  run backdoor-oneshot.js [--help] [--tail]
    [--dryRun false]
    [--skipAlready true]
    [--delay 25]
    [--verbose true]

Notes:
  - Requires Singularity (Source-File 4).
  - If you want it to attempt backdooring even without root, set up rooting first (in your controller).
  - Use --dryRun to print the route it would take for each server.
`);
}
```
/* == END FILE == */

/* == FILE: bin/basic-trader.js == */
```js
/**
 * /bin/basic-trader.js
 *
 * Automated WSE trader using TIX + 4S Market Data TIX API:
 *  - Long on strong upward forecasts
 *  - Short on strong downward forecasts (if unlocked)
 *  - Portfolio exposure caps
 *  - Full per-trade P/L tracking + session summary
 *  - Heartbeat + candidate stats (so "idle" doesn't look like "dead")
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["loop", true],
    ["symbols", ""],
    // Capital controls
    ["reserve", 0.10],
    ["max-total-frac", 0.80],
    ["max-symbol-frac", 0.20],
    // Forecast thresholds
    ["long-enter", 0.60],
    ["long-exit", 0.52],
    ["short-enter", 0.40],
    ["short-exit", 0.48],
    // Diagnostics
    ["heartbeat", 60], // seconds between heartbeat lines (set 0 to disable)
  ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }
  ns.disableLog("ALL");
  if (!ns.stock.hasTIXAPIAccess() || !ns.stock.has4SDataTIXAPI()) {
    ns.tprint("ERROR: Requires WSE TIX API + 4S Market Data TIX API.");
    return;
  }
  const allowShorts = canShortStocks(ns);
  if (!allowShorts) {
    ns.tprint("basic-trader: shorting locked; running LONG-ONLY.");
  }
  const symbols = resolveSymbols(ns, flags.symbols);
  const reserveFrac   = clamp01(flags.reserve);
  const maxTotalFrac  = clamp01(flags["max-total-frac"]);
  const maxSymbolFrac = clamp01(flags["max-symbol-frac"]);
  const heartbeatSec = Math.max(0, Number(flags.heartbeat) || 0);
  let nextHeartbeatAt = Date.now() + heartbeatSec * 1000;
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const positions = new Map(); // sym -> { dir, shares, entryPrice }
  const stats = {
    trades: 0,
    wins: 0,
    losses: 0,
    netPnl: 0,
  };
  ns.tprint(
    `basic-trader: ${symbols.length} symbols | ` +
      `Reserve ${(reserveFrac * 100).toFixed(0)}% | ` +
      `MaxTotal ${(maxTotalFrac * 100).toFixed(0)}% | ` +
      `MaxSymbol ${(maxSymbolFrac * 100).toFixed(0)}% | ` +
      `LongEnter=${Number(flags["long-enter"]).toFixed(2)} LongExit=${Number(flags["long-exit"]).toFixed(2)}`,
  );
  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------
  while (true) {
    const state = getPortfolioState(ns, symbols, allowShorts);
    // Heartbeat: prove liveness + explain why we might be idle.
    if (heartbeatSec > 0 && Date.now() >= nextHeartbeatAt) {
      const diag = getSignalDiagnostics(ns, symbols, flags, allowShorts);
      const openCount = countOpenPositions(ns, symbols, allowShorts);
      ns.print(
        `[HEARTBEAT] cash=${fmtMoney(ns, state.cash)} ` +
          `longExp=${fmtMoney(ns, state.longExposure)} ` +
          `shortExp=${fmtMoney(ns, state.shortExposure)} ` +
          `open=${openCount} ` +
          `candidates(long>=${Number(flags["long-enter"]).toFixed(2)})=${diag.longCandidates}/${symbols.length} ` +
          `bestFc=${diag.bestForecast.toFixed(3)}(${diag.bestSym})`,
      );
      nextHeartbeatAt = Date.now() + heartbeatSec * 1000;
    }
    for (const sym of symbols) {
      tradeSymbol(ns, sym, flags, {
        allowShorts,
        reserveFrac,
        maxTotalFrac,
        maxSymbolFrac,
        state,
        positions,
        stats,
      });
    }
    if (!flags.loop) break;
    await ns.sleep(6_000);
  }
}

// ---------------------------------------------------------------------------
// Trading logic
// ---------------------------------------------------------------------------
function tradeSymbol(ns, sym, flags, ctx) {
  const {
    allowShorts,
    reserveFrac,
    maxTotalFrac,
    maxSymbolFrac,
    state,
    positions,
    stats,
  } = ctx;
  const forecast = ns.stock.getForecast(sym);
  // Use bid/ask for more realistic sizing + liquidation math
  const bid = ns.stock.getBidPrice(sym);
  const ask = ns.stock.getAskPrice(sym);
  // Read REAL position from the API (source of truth)
  const [longShares, longAvg, shortShares, shortAvg] = ns.stock.getPosition(sym);
  // ----- EXIT (real position based) -----
  if (longShares > 0) {
    if (forecast <= flags["long-exit"]) {
      exitPosition(ns, sym, bid, { dir: "LONG", shares: longShares, entryPrice: longAvg }, stats);
      positions.delete(sym); // keep your map tidy
    }
    return;
  }
  if (allowShorts && shortShares > 0) {
    if (forecast >= flags["short-exit"]) {
      exitPosition(ns, sym, ask, { dir: "SHORT", shares: shortShares, entryPrice: shortAvg }, stats);
      positions.delete(sym);
    }
    return;
  }
  // ----- ENTRY -----
  const cash = ns.getServerMoneyAvailable("home");
  const usableCash = cash * (1 - reserveFrac);
  // Keep your portfolio-caps concept, but use the current state
  const equity = state.cash + state.longExposure; // (your existing definition)
  const totalRoom = equity * maxTotalFrac - (state.longExposure + state.shortExposure);
  const symbolRoom = equity * maxSymbolFrac;
  let alloc = Math.min(usableCash, totalRoom, symbolRoom);
  if (alloc <= 0) return;
  // Cap by max shares remaining
  const maxShares = ns.stock.getMaxShares(sym);
  const remainingLongRoom = Math.max(0, maxShares - longShares);
  // Be conservative: size off ASK (what you pay)
  let desiredShares = Math.floor(alloc / ask);
  desiredShares = Math.min(desiredShares, remainingLongRoom);
  if (desiredShares <= 0) return;
  if (forecast >= flags["long-enter"]) {
    const bought = ns.stock.buyStock(sym, desiredShares);
    // IMPORTANT: only claim a buy if it actually happened
    if (bought > 0) {
      const newPos = ns.stock.getPosition(sym);
      positions.set(sym, { dir: "LONG", shares: newPos[0], entryPrice: newPos[1] });
      ns.print(`[${sym}] Enter LONG ${bought}/${desiredShares} @ ${fmtMoney(ns, ask)}`);
    } else {
      ns.print(`[${sym}] BUY FAILED (requested ${desiredShares}) fc=${forecast.toFixed(3)} cash=${fmtMoney(ns, cash)}`);
    }
    return;
  }
  if (allowShorts && forecast <= flags["short-enter"]) {
    const remainingShortRoom = Math.max(0, maxShares - shortShares);
    let desiredShort = Math.floor(alloc / bid); // proceeds roughly based on bid
    desiredShort = Math.min(desiredShort, remainingShortRoom);
    if (desiredShort <= 0) return;
    const shorted = ns.stock.buyShort(sym, desiredShort);
    if (shorted > 0) {
      const newPos = ns.stock.getPosition(sym);
      positions.set(sym, { dir: "SHORT", shares: newPos[2], entryPrice: newPos[3] });
      ns.print(`[${sym}] Enter SHORT ${shorted}/${desiredShort} @ ${fmtMoney(ns, bid)}`);
    } else {
      ns.print(`[${sym}] SHORT FAILED (requested ${desiredShort}) fc=${forecast.toFixed(3)} cash=${fmtMoney(ns, cash)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Exit + P/L accounting
// ---------------------------------------------------------------------------
function exitPosition(ns, sym, exitPrice, pos, stats) {
  const { dir, shares, entryPrice } = pos;
  if (dir === "LONG") {
    ns.stock.sellStock(sym, shares);
  } else {
    ns.stock.sellShort(sym, shares);
  }
  const pnl =
    dir === "LONG"
      ? (exitPrice - entryPrice) * shares
      : (entryPrice - exitPrice) * shares;
  const pct = (pnl / (entryPrice * shares)) * 100;
  stats.trades++;
  stats.netPnl += pnl;
  pnl >= 0 ? stats.wins++ : stats.losses++;
  ns.print(
    `[${sym}] Exit ${dir} ${shares} @ ${fmtMoney(ns, exitPrice)} | ` +
      `P/L=${fmtSignedMoney(ns, pnl)} (${pct.toFixed(2)}%)`,
  );
  printSummary(ns, stats);
}

// ---------------------------------------------------------------------------
// Portfolio helpers
// ---------------------------------------------------------------------------
function getPortfolioState(ns, symbols, allowShorts) {
  let longExposure = 0;
  let shortExposure = 0;
  for (const sym of symbols) {
    const price = ns.stock.getPrice(sym);
    const [l, , s] = ns.stock.getPosition(sym);
    longExposure += l * price;
    if (allowShorts) shortExposure += s * price;
  }
  const cash = ns.getServerMoneyAvailable("home");
  return { cash, longExposure, shortExposure };
}
function countOpenPositions(ns, symbols, allowShorts) {
  let count = 0;
  for (const sym of symbols) {
    const [l, , s] = ns.stock.getPosition(sym);
    if (l > 0) count++;
    if (allowShorts && s > 0) count++;
  }
  return count;
}

function getSignalDiagnostics(ns, symbols, flags, allowShorts) {
  let longCandidates = 0;
  let bestForecast = -1;
  let bestSym = "?";
  for (const sym of symbols) {
    const fc = ns.stock.getForecast(sym);
    if (fc >= flags["long-enter"]) longCandidates++;
    if (fc > bestForecast) {
      bestForecast = fc;
      bestSym = sym;
    }
  }
  return { longCandidates, bestForecast, bestSym };
}

// ---------------------------------------------------------------------------
// Stats output
// ---------------------------------------------------------------------------
function printSummary(ns, stats) {
  const winRate =
    stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;
  ns.print(
    `[SUMMARY] Trades=${stats.trades} | ` +
      `Wins=${stats.wins} | Losses=${stats.losses} | ` +
      `WinRate=${winRate.toFixed(1)}% | ` +
      `Net P/L=${fmtSignedMoney(ns, stats.netPnl)}`,
  );
}

// ---------------------------------------------------------------------------
// Helpers + help
// ---------------------------------------------------------------------------

function canShortStocks(ns) {
  try {
    ns.stock.buyShort("ECP", 0);
    return true;
  } catch {
    return false;
  }
}

function resolveSymbols(ns, csv) {
  if (!csv) return ns.stock.getSymbols();
  return csv.split(",").map(s => s.trim()).filter(Boolean);
}

function clamp01(x) {
  return Math.min(1, Math.max(0, Number(x) || 0));
}

function fmtMoney(ns, v) {
  if (typeof ns.formatMoney === "function") return ns.formatMoney(v);
  return `$${ns.formatNumber(v)}`;
}

function fmtSignedMoney(ns, v) {
  const sign = v >= 0 ? "+" : "-";
  return `${sign}${fmtMoney(ns, Math.abs(v))}`;
}

function printHelp(ns) {
  ns.tprint("/bin/basic-trader.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Forecast-based stock trader with portfolio caps and full P/L tracking.");
  ns.tprint("  Includes heartbeat diagnostics so idle periods are visible.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Requires WSE TIX API + 4S Market Data TIX API.");
  ns.tprint("  - Shorting auto-detected (BN8 / SF8.2).");
  ns.tprint("  - Heartbeat prints cash/exposure + candidate counts.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/basic-trader.js");
  ns.tprint("  run /bin/basic-trader.js --heartbeat 30");
  ns.tprint("  run /bin/basic-trader.js --heartbeat 0      # disable heartbeat");
  ns.tprint("  run /bin/basic-trader.js --long-enter 0.58  # more active");
  ns.tprint("  run /bin/basic-trader.js --help");
}
```
/* == END FILE == */

/* == FILE: bin/bladeburner-manager.js == */
```js
/**
 * /bin/bladeburner-manager.js
 *
 * Description
 *  BN6 Bladeburner automation daemon:
 *   - (Optional) auto-join Bladeburner division when eligible
 *   - spends skill points by priority
 *   - manages stamina (train/field analysis when low)
 *   - manages chaos (diplomacy when high)
 *   - selects best contract/operation by success chance + expected value
 *   - attempts BlackOps when rank/chance thresholds are met
 *
 * Notes
 *  - Requires Bladeburner API (BN6 or SF7+).
 *  - Safe to run even before joining: it can idle/exit cleanly.
 *  - Uses conservative success thresholds by default to avoid fail spirals.
 *
 * Syntax
 *  run /bin/bladeburner-manager.js
 *  run /bin/bladeburner-manager.js --minChance 0.7 --blackopMinChance 0.8
 *  run /bin/bladeburner-manager.js --city "Sector-12"
 *  run /bin/bladeburner-manager.js --help
 */

/** @param {NS} ns */
const FLAGS = [
    ["help", false],

    // Looping
    ["loop", true],
    ["pollMs", 2500],

    // Join behavior
    ["autoJoin", true],

    // Action safety
    ["minChance", 0.70],           // min success chance for contracts/ops
    ["blackopMinChance", 0.80],    // min chance for blackops
    ["staminaMinFrac", 0.55],      // if stamina/max below this, recover
    ["chaosThresh", 50],           // if city chaos above this, run diplomacy
    ["preferOps", true],           // prefer operations over contracts when both are good

    // City control (optional)
    ["city", ""],                  // if set, will try to stay here

    // Skill upgrades
    ["spendSkills", true],
];

export async function main(ns) {
    const flags = ns.flags(FLAGS);
    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    if (!hasBladeburner(ns)) {
        ns.tprint("ERROR: Bladeburner API not available (need BN6 or SF7+).");
        return;
    }

    // Main daemon loop
    while (true) {
        const did = tick(ns, flags);

        if (!flags.loop) break;
        await ns.sleep(Math.max(200, Number(flags.pollMs) || 2500));

        // If we *can't* do anything (not joined + can't join), don't spam.
        // (tick() already prints minimal info; keep this silent.)
        void did;
    }
}

function tick(ns, flags) {
    // 1) Ensure we're in Bladeburners (optional)
    const inBB = safeBool(() => ns.bladeburner.inBladeburner(), false);

    if (!inBB) {
        if (flags.autoJoin) {
            const joined = safeBool(() => ns.bladeburner.joinBladeburnerDivision(), false);
            if (joined) ns.print("[bb] Joined Bladeburner division.");
        }

        const nowIn = safeBool(() => ns.bladeburner.inBladeburner(), false);
        if (!nowIn) {
            ns.print("[bb] Not in Bladeburners yet (idle).");
            return false;
        }
    }

    // 2) City preference
    const desiredCity = String(flags.city || "").trim();
    if (desiredCity) {
        const cur = safeStr(() => ns.bladeburner.getCity(), "");
        if (cur && cur !== desiredCity) {
            safeBool(() => ns.bladeburner.switchCity(desiredCity), false);
        }
    }

    // 3) Spend skill points
    if (flags.spendSkills) spendSkillPoints(ns);

    // 4) Stamina management
    const stamina = safeObj(() => ns.bladeburner.getStamina(), [0, 0]);
    const curSta = Number(stamina?.[0] ?? 0);
    const maxSta = Math.max(1, Number(stamina?.[1] ?? 1));
    const staFrac = curSta / maxSta;

    if (staFrac < Number(flags.staminaMinFrac)) {
        return ensureAction(ns, "General", pickRecoveryGeneral(ns), "[bb] recovering stamina");
    }

    // 5) Chaos management (in current city)
    const city = safeStr(() => ns.bladeburner.getCity(), "Sector-12");
    const chaos = safeNum(() => ns.bladeburner.getCityChaos(city), 0);
    if (chaos > Number(flags.chaosThresh)) {
        // Diplomacy is the standard â€œreduce chaosâ€ lever.
        return ensureAction(ns, "General", "Diplomacy", `[bb] chaos ${chaos.toFixed(1)} in ${city} -> Diplomacy`);
    }

    // 6) BlackOps (when available and safe)
    const blackopPick = pickBestBlackOp(ns, Number(flags.blackopMinChance));
    if (blackopPick) {
        return ensureAction(ns, "BlackOp", blackopPick.name, `[bb] BLACKOP ${blackopPick.name} (chance ${(blackopPick.chance * 100).toFixed(1)}%)`);
    }

    // 7) Normal money/rank actions: operations/contracts
    const bestOp = pickBestAction(ns, "Operation", Number(flags.minChance));
    const bestContract = pickBestAction(ns, "Contract", Number(flags.minChance));

    const preferOps = !!flags.preferOps;

    const chosen =
        pickByValue(bestOp, bestContract, { preferOps });

    if (chosen) {
        return ensureAction(ns, chosen.type, chosen.name, `[bb] ${chosen.type} ${chosen.name} (chance ${(chosen.chance * 100).toFixed(1)}%)`);
    }

    // 8) Fallback: Field Analysis (improves estimates and is always safe)
    return ensureAction(ns, "General", "Field Analysis", "[bb] fallback -> Field Analysis");
}

// -----------------------------------------------------------------------------
// Action picking
// -----------------------------------------------------------------------------

function pickRecoveryGeneral(ns) {
    // Training improves stats; Field Analysis improves chance estimates.
    // When stamina is low, both are fine â€” training is a better â€œBN6 rampâ€.
    const hasTraining = includesSafe(() => ns.bladeburner.getGeneralActionNames(), "Training");
    if (hasTraining) return "Training";
    return "Field Analysis";
}

function pickBestBlackOp(ns, minChance) {
    const names = safeArr(() => ns.bladeburner.getBlackOpNames(), []);
    if (!names.length) return null;

    // Only attempt blackops that are â€œavailableâ€ (remaining count > 0).
    const candidates = [];
    for (const name of names) {
        const remaining = safeNum(() => ns.bladeburner.getActionCountRemaining("BlackOp", name), 0);
        if (remaining <= 0) continue;

        const chance = estimateChance(ns, "BlackOp", name);
        if (chance < minChance) continue;

        // Some versions expose rank requirement; if not, just rely on chance + remaining.
        const rank = safeNum(() => ns.bladeburner.getRank(), 0);
        const req = safeNum(() => ns.bladeburner.getBlackOpRank(name), 0);
        if (req > 0 && rank < req) continue;

        candidates.push({ name, chance, remaining, req });
    }

    // Prefer the *highest* rank requirement you can do (progression).
    candidates.sort((a, b) => (b.req - a.req) || (b.chance - a.chance) || a.name.localeCompare(b.name));
    return candidates[0] || null;
}

function pickBestAction(ns, type, minChance) {
    const names =
        type === "Operation"
            ? safeArr(() => ns.bladeburner.getOperationNames(), [])
            : safeArr(() => ns.bladeburner.getContractNames(), []);

    const out = [];
    for (const name of names) {
        const remaining = safeNum(() => ns.bladeburner.getActionCountRemaining(type, name), 0);
        if (remaining <= 0) continue;

        const chance = estimateChance(ns, type, name);
        if (chance < minChance) continue;

        // Use a simple â€œexpected successâ€ score. Without deep formulas,
        // (chance * remaining) is a decent proxy to avoid running out of tasks.
        const score = chance * Math.min(1000, remaining);

        out.push({ type, name, chance, remaining, score });
    }

    out.sort((a, b) => (b.score - a.score) || (b.chance - a.chance) || a.name.localeCompare(b.name));
    return out[0] || null;
}

function pickByValue(bestOp, bestContract, opts) {
    if (!bestOp && !bestContract) return null;
    if (bestOp && !bestContract) return bestOp;
    if (!bestOp && bestContract) return bestContract;

    // Both exist. Respect preference unless the other is *meaningfully* better.
    const preferOps = !!opts.preferOps;
    const a = preferOps ? bestOp : bestContract;
    const b = preferOps ? bestContract : bestOp;

    // If bâ€™s score is at least 15% better, take b.
    if ((b.score || 0) > (a.score || 0) * 1.15) return b;
    return a;
}

function ensureAction(ns, type, name, reason) {
    const cur = safeObj(() => ns.bladeburner.getCurrentAction(), null);
    const curType = String(cur?.type ?? "");
    const curName = String(cur?.name ?? "");

    if (curType === type && curName === name) return true;

    const ok = safeBool(() => ns.bladeburner.startAction(type, name), false);
    if (ok) ns.print(reason);
    else ns.print(`[bb] failed to start ${type}:${name}`);
    return ok;
}

function estimateChance(ns, type, name) {
    const pair = safeArr(() => ns.bladeburner.getActionEstimatedSuccessChance(type, name), [0, 0]);
    const lo = Number(pair?.[0] ?? 0);
    const hi = Number(pair?.[1] ?? 0);
    // Conservative: use low bound (avoids surprise fails early in BN6)
    return clamp01(lo || 0);
}

// -----------------------------------------------------------------------------
// Skill spending
// -----------------------------------------------------------------------------

function spendSkillPoints(ns) {
    const points = safeNum(() => ns.bladeburner.getSkillPoints(), 0);
    if (points <= 0) return;

    const skills = safeArr(() => ns.bladeburner.getSkillNames(), []);

    // Priority: survivability + success + stamina economy.
    // We only upgrade skills that exist in this version/save.
    const priority = [
        "Overclock",
        "Reaper",
        "Evasive System",
        "Evasive Systems",
        "Cloak",
        "Digital Observer",
        "Blade's Intuition",
        "Hyperdrive",
        "Hands of Midas",
    ].filter((s) => skills.includes(s));

    for (let i = 0; i < 50; i++) {
        const p = safeNum(() => ns.bladeburner.getSkillPoints(), 0);
        if (p <= 0) return;

        let upgraded = false;

        for (const sk of priority) {
            const cost = safeNum(() => ns.bladeburner.getSkillUpgradeCost(sk), Infinity);
            if (cost <= p) {
                const ok = safeBool(() => ns.bladeburner.upgradeSkill(sk, 1), false);
                if (ok) {
                    ns.print(`[bb] skill+ ${sk}`);
                    upgraded = true;
                    break;
                }
            }
        }

        if (!upgraded) return;
    }
}

// -----------------------------------------------------------------------------
// Small safe helpers
// -----------------------------------------------------------------------------

function hasBladeburner(ns) {
    return !!ns.bladeburner
        && typeof ns.bladeburner.inBladeburner === "function"
        && typeof ns.bladeburner.startAction === "function";
}

function clamp01(x) {
    x = Number(x) || 0;
    return Math.min(1, Math.max(0, x));
}

function safeNum(fn, fallback) {
    try {
        const v = Number(fn());
        return Number.isFinite(v) ? v : fallback;
    } catch {
        return fallback;
    }
}

function safeBool(fn, fallback) {
    try { return Boolean(fn()); } catch { return fallback; }
}

function safeStr(fn, fallback) {
    try { return String(fn()); } catch { return fallback; }
}

function safeArr(fn, fallback) {
    try {
        const v = fn();
        return Array.isArray(v) ? v : fallback;
    } catch {
        return fallback;
    }
}

function safeObj(fn, fallback) {
    try { return fn(); } catch { return fallback; }
}

function includesSafe(fn, item) {
    try {
        const a = fn();
        return Array.isArray(a) && a.includes(item);
    } catch {
        return false;
    }
}

/** @param {NS} ns */
function printHelp(ns) {
    ns.tprint("/bin/bladeburner-manager.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  BN6 Bladeburner automation daemon (join/skills/city/actions/blackops).");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - Requires Bladeburner API (BN6 or SF7+).");
    ns.tprint("  - Conservative defaults: uses LOW success chance estimate to avoid fail spirals.");
    ns.tprint("  - Chaos is controlled via Diplomacy; stamina via Training/Field Analysis.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run /bin/bladeburner-manager.js");
    ns.tprint("  run /bin/bladeburner-manager.js --minChance 0.75 --blackopMinChance 0.85");
    ns.tprint("  run /bin/bladeburner-manager.js --city \"Sector-12\" --chaosThresh 40");
    ns.tprint("  run /bin/bladeburner-manager.js --autoJoin false");
    ns.tprint("  run /bin/bladeburner-manager.js --help");
    ns.tprint("");
    ns.tprint("Flags");
    ns.tprint("  --loop true|false             Loop forever (default true)");
    ns.tprint("  --pollMs <ms>                 Poll interval (default 2500)");
    ns.tprint("  --autoJoin true|false         Attempt to join BB when eligible (default true)");
    ns.tprint("  --minChance <0..1>            Min chance for contracts/ops (default 0.70)");
    ns.tprint("  --blackopMinChance <0..1>     Min chance for blackops (default 0.80)");
    ns.tprint("  --staminaMinFrac <0..1>       Recover below this stamina fraction (default 0.55)");
    ns.tprint("  --chaosThresh <n>             Diplomacy above this chaos (default 50)");
    ns.tprint("  --preferOps true|false        Prefer operations over contracts (default true)");
    ns.tprint("  --city <name>                 Optional city lock (default none)");
    ns.tprint("  --spendSkills true|false      Auto-upgrade skills (default true)");
}
```
/* == END FILE == */

/* == FILE: bin/bootstrap.js == */
```js
/**
 * /bin/bootstrap.js
 *
 * Description
 *  Staged bootstrap workflow (HOME MAX RAM milestones):
 *    1) Stage A: run early-money while home MAX RAM < 64GB
 *    2) Stage B: run startup-home-advanced ONCE while 64GB <= home MAX RAM < 1024GB
 *    3) Stage C: start controller when home MAX RAM >= 1024GB (and it fits in FREE RAM)
 *
 *  On ANY stage switch, bootstrap kills "all workers" by killing all scripts on home
 *  except an allowlist (bootstrap itself only).
 *
 *  NEW (Player bootstrap safety):
 *   - Periodically enforces a free Rothman CS class while hacking < threshold
 *   - Once hacking >= threshold, kicks you out of class by starting a crime (crime-first)
 *
 * Notes
 *  - Avoids imports to keep RAM cost tiny.
 *  - Stage1 is treated like a daemon (kept running).
 *  - Stage2 is a one-shot launcher (run once per entry into Stage2).
 *  - Controller launch requires the script RAM cost to fit in FREE RAM at the moment of launch.
 *
 * Syntax
 *  run /bin/bootstrap.js
 *  run /bin/bootstrap.js --poll 2000
 *  run /bin/bootstrap.js --help
 */

/** @param {NS} ns */
const FLAGS = [
  ["help", false],

  // Stage thresholds (HOME MAX RAM, in GB)
  ["stage1Ram", 64],
  ["stage2Ram", 1024],

  // Stage scripts
  ["stage1", "bin/early-money.js"],
  ["stage2", "bin/startup-home-advanced.js"],

  // Controller
  ["controller", "bin/controller.js"],
  ["controllerThreads", 1],

  // Behavior
  ["killWorkersOnSwitch", true],
  // IMPORTANT: keep bootstrap alive so it can enforce player bootstrap policy.
  // You can flip this back to true if you don’t want this behavior.
  ["exitAfterControllerStart", false],
  ["poll", 5000],

  // ------------------------------------------------------------
  // Player bootstrap enforcement (Singularity)
  // ------------------------------------------------------------
  ["playerBootstrap", true],
  ["bootstrapHackThreshold", 30],
  ["bootstrapCity", "Sector-12"],
  ["bootstrapUniversity", "Rothman University"],
  ["bootstrapCourse", "Computer Science"],
  ["bootstrapCrime", "homicide"],

  // Only interfere with CLASS when we are specifically in the bootstrap course/location.
  ["strictBootstrapClassMatch", true],
];

export async function main(ns) {
  const flags = ns.flags(FLAGS);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  const poll = Math.max(1000, Number(flags.poll) || 5000);

  const stage1Ram = Math.max(1, Number(flags.stage1Ram) || 64);
  const stage2Ram = Math.max(stage1Ram, Number(flags.stage2Ram) || 1024);

  const stage1Script = normPath(String(flags.stage1 || "").trim());
  const stage2Script = normPath(String(flags.stage2 || "").trim());

  const controllerScript = normPath(String(flags.controller || "bin/controller.js").trim());
  const controllerThreads = Math.max(1, Math.floor(Number(flags.controllerThreads) || 1));

  const killWorkersOnSwitch = !!flags.killWorkersOnSwitch;
  const exitAfterControllerStart = !!flags.exitAfterControllerStart;

  // Player bootstrap cfg
  const playerBootstrap = !!flags.playerBootstrap;
  const bootHack = Math.max(1, Math.floor(Number(flags.bootstrapHackThreshold) || 30));
  const bootCity = String(flags.bootstrapCity || "Sector-12");
  const bootUni = String(flags.bootstrapUniversity || "Rothman University");
  const bootCourse = String(flags.bootstrapCourse || "Computer Science");
  const bootCrime = String(flags.bootstrapCrime || "homicide");
  const strictClassMatch = !!flags.strictBootstrapClassMatch;

  // Args after `--` are forwarded to stage scripts (optional)
  const passthroughArgs = flags._.slice(0);

  /** @type {"stage1"|"stage2"|"controller"|null} */
  let lastMode = null;

  // Stage2 must only be started once per entry into stage2
  let stage2Started = false;

  while (true) {
    const homeMax = ns.getServerMaxRam("home");

    const mode =
      homeMax < stage1Ram ? "stage1"
        : homeMax < stage2Ram ? "stage2"
          : "controller";

    // ------------------------------------------------------------
    // Stage transition: cleanup + latches
    // ------------------------------------------------------------
    if (mode !== lastMode) {
      if (killWorkersOnSwitch) {
        const allow = buildAllowList();
        const killed = killAllExcept(ns, "home", allow);
        ns.tprint(lastMode
          ? `[bootstrap] switch ${lastMode} -> ${mode} | killed=${killed}`
          : `[bootstrap] start in ${mode} | killed=${killed}`
        );
      } else if (lastMode === null) {
        ns.tprint(`[bootstrap] start in ${mode}`);
      }

      // Reset stage2 latch when entering stage2
      if (mode === "stage2") stage2Started = false;

      // Give RAM accounting a moment to settle
      await ns.sleep(50);
      lastMode = mode;
    }

    // ------------------------------------------------------------
    // Stage 1: early-money (daemon style)
    // ------------------------------------------------------------
    if (mode === "stage1") {
      // Extra safety: don't allow stage2/controller overlap
      tryStop(ns, stage2Script, "home");
      tryStop(ns, controllerScript, "home");

      ensureDaemonBestEffort(ns, stage1Script, 1, passthroughArgs);
      await ns.sleep(poll);
      continue;
    }

    // ------------------------------------------------------------
    // Stage 2: startup-home-advanced (ONE-SHOT)
    // ------------------------------------------------------------
    if (mode === "stage2") {
      // Extra safety: don't allow stage1/controller overlap
      tryStop(ns, stage1Script, "home");
      tryStop(ns, controllerScript, "home");

      if (!stage2Started) {
        const started = ensureDaemonBestEffort(ns, stage2Script, 1, passthroughArgs);
        if (started) {
          ns.tprint(`[bootstrap] stage2 started one-shot: ${stage2Script}`);
          stage2Started = true;
        }
      }

      await ns.sleep(poll);
      continue;
    }

    // ------------------------------------------------------------
    // Stage 3: controller
    // ------------------------------------------------------------
    // Hard guarantee: no overlap with stage scripts
    tryStop(ns, stage1Script, "home");
    tryStop(ns, stage2Script, "home");
    await ns.sleep(50);

    if (!controllerScript || !ns.fileExists(controllerScript, "home")) {
      ns.tprint(`[bootstrap] ERROR: controller missing on home: ${controllerScript || "(empty)"}`);
      return;
    }

    // If controller isn't running, start it when affordable
    if (!isRunning(ns, controllerScript, "home")) {
      const cost = ns.getScriptRam(controllerScript, "home") * controllerThreads;
      if (!Number.isFinite(cost) || cost <= 0) {
        ns.tprint(`[bootstrap] ERROR: controller RAM cost invalid: ${controllerScript}`);
        return;
      }

      const free = getFreeRam(ns);
      if (free >= cost) {
        const pid = ns.run(controllerScript, controllerThreads);
        if (pid && pid > 0) {
          ns.tprint(
            `[bootstrap] started ${controllerScript} (pid=${pid}) ` +
            `homeMax=${homeMax}GB free=${getFreeRam(ns).toFixed(1)}GB cost=${cost.toFixed(1)}GB`
          );
        } else {
          ns.tprint(`[bootstrap] WARN: failed to start ${controllerScript} (ns.run returned ${pid})`);
        }
      }
    }

    // NEW: Periodic player bootstrap enforcement while we remain alive
    if (playerBootstrap) {
      enforcePlayerBootstrap(ns, {
        hackThreshold: bootHack,
        city: bootCity,
        university: bootUni,
        course: bootCourse,
        crime: bootCrime,
        strictClassMatch: strictClassMatch ?? true,
      });
    }

    if (exitAfterControllerStart && isRunning(ns, controllerScript, "home")) return;

    await ns.sleep(poll);
  }
}

// ------------------------------------------------------------
// Player bootstrap enforcement (no imports; tiny; defensive)
// ------------------------------------------------------------
function enforcePlayerBootstrap(ns, cfg) {
  try {
    if (!ns.singularity) return;
    if (typeof ns.singularity.getCurrentWork !== "function") return;

    // Default strict matching ON unless explicitly set to false
    const strict = cfg.strictClassMatch !== false;

    const p = ns.getPlayer();
    const hacking = ns.getHackingLevel(); // bulletproof vs any getPlayer weirdness

    const w = ns.singularity.getCurrentWork?.() || null;
    const wType = w?.type || "";

    // While hacking < threshold: ensure we are taking the free CS course (Rothman, Sector-12).
    if (hacking < cfg.hackThreshold) {
      // If already in CLASS, only treat it as "ok" if it's the exact bootstrap class (when strict).
      if (wType === "CLASS") {
        if (strict) {
          const loc = String(w?.location || "");
          const cls = String(w?.classType || "");
          if (loc === cfg.university && cls === cfg.course) return;
          // otherwise override to bootstrap course below
        } else {
          // legacy behavior: any class counts, avoid thrash
          return;
        }
      }

      // Travel to city (optional; safe)
      if (typeof ns.singularity.travelToCity === "function" && p.city !== cfg.city) {
        try { ns.singularity.travelToCity(cfg.city); } catch { /* ignore */ }
      }

      // Start the bootstrap course
      if (typeof ns.singularity.universityCourse === "function") {
        const ok = ns.singularity.universityCourse(cfg.university, cfg.course, false);
        if (ok) ns.print(
          `[bootstrap-player] study: ${cfg.course} @ ${cfg.university} (hacking=${hacking} < ${cfg.hackThreshold})`
        );
      }
      return;
    }

    // Once hacking >= threshold: bootstrap enforcement is DONE.
    // Controller/player-policy owns what happens next (prevents CLASS <-> CRIME ping-pong).
    return;
  } catch {
    // No terminal spam; bootstrap stays resilient.
  }
}


// ------------------------------------------------------------
// Helpers (keep tiny; no imports)
// ------------------------------------------------------------
function normPath(p) {
  // Your repo uses "bin/..." paths; strip leading "/" if present.
  return String(p || "").trim().replace(/^\/+/, "");
}

function getFreeRam(ns) {
  const max = ns.getServerMaxRam("home");
  const used = ns.getServerUsedRam("home");
  return Math.max(0, max - used);
}

function isRunning(ns, script, host) {
  try { return ns.isRunning(String(script || ""), host); } catch { return false; }
}

function tryStop(ns, script, host) {
  try {
    if (script && isRunning(ns, script, host)) ns.scriptKill(script, host);
  } catch { /* ignore */ }
}

function ensureDaemonBestEffort(ns, script, threads, args) {
  if (!script) return false;
  if (!ns.fileExists(script, "home")) return false;
  if (isRunning(ns, script, "home")) return false;

  const t = Math.max(1, Math.floor(Number(threads) || 1));
  const cost = ns.getScriptRam(script, "home") * t;
  const free = getFreeRam(ns);

  if (!Number.isFinite(cost) || cost <= 0) return false;
  if (cost > free) return false;

  try {
    const pid = ns.run(script, t, ...(args || []));
    return pid > 0;
  } catch {
    return false;
  }
}

/**
 * Allowlist for stage switching.
 * For your stated goal ("kill all workers"), we only preserve bootstrap itself.
 */
function buildAllowList() {
  return new Set(["bin/bootstrap.js"]);
}

/**
 * Kill everything on host except allowlisted script filenames.
 * Returns number of script filenames it attempted to kill.
 */
function killAllExcept(ns, host, allowSet) {
  let killed = 0;
  const procs = safeArr(() => ns.ps(host), []);
  for (const p of procs) {
    const file = String(p.filename || "");
    if (allowSet.has(file)) continue;

    try {
      // Kill by filename (kills all instances). Matches your "kill all workers" intent.
      ns.scriptKill(file, host);
      killed++;
    } catch { /* ignore */ }
  }
  return killed;
}

function safeArr(fn, fallback) {
  try {
    const v = fn();
    return Array.isArray(v) ? v : fallback;
  } catch { return fallback; }
}

// ------------------------------------------------------------
// Help
// ------------------------------------------------------------
function printHelp(ns) {
  ns.tprint("/bin/bootstrap.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Staged bootstrap workflow:");
  ns.tprint("    1) early-money while home MAX RAM < 64GB");
  ns.tprint("    2) startup-home-advanced ONE-SHOT while home MAX RAM < 1024GB");
  ns.tprint("    3) start controller when home MAX RAM >= 1024GB and controller fits in FREE RAM");
  ns.tprint("  On any stage switch, kills all non-allowlisted scripts on home (\"kill all workers\").");
  ns.tprint("");
  ns.tprint("NEW: Player bootstrap");
  ns.tprint("  While hacking < threshold, enforce FREE Computer Science at Rothman University (Sector-12).");
  ns.tprint("  Once hacking >= threshold, if still in that class, switch to crime.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/bootstrap.js");
  ns.tprint("  run /bin/bootstrap.js --poll 2000");
  ns.tprint("  run /bin/bootstrap.js --playerBootstrap false");
  ns.tprint("  run /bin/bootstrap.js --exitAfterControllerStart true");
  ns.tprint("  run /bin/bootstrap.js --help");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --stage1 <path>               Stage1 script (default bin/early-money.js)");
  ns.tprint("  --stage1Ram <gb>              Stage1 cutoff home MAX RAM (default 64)");
  ns.tprint("  --stage2 <path>               Stage2 script (default bin/startup-home-advanced.js)");
  ns.tprint("  --stage2Ram <gb>              Stage2 cutoff home MAX RAM (default 1024)");
  ns.tprint("  --controller <path>           Controller script (default bin/controller.js)");
  ns.tprint("  --controllerThreads <n>       Controller threads (default 1)");
  ns.tprint("  --killWorkersOnSwitch t|f      Kill all scripts on home except bootstrap (default true)");
  ns.tprint("  --exitAfterControllerStart t|f Exit after starting controller (default false)");
  ns.tprint("  --poll <ms>                    Poll interval (default 5000)");
  ns.tprint("");
  ns.tprint("Player bootstrap flags");
  ns.tprint("  --playerBootstrap t|f          Enable hack<30 study enforcement (default true)");
  ns.tprint("  --bootstrapHackThreshold <n>   Threshold (default 30)");
  ns.tprint("  --bootstrapCity <name>         City to study in (default Sector-12)");
  ns.tprint("  --bootstrapUniversity <name>   University (default Rothman University)");
  ns.tprint("  --bootstrapCourse <name>       Course (default Computer Science)");
  ns.tprint("  --bootstrapCrime <name>        Crime to switch to after threshold (default homicide)");
  ns.tprint("  --strictBootstrapClassMatch t|f Only switch away if class matches exactly (default true)");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  Args after `--` are forwarded to stage scripts.");
}
```
/* == END FILE == */

/* == FILE: bin/botnet-hgw-sync.js == */
```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags([
        ["help", false],
        ["tick", 10_000],          // resync interval
        ["minRam", 2],             // skip hosts below this max RAM
        ["reserveFrac", 0.05],     // leave this fraction of FREE ram unused on each host
        ["verbose", false],        // extra logging
        ["killAll", false],        // if true, killall(host) when redeploying (NPC-only, still skips pserv/home)
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Positional args
    const target = String(flags._[0] || "omega-net");
    const mode = String(flags._[1] || "xp").toLowerCase();
    const workerScript = "botnet/remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`[X] ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`[OK] Botnet HGW sync started. Target: ${target} | Mode: ${mode.toUpperCase()}`);

    const lastMaxRam = {};       // remember last seen MAX ram (for “RAM upgraded” redeploy)
    const failStreak = {};       // per-host exponential backoff when exec keeps failing
    const nextTryAt = {};        // per-host next allowed attempt time (ms)

    while (true) {
        const now = Date.now();

        // IMPORTANT: refresh purchased servers EVERY cycle (pserv-manager can add/upgrade them anytime)
        const pservs = new Set(ns.getPurchasedServers());
        const allServers = getAllServers(ns);

        for (const host of allServers) {
            // Skip home
            if (host === "home") continue;

            // Skip purchased servers (dynamic) + belt-and-suspenders prefix check
            if (pservs.has(host)) continue;
            if (host.startsWith("pserv-")) continue;

            if (!ns.hasRootAccess(host)) continue;

            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < Number(flags.minRam)) {
                if (flags.verbose) ns.print(`[skip] ${host}: maxRam=${maxRam}GB < minRam=${flags.minRam}GB`);
                continue;
            }

            // Backoff gate (prevents log spam + tight loops when a host can’t run the worker yet)
            if ((nextTryAt[host] ?? 0) > now) continue;

            const prevMax = lastMaxRam[host] ?? 0;

            // “Expected running” check (args-sensitive)
            const runningExpected = ns.isRunning(workerScript, host, target, mode);

            // Also detect any stale instances of the worker (different args) consuming RAM
            const processes = ns.ps(host);
            const stalePids = [];
            for (const p of processes) {
                if (p.filename === workerScript) {
                    // Keep the one that exactly matches args; everything else is stale
                    const args = p.args || [];
                    const isExact = args.length === 2 && String(args[0]) === target && String(args[1]).toLowerCase() === mode;
                    if (!isExact) stalePids.push(p.pid);
                }
            }

            // Worker missing on host?
            const missingOnHost = !ns.fileExists(workerScript, host);

            // Redeploy when:
            //  - not running (expected),
            //  - RAM increased since last pass,
            //  - worker missing on host,
            //  - or stale worker instances exist (they can block RAM + cause exec failures)
            const needsDeploy =
                !runningExpected ||
                maxRam > prevMax ||
                missingOnHost ||
                stalePids.length > 0;

            if (!needsDeploy) continue;

            ns.tprint(`+ (re)deploying HGW on ${host}: RAM ${prevMax}GB -> ${maxRam}GB`);

            // Kill stale worker instances first (these are the #1 cause of “exec=0 forever” after stage switches)
            for (const pid of stalePids) ns.kill(pid);

            // Kill the “expected” worker too, if it’s running (ensures clean thread recalculation)
            if (runningExpected) ns.kill(workerScript, host, target, mode);

            // Optional nuclear option (still safe because we never touch home/pservs here)
            if (flags.killAll) ns.killall(host);

            // Ensure script exists on host
            const ok = await ns.scp(workerScript, host);
            if (!ok) {
                ns.tprint(`[X] Failed to SCP ${workerScript} to ${host}`);
                bumpBackoff(host, failStreak, nextTryAt, now);
                continue;
            }

            // IMPORTANT FIX: threads based on FREE ram, not MAX ram
            const scriptRam = ns.getScriptRam(workerScript);
            const usedRam = ns.getServerUsedRam(host);
            const freeRam = Math.max(0, maxRam - usedRam);

            // Leave a little breathing room so we don’t thrash if something else starts on the host
            const usable = freeRam * (1 - Number(flags.reserveFrac));
            const threads = Math.floor(usable / scriptRam);

            if (threads < 1) {
                ns.tprint(
                    `[WARN] ${host}: not enough FREE RAM. max=${maxRam} used=${usedRam.toFixed(1)} free=${freeRam.toFixed(
                        1
                    )} script=${scriptRam.toFixed(1)}`
                );
                bumpBackoff(host, failStreak, nextTryAt, now);
                // still record maxRam so “RAM upgraded” logic doesn’t spam redeploy messages
                lastMaxRam[host] = maxRam;
                continue;
            }

            const pid = ns.exec(workerScript, host, threads, target, mode);
            if (pid === 0) {
                // This is the actionable diagnostic you were missing
                ns.tprint(
                    `[X] Failed to start ${workerScript} on ${host} | threads=${threads} max=${maxRam} used=${usedRam.toFixed(
                        1
                    )} free=${freeRam.toFixed(1)} scriptRam=${scriptRam.toFixed(1)}`
                );
                bumpBackoff(host, failStreak, nextTryAt, now);
                continue;
            }

            // Success: reset backoff + remember RAM
            failStreak[host] = 0;
            nextTryAt[host] = 0;
            lastMaxRam[host] = maxRam;

            if (flags.verbose) {
                ns.tprint(`[OK] ${host}: running ${workerScript} x${threads} vs ${target} [${mode}] (pid=${pid})`);
            } else {
                ns.print(`[OK] ${host}: running ${workerScript} x${threads} vs ${target} [${mode}]`);
            }
        }

        await ns.sleep(Number(flags.tick));
    }
}

/** Breadth-first search of the network */
function getAllServers(ns) {
    const visited = new Set();
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) queue.push(neighbor);
        }
    }
    return Array.from(visited);
}

/**
 * Exponential backoff per-host to avoid tight “redeploy spam” loops when exec keeps failing.
 * Backoff: 10s, 20s, 40s, 80s, ... up to 5 minutes.
 */
function bumpBackoff(host, failStreak, nextTryAt, nowMs) {
    const s = (failStreak[host] ?? 0) + 1;
    failStreak[host] = s;

    const base = 10_000;
    const delay = Math.min(300_000, base * Math.pow(2, Math.min(8, s - 1)));
    nextTryAt[host] = nowMs + delay;
}

function printHelp(ns) {
    ns.tprint("/bin/botnet-hgw-sync.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Keep botnet/remote-hgw.js deployed on all rooted NPC servers.");
    ns.tprint("  Skips home and purchased servers (pserv-*) so batchers/pserv-manager own those.");
    ns.tprint("  FIXED: threads are computed from FREE RAM (max-used), so it won’t loop forever after stage switches.");
    ns.tprint("  FIXED: kills stale remote-hgw.js instances with mismatched args that can block RAM.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint('  Target defaults to "omega-net" when no argument is provided.');
    ns.tprint('  Mode controls worker behavior: "xp" (default) or "money".');
    ns.tprint("  Requires botnet/remote-hgw.js to exist on home before running.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run /bin/botnet-hgw-sync.js [target] [mode] [--tick ms] [--minRam gb] [--reserveFrac 0.05] [--verbose true] [--killAll true] [--help]");
}
```
/* == END FILE == */

/* == FILE: bin/contracts-find-and-solve.js == */
```js
import { solvers } from "lib/solvers.js";
const disabledTypes = new Set();

/**
 * bin/find-and-solve.js
 *
 * Finds coding contracts across all discovered hosts and attempts to solve them
 * using the solver library in lib/sovlers.js.
 *
 * DROP-IN UPDATE:
 *  - Does NOT scan purchased servers (pserv-*) to avoid delete/rebuy race crashes.
 *  - Does NOT scan "darkweb".
 *  - Adds safe guards around host existence + ls() to prevent "Invalid hostname" runtime errors.
 */

export function printHelp(ns) {
    ns.tprint(
        [
            "bin/find-and-solve.js",
            "Description:",
            "  Scans the network for .cct files and attempts to solve them using lib/sovlers.js.",
            "",
            "Usage:",
            "  run bin/find-and-solve.js [--once] [--interval ms] [--timeout ms] [--no-worker]",
            "                                [--dry-run] [--host <name>] [--type <substring>]",
            "",
            "Options:",
            "  --help         Show this help and exit.",
            "  --once         Run one pass and exit (default: loop forever).",
            "  --interval     Sleep time between passes in ms (default: 60000).",
            "  --timeout      Max milliseconds per solver when using Worker (default: 5000).",
            "  --no-worker    Run solvers directly (more compatible, no timeout protection).",
            "  --dry-run      Print what would be attempted, but don't call attempt().",
            "  --host         Only check contracts on this host (exact match).",
            "  --type         Only attempt contracts whose type includes this substring (case-insensitive).",
            "  --quiet        Reduce printing (still prints rewards/errors to terminal).",
            "",
            "Notes:",
            "  - If a solver times out in Worker mode, try increasing --timeout or using --no-worker.",
            "  - If a solver returns the wrong answer once, this script disables that solver type for the run.",
            "  - This script skips purchased servers (pserv-*) and 'darkweb' to avoid hostname race errors.",
        ].join("\n")
    );
}

export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
        ["once", false],
        ["interval", 60_000],
        ["timeout", 5_000],
        ["no-worker", false],
        ["dry-run", false],
        ["host", ""],
        ["type", ""],
        ["quiet", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("scan");
    ns.disableLog("sleep");

    const interval = Math.max(250, Number(flags.interval) || 60_000);
    while (true) {
        await attemptAllContracts(ns, flags);

        if (flags.once) return;
        await ns.sleep(interval);
    }
}

export async function attemptAllContracts(ns, flags) {
    const contracts = getContracts(ns, flags);
    if (!flags.quiet) ns.print(`Found ${contracts.length} contracts.`);

    for (const contract of contracts) {
        await attemptContract(ns, contract, flags);
    }
}

export function getContracts(ns, flags) {
    const contracts = [];
    const hostFilter = (flags.host || "").trim();
    const typeFilter = (flags.type || "").trim().toLowerCase();

    for (const host of getAllHosts(ns)) {
        if (hostFilter && host !== hostFilter) continue;

        // Extra safety: host might disappear (pserv upgrade window, etc.)
        if (!ns.serverExists(host)) continue;

        for (const file of safeLs(ns, host, ".cct")) {
            let type = "";
            try {
                type = ns.codingcontract.getContractType(file, host);
            } catch (_e) {
                continue; // skip unreadable / race
            }

            if (typeFilter && !type.toLowerCase().includes(typeFilter)) continue;

            let triesRemaining = 0;
            try {
                triesRemaining = ns.codingcontract.getNumTriesRemaining(file, host);
            } catch (_e) {
                triesRemaining = 0;
            }

            contracts.push({
                host,
                file,
                type,
                triesRemaining,
            });
        }
    }
    return contracts;
}

export async function attemptContract(ns, contract, flags) {
    if (disabledTypes.has(contract.type)) {
        if (!flags.quiet)
            ns.print(
                `SKIP: Solver disabled for "${contract.type}" (previous failure this run).`
            );
        return;
    }

    const solver = solvers[contract.type];
    if (!solver) {
        if (!flags.quiet)
            ns.print(
                `WARNING: No solver for "${contract.type}" on ${contract.host}`
            );
        return;
    }

    if (!flags.quiet) ns.print("Attempting " + JSON.stringify(contract, null, 2));

    let data;
    try {
        data = ns.codingcontract.getData(contract.file, contract.host);
    } catch (e) {
        ns.print(
            `ERROR reading data for "${contract.type}" on ${contract.host}: ${String(
                e
            )}`
        );
        return;
    }

    try {
        const solution = flags["no-worker"]
            ? solver(data)
            : await runInWebWorker(solver, [data], Number(flags.timeout) || 5_000);

        // Guard: verify Compression III output before burning a contract try
        if (contract.type === "Compression III: LZ Compression") {
            const dec = solvers["Compression II: LZ Decompression"];
            if (
                typeof solution !== "string" ||
                !dec ||
                dec(solution) !== String(data)
            ) {
                throw new Error(
                    "Compression III produced invalid encoding (self-check failed). Skipping attempt."
                );
            }
        }

        if (flags["dry-run"]) {
            ns.tprint(
                `[DRY-RUN] Would attempt "${contract.type}" on ${contract.host}:${contract.file} with solution: ${formatSolution(
                    solution
                )}`
            );
            return;
        }

        const reward = ns.codingcontract.attempt(
            solution,
            contract.file,
            contract.host,
            { returnReward: true }
        );

        if (reward) {
            ns.tprint(
                `${reward} for solving "${contract.type}" on ${contract.host}`
            );
            ns.print(`${reward} for solving "${contract.type}" on ${contract.host}`);
        } else {
            ns.tprint(
                `ERROR: Failed to solve "${contract.type}" on ${contract.host} (${contract.file})`
            );
            // Disable this solver type for this run (prevents burning tries on the same wrong solver)
            disabledTypes.add(contract.type);
        }
    } catch (error) {
        ns.print(
            `ERROR solving "${contract.type}" on ${contract.host}: ${String(error)}`
        );
        ns.tprint(
            `ERROR solving "${contract.type}" on ${contract.host}: ${String(error)}`
        );
    }
}

function formatSolution(solution) {
    if (typeof solution === "string") return solution;
    try {
        return JSON.stringify(solution);
    } catch {
        return String(solution);
    }
}

/**
 * Safe ls wrapper:
 * - avoids crashes if host vanishes mid-loop (pserv delete/rebuy window)
 */
function safeLs(ns, host, pattern) {
    try {
        if (!ns.serverExists(host)) return [];
        return ns.ls(host, pattern);
    } catch (_e) {
        return [];
    }
}

/**
 * BFS scan of the network, cached for script lifetime.
 *
 * DROP-IN UPDATE:
 *  - Excludes purchased servers (ns.getPurchasedServers + "pserv-" prefix)
 *  - Excludes "darkweb"
 */
function getAllHosts(ns) {
    // Cache for script lifetime (same as original intent)
    getAllHosts.cache ||= null;
    if (getAllHosts.cache) return getAllHosts.cache;

    const scanned = new Set();
    const toScan = ["home"];

    // Purchased servers can appear/disappear during upgrades. Exclude them.
    const pservs = new Set(ns.getPurchasedServers());

    while (toScan.length > 0) {
        const host = toScan.shift();
        if (scanned.has(host)) continue;

        // Race-safe: host might not exist (during pserv upgrade churn)
        if (!ns.serverExists(host)) continue;

        // Exclusions
        if (host === "darkweb") continue;
        if (pservs.has(host)) continue;
        if (host.startsWith("pserv-")) continue;

        scanned.add(host);

        for (const nextHost of ns.scan(host)) {
            if (!scanned.has(nextHost)) toScan.push(nextHost);
        }
    }

    getAllHosts.cache = Array.from(scanned);
    return getAllHosts.cache;
}

/**
 * Run a function in a WebWorker with a timeout guard.
 * This protects you from accidental infinite loops / very slow solvers.
 */
async function runInWebWorker(fn, args, maxMs = 5000) {
    return new Promise((resolve, reject) => {
        let finished = false;

        let worker;
        try {
            worker = makeWorker(fn, (result) => {
                finished = true;
                resolve(result);
            });
        } catch (e) {
            reject(`Worker creation failed: ${String(e)}`);
            return;
        }

        const timer = setTimeout(() => {
            if (!finished) reject(`${maxMs} ms elapsed.`);
            try {
                worker.terminate();
            } catch {
                /* noop */
            }
        }, maxMs);

        worker.onmessageerror = (e) => {
            clearTimeout(timer);
            try {
                worker.terminate();
            } catch {
                /* noop */
            }
            reject(`Worker message error: ${String(e)}`);
        };

        worker.onerror = (e) => {
            clearTimeout(timer);
            try {
                worker.terminate();
            } catch {
                /* noop */
            }
            reject(`Worker error: ${e?.message || String(e)}`);
        };

        worker.postMessage(args);
    });
}

function makeWorker(workerFunction, cb) {
    // Wrap function safely so syntax issues surface clearly.
    const workerSrc = `
        "use strict";
        const handler = (${workerFunction});
        onmessage = (e) => {
            const result = handler.apply(null, e.data);
            postMessage(result);
        };
    `;

    const workerBlob = new Blob([workerSrc], {
        type: "application/javascript; charset=utf-8",
    });
    const workerBlobURL = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerBlobURL);

    worker.onmessage = (e) => cb(e.data);
    return worker;
}
```
/* == END FILE == */

/* == FILE: bin/controller.js == */
```js
/**
 * bin/controller.js
 *
 * Description
 *  Single controller daemon that checks free RAM and starts required daemons when affordable.
 *  Uses lib/targets.js for target selection and lib/rooting.js for race-free rooting.
 *  Uses Singularity for TOR/Darkweb/WSE/invite automation, plus purchase-only augmentation automation.
 *  Includes optional player automation (default ON): crime->gang->faction work.
 *  Sets a pserv purchase policy: cap at 2048 until (Formulas.exe + WSE+TIX+4S).
 *
 *  Corp handling:
 *   - Temporarily disabled (corp rewrite planned).
 *
 * Syntax
 *  run bin/controller.js
 *  run bin/controller.js --tick 5000 --reserveRam 64 --hgwMode xp
 *  run bin/controller.js --retarget true --restartOnRetarget true
 *  run bin/controller.js --player false
 *  run bin/controller.js --help
 */

/** @param {NS} ns */

import { rootAllPossible, waitForRootCoverage } from "/lib/rooting.js";
import { initTargets, runTargetingTick } from "/lib/target-lane.js";
import { maybeCreateGang } from "/lib/gang.js";
import { fmtTime } from "/lib/format.js";
import { getCurrentWorkSafe } from "/lib/player.js";
import { runHybridPlayerTick, PLAYER_POLICY_DEFAULTS } from "/lib/player-policy.js";
import { runDaemonLane } from "/lib/daemon-lane.js";
import { runAugmentationTick } from "/lib/augs-controller.js";
import { runSingularityTick } from "/lib/singularity-lane.js";
import { formatWorkBrief, ensureDaedalusFactionWork } from "/lib/work.js"; // NEW: Daedalus override helper
import { flushLog } from "/lib/logging.js";
import { runHacknetTick } from "/lib/hacknet-lane.js";
import { runHomeUpgradesTick } from "/lib/home-upgrades-lane.js";

// bbOS service config integration
import { getServiceRegistry } from "/lib/os/service-registry.js";
import {
  DEFAULT_SERVICE_CONFIG_PATH,
  loadServiceConfig,
  getEffectiveEnabledMap,
} from "/lib/os/service-config.js";

const FLAGS = [
  ["help", false],

  // Loop / RAM policy
  ["tick", 15000],
  ["reserveRam", 64],          // keep this much RAM free on home
  ["logMode", "changes"],      // changes | always | silent

  // Targeting
  ["hgwMode", "money"],        // money | xp
  ["batchTarget", ""],         // optional override (skip scoring)
  ["retarget", true],         // periodically re-score targets
  ["retargetEvery", 15 * 60 * 1000], // ms (m * s * ms) between re-score when --retarget true
  ["scoringVerbose", false],   // print scoring tables when retargeting

  // (Optional) restart managed daemons on retarget
  ["restartOnRetarget", false], // if true, will restart batcher/botnet when targets change

  // Must-have scripts (your list)
  ["batcher", "bin/timed-net-batcher2.js"],
  ["botnet", "bin/botnet-hgw-sync.js"],
  ["pserv", "bin/pserv-manager.js"],
  ["trader", "bin/basic-trader.js"],
  ["gangManager", "bin/gang-manager.js"],
  ["bladeburnerManager", "/bin/bladeburner-manager.js"],
  ["intTrainer", "bin/intelligence-trainer.js"],


  // Helper scripts you already have
  ["darkwebBuyer", "bin/darkweb-auto-buyer.js"],

  // bbOS service enablement integration
  ["services", true], // if true: read os-services config and compute enabled map
  ["servicesFile", DEFAULT_SERVICE_CONFIG_PATH],
  ["servicesVerbose", false], // if true: log effective enablement map changes

  // Singularity automation toggles
  ["autoTor", true],
  ["autoDarkweb", true],
  ["autoWse", true],
  ["autoInvites", true],
  ["autoGangCreate", true],

  // Gang creation preferences
  ["gangFaction", ""], // optional preferred faction

  // Rooting behavior
  ["rootPass", true],          // attempt rootAllPossible every tick
  ["rootCoverageWait", false], // if true, waitForRootCoverage each tick (more expensive)
  ["rootCoverageTimeout", 20000],
  ["rootCoveragePoll", 500],

  // Player automation
  ["player", true],            // default ON; set --player false to disable

  // Scheduled jobs (one-shots run periodically)
  ["jobs", true],
  ["jobIntervalMs", 600_000], // 10 minutes
  ["backdoorJob", "bin/backdoor-oneshot.js"],
  ["contractsJob", "bin/contracts-find-and-solve.js"],

  // Corp daemon
  //["corp", true],              // enable starting corp daemon when corp exists
  //["corpDaemon", "DISABLED:corp-daemon.js"], // script to run when corp exists
];

const PLAYER_DEFAULTS = PLAYER_POLICY_DEFAULTS;

export async function main(ns) {
  const flags = ns.flags(FLAGS);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  const cfg = {
    tick: Math.max(1000, Number(flags.tick) || 15000),
    reserveRam: Math.max(0, Number(flags.reserveRam) || 0),
    logMode: String(flags.logMode || "changes"),

    hgwMode: String(flags.hgwMode || "money").toLowerCase(),
    batchTargetOverride: String(flags.batchTarget || "").trim(),
    retarget: !!flags.retarget,
    retargetEvery: Math.max(30_000, Number(flags.retargetEvery) || 15 * 60 * 1000),
    scoringVerbose: !!flags.scoringVerbose,
    restartOnRetarget: !!flags.restartOnRetarget,

    batcher: String(flags.batcher),
    botnet: String(flags.botnet),
    pserv: String(flags.pserv),
    trader: String(flags.trader),
    gangManager: String(flags.gangManager),
    bladeburnerManager: String(flags.bladeburnerManager),
    intTrainer: String(flags.intTrainer),
    darkwebBuyer: String(flags.darkwebBuyer),


    // bbOS service enablement
    services: !!flags.services,
    servicesFile: String(flags.servicesFile || DEFAULT_SERVICE_CONFIG_PATH),
    servicesVerbose: !!flags.servicesVerbose,
    servicesEnabled: null, // filled by applyServiceEnablement()

    autoTor: !!flags.autoTor,
    autoDarkweb: !!flags.autoDarkweb,
    autoWse: !!flags.autoWse,
    autoInvites: !!flags.autoInvites,
    autoGangCreate: !!flags.autoGangCreate,

    gangFaction: String(flags.gangFaction || "").trim(),

    rootPass: !!flags.rootPass,
    rootCoverageWait: !!flags.rootCoverageWait,
    rootCoverageTimeout: Math.max(1000, Number(flags.rootCoverageTimeout) || 20000),
    rootCoveragePoll: Math.max(100, Number(flags.rootCoveragePoll) || 500),

    player: !!flags.player,

    // args for pserv manager (daemon-lane should pass these to ensureDaemon)
    pservArgs: [],

    // Scheduled jobs config
    jobs: !!flags.jobs,
    jobIntervalMs: Math.max(30_000, Number(flags.jobIntervalMs) || 600_000),
    backdoorJob: String(flags.backdoorJob || "bin/backdoor-oneshot.js"),
    contractsJob: String(flags.contractsJob || "bin/contracts-find-and-solve.js"),
  };

  // Target state (so we can avoid unnecessary restarts)
  let primaryTarget = cfg.batchTargetOverride || "n00dles";
  let hgwTarget = primaryTarget;
  let lastTargetCompute = 0;

  // Change-only log suppression memory (terminal)
  let lastMsgs = new Set();

  // Aug lane state (owned by augs-controller)
  const augState = { lastCheck: 0, lastNextBrief: "" };

  // Hacknet lane state (owned by hacknet-lane)
  const hacknetState = { lastTick: 0, lastHashTick: 0 };

  // Home Upgrade lane state
  const homeUpgradesState = {};

  // Shared lane hints
  const shared = { augReserveHint: 0 };

  // pserv policy memory (so we only log changes)
  const pservPolicyState = {
    lastMode: "", // "cap" | "lift"
  };

  // Scheduled jobs state (timestamps + throttled warnings)
  const jobState = {};

  // bbOS services enablement memory (anti-spam)
  const servicesState = {
    lastSig: "",
  };

  // Compute enablement once at startup
  applyServiceEnablement(ns, cfg, servicesState, /*msgs*/ null);

  // Initial target selection (unless overridden)
  {
    const init = initTargets(ns, cfg, true);
    primaryTarget = init.primaryTarget;
    hgwTarget = init.hgwTarget;
    lastTargetCompute = init.lastTargetCompute;
  }

  while (true) {
    const msgs = [];
    const tickStart = Date.now();

    // Refresh enablement (cheap; logs only on change)
    applyServiceEnablement(ns, cfg, servicesState, msgs);

    // Scheduled jobs (one-shots that run periodically)
    applyScheduledJobs(ns, cfg, jobState, msgs);

    // ---------------------------------------------------------------------
    // 1) Rooting pass (prevents deploy races)
    // ---------------------------------------------------------------------
    if (cfg.rootPass) {
      const before = rootAllPossible(ns);
      if (before.attempted > 0) {
        msgs.push(`[root] rooted=${before.rooted}/${before.attempted} newly-rootable targets (attempted)`);
      }
    }

    if (cfg.rootCoverageWait) {
      const ok = await waitForRootCoverage(ns, { timeoutMs: cfg.rootCoverageTimeout, pollMs: cfg.rootCoveragePoll });
      if (!ok) msgs.push("[root] WARN: coverage not complete within timeout (continuing)");
    }

    // ---------------------------------------------------------------------
    // 2) Target selection / retarget
    // ---------------------------------------------------------------------
    if (!cfg.batchTargetOverride && cfg.retarget) {
      const res = runTargetingTick(ns, cfg, { primaryTarget, hgwTarget, lastTargetCompute });
      primaryTarget = res.primaryTarget;
      hgwTarget = res.hgwTarget;
      lastTargetCompute = res.lastTargetCompute;
      msgs.push(...(res.msgs || []));
    }

    // ---------------------------------------------------------------------
    // 3) Singularity automation (non-blocking)
    // ---------------------------------------------------------------------
    runSingularityTick(ns, cfg, msgs);

    // ---------------------------------------------------------------------
    // 3b) Aug automation (purchase-only)
    // ---------------------------------------------------------------------
    runAugmentationTick(ns, augState, msgs);
    shared.augReserveHint = Number(augState.reserveHint || 0);

    // ---------------------------------------------------------------------
    // 4) Gang readiness + creation
    // ---------------------------------------------------------------------
    if (cfg.autoGangCreate) {
      const r = maybeCreateGang(ns, { preferredFaction: cfg.gangFaction });
      if (r.changed) msgs.push(`[gang] created: ${r.faction}`);
    }

    // ---------------------------------------------------------------------
    // 5) Player lane (hybrid) - default ON, can disable with --player false
    // ---------------------------------------------------------------------
    if (cfg.player) {
      msgs.push(...runHybridPlayerTick(ns, PLAYER_DEFAULTS));
    }

    // ---------------------------------------------------------------------
    // 5b) Hard override: if you're in Daedalus, always earn Daedalus rep
    // ---------------------------------------------------------------------
    {
      const res = ensureDaedalusFactionWork(ns, {
        focus: false,
        verbose: false,
      });

      if (res.didSwitch) {
        msgs.push("[work] switched faction work to Daedalus (override)");
      }
    }

    // ---------------------------------------------------------------------
    // 6) Hacknet lane (upgrades, hashes)
    // ---------------------------------------------------------------------
    runHacknetTick(ns, cfg, hacknetState, msgs);

    // ---------------------------------------------------------------------
    // 6.5) pserv policy (sets cfg.pservArgs)
    // ---------------------------------------------------------------------
    applyPservPolicy(ns, cfg, pservPolicyState, msgs);

    // ---------------------------------------------------------------------
    // 7) Ensure must-have daemons (RAM-gated)
    // ---------------------------------------------------------------------
    runDaemonLane(ns, cfg, { primary: primaryTarget, hgw: hgwTarget }, msgs);

    // ---------------------------------------------------------------------
    // 9) Home Upgrades Lane
    // ---------------------------------------------------------------------
    runHomeUpgradesTick(ns, cfg, homeUpgradesState, msgs, shared);

    // ---------------------------------------------------------------------
    // Telemetry to script log (not terminal)
    // ---------------------------------------------------------------------
    const tickMs = Date.now() - tickStart;
    const w = getCurrentWorkSafe(ns);
    ns.print(
      `[tick] ${fmtTime(tickMs)} | batch=${primaryTarget} hgw=${hgwTarget} (${cfg.hgwMode}) | ` +
      `work=${formatWorkBrief(w)}`
    );

    flushLog(ns, cfg.logMode, msgs, lastMsgs);
    lastMsgs = new Set(msgs.filter(Boolean));

    await ns.sleep(cfg.tick);
  }
}

// ------------------------------------------------------------
// bbOS service enablement integration
// ------------------------------------------------------------
function applyServiceEnablement(ns, cfg, state, msgsOrNull) {
  if (!cfg.services) {
    cfg.servicesEnabled = null;
    return;
  }

  const registry = getServiceRegistry();
  const file = String(cfg.servicesFile || DEFAULT_SERVICE_CONFIG_PATH);

  const conf = loadServiceConfig(ns, file);
  const effective = getEffectiveEnabledMap(registry, conf);

  // Keys lanes care about (daemon-lane + jobs)
  cfg.servicesEnabled = {
    batcher: !!effective.batcher,
    botnet: !!effective.botnet,
    pserv: !!effective.pserv,
    trader: !!effective.trader,
    gangManager: !!effective.gangManager,
    darkwebBuyer: !!effective.darkwebBuyer,
    bladeburnerManager: !!effective.bladeburnerManager, // NEW
    backdoorJob: !!effective.backdoorJob,
    contractsJob: !!effective.contractsJob,
  };

  if (!cfg.servicesVerbose) return;

  const sig = [
    `batcher=${cfg.servicesEnabled.batcher ? "1" : "0"}`,
    `botnet=${cfg.servicesEnabled.botnet ? "1" : "0"}`,
    `pserv=${cfg.servicesEnabled.pserv ? "1" : "0"}`,
    `trader=${cfg.servicesEnabled.trader ? "1" : "0"}`,
    `gangManager=${cfg.servicesEnabled.gangManager ? "1" : "0"}`,
    `intTrainer=${cfg.servicesEnabled.intTrainer ? "1" : "0"}`,
    `bladeburnerManager=${cfg.servicesEnabled.bladeburnerManager ? "1" : "0"}`,
    `darkwebBuyer=${cfg.servicesEnabled.darkwebBuyer ? "1" : "0"}`,
    `backdoorJob=${cfg.servicesEnabled.backdoorJob ? "1" : "0"}`,
    `contractsJob=${cfg.servicesEnabled.contractsJob ? "1" : "0"}`,
  ].join("|");

  if (sig !== (state.lastSig || "")) {
    state.lastSig = sig;
    const msg =
      `[os] services (${file}): ` +
      `batcher=${cfg.servicesEnabled.batcher ? "ON" : "OFF"} ` +
      `botnet=${cfg.servicesEnabled.botnet ? "ON" : "OFF"} ` +
      `pserv=${cfg.servicesEnabled.pserv ? "ON" : "OFF"} ` +
      `trader=${cfg.servicesEnabled.trader ? "ON" : "OFF"} ` +
      `gangManager=${cfg.servicesEnabled.gangManager ? "ON" : "OFF"} ` +
      `bladeburnerManager=${cfg.servicesEnabled.bladeburnerManager ? "ON" : "OFF"} ` +
      `intTrainer=${cfg.servicesEnabled.intTrainer ? "ON" : "OFF"} ` +
      `darkwebBuyer=${cfg.servicesEnabled.darkwebBuyer ? "ON" : "OFF"} ` +
      `backdoorJob=${cfg.servicesEnabled.backdoorJob ? "ON" : "OFF"} ` +
      `contractsJob=${cfg.servicesEnabled.contractsJob ? "ON" : "OFF"}`;
    if (Array.isArray(msgsOrNull)) msgsOrNull.push(msg);
    else ns.tprint(msg);
  }
}

// ------------------------------------------------------------
// pserv policy helper (NO restarts here; we just set cfg.pservArgs)
// ------------------------------------------------------------
function applyPservPolicy(ns, cfg, state, msgs) {
  const hasFormulas = ns.fileExists("Formulas.exe", "home");

  const stock = ns.stock;
  const hasWSE = safeBool(() => stock?.hasWSEAccount?.(), false);
  const hasTIX = safeBool(() => stock?.hasTIXAPIAccess?.(), false);
  const has4SData = safeBool(() => stock?.has4SData?.(), false);
  const has4STix = safeBool(() => stock?.has4SDataTIXAPI?.(), false);

  const wseComplete = hasWSE && hasTIX && has4SData && has4STix;
  const shouldCap = (!hasFormulas || !wseComplete);

  cfg.pservArgs = shouldCap ? ["--maxRam", "2048"] : [];

  const mode = shouldCap ? "cap" : "lift";
  if (state.lastMode !== mode) {
    state.lastMode = mode;
    if (shouldCap) {
      msgs.push("[pserv] policy: cap pserv maxRam at 2048 until (Formulas.exe + WSE/TIX/4S)");
    } else {
      msgs.push("[pserv] policy: lift pserv cap (Formulas.exe + WSE/TIX/4S owned)");
    }
  }
}

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

// ------------------------------------------------------------
// Scheduled jobs (run one-shots periodically)
// ------------------------------------------------------------
function applyScheduledJobs(ns, cfg, state, msgs) {
  if (!cfg.jobs) return;

  const enabled = cfg.servicesEnabled || null;
  const isEnabled = (key) => {
    if (!enabled) return true;
    if (!Object.prototype.hasOwnProperty.call(enabled, key)) return true;
    return !!enabled[key];
  };

  const interval = Math.max(30_000, Number(cfg.jobIntervalMs) || 600_000);

  if (isEnabled("backdoorJob")) {
    runJob(ns, cfg, state, msgs, {
      key: "backdoor",
      script: cfg.backdoorJob,
      intervalMs: interval,
      threads: 1,
      args: [],
    });
  }

  if (isEnabled("contractsJob")) {
    runJob(ns, cfg, state, msgs, {
      key: "contracts",
      script: cfg.contractsJob,
      intervalMs: interval,
      threads: 1,
      args: [],
    });
  }
}

function runJob(ns, cfg, state, msgs, job) {
  const script = String(job.script || "").trim();
  if (!script) return;

  const lastKey = `jobLast_${job.key}`;
  const warnKey = `jobWarn_${job.key}`;
  const now = Date.now();
  const last = Number(state[lastKey] || 0);

  if (safeBool(() => ns.isRunning(script, "home"), false)) return;

  if (!safeBool(() => ns.fileExists(script, "home"), false)) {
    if (now - Number(state[warnKey] || 0) > 60_000) {
      state[warnKey] = now;
      msgs.push(`[job:${job.key}] WARN: missing ${script} on home`);
    }
    return;
  }

  if (now - last < job.intervalMs) return;

  const need = safeNum(() => ns.getScriptRam(script, "home"), Infinity) * Math.max(1, Math.floor(job.threads || 1));
  const max = safeNum(() => ns.getServerMaxRam("home"), 0);
  const used = safeNum(() => ns.getServerUsedRam("home"), 0);
  const free = Math.max(0, max - used);
  const avail = free - (Number(cfg.reserveRam || 0));

  if (!Number.isFinite(need) || need <= 0) return;

  if (avail < need) {
    if (now - Number(state[warnKey] || 0) > 60_000) {
      state[warnKey] = now;
      msgs.push(`[job:${job.key}] waiting for RAM to start ${script} (need=${need.toFixed(2)}GB avail=${avail.toFixed(2)}GB reserve=${Number(cfg.reserveRam || 0)}GB)`);
    }
    return;
  }

  const t = Math.max(1, Math.floor(job.threads || 1));
  const args = Array.isArray(job.args) ? job.args : [];

  const pid = safeNum(() => ns.run(script, t, ...args), 0);
  if (pid > 0) {
    state[lastKey] = now;
    msgs.push(`[job:${job.key}] started ${script} (pid=${pid})`);
  } else {
    if (now - Number(state[warnKey] || 0) > 60_000) {
      state[warnKey] = now;
      msgs.push(`[job:${job.key}] WARN: failed to start ${script} (ns.run returned ${pid})`);
    }
  }
}

// ------------------------------------------------------------
// Logging / Help
// ------------------------------------------------------------
function printHelp(ns) {
  ns.tprint("bin/controller.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Single controller daemon that checks free RAM and starts required daemons when affordable.");
  ns.tprint("  Uses lib/targets.js for target selection and lib/rooting.js for race-free rooting.");
  ns.tprint("  Uses Singularity for TOR/Darkweb/WSE/invite automation, plus purchase-only augmentation automation.");
  ns.tprint("  Includes optional player automation (default ON): crime->gang->faction work.");
  ns.tprint("  Sets a pserv purchase policy: cap at 2048 until (Formulas.exe + WSE+TIX+4S).");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --tick <ms>               Loop cadence (default 15000)");
  ns.tprint("  --reserveRam <gb>         Keep this much RAM free on home (default 64)");
  ns.tprint("  --logMode changes|always|silent");
  ns.tprint("  --hgwMode money|xp");
  ns.tprint("  --batchTarget <host>      Override target selection");
  ns.tprint("  --retarget true|false     Periodically re-score targets");
  ns.tprint("  --retargetEvery <ms>");
  ns.tprint("  --restartOnRetarget true|false");
  ns.tprint("  --player true|false");
  ns.tprint("  --jobs true|false         Enable scheduled jobs (default true)");
  ns.tprint("  --jobIntervalMs <ms>      Interval for scheduled jobs (default 600000)");
  ns.tprint("  --backdoorJob <path>      Backdoor job script (default bin/backdoor-oneshot.js)");
  ns.tprint("  --contractsJob <path>     Contracts job script (default bin/contracts-find-and-solve.js)");
  ns.tprint("  --intTrainer <path>      Intelligence trainer daemon (default bin/intelligence-trainer.js)");
  ns.tprint("");
  ns.tprint("bbOS Services");
  ns.tprint("  --services true|false         Enable service config gating (default true)");
  ns.tprint("  --servicesFile <path>         Service config file path (default data/os-services.json)");
  ns.tprint("  --servicesVerbose true|false  Log enablement changes (default false)");
  ns.tprint("");
  ns.tprint("Examples");
  ns.tprint("  run bin/controller.js");
  ns.tprint("  run bin/controller.js --tick 5000 --reserveRam 64");
  ns.tprint("  run bin/controller.js --servicesVerbose true");
}
```
/* == END FILE == */

/* == FILE: bin/darkweb-auto-buyer.js == */
```js
/** @param {NS} ns */

/*
 * /bin/darkweb-auto-buyer.js
 *
 * After you purchase TOR, run this once per BitNode.
 * It will automatically purchase all Dark Web programs that are
 * referenced by /bin/startup-home-advanced.js:
 *
 *   - BruteSSH.exe
 *   - FTPCrack.exe
 *   - relaySMTP.exe
 *   - HTTPWorm.exe
 *   - SQLInject.exe
 *   - Formulas.exe
 *
 * It loops until all target programs are owned, then exits.
 */

import { fmtMoney } from "lib/format.js";

export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
  ]);

  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  // Singularity API check (BN4 / SF4 required)
  if (
    !ns.singularity ||
    typeof ns.singularity.getDarkwebProgramCost !== "function" ||
    typeof ns.singularity.purchaseProgram !== "function"
  ) {
    ns.tprint("darkweb-auto-buyer: Singularity API not available.");
    ns.tprint("  This script requires BN4 or Source-File 4.1+.");
    ns.tprint("  Until then, buy Dark Web programs manually with 'buy' in Terminal.");
    return;
  }

  // Programs actually used in /bin/startup-home-advanced.js
  // (via countPortCrackers() and hasFormulas()).
  const TARGET_PROGRAMS = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
    "Formulas.exe",
  ];

  const CHECK_INTERVAL = 60_000; // 60s between checks

  // Make sure we really have TOR / Dark Web access
  const player = ns.getPlayer();
  const hasTor = player.tor || ns.serverExists("darkweb");

  if (!hasTor) {
    ns.tprint("darkweb-auto-buyer: No TOR router detected.");
    ns.tprint("  Buy TOR from the Dark Web hardware vendor first, then rerun this.");
    return;
  }

  ns.tprint("darkweb-auto-buyer: Starting Dark Web program purchases...");
  ns.tprint("  Target programs:");
  for (const p of TARGET_PROGRAMS) ns.tprint(`    - ${p}`);

  while (true) {
    let remaining = 0;

    for (const prog of TARGET_PROGRAMS) {
      // Already owned? Skip.
      if (ns.fileExists(prog, "home")) continue;

      remaining++;

      const cost = ns.singularity.getDarkwebProgramCost(prog);
      if (!isFinite(cost) || cost <= 0) {
        ns.print(`${prog}: cost is ${cost}, maybe not available yet. Skipping for now.`);
        continue;
      }

      const money = ns.getServerMoneyAvailable("home");

      if (money >= cost) {
        const costStr = fmtMoney(ns, cost);
        const moneyStr = fmtMoney(ns, money);

        ns.tprint(
          `Attempting to purchase ${prog} for ${costStr} ` +
          `(you: ${moneyStr})`
        );

        const ok = ns.singularity.purchaseProgram(prog);
        if (ok) {
          ns.tprint(`Purchased ${prog}.`);
        } else {
          ns.tprint(`purchaseProgram(${prog}) failed (maybe already owned or some other issue).`);
        }
      } else {
        const moneyStr = fmtMoney(ns, money);
        const costStr = fmtMoney(ns, cost);
        ns.print(
          `Waiting for funds for ${prog}: ` +
          `${moneyStr} / ${costStr}`
        );
      }
    }

    if (remaining === 0) {
      ns.tprint("darkweb-auto-buyer: All target programs purchased. Exiting.");
      return;
    }

    await ns.sleep(CHECK_INTERVAL);
  }
}

// --------------------------------------------------
// Help Function
// --------------------------------------------------

function printHelp(ns) {
  ns.tprint("/bin/darkweb-auto-buyer.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Automatically purchases key Dark Web programs once you have TOR access.");
  ns.tprint("  Loops until BruteSSH.exe, FTPCrack.exe, relaySMTP.exe, HTTPWorm.exe,");
  ns.tprint("  SQLInject.exe, and Formulas.exe are all owned, then exits.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  Requires Singularity access (BN4 or Source-File 4.1+) to use purchaseProgram.");
  ns.tprint("  Also requires that you already own a TOR router or have Dark Web access.");
  ns.tprint("  Script takes no positional arguments and is typically run once per BitNode.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/darkweb-auto-buyer.js [--help]");
}
```
/* == END FILE == */

/* == FILE: bin/early-money.js == */
```js
/**
 * /bin/early-money.js
 *
 * Description
 *  Ultra-light early-game money script for low-RAM homes.
 *  Runs a simple HWG loop on a single target with no imports and no Singularity.
 *  Exits cleanly once home MAX RAM reaches a threshold (bootstrap handles stage switching).
 *
 * Notes
 *  - Designed to be launched by /bin/bootstrap.js as Stage A.
 *  - Avoids ns.singularity entirely to keep RAM very low.
 *  - If you don't have root on the target yet, it will idle until you do.
 *
 * Syntax
 *  run /bin/early-money.js
 *  run /bin/early-money.js --target n00dles --stopAtRam 64
 *  run /bin/early-money.js --minMoneyFrac 0.85 --maxSecDelta 5
 *  run /bin/early-money.js --help
 */

/** @param {NS} ns */
const FLAGS = [
    ["help", false],

    // Target + behavior
    ["target", "n00dles"],
    ["minMoneyFrac", 0.85], // grow until money >= this * maxMoney
    ["maxSecDelta", 5],     // weaken until (sec - minSec) <= this

    // Timing / exit
    ["sleep", 200],
    ["stopAtRam", 64],      // exit when home MAX RAM >= this (bootstrap will switch stages)
];

export async function main(ns) {
    const flags = ns.flags(FLAGS);
    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    const target = String(flags.target || "n00dles");
    const minMoneyFrac = clamp01(Number(flags.minMoneyFrac ?? 0.85));
    const maxSecDelta = Math.max(0, Number(flags.maxSecDelta ?? 5));
    const sleep = Math.max(50, Number(flags.sleep) || 200);
    const stopAtRam = Math.max(1, Number(flags.stopAtRam) || 64);

    while (true) {
        // Exit condition (bootstrap handles next stage)
        const homeMax = ns.getServerMaxRam("home");
        if (homeMax >= stopAtRam) {
            ns.tprint(`[early] Home MAX RAM ${homeMax}GB >= ${stopAtRam}GB -> exiting (bootstrap will switch stages)`);
            return;
        }

        // If we can't hack the target yet, do nothing (cheap idle)
        if (!safeBool(() => ns.hasRootAccess(target), false)) {
            await ns.sleep(1000);
            continue;
        }

        // Decide action based on server state
        const maxMoney = safeNum(() => ns.getServerMaxMoney(target), 0);
        const money = safeNum(() => ns.getServerMoneyAvailable(target), 0);
        const minSec = safeNum(() => ns.getServerMinSecurityLevel(target), 1);
        const sec = safeNum(() => ns.getServerSecurityLevel(target), minSec);
        const secDelta = sec - minSec;

        if (secDelta > maxSecDelta) {
            await ns.weaken(target);
            await ns.sleep(sleep);
            continue;
        }

        if (maxMoney > 0 && money / maxMoney < minMoneyFrac) {
            await ns.grow(target);
            await ns.sleep(sleep);
            continue;
        }

        // Otherwise hack for cash
        await ns.hack(target);
        await ns.sleep(sleep);
    }
}

// ------------------------------------------------------------
// Utils
// ------------------------------------------------------------

function clamp01(x) {
    x = Number(x);
    if (!Number.isFinite(x)) return 0;
    return Math.min(1, Math.max(0, x));
}

function safeNum(fn, fallback) {
    try {
        const v = Number(fn());
        return Number.isFinite(v) ? v : fallback;
    } catch {
        return fallback;
    }
}

function safeBool(fn, fallback) {
    try { return Boolean(fn()); } catch { return fallback; }
}

/** @param {NS} ns */
function printHelp(ns) {
    ns.tprint("/bin/early-money.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Ultra-light early-game money script for low-RAM homes.");
    ns.tprint("  Runs a simple HWG loop on one target with no imports and no Singularity.");
    ns.tprint("  Exits once home MAX RAM reaches a threshold (bootstrap handles stage switching).");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - If you do not have root on the target yet, it will idle.");
    ns.tprint("  - Keep this tiny: do NOT add ns.singularity calls here (they are RAM-expensive).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run /bin/early-money.js");
    ns.tprint("  run /bin/early-money.js --target n00dles --stopAtRam 64");
    ns.tprint("  run /bin/early-money.js --minMoneyFrac 0.9 --maxSecDelta 2");
    ns.tprint("  run /bin/early-money.js --help");
    ns.tprint("");
    ns.tprint("Flags");
    ns.tprint("  --target <host>            Target to farm (default n00dles)");
    ns.tprint("  --minMoneyFrac <0..1>      Grow until money >= frac*max (default 0.85)");
    ns.tprint("  --maxSecDelta <n>          Weaken until sec-minSec <= n (default 5)");
    ns.tprint("  --sleep <ms>               Extra delay between cycles (default 200)");
    ns.tprint("  --stopAtRam <gb>           Exit when home MAX RAM >= this (default 64)");
}
```
/* == END FILE == */

/* == FILE: bin/gang-manager.js == */
```js
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["tail", false],
    ["tick", 2000],

    // Logging
    ["logMode", "changes"], // changes | always | silent
    ["showRoster", true],

    // Equipment buying
    ["buyEquip", true],
    ["equipBudget", 0.03], // fraction of available money allowed per tick (NORMAL mode)
    ["equipMinCash", 1e9], // don't buy unless player has at least this much cash (NORMAL mode)

    // Debug
    ["equipDebug", false],
  ]);

  if (flags.help) return printHelp(ns);
  if (flags.tail) ns.tail();

  // QoL: reduce tail spam
  ns.disableLog("sleep");
  ns.disableLog("getServerMoneyAvailable");
  ns.disableLog("gang.setMemberTask");
  ns.disableLog("gang.setTerritoryWarfare");

  if (!ns.gang.inGang()) {
    ns.tprint("ERROR: You are not in a gang.");
    return;
  }

  // --- INTERNAL POLICY (minimal flags) ---
  const cfg = {
    tick: Number(flags.tick),

    // Wanted control
    targetPenalty: 0.995, // 99.5%
    penaltyBuffer: 0.0004, // exit recovery at target + buffer

    // Training hysteresis (base; will scale dynamically)
    minTrainBase: 200,
    minTrainCap: 5000,
    trainHysteresis: 50,

    // Tasks
    moneyTask: "Human Trafficking",
    trainTask: "Train Combat",
    vigilanteTask: "Vigilante Justice",
    territoryTask: "Territory Warfare",

    // Respect task tiers (auto-upgrade by stats)
    // NOTE: We will also CAP these tiers based on wanted headroom.
    respectTiers: [
      { min: 0, task: "Mug People" },
      { min: 200, task: "Deal Drugs" },
      { min: 400, task: "Strongarm Civilians" },
      { min: 600, task: "Run a Con" },
      { min: 900, task: "Armed Robbery" },
      { min: 1200, task: "Traffick Illegal Arms" },
      { min: 1600, task: "Threaten & Blackmail" },
      { min: 2200, task: "Human Trafficking" },
      { min: 3500, task: "Terrorism" },
    ],

    // Wanted-headroom caps for respect tiers
    respectCapsByPenalty: [
      { minPenalty: 0.997, capTask: "Traffick Illegal Arms" },
      { minPenalty: 0.9985, capTask: "Threaten & Blackmail" },
      { minPenalty: 0.999, capTask: "Human Trafficking" },
      { minPenalty: 0.9996, capTask: "Terrorism" },
    ],

    // Recovery controller
    vigiMinFrac: 0.1,
    vigiMaxFrac: 0.85,
    vigiK: 45,

    // NORMAL: be money-forward unless close to the line
    normalRespectMin: 0.06,
    normalRespectMax: 0.4,
    normalHeadroomHi: 0.002,
    normalHeadroomLo: 0.0003,

    // Recovery: respect-heavy while recovering
    recoveryRespectShare: 0.55,

    // Territory / warfare control (AGGRESSIVE-ish)
    engageMedianMin: 0.55,
    disengageMedianMin: 0.47, // hysteresis
    engageAtLeastN: 3,
    engageNChanceMin: 0.62,

    // Territory assignment fractions (more aggressive)
    territoryMinFrac: 0.7,
    territoryMaxFrac: 0.95,
    territoryFracRampAt: 0.75,

    // Territory taper: once you're mostly done, stop over-allocating TW
    territoryTaperAt: 0.95, // start tapering TW when territory >= 95%
    territoryTaperTo: 0.15, // TW fraction when territory reaches stopAt (but before endgame shuts it off)
    territoryKeepMin: 2, // always keep at least N on TW (until endgame)
    territoryKeepMax: 4, // don't keep more than N when tapering (optional safety)

    // Endgame: stop warfare and monetize
    territoryStopAt: 0.99,

    // Ascension rules
    ascendMult: 1.55,
    blockAscendWhenEngaged: true,

    // Naming
    recruitPrefix: "g",

    // Logging
    logMode: String(flags.logMode),
    showRoster: Boolean(flags.showRoster),

    // Equipment (baseline)
    buyEquip: Boolean(flags.buyEquip),
    equipBudget: Number(flags.equipBudget),
    equipMinCash: Number(flags.equipMinCash),
    equipMaxPurchasesPerTick: 3,
    equipMaxSpendPerMin: 1e9,

    // --- Equipment catch-up mode ---
    equipCatchup: true,

    // Enter catch-up if territory squad is under-geared OR anyone is under-geared
    equipCatchupTerritoryMinPct: 0.9,
    equipCatchupAnyMinPct: 0.5,

    // Catch-up overrides (temporary)
    equipCatchupMaxPurchasesPerTick: 5,
    equipCatchupMaxSpendPerMin: 10_000e6, // $10b/min during catch-up
    equipCatchupMinCash: 20e6,

    // Exit catch-up (hysteresis)
    equipCatchupExitTerritoryMinPct: 0.97,
    equipCatchupExitAnyMinPct: 0.8,

    // --- Cash farming mode (NEW) ---
    // If in catch-up and we can't afford the next missing combat item while keeping a reserve,
    // pause Territory Warfare tasks to rebuild cash.
    cashFarm: true,

    // Always keep this much cash (prevents feeling broke / starving other scripts)
    cashFarmReserve: 8e9,

    // Hysteresis around affordability to avoid flapping
    cashFarmEnterBuffer: 0.0,
    cashFarmExitBuffer: 2e9,

    // While cash-farming:
    cashFarmTerritoryFrac: 0.0, // assign zero TW tasks
    cashFarmRespectShare: 0.02, // minimize respect tasks, maximize money

    // Also force "clashes engaged" off while cash-farming (safer)
    cashFarmDisableClashes: true,

    // Debug
    equipDebug: Boolean(flags.equipDebug),
  };

  /** @type {Map<string, {task: string, tier: string}>} */
  const lastMemberState = new Map();
  let lastSummary = "";

  // Latches
  let recovery = false;
  let engaged = false;

  // Equipment catch-up latch
  let equipCatchup = false;

  // Cash farming latch
  let cashFarm = false;

  // Equipment state
  let equipState = {
    cursor: 0,
    spendWindowStart: 0,
    spentThisWindow: 0,
  };

  while (true) {
    try {
      const g = ns.gang.getGangInformation();

      // Recruit
      const recruited = recruitAll(ns, cfg.recruitPrefix);
      for (const name of recruited) log(ns, cfg, `[gang] recruited ${name}`);

      const names = ns.gang.getMemberNames();

      // Compute dynamic training target based on your gang's current strength
      const dyn = computeDynamicTrainingTarget(ns, cfg, names);

      // Clash chance stats (median, count above threshold)
      const clash = getClashStats(ns, cfg);

      // Recovery latch
      if (!recovery) {
        if (g.wantedPenalty < cfg.targetPenalty) recovery = true;
      } else {
        if (g.wantedPenalty >= cfg.targetPenalty + cfg.penaltyBuffer) recovery = false;
      }

      // Endgame: once you basically own territory, stop warfare permanently
      const inEndgame = g.territory >= cfg.territoryStopAt;

      const penaltyGap = Math.max(0, cfg.targetPenalty - g.wantedPenalty);
      const headroom = Math.max(0, g.wantedPenalty - cfg.targetPenalty);

      // Vigilante fraction during recovery
      let vigiFrac = 0;
      if (recovery) {
        vigiFrac = clamp(cfg.vigiMinFrac, cfg.vigiMinFrac + penaltyGap * cfg.vigiK, cfg.vigiMaxFrac);
      }

      // Respect share (base)
      let respectShare = cfg.normalRespectMin;
      if (recovery) {
        respectShare = cfg.recoveryRespectShare;
      } else {
        const denom = cfg.normalHeadroomHi - cfg.normalHeadroomLo;
        const t = denom <= 0 ? 0 : clamp01((cfg.normalHeadroomHi - headroom) / denom);
        respectShare = lerp(cfg.normalRespectMin, cfg.normalRespectMax, t);
      }

      // Territory fraction (base): ramp based on median chance
      let territoryFracBase =
        inEndgame || recovery
          ? 0
          : ramp(
            clash.median,
            cfg.engageMedianMin,
            cfg.territoryFracRampAt,
            cfg.territoryMinFrac,
            cfg.territoryMaxFrac
          );

      // If we're near-capped on territory, taper TW fraction down toward territoryTaperTo
      if (!inEndgame && !recovery && g.territory >= cfg.territoryTaperAt) {
        const t = clamp01((g.territory - cfg.territoryTaperAt) / (cfg.territoryStopAt - cfg.territoryTaperAt));
        const tapered = lerp(territoryFracBase, cfg.territoryTaperTo, t);
        territoryFracBase = Math.min(territoryFracBase, tapered);
      }

      // --- PRELIM decision (used to evaluate gear + next-cost) ---
      // DROP-IN FIX: pass current territory so TW cap only applies during tapering
      const prelimDecision = assignCombatTasksAndTiers(ns, names, cfg, {
        recovery,
        vigiFrac,
        respectShare,
        territoryFrac: territoryFracBase,
        minTrain: dyn.minTrain,
        wantedPenalty: g.wantedPenalty,
        territory: g.territory, // <-- NEW
      });

      // --- Equipment catch-up mode ---
      const catchupInfo = computeEquipCatchup(ns, prelimDecision, cfg);
      equipCatchup = updateCatchupLatch(equipCatchup, catchupInfo, cfg);

      // --- Cash farming mode (NEW) ---
      const cash = ns.getServerMoneyAvailable("home");
      const nextTerrCost = getNextMissingCombatEquipCost(ns, prelimDecision.roster.TERRITORY);
      const nextAnyCost = getNextMissingCombatEquipCost(ns, ns.gang.getMemberNames());
      const nextCost = Math.min(nextTerrCost, nextAnyCost);

      if (!cfg.cashFarm || recovery || inEndgame) {
        cashFarm = false;
      } else if (!cashFarm) {
        // ENTER: in catch-up + can't afford next item while maintaining reserve
        const need = cfg.cashFarmReserve + nextCost + (cfg.cashFarmEnterBuffer || 0);
        if (equipCatchup && Number.isFinite(nextCost) && cash < need) cashFarm = true;
      } else {
        // EXIT: require extra headroom
        const need = cfg.cashFarmReserve + nextCost + (cfg.cashFarmExitBuffer || 0);
        if (!equipCatchup || !Number.isFinite(nextCost) || cash >= need) cashFarm = false;
      }

      // Apply overrides when cash-farming
      const finalRespectShare = cashFarm ? cfg.cashFarmRespectShare : respectShare;
      const finalTerritoryFrac = cashFarm ? cfg.cashFarmTerritoryFrac : territoryFracBase;

      // --- FINAL decision (after cashFarm overrides) ---
      // DROP-IN FIX: pass current territory so TW cap only applies during tapering
      const decision = assignCombatTasksAndTiers(ns, names, cfg, {
        recovery,
        vigiFrac,
        respectShare: finalRespectShare,
        territoryFrac: finalTerritoryFrac,
        minTrain: dyn.minTrain,
        wantedPenalty: g.wantedPenalty,
        territory: g.territory, // <-- NEW
      });

      // Engage/disengage logic (more aggressive than "worst chance")
      // ALSO: never engage while inEndgame, recovery, or cashFarm (if configured).
      if (inEndgame || recovery || (cashFarm && cfg.cashFarmDisableClashes)) {
        engaged = false;
      } else {
        const engageOK =
          clash.median >= cfg.engageMedianMin || clash.countGteNChanceMin >= cfg.engageAtLeastN;
        const disengageBad = clash.median < cfg.disengageMedianMin;

        if (!engaged && engageOK) engaged = true;
        if (engaged && disengageBad) engaged = false;
      }

      if (g.territoryWarfareEngaged !== engaged) {
        ns.gang.setTerritoryWarfare(engaged);
        log(
          ns,
          cfg,
          `[gang] warfare ${engaged ? "ENABLED" : "disabled"} ` +
          `(median=${(clash.median * 100).toFixed(1)}%, gte${Math.round(cfg.engageNChanceMin * 100)}=${clash.countGteNChanceMin})`
        );
      }

      // Ascension (block while engaged if configured)
      if (!(cfg.blockAscendWhenEngaged && engaged)) {
        const ascended = maybeAscendCombat(ns, names, cfg.ascendMult);
        for (const { name, best } of ascended) {
          log(ns, cfg, `[gang] ascended ${name} (best mult gain ~${best.toFixed(2)})`);
        }
      }

      // Equipment buying (catch-up overrides)
      equipState = buyEquipmentForGangRoundRobin(ns, decision, cfg, equipState, equipCatchup);

      // Log member changes
      const changes = diffMemberState(decision.memberStates, lastMemberState);
      for (const line of changes) log(ns, cfg, line);

      // Summary
      const g2 = ns.gang.getGangInformation();
      const summary =
        `[gang] mode=${decision.mode}${cashFarm ? "+CASH" : ""} ` +
        `TRAINEE=${decision.counts.TRAINEE} ` +
        `TERRITORY=${decision.counts.TERRITORY} ` +
        `EARNER=${decision.counts.EARNER} ` +
        `VIGILANTE=${decision.counts.VIGILANTE} ` +
        `| medianClash=${(clash.median * 100).toFixed(1)}% gte${Math.round(cfg.engageNChanceMin * 100)}=${clash.countGteNChanceMin} engaged=${engaged ? "Y" : "N"} ` +
        `| wantedPenalty=${(g2.wantedPenalty * 100).toFixed(2)}% wanted=${g2.wantedLevel.toFixed(0)} ` +
        `| minTrain=${dyn.minTrain} ` +
        `| equipCatchup=${equipCatchup ? "Y" : "N"} terrMin=${(catchupInfo.terrMinPct * 100).toFixed(1)}% anyMin=${(catchupInfo.anyMinPct * 100).toFixed(1)}% ` +
        `| cash=$${(cash / 1e9).toFixed(2)}b next=$${Number.isFinite(nextCost) ? (nextCost / 1e9).toFixed(2) : "n/a"}b reserve=$${(cfg.cashFarmReserve / 1e9).toFixed(1)}b ` +
        `| power=${g2.power.toFixed(2)} territory=${(g2.territory * 100).toFixed(2)}%` +
        (inEndgame ? " [ENDGAME]" : "");

      if (cfg.logMode === "always") {
        ns.print(summary);
      } else if (cfg.logMode === "changes") {
        if (summary !== lastSummary) ns.print(summary);
      }

      lastSummary = summary;

      if (cfg.showRoster && (cfg.logMode === "always" || changes.length > 0)) {
        printRoster(ns, decision);
      }
    } catch (err) {
      ns.print(`ERROR: ${String(err)}`);
    }

    await ns.sleep(cfg.tick);
  }
}

/** Recruit using prefix g01, g02... without touching existing names. Returns list of new names. */
function recruitAll(ns, prefix) {
  const recruited = [];
  const existing = new Set(ns.gang.getMemberNames());
  let i = 1;

  const nextName = () => {
    while (true) {
      const name = `${prefix}${String(i).padStart(2, "0")}`;
      i++;
      if (!existing.has(name)) return name;
    }
  };

  while (ns.gang.canRecruitMember()) {
    const name = nextName();
    if (!ns.gang.recruitMember(name)) break;
    existing.add(name);
    recruited.push(name);
  }

  return recruited;
}

/**
 * Ascend if *combat* multiplier gain is big enough.
 * Returns list of ascended {name, best}.
 */
function maybeAscendCombat(ns, names, ascendMult) {
  const ascended = [];

  for (const n of names) {
    const asc = ns.gang.getAscensionResult(n);
    if (!asc) continue;

    const best = Math.max(asc.str ?? 1, asc.def ?? 1, asc.dex ?? 1, asc.agi ?? 1);
    if (best >= ascendMult) {
      ns.gang.ascendMember(n);
      ascended.push({ name: n, best });
    }
  }

  return ascended;
}

/**
 * Dynamic training target: keep recruits "catching up" as your gang grows.
 * Uses median of members' minCombat and takes ~35% of that, bounded.
 */
function computeDynamicTrainingTarget(ns, cfg, names) {
  if (!names.length) return { minTrain: cfg.minTrainBase };

  const mins = names
    .map((n) => {
      const m = ns.gang.getMemberInformation(n);
      return Math.min(m.str, m.def, m.dex, m.agi);
    })
    .sort((a, b) => a - b);

  const med = mins[Math.floor(mins.length / 2)] ?? 0;
  const scaled = Math.floor(med * 0.35);
  const minTrain = clamp(cfg.minTrainBase, scaled, cfg.minTrainCap);

  return { minTrain };
}

/**
 * Respect picker with wantedPenalty caps:
 * - Choose highest tier by minCombat
 * - Then cap to an allowed maximum tier based on current wantedPenalty
 */
function pickRespectTaskCapped(cfg, minCombat, wantedPenalty) {
  const tiers = cfg.respectTiers || [];
  let chosen = tiers.length ? tiers[0].task : "Mug People";

  for (const t of tiers) {
    if (minCombat >= t.min) chosen = t.task;
    else break;
  }

  // Determine capTask based on wantedPenalty (pick the highest cap we qualify for)
  let capTask = tiers.length ? tiers[0].task : "Mug People";
  const caps = cfg.respectCapsByPenalty || [];

  for (const c of caps) {
    if (wantedPenalty >= c.minPenalty) capTask = c.capTask;
  }

  // Enforce cap by tier order
  const order = new Map(tiers.map((t, i) => [t.task, i]));
  const chosenIdx = order.get(chosen) ?? 0;
  const capIdx = order.get(capTask) ?? 0;
  const finalIdx = Math.min(chosenIdx, capIdx);

  return tiers[finalIdx]?.task ?? chosen;
}

/**
 * Adaptive assignment:
 * - trainees train (hysteresis; dynamic minTrain)
 * - if recovery: assign some vigilantes (WEAKEST first)
 * - territory: strongest slice -> Territory Warfare (aggressive ramp)
 * - earners: remaining -> money, and weakest subset -> respect (auto-tiered + wanted-capped)
 *
 * DROP-IN FIX:
 *  - Previously, territoryKeepMax capped TW count ALWAYS when territoryFrac>0, which forced 2-4 members on TW.
 *  - Now, territoryKeepMax only caps during taper phase (territory >= cfg.territoryTaperAt),
 *    so early/midgame TW scales by territoryFrac as intended.
 */
function assignCombatTasksAndTiers(ns, names, cfg, control) {
  const members = names.map((name) => {
    const m = ns.gang.getMemberInformation(name);
    const minCombat = Math.min(m.str, m.def, m.dex, m.agi);
    const power = m.str + m.def + m.dex + m.agi;
    return { name, minCombat, power };
  });

  const minCombatByName = new Map(members.map((m) => [m.name, m.minCombat]));
  const strongestFirst = [...members].sort((a, b) => b.power - a.power);
  const weakestFirst = [...members].sort((a, b) => a.power - b.power);

  /** @type {Map<string, {task: string, tier: string}>} */
  const memberStates = new Map();

  const counts = { TRAINEE: 0, TERRITORY: 0, EARNER: 0, VIGILANTE: 0 };
  const roster = { TRAINEE: [], TERRITORY: [], EARNER: [], VIGILANTE: [] };

  // Training hysteresis thresholds
  const trainOn = control.minTrain;
  const trainOff = control.minTrain + cfg.trainHysteresis;

  const trainees = new Set();
  for (const { name, minCombat } of weakestFirst) {
    const currentTask = ns.gang.getMemberInformation(name).task;
    const isTrainingNow = currentTask === cfg.trainTask;
    const shouldTrain = isTrainingNow ? minCombat < trainOff : minCombat < trainOn;
    if (shouldTrain) trainees.add(name);
  }

  for (const n of trainees) {
    setTask(ns, n, cfg.trainTask);
    memberStates.set(n, { task: cfg.trainTask, tier: "TRAINEE" });
    counts.TRAINEE++;
    roster.TRAINEE.push(n);
  }

  const pool = strongestFirst.filter(({ name }) => !trainees.has(name));

  // Vigilantes from WEAKEST of pool
  let vigiNeeded = 0;
  if (control.recovery) {
    vigiNeeded = Math.floor(pool.length * control.vigiFrac);
    vigiNeeded = Math.max(0, Math.min(pool.length, vigiNeeded));
  }

  const poolWeakestFirst = [...pool].sort((a, b) => a.power - b.power);
  const vigilantes = new Set(poolWeakestFirst.slice(0, vigiNeeded).map((x) => x.name));

  for (const n of vigilantes) {
    setTask(ns, n, cfg.vigilanteTask);
    memberStates.set(n, { task: cfg.vigilanteTask, tier: "VIGILANTE" });
    counts.VIGILANTE++;
    roster.VIGILANTE.push(n);
  }

  const afterVigi = pool.filter((x) => !vigilantes.has(x.name)); // strongest-first

  // Territory assignment: strongest slice
  let territoryCount = Math.max(0, Math.floor(afterVigi.length * (control.territoryFrac ?? 0)));

  // Always keep at least a small TW presence while we're fighting
  if (!control.recovery && (control.territoryFrac ?? 0) > 0) {
    territoryCount = Math.max(territoryCount, cfg.territoryKeepMin);

    // ONLY cap TW count during taper phase (near endgame),
    // otherwise let fraction-based scaling do its job.
    const territoryNow = Number(control.territory ?? NaN);
    const isTapering = Number.isFinite(territoryNow) && territoryNow >= cfg.territoryTaperAt;

    if (isTapering && cfg.territoryKeepMax != null) {
      territoryCount = Math.min(territoryCount, cfg.territoryKeepMax);
    }
  }

  // Also don't exceed available
  territoryCount = Math.min(territoryCount, afterVigi.length);

  const territorySet = new Set(afterVigi.slice(0, territoryCount).map((x) => x.name));

  for (const { name } of afterVigi) {
    if (territorySet.has(name)) {
      setTask(ns, name, cfg.territoryTask);
      memberStates.set(name, { task: cfg.territoryTask, tier: "TERRITORY" });
      counts.TERRITORY++;
      roster.TERRITORY.push(name);
    }
  }

  const earners = afterVigi.filter((x) => !territorySet.has(x.name));
  const respectCount = Math.max(0, Math.floor(earners.length * control.respectShare));
  const earnersWeakestFirst = [...earners].sort((a, b) => a.power - b.power);
  const respectSet = new Set(earnersWeakestFirst.slice(0, respectCount).map((x) => x.name));

  for (const { name } of earners) {
    let task = cfg.moneyTask;

    if (respectSet.has(name)) {
      const minCombat = minCombatByName.get(name) ?? 0;
      task = pickRespectTaskCapped(cfg, minCombat, control.wantedPenalty ?? 1);
    }

    setTask(ns, name, task);
    memberStates.set(name, { task, tier: "EARNER" });
    counts.EARNER++;
    roster.EARNER.push(name);
  }

  roster.TRAINEE.sort((a, b) => a.localeCompare(b));
  roster.TERRITORY.sort((a, b) => a.localeCompare(b));
  roster.EARNER.sort((a, b) => a.localeCompare(b));
  roster.VIGILANTE.sort((a, b) => a.localeCompare(b));

  const mode = control.recovery
    ? `RECOVERY(v=${counts.VIGILANTE},rs=${control.respectShare.toFixed(2)})`
    : `NORMAL(tw=${counts.TERRITORY},rs=${control.respectShare.toFixed(2)})`;

  return { memberStates, counts, roster, mode };
}

function setTask(ns, memberName, taskName) {
  const m = ns.gang.getMemberInformation(memberName);
  if (m.task === taskName) return;
  ns.gang.setMemberTask(memberName, taskName);
}

/**
 * Returns clash stats across gangs:
 * - median chance
 * - count of gangs >= cfg.engageNChanceMin
 */
function getClashStats(ns, cfg) {
  const others = ns.gang.getOtherGangInformation();
  const chances = [];

  for (const name of Object.keys(others)) {
    const c = ns.gang.getChanceToWinClash(name);
    if (Number.isFinite(c)) chances.push(c);
  }

  chances.sort((a, b) => a - b);

  const median = chances.length ? chances[Math.floor(chances.length / 2)] : 0;
  const countGteNChanceMin = chances.filter((c) => c >= cfg.engageNChanceMin).length;

  return { median, countGteNChanceMin, n: chances.length };
}

/**
 * Compute per-member combat-gear coverage for:
 * - TERRITORY members (min coverage)
 * - all members (min coverage)
 *
 * Coverage is based on items that provide STR/DEF/DEX/AGI stats.
 */
function computeEquipCatchup(ns, decision, cfg) {
  if (!cfg.buyEquip || !cfg.equipCatchup) {
    return { terrMinPct: 1, anyMinPct: 1, totalCombatEquip: 0 };
  }

  const equip = ns.gang
    .getEquipmentNames()
    .map((name) => ({
      name,
      stats: ns.gang.getEquipmentStats(name) || {},
    }))
    .filter(
      (e) =>
        (e.stats.str || 0) > 0 ||
        (e.stats.def || 0) > 0 ||
        (e.stats.dex || 0) > 0 ||
        (e.stats.agi || 0) > 0
    );

  const total = equip.length;
  if (total <= 0) return { terrMinPct: 1, anyMinPct: 1, totalCombatEquip: 0 };

  const pctFor = (member) => {
    const info = ns.gang.getMemberInformation(member);
    const owned = new Set([...(info.upgrades || []), ...(info.augmentations || [])]);

    let have = 0;
    for (const e of equip) if (owned.has(e.name)) have++;
    return have / total;
  };

  const allNames = ns.gang.getMemberNames();
  const terrNames = decision?.roster?.TERRITORY || [];

  let anyMin = 1;
  for (const n of allNames) anyMin = Math.min(anyMin, pctFor(n));

  let terrMin = 1;
  if (terrNames.length > 0) {
    for (const n of terrNames) terrMin = Math.min(terrMin, pctFor(n));
  }

  return { terrMinPct: terrMin, anyMinPct: anyMin, totalCombatEquip: total };
}

/**
 * Latch for catch-up mode:
 * - Enter if under thresholds
 * - Exit only after higher exit thresholds to avoid flapping
 */
function updateCatchupLatch(current, info, cfg) {
  if (!cfg.equipCatchup) return false;

  if (!current) {
    const enter =
      info.terrMinPct < cfg.equipCatchupTerritoryMinPct || info.anyMinPct < cfg.equipCatchupAnyMinPct;
    return enter;
  }

  const exit =
    info.terrMinPct >= cfg.equipCatchupExitTerritoryMinPct &&
    info.anyMinPct >= cfg.equipCatchupExitAnyMinPct;

  return !exit;
}

/**
 * Returns the cheapest missing combat-stat equipment cost for a given list of members.
 * If everyone in the list is fully covered, returns Infinity.
 */
function getNextMissingCombatEquipCost(ns, members) {
  const equip = ns.gang
    .getEquipmentNames()
    .map((name) => ({
      name,
      cost: ns.gang.getEquipmentCost(name),
      stats: ns.gang.getEquipmentStats(name) || {},
    }))
    .filter((e) => e.cost > 0)
    .filter(
      (e) =>
        (e.stats.str || 0) > 0 ||
        (e.stats.def || 0) > 0 ||
        (e.stats.dex || 0) > 0 ||
        (e.stats.agi || 0) > 0
    )
    .sort((a, b) => a.cost - b.cost); // cheapest-first

  if (!equip.length || !members.length) return Infinity;

  let best = Infinity;
  for (const member of members) {
    const info = ns.gang.getMemberInformation(member);
    const owned = new Set([...(info.upgrades || []), ...(info.augmentations || [])]);
    const next = equip.find((e) => !owned.has(e.name));
    if (next) best = Math.min(best, next.cost);
  }

  return best;
}

/**
 * Equipment buying: fair + paced (round-robin across members) + spend-per-minute governor.
 * Catch-up mode temporarily increases buying speed and relaxes minCash.
 * Returns updated state object.
 */
function buyEquipmentForGangRoundRobin(ns, decision, cfg, state, catchupMode) {
  if (!cfg.buyEquip) return state;

  // Apply catch-up overrides (temporary, auto-managed)
  const maxPurchasesPerTick = catchupMode ? cfg.equipCatchupMaxPurchasesPerTick : cfg.equipMaxPurchasesPerTick;
  const maxSpendPerMin = catchupMode ? cfg.equipCatchupMaxSpendPerMin : cfg.equipMaxSpendPerMin;
  const minCash = catchupMode ? cfg.equipCatchupMinCash : cfg.equipMinCash;

  const now = Date.now();
  if (state.spendWindowStart === 0) state.spendWindowStart = now;

  // reset spend window every 60s
  if (now - state.spendWindowStart >= 60_000) {
    state.spendWindowStart = now;
    state.spentThisWindow = 0;
  }

  const cash = ns.getServerMoneyAvailable("home");
  if (cash < minCash) return state;

  // Catch-up should never stall on expensive augs; spend-per-minute is the real brake.
  const budgetTick = catchupMode ? cash : cash * cfg.equipBudget;

  // remaining budget in the spend window
  const budgetWindow = Math.max(0, maxSpendPerMin - state.spentThisWindow);
  const budget = Math.min(budgetTick, budgetWindow);
  if (budget <= 0) return state;

  const equip = ns.gang
    .getEquipmentNames()
    .map((name) => ({
      name,
      cost: ns.gang.getEquipmentCost(name),
      stats: ns.gang.getEquipmentStats(name) || {},
    }))
    .filter((e) => e.cost > 0)
    .filter(
      (e) =>
        (e.stats.str || 0) > 0 ||
        (e.stats.def || 0) > 0 ||
        (e.stats.dex || 0) > 0 ||
        (e.stats.agi || 0) > 0
    )
    // SIMPLE: cheapest-first
    .sort((a, b) => a.cost - b.cost);

  // Prioritize TERRITORY first, then VIGILANTE/EARNER
  const targets = [...decision.roster.TERRITORY, ...decision.roster.VIGILANTE, ...decision.roster.EARNER];
  if (!targets.length || !equip.length) return state;

  // Optional debug: show what the cursor member is missing and whether budget can cover it
  let debugNext = null;
  if (cfg.equipDebug && catchupMode) {
    const debugMember = targets[state.cursor % targets.length];
    const debugInfo = ns.gang.getMemberInformation(debugMember);
    const debugOwned = new Set([...(debugInfo.upgrades || []), ...(debugInfo.augmentations || [])]);
    debugNext = equip.find((e) => !debugOwned.has(e.name)) || null;
  }

  let spent = 0;
  let buys = 0;

  for (let tries = 0; tries < targets.length && buys < maxPurchasesPerTick; tries++) {
    const idx = (state.cursor + tries) % targets.length;
    const member = targets[idx];

    const info = ns.gang.getMemberInformation(member);
    const owned = new Set([...(info.upgrades || []), ...(info.augmentations || [])]);

    for (const e of equip) {
      if (owned.has(e.name)) continue;
      if (spent + e.cost > budget) break;

      if (ns.gang.purchaseEquipment(member, e.name)) {
        spent += e.cost;
        buys += 1;
        ns.print(
          `[equip] ${catchupMode ? "CATCHUP " : ""}${member} <- ${e.name} ($${Math.round(e.cost).toLocaleString()})`
        );
      }

      break; // max one buy per member per tick
    }
  }

  if (cfg.equipDebug && catchupMode && buys === 0 && debugNext) {
    ns.print(
      `[equip-debug] cash=$${Math.round(cash).toLocaleString()} ` +
      `budget=$${Math.round(budget).toLocaleString()} ` +
      `next=${debugNext.name} cost=$${Math.round(debugNext.cost).toLocaleString()}`
    );
  }

  state.spentThisWindow += spent;
  state.cursor = (state.cursor + 1) % targets.length;

  return state;
}

function diffMemberState(newStates, lastState) {
  const lines = [];

  for (const [name, now] of newStates.entries()) {
    const prev = lastState.get(name);
    if (!prev || prev.task !== now.task || prev.tier !== now.tier) {
      lines.push(`[gang] ${name} -> ${now.tier} (${now.task})`);
      lastState.set(name, { task: now.task, tier: now.tier });
    }
  }

  for (const name of [...lastState.keys()]) {
    if (!newStates.has(name)) {
      lines.push(`[gang] ${name} removed from roster`);
      lastState.delete(name);
    }
  }

  return lines;
}

function printRoster(ns, decision) {
  const maxPerLine = 6;

  const fmtTier = (tier) => {
    const names = decision.roster[tier] || [];
    if (!names.length) return `${tier}: (none)`;

    const chunks = [];
    for (let i = 0; i < names.length; i += maxPerLine) {
      chunks.push(names.slice(i, i + maxPerLine).join(", "));
    }

    return `${tier}: ${chunks.join(" | ")}`;
  };

  ns.print(fmtTier("TRAINEE"));
  ns.print(fmtTier("TERRITORY"));
  ns.print(fmtTier("EARNER"));
  ns.print(fmtTier("VIGILANTE"));
}

function log(ns, cfg, line) {
  if (cfg.logMode === "silent") return;
  ns.print(line);
}

function clamp(min, x, max) {
  return Math.max(min, Math.min(max, x));
}

function clamp01(x) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

/**
 * Linearly ramps from outMin..outMax as x moves from inMin..inMax, clamped.
 */
function ramp(x, inMin, inMax, outMin, outMax) {
  if (inMax <= inMin) return outMin;
  const t = clamp01((x - inMin) / (inMax - inMin));
  return lerp(outMin, outMax, t);
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
gang-manager.js

Description:

  Adaptive COMBAT gang automation (slightly aggressive).

  - Maintains wantedPenalty >= 99.5% (recovery latch + proportional vigilantes).
  - Dynamic training threshold so recruits keep up as gang strength grows.
  - Territory Warfare assignment ramped by MEDIAN clash chance.
  - Auto-engages clashes when median chance is decent OR at least N gangs are beatable.
  - Auto-upgrades respect tasks by stats, but caps max tier based on wantedPenalty to prevent thrashing.
  - Endgame: once territory >= 99%, disables warfare and stops territory tasks to monetize.
  - Buys combat equipment with round-robin fairness + spend governor.
  - Automatic equipment CATCH-UP mode increases purchases/spend when under-equipped.
  - NEW: Cash-farming mode pauses TW tasks during catch-up when you can't afford the next big item.

Usage:

  run gang-manager.js [--help] [--tail]
    [--tick 2000]
    [--logMode changes|always|silent]
    [--showRoster true|false]
    [--buyEquip true|false]
    [--equipBudget 0.03]
    [--equipMinCash 1e9]
    [--equipDebug true|false]

Notes:

  - Catch-up and cash-farming are automatic; watch mode tags in the summary: "+CASH".
  - Use --equipDebug to print why purchases are blocked (budget vs next item cost).
`);
}
```
/* == END FILE == */

/* == FILE: bin/intelligence-trainer.js == */
```js
/**
 * bin/intelligence-trainer.js
 *
 * Description
 *  Passive Intelligence XP trainer meant to run as a controller-managed daemon.
 *  Uses a time-slice approach so you still gain INT even if your controller keeps you busy.
 *
 *  Behavior (during INT slice window):
 *   1) If any darkweb programs are missing: createProgram() (INT XP + utility)
 *   2) Otherwise: study "Computer Science" at university
 *  Outside the slice: does nothing (lets controller run your normal work)
 *
 * Notes
 *  - Requires Singularity (Source-File 4).
 *  - Uses ns.singularity.stopAction() at end of slice; controller will re-assert its work next tick.
 *  - By default, does NOT interrupt faction work (set --respectFaction false to allow).
 *
 * Syntax
 *  run bin/intelligence-trainer.js [--help]
 *  run bin/intelligence-trainer.js --periodMin 60 --sliceMin 10
 *  run bin/intelligence-trainer.js --respectFaction false
 *  run bin/intelligence-trainer.js --city Sector-12 --university "Rothman University"
 */

/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],

        // Time slicing
        ["periodMin", 60],        // repeat interval
        ["sliceMin", 10],         // how long to do INT work each period
        ["offsetMin", 0],         // shift schedule (useful if you want it aligned differently)
        ["respectFaction", true], // if true: don't interrupt FACTION work

        // Study settings
        ["city", "Sector-12"],
        ["university", "Rothman University"],

        // Loop cadence
        ["pollMs", 5_000],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    if (!ns.singularity) {
        ns.tprint("ERROR: Requires Singularity (SF4).");
        return;
    }

    const periodMs = Math.max(60_000, Number(flags.periodMin) * 60_000);
    const sliceMs = Math.max(5_000, Number(flags.sliceMin) * 60_000);
    const offsetMs = Math.max(0, Number(flags.offsetMin) * 60_000);
    const pollMs = Math.max(1_000, Number(flags.pollMs) || 5_000);

    const respectFaction = !!flags.respectFaction;
    const city = String(flags.city || "Sector-12");
    const university = String(flags.university || "Rothman University");

    // Track whether *we* started an INT slice so we can stopAction() cleanly at end.
    let sliceActive = false;
    let sliceEndAt = 0;

    while (true) {
        const now = Date.now();

        // Compute whether we should be in the slice window.
        // Window is [windowStart, windowStart + sliceMs) within each period.
        const phase = mod(now - offsetMs, periodMs);
        const shouldSlice = phase < sliceMs;

        // If slice time ended and we were active, stop and let controller resume normal work.
        if (!shouldSlice && sliceActive) {
            try {
                ns.singularity.stopAction();
            } catch { /* ignore */ }
            sliceActive = false;
            sliceEndAt = 0;
            await ns.sleep(pollMs);
            continue;
        }

        // If not in slice window, do nothing.
        if (!shouldSlice) {
            await ns.sleep(pollMs);
            continue;
        }

        // We are in slice window.
        // If respectFaction=true and current work is FACTION, skip the slice (no interruption).
        const work = safe(() => ns.singularity.getCurrentWork(), null);
        if (respectFaction && work && String(work.type || "").toUpperCase() === "FACTION") {
            await ns.sleep(pollMs);
            continue;
        }

        // Mark slice active (so we can stopAction() when leaving the window).
        if (!sliceActive) {
            sliceActive = true;
            // for debugging / optional logging
            sliceEndAt = now + (sliceMs - phase);
            ns.print(`[intTrainer] INT slice started; ends in ${Math.ceil((sliceEndAt - now) / 1000)}s`);
        }

        // During the slice: prefer creating missing programs, else study CS.
        if (tryStartCreateMissingProgram(ns)) {
            await ns.sleep(pollMs);
            continue;
        }

        // Fall back to studying CS
        try { ns.singularity.travelToCity(city); } catch { /* ignore */ }
        const ok = safe(() => ns.singularity.universityCourse(university, "Computer Science", false), false);
        if (!ok) ns.print(`[intTrainer] WARN: failed to start universityCourse at "${university}" in "${city}"`);

        await ns.sleep(pollMs);
    }
}

function tryStartCreateMissingProgram(ns) {
    // If we canâ€™t access darkweb list yet, just return false and study instead.
    const progs = safe(() => ns.singularity.getDarkwebPrograms(), null);
    if (!Array.isArray(progs) || progs.length === 0) return false;

    for (const p of progs) {
        if (!ns.fileExists(p, "home")) {
            const ok = safe(() => ns.singularity.createProgram(p, false), false);
            if (ok) {
                ns.print(`[intTrainer] creating program: ${p}`);
                return true;
            }
            // If createProgram fails (requirements not met), move on to studying.
            return false;
        }
    }
    return false;
}

function safe(fn, fallback) {
    try { return fn(); } catch { return fallback; }
}

// Proper modulo for negative values too
function mod(a, b) {
    const r = a % b;
    return r < 0 ? r + b : r;
}

function printHelp(ns) {
    ns.tprint("bin/intelligence-trainer.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Time-sliced Intelligence XP trainer for controller-managed use.");
    ns.tprint("  During slice window: create missing programs, else study Computer Science.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - Requires Singularity (SF4).");
    ns.tprint("  - Calls stopAction() when leaving slice; controller will resume normal work next tick.");
    ns.tprint("  - By default does not interrupt FACTION work (use --respectFaction false to allow).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run bin/intelligence-trainer.js [--help]");
    ns.tprint("  run bin/intelligence-trainer.js --periodMin 60 --sliceMin 10");
    ns.tprint("  run bin/intelligence-trainer.js --respectFaction false");
    ns.tprint("  run bin/intelligence-trainer.js --city Sector-12 --university \"Rothman University\"");
    ns.tprint("");
    ns.tprint("Flags");
    ns.tprint("  --periodMin <n>         Repeat interval in minutes (default 60)");
    ns.tprint("  --sliceMin <n>          INT slice duration per period (default 10)");
    ns.tprint("  --offsetMin <n>         Shift schedule by minutes (default 0)");
    ns.tprint("  --respectFaction true|false  Don't interrupt faction work (default true)");
    ns.tprint("  --city <name>           City for university (default Sector-12)");
    ns.tprint("  --university <name>     University name (default Rothman University)");
    ns.tprint("  --pollMs <ms>           Loop polling interval (default 5000)");
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/gang/gang-review.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /apps/gang/gang-review.js
  ns.run("/apps/gang/gang-review.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/hacknet/hacknet-manager.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /apps/hacknet/hacknet-manager.js
  ns.run("/apps/hacknet/hacknet-manager.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/hacknet/hacknet-status.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /apps/hacknet/hacknet-status.js
  ns.run("/apps/hacknet/hacknet-status.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/pserv/clean-pservs.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /apps/pserv/clean-pservs.js
  ns.run("/apps/pserv/clean-pservs.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/pserv/list-pservs.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /apps/pserv/list-pservs.js
  ns.run("/apps/pserv/list-pservs.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/pserv/pserv-process-report.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /apps/pserv/pserv-process-report.js
  ns.run("/apps/pserv/pserv-process-report.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/pserv/pserv-ram-upgrade.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /apps/pserv/pserv-ram-upgrade.js
  ns.run("/apps/pserv/pserv-ram-upgrade.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/pserv/pserv-status.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /bin/ui/pserv-status.js
  ns.run("/bin/ui/pserv-status.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/pserv/purchase_server_8gb.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /apps/pserv/purchase_server_8gb.js
  ns.run("/apps/pserv/purchase_server_8gb.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/wse/asset-ui.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /bin/ui/asset-ui.js
  ns.run("/bin/ui/asset-ui.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/legacy-real/wse/stock-snapshot.js == */
```js
export async function main(ns) {
  // Legacy shim: moved to /apps/wse/stock-snapshot.js
  ns.run("/apps/wse/stock-snapshot.js", 1, ...ns.args);
}
```
/* == END FILE == */

/* == FILE: bin/pserv-manager.js == */
```js
/** @param {NS} ns */

// ------------------------------------------------------------
// Flags
// ------------------------------------------------------------
const FLAGS = [
    ["maxRam", 8192],   // Target max RAM per pserv
    ["spendFrac", 0.5], // Max fraction of money to spend per purchase/upgrade
    ["minRam", 8],      // Smallest tier (GB) and purchase size
    ["help", false],
];

export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags(FLAGS);

    // --help handler
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Backwards-compat: allow positional [maxRam] as before
    const positionalMax = flags._[0];
    let maxDesiredRam = Number(positionalMax ?? flags.maxRam);
    let minRam = Number(flags.minRam);
    const spendFraction = Number(flags.spendFrac);

    // Basic sanity clamping
    if (!Number.isFinite(maxDesiredRam) || maxDesiredRam < 8) maxDesiredRam = 8;
    if (!Number.isFinite(minRam) || minRam < 8) minRam = 8;
    if (minRam > maxDesiredRam) minRam = maxDesiredRam;

    // Helper: nice $ formatting using ns.formatNumber
    const fmtMoney = (value) => "$" + ns.formatNumber(value, 2, 1e3);

    // --------------------------------------------------------
    // Build RAM tiers: minRam, minRam*2, ..., up to maxDesiredRam
    // (last tier is always exactly maxDesiredRam)
    // --------------------------------------------------------
    const tiers = [];
    let ram = minRam;
    while (ram < maxDesiredRam) {
        tiers.push(ram);
        ram *= 2;
    }
    if (tiers.length === 0 || tiers[tiers.length - 1] !== maxDesiredRam) {
        tiers.push(maxDesiredRam);
    }

    ns.tprint("[+] pserv-manager started.");
    ns.tprint(`    Min tier / purchase size: ${minRam}GB`);
    ns.tprint(`    Max target RAM per pserv: ${maxDesiredRam}GB`);
    ns.tprint(`    Spend fraction per purchase: ${(spendFraction * 100).toFixed(0)}%`);

    while (true) {
        const limit = ns.getPurchasedServerLimit();
        if (limit <= 0) {
            ns.print("[WARN] Purchased server limit is 0 in this BitNode. Sleeping.");
            await ns.sleep(30000);
            continue;
        }

        const money = ns.getServerMoneyAvailable("home");
        const servers = ns.getPurchasedServers();

        const info = servers
            .map(name => ({
                name,
                ram: ns.getServerMaxRam(name),
            }))
            .sort((a, b) => a.ram - b.ram);

        // ----------------------------------------------------
        // PHASE 1: Buy new 8GB (minRam) pservs until we hit the limit
        // ----------------------------------------------------
        if (servers.length < limit) {
            const purchaseRam = minRam; // ALWAYS buy at minRam in phase 1
            const cost = ns.getPurchasedServerCost(purchaseRam);
            const budget = money * spendFraction;

            if (cost > budget || cost > money) {
                ns.print(
                    `[X] Not enough funds to buy new ${purchaseRam}GB pserv. ` +
                    `Cost=${fmtMoney(cost)}, Budget=${fmtMoney(budget)}, Money=${fmtMoney(money)}. Waiting...`
                );
                await ns.sleep(10000);
                continue;
            }

            const newName = nextServerName(ns);
            const result = ns.purchaseServer(newName, purchaseRam);

            if (result) {
                ns.tprint(
                    `[+] Purchased ${newName} with ${purchaseRam}GB ` +
                    `for ${fmtMoney(cost)}. (${servers.length + 1}/${limit})`
                );
            } else {
                ns.print("[WARN] purchaseServer failed unexpectedly (new server).");
            }

            await ns.sleep(500);
            continue;
        }

        // From here on, servers.length === limit (we're at the cap)
        const smallestRam = info.length > 0 ? info[0].ram : 0;

        // If at limit and all pservs at/above maxDesiredRam, we're done
        if (smallestRam >= maxDesiredRam) {
            ns.print("[OK] All purchased servers at or above target max RAM. Sleeping longer.");
            await ns.sleep(60000);
            continue;
        }

        // ----------------------------------------------------
        // PHASE 2: Tiered upgrades
        //
        // Determine current tier = highest tier for which
        // *all* servers are >= tier.
        // Then target tier is the next one.
        // ----------------------------------------------------
        let currentTierIndex = -1; // -1 means "below the first tier"
        if (info.length > 0) {
            for (let i = 0; i < tiers.length; i++) {
                const tierRam = tiers[i];
                if (info.every(s => s.ram >= tierRam)) {
                    currentTierIndex = i;
                } else {
                    break;
                }
            }
        }

        let nextTierIndex = currentTierIndex + 1;
        if (nextTierIndex >= tiers.length) {
            // All servers are already >= max tier, but we know smallestRam < maxDesiredRam
            // only because maxDesiredRam may have been changed; clamp to last tier.
            nextTierIndex = tiers.length - 1;
        }

        const targetRam = tiers[nextTierIndex];
        const cost = ns.getPurchasedServerCost(targetRam);
        const budget = money * spendFraction; // still useful for logging/insight

        // For Phase 2 upgrades, only block if you *literally* can't afford it.
        // spendFrac is informational here, not a hard cap.
        if (cost > money) {
            ns.print(
                `[X] Not enough funds to reach tier ${targetRam}GB. ` +
                `Cost=${fmtMoney(cost)}, Money=${fmtMoney(money)}. Waiting...`
            );
            await ns.sleep(10000);
            continue;
        } else if (cost > budget) {
            ns.print(
                `[WARN] Upgrade to tier ${targetRam}GB exceeds spendFrac budget ` +
                `(Cost=${fmtMoney(cost)} > Budget=${fmtMoney(budget)}), ` +
                `but proceeding since we have enough money.`
            );
        }

        // ----------------------------------------------------
        // At server limit -> upgrade weakest servers that
        // are below the current target tier.
        //
        // This ensures:
        //   - All servers are brought up to targetRam
        //   - THEN we move up to the next tier
        // ----------------------------------------------------
        const upgradeCandidates = info.filter(s => s.ram < targetRam);

        if (upgradeCandidates.length === 0) {
            // All servers are at/above target tier; next loop will move us to a higher tier.
            ns.print(
                `[X] All servers are at or above current target tier (${targetRam}GB). ` +
                `Advancing tiers soon...`
            );
            await ns.sleep(5000);
            continue;
        }

        const weakest = upgradeCandidates[0];

        if (cost > money) {
            ns.print(
                `[X] Not enough money to upgrade ${weakest.name} ` +
                `from ${weakest.ram}GB -> ${targetRam}GB. Waiting...`
            );
            await ns.sleep(10000);
            continue;
        }

        ns.tprint(
            `[UP] Tier upgrade: ${weakest.name} from ${weakest.ram}GB -> ${targetRam}GB ` +
            `for ${fmtMoney(cost)} (tier=${targetRam}GB).`
        );

        ns.killall(weakest.name);
        ns.deleteServer(weakest.name);
        const result = ns.purchaseServer(weakest.name, targetRam);

        if (!result) {
            ns.print("[WARN] purchaseServer (upgrade) failed unexpectedly.");
        }

        await ns.sleep(500);
    }
}

/** @param {NS} ns */
function nextServerName(ns) {
    const base = "pserv-";
    const existing = new Set(ns.getPurchasedServers());
    let i = 0;
    while (existing.has(base + i)) i++;
    return base + i;
}

// ------------------------------------------------------------
// Minimal HELP: Description, Notes, Syntax
// ------------------------------------------------------------
function printHelp(ns) {
    const script = "/bin/pserv-manager.js";

    ns.tprint("==============================================================");
    ns.tprint(`HELP - ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");

    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Manages your purchased servers (pserv-*), buying and upgrading");
    ns.tprint("  them in RAM tiers while keeping them roughly equal.");
    ns.tprint("");
    ns.tprint("  Phase 1:");
    ns.tprint("    - Buys new pservs at minRam (default 8GB) until you reach");
    ns.tprint("      the purchased server limit.");
    ns.tprint("  Phase 2:");
    ns.tprint("    - Once at the limit, finds the lowest-RAM pserv and upgrades");
    ns.tprint("      it to the next tier (minRam, minRam*2, ..., maxRam).");
    ns.tprint("    - All servers are brought up to a given RAM tier before any");
    ns.tprint("      move to the next tier (e.g., all reach 512GB before any");
    ns.tprint("      go to 1024GB).");
    ns.tprint("");

    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Uses a tier list: minRam, minRam*2, minRam*4, ... up to maxRam.");
    ns.tprint("  - New servers are ALWAYS bought at minRam while under the server limit.");
    ns.tprint("  - When at the server limit, the weakest servers below the");
    ns.tprint("    current target tier are upgraded to that tier.");
    ns.tprint("  - Only spends up to --spendFrac of current funds on a single");
    ns.tprint("    purchase or upgrade (default 0.5 = 50%).");
    ns.tprint("");

    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run /bin/pserv-manager.js");
    ns.tprint("  run /bin/pserv-manager.js <maxRam>");
    ns.tprint("  run /bin/pserv-manager.js --maxRam 16384");
    ns.tprint("  run /bin/pserv-manager.js --maxRam 32768 --spendFrac 0.25");
    ns.tprint("  run /bin/pserv-manager.js --minRam 8");
    ns.tprint("  run /bin/pserv-manager.js --help");
    ns.tprint("");
    ns.tprint("==============================================================");
    ns.tprint("");
}

```
/* == END FILE == */

/* == FILE: bin/startup-home-advanced.js == */
```js
/** @param {NS} ns */

// ------------------------------------------------
// Network helpers
// ------------------------------------------------
function getAllServers(ns) {
  const visited = new Set();
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return Array.from(visited);
}

function countPortCrackers(ns) {
  const programs = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
  ];

  return programs.filter((p) => ns.fileExists(p, "home")).length;
}

function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

function fmtMoney(ns, value) {
  return "$" + ns.formatNumber(value, 2, 1e3);
}

// ------------------------------------------------
// Rooting helpers (FIX: remove botnet/root timing race)
// ------------------------------------------------
function getCrackerFns(ns) {
  const fns = [];

  if (ns.fileExists("BruteSSH.exe", "home")) fns.push((h) => ns.brutessh(h));
  if (ns.fileExists("FTPCrack.exe", "home")) fns.push((h) => ns.ftpcrack(h));
  if (ns.fileExists("relaySMTP.exe", "home")) fns.push((h) => ns.relaysmtp(h));
  if (ns.fileExists("HTTPWorm.exe", "home")) fns.push((h) => ns.httpworm(h));
  if (ns.fileExists("SQLInject.exe", "home")) fns.push((h) => ns.sqlinject(h));

  return fns;
}

/**
 * Returns true if host is rootable *right now* (by your level + crackers).
 */
function isRootableNow(ns, host, crackerCount) {
  const s = ns.getServer(host);

  if (s.hasAdminRights) return false;
  if (host === "home" || host === "darkweb") return false;
  if (s.purchasedByPlayer) return false;

  const reqHack = s.requiredHackingSkill;
  const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

  return reqHack <= ns.getHackingLevel() && reqPorts <= crackerCount;
}

/**
 * Attempt to root all servers that are rootable now.
 * Returns { rooted, attempted } counts.
 */
function rootAllPossible(ns) {
  const servers = getAllServers(ns);
  const crackerFns = getCrackerFns(ns);
  const crackerCount = crackerFns.length;

  let attempted = 0;
  let rooted = 0;

  for (const host of servers) {
    if (!isRootableNow(ns, host, crackerCount)) continue;
    attempted++;

    try {
      // Open whatever ports we can (order doesn't matter)
      for (const fn of crackerFns) {
        try {
          fn(host);
        } catch (_e) {
          /* ignore */
        }
      }

      try {
        ns.nuke(host);
      } catch (_e) {
        /* ignore */
      }

      if (ns.hasRootAccess(host)) rooted++;
    } catch (_e) {
      // Keep going; some servers can still fail if something weird happens.
    }
  }

  return { rooted, attempted };
}

/**
 * Wait until all currently-rootable servers are rooted (or timeout).
 * This is the key fix: prevents botnet from racing rooting.
 */
async function waitForRootCoverage(ns, opts = {}) {
  const timeoutMs = Math.max(1_000, Number(opts.timeoutMs ?? 30_000));
  const pollMs = Math.max(100, Number(opts.pollMs ?? 500));
  const start = Date.now();

  while (true) {
    const servers = getAllServers(ns);
    const crackerCount = countPortCrackers(ns);
    const hackingLevel = ns.getHackingLevel();

    let rootableNow = 0;
    let rootedNow = 0;

    for (const host of servers) {
      const s = ns.getServer(host);

      if (host === "home" || host === "darkweb") continue;
      if (s.purchasedByPlayer) continue;

      const reqHack = s.requiredHackingSkill;
      const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

      if (reqHack <= hackingLevel && reqPorts <= crackerCount) {
        rootableNow++;
        if (s.hasAdminRights) rootedNow++;
      }
    }

    // If everything we can root right now is rooted, we're good.
    if (rootedNow >= rootableNow) return true;
    if (Date.now() - start > timeoutMs) return false;

    await ns.sleep(pollMs);
  }
}

// ------------------------------------------------
// Formulas.exe helpers (auto-detect + safe fallback)
// ------------------------------------------------
function hasFormulas(ns) {
  try {
    return (
      ns.fileExists("Formulas.exe", "home") &&
      ns.formulas &&
      ns.formulas.hacking &&
      typeof ns.formulas.hacking.hackTime === "function"
    );
  } catch (_e) {
    return false;
  }
}

function getHackTimeAndChance(ns, host) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(host),
      chance: ns.hackAnalyzeChance(host),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(host);

  s.hackDifficulty = s.minDifficulty;
  s.moneyAvailable = Math.max(1, s.moneyMax || 0);

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    chance: ns.formulas.hacking.hackChance(s, player),
    usingFormulas: true,
  };
}

// ------------------------------------------------
// MONEY/sec SCORING (for main batch target)
// ------------------------------------------------
function getScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  const MIN_MONEY_ABS = 1_000_000;
  const MIN_HACK_RATIO = 0.02;

  const EXCLUDED = new Set([
    "home",
    "darkweb",
    "n00dles",
    "foodnstuff",
    "sigma-cosmetics",
    "joesguns",
    "harakiri-sushi",
    "hong-fang-tea",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue;

    const s = ns.getServer(host);

    const reqHack = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
    const maxMoney = s.moneyMax;
    const minSec = s.minDifficulty || 1;

    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;
    if (!maxMoney || maxMoney < MIN_MONEY_ABS) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);
    if (hackRatio < MIN_HACK_RATIO) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const moneyPerSec = maxMoney / tHack;
    const secPenalty = 1 + (minSec - 1) / 100;

    let bandBonus;
    if (hackRatio < 0.2) bandBonus = 0.7;
    else if (hackRatio <= 0.8) bandBonus = 1.0;
    else bandBonus = 0.85;

    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1);
    const score = (moneyPerSec * bandBonus * chanceModifier) / secPenalty;

    scored.push({
      host,
      maxMoney,
      minSec,
      tHack,
      score,
      reqHack,
      chance,
      moneyPerSec,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function choosePrimaryTarget(ns) {
  const scored = getScoredServers(ns);

  if (scored.length === 0) {
    ns.tprint("[?] No juicy advanced target found with current filters.");
    ns.tprint("   Falling back to n00dles.");
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   ðŸ’° Juiciest Advanced Target (v4: tuned money/sec)");
  ns.tprint("=======================================");
  ns.tprint(`ðŸŽ¯ Host:       ${best.host}`);
  ns.tprint(`ðŸ’¸ Max Money:  ${fmtMoney(ns, best.maxMoney)}`);
  ns.tprint(`ðŸ§  Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`ðŸŽ¯ Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`ðŸ›¡ MinSec:     ${best.minSec.toFixed(2)}`);
  ns.tprint(`[TIME] Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`ðŸ’° Money/sec:  ${fmtMoney(ns, best.moneyPerSec * 1000)}`);
  ns.tprint(`ðŸ“ˆ Score:      ${best.score.toExponential(3)}`);

  const topN = Math.min(5, scored.length);

  ns.tprint("=======================================");
  ns.tprint("   ðŸ† Top Candidates (by money/sec)");
  ns.tprint("=======================================");

  for (let i = 0; i < topN; i++) {
    const h = scored[i];
    ns.tprint(
      `${i + 1}. ${h.host} | ` +
      `Score=${h.score.toExponential(2)} | ` +
      `Money=${fmtMoney(ns, h.maxMoney)} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `Sec=${h.minSec.toFixed(1)} | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}% | ` +
      `$/sec=${fmtMoney(ns, h.moneyPerSec * 1000)}`
    );
  }

  return { target: best.host, scored };
}

// ------------------------------------------------
// XP SCORING (for HGW farm target - tweaked)
// ------------------------------------------------
function getXpScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  const EXCLUDED = new Set(["home", "darkweb", ...extraExcluded]);
  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue;

    const s = ns.getServer(host);
    const reqHack = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);

    let bandBonus;
    if (hackRatio < 0.4) bandBonus = 0.5;
    else if (hackRatio <= 1.2) bandBonus = 1.1;
    else if (hackRatio <= 1.6) bandBonus = 1.0;
    else bandBonus = 0.7;

    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1);
    const baseXpScore = (reqHack * chanceModifier) / Math.pow(tHack, 1.2);
    const score = baseXpScore * bandBonus;

    scored.push({
      host,
      score,
      reqHack,
      chance,
      tHack,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function chooseXpTarget(ns, primary) {
  const scored = getXpScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("[?] No distinct XP-optimized HGW target found.");
    ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    return "n00dles";
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   ðŸ§  XP-Optimized HGW Target (tweaked)");
  ns.tprint("=======================================");
  ns.tprint(`ðŸŽ¯ Host:       ${best.host}`);
  ns.tprint(`ðŸ§  Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`ðŸŽ¯ Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`[TIME] Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`ðŸ“ˆ XP Score:   ${best.score.toExponential(3)}`);
  ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

  const topN = Math.min(5, scored.length);

  ns.tprint("=======================================");
  ns.tprint("   ðŸ§  Top XP Candidates");
  ns.tprint("=======================================");

  for (let i = 0; i < topN; i++) {
    const h = scored[i];
    ns.tprint(
      `${i + 1}. ${h.host} | ` +
      `XPScore=${h.score.toExponential(2)} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}%`
    );
  }

  return best.host;
}

function chooseSecondaryTarget(ns, primary) {
  const scored = getScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("[?] No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  ns.tprint(`ðŸ’° Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ------------------------------------------------------------
// MAIN (RAM-aware, prioritized launcher)
// ------------------------------------------------------------
export async function main(ns) {
  ns.disableLog("ALL");

  const formulasAvailable = hasFormulas(ns);

  ns.tprint(
    formulasAvailable
      ? "Formulas.exe detected - using formulas-based times/chance where possible."
      : "Formulas.exe not detected - using built-in timing/scoring APIs."
  );

  const flags = ns.flags([
    ["hgw", "money"], // "xp" or "money" for HGW mode
    ["extras", ""], // comma/space separated extras: "pserv", "hacknet", "ui", "all"
    ["help", false], // show help and exit
  ]);

  if (flags.help) {
    printHelp(ns);
    return;
  }

  const hgwMode = String(flags.hgw ?? "money").toLowerCase();
  const extrasRaw = String(flags.extras || "").toLowerCase();

  const extrasTokens = extrasRaw
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const extrasSet = new Set();

  for (const token of extrasTokens) {
    if (token === "all" || token === "*") {
      extrasSet.add("pserv");
      extrasSet.add("hacknet");
      extrasSet.add("ui");
      continue;
    }

    if (["pserv", "pservs", "pserver", "pservers"].includes(token)) {
      extrasSet.add("pserv");
      continue;
    }

    if (["hacknet", "hn"].includes(token)) {
      extrasSet.add("hacknet");
      continue;
    }

    if (["ui", "dashboard", "ops"].includes(token)) {
      extrasSet.add("ui");
      continue;
    }
  }

  const wantPserv = extrasSet.has("pserv");
  const wantHacknet = extrasSet.has("hacknet");
  const wantUi = extrasSet.has("ui");

  const homeMaxRam = ns.getServerMaxRam("home");
  const pservs = ns.getPurchasedServers();

  let minPservRam = 0;

  if (pservs.length > 0) {
    minPservRam = Infinity;
    for (const host of pservs) {
      const r = ns.getServerMaxRam(host);
      if (r < minPservRam) minPservRam = r;
    }
  }

  const HOME_RAM_RESERVE = (() => {
    const max = homeMaxRam;
    return Math.min(128, Math.max(8, Math.floor(max * 0.1)));
  })();

  const PSERV_TARGET_RAM = (() => {
    if (homeMaxRam < 128) return 32;
    if (homeMaxRam < 256) return 64;
    if (homeMaxRam < 512) return 128;
    if (homeMaxRam < 1024) return 256;
    if (homeMaxRam < 2048) return 512;
    return 1024;
  })();

  const USE_LOW_RAM_MODE = homeMaxRam < 128 && (pservs.length === 0 || minPservRam < 64);

  ns.tprint(
    USE_LOW_RAM_MODE
      ? `Low-RAM batch mode ENABLED for timed-net-batcher2.js (home=${homeMaxRam.toFixed(
        1
      )}GB, min pserv=${minPservRam || 0}GB).`
      : `Full batch mode (no --lowram) for timed-net-batcher2.js (home=${homeMaxRam.toFixed(
        1
      )}GB, min pserv=${minPservRam || 0}GB).`
  );

  const override = flags._[0] || null;

  let batchTarget;
  let hgwTarget;

  if (override) {
    batchTarget = override;
    ns.tprint(`STARTUP-HOME: Manual override batch target: ${batchTarget}`);
  } else {
    const { target: autoTarget } = choosePrimaryTarget(ns);
    batchTarget = autoTarget || "n00dles";
    ns.tprint(`STARTUP-HOME: Auto-selected batch target: ${batchTarget}`);
  }

  if (hgwMode === "money") {
    ns.tprint("HGW Mode: MONEY");
    hgwTarget = chooseSecondaryTarget(ns, batchTarget);
  } else {
    ns.tprint("HGW Mode: XP");
    hgwTarget = chooseXpTarget(ns, batchTarget);
  }

  ns.tprint(`BATCH TARGET (money):      ${batchTarget}`);
  ns.tprint(`HGW TARGET (${hgwMode.toUpperCase()}): ${hgwTarget}`);

  // Kill everything on home except:
  //  - this startup script
  //  - corp/agri-structure.js
  //  - corp/agri-inputs.js
  //  - corp/agri-sales.js
  ns.tprint(
    "STARTUP-HOME: Killing all processes on home " +
    "(except startup and bootstrap.js)."
  );

  const myPid = ns.pid;

  // Keep bootstrap AND controller safe from being killed by startup-home-advanced.
  const keepFiles = new Set([
    "bin/bootstrap.js",
    "bin/controller.js",
  ]);

  const processes = ns.ps("home");

  for (const p of processes) {
    if (p.pid === myPid) continue;
    if (keepFiles.has(p.filename)) continue;
    ns.kill(p.pid);
  }


  await ns.sleep(200);

  ns.tprint("Home is clean. Proceeding with rooting + relaunch.");

  // --------------------------------------------------
  // FIX: root first (so batcher + botnet don't race it)
  // --------------------------------------------------
  const before = rootAllPossible(ns);

  ns.tprint(`ROOT PASS: rooted=${before.rooted}/${before.attempted} newly-rootable targets (attempted).`);

  // Optional: if you still want bin/root-and-deploy.js to do copying/backdoor/etc
  // we can start it, but we no longer *depend* on it for initial rooting.
  if (ns.fileExists("bin/root-and-deploy.js", "home")) {
    const pid = ns.exec("bin/root-and-deploy.js", "home", 1);
    if (pid === 0) ns.tprint("WARN: Failed to launch bin/root-and-deploy.js (continuing).");
    else ns.tprint(`Started ROOT + DEPLOY daemon (pid ${pid}).`);
  } else {
    ns.tprint("WARN: bin/root-and-deploy.js missing; relying on startup rooting pass only.");
  }

  // Keep trying briefly in case you just bought a cracker / leveled / etc.
  const ok = await waitForRootCoverage(ns, { timeoutMs: 20_000, pollMs: 500 });

  if (!ok) ns.tprint("WARN: Root coverage not complete within timeout. Continuing anyway.");
  else ns.tprint("Root coverage OK: all currently-rootable servers are rooted.");

  // --------------------------------------------------
  // RAM-aware scheduler
  // --------------------------------------------------
  function cost(script, threads = 1) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`Missing script (skipping in plan): ${script}`);
      return Infinity;
    }

    return ns.getScriptRam(script, "home") * threads;
  }

  const maxRam = homeMaxRam;
  const budget = maxRam - HOME_RAM_RESERVE;
  let usedPlanned = ns.getServerUsedRam("home");

  // 1) Launch MONEY BATCHER (now target should be rooted)
  const batcherArgs = USE_LOW_RAM_MODE ? [batchTarget, "--lowram"] : [batchTarget];
  const batcherRamCost = cost("bin/timed-net-batcher2.js", 1);

  if (isFinite(batcherRamCost)) {
    if (batcherRamCost > maxRam) {
      ns.tprint(
        "MONEY BATCHER (bin/timed-net-batcher2.js) alone needs " +
        `${batcherRamCost.toFixed(1)}GB, which exceeds home RAM (${maxRam.toFixed(1)}GB).`
      );
    } else {
      const pid = ns.exec("bin/timed-net-batcher2.js", "home", 1, ...batcherArgs);

      if (pid === 0) ns.tprint("Failed to launch MONEY BATCHER (bin/timed-net-batcher2.js).");
      else {
        usedPlanned = ns.getServerUsedRam("home");
        ns.tprint(`Started REQUIRED MONEY BATCHER (pid ${pid}) ${JSON.stringify(batcherArgs)}`);
      }
    }
  }

  // 2) Launch BOTNET after rooting is handled (FIX)
  // NOTE: This is the big race fix vs your old ordering.
  {
    const botnetRam = cost("bin/botnet-hgw-sync.js", 1);

    if (isFinite(botnetRam)) {
      const futureUsed = usedPlanned + botnetRam;

      if (futureUsed > budget) {
        ns.tprint(`Skipping BOTNET HGW SYNC - would exceed budget ${futureUsed.toFixed(1)}GB > ${budget.toFixed(1)}GB`);
      } else {
        const pid = ns.exec("bin/botnet-hgw-sync.js", "home", 1, hgwTarget, hgwMode);

        if (pid === 0) ns.tprint("Failed to launch BOTNET HGW SYNC (bin/botnet-hgw-sync.js).");
        else {
          usedPlanned = ns.getServerUsedRam("home");
          ns.tprint(`Started BOTNET HGW SYNC (pid ${pid}) [${hgwTarget}, ${hgwMode}]`);
        }
      }
    }
  }

  // 3) Optional extras
  const plan = [];

  if (wantPserv) {
    plan.push({
      name: "bin/pserv-manager.js",
      threads: 1,
      args: [PSERV_TARGET_RAM],
      label: "PSERV MANAGER",
    });
  }

  if (wantHacknet) {
    plan.push({
      name: "hacknet/hacknet-smart.js",
      threads: 1,
      args: [],
      label: "HACKNET SMART",
    });
  }

  if (wantUi) {
    plan.push({
      name: "DISABLED:bin/ui/ops-dashboard.js",
      threads: 1,
      args: [batchTarget],
      label: "OPS DASHBOARD (one-shot)",
    });
  }

  for (const job of plan) {
    const jobRam = cost(job.name, job.threads);
    if (!isFinite(jobRam)) continue;

    const futureUsed = usedPlanned + jobRam;

    if (futureUsed > budget) {
      ns.tprint(
        `Skipping ${job.label} (${job.name}) - would exceed budget ` + `${futureUsed.toFixed(1)}GB > ${budget.toFixed(1)}GB`
      );
      continue;
    }

    const pid = ns.exec(job.name, "home", job.threads, ...(job.args || []));

    if (pid === 0) ns.tprint(`Failed to launch ${job.label} (${job.name}).`);
    else {
      usedPlanned = ns.getServerUsedRam("home");
      ns.tprint(`Started ${job.label} (pid ${pid}) ${job.args?.length ? JSON.stringify(job.args) : ""}`);
    }
  }

  // Give botnet-hgw-sync time to deploy HGW scripts before showing status
  await ns.sleep(5000);

  if (ns.fileExists("/botnet/botnet-hgw-status.js", "home")) {
    const pid = ns.exec("/botnet/botnet-hgw-status.js", "home", 1);
    if (pid === 0) ns.tprint("Failed to launch BOTNET STATUS after deployment delay.");
    else ns.tprint(`Started BOTNET STATUS (pid ${pid}) after deployment delay.`);
  } else {
    ns.tprint("BOTNET STATUS script not found on home.");
  }

  ns.tprint(
    "STARTUP-HOME COMPLETE - automation online. " +
    `Home RAM: ${maxRam.toFixed(1)}GB, reserve: ${HOME_RAM_RESERVE.toFixed(1)}GB.`
  );
}

// --------------------------------------------------
// Help Function
// --------------------------------------------------
function printHelp(ns) {
  ns.tprint("bin/startup-home-advanced.js");
  ns.tprint("");

  ns.tprint("Description");
  ns.tprint("  Advanced home startup/launcher.");
  ns.tprint("  Picks a batch target, chooses an HGW target for XP or money,");
  ns.tprint("  kills existing scripts on home (except itself and corp/agri-* helpers),");
  ns.tprint("  ROOTS all currently-rootable servers (fixes ordering/race), then launches:");
  ns.tprint("    - bin/timed-net-batcher2.js");
  ns.tprint("    - bin/botnet-hgw-sync.js");
  ns.tprint("  Optionally launches bin/root-and-deploy.js as a daemon for extra deploy work.");
  ns.tprint("  Optional extras via --extras:");
  ns.tprint("    - bin/pserv-manager.js");
  ns.tprint("    - hacknet/hacknet-smart.js");
  ns.tprint("    - ui/ops-dashboard.js (one-shot dashboard)");
  ns.tprint("");

  ns.tprint("Notes");
  ns.tprint("  - Safe to rerun; it will re-kill and restart your core automation.");
  ns.tprint("  - Uses Formulas.exe automatically when present for target scoring.");
  ns.tprint("  - Auto-enables timed-net-batcher2 --lowram mode on very small setups.");
  ns.tprint("  - Fix: rooting happens before botnet/batcher start to prevent race errors.");
  ns.tprint("");

  ns.tprint("Syntax");
  ns.tprint("  run bin/startup-home-advanced.js");
  ns.tprint("  run bin/startup-home-advanced.js --extras pserv");
  ns.tprint("  run bin/startup-home-advanced.js --extras pserv,hacknet,ui");
  ns.tprint("  run bin/startup-home-advanced.js --extras all");
  ns.tprint("  run bin/startup-home-advanced.js omega-net");
  ns.tprint("  run bin/startup-home-advanced.js --hgw xp");
  ns.tprint("  run bin/startup-home-advanced.js omega-net --hgw money --extras ui");
  ns.tprint("  run bin/startup-home-advanced.js --help");
}
```
/* == END FILE == */

/* == FILE: bin/timed-net-batcher2.js == */
```js
// Global health thresholds (more relaxed)
const MONEY_THRESHOLD = 0.90; // Accept 90%+ money in normal mode
const SEC_TOLERANCE = 0.90; // Allow some security above min

// Softer thresholds for low-RAM mode
const LOWRAM_MONEY_THRESHOLD = 0.90; // Accept 90%+ money
const LOWRAM_SEC_TOLERANCE = 1.50; // Allow more security drift

// Interval for status + profit summaries
const STATUS_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Each batch will only try to use this fraction of *currently free* RAM.
const BATCH_RAM_FRACTION = 0.9; // 90% of free RAM per batch

// Target hack fraction per money batch (aggressive, but capped)
const TARGET_HACK_FRACTION = 0.10; // Aim to hack ~10% money per batch
const MAX_HACK_FRACTION = 0.30; // Never hack more than 30% per batch

// Prep behavior
const WEAKEN_FIRST_DELTA = 5; // If secDelta > this, do weaken-only prep

// Hot-reload thresholds
const PSERV_MIN_TOTAL_RAM = 64; // below this => home-only mode
const FLEET_REFRESH_MS = 5_000; // how often to rescan pserv fleet
const FLEET_STABLE_MS = 8_000; // hysteresis: must remain above/below threshold this long to switch

// Simple formatter wrapper for money values
function fmtMoney(ns, value) {
  return "$" + ns.formatNumber(value, 2, 1e3);
}

// ------------------------------------------------
// Home RAM reserve helper (shared by both modes)
// ------------------------------------------------
function getHomeReserve(ns) {
  const max = ns.getServerMaxRam("home");
  // 10% of home, clamped between 8GB and 128GB
  return Math.min(128, Math.max(8, Math.floor(max * 0.10)));
}

// ------------------------------------------------
// Formulas.exe helpers
// ------------------------------------------------
function hasFormulas(ns) {
  try {
    return (
      ns.fileExists("Formulas.exe", "home") &&
      ns.formulas &&
      ns.formulas.hacking &&
      typeof ns.formulas.hacking.hackTime === "function"
    );
  } catch (_e) {
    return false;
  }
}

/**
 * Compute hack/grow/weaken times.
 * - assumePrepped=true  => min security + max money
 * - assumePrepped=false => CURRENT server state
 *
 * Uses formulas if available, otherwise falls back to ns.getHack/Grow/WeakenTime.
 */
function getHackGrowWeakenTimes(ns, target, assumePrepped = true) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(target),
      tGrow: ns.getGrowTime(target),
      tWeaken: ns.getWeakenTime(target),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(target);

  if (assumePrepped) {
    s.hackDifficulty = s.minDifficulty;
    s.moneyAvailable = Math.max(1, s.moneyMax || 0);
  } else {
    // Keep current hackDifficulty; ensure moneyAvailable is non-zero
    s.moneyAvailable = Math.max(1, s.moneyAvailable || 0);
  }

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    tGrow: ns.formulas.hacking.growTime(s, player),
    tWeaken: ns.formulas.hacking.weakenTime(s, player),
    usingFormulas: true,
  };
}

// ------------------------------------------------
// HELP
// ------------------------------------------------
function printHelp(ns) {
  const script = "bin/timed-net-batcher2.js";

  ns.tprint("==============================================================");
  ns.tprint(`HELP - ${script}`);
  ns.tprint("==============================================================");
  ns.tprint("");

  ns.tprint("DESCRIPTION");
  ns.tprint("  Advanced timed HWGW batch controller that:");
  ns.tprint("    - Uses Formulas.exe when available for precise timings,");
  ns.tprint("    - Runs multi-batch pipelines in normal mode,");
  ns.tprint("    - Falls back to simpler HOME-only HWGW when pserv capacity is low,");
  ns.tprint("    - HOT-RELOADS purchased server fleet changes (pserv upgrades) without restart.");
  ns.tprint("");

  ns.tprint("NOTES");
  ns.tprint("  - Requires batch/batch-hack.js, batch/batch-grow.js, batch/batch-weaken.js on home.");
  ns.tprint("  - Expects the target to be rooted.");
  ns.tprint("  - --lowram:");
  ns.tprint("      * Uses softer money/security thresholds when prepping.");
  ns.tprint("      * Forces single-batch behavior (no overlap) when applicable.");
  ns.tprint("  - Hot reload:");
  ns.tprint("      * Periodically re-scans purchased servers and SCPs workers to new/changed pservs.");
  ns.tprint("      * Switches between HOME-only and HYBRID mode automatically based on total pserv RAM.");
  ns.tprint("  - Timing:");
  ns.tprint("      * During PREP, uses CURRENT-state hack/grow/weaken times.");
  ns.tprint("      * During MONEY batching, uses PREPPED-state times for tight alignment.");
  ns.tprint("");

  ns.tprint("SYNTAX");
  ns.tprint("  run bin/timed-net-batcher2.js <target>");
  ns.tprint("  run bin/timed-net-batcher2.js <target> --lowram");
  ns.tprint("  run bin/timed-net-batcher2.js <target> --concurrency <n>");
  ns.tprint("  run bin/timed-net-batcher2.js <target> --concurrency 0 --maxconc <n>");
  ns.tprint("  run bin/timed-net-batcher2.js <target> --debug");
  ns.tprint("  run bin/timed-net-batcher2.js --help");
  ns.tprint("");

  ns.tprint("==============================================================");
  ns.tprint("");
}

// ------------------------------------------------
// MAIN
// ------------------------------------------------

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["lowram", false],
    ["help", false],
    ["debug", false],
    ["concurrency", 0], // 0 = auto (based on available RAM)
    ["maxconc", 64], // cap for auto/explicit concurrency
  ]);

  if (flags.help) {
    printHelp(ns);
    return;
  }

  const target = flags._[0];
  const lowRamMode = !!flags.lowram;
  const debug = !!flags.debug;
  const requestedConcurrency = Number(flags.concurrency) || 0; // 0 => auto
  const maxConcurrency = Math.max(1, Math.floor(Number(flags.maxconc) || 64));

  if (!target) {
    ns.tprint("No batch target provided. bin/timed-net-batcher2.js requires a target.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run bin/timed-net-batcher2.js <target>");
    ns.tprint("  run bin/timed-net-batcher2.js <target> --lowram");
    return;
  }

  const hackScript = "workers/hwgw/batch-hack.js";
  const growScript = "workers/hwgw/batch-grow.js";
  const weakenScript = "workers/hwgw/batch-weaken.js";

  for (const s of [hackScript, growScript, weakenScript]) {
    if (!ns.fileExists(s, "home")) {
      ns.tprint(`Missing script on home: ${s}`);
      return;
    }
  }

  // Startup banner
  const usingFormulas = hasFormulas(ns);

  ns.tprint(`Timed HWGW batcher targeting: ${target}`);
  ns.tprint(usingFormulas ? "Using Formulas.exe for batch timing." : "Formulas.exe not detected; using ns.getHack/Grow/WeakenTime.");
  ns.tprint(lowRamMode ? "LOW-RAM MODE enabled." : "Normal mode enabled.");
  ns.tprint(
    `Hot reload enabled: rescan=${(FLEET_REFRESH_MS / 1000).toFixed(1)}s, ` +
      `stable=${(FLEET_STABLE_MS / 1000).toFixed(1)}s, threshold=${PSERV_MIN_TOTAL_RAM}GB`
  );

  const HOME_RAM_RESERVE = getHomeReserve(ns);
  const GAP = 200; // ms

  // Fleet hot-reload state
  // Track SCP state by "host:maxRam" so same-name upgrades re-SCP properly
  const scpDone = new Set();
  const scpKey = (host) => `${host}:${ns.getServerMaxRam(host)}`;

  let lastFleetRefresh = 0;

  // Mode hysteresis state
  let mode = "UNKNOWN"; // "HOME" | "HYBRID"
  let pendingMode = null;
  let pendingSince = 0;

  let lastStatusPrint = 0;

  // Small helper to refresh fleet + SCP new/changed pservs
  const refreshFleet = async () => {
    const purchased = ns.getPurchasedServers();

    let totalPservRam = 0;
    for (const host of purchased) totalPservRam += ns.getServerMaxRam(host);

    for (const host of purchased) {
      const key = scpKey(host);
      if (scpDone.has(key)) continue;

      await ns.scp([hackScript, growScript, weakenScript], host);
      scpDone.add(key);

      ns.print(`Fleet hot-reload: SCP'd batch workers to ${host} (key=${key})`);
    }

    // Clean up old keys for removed servers and old RAM sizes
    const keep = new Set(purchased.map((h) => scpKey(h)));
    for (const key of Array.from(scpDone)) {
      if (!keep.has(key)) scpDone.delete(key);
    }

    return { purchased, totalPservRam };
  };

  const desiredModeFromFleet = (totalPservRam) => {
    return totalPservRam >= PSERV_MIN_TOTAL_RAM ? "HYBRID" : "HOME";
  };

  const updateMode = (desired, now, totalPservRam) => {
    if (mode === "UNKNOWN") {
      mode = desired;
      pendingMode = null;
      pendingSince = 0;

      ns.tprint(
        `Mode set: ${mode === "HYBRID" ? "HYBRID (home+pservs)" : "HOME-only"} (initial) ` +
          `(total pserv RAM=${totalPservRam.toFixed(1)}GB)`
      );
      return;
    }

    if (desired === mode) {
      pendingMode = null;
      pendingSince = 0;
      return;
    }

    if (pendingMode !== desired) {
      pendingMode = desired;
      pendingSince = now;
      ns.print(`Mode change pending: ${mode} -> ${desired} (waiting for stability)`);
      return;
    }

    if (now - pendingSince >= FLEET_STABLE_MS) {
      mode = desired;
      pendingMode = null;
      pendingSince = 0;

      ns.tprint(
        `Mode switched: ${mode === "HYBRID" ? "HYBRID (home+pservs)" : "HOME-only"} ` +
          `(total pserv RAM=${totalPservRam.toFixed(1)}GB)`
      );
    }
  };

  while (true) {
    const now = Date.now();

    if (now - lastFleetRefresh >= FLEET_REFRESH_MS) {
      const fleet = await refreshFleet();
      updateMode(desiredModeFromFleet(fleet.totalPservRam), now, fleet.totalPservRam);
      lastFleetRefresh = now;
    }

    if (now - lastStatusPrint >= STATUS_INTERVAL) {
      printTargetStatus(ns, target);
      lastStatusPrint = now;
    }

    if (mode === "HOME") {
      await runHomeOnlyTick(ns, {
        target,
        hackScript,
        growScript,
        weakenScript,
        lowRamMode,
        debug,
        HOME_RAM_RESERVE,
        GAP,
      });
      continue;
    }

    await runHybridTick(ns, {
      target,
      hackScript,
      growScript,
      weakenScript,
      lowRamMode,
      debug,
      requestedConcurrency,
      maxConcurrency,
      HOME_RAM_RESERVE,
      GAP,
      purchased: ns.getPurchasedServers(),
    });
  }
}

// ------------------------------------------------
// HYBRID tick (one iteration)
// ------------------------------------------------
async function runHybridTick(ns, ctx) {
  const {
    target,
    hackScript,
    growScript,
    weakenScript,
    lowRamMode,
    debug,
    requestedConcurrency,
    maxConcurrency,
    HOME_RAM_RESERVE,
    GAP,
    purchased,
  } = ctx;

  const pservSet = new Set(purchased);
  const hosts = ["home", ...purchased];

  const workers = [];
  let totalFree = 0;

  for (const host of hosts) {
    const maxRam = ns.getServerMaxRam(host);
    const usedRam = ns.getServerUsedRam(host);

    let freeRam = maxRam - usedRam;

    if (host === "home") {
      freeRam = Math.max(0, maxRam - usedRam - HOME_RAM_RESERVE);
    }

    if (freeRam < 0.1) continue;

    workers.push({
      host,
      freeRam,
      isHome: host === "home",
      isPserv: pservSet.has(host),
    });

    totalFree += freeRam;
  }

  const money = ns.getServerMoneyAvailable(target);
  const max = ns.getServerMaxMoney(target);
  const sec = ns.getServerSecurityLevel(target);
  const minSec = ns.getServerMinSecurityLevel(target);

  const moneyRatio = max > 0 ? money / max : 0;
  const secDelta = sec - minSec;

  const moneyThresh = lowRamMode ? LOWRAM_MONEY_THRESHOLD : MONEY_THRESHOLD;
  const secThresh = lowRamMode ? LOWRAM_SEC_TOLERANCE : SEC_TOLERANCE;

  const moneyOk = moneyRatio >= moneyThresh;
  const secOk = secDelta <= secThresh;
  const prepping = !(moneyOk && secOk);

  const times = getHackGrowWeakenTimes(ns, target, !prepping);

  const tHack = times.tHack;
  const tGrow = times.tGrow;
  const tWeaken = times.tWeaken;

  const T = tWeaken + 4 * GAP;
  const cycleTime = T + GAP;

  const delayHack = Math.max(0, T - 3 * GAP - tHack);
  const delayGrow = Math.max(0, T - 2 * GAP - tGrow);
  const delayWeak1 = Math.max(0, T - 1 * GAP - tWeaken);
  const delayWeak2 = Math.max(0, T - tWeaken);

  if (totalFree <= 0) {
    ns.print("No free RAM available for a new batch. Sleeping.");
    await ns.sleep(Math.max(GAP, Math.floor(cycleTime / (lowRamMode ? 1 : 16))));
    return;
  }

  workers.sort((a, b) => b.freeRam - a.freeRam);

  const allowedRam = totalFree * BATCH_RAM_FRACTION;

  const hackRam = ns.getScriptRam(hackScript);
  const growRam = ns.getScriptRam(growScript);
  const weakenRam = ns.getScriptRam(weakenScript);

  let hackThreads = 0;
  let growThreads = 0;
  let weakenThreads = 0;

  if (prepping) {
    const weakenPerThread = ns.weakenAnalyze(1);
    const secPerGrowThread = ns.growthAnalyzeSecurity(1);

    if (secDelta > WEAKEN_FIRST_DELTA) {
      growThreads = 0;
      weakenThreads = weakenPerThread > 0 ? Math.max(1, Math.ceil(secDelta / weakenPerThread)) : 1;
    } else {
      if (moneyRatio < moneyThresh) {
        const growMult = max > 0 && money > 0 ? max / Math.max(1, money) : 2;
        growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target, growMult)));
      } else {
        growThreads = 0;
      }

      const secFromGrow = growThreads * secPerGrowThread;
      const totalSecToRemove = Math.max(0, secDelta) + secFromGrow;

      weakenThreads = weakenPerThread > 0 ? Math.max(1, Math.ceil(totalSecToRemove / weakenPerThread)) : 1;
    }

    let totalRamNeeded = growThreads * growRam + weakenThreads * weakenRam;

    if (totalRamNeeded > allowedRam && totalRamNeeded > 0) {
      const scale = allowedRam / totalRamNeeded;
      growThreads = Math.max(0, Math.floor(growThreads * scale));
      weakenThreads = Math.max(1, Math.floor(weakenThreads * scale));
      totalRamNeeded = growThreads * growRam + weakenThreads * weakenRam;
    }

    ns.print(`Prep batch: G=${growThreads}, W=${weakenThreads} (RAM=${totalRamNeeded.toFixed(1)}GB)`);

    const homeHost = workers.find((w) => w.isHome);
    const nonHome = workers.filter((w) => !w.isHome);
    const gwHosts = homeHost ? [...nonHome, homeHost] : nonHome;

    const launchedW = allocToHosts(ns, gwHosts, weakenScript, target, weakenThreads, 0, tWeaken);
    const launchedG = growThreads > 0 ? allocToHosts(ns, gwHosts, growScript, target, growThreads, 0, tGrow) : 0;

    if (launchedW < weakenThreads) ns.print(`WARN: Only launched W=${launchedW}/${weakenThreads} threads (prep).`);
    if (growThreads > 0 && launchedG < growThreads) ns.print(`WARN: Only launched G=${launchedG}/${growThreads} threads (prep).`);

    if (debug) {
      ns.print(
        `DEBUG: PREP sleeping ${ns.tFormat(tWeaken + 2 * GAP)} ` +
          `(secDelta=${secDelta.toFixed(2)}, money=${(moneyRatio * 100).toFixed(2)}%)`
      );
    }

    await ns.sleep(tWeaken + 2 * GAP);
    return;
  }

  // MONEY batch
  const pctPerHackThread = ns.hackAnalyze(target);

  if (pctPerHackThread > 0) {
    let desiredThreads = Math.floor(TARGET_HACK_FRACTION / pctPerHackThread);
    const maxThreads = Math.floor(MAX_HACK_FRACTION / pctPerHackThread);
    if (maxThreads > 0) desiredThreads = Math.min(desiredThreads, maxThreads);
    hackThreads = Math.max(1, desiredThreads);
  } else {
    hackThreads = 1;
  }

  const growMult = 1 / (1 - TARGET_HACK_FRACTION);
  growThreads = Math.ceil(ns.growthAnalyze(target, growMult));
  if (growThreads < 1) growThreads = 1;

  const secIncHack = ns.hackAnalyzeSecurity(hackThreads);
  const secIncGrow = ns.growthAnalyzeSecurity(growThreads);
  const totalSec = secIncHack + secIncGrow;

  const weakenPerThread = ns.weakenAnalyze(1);
  weakenThreads = weakenPerThread > 0 ? Math.ceil(totalSec / weakenPerThread) : 1;
  if (weakenThreads < 1) weakenThreads = 1;

  let totalRamNeeded =
    hackThreads * hackRam +
    growThreads * growRam +
    weakenThreads * weakenRam * 2;

  if (totalRamNeeded > allowedRam && totalRamNeeded > 0) {
    const scale = allowedRam / totalRamNeeded;

    hackThreads = Math.max(1, Math.floor(hackThreads * scale));
    growThreads = Math.max(1, Math.floor(growThreads * scale));
    weakenThreads = Math.max(1, Math.floor(weakenThreads * scale));

    totalRamNeeded =
      hackThreads * hackRam +
      growThreads * growRam +
      weakenThreads * weakenRam * 2;
  }

  let concurrency = lowRamMode ? 1 : 16;

  if (!lowRamMode) {
    const maxByTiming = Math.max(1, Math.floor(cycleTime / GAP) - 1);

    if (requestedConcurrency > 0) {
      concurrency = clampInt(requestedConcurrency, 1, Math.min(maxConcurrency, maxByTiming));
    } else {
      const ramPerBatch = Math.max(1, totalRamNeeded);
      const maxByRam = Math.max(1, Math.floor(allowedRam / ramPerBatch));
      concurrency = clampInt(maxByRam, 1, Math.min(maxConcurrency, maxByTiming));
    }
  }

  const batchInterval = Math.max(GAP, Math.floor(cycleTime / concurrency));

  ns.print(
    `Money batch: H=${hackThreads}, G=${growThreads}, ` +
      `W1=${weakenThreads}, W2=${weakenThreads} (RAM=${totalRamNeeded.toFixed(1)}GB, conc=${concurrency})`
  );

  const homeHost = workers.find((w) => w.isHome);
  const nonHome = workers.filter((w) => !w.isHome);
  const gwHosts = homeHost ? [...nonHome, homeHost] : nonHome;

  const launchedW1 = allocToHosts(ns, gwHosts, weakenScript, target, weakenThreads, delayWeak1, tWeaken);

  let launchedH = 0;

  if (hackThreads > 0) {
    let remainingH = hackThreads;

    if (homeHost) {
      const launchedHome = allocToHosts(ns, [homeHost], hackScript, target, remainingH, delayHack, tHack);
      launchedH += launchedHome;
      remainingH -= launchedHome;
    }

    if (remainingH > 0) {
      const launchedElsewhere = allocToHosts(ns, nonHome, hackScript, target, remainingH, delayHack, tHack);
      launchedH += launchedElsewhere;
      remainingH -= launchedElsewhere;
    }
  }

  const launchedG = growThreads > 0 ? allocToHosts(ns, gwHosts, growScript, target, growThreads, delayGrow, tGrow) : 0;
  const launchedW2 = allocToHosts(ns, gwHosts, weakenScript, target, weakenThreads, delayWeak2, tWeaken);

  if (launchedW1 < weakenThreads) ns.print(`WARN: Only launched W1=${launchedW1}/${weakenThreads}`);
  if (launchedH < hackThreads) ns.print(`WARN: Only launched H=${launchedH}/${hackThreads}`);
  if (launchedG < growThreads) ns.print(`WARN: Only launched G=${launchedG}/${growThreads}`);
  if (launchedW2 < weakenThreads) ns.print(`WARN: Only launched W2=${launchedW2}/${weakenThreads}`);

  if (debug) {
    ns.print(`DEBUG: batchInterval=${ns.tFormat(batchInterval)} conc=${concurrency}, freeRAM~${totalFree.toFixed(0)}GB`);
  }

  await ns.sleep(batchInterval);
}

// ------------------------------------------------
// HOME-only tick (one iteration)
// ------------------------------------------------
async function runHomeOnlyTick(ns, ctx) {
  const { target, hackScript, growScript, weakenScript, lowRamMode, debug, HOME_RAM_RESERVE, GAP } = ctx;

  const tHack = ns.getHackTime(target);
  const tGrow = ns.getGrowTime(target);
  const tWeaken = ns.getWeakenTime(target);

  const T = tWeaken + 4 * GAP;

  const delayHack = Math.max(0, T - 3 * GAP - tHack);
  const delayGrow = Math.max(0, T - 2 * GAP - tGrow);
  const delayWeak1 = Math.max(0, T - 1 * GAP - tWeaken);
  const delayWeak2 = Math.max(0, T - tWeaken);

  const cycleTime = T + GAP;
  const DESIRED_CONCURRENCY = lowRamMode ? 1 : 8;
  const batchInterval = Math.max(GAP, Math.floor(cycleTime / DESIRED_CONCURRENCY));

  const maxRam = ns.getServerMaxRam("home");
  const usedRam = ns.getServerUsedRam("home");

  let freeRam = maxRam - usedRam - HOME_RAM_RESERVE;
  if (freeRam < 0) freeRam = 0;

  // LowRAM safety: wait for worker scripts to finish (no overlap)
  if (lowRamMode) {
    const procs = ns.ps("home");
    const busy = procs.some(
      (p) => p.filename === hackScript || p.filename === growScript || p.filename === weakenScript
    );

    if (busy) {
      if (debug) ns.print("Home-only lowram: workers still running. Sleeping.");
      await ns.sleep(GAP);
      return;
    }
  }

  const hackRam = ns.getScriptRam(hackScript);
  const growRam = ns.getScriptRam(growScript);
  const weakenRam = ns.getScriptRam(weakenScript);

  const baseHack = 2;
  const baseGrow = 4;
  const baseWeak = 4;

  // Minimum "full batch" RAM footprint (must be fully affordable)
  const ramBase =
    baseHack * hackRam +
    baseGrow * growRam +
    2 * baseWeak * weakenRam;

  // FIX: avoid partial launches
  if (freeRam < ramBase) {
    ns.print(
      `Home-only mode: insufficient free RAM for full batch ` +
        `(free=${freeRam.toFixed(1)}GB, need=${ramBase.toFixed(1)}GB). Sleeping.`
    );
    await ns.sleep(batchInterval);
    return;
  }

  let mult = Math.floor(freeRam / ramBase);
  if (mult < 1) mult = 1;

  const pctPerHackThread = ns.hackAnalyze(target);
  const basePct = baseHack * pctPerHackThread;

  const MAX_HACK_FRACTION_HOME = 0.9;

  if (basePct > 0) {
    const safeMult = Math.floor(MAX_HACK_FRACTION_HOME / basePct);
    if (safeMult > 0 && safeMult < mult) mult = safeMult;
  }

  const hackThreads = Math.max(1, baseHack * mult);
  const growThreads = Math.max(1, baseGrow * mult);
  const weaken1Threads = Math.max(1, baseWeak * mult);
  const weaken2Threads = Math.max(1, baseWeak * mult);

  const ramUsed =
    hackThreads * hackRam +
    growThreads * growRam +
    (weaken1Threads + weaken2Threads) * weakenRam;

  ns.print(
    "Home batch: " +
      `H=${hackThreads}, G=${growThreads}, ` +
      `W1=${weaken1Threads}, W2=${weaken2Threads} ` +
      `(RAM=${ramUsed.toFixed(1)}GB${lowRamMode ? ", lowram" : ""})`
  );

  if (debug) {
    ns.print(
      `DEBUG: home free=${freeRam.toFixed(1)}GB reserve=${HOME_RAM_RESERVE.toFixed(1)}GB ` +
        `ramBase=${ramBase.toFixed(1)}GB mult=${mult}`
    );
  }

  const host = { host: "home", freeRam };

  allocToHosts(ns, [host], weakenScript, target, weaken1Threads, delayWeak1, tWeaken);
  allocToHosts(ns, [host], hackScript, target, hackThreads, delayHack, tHack);
  allocToHosts(ns, [host], growScript, target, growThreads, delayGrow, tGrow);
  allocToHosts(ns, [host], weakenScript, target, weaken2Threads, delayWeak2, tWeaken);

  await ns.sleep(batchInterval);
}

// ------------------------------------------------
// ALLOCATION HELPERS
// ------------------------------------------------

/**
 * Allocate threads for a given script across a list of hosts.
 * Returns the number of threads successfully launched.
 */
function allocToHosts(ns, hosts, script, target, threadsNeeded, delay = 0, extraArg = null) {
  if (threadsNeeded <= 0) return 0;

  const ramPerThread = ns.getScriptRam(script);
  if (ramPerThread <= 0) return 0;

  let launched = 0;

  for (const h of hosts) {
    if (threadsNeeded <= 0) break;
    if (h.freeRam < ramPerThread) continue;

    const maxThreadsHere = Math.floor(h.freeRam / ramPerThread);
    if (maxThreadsHere <= 0) continue;

    const allocate = Math.min(maxThreadsHere, threadsNeeded);

    const pid =
      extraArg == null
        ? ns.exec(script, h.host, allocate, target, delay)
        : ns.exec(script, h.host, allocate, target, delay, extraArg);

    if (pid !== 0) {
      h.freeRam -= allocate * ramPerThread;
      threadsNeeded -= allocate;
      launched += allocate;
    }
  }

  return launched;
}

// ------------------------------------------------
// STATUS HELPERS
// ------------------------------------------------
function printTargetStatus(ns, target) {
  const money = ns.getServerMoneyAvailable(target);
  const max = ns.getServerMaxMoney(target);
  const sec = ns.getServerSecurityLevel(target);
  const minSec = ns.getServerMinSecurityLevel(target);

  const moneyPct = max > 0 ? (money / max) * 100 : 0;
  const secDelta = sec - minSec;

  const now = new Date();
  const ts = now.toLocaleTimeString();

  ns.print("--------------------------------------");
  ns.print(`TARGET STATUS - ${target} @ ${ts}`);
  ns.print(`Money:       ${ns.nFormat(money, "$0.00a")} / ${ns.nFormat(max, "$0.00a")} (${moneyPct.toFixed(2)}%)`);
  ns.print(`Security:    ${sec.toFixed(2)} (min ${minSec.toFixed(2)})  delta=${secDelta.toFixed(2)}`);
  ns.print("--------------------------------------");
}

function clampInt(value, min, max) {
  const v = Math.floor(Number(value) || 0);
  return Math.min(max, Math.max(min, v));
}

```
/* == END FILE == */

/* == FILE: bin/tools/augs.js == */
```js
/**
 * augs.js  (9.35GB)  v1.0.2
 *
 * Sources:
 *      old - https://bitburner.readthedocs.io/en/latest/basicgameplay/factions.html
 *      new - https://github.com/bitburner-official/bitburner-src/blob/70eda40bb64ff6fae5c6aaadb472cc27c72ecd4c/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L589
 **/

/**
 * ANSICodes library  (ANSICodes.js)  v1.0.0
 *
 * A collection of ANSI codes and functions for changing how text in the terminal window is displayed.
 **/
import * as ANSI from "./ANSICodes";
/**
 * BkgRGB: Returns an ANSI string you can print to set the background color of the text which follows to a given RGB color.
 *
 * @callback typeBkgRGB
 * @param		{number}		red				0 - 255; default = 255
 * @param		{number}		green			0 - 255; default = 255
 * @param		{number}		blue			0 - 255; default = 255
 * @return		{string}						An ANSI string to set the RGB background color.
 **/
/**
 * TxtRGB: Returns an ANSI string you can print to set the color of the text which follows to a given RGB color.
 *
 * @callback typeTxtRGB
 * @param		{number}		red				0 - 255; default = 255
 * @param		{number}		green			0 - 255; default = 255
 * @param		{number}		blue			0 - 255; default = 255
 * @returns		{string}						An ANSI string to set the RGB text color.
 **/
/**
 * Strip: Returns the string stripped of any ANSI codes.
 *
 * @callback					typeStrip
 * @param		{string}		txt				Input string.
 * @return		{string}						The given string, but with any ANSI codes removed.
 **/
/**
 * @typedef		{Object}		typeANSI		The type definition object for the types in ANSICodes.js.
 * @property	{typeBkgRGB}	BkgRGB			Returns an ANSI string to set the background color to a given RGB color.
 * @property	{typeStrip}		Strip			Returns the string stripped of any ANSI codes.
 * @property	{typeTxtRGB}	TxtRGB			Returns an ANSI string to set the text color to a given RGB color.
 * @property	{string}		TxtDefault		Default text color
 * @property	{string}		BkgDefault		Default background color
 * @property	{string}		TxtBlack		Black text
 * @property	{string}		BkgBlack		Black background
 * @property	{string}		TxtRed			Red text
 * @property	{string}		BkgRed			Red background
 * @property	{string}		TxtOrange		"Websafe" orange text
 * @property	{string}		BkgOrange		"Websafe" orange background
 * @property	{string}		TxtYellow		Yellow text
 * @property	{string}		BkgYellow		Yellow background
 * @property	{string}		TxtGreen		Green text
 * @property	{string}		BkgGreen		Green background
 * @property	{string}		TxtBlue			Blue text
 * @property	{string}		BkgBlue			Blue background
 * @property	{string}		TxtPurple		"Websafe" purple text
 * @property	{string}		BkgPurple		"Websafe" purple background
 * @property	{string}		TxtMagenta		Magenta text
 * @property	{string}		BkgMagenta		Magenta background
 * @property	{string}		TxtCyan			Cyan text
 * @property	{string}		BkgCyan			Cyan background
 * @property	{string}		TxtWhite		White text
 * @property	{string}		BkgWhite		White background
 * @property	{string}		Bold			Bold text
 * @property	{string}		Faint			Faint text
 * @property	{string}		NormalIntensity	Cancels Bold and Faint text
 * @property	{string}		Italic			Italic text
 * @property	{string}		NotItalic		Cancels italic text
 * @property	{string}		Underline		Underlined text
 * @property	{string}		NoUnderline		Cancels underlined text
 * @property	{string}		Blink			Blinking text
 * @property	{string}		NoBlink			Cancels blinking text
 * @property	{string}		Invert			Inverted text
 * @property	{string}		NotInverted		Cancels inverted text
 * @property	{string}		Invisible		Invisible text
 * @property	{string}		Reveal			Cancels invisible text
 * @property	{string}		Strikethrough	Strikethrough text
 * @property	{string}		NoStrikethrough	Cancels strikethrough text
 * @property	{string}		Reset			Cancels all style and color changes
 **/
/* -- End of ANSICodes types section -- */

/**
 * @param {NS} ns
 **/
export async function main(ns) {
	/**
	 * ANSICodes.js properties and methods.
	 *
	 * @type	{typeANSI}	ansi
	 **/
	const ansi = ANSI;

	/**
	 * sizeTextLeading: Returns the given text sized to len number of characters using leading spaces.
	 *
	 * @param	{string}	txt		The given value to make 'len' characters long.
	 * @param	{number}	len		The length to make the value in characters.
	 * @return	{string}			The resized string.
	 **/
	function sizeTextLeading (txt, len) {
		txt = "" + txt;
		if (len > txt.length) {
			txt = " ".repeat(len - txt.length) + txt;
		}
		return txt;
	}

	/* Main code */
	const valDR  = { true: "", false: ansi.TxtRed };
	const valDRx = { true: "", false: ansi.TxtDefault };
	const factionList = ["CyberSec", "Tian Di Hui", "Netburners",  // Early-game factions
						 "Sector-12", "Chongqing", "New Tokyo", "Ishima", "Aevum", "Volhaven",  // City factions
						 "NiteSec", "The Black Hand", "BitRunners",  // Hacker groups
						 "MegaCorp", "Blade Industries", "Four Sigma", "KuaiGong International", "NWO",  // Megacorporations
						 "OmniTek Incorporated", "ECorp", "Bachman & Associates", "Clarke Incorporated", "Fulcrum Secret Technologies",
						 "Slum Snakes", "Tetrads", "Silhouette", "Speakers for the Dead", "The Dark Army", "The Syndicate",  // Gangs
						 "The Covenant", "Daedalus", "Illuminati",  // Endgame factions
						 "Bladeburners", "Church of the Machine God", "Shadows of Anarchy"];  // BitNode factions
	const megacorps = ["megacorp", "blade", "4sigma", "kuai-gong", "nwo", "omnitek", "ecorp", "b-and-a", "clarkinc", "fulcrumtech"];
	/** @type {Player} */
	const plyr = ns.getPlayer(), factionCount = factionList.length;
	plyr.karma = ns.heart.break();
	var command, i;
	if (ns.args.length > 0) {
		command = ns.args[0];
	}
	var factStatus = Array(factionCount).fill(false);
	if (ns.fileExists("gFactions.txt", "home")) {  // Read stored settings file.
		factStatus = JSON.parse(ns.read("gFactions.txt"));
	}
	while (factStatus.length < factionCount) {  // Add indexes for any missing factions
		factStatus.push(false);
	}
	if ((command > 0) && (command <= factionCount)) {  // Toggle faction based on numbered argument passed to this script.
		factStatus[command - 1] = !factStatus[command - 1];
	}
	if ((command == "clear") || (command == "reset") || (command == "wipe")) {  // Allow user to clear the whole list.
		factStatus = Array(factionCount).fill(false);
	}
	if (command == "all") {  // Allow user to set the whole list.
		factStatus = Array(factionCount).fill(true);
	}
	ns.write("gFactions.txt", JSON.stringify(factStatus), "w");  // Update the stored settings file.

	/**
	 * Can't test these (currently) without the right Source Files:
	 * 		Faction reputation  (with SF4 - ns.singularity.getFactionRep())
	 *
	 * ToDo:
	 * 		Add Shadows of Anarchy
	 * 		Add BitNode factions(?).
	 **/

	// Faction tests
	var doneStatus = Array(factionCount).fill(ansi.TxtRed + " No " + ansi.TxtDefault);
	for (i = 0; i < factionCount; i++) {
		if (factStatus[i]) {
			doneStatus[i] = ansi.TxtGreen + "Done" + ansi.TxtDefault;
		} else if (plyr.factions.includes(factionList[i])) {  // Track if you're in the faction or not.
			factStatus[i] = true;
			doneStatus[i] = ansi.TxtYellow + " In " + ansi.TxtDefault;
		}
	}
	const chiefOfficerTypes = ["Chief Technology Officer", "Chief Financial Officer", "Chief Executive Officer"];
	var jobList = {}, chiefOfficer = false, spook = false, jobs = Object.entries(plyr.jobs);
	for (const [loadedCompanyName, loadedJobName] of jobs) {
		jobList[loadedCompanyName] = loadedJobName;
		if (chiefOfficerTypes.includes(loadedJobName)) {
			chiefOfficer = true;
		}
		if (["CIA", "NSA"].includes(loadedCompanyName)) {
			spook = true;
		}
	}

	// Backdoored server tests
	let CSEC = ansi.TxtRed, avmnite02h = ansi.TxtRed, IIII = ansi.TxtRed, run4theh111z = ansi.TxtRed, fulcrumassets = ansi.TxtRed;
	if (factStatus[0] || ns.getServer("CSEC").backdoorInstalled) {
		CSEC = "";
	} else if (ns.getServerRequiredHackingLevel("CSEC") <= plyr.skills.hacking) {
		CSEC = ansi.TxtYellow;
	}
	CSEC += "Backdoor CSEC" + (CSEC !== "" ? ansi.TxtDefault : "");
	if (factStatus[9] || ns.getServer("avmnite-02h").backdoorInstalled) {
		avmnite02h = "";
	} else if (ns.getServerRequiredHackingLevel("avmnite-02h") <= plyr.skills.hacking) {
		avmnite02h = ansi.TxtYellow;
	}
	avmnite02h += "Backdoor avmnite-02h" + (avmnite02h !== "" ? ansi.TxtDefault : "");
	if (factStatus[10] || ns.getServer("I.I.I.I").backdoorInstalled) {
		IIII = "";
	} else if (ns.getServerRequiredHackingLevel("I.I.I.I") <= plyr.skills.hacking) {
		IIII = ansi.TxtYellow;
	}
	IIII += "Backdoor I.I.I.I" + (IIII !== "" ? ansi.TxtDefault : "");
	if (factStatus[11] || ns.getServer("run4theh111z").backdoorInstalled) {
		run4theh111z = "";
	} else if (ns.getServerRequiredHackingLevel("run4theh111z") <= plyr.skills.hacking) {
		run4theh111z = ansi.TxtYellow;
	}
	run4theh111z += "Backdoor run4theh111z" + (run4theh111z !== "" ? ansi.TxtDefault : "");
	if (factStatus[21] || ns.getServer("fulcrumassets").backdoorInstalled) {
		fulcrumassets = "";
	} else if (ns.getServerRequiredHackingLevel("fulcrumassets") <= plyr.skills.hacking) {
		fulcrumassets = ansi.TxtYellow;
	}
	fulcrumassets += "Backdoor fulcrumassets" + (fulcrumassets !== "" ? ansi.TxtDefault : "");

	// Money tests
	let m1SS = plyr.money >=       1000000;
	let m1TDH = m1SS || factStatus[22];
	m1TDH = valDR[m1TDH] +   "$1m" + valDRx[m1TDH];
	m1SS = m1SS || factStatus[1];
	m1SS = valDR[m1SS] +   "$1m" + valDRx[m1SS];
	let  m10 = plyr.money >=      10000000 || factStatus[27];
	m10  =  valDR[m10] +  "$10m" +  valDRx[m10];
	let m15S12 = plyr.money >=      15000000;
	let m15S = m15S12 || factStatus[24];
	m15S =  valDR[m15S] +  "$15m" +  valDRx[m15S];
	m15S12 = m15S12 || factStatus[3];
	m15S12 =  valDR[m15S12] +  "$15m" +  valDRx[m15S12];
	let m20C = plyr.money >=      20000000;
	let m20NT = m20C ||  factStatus[5];
	m20NT = valDR[m20NT] +  "$20m" + valDRx[m20NT];
	m20C = m20C ||   factStatus[4];
	m20C = valDR[m20C] +  "$20m" + valDRx[m20C];
	let  m30 = plyr.money >=     30000000 ||  factStatus[6];
	m30  =  valDR[m30] +  "$30m" +  valDRx[m30];
	let  m40 = plyr.money >=     40000000 ||  factStatus[7];
	m40  =  valDR[m40] +  "$40m" +  valDRx[m40];
	let  m50 = plyr.money >=     50000000 ||  factStatus[8];
	m50  =  valDR[m50] +  "$50m" +  valDRx[m50];
	let  b75 = plyr.money >=  75000000000 || factStatus[28];
	b75  =  valDR[b75] +  "$75b" +  valDRx[b75];
	let b100 = plyr.money >= 100000000000 || factStatus[29];
	b100 = valDR[b100] + "$100b" + valDRx[b100];
	let b150 = plyr.money >= 150000000000 || factStatus[30];
	b150 = valDR[b150] + "$150b" + valDRx[b150];

	// RAM tests
	let ram32  = ns.getServerMaxRam("home") >=  32 ||  factStatus[9];
	ram32  =  valDR[ram32] + "Home RAM  32GB" +  valDRx[ram32];
	let ram64  = ns.getServerMaxRam("home") >=  64 || factStatus[10];
	ram64  =  valDR[ram64] + "Home RAM  64GB" +  valDRx[ram64];
	let ram128 = ns.getServerMaxRam("home") >= 128 || factStatus[11];
	ram128 = valDR[ram128] + "Home RAM 128GB" + valDRx[ram128];

	// Hacknet totals tests
	let hnLvls = 0, hnRAM = 0, hnCores = 0;
	for (i = 0; i < ns.hacknet.numNodes(); i++) {
		hnLvls  += ns.hacknet.getNodeStats(i).level;
		hnRAM   += ns.hacknet.getNodeStats(i).ram;
		hnCores += ns.hacknet.getNodeStats(i).cores;
	}
	hnLvls  = hnLvls  >= 100 || factStatus[2];
	hnLvls  =  valDR[hnLvls] + "Level 100" +  valDRx[hnLvls];
	hnRAM   = hnRAM   >=   8 || factStatus[2];
	hnRAM   =   valDR[hnRAM] +     "RAM 8" +   valDRx[hnRAM];
	hnCores = hnCores >=   4 || factStatus[2];
	hnCores = valDR[hnCores] +   "Cores 4" + valDRx[hnCores];

	// Hacking tests
	let   h50 = plyr.skills.hacking >=   50 ||  factStatus[1];
	h50   =   valDR[h50] +   "Hacking 50" +   valDRx[h50];
	let   h80 = plyr.skills.hacking >=   80 ||  factStatus[2];
	h80   =   valDR[h80] +   "Hacking 80" +   valDRx[h80];
	let  h100 = plyr.skills.hacking >=  100 || factStatus[25];
	h100  =  valDR[h100] +  "Hacking 100" +  valDRx[h100];
	let  h200 = plyr.skills.hacking >=  200 || factStatus[27];
	h200  =  valDR[h200] +  "Hacking 200" +  valDRx[h200];
	let  h300 = plyr.skills.hacking >=  300 || factStatus[26];
	h300  =  valDR[h300] +  "Hacking 300" +  valDRx[h300];
	let  h850 = plyr.skills.hacking >=  850 || factStatus[28];
	h850  =  valDR[h850] + "Hacking  850" +  valDRx[h850];
	let h1500 = plyr.skills.hacking >= 1500 || factStatus[30];
	h1500 = valDR[h1500] + "Hacking 1500" + valDRx[h1500];
	let h2500 = plyr.skills.hacking >= 2500 || factStatus[29];
	h2500 = valDR[h2500] + "Hacking 2500" + valDRx[h2500];

	// Combat stats tests
	let minCombatStats = Math.min(plyr.skills.agility, plyr.skills.defense, plyr.skills.dexterity, plyr.skills.strength);
	let    minCS30 = minCombatStats >=   30 || factStatus[22];
	minCS30   = valDR[minCS30]     + "All combat stats  30" + valDRx[minCS30];
	let    minCS75 = minCombatStats >=   75 || factStatus[23];
	minCS75   = valDR[minCS75]     + "All combat stats  75" + valDRx[minCS75];
	let   minCS200 = minCombatStats >=  200 || factStatus[27];
	minCS200  = valDR[minCS200]    + "All combat stats 200" + valDRx[minCS200];
	let minCS300SD = minCombatStats >=  300;
	let minCS300DA = minCS300SD || factStatus[26];
	minCS300DA = valDR[minCS300DA] + "All combat stats 300" + valDRx[minCS300DA];
	minCS300SD     = minCS300SD || factStatus[25];
	minCS300SD = valDR[minCS300SD] + "All combat stats 300" + valDRx[minCS300SD];
	let   minCS850 = minCombatStats >=  850 || factStatus[28];
	minCS850  =    valDR[minCS850] + "All combat stats  850" + valDRx[minCS850];
	let  minCS1200 = minCombatStats >= 1200 || factStatus[30];
	minCS1200  =  valDR[minCS1200] + "All combat stats 1200" + valDRx[minCS1200];
	let  minCS1500 = minCombatStats >= 1500 || factStatus[29];
	minCS1500 = valDR[minCS1500]   + "All combat stats 1500" + valDRx[minCS1500];

	// Location tests
	let inlocS12  = plyr.city == "Sector-12";
	let inlocAv   = plyr.city == "Aevum";
	let inlocCh   = plyr.city == "Chongqing";
	let inlocChDA = valDR[inlocCh || factStatus[26]] + "Be in Chongqing" + valDRx[inlocCh || factStatus[26]];
	let inlocNT   = plyr.city == "New Tokyo";
	let inlocIs   = plyr.city == "Ishima";
	let inlocVl   = plyr.city == "Volhaven";
	let inlocSA   = inlocS12 || inlocAv;
	let inlocSAS  = valDR[inlocSA || factStatus[27]] + "Be in Aevum or Sector-12" + valDRx[inlocSA || factStatus[27]];
	let inlocCNI  =  inlocCh || inlocNT || inlocIs;
	let inlocCNIT = inlocCNI || factStatus[23]
	inlocCNIT = valDR[inlocCNIT] + "Be in Chongqing, New Tokyo, or Ishima" + valDRx[inlocCNIT];
	inlocCNI  = valDR[inlocCNI || factStatus[1]] + "Be in Chongqing, New Tokyo, or Ishima" + valDRx[inlocCNI || factStatus[1]];
	inlocS12  = inlocS12 || factStatus[3];
	inlocS12  = valDR[inlocS12] + "Be in Sector-12" + valDRx[inlocS12];
	inlocCh   =  inlocCh || factStatus[4];
	inlocCh   =  valDR[inlocCh] + "Be in Chongqing" +  valDRx[inlocCh];
	inlocNT   =  inlocNT || factStatus[5];
	inlocNT   =  valDR[inlocNT] + "Be in New Tokyo" +  valDRx[inlocNT];
	inlocIs   =  inlocIs || factStatus[6];
	inlocIs   =  valDR[inlocIs] + "Be in Ishima"    +  valDRx[inlocIs];
	inlocAv   =  inlocAv || factStatus[7];
	inlocAv   =  valDR[inlocAv] + "Be in Aevum"     +  valDRx[inlocAv];
	inlocVl   =  inlocVl || factStatus[8];
	inlocVl   =  valDR[inlocVl] + "Be in Volhaven"  +  valDRx[inlocVl];

	// Kills tests
	let kills5  = plyr.numPeopleKilled >=  5 || factStatus[26];
	kills5  =  valDR[kills5] +  "5 people killed" +  valDRx[kills5];
	let kills30 = plyr.numPeopleKilled >= 30 || factStatus[25];
	kills30 = valDR[kills30] + "30 people killed" + valDRx[kills30];

	// Karma tests
	let karma9    = plyr.karma <=  -9 || factStatus[22];
	karma9    =    valDR[karma9] +  "-9 karma" +  valDRx[karma9];
	let karma18   = plyr.karma <= -18 || factStatus[23];
	karma18   =   valDR[karma18] + "-18 karma" + valDRx[karma18];
	let karma22   = plyr.karma <= -22 || factStatus[24];
	karma22   =   valDR[karma22] + "-22 karma" + valDRx[karma22];
	let karma45SD = plyr.karma <= -45;
	let karma45DA =   karma45SD       || factStatus[26];
	karma45DA = valDR[karma45DA] + "-45 karma" + valDRx[karma45DA];
	karma45SD = valDR[karma45SD|| factStatus[25]] + "-45 karma" + valDRx[karma45SD || factStatus[25]];
	let karma90   = plyr.karma <= -90 || factStatus[27];
	karma90   =   valDR[karma90] + "-90 karma" + valDRx[karma90];

	// Job tests
	const coColor = chiefOfficer || factStatus[24] ? ansi.TxtDefault : ansi.TxtRed;
	const spookColor   = !spook         ? ansi.TxtDefault : ansi.TxtRed;
	const spookColorSD = factStatus[25] ? ansi.TxtDefault : spookColor;
	const spookColorDA = factStatus[26] ? ansi.TxtDefault : spookColor;
	const spookColorTS = factStatus[27] ? ansi.TxtDefault : spookColor;
	const workMC  = jobList["MegaCorp"]						|| factStatus[12] ? ansi.TxtDefault : ansi.TxtRed;
	const repMC   = ns.getServer(megacorps[0]).backdoorInstalled ? "3" : "4";
	const workBI  = jobList["Blade Industries"]				|| factStatus[13] ? ansi.TxtDefault : ansi.TxtRed;
	const repBI   = ns.getServer(megacorps[1]).backdoorInstalled ? "3" : "4";
	const workFS  = jobList["Four Sigma"]					|| factStatus[14] ? ansi.TxtDefault : ansi.TxtRed;
	const repFS   = ns.getServer(megacorps[2]).backdoorInstalled ? "3" : "4";
	const workKGI = jobList["KuaiGong International"]		|| factStatus[15] ? ansi.TxtDefault : ansi.TxtRed;
	const repKGI  = ns.getServer(megacorps[3]).backdoorInstalled ? "3" : "4";
	const workNWO = jobList["NWO"]							|| factStatus[16] ? ansi.TxtDefault : ansi.TxtRed;
	const repNWO  = ns.getServer(megacorps[4]).backdoorInstalled ? "3" : "4";
	const workOI  = jobList["OmniTek Incorporated"]			|| factStatus[17] ? ansi.TxtDefault : ansi.TxtRed;
	const repOI   = ns.getServer(megacorps[5]).backdoorInstalled ? "3" : "4";
	const workEC  = jobList["ECorp"]						|| factStatus[18] ? ansi.TxtDefault : ansi.TxtRed;
	const repEC   = ns.getServer(megacorps[6]).backdoorInstalled ? "3" : "4";
	const workBnA = jobList["Bachman & Associates"]			|| factStatus[19] ? ansi.TxtDefault : ansi.TxtRed;
	const repBnA  = ns.getServer(megacorps[7]).backdoorInstalled ? "3" : "4";
	const workCI  = jobList["Clarke Incorporated"]			|| factStatus[20] ? ansi.TxtDefault : ansi.TxtRed;
	const repCI   = ns.getServer(megacorps[8]).backdoorInstalled ? "3" : "4";
	const workFT  = jobList["Fulcrum Technologies"]	|| factStatus[21] ? ansi.TxtDefault : ansi.TxtRed;
	const repFT   = ns.getServer(megacorps[9]).backdoorInstalled ? "3" : "4";

	// City faction tests
	const notInVS12A   = !plyr.factions.includes("Volhaven")  && !plyr.factions.includes("Sector-12") && !plyr.factions.includes("Aevum");
	const notInVICNT   = !plyr.factions.includes("Volhaven")  && !plyr.factions.includes("Ishima")
					  && !plyr.factions.includes("Chongqing") && !plyr.factions.includes("New Tokyo");
	const notInS12AICN = !plyr.factions.includes("Sector-12") && !plyr.factions.includes("Aevum")     && !plyr.factions.includes("Ishima")
					  && !plyr.factions.includes("Chongqing") && !plyr.factions.includes("New Tokyo");
	const niColorS12 = notInVICNT   || factStatus[3] ? ansi.TxtDefault : ansi.TxtRed;
	const niColorC   = notInVS12A   || factStatus[4] ? ansi.TxtDefault : ansi.TxtRed;
	const niColorNT  = notInVS12A   || factStatus[5] ? ansi.TxtDefault : ansi.TxtRed;
	const niColorI   = notInVS12A   || factStatus[6] ? ansi.TxtDefault : ansi.TxtRed;
	const niColorA   = notInVICNT   || factStatus[7] ? ansi.TxtDefault : ansi.TxtRed;
	const niColorV   = notInS12AICN || factStatus[8] ? ansi.TxtDefault : ansi.TxtRed;

	// Augs count tests; NOTE: Daedalus may require more than 30 augments in some BitNodes.  ns.getBitNodeMultipliers().DaedalusAugsRequirement gives the value, but it requires SF 5 or BitNode 5.
	const augs30 = ns.getResetInfo().ownedAugs.size >= 30;
	let augs20TC = (ns.getResetInfo().ownedAugs.size >= 20) || factStatus[28];
	let augs30D  = augs30 || factStatus[29];
	let augs30Il = augs30 || factStatus[30];
	augs20TC = valDR[augs20TC] + "20 augmentations" + valDRx[augs20TC];
	if (augs30D && !factStatus[29]) {
		augs30D  = ansi.TxtYellow + "30+ augmentations" + ansi.TxtDefault;
	} else {
		augs30D  = valDR[augs30D] + "30+ augmentations" + valDRx[augs30D];
	}
	augs30Il = valDR[augs30Il] + "30 augmentations" + valDRx[augs30Il];

	ns.tprint("\n",
		"| " + ansi.TxtWhite + "Done" + ansi.TxtDefault + " | " + ansi.TxtWhite + "##" + ansi.TxtDefault + " | " + ansi.TxtWhite
		 + "Faction Name:" + ansi.TxtDefault + "          | " + ansi.TxtWhite + "Requirements:" + ansi.TxtDefault + "\n",
		ansi.TxtYellow + "Early-game factions:" + ansi.TxtDefault + " |\n",
		"| " +  doneStatus[0] + " | 01 | CyberSec               | " + CSEC + "\n",
		"| " +  doneStatus[1] + " | 02 | Tian Di Hui            | " + m1TDH  + ", " + h50 + ", " + inlocCNI + "\n",
		"| " +  doneStatus[2] + " | 03 | Netburners             | " + h80    + ", Hacknet totals: " + hnLvls + ", " + hnRAM + ", " + hnCores + "\n",
		+ ansi.TxtYellow + "City factions:" + ansi.TxtDefault + " |\n",
		"| " +  doneStatus[3] + " | 04 | Sector-12              | " + m15S12 + ", " + inlocS12 + ", " + niColorS12
		 + "Not in faction Volhaven, Ishima, Chongqing, or New Tokyo\n" + ansi.TxtDefault,
		"| " +  doneStatus[4] + " | 05 | Chongqing              | " + m20C   + ", " +  inlocCh + ", " + niColorC
		 + "Not in faction Volhaven, Sector-12, or Aevum\n" + ansi.TxtDefault,
		"| " +  doneStatus[5] + " | 06 | New Tokyo              | " + m20NT  + ", " +  inlocNT + ", " + niColorNT
		 + "Not in faction Volhaven, Sector-12, or Aevum\n" + ansi.TxtDefault,
		"| " +  doneStatus[6] + " | 07 | Ishima                 | " + m30    + ", " +  inlocIs + ", " + niColorI
		 + "   Not in faction Volhaven, Sector-12, or Aevum\n" + ansi.TxtDefault,
		"| " +  doneStatus[7] + " | 08 | Aevum                  | " + m40    + ", " +  inlocAv + ", " + niColorA
		 + "    Not in faction Volhaven, Ishima, Chongqing, or New Tokyo\n" + ansi.TxtDefault,
		"| " +  doneStatus[8] + " | 09 | Volhaven               | " + m50    + ", " +  inlocVl + ", " + niColorV
		 + " Not in any other city faction\n" + ansi.TxtDefault,
		ansi.TxtYellow + "Hacker groups:" + ansi.TxtDefault + " |\n",
		"| " +  doneStatus[9] + " | 10 | NiteSec                | " +  avmnite02h + ",  " +  ram32 + "\n",
		"| " + doneStatus[10] + " | 11 | The Black Hand         | " +    IIII + ",      " +  ram64 + "\n",
		"| " + doneStatus[11] + " | 12 | BitRunners             | " + run4theh111z + ", " + ram128 + "\n",
		ansi.TxtYellow + "Megacorporations:" + ansi.TxtDefault + " |  " + ansi.TxtBlue
		 + "     (Note: Megacorporations require 100k less rep if their server is backdoored.)\n" + ansi.TxtDefault,
		"| " + doneStatus[12] + " | 13 | MegaCorp               | " + workMC + "Work for MegaCorp" + ansi.TxtDefault + "," + " ".repeat(15)
		 + ansi.TxtYellow + repMC  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[13] + " | 14 | Blade Industries       | " + workBI + "Work for Blade Industries" + ansi.TxtDefault + "," + " ".repeat(7)
		 + ansi.TxtYellow + repBI  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[14] + " | 15 | Four Sigma             | " + workFS + "Work for Four Sigma" + ansi.TxtDefault + "," + " ".repeat(13)
		 + ansi.TxtYellow + repFS  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[15] + " | 16 | KuaiGong International | " + workKGI + "Work for KuaiGong International" + ansi.TxtDefault + ", "
		 + ansi.TxtYellow + repKGI + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[16] + " | 17 | NWO                    | " + workNWO + "Work for NWO" + ansi.TxtDefault + "," + " ".repeat(20)
		 + ansi.TxtYellow + repNWO + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[17] + " | 18 | OmniTek Incorporated   | " + workOI + "Work for OmniTek Incorporated" + ansi.TxtDefault + "," + " ".repeat(3)
		 + ansi.TxtYellow + repOI  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[18] + " | 19 | ECorp                  | " + workEC + "Work for ECorp" + ansi.TxtDefault + "," + " ".repeat(18)
		 + ansi.TxtYellow + repEC  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[19] + " | 20 | Bachman & Associates   | " + workBnA + "Work for Bachman & Associates" + ansi.TxtDefault + "," + " ".repeat(3)
		 + ansi.TxtYellow + repBnA + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[20] + " | 21 | Clarke Incorporated    | " + workCI + "Work for Clarke Incorporated" + ansi.TxtDefault + "," + " ".repeat(4)
		 + ansi.TxtYellow + repCI  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[21] + " | 22 | Fulcrum Technologies   | " + workFT + "Work for Fulcrum Technologies" + ansi.TxtDefault + "," + " ".repeat(3)
		 + ansi.TxtYellow + repFT  + "00k reputation" + ansi.TxtDefault + ", " + fulcrumassets + "\n",
		ansi.TxtYellow + "Gangs:" + ansi.TxtDefault + " |\n",
		"| " + doneStatus[22] + " | 23 | Slum Snakes            | " +   minCS30 + ",                                           " +  m1SS
		 + ",       " + karma9 + "\n",
		"| " + doneStatus[23] + " | 24 | Tetrads                | " +   minCS75 + ",              " +   inlocCNIT + ", " + karma18 + "\n",
		"| " + doneStatus[24] + " | 25 | Silhouette             | " + coColor + "CTO, CFO, or CEO at any company" + ansi.TxtDefault
		 + ",                               " + m15S + ",      " + karma22 + "\n",
		"| " + doneStatus[25] + " | 26 | Speakers for the Dead  | " +  minCS300SD + ", " + h100 + ",                      "    + kills30
		 + ", " +   karma45SD + ", " + spookColorSD + "NOT working for CIA or NSA\n" + ansi.TxtDefault,
		"| " + doneStatus[26] + " | 27 | The Dark Army          | " + minCS300DA + ", " + h300 + ", " +  inlocChDA + ",      " + kills5
		 + ", " +   karma45DA + ", " + spookColorDA + "NOT working for CIA or NSA\n" + ansi.TxtDefault,
		"| " + doneStatus[27] + " | 28 | The Syndicate          | " +   minCS200 + ", " + h200 + ", " +  inlocSAS + ",   " + m10
		 + ",      " + karma90 + ansi.TxtDefault + ", " + spookColorTS + "NOT working for CIA or NSA\n" + ansi.TxtDefault,
		ansi.TxtYellow + "Endgame factions:" + ansi.TxtDefault + " |                     " + ansi.TxtBlue
		 + "(Current number of people killed: " + sizeTextLeading(plyr.numPeopleKilled, 3) + "; karma: "
		 + sizeTextLeading(ns.formatNumber(plyr.karma, 3), 11) + ")\n" + ansi.TxtDefault,
		"| " + doneStatus[28] + " | 29 | The Covenant           |  " + b75 + ", " + augs20TC + ",  " +  h850 + ",   " +   minCS850 + "\n",
		"| " + doneStatus[29] + " | 30 | Daedalus               | " + b100 + ", " + augs30D   + ", " + h2500 + " or " +  minCS1500 + "\n",
		"| " + doneStatus[30] + " | 31 | Illuminati             | " + b150 + ", " + augs30Il + ",  " + h1500 + ",   " +  minCS1200 + "\n",
		ansi.TxtBlue + " (Note: Daedalus may require more than 30 augmentations in some BitNodes.)");
}
```
/* == END FILE == */

/* == FILE: bin/tools/cleanup-everything.js == */
```js
/** @param {NS} ns */
/*
------------------------------------------------------------
 cleanup-everything.js
------------------------------------------------------------
*/

export async function main(ns) {
  ns.disableLog("ALL");

  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const home = "home";

  ns.tprint("ðŸ§¹ CLEANUP EVERYTHING: starting cleanup across entire network...");
  ns.tprint(`ðŸ–¥ Found ${servers.length} servers`);

  // ------------------------------------------------------------
  // 1) Kill EVERYTHING everywhere (except this script)
  // ------------------------------------------------------------
  ns.tprint("ðŸ”ª Killing all scripts on all servers...");
  const myPid = ns.pid;
  for (const s of servers) {
    for (const p of ns.ps(s)) {
      if (s === home && p.pid === myPid) continue;
      ns.kill(p.pid);
    }
  }
  await ns.sleep(200);

  // ------------------------------------------------------------
  // 2) CLEAN NPC SERVERS (ONLY .js)
  // ------------------------------------------------------------
  ns.tprint("ðŸ—‘ Cleaning NPC servers (deleting .js only)...");
  for (const host of servers) {
    if (host === home) continue;
    if (pservs.has(host)) continue;

    await wipeServer(ns, host);
  }

  // ------------------------------------------------------------
  // 3) CLEAN PURCHASED SERVERS (ONLY .js)
  // ------------------------------------------------------------
  ns.tprint("ðŸ—‘ Cleaning purchased servers (deleting .js only)...");
  for (const host of pservs) {
    await wipeServer(ns, host);
  }

  ns.tprint("âœ¨ CLEANUP-EVERYTHING COMPLETE âœ¨");
}

/* ------------------------------------------------------------
   HELPERS
------------------------------------------------------------ */

function getAllServers(ns) {
  const visited = new Set();
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const h of ns.scan(host)) {
      if (!visited.has(h)) queue.push(h);
    }
  }
  return Array.from(visited);
}

// NEW: Delete only .js files
async function wipeServer(ns, host) {
  const files = ns.ls(host);
  let removed = 0;

  for (const f of files) {
    if (isSafeToDelete(f)) {
      ns.rm(f, host);
      removed++;
    }
  }

  ns.tprint(`   - ${host}: removed ${removed} files`);
}

// ONLY delete .js â€” no .txt, no .lit, no contracts
function isSafeToDelete(file) {
  if (file.endsWith(".cct")) return false;
  if (file.startsWith("README")) return false;

  // UPDATED RULE: only remove .js
  return file.endsWith(".js");
}
```
/* == END FILE == */

/* == FILE: bin/tools/connect-path.js == */
```js
/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
    ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }

    if (flags.help || flags._.length === 0) {
        printHelp(ns);
        return;
    }

    const target = flags._[0];

    if (!ns.serverExists(target)) {
        ns.tprint(`ERROR: Server "${target}" does not exist.`);
        return;
    }

    const path = findPath(ns, "home", target);

    if (!path) {
        ns.tprint(`ERROR: No path found to "${target}".`);
        return;
    }

    // Skip "home" and print connect commands
    for (let i = 1; i < path.length; i++) {
        ns.tprint(`connect ${path[i]}`);
    }
}

/**
 * Breadth-first search to find a path between servers
 */
function findPath(ns, start, target) {
    const queue = [[start]];
    const visited = new Set([start]);

    while (queue.length > 0) {
        const path = queue.shift();
        const node = path[path.length - 1];

        if (node === target) {
            return path;
        }

        for (const neighbor of ns.scan(node)) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([...path, neighbor]);
            }
        }
    }

    return null;
}

/**
 * Prints script help text
 */
function printHelp(ns) {
    ns.tprint(`
connect-path.js

DESCRIPTION
  Finds and prints the connection path from home to a target server.

USAGE
  run connect-path.js <server>
  run connect-path.js --help

EXAMPLE
  run connect-path.js nectar-net

OUTPUT
  connect joesguns
  connect nectar-net

NOTES
  - Uses breadth-first search for shortest path
  - Output is formatted for easy copy/paste
  - Does not automatically execute connect commands
`);
}
```
/* == END FILE == */

/* == FILE: bin/tools/deploy-net.js == */
```js
/** /bin/deploy-net.js
 *
 * Deploy /botnet/remote-hgw.js across the network.
 *
 * - Optional positional arg: target hostname to attack.
 * - If no target is given, automatically picks a "best" money server.
 * - Attempts to gain root on each server where possible.
 * - Kills existing scripts on each host, then runs remote-hgw.js there.
 * - Also uses some of home's RAM after deploying to the network.
 *
 * Usage:
 *   run /bin/deploy-net.js
 *   run /bin/deploy-net.js <target>
 *   run /bin/deploy-net.js --help
 *
 * @param {NS} ns
 */
// ------------------------------------------------------------
// Minimal HELP: Description, Notes, Syntax
// ------------------------------------------------------------
function printHelp(ns) {
    const script = "/bin/deploy-net.js";
    ns.tprint("==============================================================");
    ns.tprint(`HELP - ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");
    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Deploys /botnet/remote-hgw.js to all rooted servers with usable RAM,");
    ns.tprint("  auto-selecting a good money target if none is specified.");
    ns.tprint("");
    ns.tprint("  For each non-home server it will:");
    ns.tprint("    - Attempt to gain root access using available port crackers;");
    ns.tprint("    - Kill all running scripts;");
    ns.tprint("    - Copy /botnet/remote-hgw.js; and");
    ns.tprint("    - Launch it with as many threads as RAM allows.");
    ns.tprint("");
    ns.tprint("  Afterward, it also uses spare RAM on home to run remote-hgw.js.");
    ns.tprint("");
    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Requires /botnet/remote-hgw.js to exist on home.");
    ns.tprint("  - Uses findBestTarget(ns) when no explicit target is provided.");
    ns.tprint("  - Only deploys to servers where you have (or can gain) root access.");
    ns.tprint("  - Skips servers with less than 2GB of RAM.");
    ns.tprint("  - Leaves a small RAM reserve on home for other scripts.");
    ns.tprint("");
    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run /bin/deploy-net.js");
    ns.tprint("  run /bin/deploy-net.js <target>");
    ns.tprint("  run /bin/deploy-net.js --help");
    ns.tprint("");
    ns.tprint("==============================================================");
    ns.tprint("");
}
// ------------------------------------------------------------
// Flag parser for this script
// ------------------------------------------------------------
function parseFlags(ns) {
    const flags = ns.flags([
        ["help", false],
    ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }
    const positionals = flags._ || [];
    const wantsHelp = flags.help;
    return { flags, positionals, wantsHelp };
}
// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");
    const { positionals, wantsHelp } = parseFlags(ns);
    if (wantsHelp) {
        printHelp(ns);
        return;
    }
    const manualTarget = positionals[0] || null;
    const target = manualTarget || findBestTarget(ns);
    if (!target) {
        ns.tprint("No suitable target found.");
        return;
    }
    const workerScript = "//botnet/remote-hgw.js";
    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`Cannot deploy - ${workerScript} not found on home.`);
        return;
    }
    ns.tprint(`Deploying remote HGW farm against target: ${target}`);
    const servers = getAllServers(ns);
    const portCrackers = countPortCrackers(ns);
    for (const host of servers) {
        if (host === "home") continue; // handle home separately
        // Try to gain root if we do not have it yet
        if (!ns.hasRootAccess(host)) {
            tryRoot(ns, host, portCrackers);
        }
        if (!ns.hasRootAccess(host)) {
            ns.print(`Skipping ${host}: no root access.`);
            continue;
        }
        const maxRam = ns.getServerMaxRam(host);
        if (maxRam < 2) {
            ns.print(`Skipping ${host}: not enough RAM (${maxRam} GB).`);
            continue;
        }
        // Clear the box
        ns.killall(host);
        // Copy worker script
        const copied = await ns.scp(workerScript, host);
        if (!copied) {
            ns.print(`Failed to copy ${workerScript} to ${host}.`);
            continue;
        }
        const scriptRam = ns.getScriptRam(workerScript);
        const usableRam = maxRam * 0.95; // leave 5% breathing room
        const threads = Math.floor(usableRam / scriptRam);
        if (threads < 1) {
            ns.print(`Not enough RAM on ${host} for even 1 thread.`);
            continue;
        }
        const pid = ns.exec(workerScript, host, threads, target);
        if (pid === 0) {
            ns.print(`Failed to exec ${workerScript} on ${host}.`);
        } else {
            ns.print(`${host}: running ${workerScript} x${threads} versus ${target}.`);
        }
    }
    // Optionally, also use some RAM on home itself
    await deployToHome(ns, target);
    ns.tprint("Network deployment complete.");
}
// ------------------------------------------------------------
// Existing helpers (logic preserved, logs de-emoji-fied)
// ------------------------------------------------------------
/** Use some of home's RAM as well */
async function deployToHome(ns, target) {
    const host = "home";
    const script = "//botnet/remote-hgw.js";
    const maxRam  = ns.getServerMaxRam(host);
    const usedRam = ns.getServerUsedRam(host);
    // Leave 32 GB free on home for you / misc scripts
    const reserved = 32;
    const usableRam = Math.max(0, maxRam - usedRam - reserved);
    if (usableRam < 2) {
        ns.print("Not enough free RAM on home to deploy.");
        return;
    }
    const copied = await ns.scp(script, host);
    if (!copied) {
        ns.print(`Failed to copy ${script} to home.`);
        return;
    }
    const scriptRam = ns.getScriptRam(script);
    const threads = Math.floor(usableRam / scriptRam);
    if (threads < 1) {
        ns.print("Not enough RAM on home for even 1 thread.");
        return;
    }
    ns.print(`home: running ${script} x${threads} versus ${target}.`);
    ns.exec(script, host, threads, target);
}
/** DFS search to get all servers from 'home' */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];
    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);
        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }
    return Array.from(visited);
}
/** Count how many port crackers we have */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}
/** Try to open ports + nuke if we have enough tools */
function tryRoot(ns, host, portCrackers) {
    const requiredPorts = ns.getServerNumPortsRequired(host);
    if (requiredPorts > portCrackers) return;
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);
    try {
        ns.nuke(host);
    } catch {
        // if it fails, hasRootAccess will catch that
    }
}
/** "Best" target: maxMoney * growth / security with filters */
function findBestTarget(ns) {
    const servers      = getAllServers(ns);
    const hackingLevel = ns.getHackingLevel();
    const portCrackers = countPortCrackers(ns);
    let bestTarget = null;
    let bestScore  = 0;
    for (const server of servers) {
        if (server === "home") continue;
        const maxMoney = ns.getServerMaxMoney(server);
        const minSec   = ns.getServerMinSecurityLevel(server);
        const growth   = ns.getServerGrowth(server);
        const reqHack  = ns.getServerRequiredHackingLevel(server);
        const reqPorts = ns.getServerNumPortsRequired(server);
        // Filters to avoid junk
        if (maxMoney <= 250_000) continue;
        if (growth < 10) continue;
        if (reqHack > hackingLevel) continue;
        if (reqPorts > portCrackers) continue;
        const score = (maxMoney * growth) / minSec;
        if (score > bestScore) {
            bestScore  = score;
            bestTarget = server;
        }
    }
    return bestTarget;
}
```
/* == END FILE == */

/* == FILE: bin/tools/find.js == */
```js
import { findPath } from '/lib/network.js';
/** @param {NS} ns */
export async function main(ns) {
    // Add --help without breaking positional usage
    const flags = ns.flags([
        ["help", false],
    ]);
    // Print help and exit immediately
    if (flags.help) {
        printHelp(ns);
        return;
    }
    // Script expects exactly one positional argument: target hostname
    if (flags._.length !== 1) {
        ns.tprint("Incorrect usage. See help below.\n");
        printHelp(ns);
        return;
    }
    const target = flags._[0];
    const start = "home";
    const path = await findPath(ns, target, start);
    if (path === null) {
        ns.tprint(`find: target "${target}" is not reachable from "${start}"`);
        return;
    }
    ns.tprint(`Path to ${target}:`);
    ns.tprint(path.join(" -> "));
}
function printHelp(ns) {
    ns.tprint("bin/find.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Locate a host by name and print the navigation path from home.");
    ns.tprint("  Uses the BFS-based findPath() function from lib/network.js.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Requires an exact hostname. Returns the path from home.");
    ns.tprint("  Positional arguments must contain exactly one target name.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run bin/find.js <hostname> [--help]");
}
```
/* == END FILE == */

/* == FILE: bin/tools/find-juicy-advanced.js == */
```js
/** util/find-juicy-advanced.js
 * Advanced juicy target finder:
 *
 * - Filters out trash / too-easy / too-hard / low-money servers.
 * - Considers only rooted, hackable servers within a band of your current level.
 * - Scores by money/sec and security, using Formulas.exe when available.
 * - Falls back to vanilla ns.getHackTime / ns.hackAnalyze* when Formulas.exe is missing.
 *
 * **/
//@param {NS} ns
 
export async function main(ns) {
    ns.disableLog("ALL");

    // Tunable knobs
    const MIN_MONEY_ABS  = 2_500_000; // skip anything poorer than this
    const MIN_HACK_RATIO = 0.25;      // reqHack must be at least 25% of your level
    const EXCLUDED_SERVERS = new Set([
        "home",
        "n00dles",
        "foodnstuff",
        "sigma-cosmetics",
        "joesguns",
        "harakiri-sushi",
        "hong-fang-tea",
    ]);

    const hackingLevel = ns.getHackingLevel();
    const servers      = getAllServers(ns);

    let best      = null;
    let bestScore = 0;
    const scored  = [];

    for (const host of servers) {
        if (EXCLUDED_SERVERS.has(host)) continue;

        const s = ns.getServer(host);

        // Must be rooted and hackable
        if (!s.hasAdminRights) continue;
        if (s.requiredHackingSkill > hackingLevel) continue;

        // Skip stuff that is *too* easy
        if (s.requiredHackingSkill < hackingLevel * MIN_HACK_RATIO) continue;

        // Must have decent money
        if (s.moneyMax < MIN_MONEY_ABS) continue;

        const {
            maxMoney,
            minSec,
            tHack,
            chance,
            moneyPerSec,
            score,
        } = getAdvancedHackMetrics(ns, host, s);

        scored.push({
            host,
            maxMoney,
            minSec,
            tHack,
            chance,
            moneyPerSec,
            score,
            reqHack: s.requiredHackingSkill,
        });

        if (score > bestScore) {
            bestScore = score;
            best      = scored[scored.length - 1];
        }
    }

    if (!best) {
        ns.tprint("? No juicy advanced target found with current filters.");
        ns.tprint("   (Either you need to root more servers, or weï¿½re still early-game.)");
        return;
    }

    const usingFormulas = hasFormulas(ns);

    ns.tprint("=======================================");
    ns.tprint("   ?? Juiciest Advanced Target");
    ns.tprint("=======================================");
    ns.tprint(`?? Host:        ${best.host}`);
    ns.tprint(`?? Max Money:   ${ns.nFormat(best.maxMoney, "$0.00a")}`);
    ns.tprint(`?? Req Hack:    ${best.reqHack} (you: ${ns.getHackingLevel()})`);
    ns.tprint(`?? MinSec:      ${best.minSec.toFixed(2)}`);
    ns.tprint(`? Hack Time:   ${(best.tHack / 1000).toFixed(1)}s`);
    ns.tprint(`?? Chance:      ${(best.chance * 100).toFixed(1)}%`);
    ns.tprint(`?? Money/sec:   ${ns.nFormat(best.moneyPerSec * 1000, "$0.00a")}`);
    ns.tprint(`?? Score:       ${best.score.toExponential(3)} (${usingFormulas ? "?? Formulas" : "vanilla"})`);

    // Optional: quick top 5
    scored.sort((a, b) => b.score - a.score);
    const topN = Math.min(5, scored.length);
    ns.tprint("=======================================");
    ns.tprint("   ?? Top Juicy Candidates");
    ns.tprint("=======================================");
    for (let i = 0; i < topN; i++) {
        const h = scored[i];
        ns.tprint(
            `${i + 1}. ${h.host} | ` +
            `Score=${h.score.toExponential(2)} | ` +
            `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
            `ReqHack=${h.reqHack} | ` +
            `Chance=${(h.chance * 100).toFixed(1)}% | ` +
            `Sec=${h.minSec.toFixed(1)} | ` +
            `T=${(h.tHack / 1000).toFixed(1)}s | ` +
            `$/sec=${ns.nFormat(h.moneyPerSec * 1000, "$0.00a")}`
        );
    }
}

/**
 * Compute metrics for scoring a target.
 *
 * - With Formulas.exe:
 *     - Use ns.formulas.hacking.hackTime / hackChance / hackPercent
 *     - Assume prepped (min difficulty, max money)
 *     - Score is (moneyPerSec / minSec)
 *
 * - Without Formulas.exe:
 *     - Use ns.getHackTime / ns.hackAnalyze / ns.hackAnalyzeChance
 *     - Score is the original: maxMoney / hackTime / minSec
 *
 * This keeps behavior similar pre-Formulas, but upgrades nicely once unlocked.
 *
 * @param {NS} ns
 * @param {string} host
 * @param {Server} s
 */
function getAdvancedHackMetrics(ns, host, s) {
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    // Defensive defaults
    let tHack  = 1;
    let chance = 1;
    let moneyPerSec;
    let score;

    if (hasFormulas(ns)) {
        const player = ns.getPlayer();

        // Assume prepped for scoring
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        try {
            tHack  = ns.formulas.hacking.hackTime(s, player) || 1;
            chance = ns.formulas.hacking.hackChance(s, player) || 1;
            const percent      = ns.formulas.hacking.hackPercent(s, player) || 0;
            const moneyPerHack = maxMoney * percent;
            moneyPerSec        = (moneyPerHack * chance) / tHack;
            score              = moneyPerSec / minSec;
        } catch (_e) {
            // If anything weird happens, fall back to vanilla behavior
            tHack       = ns.getHackTime(host) || 1;
            chance      = ns.hackAnalyzeChance(host) ?? 1;
            moneyPerSec = maxMoney / tHack;
            score       = maxMoney / tHack / minSec;
        }
    } else {
        // Vanilla case: preserve your original-ish scoring style
        tHack       = ns.getHackTime(host) || 1;
        chance      = ns.hackAnalyzeChance(host) ?? 1;
        moneyPerSec = maxMoney / tHack;
        score       = maxMoney / tHack / minSec;
    }

    return { maxMoney, minSec, tHack, chance, moneyPerSec, score };
}

/** Safe check for formulas availability.
 *  Only touch ns.formulas if Formulas.exe exists to avoid early-game errors.
 * @param {NS} ns
 */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking
        );
    } catch (_e) {
        return false;
    }
}

/** DFS all servers reachable from home */
function getAllServers(ns) {
    const visited = new Set();
    const stack   = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/** Count how many port crackers we have on home */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}
```
/* == END FILE == */

/* == FILE: bin/tools/find-juicy-target.js == */
```js
/** util/find-juicy-target.js
 * Scan all reachable servers and pick a "juicy" target:
 * - Good max money
 * - Solid growth
 * - Not too high security
 * - Reasonable hack time (Formulas-aware when available)
 *
 * Prints the best target and a small leaderboard of top candidates.
 *
 * @param {NS} ns
 **/
export async function main(ns) {
    ns.disableLog("ALL");

    const servers      = getAllServers(ns);
    const hackingLevel = ns.getHackingLevel();
    const portCrackers = countPortCrackers(ns);

    let bestHost  = null;
    let bestScore = 0;
    const scored  = [];

    for (const host of servers) {
        if (host === "home") continue;

        const s = ns.getServer(host);
        const maxMoney = s.moneyMax;
        const minSec   = s.minDifficulty || 1;
        const growth   = s.serverGrowth;
        const reqHack  = s.requiredHackingSkill;
        const reqPorts = s.numOpenPortsRequired; // pre-root is fine here

        // Skip servers that are obviously trash or out of reach
        if (maxMoney <= 0) continue;
        if (maxMoney < 250_000) continue;       // ignore tiny money servers
        if (growth < 10) continue;              // low growth = meh
        if (reqHack > hackingLevel) continue;   // too hard for us
        if (reqPorts > portCrackers) continue;  // need more port crackers

        // Formulas-aware hack time when available, vanilla fallback otherwise
        const hackTime = getJuicyHackTime(ns, host) || 1;

        // Higher money, growth, and lower sec/time ? better
        const score = (maxMoney * growth) / (minSec * hackTime);

        scored.push({ host, maxMoney, growth, minSec, hackTime, score });

        if (score > bestScore) {
            bestScore = score;
            bestHost  = host;
        }
    }

    if (!bestHost) {
        ns.tprint("? No juicy target found. (Probably need more hacking level or port crackers.)");
        return;
    }

    // Sort for a little leaderboard
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    ns.tprint("=======================================");
    ns.tprint("   ?? Juiciest Target Found");
    ns.tprint("=======================================");
    ns.tprint(`?? Host: ${best.host}`);
    ns.tprint(`?? Max Money: ${ns.nFormat(best.maxMoney, "$0.00a")}`);
    ns.tprint(`?? Growth: ${best.growth.toFixed(1)}`);
    ns.tprint(`?? Min Security: ${best.minSec.toFixed(2)}`);
    ns.tprint(`? Hack Time: ${(best.hackTime / 1000).toFixed(1)}s`);
    ns.tprint(`?? Score: ${best.score.toExponential(3)}  (${hasFormulas(ns) ? "?? Formulas" : "vanilla"})`);

    // Print top 5 for context
    ns.tprint("=======================================");
    ns.tprint("   ?? Top 5 Juicy Targets");
    ns.tprint("=======================================");
    const topN = Math.min(5, scored.length);
    for (let i = 0; i < topN; i++) {
        const h = scored[i];
        ns.tprint(
            `${i + 1}. ${h.host} | ` +
            `Score=${h.score.toExponential(2)} | ` +
            `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
            `Grow=${h.growth.toFixed(1)} | ` +
            `Sec=${h.minSec.toFixed(1)} | ` +
            `T=${(h.hackTime / 1000).toFixed(1)}s`
        );
    }
}

/**
 * Formulas-aware hack time helper:
 * - If Formulas.exe is present, use ns.formulas.hacking.hackTime()
 *   assuming prepped-ish (min security, max money).
 * - Otherwise, fall back to ns.getHackTime(host).
 *
 * @param {NS} ns
 * @param {string} host
 */
function getJuicyHackTime(ns, host) {
    if (!hasFormulas(ns)) {
        return ns.getHackTime(host);
    }

    const player = ns.getPlayer();
    const s = ns.getServer(host);

    // Assume prepped for speed estimation
    if (typeof s.minDifficulty === "number") {
        s.hackDifficulty = s.minDifficulty;
    }
    if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
        s.moneyAvailable = s.moneyMax;
    }

    try {
        return ns.formulas.hacking.hackTime(s, player);
    } catch (_e) {
        // Extremely defensive: if anything goes wrong, fall back
        return ns.getHackTime(host);
    }
}

/** Safe check for formulas availability.
 *  This matches the pattern in other scripts: only touch ns.formulas
 *  if Formulas.exe exists to avoid early-game errors.
 * @param {NS} ns
 */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking &&
            typeof ns.formulas.hacking.hackTime === "function"
        );
    } catch (_e) {
        return false;
    }
}

/** DFS all servers reachable from home */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/** Count how many port crackers we have on home */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}
```
/* == END FILE == */

/* == FILE: bin/tools/lib/network.js == */
```js
/**
 * network.js
 *
 * Functions for scanning and mapping the server network.
 * 
*/

/**
 * Traverse the network graph starting at `start` and call `visit`
 * exactly once per discovered host.
 *
 * @param {NS} ns
 * @param {Object} options
 * @param {string} [options.start='home']
 * @param {(host: string, ctx: {depth: number, parent: string | null}) 
 *          => (void|boolean|Promise<void|boolean>)} options.visit
 *        If visit() returns true, traversal stops early.
 */
export async function explore(ns, { start = 'home', visit } = {}) {
    if (typeof visit !== 'function')
        throw new Error("explore: visit callback is required");

    const visited = new Set();
    const stack = [{ host: start, depth: 0, parent: null }];

    while (stack.length > 0) {
        const { host, depth, parent } = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        // Allow async visitor; visitor may early-return true
        const stop = await visit(host, { depth, parent });
        if (stop === true) return;

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push({ host: neighbor, depth: depth + 1, parent: host });
            }
        }
    }
}

/**
 * Build a map of the entire server network starting from `start`.
 *
 * @param {NS} ns
 * @param {string} [start='home']
 * @returns {Promise<Object<string, {
 *   name: string,
 *   depth: number,
 *   parent: string | null,
 *   backdoorInstalled: boolean,
 *   baseDifficulty: number,
 *   cpuCores: number,
 *   ftpPortOpen: boolean,
 *   hackDifficulty: number,
 *   hasAdminRights: boolean,
 *   hostname: string,
 *   httpPortOpen: boolean,
 *   ip: string,
 *   isConnectedTo: string[],
 *   maxRam: number,
 *   minDifficulty: number,
 *   moneyAvailable: number,
 *   moneyMax: number,
 *   numOpenPortsRequired: number,
 *   openPortCount: number,
 *   organizationName: string,
 *   purchasedByPlayer: boolean,
 *   ramUsed: number,
 *   requiredHackingSkill: number,
 *   serverGrowth: number,
 *   smtpPortOpen: boolean,
 *   sqlPortOpen: boolean,
 *   sshPortOpen: boolean
 * }>>}
 */
export async function buildNetworkMap(ns, start = 'home') {
    const network = {};

    await explore(ns, {
        start,
        visit: (host, { depth, parent }) => {
            const s = ns.getServer(host);
            network[host] = {
                name: host,
                depth,
                parent,
                backdoorInstalled: s.backdoorInstalled,
                baseDifficulty: s.baseDifficulty,
                cpuCores: s.cpuCores,
                ftpPortOpen: s.ftpPortOpen,
                hackDifficulty: s.hackDifficulty,
                hasAdminRights: s.hasAdminRights,
                hostname: s.hostname,
                httpPortOpen: s.httpPortOpen,
                ip: s.ip,
                isConnectedTo: s.isConnectedTo,
                maxRam: s.maxRam,
                minDifficulty: s.minDifficulty,
                moneyAvailable: s.moneyAvailable,
                moneyMax: s.moneyMax,
                numOpenPortsRequired: s.numOpenPortsRequired,
                openPortCount: s.openPortCount,
                organizationName: s.organizationName,
                purchasedByPlayer: s.purchasedByPlayer,
                ramUsed: s.ramUsed,
                requiredHackingSkill: s.requiredHackingSkill,
                serverGrowth: s.serverGrowth,
                smtpPortOpen: s.smtpPortOpen,
                sqlPortOpen: s.sqlPortOpen,
                sshPortOpen: s.sshPortOpen,
                hackTime: ns.getHackTime(host),
                growTime: ns.getGrowTime(host),
                weakenTime: ns.getWeakenTime(host)
            };
        }
    });

    return network;
}

/**
 * Find a path from `start` to `target` server.
 *
 * @param {NS} ns
 * @param {string} target
 * @param {string} [start='home']
 * @returns {Promise<string[] | null>} Array of hostnames from start to target,
 *          or null if target is not reachable.
 */
export async function findPath(ns, target, start = 'home') {
    const parent = {};
    let found = false;

    await explore(ns, {
        start,
        visit: (host, ctx) => {
            parent[host] = ctx.parent;
            if (host === target) {
                found = true;
                return true;    // stop traversal
            }
        }
    });

    if (!found) return null;

    const path = [];
    let h = target;
    while (h !== null) {
        path.push(h);
        h = parent[h];
    }
    return path.reverse();
}

/** 
 * Get all rooted servers.
 *
 * @param {NS} ns
 * @returns {string[]} Array of hostnames
 */
export async function getRootedServers(ns) {
    let results = [];
    await explore(ns, {
        start: "home",
        visit: (host) => {
            const s = ns.getServer(host);
            if (s.hasAdminRights && s.maxRam > 0) results.push(host);
        }
    });
    return results;
};
```
/* == END FILE == */

/* == FILE: bin/tools/os-restart.js == */
```js
/** @param {NS} ns */
/*
 * /bin/tools/os-restart.js
 *
 * Goal
 *  - Run cleanup-everything.js
 *  - Then restart /bin/bootstrap.js
 *
 * Why this works
 *  - cleanup-everything.js avoids killing the current PID on home.
 *  - By importing + calling its main() directly, THIS script is the "current PID",
 *    so cleanup won't kill restart-os, and we can safely continue to relaunch bootstrap.
 *
 * Syntax
 *  run /bin/tools/restart-os.js
 *  run /bin/tools/restart-os.js --noCleanup true
 *  run /bin/tools/restart-os.js --bootArgs "neo-net money"
 *  run /bin/tools/restart-os.js --tail true
 */

import { main as cleanupEverythingMain } from "/bin/tools/cleanup-everything.js";

const FLAGS = [
  ["help", false],
  ["noCleanup", false],
  ["tail", false],

  // Bootstrap launch
  ["bootstrap", "/bin/bootstrap.js"],
  ["bootArgs", ""], // space-delimited string of args passed to bootstrap
];

export async function main(ns) {
  const flags = ns.flags(FLAGS);

  if (flags.help) return printHelp(ns);

  ns.disableLog("ALL");

  if (flags.tail) {
    if (ns.ui?.openTail) ns.ui.openTail();
    else ns.tail();
  }

  const bootstrap = String(flags.bootstrap || "/bin/bootstrap.js");
  const bootArgs = parseArgs(String(flags.bootArgs || ""));

  ns.tprint(`[restart-os] Starting OS restart...`);
  ns.tprint(`[restart-os] Bootstrap: ${bootstrap} ${bootArgs.join(" ")}`.trim());

  // 1) Cleanup
  if (!flags.noCleanup) {
    ns.tprint(`[restart-os] Running cleanup-everything...`);
    try {
      await cleanupEverythingMain(ns);
      ns.tprint(`[restart-os] Cleanup complete.`);
    } catch (e) {
      // Don't abort the restart if cleanup hiccups; still try to bring the OS back up.
      ns.tprint(`[restart-os] WARN cleanup failed: ${String(e)}`);
    }
  } else {
    ns.tprint(`[restart-os] Skipping cleanup (--noCleanup).`);
  }

  // 2) Restart bootstrap
  // Use spawn so this script cleanly hands off and doesn't sit around.
  ns.tprint(`[restart-os] Spawning bootstrap...`);
  ns.spawn(bootstrap, 1, ...bootArgs);
}

// -----------------------------

function parseArgs(s) {
  // simple, practical: split on whitespace; if you need quoted args later we can upgrade this
  return s.trim() ? s.trim().split(/\s+/g) : [];
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint("/bin/tools/restart-os.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Runs cleanup-everything.js, then restarts /bin/bootstrap.js.");
  ns.tprint("  Uses import+call so cleanup won't kill this script's PID.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/tools/restart-os.js");
  ns.tprint("  run /bin/tools/restart-os.js --noCleanup true");
  ns.tprint('  run /bin/tools/restart-os.js --bootArgs "neo-net money"');
  ns.tprint("  run /bin/tools/restart-os.js --tail true");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --noCleanup true|false     Skip cleanup step (default false)");
  ns.tprint("  --bootstrap <path>         Bootstrap script path (default /bin/bootstrap.js)");
  ns.tprint('  --bootArgs "<args>"        Space-delimited bootstrap args (default empty)');
  ns.tprint("  --tail true|false          Open tail window (default false)");
}
```
/* == END FILE == */

/* == FILE: bin/tools/os-services.js == */
```js
/* == FILE: bin/tools/os-services.js == */
/** @param {NS} ns */
/*
 * /bin/tools/os-services.js
 *
 * Description
 *  bbOS service enablement manager:
 *   - Persists enabled/disabled overrides to a JSON file (default: data/os-services.json)
 *   - Lists effective enablement state (registry defaults + overrides)
 *   - Enables/disables/toggles services by key
 *
 * Notes
 *  - This tool does NOT start/stop scripts. It only manages config/state.
 *  - Controller reads this file to decide what to run (when enabled).
 *
 * Syntax
 *  run /bin/tools/os-services.js --list
 *  run /bin/tools/os-services.js --enable batcher
 *  run /bin/tools/os-services.js --disable trader
 *  run /bin/tools/os-services.js --toggle gangManager
 *  run /bin/tools/os-services.js --reset
 *  run /bin/tools/os-services.js --help
 */

import { getServiceRegistry } from "/lib/os/service-registry.js";
import {
  DEFAULT_SERVICE_CONFIG_PATH,
  normalizeDataPath,
  loadServiceConfig,
  saveServiceConfig,
  getEffectiveEnabledMap,
} from "/lib/os/service-config.js";

const FLAGS = [
  ["help", false],

  // storage
  ["file", DEFAULT_SERVICE_CONFIG_PATH],

  // actions
  ["list", false],
  ["show", false],     // show raw config file
  ["enable", ""],      // service key or comma list
  ["disable", ""],     // service key or comma list
  ["toggle", ""],      // service key or comma list
  ["set", ""],         // format: key=true or key=false (comma list: a=true,b=false)
  ["reset", false],    // clears overrides (back to defaults)
];

export async function main(ns) {
  const flags = ns.flags(FLAGS);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  const fileRaw = String(flags.file || DEFAULT_SERVICE_CONFIG_PATH).trim();
  const file = normalizeDataPath(fileRaw);

  const registry = getServiceRegistry();
  const knownKeys = new Set(registry.map((s) => s.key));

  const cfg = loadServiceConfig(ns, file);
  cfg.enabled = cfg.enabled || {};

  const didAction =
    flags.reset ||
    hasText(flags.enable) ||
    hasText(flags.disable) ||
    hasText(flags.toggle) ||
    hasText(flags.set) ||
    flags.show ||
    flags.list;

  if (!didAction) flags.list = true;

  let changed = false;

  if (flags.reset) {
    cfg.enabled = {};
    changed = true;
    ns.tprint(`[bbOS] os-services: reset overrides (defaults will apply).`);
  }

  if (hasText(flags.enable)) {
    const keys = parseKeyList(flags.enable);
    for (const k of keys) {
      assertKnownKey(k, knownKeys);
      cfg.enabled[k] = true;
      changed = true;
    }
    ns.tprint(`[bbOS] os-services: enabled: ${keys.join(", ")}`);
  }

  if (hasText(flags.disable)) {
    const keys = parseKeyList(flags.disable);
    for (const k of keys) {
      assertKnownKey(k, knownKeys);
      cfg.enabled[k] = false;
      changed = true;
    }
    ns.tprint(`[bbOS] os-services: disabled: ${keys.join(", ")}`);
  }

  if (hasText(flags.toggle)) {
    const keys = parseKeyList(flags.toggle);
    const effective = getEffectiveEnabledMap(registry, cfg);
    for (const k of keys) {
      assertKnownKey(k, knownKeys);
      cfg.enabled[k] = !effective[k];
      changed = true;
    }
    ns.tprint(`[bbOS] os-services: toggled: ${keys.join(", ")}`);
  }

  if (hasText(flags.set)) {
    const pairs = String(flags.set).split(",").map((s) => s.trim()).filter(Boolean);
    /** @type {string[]} */
    const touched = [];
    for (const p of pairs) {
      const m = /^([^=]+)=(true|false)$/i.exec(p);
      if (!m) throw new Error(`--set expects "key=true" or "key=false" (comma-separated). Got: ${p}`);
      const key = m[1].trim();
      const val = m[2].toLowerCase() === "true";
      assertKnownKey(key, knownKeys);
      cfg.enabled[key] = val;
      touched.push(`${key}=${val}`);
      changed = true;
    }
    ns.tprint(`[bbOS] os-services: set: ${touched.join(", ")}`);
  }

  if (changed) {
    const ok = saveServiceConfig(ns, file, cfg);
    if (!ok) {
      ns.tprint(`[bbOS] os-services: WARN: failed to write config: ${file}`);
    } else {
      ns.tprint(`[bbOS] os-services: wrote: ${file}`);
    }
  }

  if (flags.show) {
    ns.tprint("--------------------------------------------------------------");
    ns.tprint(`[bbOS] os-services raw config: ${file}`);
    ns.tprint(ns.read(file) || "(empty)");
    ns.tprint("--------------------------------------------------------------");
  }

  if (flags.list) {
    const effective = getEffectiveEnabledMap(registry, cfg);

    ns.tprint("==============================================================");
    ns.tprint("   bbOS SERVICES (enablement)");
    ns.tprint("==============================================================");
    ns.tprint(`Config: ${file}`);
    ns.tprint("");

    for (const s of registry) {
      const eff = !!effective[s.key];
      const hasOverride = Object.prototype.hasOwnProperty.call(cfg.enabled, s.key);
      const ov = hasOverride ? ` override=${cfg.enabled[s.key]}` : "";
      const def = s.managed ? "default=ENABLED" : "default=DISABLED";
      ns.tprint(`  - ${eff ? "[ON ]" : "[OFF]"} ${s.key} (${def}${ov}) -> ${s.script}`);
    }

    ns.tprint("");
    ns.tprint("Notes:");
    ns.tprint("  - This tool only manages config; it does not start/stop scripts.");
    ns.tprint("  - Controller reads this file to decide what to run (when enabled).");
    ns.tprint("==============================================================");
  }
}

function printHelp(ns) {
  ns.tprint("/bin/tools/os-services.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Manage bbOS service enablement overrides (persisted to JSON).");
  ns.tprint("  Defaults: managed services enabled, non-managed disabled.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/tools/os-services.js --list");
  ns.tprint("  run /bin/tools/os-services.js --enable batcher");
  ns.tprint("  run /bin/tools/os-services.js --disable trader");
  ns.tprint("  run /bin/tools/os-services.js --toggle gangManager");
  ns.tprint('  run /bin/tools/os-services.js --set "batcher=true,trader=false"');
  ns.tprint("  run /bin/tools/os-services.js --reset");
  ns.tprint("  run /bin/tools/os-services.js --show");
  ns.tprint("  run /bin/tools/os-services.js --help");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --file <path>        Config file path (default data/os-services.json)");
  ns.tprint("  --list true|false    Show effective enablement (default true if no action)");
  ns.tprint("  --show true|false    Print raw config file");
  ns.tprint("  --enable <keys>      Enable key or comma-list (e.g. batcher,botnet)");
  ns.tprint("  --disable <keys>     Disable key or comma-list");
  ns.tprint("  --toggle <keys>      Toggle key or comma-list");
  ns.tprint('  --set "<pairs>"      Comma-list: key=true,key=false');
  ns.tprint("  --reset true|false   Clear overrides (back to defaults)");
}

function hasText(v) {
  return String(v || "").trim().length > 0;
}

function parseKeyList(v) {
  return String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function assertKnownKey(key, knownKeys) {
  if (knownKeys.has(key)) return;
  const known = Array.from(knownKeys.values()).sort().join(", ");
  throw new Error(`[bbOS] Unknown service key "${key}". Known keys: ${known}`);
}
```
/* == END FILE == */

/* == FILE: bin/tools/os-status.js == */
```js
/* == FILE: bin/tools/os-status.js == */
/** @param {NS} ns */
/*
 * /bin/tools/os-status.js
 *
 * Description
 *  bbOS status viewer (popout-friendly).
 *  - Uses registry + services config to compute effective enablement.
 *  - Scans running processes to show what is actually running.
 *
 * Notes
 *  - Use --popout to open a Tail window and render there.
 *  - Use --interval <ms> for live refresh.
 *
 * Syntax
 *  run /bin/tools/os-status.js --popout
 *  run /bin/tools/os-status.js --popout --interval 1000
 *  run /bin/tools/os-status.js --once
 *  run /bin/tools/os-status.js --help
 */

import { getServiceRegistry } from "/lib/os/service-registry.js";
import {
  DEFAULT_SERVICE_CONFIG_PATH,
  normalizeDataPath,
  loadServiceConfig,
  getEffectiveEnabledMap,
} from "/lib/os/service-config.js";

const FLAGS = [
  ["help", false],

  // UI mode
  ["popout", true],     // if true: ns.tail() + ns.print dashboard
  ["once", false],      // if true: render once and exit (ignores interval)
  ["interval", 1500],   // ms refresh when not --once
  ["compact", true],     // one-line status (default)
  ["verbose", false],    // force full dashboard

  // Scope
  ["host", "home"],
  ["allHosts", false],

  // Filters
  ["lane", ""],
  ["onlyRunning", false],
  ["onlyEnabled", false],

  // Config
  ["servicesFile", DEFAULT_SERVICE_CONFIG_PATH],

  // Output shaping
  ["maxArgs", 6],
];

export async function main(ns) {
  const flags = ns.flags(FLAGS);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");
  ns.clearLog();

  const popout = !!flags.popout;
  const once = !!flags.once;

  if (popout) ns.tail();

  const interval = Math.max(250, Number(flags.interval) || 1500);

  while (true) {
    ns.clearLog();
    renderStatus(ns, flags);

    if (once) return;
    await ns.sleep(interval);
  }
}

function renderStatus(ns, flags) {
  if (flags.verbose || !flags.compact) {
    renderVerbose(ns, flags);
  } else {
    renderCompact(ns, flags);
  }
}

function renderCompact(ns, flags) {
  const registry = getServiceRegistry();
  const conf = loadServiceConfig(ns, normalizeDataPath(flags.servicesFile));
  const effective = getEffectiveEnabledMap(registry, conf);

  const host = flags.host || "home";
  const procs = safeArr(() => ns.ps(host), []);

  const running = new Set(procs.map(p => p.filename.replace(/^\/+/, "")));

  const parts = [];

  for (const svc of registry) {
    if (!svc.managed) continue;

    const script = svc.script.replace(/^\/+/, "");
    const isEnabled = !!effective[svc.key];
    const isRunning = running.has(script);

    const icon =
      !isEnabled ? "âœ–" :
      isRunning ? "âœ”" :
      "â€¦";

    parts.push(`${icon} ${svc.key}`);
  }

  // Jobs (derived from controller behavior)
  const jobs = [];
  if (!conf?.enabled?.backdoorJob) jobs.push("backdoor");
  if (!conf?.enabled?.contractsJob) jobs.push("contracts");

  const ramFree = Math.floor(
    ns.getServerMaxRam("home") - ns.getServerUsedRam("home")
  );

  ns.print(
    `[bbOS] ${parts.join(" | ")} ` +
    `|| jobs:${jobs.length ? jobs.join(",") : "none"} ` +
    `|| RAM free: ${ramFree}GB`
  );
}

function buildScriptVariants(scriptWithSlash) {
  const s = String(scriptWithSlash || "").trim().replaceAll("\\", "/");
  const set = new Set();
  if (!s) return set;

  set.add(s);
  if (s.startsWith("/")) set.add(s.slice(1));
  else set.add("/" + s);

  return set;
}

function formatArgs(args, maxArgs) {
  if (!args || args.length === 0) return "[]";
  const a = args.map((x) => String(x));
  if (maxArgs > 0 && a.length > maxArgs) {
    return `[${a.slice(0, maxArgs).join(", ")}, â€¦(+${a.length - maxArgs})]`;
  }
  return `[${a.join(", ")}]`;
}

function discoverHosts(ns) {
  const out = [];
  const seen = new Set();
  const q = ["home"];
  seen.add("home");

  while (q.length > 0) {
    const cur = q.shift();
    out.push(cur);

    const next = safeArr(() => ns.scan(cur), []);
    for (const n of next) {
      if (!seen.has(n)) {
        seen.add(n);
        q.push(n);
      }
    }
  }
  return out;
}

function safeArr(fn, fallback) {
  try {
    const v = fn();
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function printHelp(ns) {
  ns.tprint("/bin/tools/os-status.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  bbOS status viewer (popout-friendly via Tail window).");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/tools/os-status.js --popout");
  ns.tprint("  run /bin/tools/os-status.js --popout --interval 1000");
  ns.tprint("  run /bin/tools/os-status.js --once");
  ns.tprint("  run /bin/tools/os-status.js --help");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --popout true|false     Use Tail window + log rendering (default true)");
  ns.tprint("  --once true|false       Render once and exit (default false)");
  ns.tprint("  --interval <ms>         Refresh cadence (default 1500)");
  ns.tprint("  --host <name>           Host scope when allHosts=false (default home)");
  ns.tprint("  --allHosts true|false   Scan all discovered hosts (default false)");
  ns.tprint("  --lane <name>           Filter to a single lane (default none)");
  ns.tprint("  --onlyRunning true|false Only show running services (default false)");
  ns.tprint("  --onlyEnabled true|false Only show enabled services (default false)");
  ns.tprint("  --servicesFile <path>   Config file (default data/os-services.json)");
  ns.tprint("  --maxArgs <n>           Truncate args list (default 6)");
}
```
/* == END FILE == */

/* == FILE: bin/tools/prep-target.js == */
```js
/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0];
    if (!target) {
        ns.tprint("Usage: run util/prep-target.js [server]");
        return;
    }

    ns.tprint(`?? PREPPING ${target}...`);

    while (true) {
        const sec = ns.getServerSecurityLevel(target);
        const minSec = ns.getServerMinSecurityLevel(target);
        const money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);

        if (sec > minSec + 0.5) {
            await ns.weaken(target);
        } 
        else if (money < maxMoney * 0.99) {
            await ns.grow(target);
        }
        else {
            ns.tprint(`? ${target} fully prepped!`);
            return;
        }
    }
}
```
/* == END FILE == */

/* == FILE: bin/tools/root-all.js == */
```js
/** /bin/root-all.js
 *
 * Scan the network from "home" and attempt to gain root access on every
 * reachable server using whatever port crackers you own.
 *
 * This script:
 *   - Walks the entire network (DFS from "home")
 *   - Skips "home" itself
 *   - Checks your hacking level and port-cracker count
 *   - Attempts to open ports and nuke each eligible server
 *   - Prints a summary of newly rooted vs skipped servers
 *
 * Usage:
 *   run /bin/root-all.js
 *   run /bin/root-all.js --help
 *
 * @param {NS} ns
 */
// ------------------------------------------------------------
// Minimal HELP: Description, Notes, Syntax
// ------------------------------------------------------------
function printHelp(ns) {
    const script = "/bin/root-all.js";
    ns.tprint("==============================================================");
    ns.tprint(`HELP - ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");
    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Scans the network from 'home' and attempts to gain root access");
    ns.tprint("  on every reachable server using any port-cracking programs you");
    ns.tprint("  currently own.");
    ns.tprint("");
    ns.tprint("  For each server, it checks your hacking level and the number");
    ns.tprint("  of required ports, opens ports where possible, calls nuke(),");
    ns.tprint("  and prints a summary of what was rooted and what was skipped.");
    ns.tprint("");
    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Does not touch 'home'.");
    ns.tprint("  - Safe to run multiple times; already-rooted servers are skipped.");
    ns.tprint("  - Uses your current hacking level and available port crackers at");
    ns.tprint("    the time of execution.");
    ns.tprint("  - This script only gains root access; it does not copy or deploy");
    ns.tprint("    any batch or botnet scripts.");
    ns.tprint("");
    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run /bin/root-all.js");
    ns.tprint("  run /bin/root-all.js --help");
    ns.tprint("");
    ns.tprint("==============================================================");
    ns.tprint("");
}
// ------------------------------------------------------------
// Flag parser for this script
// ------------------------------------------------------------
function parseFlags(ns) {
    const flags = ns.flags([
        ["help", false],
    ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }
    const positionals = flags._ || [];
    const wantsHelp = flags.help;
    return { flags, positionals, wantsHelp };
}
// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");
    const { wantsHelp } = parseFlags(ns);
    if (wantsHelp) {
        printHelp(ns);
        return;
    }
    const hackingLevel = ns.getHackingLevel();
    const portCrackers = getPortCrackerCount(ns);
    ns.tprint("ROOT-ALL: Starting network scan from 'home'...");
    ns.tprint(`ROOT-ALL: Hacking level: ${hackingLevel}`);
    ns.tprint(`ROOT-ALL: Port crackers available: ${portCrackers}`);
    const servers = getAllServers(ns);
    ns.tprint(`ROOT-ALL: Found ${servers.length} servers (including home).`);
    let rooted = 0;
    let skippedAlreadyRoot = 0;
    let skippedNotEnoughTools = 0;
    let skippedTooHighHack = 0;
    for (const host of servers) {
        if (host === "home") continue; // do not root home
        const hasRoot = ns.hasRootAccess(host);
        const reqHack = ns.getServerRequiredHackingLevel(host);
        const reqPorts = ns.getServerNumPortsRequired(host);
        if (hasRoot) {
            skippedAlreadyRoot++;
            ns.print(`Already rooted: ${host}`);
            continue;
        }
        // Hacking level check
        if (reqHack > hackingLevel) {
            skippedTooHighHack++;
            ns.print(`Skipping ${host} (required hacking ${reqHack} > ${hackingLevel})`);
            continue;
        }
        // Port tools check
        if (reqPorts > portCrackers) {
            skippedNotEnoughTools++;
            ns.print(`Skipping ${host} (needs ${reqPorts} ports, only ${portCrackers} tools)`);
            continue;
        }
        // Try to open ports and nuke
        tryOpenPorts(ns, host);
        try {
            ns.nuke(host);
        } catch (e) {
            ns.print(`Failed to nuke ${host}: ${String(e)}`);
            continue;
        }
        if (ns.hasRootAccess(host)) {
            rooted++;
            ns.tprint(`Rooted: ${host} (ports=${reqPorts}, reqHack=${reqHack})`);
        } else {
            ns.print(`Something went wrong, still no root on ${host}`);
        }
        await ns.sleep(10); // tiny yield to avoid lag
    }
    ns.tprint("========== Rooting Summary ==========");
    ns.tprint(`Newly rooted:        ${rooted}`);
    ns.tprint(`Already rooted:      ${skippedAlreadyRoot}`);
    ns.tprint(`Not enough tools:    ${skippedNotEnoughTools}`);
    ns.tprint(`Hack level too low:  ${skippedTooHighHack}`);
    ns.tprint("=====================================");
}
// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
/**
 * DFS to find all servers reachable from 'home'.
 */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];
    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);
        const neighbors = ns.scan(host);
        for (const n of neighbors) {
            if (!visited.has(n)) {
                stack.push(n);
            }
        }
    }
    return Array.from(visited);
}
/**
 * Count how many port crackers we own.
 */
function getPortCrackerCount(ns) {
    const tools = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return tools.filter(t => ns.fileExists(t, "home")).length;
}
/**
 * Open all ports we can on a host.
 */
function tryOpenPorts(ns, host) {
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);
}
```
/* == END FILE == */

/* == FILE: bin/tools/root-and-deploy.js == */
```js
/** /bin/root-and-deploy.js
 * Scan the network, gain root where possible, and prep servers for batch usage.
 *
 * ?? Does NOT deploy or start swarm/HGW workers (botnet/remote-hgw.js, /bin/botnet-hgw-sync.js).
 * ?? Safe to run multiple times; it only (re)roots and copies scripts.
 *
 * Usage:
 *   run /bin/root-and-deploy.js
 *   run /bin/root-and-deploy.js joesguns   // optional arg, currently informational only
 *   run /bin/root-and-deploy.js --help     // show description/notes/syntax
 *
 * @param {NS} ns
 */
// ------------------------------------------------------------
// HELP + FLAG PARSING
// ------------------------------------------------------------
/**
 * Minimal help: Description, Notes, Syntax.
 * @param {NS} ns
 */
function printHelp(ns) {
    const script = "/bin/root-and-deploy.js";
    ns.tprint("==============================================================");
    ns.tprint(`   HELP - ${script}`);
    ns.tprint("==============================================================\n");
    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Scan the network from 'home', gain root on servers when possible,");
    ns.tprint("  and copy batch infrastructure scripts to rooted hosts with RAM.");
    ns.tprint("  This prepares the network for HWGW batchers without actually");
    ns.tprint("  starting any swarm/HGW worker scripts.");
    ns.tprint("");
    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Does NOT start botnet/remote-hgw.js or /bin/botnet-hgw-sync.js.");
    ns.tprint("  - Safe to run repeatedly; it only (re)roots and copies scripts.");
    ns.tprint("  - Respects your hacking level and available port crackers.");
    ns.tprint("  - Only copies batch scripts to servers with at least 2GB RAM.");
    ns.tprint("  - The optional [target] argument is currently informational only");
    ns.tprint("    and does not change behavior.");
    ns.tprint("");
    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run /bin/root-and-deploy.js");
    ns.tprint("  run /bin/root-and-deploy.js [target]");
    ns.tprint("  run /bin/root-and-deploy.js --help   # show this help");
    ns.tprint("");
    ns.tprint("==============================================================\n");
}
/**
 * Simple flag parser for this script.
 * - Supports: --help and -? (both show help and exit).
 * - Returns positionals separately.
 *
 * @param {NS} ns
 */
function parseFlags(ns) {
    const raw = [...ns.args];
    const flags = ns.flags([
        ["help", false],
    ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }
    const positionals = flags._ || [];
    const wantsHelp = flags.help || raw.includes("-?");
    return { flags, positionals, wantsHelp };
}
// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
export async function main(ns) {
    ns.disableLog("ALL");
    const { positionals, wantsHelp } = parseFlags(ns);
    if (wantsHelp) {
        printHelp(ns);
        return; // do not run normal behavior
    }
    // Original positional arg behavior preserved:
    //   manualTarget = first positional, or null if none provided.
    const manualTarget = positionals[0] || null;
    const hackingLevel = ns.getHackingLevel();
    const portCrackers = countPortCrackers(ns);
    ns.tprint("?? ROOT-AND-DEPLOY: scanning network from 'home'...");
    ns.tprint(`?? Hacking level: ${hackingLevel}`);
    ns.tprint(`?? Port crackers: ${portCrackers}`);
    if (manualTarget) {
        ns.tprint(`?? Manual target (informational only): ${manualTarget}`);
    }
    const servers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());
    let rooted = 0;
    let total = 0;
    // Scripts we may want present on remote hosts (batch infrastructure only)
    const batchScripts = [
        "batch-hack.js",
        "workers/hwgw/batch-grow.js",
        "workers/hwgw/batch-weaken.js",
    ];
    for (const host of servers) {
        if (host === "home") continue;
        if (host === "darkweb") continue;
        total++;
        const hadRootBefore = ns.hasRootAccess(host);
        const nowHasRoot = tryRoot(ns, host, hackingLevel, portCrackers);
        if (!hadRootBefore && nowHasRoot) rooted++;
        // Only bother copying scripts to machines where we have RAM + root
        if (!nowHasRoot) continue;
        const maxRam = ns.getServerMaxRam(host);
        if (maxRam < 2) {
            ns.print(`?? Skipping ${host}: only ${maxRam}GB RAM`);
            continue;
        }
        // Copy batch-only scripts; swarm scripts are managed by /bin/botnet-hgw-sync.js
        await ns.scp(batchScripts, host, "home");
        ns.print(`?? Deployed batch scripts to ${host} (RAM=${maxRam}GB)`);
    }
    ns.tprint("? ROOT-AND-DEPLOY COMPLETE");
    ns.tprint(`   Scanned: ${total} non-home servers`);
    ns.tprint(`   Newly rooted: ${rooted}`);
}
/**
 * Try to gain root on a server using available port crackers and Nuke.
 * Returns true if the server is rooted after this call.
 *
 * @param {NS} ns
 * @param {string} host
 * @param {number} hackingLevel
 * @param {number} portCrackers
 */
function tryRoot(ns, host, hackingLevel, portCrackers) {
    if (ns.hasRootAccess(host)) return true;
    const requiredHack = ns.getServerRequiredHackingLevel(host);
    const requiredPorts = ns.getServerNumPortsRequired(host);
    // Can't meet requirements yet
    if (requiredHack > hackingLevel) return false;
    if (requiredPorts > portCrackers) return false;
    // Open all ports we can
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);
    // Try to nuke
    try {
        ns.nuke(host);
    } catch {
        // if nuke fails for any reason, just fall through
    }
    return ns.hasRootAccess(host);
}
/**
 * Count how many port cracking programs we have.
 * @param {NS} ns
 */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}
/**
 * Simple BFS to discover all servers reachable from "home".
 * @param {NS} ns
 */
function getAllServers(ns) {
    const visited = new Set();
    const queue = ["home"];
    while (queue.length > 0) {
        const host = queue.shift();
        if (visited.has(host)) continue;
        visited.add(host);
        for (const h of ns.scan(host)) {
            if (!visited.has(h)) queue.push(h);
        }
    }
    return Array.from(visited);
}
```
/* == END FILE == */

/* == FILE: bin/tools/target-status.js == */
```js
/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    const target = ns.args[0];
    if (!target) {
        ns.tprint("Usage: run utils/target-status.js <target>");
        return;
    }

    const money   = ns.getServerMoneyAvailable(target);
    const max     = ns.getServerMaxMoney(target);
    const sec     = ns.getServerSecurityLevel(target);
    const minSec  = ns.getServerMinSecurityLevel(target);

    const moneyPct = max > 0 ? (money / max) * 100 : 0;
    const secDelta = sec - minSec;

    const pctPerThread = ns.hackAnalyze(target);

    let tHack = ns.getHackTime(target);
    let tGrow = ns.getGrowTime(target);
    let tWeak = ns.getWeakenTime(target);

    ns.tprint("--------------------------------------------------");
    ns.tprint(`ðŸŽ¯ TARGET STATUS â€” ${target}`);
    ns.tprint("--------------------------------------------------");
    ns.tprint(`ðŸ’° Money:      ${ns.formatNumber(money, 2, 1e3)} / ${ns.formatNumber(max, 2, 1e3)}  (${moneyPct.toFixed(2)}%)`);
    ns.tprint(`ðŸ›¡ Security:   ${sec.toFixed(2)} (min: ${minSec.toFixed(2)})   Î”=${secDelta.toFixed(2)}`);
    ns.tprint("--------------------------------------------------");
    ns.tprint(`ðŸ•’ Times:`);
    ns.tprint(`   Hack:   ${(tHack/1000).toFixed(2)}s`);
    ns.tprint(`   Grow:   ${(tGrow/1000).toFixed(2)}s`);
    ns.tprint(`   Weaken: ${(tWeak/1000).toFixed(2)}s`);
    ns.tprint("--------------------------------------------------");
    ns.tprint(`ðŸ”¢ Hack % per thread: ${(pctPerThread * 100).toFixed(4)}%`);
    ns.tprint("--------------------------------------------------");
    ns.tprint(`ðŸ“ˆ Growth rate: x${ns.getServerGrowth(target)}`);
    ns.tprint("--------------------------------------------------");
    ns.tprint(`Tip: If money < 90% or sec > min+1.0, server is NOT prepped.`);
    ns.tprint("--------------------------------------------------");
}
```
/* == END FILE == */

/* == FILE: bin/tools/xp-target-compare.js == */
```js
/** util/xp-target-compare.js
 * Compare XP-target candidates using the same heuristic as xp-all.js.
 *
 * Shows:
 *   - Required hacking level
 *   - Weaken time (min security, max money if Formulas.exe is present)
 *   - reqHack / weakenTime score
 *
 * Usage:
 *   run util/xp-target-compare.js
 *   run util/xp-target-compare.js max-hardware ecorp
 *
 * @param {NS} ns
 */
export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags([
        ["help", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    const targets = flags._.length > 0
        ? flags._
        : ["max-hardware", "ecorp", "fulcrumtech", "megacorp"];

    const useFormulas = hasFormulas(ns);
    const player = useFormulas ? ns.getPlayer() : null;

    ns.tprint("===============================================");
    ns.tprint("XP TARGET COMPARISON");
    ns.tprint("===============================================");
    ns.tprint(`Formulas.exe: ${useFormulas ? "YES" : "NO"}`);
    ns.tprint("");

    for (const host of targets) {
        if (!ns.serverExists(host)) {
            ns.tprint(`? ${host}: server does not exist`);
            continue;
        }
        if (!ns.hasRootAccess(host)) {
            ns.tprint(`? ${host}: no root access`);
            continue;
        }

        const reqHack = ns.getServerRequiredHackingLevel(host);
        let weakenTime = ns.getWeakenTime(host);

        if (useFormulas) {
            const s = ns.getServer(host);
            s.hackDifficulty = s.minDifficulty;
            s.moneyAvailable = s.moneyMax;

            weakenTime = ns.formulas.hacking.weakenTime(s, player);
        }

        const score = reqHack / weakenTime;

        ns.tprint("-----------------------------------------------");
        ns.tprint(`Server: ${host}`);
        ns.tprint(`  Required hack: ${reqHack}`);
        ns.tprint(`  Weaken time:   ${(weakenTime / 1000).toFixed(2)}s`);
        ns.tprint(`  XP score:      ${(score * 1000).toFixed(6)}  (reqHack / weakenTime)`);
    }

    ns.tprint("===============================================");
}

/** @param {NS} ns */
function printHelp(ns) {
    ns.tprint("bin/tools/xp-target-compare.js");
    ns.tprint("===============================================");
    ns.tprint("Description:");
    ns.tprint("  Compare servers using the XP target heuristic used by botnet/xp-all.js.");
    ns.tprint("");
    ns.tprint("Usage:");
    ns.tprint("  run util/xp-target-compare.js");
    ns.tprint("  run util/xp-target-compare.js <server1> <server2> ...");
    ns.tprint("");
    ns.tprint("Notes:");
    ns.tprint("  - Uses Formulas.exe if available for accurate weaken times.");
    ns.tprint("  - XP score is reqHack / weakenTime (higher is better).");
    ns.tprint("===============================================");
}

/** @param {NS} ns */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas?.hacking &&
            typeof ns.formulas.hacking.weakenTime === "function"
        );
    } catch (_e) {
        return false;
    }
}
```
/* == END FILE == */

/* == FILE: bin/tools/xp-to-next-level.js == */
```js
/** util/xp-to-next-level.js
 * Show XP needed to reach a target hacking level, plus ETA based on XP throughput.
 *
 * Uses:
 *   - Formulas.exe (ns.formulas.skills.calculateExp / calculateSkill) for exact XP thresholds.
 *   - Optional: data/xp-throughput.txt (written by ui/xp-throughput-monitor.js) for XP/sec estimate.
 *     If missing/stale, measures throughput locally over a short window.
 *
 * Usage:
 *   run util/xp-to-next-level.js                 // XP to next level (current + 1)
 *   run util/xp-to-next-level.js --delta 10      // XP to +10 levels above current
 *   run util/xp-to-next-level.js --to 2500       // XP to absolute level 2500
 *
 * Notes:
 *   - If both --to and --delta are provided, --to is preferred.
 *   - Requires Formulas.exe for accurate XP calculations.
 *
 * @param {NS} ns
 */
export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags([
        ["help", false],
        ["to", 0],          // absolute target level
        ["delta", 0],       // levels above current
        ["sample", 10],     // seconds to locally sample XP/sec if file is missing/stale
        ["no-file", false], // ignore data/xp-throughput.txt and always do local sampling
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    const METRIC_FILE = "data/xp-throughput.txt";

    const player = ns.getPlayer();
    const currentLevel = getHackLevel(ns, player);
    const currentXp = getHackXp(player);

    let targetLevel;

    const to = Number(flags.to) || 0;
    const delta = Number(flags.delta) || 0;

    if (to > 0 && delta > 0) {
        ns.tprint("?? Both --to and --delta provided; preferring --to.");
    }

    if (to > 0) {
        targetLevel = to;
    } else if (delta > 0) {
        targetLevel = currentLevel + delta;
    } else {
        targetLevel = currentLevel + 1; // default: next level only
    }

    if (!Number.isFinite(targetLevel) || targetLevel <= currentLevel) {
        ns.tprint("? Target level must be greater than your current level.");
        ns.tprint(`   Current: ${currentLevel}, Requested: ${targetLevel}`);
        return;
    }

    if (!hasFormulas(ns)) {
        ns.tprint("? Formulas.exe not found or ns.formulas.skills unavailable.");
        ns.tprint("   This script needs Formulas.exe to compute exact XP thresholds.");
        ns.tprint("   Buy Formulas.exe from the Dark Web to enable util/xp-to-next-level.js.");
        return;
    }

    // Derive effective multiplier so XP thresholds match your displayed level.
    const effMult = getEffectiveSkillMult(ns, currentXp, currentLevel);

    const targetXp = ns.formulas.skills.calculateExp(targetLevel, effMult);
    const xpNeeded = Math.max(0, targetXp - currentXp);

    ns.tprint("=======================================");
    ns.tprint("        ?? XP To Target Level");
    ns.tprint("=======================================");
    ns.tprint(`?? Current hacking level: ${currentLevel}`);
    ns.tprint(`?? Target hacking level:  ${targetLevel}`);
    ns.tprint("---------------------------------------");
    ns.tprint(`?? Current XP:           ${formatXp(ns, currentXp)}`);
    ns.tprint(`?? XP at target level:   ${formatXp(ns, targetXp)}`);
    ns.tprint(`?? XP needed:            ${formatXp(ns, xpNeeded)} XP`);
    ns.tprint(`?? Effective skill mult: ${effMult.toFixed(6)}`);

    // ETA: prefer throughput file if fresh, otherwise sample locally for N seconds.
    const sampleSeconds = Math.max(1, Number(flags.sample) || 10);

    let throughput = null;

    if (!flags["no-file"]) {
        throughput = readThroughputFresh(ns, METRIC_FILE);
    }

    if (!throughput) {
        ns.tprint("---------------------------------------");
        ns.tprint(`?  No fresh throughput file sample found. Measuring XP/sec for ${sampleSeconds}s...`);
        const xpPerSec = await measureXpPerSec(ns, sampleSeconds, 250); // 250ms tick
        throughput = { xpPerSec, windowSeconds: sampleSeconds, ts: Date.now(), source: "local" };
    } else {
        throughput.source = "file";
    }

    if (throughput && throughput.xpPerSec > 0) {
        const seconds = xpNeeded / throughput.xpPerSec;
        const eta = formatDuration(seconds);

        ns.tprint("---------------------------------------");
        ns.tprint("?  ETA based on XP throughput");
        ns.tprint(`?? Source: ${throughput.source}`);
        ns.tprint(`?? XP/sec (avg last ${throughput.windowSeconds.toFixed(0)}s): ${throughput.xpPerSec.toFixed(2)} XP/s`);
        ns.tprint(`? Estimated time to target: ${eta}`);
    } else {
        ns.tprint("---------------------------------------");
        ns.tprint("?? Could not measure XP/sec (are you currently gaining hacking XP?).");
        ns.tprint("   Start your XP grind (weaken/grow/hack/study/contract/whatever gives hack XP), then re-run.");
    }

    ns.tprint("=======================================");
}

function printHelp(ns) {
    ns.tprint("");
    ns.tprint("bin/tools/xp-to-next-level.js");
    ns.tprint("=======================================");
    ns.tprint("Description:");
    ns.tprint("  Show hacking XP needed to reach a target level, plus an ETA.");
    ns.tprint("");
    ns.tprint("Usage:");
    ns.tprint("  run util/xp-to-next-level.js");
    ns.tprint("  run util/xp-to-next-level.js --delta <levels>");
    ns.tprint("  run util/xp-to-next-level.js --to <level>");
    ns.tprint("");
    ns.tprint("Options:");
    ns.tprint("  --help            Show this help and exit.");
    ns.tprint("  --delta <levels>  Target level = current + delta.");
    ns.tprint("  --to <level>      Target level = absolute level.");
    ns.tprint("  --sample <sec>    If throughput file missing/stale, sample XP/sec locally for this long (default 10).");
    ns.tprint("  --no-file         Ignore data/xp-throughput.txt and always do local sampling.");
    ns.tprint("");
    ns.tprint("Notes:");
    ns.tprint("  - Requires Formulas.exe for exact XP thresholds.");
    ns.tprint("  - Local sampling reads hacking XP from ns.getPlayer().exp.hacking (fallback: hacking_exp).");
    ns.tprint("=======================================");
    ns.tprint("");
}

function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas?.skills &&
            typeof ns.formulas.skills.calculateExp === "function" &&
            typeof ns.formulas.skills.calculateSkill === "function"
        );
    } catch (_e) {
        return false;
    }
}

function getHackLevel(ns, player) {
    try {
        if (typeof ns.getHackingLevel === "function") return ns.getHackingLevel();
    } catch (_e) { /* ignore */ }

    if (typeof player.hacking === "number") return player.hacking;
    if (player.skills && typeof player.skills.hacking === "number") return player.skills.hacking;
    return 0;
}

function getHackXp(player) {
    if (player.exp && typeof player.exp.hacking === "number") return player.exp.hacking;
    if (typeof player.hacking_exp === "number") return player.hacking_exp;
    return 0;
}

function getEffectiveSkillMult(ns, currentXp, currentLevel) {
    try {
        const baseLevel = ns.formulas.skills.calculateSkill(currentXp, 1);
        if (!Number.isFinite(baseLevel) || baseLevel <= 0) return 1;

        const mult = currentLevel / baseLevel;
        if (!Number.isFinite(mult) || mult <= 0) return 1;

        return mult;
    } catch (_e) {
        return 1;
    }
}

/**
 * Read throughput and reject stale samples.
 * "Fresh" means ts is within ~2 windows of now.
 */
function readThroughputFresh(ns, file) {
    try {
        if (!ns.fileExists(file, "home")) return null;
        const text = ns.read(file);
        if (!text) return null;

        const data = JSON.parse(text);
        if (!data || typeof data.xpPerSec !== "number") return null;

        const windowSeconds = Number(data.windowSeconds) || 0;
        const ts = Number(data.ts) || 0;

        if (!Number.isFinite(ts) || ts <= 0) return null;
        if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) return null;

        const ageSec = (Date.now() - ts) / 1000;
        if (ageSec > windowSeconds * 2) return null;

        return { xpPerSec: data.xpPerSec, windowSeconds, ts };
    } catch (_e) {
        return null;
    }
}

/**
 * Measure hacking XP/sec locally by sampling hacking XP over a short window.
 * Uses multiple ticks to average out update cadence.
 */
async function measureXpPerSec(ns, durationSeconds, tickMs) {
    const startT = Date.now();
    const startXp = getHackXp(ns.getPlayer());

    let lastXp = startXp;

    // Take intermediate samples so we can detect resets / backwards movement.
    while (Date.now() - startT < durationSeconds * 1000) {
        await ns.sleep(tickMs);

        const xp = getHackXp(ns.getPlayer());
        if (xp < lastXp) {
            // Reset/aug install/etc during measurement -> treat as unusable.
            return 0;
        }
        lastXp = xp;
    }

    const endT = Date.now();
    const endXp = getHackXp(ns.getPlayer());

    const dt = (endT - startT) / 1000;
    const dx = endXp - startXp;

    if (dt <= 0 || dx <= 0) return 0;
    return dx / dt;
}

function formatXp(ns, xp) {
    if (typeof ns.nFormat === "function") {
        return ns.nFormat(xp, "0,0.00") + ` (${xp.toFixed(2)})`;
    }
    return xp.toFixed(2);
}

function formatDuration(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));

    const days = Math.floor(totalSeconds / 86400);
    totalSeconds -= days * 86400;

    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds -= hours * 3600;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(" ");
}
```
/* == END FILE == */

/* == FILE: bin/ui/asset-ui.js == */
```js
/**
 * wse/asset-ui.js
 *
 * Always-on asset dashboard:
 *  - Cash on hand
 *  - Long stock market value
 *  - Long liquidation value (bid if available)
 *  - Short close cost (ask if available)
 *  - NET liquidation value if all positions were closed now
 *
 * No flags. No modes. Just truth.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  if (!ns.stock || typeof ns.stock.getSymbols !== "function") {
    ns.tprint("ERROR: Stock API not available.");
    return;
  }

  const symbols = ns.stock.getSymbols();
  const interval = 6_000;

  const hasBid =
    typeof ns.stock.getBidPrice === "function" ||
    typeof ns.stock.getStockBidPrice === "function";

  const hasAsk =
    typeof ns.stock.getAskPrice === "function" ||
    typeof ns.stock.getStockAskPrice === "function";

  while (true) {
    const snap = getSnapshot(ns, symbols);
    render(ns, snap, { hasBid, hasAsk });
    await ns.sleep(interval);
  }
}

// ---------------------------------------------------------------------------
// Snapshot logic
// ---------------------------------------------------------------------------

function getSnapshot(ns, symbols) {
  const cash = ns.getServerMoneyAvailable("home");

  let longMarket = 0;
  let longLiquidation = 0;
  let shortCloseCost = 0;

  const rows = [];

  for (const sym of symbols) {
    const price = ns.stock.getPrice(sym);
    const bid = getBid(ns, sym);
    const ask = getAsk(ns, sym);

    const [longShares, longAvg, shortShares, shortAvg] =
      ns.stock.getPosition(sym);

    if (longShares > 0) {
      const mkt = longShares * price;
      const liq = longShares * (bid ?? price);
      longMarket += mkt;
      longLiquidation += liq;

      rows.push({
        sym,
        type: "LONG",
        shares: longShares,
        avg: longAvg,
        price,
        value: mkt,
        liquidation: liq,
      });
    }

    if (shortShares > 0) {
      const close = shortShares * (ask ?? price);
      shortCloseCost += close;

      rows.push({
        sym,
        type: "SHORT",
        shares: shortShares,
        avg: shortAvg,
        price,
        closeCost: close,
      });
    }
  }

  const netLiquidation =
    cash + longLiquidation - shortCloseCost;

  return {
    cash,
    longMarket,
    longLiquidation,
    shortCloseCost,
    netLiquidation,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(ns, s, caps) {
  ns.clearLog();

  ns.print("============================================================");
  ns.print("WSE ASSET DASHBOARD (AUTOMATIC)");
  ns.print("============================================================");

  ns.print(`Cash on hand:               ${fmtMoney(ns, s.cash)}`);
  ns.print(`Long stocks (market):       ${fmtMoney(ns, s.longMarket)}`);
  ns.print(
    `Long stocks (liquidation):  ${fmtMoney(ns, s.longLiquidation)} ` +
      `(${caps.hasBid ? "bid" : "price"})`,
  );
  ns.print(
    `Short close cost:           -${fmtMoney(ns, s.shortCloseCost)} ` +
      `(${caps.hasAsk ? "ask" : "price"})`,
  );

  ns.print("------------------------------------------------------------");
  ns.print(
    `NET LIQUIDATION VALUE:      ${fmtMoney(ns, s.netLiquidation)}`,
  );
  ns.print("============================================================");

  if (!s.rows.length) {
    ns.print("");
    ns.print("(No open stock positions.)");
    return;
  }

  ns.print("");
  ns.print("Open Positions");
  ns.print("------------------------------------------------------------");

  for (const r of s.rows) {
    if (r.type === "LONG") {
      ns.print(
        `[${r.sym}] LONG  ${r.shares} @ ${fmtMoney(ns, r.avg)} | ` +
          `mkt=${fmtMoney(ns, r.value)} liq=${fmtMoney(ns, r.liquidation)}`,
      );
    } else {
      ns.print(
        `[${r.sym}] SHORT ${r.shares} @ ${fmtMoney(ns, r.avg)} | ` +
          `closeâ‰ˆ${fmtMoney(ns, r.closeCost)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Price helpers
// ---------------------------------------------------------------------------

function getBid(ns, sym) {
  if (typeof ns.stock.getBidPrice === "function")
    return ns.stock.getBidPrice(sym);
  if (typeof ns.stock.getStockBidPrice === "function")
    return ns.stock.getStockBidPrice(sym);
  return null;
}

function getAsk(ns, sym) {
  if (typeof ns.stock.getAskPrice === "function")
    return ns.stock.getAskPrice(sym);
  if (typeof ns.stock.getStockAskPrice === "function")
    return ns.stock.getStockAskPrice(sym);
  return null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtMoney(ns, v) {
  if (typeof ns.formatMoney === "function") return ns.formatMoney(v);
  return `$${ns.formatNumber(v)}`;
}
```
/* == END FILE == */

/* == FILE: bin/ui/controller-hud.js == */
```js
/** @param {NS} ns */
/*
 * /bin/ui/controller-hud.js
 *
 * Description
 *  Unified controller HUD (Tail dashboard) rendered as ONE continuous report:
 *   1) UI ops dashboard (report header: player/money/RAM + trends)
 *   2) timed-net-batcher-ui summary (active targets + target status + classification)
 *   3) WSE asset-dashboard summary
 *   4) gang summary (or Karma-Watch fallback)
 *   5) hacknet summary
 *   6) bbOS services summary (ASCII-only; no mojibake; oneshots show IDLE)
 *
 * Notes
 *  - Read-only: does not start/stop services.
 *  - Trend fix: primary "Income" uses ns.getTotalScriptIncome() (not distorted by spending).
 *    Optional CashÎ” and NetWorthÎ” are rolling-window slopes to diagnose spending / net worth changes.
 *
 * Syntax
 *  run /bin/ui/controller-hud.js
 *  run /bin/ui/controller-hud.js --interval 1000
 *  run /bin/ui/controller-hud.js --help
 */

import { getServiceRegistry } from "/lib/os/service-registry.js";
import {
    DEFAULT_SERVICE_CONFIG_PATH,
    normalizeDataPath,
    loadServiceConfig,
    getEffectiveEnabledMap,
} from "/lib/os/service-config.js";

const FLAGS = [
    ["help", false],

    // UI
    ["interval", 1500],
    ["popout", true],
    ["once", false],

    // Batcher section
    ["batchTarget", ""],        // optional: pin a target (otherwise: most common active target)
    ["maxActiveTargets", 3],    // keep it readable
    ["workerScripts", "workers/hwgw/batch-hack.js,workers/hwgw/batch-grow.js,workers/hwgw/batch-weaken.js"],

    // Service status scope
    ["host", "home"],
    ["allHosts", false],

    // Trend sampling
    ["trendWindowSec", 120],
    ["maxSamples", 240],
    ["showCashDelta", true],      // show cash slope (useful but not "income")
    ["showNetWorthDelta", true],  // uses WSE net liquidation if available

    // Services rendering
    ["oneshotKeys", "backdoorJob,contractsJob"], // treat as oneshot jobs -> IDLE when not running
];

export async function main(ns) {
    const flags = ns.flags(FLAGS);
    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");
    ns.clearLog();

    if (flags.popout) {
        if (ns.ui?.openTail) ns.ui.openTail();
        else ns.tail();
    }

    const interval = Math.max(250, Number(flags.interval) || 1500);

    const cashTrend = makeTrend(ns, flags, {
        file: "data/hud-cash-trend.txt",
        sampleFn: () => ns.getServerMoneyAvailable("home"),
    });

    const netWorthTrend = makeTrend(ns, flags, {
        file: "data/hud-networth-trend.txt",
        sampleFn: () => computeNetLiquidation(ns), // may return null if no stock API
        allowNull: true,
    });

    while (true) {
        ns.clearLog();

        cashTrend.sample();
        netWorthTrend.sample();

        // Safety net: one bad section shouldn't kill the whole HUD
        try {
            renderReport(ns, flags, cashTrend, netWorthTrend);
        } catch (e) {
            ns.print("=================================================================");
            ns.print(`[controller-hud] WARN render error: ${String(e)}`);
            ns.print("=================================================================");
        }

        if (flags.once) return;
        await ns.sleep(interval);
    }
}

function renderReport(ns, flags, cashTrend, netWorthTrend) {
    const now = new Date();
    const player = ns.getPlayer();

    // -------------------------------
    // REPORT HEADER (Ops dashboard)
    // -------------------------------
    const money = player.money ?? ns.getServerMoneyAvailable("home");
    const hackLvl = player.skills?.hacking ?? player.hacking ?? ns.getHackingLevel();

    const homeMax = ns.getServerMaxRam("home");
    const homeUsed = ns.getServerUsedRam("home");
    const homeFree = Math.max(0, homeMax - homeUsed);

    // Trend fix: use script income rate (not distorted by spending)
    const [scriptMoneyPerSec] = safeArr(() => ns.getTotalScriptIncome(), [NaN]);

    const xpRate = readXpThroughput(ns, "data/xp-throughput.txt");

    const cashDeltaPerSec = cashTrend.ratePerSec();
    const netWorthDeltaPerSec = netWorthTrend.ratePerSec(); // may be NaN if not available

    ns.print("=================================================================");
    ns.print(`bbOS Controller Report | ${now.toLocaleTimeString()}`);
    ns.print("-----------------------------------------------------------------");
    ns.print(`Player: ${player.name ?? "Player"}   |   Hacking: ${hackLvl}`);
    ns.print(`Money:  ${fmtMoney(ns, money)}`);
    ns.print(`Home RAM: ${fmtRam(homeUsed)} / ${fmtRam(homeMax)} GB (free ${fmtRam(homeFree)} GB)`);

    const incomeStr = Number.isFinite(scriptMoneyPerSec) ? `${fmtMoney(ns, scriptMoneyPerSec)}/s` : "n/a";

    let trendLine = `Income: ${padLeftShort(incomeStr, 14)}`;

    if (flags.showNetWorthDelta) {
        const nwStr = Number.isFinite(netWorthDeltaPerSec) ? `${fmtMoney(ns, netWorthDeltaPerSec)}/s` : "n/a";
        trendLine += ` | NetWorthÎ”: ${padLeftShort(nwStr, 14)}`;
    }
    if (flags.showCashDelta) {
        const cashStr = Number.isFinite(cashDeltaPerSec) ? `${fmtMoney(ns, cashDeltaPerSec)}/s` : "n/a";
        trendLine += ` | CashÎ”: ${padLeftShort(cashStr, 14)}`;
    }
    if (xpRate) {
        trendLine += ` | XP: ${xpRate.xpPerSec.toFixed(2)} XP/s`;
    }
    ns.print(trendLine);

    ns.print("=================================================================");
    ns.print("");

    // Order you requested, but rendered as one â€œfluid reportâ€
    renderBatcherSection(ns, flags);
    ns.print("");
    renderWseAssetsSection(ns);
    ns.print("");
    renderGangOrKarmaSection(ns);
    ns.print("");
    renderHacknetSection(ns);
    ns.print("");
    renderBladeburnerSection(ns);
    ns.print("");
    renderServicesSection(ns, flags);
    ns.print("");
}

// -----------------------------------------------------------------------------
// 2) timed-net-batcher-ui summary (readable / compact)
// -----------------------------------------------------------------------------
function renderBatcherSection(ns, flags) {
    const workerScripts = String(flags.workerScripts || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const hackScript = workerScripts[0] || "workers/hwgw/batch-hack.js";
    const growScript = workerScripts[1] || "workers/hwgw/batch-grow.js";
    const weakScript = workerScripts[2] || "workers/hwgw/batch-weaken.js";

    // thresholds (match your earlier UI behavior)
    const MONEY_THRESHOLD = 0.90;
    const SEC_TOLERANCE = 0.90;
    const LOWRAM_MONEY_THRESHOLD = 0.90;
    const LOWRAM_SEC_TOLERANCE = 1.50;
    const PSERV_MIN_TOTAL_RAM = 64;

    const snap = getTimedBatcherSnapshot(ns, {
        pinnedTarget: String(flags.batchTarget || "").trim(),
        hackScript,
        growScript,
        weakScript,
        MONEY_THRESHOLD,
        SEC_TOLERANCE,
        LOWRAM_MONEY_THRESHOLD,
        LOWRAM_SEC_TOLERANCE,
        PSERV_MIN_TOTAL_RAM,
    });

    ns.print("== Targets ==");
    if (!snap.activeTargets.length) {
        ns.print("  Active: (no batch workers detected)");
        ns.print("  Tip: start batcher, or pass --batchTarget <host>");
        return;
    }

    const maxActive = Math.max(1, Number(flags.maxActiveTargets) || 3);
    const activeLine = snap.activeTargets
        .slice(0, maxActive)
        .map((x) => `${x.target}:${x.threads}`)
        .join(" | ");

    ns.print(`  Active: ${activeLine}`);

    if (!snap.target) {
        ns.print("  Target: (unknown)");
        return;
    }

    ns.print(`  Target: ${snap.target}`);

    if (snap.targetStats) {
        const ts = snap.targetStats;
        ns.print(
            `  Money:  ${fmtMoney(ns, ts.money)} / ${fmtMoney(ns, ts.max)} (${(ts.moneyRatio * 100).toFixed(2)}%)`
        );
        ns.print(
            `  Sec:    ${ts.sec.toFixed(2)} (min ${ts.minSec.toFixed(2)})  Î”=${ts.secDelta.toFixed(2)}`
        );
    }

    if (snap.prepState) {
        const ps = snap.prepState;
        ns.print(
            `  Mode:   ${ps.prepping ? "PREP" : "MONEY"}  (money>=${(ps.moneyThresh * 100).toFixed(0)}%  secÎ”<=${ps.secThresh.toFixed(2)})`
        );
    }
}

function getTimedBatcherSnapshot(ns, cfg) {
    const purchased = ns.getPurchasedServers();
    const hosts = ["home", ...purchased];

    let totalPservRam = 0;
    for (const h of purchased) totalPservRam += ns.getServerMaxRam(h);

    const desiredMode = totalPservRam >= cfg.PSERV_MIN_TOTAL_RAM ? "HYBRID" : "HOME";
    const lowramLikely = desiredMode === "HOME";

    const active = new Map(); // target -> threads

    for (const host of hosts) {
        const procs = safeArr(() => ns.ps(host), []);
        for (const p of procs) {
            if (p.filename !== cfg.hackScript && p.filename !== cfg.growScript && p.filename !== cfg.weakScript) continue;
            const target = String(p.args?.[0] ?? "").trim();
            if (!target) continue;
            active.set(target, (active.get(target) || 0) + (p.threads || 0));
        }
    }

    const activeTargets = Array.from(active.entries())
        .map(([target, threads]) => ({ target, threads }))
        .sort((a, b) => b.threads - a.threads || a.target.localeCompare(b.target));

    const pinned = String(cfg.pinnedTarget || "");
    const target = pinned || (activeTargets[0]?.target ?? "");

    const targetStats = target ? getTargetStats(ns, target) : null;

    const moneyThresh = lowramLikely ? cfg.LOWRAM_MONEY_THRESHOLD : cfg.MONEY_THRESHOLD;
    const secThresh = lowramLikely ? cfg.LOWRAM_SEC_TOLERANCE : cfg.SEC_TOLERANCE;

    let prepState = null;
    if (targetStats) {
        const moneyOk = targetStats.moneyRatio >= moneyThresh;
        const secOk = targetStats.secDelta <= secThresh;
        prepState = {
            lowramLikely,
            moneyThresh,
            secThresh,
            moneyOk,
            secOk,
            prepping: !(moneyOk && secOk),
        };
    }

    return { activeTargets, target, targetStats, prepState };
}

function getTargetStats(ns, target) {
    const money = ns.getServerMoneyAvailable(target);
    const max = ns.getServerMaxMoney(target);
    const sec = ns.getServerSecurityLevel(target);
    const minSec = ns.getServerMinSecurityLevel(target);

    const moneyRatio = max > 0 ? money / max : 0;
    const secDelta = sec - minSec;

    return { money, max, moneyRatio, sec, minSec, secDelta };
}

// -----------------------------------------------------------------------------
// 3) WSE assets (compact)  [FIXED: WSE gating + safe calls]
// -----------------------------------------------------------------------------
function renderWseAssetsSection(ns) {
    ns.print("== WSE Assets ==");

    if (!ns.stock) {
        ns.print("  Status: (Stock API not available)");
        return;
    }

    // Real gate: WSE account. Without it, many ns.stock calls throw.
    if (!hasWseAccount(ns)) {
        ns.print("  Status: locked (no WSE account)");
        return;
    }

    const cash = ns.getServerMoneyAvailable("home");
    const symbols = safeStock(() => ns.stock.getSymbols(), []);

    if (!symbols.length) {
        ns.print(`  Cash:        ${fmtMoney(ns, cash)}`);
        ns.print("  Status:      (no symbols / unable to read portfolio)");
        return;
    }

    const bidFn = ns.stock.getBidPrice ?? ns.stock.getStockBidPrice;
    const askFn = ns.stock.getAskPrice ?? ns.stock.getStockAskPrice;

    let longMarket = 0;
    let longLiquidation = 0;
    let shortCloseCost = 0;

    for (const sym of symbols) {
        const price = safeStock(() => ns.stock.getPrice(sym), NaN);
        if (!Number.isFinite(price)) continue;

        const bid = typeof bidFn === "function" ? safeStock(() => bidFn(sym), null) : null;
        const ask = typeof askFn === "function" ? safeStock(() => askFn(sym), null) : null;

        const pos = safeStock(() => ns.stock.getPosition(sym), null);
        const longShares = Number(pos?.[0] ?? 0);
        const shortShares = Number(pos?.[2] ?? 0);

        if (longShares > 0) {
            longMarket += longShares * price;
            longLiquidation += longShares * (bid ?? price);
        }
        if (shortShares > 0) {
            shortCloseCost += shortShares * (ask ?? price);
        }
    }

    const netLiquidation = cash + longLiquidation - shortCloseCost;

    ns.print(`  Cash:        ${fmtMoney(ns, cash)}`);
    ns.print(`  Long (mkt):   ${fmtMoney(ns, longMarket)}`);
    ns.print(`  Long (liq):   ${fmtMoney(ns, longLiquidation)}`);
    ns.print(`  Short close: -${fmtMoney(ns, shortCloseCost)}`);
    ns.print(`  Net liq:      ${fmtMoney(ns, netLiquidation)}`);
}

// -----------------------------------------------------------------------------
// 4) Gang (or Karma) - compact
// -----------------------------------------------------------------------------
function renderGangOrKarmaSection(ns) {
    ns.print("== Gang ==");
    const hasGangApi = !!ns.gang;
    const inGang = hasGangApi && safeBool(() => ns.gang.inGang(), false);

    if (!hasGangApi || !inGang) {
        const karma = safeNum(() => ns.heart.break(), NaN);
        ns.print(`  Status: (no gang)`);
        ns.print(`  Karma:  ${Number.isFinite(karma) ? karma.toFixed(2) : "n/a"}`);
        return;
    }

    const g = safeObj(() => ns.gang.getGangInformation(), null);
    if (!g) {
        ns.print("  Status: (gang info unavailable)");
        return;
    }

    const type = g.isHacking ? "HACKING" : "COMBAT";

    const members = safeArr(() => ns.gang.getMemberNames(), []);
    const tasks = new Map();
    for (const m of members) {
        const mi = safeObj(() => ns.gang.getMemberInformation(m), null);
        if (!mi) continue;
        const t = String(mi.task || "Unassigned");
        tasks.set(t, (tasks.get(t) || 0) + 1);
    }
    const topTasks = Array.from(tasks.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([t, c]) => `${t}:${c}`)
        .join("  ");

    ns.print(`  Type:      ${type} | Faction: ${g.faction}`);
    ns.print(
        `  Territory: ${(g.territory * 100).toFixed(1)}% | Power: ${ns.formatNumber(g.power, 2)} | Warfare: ${g.territoryWarfareEngaged ? "ON" : "OFF"}`
    );
    ns.print(
        `  Wanted:    ${(g.wantedPenalty * 100).toFixed(1)}% pen | ${ns.formatNumber(g.wantedLevel, 2)} lvl | ${ns.formatNumber(g.respect, 2)} resp`
    );
    ns.print(`  Tasks:     ${topTasks || "n/a"}`);
}

// -----------------------------------------------------------------------------
// 5) Hacknet - compact
// -----------------------------------------------------------------------------
function renderHacknetSection(ns) {
    ns.print("== Hacknet ==");
    if (!ns.hacknet) {
        ns.print("  Status: (Hacknet API not available)");
        return;
    }

    const nodes = safeNum(() => ns.hacknet.numNodes(), 0);

    let total = 0;
    let min = Infinity;
    let max = 0;

    for (let i = 0; i < nodes; i++) {
        const st = ns.hacknet.getNodeStats(i);
        const p = Number(st.production || 0);
        total += p;
        min = Math.min(min, p);
        max = Math.max(max, p);
    }
    if (!Number.isFinite(min)) min = 0;

    ns.print(`  Nodes: ${nodes}`);
    ns.print(`  Prod:  ${fmtMoney(ns, total)}/s  (min ${fmtMoney(ns, min)}/s  max ${fmtMoney(ns, max)}/s)`);
}

// -----------------------------------------------------------------------------
// 6) Bladeburner - compact (BN6 / SF7+)
// -----------------------------------------------------------------------------
function renderBladeburnerSection(ns) {
    ns.print("== Bladeburner ==");

    // API gate (SF7+ or BN6)
    if (!ns.bladeburner || typeof ns.bladeburner.inBladeburner !== "function") {
        ns.print("  Status: (Bladeburner API not available)");
        return;
    }

    const inBB = safeBool(() => ns.bladeburner.inBladeburner(), false);
    if (!inBB) {
        ns.print("  Status: (not in Bladeburners)");
        return;
    }

    const rank = safeNum(() => ns.bladeburner.getRank(), NaN);
    const sp = safeNum(() => ns.bladeburner.getSkillPoints(), NaN);

    const stamina = safeArr(() => ns.bladeburner.getStamina(), [NaN, NaN]);
    const sta = Number(stamina?.[0] ?? NaN);
    const staMax = Number(stamina?.[1] ?? NaN);
    const staPct = (Number.isFinite(sta) && Number.isFinite(staMax) && staMax > 0)
        ? (sta / staMax) * 100
        : NaN;

    const city = safeStr(() => ns.bladeburner.getCity(), "n/a");
    const chaos = safeNum(() => ns.bladeburner.getCityChaos(city), NaN);

    const cur = safeObj(() => ns.bladeburner.getCurrentAction(), null);
    const curType = String(cur?.type ?? "n/a");
    const curName = String(cur?.name ?? "n/a");

    // Next BlackOp (best-effort; safe if API differs)
    const blackOps = safeArr(() => ns.bladeburner.getBlackOpNames(), []);
    let nextBlackOp = null;
    for (const name of blackOps) {
        const remaining = safeNum(() => ns.bladeburner.getActionCountRemaining("BlackOp", name), 0);
        if (remaining > 0) {
            nextBlackOp = name;
            break;
        }
    }

    const nextReq = nextBlackOp ? safeNum(() => ns.bladeburner.getBlackOpRank(nextBlackOp), NaN) : NaN;
    const nextChancePair = nextBlackOp
        ? safeArr(() => ns.bladeburner.getActionEstimatedSuccessChance("BlackOp", nextBlackOp), [NaN, NaN])
        : [NaN, NaN];

    const cLo = Number(nextChancePair?.[0] ?? NaN);
    const cHi = Number(nextChancePair?.[1] ?? NaN);

    ns.print(`  Rank:     ${Number.isFinite(rank) ? ns.formatNumber(rank, 2) : "n/a"} | SP: ${Number.isFinite(sp) ? ns.formatNumber(sp, 0) : "n/a"}`);
    ns.print(`  Stamina:  ${Number.isFinite(sta) ? ns.formatNumber(sta, 1) : "n/a"} / ${Number.isFinite(staMax) ? ns.formatNumber(staMax, 1) : "n/a"} (${Number.isFinite(staPct) ? staPct.toFixed(1) + "%" : "n/a"})`);
    ns.print(`  City:     ${city} | Chaos: ${Number.isFinite(chaos) ? chaos.toFixed(1) : "n/a"}`);
    ns.print(`  Action:   ${curType}:${curName}`);

    if (nextBlackOp) {
        const reqStr = Number.isFinite(nextReq) ? ns.formatNumber(nextReq, 0) : "n/a";
        const chStr = (Number.isFinite(cLo) && Number.isFinite(cHi))
            ? `${(cLo * 100).toFixed(1)}â€“${(cHi * 100).toFixed(1)}%`
            : "n/a";
        ns.print(`  Next BO:  ${nextBlackOp} | ReqRank: ${reqStr} | Chance: ${chStr}`);
    } else {
        ns.print("  Next BO:  (none available / all complete)");
    }
}


// -----------------------------------------------------------------------------
// 7) bbOS Services (ASCII-only; oneshots show IDLE)
// -----------------------------------------------------------------------------
function renderServicesSection(ns, flags) {
    ns.print("== bbOS Services ==");

    const oneshotKeys = new Set(
        String(flags.oneshotKeys || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    );

    const registry = safeArr(() => getServiceRegistry(), []);
    const conf = safeObj(() => loadServiceConfig(ns, normalizeDataPath(DEFAULT_SERVICE_CONFIG_PATH)), {});
    const effective = safeObj(() => getEffectiveEnabledMap(registry, conf), {});
    const running = getRunningScriptSet(ns, flags);

    // Compute max key length for alignment
    let keyPad = 10;
    for (const svc of registry) {
        if (!svc.managed) continue;
        keyPad = Math.max(keyPad, String(svc.key).length);
    }

    for (const svc of registry) {
        if (!svc.managed) continue;

        const key = String(svc.key);
        const script = String(svc.script || "").replace(/^\/+/, "");
        const enabled = !!effective[key];
        const isRunning = running.has(script);
        const isOneshot = oneshotKeys.has(key);

        const tag = !enabled
            ? "[DIS]"
            : isRunning
                ? "[RUN]"
                : isOneshot
                    ? "[IDLE]"
                    : "[DOWN]";

        ns.print(`  ${tag} ${padRight(key, keyPad)}  ${script}`);
    }
}

function getRunningScriptSet(ns, flags) {
    const set = new Set();
    const host = String(flags.host || "home");

    if (flags.allHosts) {
        for (const h of discoverHosts(ns)) {
            for (const p of safeArr(() => ns.ps(h), [])) {
                set.add(String(p.filename || "").replace(/^\/+/, ""));
            }
        }
        return set;
    }

    for (const p of safeArr(() => ns.ps(host), [])) {
        set.add(String(p.filename || "").replace(/^\/+/, ""));
    }
    return set;
}

function discoverHosts(ns) {
    const out = [];
    const seen = new Set(["home"]);
    const q = ["home"];
    while (q.length) {
        const cur = q.shift();
        out.push(cur);
        for (const n of safeArr(() => ns.scan(cur), [])) {
            if (!seen.has(n)) {
                seen.add(n);
                q.push(n);
            }
        }
    }
    return out;
}

// -----------------------------------------------------------------------------
// Trend sampling (generic) + xp-throughput file read
// -----------------------------------------------------------------------------
function makeTrend(ns, flags, cfg) {
    const windowSec = Math.max(10, Number(flags.trendWindowSec) || 120);
    const maxSamples = Math.max(10, Number(flags.maxSamples) || 240);
    const file = String(cfg.file || "data/hud-trend.txt");
    const allowNull = !!cfg.allowNull;
    const sampleFn = cfg.sampleFn;

    /** @type {{ts:number, value:number}[]} */
    let samples = [];

    try {
        const raw = ns.read(file);
        if (raw) {
            const parsed = JSON.parse(String(raw));
            if (Array.isArray(parsed)) {
                samples = parsed.filter((x) => x && Number.isFinite(x.ts) && Number.isFinite(x.value));
            }
        }
    } catch { /* ignore */ }

    function sample() {
        const ts = Date.now();
        let value;
        try {
            value = sampleFn();
        } catch {
            value = null;
        }

        if (value === null || value === undefined) {
            if (!allowNull) return;
            // don't add a sample if unavailable (prevents bogus slopes)
            return;
        }
        if (!Number.isFinite(value)) return;

        samples.push({ ts, value });

        const cutoff = ts - windowSec * 1000;
        while (samples.length && samples[0].ts < cutoff) samples.shift();
        if (samples.length > maxSamples) samples = samples.slice(samples.length - maxSamples);

        try { ns.write(file, JSON.stringify(samples), "w"); } catch { /* ignore */ }
    }

    function ratePerSec() {
        if (samples.length < 2) return NaN;
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = (last.ts - first.ts) / 1000;
        if (dt <= 0) return NaN;
        return (last.value - first.value) / dt;
    }

    return { sample, ratePerSec };
}

function readXpThroughput(ns, file) {
    try {
        const raw = ns.read(file);
        if (!raw) return null;
        const p = JSON.parse(String(raw));
        if (!p || !Number.isFinite(p.xpPerSec)) return null;

        const ageSec = (Date.now() - Number(p.ts || 0)) / 1000;
        if (!Number.isFinite(ageSec) || ageSec > 15 * 60) return null;

        return { xpPerSec: Number(p.xpPerSec), ts: Number(p.ts || 0) };
    } catch {
        return null;
    }
}

// Compute net liquidation value (cash + long liquidation - short close)
// Returns null if Stock API is not available / accessible.
// [FIXED: WSE gating + safe calls]
function computeNetLiquidation(ns) {
    if (!ns.stock) return null;
    if (!hasWseAccount(ns)) return null;

    const cash = ns.getServerMoneyAvailable("home");
    const symbols = safeStock(() => ns.stock.getSymbols(), []);
    if (!symbols.length) return cash;

    const bidFn = ns.stock.getBidPrice ?? ns.stock.getStockBidPrice;
    const askFn = ns.stock.getAskPrice ?? ns.stock.getStockAskPrice;

    let longLiquidation = 0;
    let shortCloseCost = 0;

    for (const sym of symbols) {
        const price = safeStock(() => ns.stock.getPrice(sym), NaN);
        if (!Number.isFinite(price)) continue;

        const bid = typeof bidFn === "function" ? safeStock(() => bidFn(sym), null) : null;
        const ask = typeof askFn === "function" ? safeStock(() => askFn(sym), null) : null;

        const pos = safeStock(() => ns.stock.getPosition(sym), null);
        const longShares = Number(pos?.[0] ?? 0);
        const shortShares = Number(pos?.[2] ?? 0);

        if (longShares > 0) {
            longLiquidation += longShares * (bid ?? price);
        }
        if (shortShares > 0) {
            shortCloseCost += shortShares * (ask ?? price);
        }
    }

    return cash + longLiquidation - shortCloseCost;
}

// -----------------------------------------------------------------------------
// Formatting / utils
// -----------------------------------------------------------------------------
function fmtMoney(ns, v) {
    if (!Number.isFinite(v)) return "n/a";
    if (typeof ns.formatMoney === "function") return ns.formatMoney(v);
    return "$" + ns.formatNumber(v, 2);
}

function fmtRam(gb) {
    if (!Number.isFinite(gb)) return "n/a";
    return Number(gb).toFixed(1);
}

function padRight(s, n) {
    s = String(s);
    return s.length >= n ? s : s + " ".repeat(n - s.length);
}

// Keeps header line from jumping around when values change length
function padLeftShort(s, n) {
    s = String(s);
    return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function safeArr(fn, fallback) {
    try {
        const v = fn();
        return Array.isArray(v) ? v : fallback;
    } catch { return fallback; }
}
function safeObj(fn, fallback) {
    try {
        const v = fn();
        return v && typeof v === "object" ? v : fallback;
    } catch { return fallback; }
}
function safeNum(fn, fallback) {
    try {
        const v = fn();
        return Number.isFinite(v) ? v : fallback;
    } catch { return fallback; }
}
function safeBool(fn, fallback) {
    try {
        const v = fn();
        return typeof v === "boolean" ? v : fallback;
    } catch { return fallback; }
}

function safeStr(fn, fallback) {
    try {
        const v = fn();
        return (v === null || v === undefined) ? fallback : String(v);
    } catch { return fallback; }
}

// -------------------------------
// Stock access helpers (WSE gating)
// -------------------------------
function hasWseAccount(ns) {
    if (!ns.stock) return false;
    return safeBool(() => typeof ns.stock.hasWSEAccount === "function" && ns.stock.hasWSEAccount(), false);
}
function safeStock(fn, fallback = null) {
    try { return fn(); } catch { return fallback; }
}


/** @param {NS} ns */
function printHelp(ns) {
    ns.tprint("/bin/ui/controller-hud.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Unified controller HUD rendered as one continuous report.");
    ns.tprint("  Trend fix: Income uses ns.getTotalScriptIncome() (not cash delta).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run /bin/ui/controller-hud.js");
    ns.tprint("  run /bin/ui/controller-hud.js --interval 1000");
    ns.tprint("  run /bin/ui/controller-hud.js --batchTarget phantasy");
    ns.tprint("  run /bin/ui/controller-hud.js --allHosts true");
    ns.tprint("  run /bin/ui/controller-hud.js --help");
    ns.tprint("");
    ns.tprint("Flags");
    ns.tprint("  --interval <ms>           Refresh cadence (default 1500)");
    ns.tprint("  --popout true|false       Open Tail window (default true)");
    ns.tprint("  --once true|false         Render once and exit (default false)");
    ns.tprint("  --batchTarget <host>      Pin target for Target Status (default auto)");
    ns.tprint("  --maxActiveTargets <n>    Show top N active targets (default 3)");
    ns.tprint("  --host <name>             Process scan host when allHosts=false (default home)");
    ns.tprint("  --allHosts true|false     Scan all discovered hosts for running services (default false)");
    ns.tprint("  --trendWindowSec <sec>    Rolling window for CashÎ” / NetWorthÎ” (default 120)");
    ns.tprint("  --showCashDelta t|f       Show cash slope line (default true)");
    ns.tprint("  --showNetWorthDelta t|f   Show net worth slope line (default true)");
    ns.tprint("  --oneshotKeys <csv>       Service keys treated as oneshots (default backdoorJob,contractsJob)");
}
```
/* == END FILE == */

/* == FILE: bin/ui/gang-ui.js == */
```js
/**
 * gang/gang-ui.js
 *
 * Always-on gang dashboard (live tail):
 *  - Gang status: territory, power, warfare, wanted penalty, rates
 *  - Task distribution
 *  - Combat-gear coverage (avg / worst / best)
 *  - Territory table: other gangs by territory + clash win chances
 *  - Compact member table (power-sorted)
 *
 * No modes. No micromanagement. Just gang truth.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["interval", 3000],
  ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  if (flags.help) return printHelp(ns);

  ns.disableLog("ALL");
  ns.ui.openTail();

  if (!ns.gang || typeof ns.gang.getGangInformation !== "function") {
    ns.tprint("ERROR: Gang API not available.");
    return;
  }
  if (!ns.gang.inGang()) {
    ns.tprint("ERROR: You are not in a gang.");
    return;
  }

  const interval = Math.max(250, Number(flags.interval) || 3000);

  while (true) {
    const snap = getSnapshot(ns);
    render(ns, snap);
    await ns.sleep(interval);
  }
}

// ---------------------------------------------------------------------------
// Snapshot logic
// ---------------------------------------------------------------------------

function getSnapshot(ns) {
  const g = ns.gang.getGangInformation();
  const names = ns.gang.getMemberNames();

  // Members
  const members = names.map((name) => {
    const m = ns.gang.getMemberInformation(name);
    const minC = Math.min(m.str, m.def, m.dex, m.agi);
    const power = (m.str + m.def + m.dex + m.agi);
    return { name, m, minC, power };
  });

  members.sort((a, b) => b.power - a.power || a.name.localeCompare(b.name));

  // Tasks distribution
  const tasks = new Map();
  for (const { m } of members) {
    const t = m.task || "(none)";
    tasks.set(t, (tasks.get(t) || 0) + 1);
  }

  // Combat gear list (items that affect str/def/dex/agi)
  const combatEquip = ns.gang.getEquipmentNames()
    .map((name) => ({
      name,
      stats: ns.gang.getEquipmentStats(name) || {},
    }))
    .filter((e) =>
      (e.stats.str || 0) > 0 ||
      (e.stats.def || 0) > 0 ||
      (e.stats.dex || 0) > 0 ||
      (e.stats.agi || 0) > 0
    );

  const totalCombatEquip = combatEquip.length;

  // Gear coverage per member
  let avgPct = 0;
  let worst = { name: "(none)", pct: 1, have: totalCombatEquip, total: totalCombatEquip };
  let best = { name: "(none)", pct: 0, have: 0, total: totalCombatEquip };

  const gearRows = [];
  for (const { name, m } of members) {
    const owned = new Set([...(m.upgrades || []), ...(m.augmentations || [])]);

    let have = 0;
    for (const e of combatEquip) if (owned.has(e.name)) have++;

    const pct = totalCombatEquip > 0 ? have / totalCombatEquip : 1;
    avgPct += pct;

    if (pct < worst.pct) worst = { name, pct, have, total: totalCombatEquip };
    if (pct > best.pct) best = { name, pct, have, total: totalCombatEquip };

    gearRows.push({
      name,
      pct,
      have,
      total: totalCombatEquip,
      upgrades: (m.upgrades || []).length,
      augs: (m.augmentations || []).length,
    });
  }

  avgPct = members.length ? (avgPct / members.length) : 1;

  // Territory / clash table
  const otherInfo = ns.gang.getOtherGangInformation();
  const gangs = [];
  const chances = [];

  for (const gangName of Object.keys(otherInfo)) {
    const info = otherInfo[gangName];
    const chance = safeChance(ns, gangName);

    const isUs = gangName === g.faction;
    gangs.push({
      name: gangName,
      territory: info.territory ?? 0,
      power: info.power ?? 0,
      chance,
      isUs,
    });

    // Exclude self from summary stats (self is always 50%)
    if (!isUs && Number.isFinite(chance)) chances.push(chance);
  }

  gangs.sort((a, b) => (b.territory - a.territory) || a.name.localeCompare(b.name));

  chances.sort((a, b) => a - b);
  const clashBest = chances.length ? chances[chances.length - 1] : 0;
  const clashWorst = chances.length ? chances[0] : 0;
  const clashMedian = chances.length ? chances[Math.floor(chances.length / 2)] : 0;

  const gte62 = chances.filter((c) => c >= 0.62).length;

  return {
    gang: {
      faction: g.faction,
      type: g.isHacking ? "HACKING" : "COMBAT",
      territory: g.territory,
      power: g.power,
      warfare: g.territoryWarfareEngaged,
      wantedPenalty: g.wantedPenalty,
      wantedLevel: g.wantedLevel,
      respect: g.respect,
      moneyGainRate: g.moneyGainRate,
      respectGainRate: g.respectGainRate,
      wantedGainRate: g.wantedGainRate,
    },
    members,
    tasks,
    equip: {
      totalCombatEquip,
      avgPct,
      worst,
      best,
      gearRows,
    },
    territory: {
      gangs,
      clashBest,
      clashMedian,
      clashWorst,
      gte62,
      n: chances.length,
    },
  };
}

function safeChance(ns, gangName) {
  try {
    const c = ns.gang.getChanceToWinClash(gangName);
    return Number.isFinite(c) ? c : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Rendering (asset-ui style)
// ---------------------------------------------------------------------------

function render(ns, s) {
  ns.clearLog();

  ns.print("============================================================");
  ns.print("GANG DASHBOARD (AUTOMATIC)");
  ns.print("============================================================");

  ns.print(`Type: ${s.gang.type} | Faction: ${s.gang.faction}`);
  ns.print(
    `Territory: ${fmtPct(s.gang.territory)} | Power: ${fmtNumber(ns, s.gang.power)} | Warfare: ${s.gang.warfare ? "ON" : "OFF"}`
  );
  ns.print(
    `Wanted Penalty: ${fmtPct(s.gang.wantedPenalty)} | Wanted: ${fmtNumber(ns, s.gang.wantedLevel)} | Respect: ${fmtNumber(ns, s.gang.respect)}`
  );

  ns.print("------------------------------------------------------------");
  ns.print(
    `Rates: ${fmtMoney(ns, s.gang.moneyGainRate)}/s | ` +
    `+${fmtNumber(ns, s.gang.respectGainRate)}/s rep | ` +
    `+${fmtNumber(ns, s.gang.wantedGainRate)}/s wanted`
  );

  ns.print("============================================================");
  ns.print("");

  // Task distribution
  ns.print("Task Distribution");
  ns.print("------------------------------------------------------------");
  ns.print(formatTaskLine(s.tasks));
  ns.print("");

  // Equipment coverage
  ns.print("Equipment Coverage (combat-stat gear)");
  ns.print("------------------------------------------------------------");
  if (s.equip.totalCombatEquip <= 0) {
    ns.print("(No combat gear items detected.)");
  } else {
    ns.print(
      `Items considered: ${s.equip.totalCombatEquip} | ` +
      `Avg: ${fmtPct(s.equip.avgPct)} | ` +
      `Worst: ${s.equip.worst.name} ${fmtPct(s.equip.worst.pct)} (${s.equip.worst.have}/${s.equip.worst.total}) | ` +
      `Best: ${s.equip.best.name} ${fmtPct(s.equip.best.pct)} (${s.equip.best.have}/${s.equip.best.total})`
    );
  }
  ns.print("");

  // Territory / clashes
  ns.print("Territory / Clash Chances");
  ns.print("------------------------------------------------------------");
  ns.print(
    `Clash chances (vs others): best=${fmtPct(s.territory.clashBest)} ` +
    `median=${fmtPct(s.territory.clashMedian)} ` +
    `worst=${fmtPct(s.territory.clashWorst)} | ` +
    `gte62=${s.territory.gte62}/${s.territory.n}`
  );
  ns.print("");

  for (const r of s.territory.gangs) {
    ns.print(
      `${r.isUs ? "* " : "  "}${padRight(r.name, 18)} ` +
      `terr=${padLeft(fmtPct(r.territory), 7)} ` +
      `power=${padLeft(fmtNumber(ns, r.power), 9)} ` +
      `win=${padLeft(fmtPct(r.chance), 7)}`
    );
  }

  ns.print("");
  ns.print("* = your gang");
  ns.print("");

  // Members table (compact)
  ns.print("Members (power desc)");
  ns.print("------------------------------------------------------------");
  ns.print(
    `${padRight("name", 12)} ${padRight("task", 20)} ` +
    `${padLeft("str", 6)} ${padLeft("def", 6)} ${padLeft("dex", 6)} ${padLeft("agi", 6)} ` +
    `${padLeft("minC", 6)} ${padLeft("rep", 8)} ${padLeft("up/aug", 7)}`
  );

  for (const r of s.members) {
    const up = (r.m.upgrades || []).length;
    const aug = (r.m.augmentations || []).length;

    ns.print(
      `${padRight(r.name, 12)} ${padRight(trimMid(r.m.task || "(none)", 20), 20)} ` +
      `${padLeft(String(Math.floor(r.m.str)), 6)} ${padLeft(String(Math.floor(r.m.def)), 6)} ` +
      `${padLeft(String(Math.floor(r.m.dex)), 6)} ${padLeft(String(Math.floor(r.m.agi)), 6)} ` +
      `${padLeft(String(Math.floor(r.minC)), 6)} ${padLeft(fmtShort(r.m.earnedRespect), 8)} ` +
      `${padLeft(`${up}/${aug}`, 7)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers / formatting
// ---------------------------------------------------------------------------

function formatTaskLine(tasks) {
  // "Territory Warfare:11 | Human Trafficking:1 | ..."
  const entries = [...tasks.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`);
  return entries.length ? entries.join(" | ") : "(none)";
}

function fmtPct(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return "n/a";
  return (v * 100).toFixed(1) + "%";
}

function fmtMoney(ns, v) {
  if (!Number.isFinite(v)) return "n/a";
  if (typeof ns.formatMoney === "function") return ns.formatMoney(v);
  return `$${ns.formatNumber(v)}`;
}

function fmtNumber(ns, v) {
  if (!Number.isFinite(v)) return "n/a";
  if (typeof ns.formatNumber === "function") return ns.formatNumber(v, 2);
  return String(v);
}

function fmtShort(n) {
  if (!Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "t";
  if (abs >= 1e9)  return (n / 1e9).toFixed(2) + "b";
  if (abs >= 1e6)  return (n / 1e6).toFixed(2) + "m";
  if (abs >= 1e3)  return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(0);
}

function padRight(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function padLeft(s, n) {
  s = String(s);
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function trimMid(s, n) {
  s = String(s);
  if (s.length <= n) return s;
  if (n <= 3) return s.slice(0, n);
  const left = Math.floor((n - 3) / 2);
  const right = n - 3 - left;
  return s.slice(0, left) + "..." + s.slice(s.length - right);
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
gang/gang-ui.js
Description:
  Always-on gang dashboard (live tail).
  Shows territory + clash chances, gear coverage, task distribution, and members.

Usage:
  run gang/gang-ui.js [--help] [--interval 3000]

Notes:
  - Opens a tail window automatically.
  - Read-only; does not change warfare or member tasks.
  - "win" is the chance to win a territory clash vs that gang.
`);
}
```
/* == END FILE == */

/* == FILE: bin/ui/hacknet-ui.js == */
```js
/**
 * hacknet/hacknet-ui.js
 *
 * Always-on Hacknet dashboard:
 *  - Total production rate
 *  - Total hashes (if Hacknet Servers)
 *  - Node/server count, avg level/ram/cores (as applicable)
 *  - Upgrade affordability quick hints (cheapest next upgrades)
 *
 * No flags. No modes. Just truth.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  const interval = 6_000;

  const hasHacknet =
    ns.hacknet && typeof ns.hacknet.numNodes === "function" && typeof ns.hacknet.getNodeStats === "function";

  if (!hasHacknet) {
    ns.tprint("ERROR: Hacknet API not available.");
    return;
  }

  const isServerMode =
    typeof ns.hacknet.numHashes === "function" &&
    typeof ns.hacknet.hashCapacity === "function" &&
    typeof ns.hacknet.getHashGainRate === "function";

  while (true) {
    const snap = getSnapshot(ns, { isServerMode });
    render(ns, snap, { isServerMode });
    await ns.sleep(interval);
  }
}

// ---------------------------------------------------------------------------
// Snapshot logic
// ---------------------------------------------------------------------------

function getSnapshot(ns, caps) {
  const cash = ns.getServerMoneyAvailable("home");
  const n = ns.hacknet.numNodes();

  let totalProd = 0;

  // Aggregate stats
  let sumLevel = 0;
  let sumRam = 0;
  let sumCores = 0;
  let sumCache = 0;

  let minProd = Infinity;
  let maxProd = 0;

  // Cheapest upgrades (rough â€œwhat can I buy next?â€)
  let best = {
    level: { cost: Infinity, node: -1, delta: 1 },
    ram: { cost: Infinity, node: -1, delta: 1 },
    core: { cost: Infinity, node: -1, delta: 1 },
    cache: { cost: Infinity, node: -1, delta: 1 },
  };

  for (let i = 0; i < n; i++) {
    const s = ns.hacknet.getNodeStats(i);

    // Nodes: s.production is money/sec
    // Servers: s.production is hashes/sec in many versions; we also have getHashGainRate()
    const prod = Number(s.production || 0);

    totalProd += prod;

    sumLevel += Number(s.level || 0);
    sumRam += Number(s.ram || 0);
    sumCores += Number(s.cores || 0);
    sumCache += Number(s.cache || 0);

    minProd = Math.min(minProd, prod);
    maxProd = Math.max(maxProd, prod);

    // Upgrade costs (guard by function existence for version differences)
    if (typeof ns.hacknet.getLevelUpgradeCost === "function") {
      const c = ns.hacknet.getLevelUpgradeCost(i, 1);
      if (Number.isFinite(c) && c > 0 && c < best.level.cost) best.level = { cost: c, node: i, delta: 1 };
    }

    if (typeof ns.hacknet.getRamUpgradeCost === "function") {
      const c = ns.hacknet.getRamUpgradeCost(i, 1);
      if (Number.isFinite(c) && c > 0 && c < best.ram.cost) best.ram = { cost: c, node: i, delta: 1 };
    }

    if (typeof ns.hacknet.getCoreUpgradeCost === "function") {
      const c = ns.hacknet.getCoreUpgradeCost(i, 1);
      if (Number.isFinite(c) && c > 0 && c < best.core.cost) best.core = { cost: c, node: i, delta: 1 };
    }

    if (typeof ns.hacknet.getCacheUpgradeCost === "function") {
      const c = ns.hacknet.getCacheUpgradeCost(i, 1);
      if (Number.isFinite(c) && c > 0 && c < best.cache.cost) best.cache = { cost: c, node: i, delta: 1 };
    }
  }

  const avg = {
    level: n ? sumLevel / n : 0,
    ram: n ? sumRam / n : 0,
    cores: n ? sumCores / n : 0,
    cache: n ? sumCache / n : 0,
  };

  // Purchase next node/server cost if available
  let nextNodeCost = null;
  if (typeof ns.hacknet.getPurchaseNodeCost === "function") {
    nextNodeCost = ns.hacknet.getPurchaseNodeCost();
  } else if (typeof ns.hacknet.getPurchaseNodeCost === "undefined" && typeof ns.hacknet.getPurchaseNodeCost !== "function") {
    // older variants exist, ignore
  }

  // Hacknet Servers extras
  let hashes = null;
  let hashCap = null;
  let hashRate = null;
  if (caps.isServerMode) {
    hashes = ns.hacknet.numHashes();
    hashCap = ns.hacknet.hashCapacity();
    hashRate = ns.hacknet.getHashGainRate();
  }

  return {
    cash,
    n,
    totalProd,
    minProd: minProd === Infinity ? 0 : minProd,
    maxProd,
    avg,
    best,
    nextNodeCost,
    hashes,
    hashCap,
    hashRate,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(ns, s, caps) {
  ns.clearLog();

  ns.print("============================================================");
  ns.print("HACKNET DASHBOARD (AUTOMATIC)");
  ns.print("============================================================");

  ns.print(`Cash on hand:             ${fmtMoney(ns, s.cash)}`);
  ns.print(`Nodes/Servers:            ${s.n}`);

  if (!caps.isServerMode) {
    ns.print(`Total production:         ${fmtMoney(ns, s.totalProd)}/sec`);
    ns.print(`Per-node production:      min=${fmtMoney(ns, s.minProd)}/s  max=${fmtMoney(ns, s.maxProd)}/s`);
  } else {
    ns.print(`Total hash rate:          ${fmtNum(ns, s.hashRate)}/sec`);
    ns.print(`Hashes stored:            ${fmtNum(ns, s.hashes)} / ${fmtNum(ns, s.hashCap)}`);
  }

  ns.print("------------------------------------------------------------");
  ns.print(
    `Avg stats: lvl=${s.avg.level.toFixed(1)} ` +
    `ram=${s.avg.ram.toFixed(1)} ` +
    `cores=${s.avg.cores.toFixed(1)}` +
    (Number.isFinite(s.avg.cache) ? ` cache=${s.avg.cache.toFixed(1)}` : "")
  );

  if (s.n === 0) {
    ns.print("");
    ns.print("(No hacknet nodes/servers yet.)");
    if (s.nextNodeCost != null) {
      ns.print(`Next purchase cost:       ${fmtMoney(ns, s.nextNodeCost)}`);
    }
    return;
  }

  ns.print("------------------------------------------------------------");
  ns.print("Cheapest next upgrades (1 step)");
  ns.print("------------------------------------------------------------");

  printCheapest(ns, "LEVEL", s.best.level, s.cash);
  printCheapest(ns, "RAM  ", s.best.ram, s.cash);
  printCheapest(ns, "CORE ", s.best.core, s.cash);
  // Cache only meaningful in server mode, but safe to show if API exists
  if (Number.isFinite(s.best.cache.cost) && s.best.cache.node >= 0) {
    printCheapest(ns, "CACHE", s.best.cache, s.cash);
  }

  if (s.nextNodeCost != null && Number.isFinite(s.nextNodeCost)) {
    const ok = s.cash >= s.nextNodeCost ? "BUYABLE" : "save";
    ns.print("------------------------------------------------------------");
    ns.print(
      `Next node/server cost:    ${fmtMoney(ns, s.nextNodeCost)} ` +
      `[${ok}]`
    );
  }
}

function printCheapest(ns, label, entry, cash) {
  if (!Number.isFinite(entry.cost) || entry.node < 0) {
    ns.print(`${label}: (n/a)`);
    return;
  }
  const ok = cash >= entry.cost ? "BUYABLE" : "save";
  ns.print(`${label}: node ${entry.node} -> ${fmtMoney(ns, entry.cost)} [${ok}]`);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtMoney(ns, v) {
  if (typeof ns.formatMoney === "function") return ns.formatMoney(v);
  return `$${ns.formatNumber(v)}`;
}

function fmtNum(ns, v) {
  if (v === null || v === undefined) return "n/a";
  if (typeof ns.formatNumber === "function") return ns.formatNumber(v, 2, 1e3);
  return String(v);
}
```
/* == END FILE == */

/* == FILE: bin/ui/karma-watch.js == */
```js
/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail(); // open a small log window

    while (true) {
        ns.clearLog();

        // "Secret" karma function (now semi-documented)
        const karma = ns.heart.break();

        // On newer versions, it's also on getPlayer().karma
        const p = ns.getPlayer();

        ns.print(`Karma (heart.break): ${karma}`);
        if (p.karma !== undefined) {
            ns.print(`Karma (getPlayer):  ${p.karma}`);
        }

        await ns.sleep(1000);
    }
}
```
/* == END FILE == */

/* == FILE: bin/ui/money-tracker.js == */
```js
/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    // Starting snapshot
    let lastMoney = ns.getServerMoneyAvailable("home");
    let startTime = Date.now();
    let totalGained = 0;

    ns.tprint("ðŸ“Š Money Tracker started. Updating every 5 minutes...");

    while (true) {
        await ns.sleep(5 * 60 * 1000); // 5 minutes

        const now = Date.now();
        const currentMoney = ns.getServerMoneyAvailable("home");

        // Calculate deltas
        const gained = currentMoney - lastMoney;
        totalGained += gained;

        const runtimeMs = now - startTime;
        const runtimeHours = runtimeMs / (1000 * 60 * 60);

        const avgPerHour = totalGained / runtimeHours;

        // Render output
        ns.tprint("==========================================");
        ns.tprint("ðŸ’° MONEY TRACKER â€” 5 MIN UPDATE");
        ns.tprint(`â± Runtime:     ${ns.tFormat(runtimeMs)}`);
        ns.tprint(`ðŸ“ˆ Gained (5m): $${ns.formatNumber(gained)}`);
        ns.tprint(`ðŸ’µ Total Gained: $${ns.formatNumber(totalGained)}`);
        ns.tprint(`âš¡ Avg/hr:       $${ns.formatNumber(avgPerHour)}`);
        ns.tprint("==========================================");

        // Update snapshot
        lastMoney = currentMoney;
    }
}
```
/* == END FILE == */

/* == FILE: bin/ui/network-visualizer.js == */
```js
/** @param {NS} ns */
/*
------------------------------------------------------------
 ui/network-visualizer.js

 Pretty-prints the server network as a tree starting from
 a given root (default: "home"), using /lib/network.js.

 Usage examples:
   run ui/network-visualizer.js
   run ui/network-visualizer.js --start home
   run ui/network-visualizer.js --start CSEC
   run ui/network-visualizer.js --maxDepth 2
   run ui/network-visualizer.js --onlyRooted

 Flags:
   --start <host>     Root of the tree (default: home)
   --maxDepth <n>     Limit depth (0 = just root, -1 = unlimited)
   --onlyRooted       Show only rooted servers with RAM > 0
   --noStats          Hide RAM/money/hack req stats
------------------------------------------------------------
*/

import { buildNetworkMap } from "/lib/network.js";

export async function main(ns) {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["start", "home"],
    ["maxDepth", -1],
    ["onlyRooted", false],
    ["noStats", false],
    ["help", false],
  ]);

  if (flags.help) {
    ns.tprint("Usage: run ui/network-visualizer.js [--start host] [--maxDepth n] [--onlyRooted] [--noStats]");
    return;
  }

  const start = String(flags.start || "home");
  const maxDepth = Number(flags.maxDepth);
  const onlyRooted = Boolean(flags.onlyRooted);
  const showStats = !flags.noStats;

  ns.tprint(`ðŸŒ Building network map from "${start}"...`);
  const network = await buildNetworkMap(ns, start);

  if (!network[start]) {
    ns.tprint(`âŒ Start host "${start}" not found in network.`);
    return;
  }

  // Build children lists: parent -> [children]
  /** @type {Record<string, string[]>} */
  const children = {};
  for (const [host, info] of Object.entries(network)) {
    const parent = info.parent;
    if (parent === null || parent === undefined) continue;
    if (!children[parent]) children[parent] = [];
    children[parent].push(host);
  }

  // Sort children for consistent output:
  //  - home first, then purchased servers, then others by name
  for (const key of Object.keys(children)) {
    children[key].sort((a, b) => {
      const ia = network[a];
      const ib = network[b];

      // home always first if present
      if (a === "home" && b !== "home") return -1;
      if (b === "home" && a !== "home") return 1;

      // purchased servers next
      if (ia.purchasedByPlayer && !ib.purchasedByPlayer) return -1;
      if (ib.purchasedByPlayer && !ia.purchasedByPlayer) return 1;

      // fallback: alphabetical
      return a.localeCompare(b);
    });
  }

  ns.tprint("");
  ns.tprint(`ðŸ“¡ NETWORK MAP (start="${start}", maxDepth=${maxDepth})`);
  ns.tprint("------------------------------------------------------------");

  // Recursive printer
  printNode(ns, start, null, children, network, {
    depth: 0,
    maxDepth,
    onlyRooted,
    showStats,
    prefix: "",
    isLast: true,
  });

  ns.tprint("------------------------------------------------------------");
  ns.tprint("Legend: [H]=home [P]=pserv [R]=rooted [B]=backdoor [U]=unrooted ðŸ”’");
}

/**
 * Recursively print a node and its children.
 *
 * @param {NS} ns
 * @param {string} host
 * @param {string|null} parent
 * @param {Record<string, string[]>} children
 * @param {Record<string, any>} network
 * @param {{
 *   depth: number,
 *   maxDepth: number,
 *   onlyRooted: boolean,
 *   showStats: boolean,
 *   prefix: string,
 *   isLast: boolean
 * }} ctx
 */
function printNode(ns, host, parent, children, network, ctx) {
  const info = network[host];
  if (!info) return;

  const { depth, maxDepth, onlyRooted, showStats, prefix, isLast } = ctx;

  // Optional filter: only show rooted servers with RAM > 0
  if (onlyRooted && !(info.hasAdminRights && info.maxRam > 0)) {
    // Still descend so children can show up if they pass filter
    // (you could change this behavior if you prefer to prune)
  }

  const branchChar = parent === null ? " " : (isLast ? "â””â”€" : "â”œâ”€");

  const tags = [];
  if (host === "home") tags.push("[H]");
  if (info.purchasedByPlayer) tags.push("[P]");
  if (info.hasAdminRights && info.maxRam > 0) tags.push("[R]");
  if (info.backdoorInstalled) tags.push("[B]");
  if (!info.hasAdminRights) tags.push("[U]");

  let stats = "";
  if (showStats) {
    stats = formatStats(ns, info);
  }

  ns.tprint(`${prefix}${branchChar} ${host} ${tags.join("")} ${stats}`);

  if (maxDepth >= 0 && depth >= maxDepth) return;

  const kids = children[host] || [];
  const nextPrefix = parent === null ? "" : prefix + (isLast ? "  " : "â”‚ ");

  kids.forEach((child, index) => {
    const last = index === kids.length - 1;
    printNode(ns, child, host, children, network, {
      depth: depth + 1,
      maxDepth,
      onlyRooted,
      showStats,
      prefix: nextPrefix,
      isLast: last,
    });
  });
}

function formatStats(ns, info) {
  const parts = [];

  // RAM
  if (info.maxRam > 0) {
    const ram = ns.formatRam(info.maxRam, 0); // (value, decimalDigits)
    parts.push(`RAM=${ram}`);
  }

  // Money
  if (info.moneyMax > 0) {
    // formatNumber(value, fractionalDigits)
    const money = ns.formatNumber(info.moneyMax, 2); // e.g. "24000000.00"
    parts.push(`$=${money}`);
  }

  // Hack level
  if (info.requiredHackingSkill > 0) {
    parts.push(`hack=${info.requiredHackingSkill}`);
  }

  return parts.length ? `(${parts.join(" | ")})` : "";
}
```
/* == END FILE == */

/* == FILE: bin/ui/ops-dashboard.js == */
```js
/** Combined operational dashboard for Bitburner
 *  Shows: player/home, target snapshot, botnet, pservs, Hacknet
 *  Usage: run ui/ops-dashboard.js [optional-target-override]
 */

/** Simple number formatter using ns.formatNumber (works on all versions) */
/** @param {NS} ns */
function fmt(ns, val, decimals = 3) {
    return ns.nFormat(val, `0.${"0".repeat(decimals)}a`);
}

/** Formulas.exe detection */
function hasFormulas(ns) {
    return (
        typeof ns.formulas !== "undefined" &&
        ns.formulas &&
        typeof ns.formulas.hacking !== "undefined"
    );
}

/**
 * Get hack/grow/weaken times (ms) + chance for a target.
 * Uses Formulas.exe when available, falls back to vanilla timing otherwise.
 */
function getHackGrowWeakenTimes(ns, target) {
    const player = ns.getPlayer();

    if (hasFormulas(ns)) {
        const s = ns.getServer(target);

        // Normalize to "ideal" batch conditions
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        const tHack  = ns.formulas.hacking.hackTime(s, player);
        const tGrow  = ns.formulas.hacking.growTime(s, player);
        const tWeaken = ns.formulas.hacking.weakenTime(s, player);
        const chance = ns.formulas.hacking.hackChance(s, player);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: true };
    } else {
        const tHack  = ns.getHackTime(target);
        const tGrow  = ns.getGrowTime(target);
        const tWeaken = ns.getWeakenTime(target);
        const chance = ns.hackAnalyzeChance(target);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: false };
    }
}

/**
 * Pretty-print a target snapshot (timings, chance, money/sec cap).
 */
function printTargetTiming(ns, target) {
    if (!target || target === "unknown") {
        ns.tprint("?? Target snapshot: (no active target detected)");
        return;
    }

    const maxMoney = ns.getServerMaxMoney(target);
    const minSec   = ns.getServerMinSecurityLevel(target);

    const { tHack, tGrow, tWeaken, chance, usingFormulas } =
        getHackGrowWeakenTimes(ns, target);

    const moneyPerSecCap =
        maxMoney > 0 && tHack > 0 ? (maxMoney / tHack) * 1000 : 0;

    ns.tprint("?? TARGET SNAPSHOT");
    ns.tprint(`   Host: ${target}`);
    ns.tprint(
        "   ? Times: " +
        `H=${(tHack / 1000).toFixed(1)}s, ` +
        `G=${(tGrow / 1000).toFixed(1)}s, ` +
        `W=${(tWeaken / 1000).toFixed(1)}s`
    );
    ns.tprint(
        `   ?? Chance: ${(chance * 100).toFixed(1)}% | ` +
        `MinSec=${minSec.toFixed(2)}`
    );

    if (maxMoney > 0) {
        ns.tprint(
            "   ?? Theo cap: " +
            `Max=${ns.nFormat(maxMoney, "$0.00a")} | ` +
            `~${ns.nFormat(moneyPerSecCap, "$0.00a")}/sec (if perfectly farmed)`
        );
    }

    ns.tprint(
        usingFormulas
            ? "   ?? Timing model: Formulas.exe"
            : "   ?? Timing model: vanilla API (no Formulas.exe detected)"
    );
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const targetOverride = ns.args[0];

    // 1) PLAYER / HOME SUMMARY
    const player = ns.getPlayer();

    // Name may not exist in your version; fall back to a generic label
    const playerName =
        player && typeof player.name === "string" && player.name.length > 0
            ? player.name
            : "Player";

    // Hacking level is always safe via ns.getHackingLevel()
    const hackingLevel = ns.getHackingLevel();

    const money    = ns.getServerMoneyAvailable("home");
    const homeMax  = ns.getServerMaxRam("home");
    const homeUsed = ns.getServerUsedRam("home");
    const homeFree = homeMax - homeUsed;

    const guessedTarget = targetOverride || guessMainTarget(ns) || "unknown";

    ns.tprint("?? OPS DASHBOARD");
    ns.tprint("=================================================================");
    ns.tprint(`Player: ${playerName}   |   Hacking: ${hackingLevel}`);
    ns.tprint(`Money:  $${fmt(ns, money, 3)}`);
    ns.tprint(`Home RAM: ${homeUsed.toFixed(1)} / ${homeMax.toFixed(1)} GB (free ${homeFree.toFixed(1)} GB)`);
    ns.tprint(`Main target (guessed): ${guessedTarget}`);
    ns.tprint("=================================================================\n");

    // 1b) TARGET SNAPSHOT (formulas-aware when available)
    printTargetTiming(ns, guessedTarget);
    ns.tprint("");

    // 2) BOTNET STATUS (HOME + PSERV + NPC, HGW + BATCH)
    printBotnetStatus(ns, guessedTarget);

    // 3) PSERV FLEET DETAILS
    ns.tprint("");
    printPservStatus(ns);

    // 4) HACKNET SUMMARY
    ns.tprint("");
    printHacknetStatus(ns);

    ns.tprint("\n? Dashboard snapshot complete.");
}

/* ---------------- BOTNET STATUS ---------------- */

function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const n of ns.scan(host)) {
            if (!visited.has(n)) stack.push(n);
        }
    }
    return Array.from(visited);
}

function guessMainTarget(ns) {
    const hosts = getAllServers(ns);
    const candidates = ["/bin/timed-net-batcher2.js", "legacy/shims/core/timed-net-batcher2.js", "/botnet/remote-hgw.js"];

    for (const host of hosts) {
        const procs = ns.ps(host);
        for (const p of procs) {
            if (candidates.includes(p.filename) && p.args.length > 0) {
                return p.args[0];
            }
        }
    }
    return null;
}

function printBotnetStatus(ns, guessedTarget) {
    const allServers = getAllServers(ns);
    const pservsSet = new Set(ns.getPurchasedServers());

    const workerScript = "botnet/remote-hgw.js";
    const batchScripts = new Set(["workers/hwgw/batch-hack.js", "workers/hwgw/batch-grow.js", "workers/hwgw/batch-weaken.js"]);

    let totalRooted = 0;
    let totalHGWThreads = 0;
    let totalBatchThreads = 0;

    let homeHGW = 0, homeBatch = 0;
    let pservHGW = 0, pservBatch = 0;
    let npcHGW = 0, npcBatch = 0;

    for (const host of allServers) {
        if (!ns.hasRootAccess(host)) continue;
        totalRooted++;

        const procs = ns.ps(host);
        const maxRam = ns.getServerMaxRam(host);

        let hgwThreads = 0;
        let batchThreads = 0;

        for (const p of procs) {
            if (p.filename === workerScript) {
                hgwThreads += p.threads;
            } else if (batchScripts.has(p.filename)) {
                batchThreads += p.threads;
            }
        }

        totalHGWThreads += hgwThreads;
        totalBatchThreads += batchThreads;

        const type =
            host === "home" ? "HOME" :
            pservsSet.has(host) ? "PSERV" :
            "NPC";

        if (type === "HOME") {
            homeHGW += hgwThreads;
            homeBatch += batchThreads;
        } else if (type === "PSERV") {
            pservHGW += hgwThreads;
            pservBatch += batchThreads;
        } else {
            npcHGW += hgwThreads;
            npcBatch += batchThreads;
        }
    }

    ns.tprint("??  BOTNET STATUS (HGW + BATCH)");
    ns.tprint("------------------------------------------------------------");
    ns.tprint(`Rooted servers:       ${totalRooted}`);
    ns.tprint("");
    ns.tprint("                 HGW Threads   Batch Threads");
    ns.tprint("                 -----------   -------------");
    ns.tprint(`Home:            ${String(homeHGW).padStart(11)}   ${String(homeBatch).padStart(13)}`);
    ns.tprint(`Purchased (pserv)${String(pservHGW).padStart(11)}   ${String(pservBatch).padStart(13)}`);
    ns.tprint(`NPC Servers:      ${String(npcHGW).padStart(11)}   ${String(npcBatch).padStart(13)}`);
    ns.tprint("                 -----------   -------------");
    ns.tprint(`TOTAL:           ${String(totalHGWThreads).padStart(11)}   ${String(totalBatchThreads).padStart(13)}`);
    ns.tprint("------------------------------------------------------------");
}

/* ---------------- PSERV STATUS ---------------- */

function printPservStatus(ns) {
    const pservs = ns.getPurchasedServers();
    const workerScript = "botnet/remote-hgw.js";

    ns.tprint("???  PURCHASed SERVER FLEET");
    if (pservs.length === 0) {
        ns.tprint("------------------------------------------------------------");
        ns.tprint("You don't own any purchased servers yet.");
        return;
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint("Server          RAM(GB)   HGW Threads   Target");
    ns.tprint("------------------------------------------------------------");

    let totalRam = 0;
    let totalThreads = 0;

    for (const host of pservs) {
        const ram = ns.getServerMaxRam(host);
        totalRam += ram;

        const procs = ns.ps(host);
        const hgwProcs = procs.filter(p => p.filename === workerScript);

        let threads = 0;
        let target = "-";

        if (hgwProcs.length > 0) {
            threads = hgwProcs.reduce((sum, p) => sum + p.threads, 0);
            target = hgwProcs[0].args[0] ?? "-";
        }

        totalThreads += threads;

        const namePad = host.padEnd(14, " ");
        const ramPad  = String(ram).padStart(7, " ");
        const thrPad  = String(threads).padStart(11, " ");

        ns.tprint(`${namePad}  ${ramPad}   ${thrPad}   ${target}`);
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint(`Total pservs:   ${pservs.length}`);
    ns.tprint(`Total RAM:      ${totalRam.toFixed(1)} GB`);
    ns.tprint(`Total HGW threads: ${totalThreads}`);
    ns.tprint("------------------------------------------------------------");
}

/* ---------------- HACKNET STATUS ---------------- */

function printHacknetStatus(ns) {
    const count = ns.hacknet.numNodes();
    ns.tprint("?? HACKNET STATUS");
    ns.tprint("------------------------------------------------------------");

    if (count === 0) {
        ns.tprint("You don't own any Hacknet nodes yet.");
        return;
    }

    ns.tprint("Idx  Level   RAM   Cores   Prod/sec        Lifetime");
    ns.tprint("------------------------------------------------------------");

    let totalProd = 0;
    let totalLife = 0;
    let totalLevels = 0;
    let totalRam = 0;
    let totalCores = 0;

    for (let i = 0; i < count; i++) {
        const s = ns.hacknet.getNodeStats(i);

        totalProd   += s.production;
        totalLife   += s.totalProduction;
        totalLevels += s.level;
        totalRam    += s.ram;
        totalCores  += s.cores;

        const idxStr  = String(i).padStart(2, " ");
        const lvlStr  = String(s.level).padStart(5, " ");
        const ramStr  = String(s.ram).padStart(5, " ");
        const coreStr = String(s.cores).padStart(6, " ");

        const prodStr = fmt(ns, s.production, 3).padStart(10, " ");
        const lifeStr = fmt(ns, s.totalProduction, 3).padStart(12, " ");

        ns.tprint(`${idxStr}  ${lvlStr}  ${ramStr}  ${coreStr}   ${prodStr}   ${lifeStr}`);
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint(`Nodes:      ${count}`);
    ns.tprint(`Avg Level:  ${(totalLevels / count).toFixed(1)}`);
    ns.tprint(`Avg RAM:    ${(totalRam / count).toFixed(1)} GB`);
    ns.tprint(`Avg Cores:  ${(totalCores / count).toFixed(1)}`);
    ns.tprint(`Total Prod: ${fmt(ns, totalProd, 3)} / sec`);
    ns.tprint(`Lifetime:   $${fmt(ns, totalLife, 3)}`);
    ns.tprint("------------------------------------------------------------");
}
```
/* == END FILE == */

/* == FILE: bin/ui/process-monitor.js == */
```js
/** ui/process-monitor.js
 * Live-ish snapshot of running processes across the network.
 * Highlights critical scripts and shows formulas-aware batch $/sec.
 *
 * Usage: run ui/process-monitor.js
 */

/** @param {NS} ns */
function fmt(ns, val, decimals = 2) {
    return ns.nFormat(val, `0.${"0".repeat(decimals)}a`);
}

// -------------------------------------------------------------
// Config: script names (respect pseudo-folder structure)
// -------------------------------------------------------------

const BATCH_CONTROLLERS = ["/bin/timed-net-batcher2.js", "/bin/timed-net-batcher2.js"];
const BATCH_HACK_SCRIPT = "workers/hwgw/batch-hack.js";      // moved into /workers/hwgw
const REMOTE_HGW_SCRIPT = "botnet/remote-hgw.js";     // moved into /botnet

/** @param {NS} ns */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking &&
            typeof ns.formulas.hacking.hackTime === "function"
        );
    } catch (_e) {
        return false;
    }
}

/**
 * Get hack/grow/weaken times (ms) + chance for a target.
 * Uses ns.formulas.hacking when available, falls back otherwise.
 * @param {NS} ns
 */
function getHackGrowWeakenTimes(ns, target) {
    const player = ns.getPlayer();

    if (hasFormulas(ns)) {
        const s = ns.getServer(target);

        // Assume prepped-ish for planning
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        const tHack   = ns.formulas.hacking.hackTime(s, player);
        const tGrow   = ns.formulas.hacking.growTime(s, player);
        const tWeaken = ns.formulas.hacking.weakenTime(s, player);
        const chance  = ns.formulas.hacking.hackChance(s, player);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: true };
    } else {
        const tHack   = ns.getHackTime(target);
        const tGrow   = ns.getGrowTime(target);
        const tWeaken = ns.getWeakenTime(target);
        const chance  = ns.hackAnalyzeChance(target);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: false };
    }
}

/** @param {NS} ns */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const n of ns.scan(host)) {
            if (!visited.has(n)) stack.push(n);
        }
    }
    return Array.from(visited);
}

/** @param {NS} ns */
function findBatchTarget(ns) {
    const servers = getAllServers(ns);

    for (const host of servers) {
        for (const p of ns.ps(host)) {
            if (p.filename === BATCH_CONTROLLERS[0] && p.args.length > 0) {
                return p.args[0];
            }
        }
    }
    return null;
}

/**
 * Estimate current batch money/sec based on:
 * - total batch-hack threads
 * - hackAnalyze
 * - formulas-based (or vanilla) timing
 *
 * @param {NS} ns
 */
function printBatchOverview(ns) {
    const target = findBatchTarget(ns);

    ns.tprint("------------------------------------------------------------");
    ns.tprint("?? BATCH OVERVIEW (/bin/timed-net-batcher2.js)");
    if (!target) {
        ns.tprint("No active /bin/timed-net-batcher2.js controller found.");
        return;
    }

    const servers = getAllServers(ns);

    let totalHackThreads = 0;
    for (const host of servers) {
        for (const p of ns.ps(host)) {
            // CHANGED: look for /batch path
            if (p.filename === BATCH_HACK_SCRIPT) {
                totalHackThreads += p.threads;
            }
        }
    }

    if (totalHackThreads === 0) {
        ns.tprint(`Controller target: ${target} (no ${BATCH_HACK_SCRIPT} threads detected)`);
        return;
    }

    const maxMoney   = ns.getServerMaxMoney(target);
    const hackPerThr = ns.hackAnalyze(target);
    const rawFrac    = hackPerThr * totalHackThreads;
    const MAX_HACK_FRACTION = 0.9;
    const hackFrac   = Math.min(MAX_HACK_FRACTION, rawFrac);

    const { tHack, tGrow, tWeaken, usingFormulas } = getHackGrowWeakenTimes(ns, target);

    const GAP = 200; // ms ï¿½ same shape as timed-net-batcher2
    const cycleTime = tWeaken + 4 * GAP;
    const estBatchMoney = maxMoney * hackFrac;
    const estMoneyPerSec = cycleTime > 0 ? estBatchMoney / (cycleTime / 1000) : 0;

    ns.tprint(`Target: ${target}`);
    ns.tprint(
        `Threads (hack): ${totalHackThreads}  |  ` +
        `HackFracï¿½${(hackFrac * 100).toFixed(1)}% (capped at ${(MAX_HACK_FRACTION * 100).toFixed(0)}%)`
    );
    ns.tprint(
        `Times: H=${(tHack/1000).toFixed(1)}s, ` +
        `G=${(tGrow/1000).toFixed(1)}s, ` +
        `W=${(tWeaken/1000).toFixed(1)}s  |  cycleï¿½${ns.tFormat(cycleTime)}`
    );
    ns.tprint(
        `Est batch: ${ns.nFormat(estBatchMoney, "$0.00a")}  |  ` +
        `Est ~${ns.nFormat(estMoneyPerSec, "$0.00a")}/sec`
    );
    ns.tprint(
        usingFormulas
            ? "Timing model: Formulas.exe (ns.formulas.hacking)"
            : "Timing model: vanilla API (no Formulas.exe detected)"
    );
}

/** @param {NS} ns */
function printCriticalProcesses(ns) {
    const CRITICAL = new Set([
        "/bin/startup-home-advanced.js", "/bin/startup-home-advanced.js",
        "/bin/timed-net-batcher2.js",
        "/bin/pserv-manager.js",
        "/bin/root-and-deploy.js", "legacy/shims/core/root-and-deploy.js",
        "/bin/botnet-hgw-sync.js", // if youï¿½ve renamed it already
        REMOTE_HGW_SCRIPT,
        "hacknet/hacknet-smart.js",
        "bin/ui/ops-dashboard.js",
        "bin/ui/process-monitor.js",
    ]);

    const servers = getAllServers(ns);
    const rows = [];

    for (const host of servers) {
        const procs = ns.ps(host);
        const maxRam = ns.getServerMaxRam(host);

        for (const p of procs) {
            if (!CRITICAL.has(p.filename)) continue;

            const ramPerThread = ns.getScriptRam(p.filename, host) || 0;
            const ramUsage = ramPerThread * p.threads;

            rows.push({
                host,
                script: p.filename,
                threads: p.threads,
                ram: ramUsage,
                maxRam,
            });
        }
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint("?? CRITICAL PROCESS WATCH");
    if (rows.length === 0) {
        ns.tprint("No critical scripts currently running.");
        return;
    }

    rows.sort((a, b) => b.ram - a.ram);

    ns.tprint("Host           Script                        Thr   RAM(GB)");
    ns.tprint("------------------------------------------------------------");
    for (const r of rows) {
        const hostStr   = r.host.padEnd(13, " ");
        const scriptStr = r.script.padEnd(28, " ");
        const thrStr    = String(r.threads).padStart(3, " ");
        const ramStr    = r.ram.toFixed(1).padStart(7, " ");

        ns.tprint(`${hostStr}  ${scriptStr}  ${thrStr}  ${ramStr}`);
    }
}

/** @param {NS} ns */
function printRamSummary(ns) {
    const servers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());

    let homeUsed = 0, homeMax = 0;
    let pservUsed = 0, pservMax = 0;
    let npcUsed = 0, npcMax = 0;

    for (const host of servers) {
        const maxRam  = ns.getServerMaxRam(host);
        const usedRam = ns.getServerUsedRam(host);

        if (host === "home") {
            homeUsed += usedRam;
            homeMax  += maxRam;
        } else if (pservs.has(host)) {
            pservUsed += usedRam;
            pservMax  += maxRam;
        } else {
            npcUsed += usedRam;
            npcMax  += maxRam;
        }
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint("?? RAM SUMMARY");
    ns.tprint(
        `Home:   ${homeUsed.toFixed(1)} / ${homeMax.toFixed(1)} GB` +
        (homeMax > 0 ? ` (${(homeUsed/homeMax*100).toFixed(1)}%)` : "")
    );
    ns.tprint(
        `Pserv:  ${pservUsed.toFixed(1)} / ${pservMax.toFixed(1)} GB` +
        (pservMax > 0 ? ` (${(pservUsed/pservMax*100).toFixed(1)}%)` : "")
    );
    ns.tprint(
        `NPC:    ${npcUsed.toFixed(1)} / ${npcMax.toFixed(1)} GB` +
        (npcMax > 0 ? ` (${(npcUsed/npcMax*100).toFixed(1)}%)` : "")
    );
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    ns.tprint("?? PROCESS MONITOR");
    printRamSummary(ns);
    printCriticalProcesses(ns);
    printBatchOverview(ns);

    ns.tprint("------------------------------------------------------------");
    ns.tprint("Snapshot complete.");
}
```
/* == END FILE == */

/* == FILE: bin/ui/pserv-status.js == */
```js
/** @param {NS} ns */

// ------------------------------------------------------------
// Flags
// ------------------------------------------------------------
const FLAGS = [
    ["help", false],
];

export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags(FLAGS);

    // --help handler
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Optional: target minimum RAM for "progress" metric
    const target = Number(flags._[0] ?? 2048); // e.g., run ... 8192

    const servers = ns.getPurchasedServers();
    if (servers.length === 0) {
        ns.tprint("? You have no purchased servers.");
        return;
    }

    let totalRam = 0;
    let minRam = Infinity;
    let maxRam = 0;

    ns.tprint("??? Purchased Server Fleet Status");
    ns.tprint("----------------------------------");

    for (const host of servers) {
        const ram = ns.getServerMaxRam(host);
        totalRam += ram;
        if (ram < minRam) minRam = ram;
        if (ram > maxRam) maxRam = ram;

        ns.tprint(`â€¢ ${host} â€” ${ram} GB`);
    }

    const avgRam = totalRam / servers.length;

    // Guard against goofy/zero targets
    const safeTarget = target > 0 ? target : 1;
    const completion = Math.min(100, (minRam / safeTarget) * 100).toFixed(1);

    ns.tprint("----------------------------------");
    ns.tprint(`?? Total Servers: ${servers.length}`);
    ns.tprint(`?? Total Fleet RAM: ${ns.nFormat(totalRam * 1e9, "0.00b")}`);
    ns.tprint(`?? Weakest Server: ${minRam} GB`);
    ns.tprint(`?? Strongest Server: ${maxRam} GB`);
    ns.tprint(`?? Average RAM: ${avgRam.toFixed(1)} GB`);
    ns.tprint(`?? Progress to target (${safeTarget}GB min): ${completion}%`);
    ns.tprint("----------------------------------");
}

// ------------------------------------------------------------
// Minimal HELP: Description, Notes, Syntax
// ------------------------------------------------------------
function printHelp(ns) {
    const script = "pserv/pserv-status.js";

    ns.tprint("==============================================================");
    ns.tprint(`HELP â€” ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");

    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Summarizes the status of your purchased server fleet.");
    ns.tprint("  Prints each pserv's RAM, plus overall fleet stats and");
    ns.tprint("  a simple 'progress to target' metric based on the weakest");
    ns.tprint("  server compared to a target minimum RAM value.");
    ns.tprint("");

    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Uses ns.getPurchasedServers() to enumerate pserv hosts.");
    ns.tprint("  - Target RAM is optional; defaults to 2048GB if omitted.");
    ns.tprint("  - Progress is computed as (minRam / target) * 100, capped");
    ns.tprint("    at 100%.");
    ns.tprint("  - Total Fleet RAM is printed using ns.nFormat(..., '0.00b').");
    ns.tprint("");

    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run pserv/pserv-status.js");
    ns.tprint("  run pserv/pserv-status.js <targetMinRam>");
    ns.tprint("  run pserv/pserv-status.js --help");
    ns.tprint("");

    ns.tprint("==============================================================");
    ns.tprint("");
}
```
/* == END FILE == */

/* == FILE: bin/ui/territory-ui.js == */
```js
/**
 * gang/territory-ui.js
 *
 * Always-on territory dashboard:
 *  - Your gang: territory %, power, warfare ON/OFF, wanted penalty
 *  - Clash chances vs each other gang (sorted by their territory)
 *  - Quick stats: best / median / worst clash chance
 *
 * No modes. No fluff. Just territory truth.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
  ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  if (flags.help) return printHelp(ns);

  ns.disableLog("ALL");
  ns.ui.openTail();

  if (!ns.gang || typeof ns.gang.getGangInformation !== "function") {
    ns.tprint("ERROR: Gang API not available.");
    return;
  }
  if (!ns.gang.inGang()) {
    ns.tprint("ERROR: You are not in a gang.");
    return;
  }

  const interval = 3_000;

  while (true) {
    const snap = getSnapshot(ns);
    render(ns, snap);
    await ns.sleep(interval);
  }
}

// ---------------------------------------------------------------------------
// Snapshot logic
// ---------------------------------------------------------------------------

function getSnapshot(ns) {
  const g = ns.gang.getGangInformation();
  const others = ns.gang.getOtherGangInformation();

  /** @type {Array<{name:string, power:number, territory:number, chance:number}>} */
  const rows = [];

  const chances = [];
  for (const name of Object.keys(others)) {
    // getOtherGangInformation includes your own gang too; keep it for display,
    // but exclude it from summary stats (chance is always 50% vs yourself).
    const info = others[name];
    const chance = safeChance(ns, name);

    rows.push({
      name,
      power: info.power ?? 0,
      territory: info.territory ?? 0,
      chance,
    });

    if (name !== g.faction && Number.isFinite(chance)) chances.push(chance);
  }

  rows.sort((a, b) => (b.territory - a.territory) || a.name.localeCompare(b.name));

  chances.sort((a, b) => a - b);

  const best = chances.length ? chances[chances.length - 1] : 0;
  const worst = chances.length ? chances[0] : 0;
  const median = chances.length ? chances[Math.floor(chances.length / 2)] : 0;

  const gte50 = chances.filter(c => c >= 0.50).length;
  const gte62 = chances.filter(c => c >= 0.62).length;
  const gte75 = chances.filter(c => c >= 0.75).length;
  const gte90 = chances.filter(c => c >= 0.90).length;

  return {
    gang: {
      faction: g.faction,
      isHacking: g.isHacking,
      territory: g.territory,
      power: g.power,
      engaged: g.territoryWarfareEngaged,
      wantedPenalty: g.wantedPenalty,
      wantedLevel: g.wantedLevel,
      respect: g.respect,
    },
    summary: {
      n: chances.length,
      best,
      median,
      worst,
      gte50,
      gte62,
      gte75,
      gte90,
    },
    rows,
  };
}

function safeChance(ns, otherGangName) {
  try {
    const c = ns.gang.getChanceToWinClash(otherGangName);
    return Number.isFinite(c) ? c : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(ns, s) {
  ns.clearLog();

  ns.print("============================================================");
  ns.print("GANG TERRITORY DASHBOARD (AUTOMATIC)");
  ns.print("============================================================");

  const type = s.gang.isHacking ? "HACKING" : "COMBAT";
  ns.print(`Type: ${type} | Faction: ${s.gang.faction}`);
  ns.print(
    `Territory: ${fmtPct(s.gang.territory)} | ` +
    `Power: ${fmtNumber(ns, s.gang.power)} | ` +
    `Warfare: ${s.gang.engaged ? "ON" : "OFF"}`
  );
  ns.print(
    `Wanted Penalty: ${fmtPct(s.gang.wantedPenalty)} | ` +
    `Wanted: ${fmtNumber(ns, s.gang.wantedLevel)} | ` +
    `Respect: ${fmtNumber(ns, s.gang.respect)}`
  );

  ns.print("------------------------------------------------------------");
  ns.print(
    `Clash chances (vs others): best=${fmtPct(s.summary.best)} ` +
    `median=${fmtPct(s.summary.median)} ` +
    `worst=${fmtPct(s.summary.worst)}`
  );
  ns.print(
    `Counts: >=50%:${s.summary.gte50}/${s.summary.n} ` +
    `>=62%:${s.summary.gte62}/${s.summary.n} ` +
    `>=75%:${s.summary.gte75}/${s.summary.n} ` +
    `>=90%:${s.summary.gte90}/${s.summary.n}`
  );
  ns.print("============================================================");

  ns.print("");
  ns.print("Other Gangs (sorted by territory)");
  ns.print("------------------------------------------------------------");

  for (const r of s.rows) {
    const isUs = r.name === s.gang.faction;
    ns.print(
      `${isUs ? "* " : "  "}${padRight(r.name, 18)} ` +
      `terr=${padLeft(fmtPct(r.territory), 7)} ` +
      `power=${padLeft(fmtNumber(ns, r.power), 9)} ` +
      `win=${padLeft(fmtPct(r.chance), 7)}`
    );
  }

  ns.print("");
  ns.print("* = your gang");
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtPct(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return "n/a";
  return (v * 100).toFixed(1) + "%";
}

function fmtNumber(ns, v) {
  if (!Number.isFinite(v)) return "n/a";
  if (typeof ns.formatNumber === "function") return ns.formatNumber(v, 2);
  // fallback
  const abs = Math.abs(v);
  if (abs >= 1e12) return (v / 1e12).toFixed(2) + "t";
  if (abs >= 1e9)  return (v / 1e9).toFixed(2) + "b";
  if (abs >= 1e6)  return (v / 1e6).toFixed(2) + "m";
  if (abs >= 1e3)  return (v / 1e3).toFixed(2) + "k";
  return v.toFixed(2);
}

function padRight(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function padLeft(s, n) {
  s = String(s);
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
gang/territory-ui.js
Description:
  Always-on territory dashboard for gangs.
  Shows your territory/power/warfare state and clash chances vs all other gangs.

Usage:
  run gang/territory-ui.js [--help]

Notes:
  - Opens a tail window automatically.
  - Read-only; does not modify gang warfare or tasks.
  - "win" is the chance to win a territory clash vs that gang.
`);
}
```
/* == END FILE == */

/* == FILE: bin/ui/timed-net-batcher-ui.js == */
```js
/**
 * /bin/ui/timed-net-batcher-ui.js
 *
 * Always-on dashboard for your timed HWGW batcher ecosystem.
 * Read-only. Does not change anything.
 *
 * Shows:
 *  - Target health (money %, sec delta) + PREP/MONEY classification
 *  - Fleet summary (home reserve, pserv RAM, free RAM)
 *  - What is running where (batch-hack/grow/weaken threads by host)
 *  - Active targets seen in worker args
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["interval", 2000],
    ["target", ""], // optional: pin to a target (otherwise picks most common active target)
  ]);

  ns.disableLog("ALL");
  ns.ui.openTail();

  const interval = Math.max(250, Number(flags.interval) || 2000);

  // Worker script names (match your batcher)
  const hackScript = "workers/hwgw/batch-hack.js";
  const growScript = "workers/hwgw/batch-grow.js";
  const weakScript = "workers/hwgw/batch-weaken.js";

  // Copy of your defaults (for display + â€œPREP vs MONEYâ€ logic)
  const MONEY_THRESHOLD = 0.90;
  const SEC_TOLERANCE = 0.90;
  const LOWRAM_MONEY_THRESHOLD = 0.90;
  const LOWRAM_SEC_TOLERANCE = 1.50;

  const PSERV_MIN_TOTAL_RAM = 64;

  while (true) {
    const snap = getSnapshot(ns, {
      pinnedTarget: String(flags.target || "").trim(),
      hackScript,
      growScript,
      weakScript,
      MONEY_THRESHOLD,
      SEC_TOLERANCE,
      LOWRAM_MONEY_THRESHOLD,
      LOWRAM_SEC_TOLERANCE,
      PSERV_MIN_TOTAL_RAM,
    });

    render(ns, snap);
    await ns.sleep(interval);
  }
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

function getSnapshot(ns, cfg) {
  const purchased = ns.getPurchasedServers();
  const hosts = ["home", ...purchased];

  const homeReserve = getHomeReserve(ns);

  let totalPservRam = 0;
  for (const h of purchased) totalPservRam += ns.getServerMaxRam(h);

  const desiredMode = totalPservRam >= cfg.PSERV_MIN_TOTAL_RAM ? "HYBRID" : "HOME";

  // Per-host RAM + batch threads summary
  const hostRows = [];
  const running = []; // {host, filename, threads, args}

  for (const host of hosts) {
    const max = ns.getServerMaxRam(host);
    const used = ns.getServerUsedRam(host);
    const freeRaw = Math.max(0, max - used);
    const free = host === "home" ? Math.max(0, max - used - homeReserve) : freeRaw;

    const procs = ns.ps(host) || [];
    let hThreads = 0, gThreads = 0, wThreads = 0;

    for (const p of procs) {
      if (p.filename === cfg.hackScript) hThreads += p.threads;
      else if (p.filename === cfg.growScript) gThreads += p.threads;
      else if (p.filename === cfg.weakScript) wThreads += p.threads;

      if (
        p.filename === cfg.hackScript ||
        p.filename === cfg.growScript ||
        p.filename === cfg.weakScript
      ) {
        running.push({ host, filename: p.filename, threads: p.threads, args: p.args || [] });
      }
    }

    hostRows.push({
      host,
      max,
      used,
      free,
      hThreads,
      gThreads,
      wThreads,
      anyBatch: (hThreads + gThreads + wThreads) > 0,
    });
  }

  // Aggregate running threads
  const totals = { H: 0, G: 0, W: 0, procs: running.length };
  for (const r of running) {
    if (r.filename === cfg.hackScript) totals.H += r.threads;
    else if (r.filename === cfg.growScript) totals.G += r.threads;
    else if (r.filename === cfg.weakScript) totals.W += r.threads;
  }

  // Detect â€œactive targetsâ€ from worker args: [target, delay, ...]
  const targetsCount = new Map();
  for (const r of running) {
    const t = String(r.args?.[0] ?? "").trim();
    if (!t) continue;
    targetsCount.set(t, (targetsCount.get(t) || 0) + r.threads);
  }

  const activeTargets = [...targetsCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([target, threads]) => ({ target, threads }));

  // Decide which target to display stats for
  const target =
    cfg.pinnedTarget ||
    (activeTargets[0]?.target ?? "");

  const targetStats = target ? getTargetStats(ns, target) : null;

  // Guess lowram-ish state: if there are basically no pservs or below threshold
  // (Your controller does hysteresis; UI just shows the â€œlikely modeâ€.)
  const lowramLikely = desiredMode === "HOME";

  // Thresholds used for PREP/MONEY classification
  const moneyThresh = lowramLikely ? cfg.LOWRAM_MONEY_THRESHOLD : cfg.MONEY_THRESHOLD;
  const secThresh = lowramLikely ? cfg.LOWRAM_SEC_TOLERANCE : cfg.SEC_TOLERANCE;

  let prepState = null;
  if (targetStats) {
    const moneyOk = targetStats.moneyRatio >= moneyThresh;
    const secOk = targetStats.secDelta <= secThresh;
    prepState = {
      lowramLikely,
      moneyThresh,
      secThresh,
      moneyOk,
      secOk,
      prepping: !(moneyOk && secOk),
    };
  }

  // Sort hosts: show batch-active hosts first, then by free desc
  hostRows.sort((a, b) =>
    (Number(b.anyBatch) - Number(a.anyBatch)) ||
    (b.free - a.free) ||
    a.host.localeCompare(b.host)
  );

  return {
    now: Date.now(),
    mode: desiredMode,
    homeReserve,
    purchasedCount: purchased.length,
    totalPservRam,
    totals,
    hostRows,
    activeTargets,
    target,
    targetStats,
    prepState,
    usingFormulas: hasFormulas(ns),
  };
}

function getTargetStats(ns, target) {
  const money = ns.getServerMoneyAvailable(target);
  const max = ns.getServerMaxMoney(target);
  const sec = ns.getServerSecurityLevel(target);
  const minSec = ns.getServerMinSecurityLevel(target);

  const moneyRatio = max > 0 ? money / max : 0;
  const secDelta = sec - minSec;

  return {
    money,
    max,
    moneyRatio,
    sec,
    minSec,
    secDelta,
  };
}

// Same helper you use
function getHomeReserve(ns) {
  const max = ns.getServerMaxRam("home");
  return Math.min(128, Math.max(8, Math.floor(max * 0.10)));
}

function hasFormulas(ns) {
  try {
    return (
      ns.fileExists("Formulas.exe", "home") &&
      ns.formulas &&
      ns.formulas.hacking &&
      typeof ns.formulas.hacking.hackTime === "function"
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Render (asset-ui vibe)
// ---------------------------------------------------------------------------

function render(ns, s) {
  ns.clearLog();

  ns.print("============================================================");
  ns.print("TIMED NET BATCHER DASHBOARD (AUTOMATIC)");
  ns.print("============================================================");

  ns.print(
    `Mode (likely): ${s.mode} | Formulas.exe: ${s.usingFormulas ? "YES" : "NO"}`
  );
  ns.print(
    `Pservs: ${s.purchasedCount} | Total pserv RAM: ${fmtRam(s.totalPservRam)} | Home reserve: ${fmtRam(s.homeReserve)}`
  );

  const freeTotal = s.hostRows.reduce((acc, r) => acc + r.free, 0);
  ns.print(`Fleet free RAM (usable): ${fmtRam(freeTotal)}`);

  ns.print("------------------------------------------------------------");
  ns.print(
    `Running workers: procs=${s.totals.procs} | H=${s.totals.H} G=${s.totals.G} W=${s.totals.W}`
  );

  ns.print("============================================================");
  ns.print("");

  // Active targets
  ns.print("Active Targets (from worker args)");
  ns.print("------------------------------------------------------------");
  if (!s.activeTargets.length) {
    ns.print("(No batch workers detected.)");
  } else {
    const line = s.activeTargets
      .slice(0, 6)
      .map((x) => `${x.target}:${x.threads}`)
      .join(" | ");
    ns.print(line);
  }

  ns.print("");

  // Target status
  ns.print("Target Status");
  ns.print("------------------------------------------------------------");
  if (!s.target) {
    ns.print("(No target detected. Start your batcher, or pass --target n00dles.)");
  } else {
    ns.print(`Target: ${s.target}`);
    if (s.targetStats) {
      ns.print(
        `Money: ${fmtMoney(ns, s.targetStats.money)} / ${fmtMoney(ns, s.targetStats.max)} ` +
        `(${(s.targetStats.moneyRatio * 100).toFixed(2)}%)`
      );
      ns.print(
        `Security: ${s.targetStats.sec.toFixed(2)} (min ${s.targetStats.minSec.toFixed(2)}) ` +
        `delta=${s.targetStats.secDelta.toFixed(2)}`
      );

      if (s.prepState) {
        ns.print("------------------------------------------------------------");
        ns.print(
          `Classification: ${s.prepState.prepping ? "PREP" : "MONEY"} ` +
          `| thresholds: money>=${(s.prepState.moneyThresh * 100).toFixed(0)}% ` +
          `secDelta<=${s.prepState.secThresh.toFixed(2)} ` +
          `| ok: money=${s.prepState.moneyOk ? "Y" : "N"} sec=${s.prepState.secOk ? "Y" : "N"}`
        );
      }
    }
  }

  ns.print("");
  ns.print("Workers by Host");
  ns.print("------------------------------------------------------------");
  ns.print(
    `${padRight("host", 14)} ${padLeft("free", 8)} ${padLeft("used", 8)} ` +
    `${padLeft("H", 6)} ${padLeft("G", 6)} ${padLeft("W", 6)}`
  );

  for (const r of s.hostRows) {
    const mark = r.anyBatch ? "*" : " ";
    ns.print(
      `${mark}${padRight(r.host, 13)} ${padLeft(fmtRam(r.free), 8)} ${padLeft(fmtRam(r.used), 8)} ` +
      `${padLeft(String(r.hThreads), 6)} ${padLeft(String(r.gThreads), 6)} ${padLeft(String(r.wThreads), 6)}`
    );
  }

  ns.print("");
  ns.print("* = host currently running batch workers");
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtMoney(ns, v) {
  if (!Number.isFinite(v)) return "n/a";
  if (typeof ns.formatMoney === "function") return ns.formatMoney(v);
  return "$" + ns.formatNumber(v);
}

function fmtRam(gb) {
  if (!Number.isFinite(gb)) return "n/a";
  if (gb >= 1024) return (gb / 1024).toFixed(1) + "t";
  return gb.toFixed(1) + "g";
}

function padRight(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function padLeft(s, n) {
  s = String(s);
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}
```
/* == END FILE == */

/* == FILE: bin/ui/xp-throughput-monitor.js == */
```js
/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    // Flags:
    // --minutes X   ? sample interval in minutes (default 3)
    // --once        ? take a single sample then exit
    // --quiet       ? log to ns.print (tail window) instead of ns.tprint
    const flags = ns.flags([
        ["minutes", 3],
        ["once", false],
        ["quiet", false],
    ]);

    const minutes   = Number(flags.minutes);
    const INTERVAL  = Math.max(5_000, minutes * 60 * 1000); // min 5s to avoid spam
    const METRIC_FILE = "data/xp-throughput.txt";

    // Choose logging sink
    const useQuiet = !!flags.quiet;
    const log = (...args) => {
        if (useQuiet) {
            ns.print(...args);
        } else {
            ns.tprint(...args);
        }
    };

    if (useQuiet) {
        // Give you a live panel if you want to keep it running in the background
        ns.tail();
        ns.clearLog();
    }

    log(
        `?? XP Throughput Monitor started — interval: ${minutes} min ` +
        `(${(INTERVAL / 1000).toFixed(0)}s)`
    );

    let lastPlayer = ns.getPlayer();
    let lastXp = lastPlayer.exp.hacking;
    let lastTs = Date.now();

    while (true) {
        await ns.sleep(INTERVAL);

        const nowTs = Date.now();
        const nowPlayer = ns.getPlayer();
        const nowXp = nowPlayer.exp.hacking;

        let gained = nowXp - lastXp;
        let seconds = (nowTs - lastTs) / 1000;

        // Guard against weird timing / reset cases
        if (seconds <= 0) {
            seconds = 1;
        }

        // If XP dropped (e.g. reset), treat as fresh window from 0
        if (gained < 0) {
            gained = nowXp;
            // pretend previous timestamp was one interval ago for a reasonable rate
            seconds = Math.max(1, INTERVAL / 1000);
        }

        const xpPerSec = gained / seconds;

        log(
            `?? XP/sec avg over last ${seconds.toFixed(0)}s: ` +
            `${xpPerSec.toFixed(2)} XP/s ` +
            `(gained ${Math.floor(gained).toLocaleString()} XP)`
        );

        // Persist latest throughput sample for util/xp-to-next-level.js
        const payload = {
            ts: nowTs,
            windowSeconds: seconds,
            gained,
            xpPerSec,
        };
        ns.write(METRIC_FILE, JSON.stringify(payload), "w");

        if (flags.once) {
            // Single-shot mode: useful for dashboards or scripted sampling
            break;
        }

        lastXp = nowXp;
        lastTs = nowTs;
        lastPlayer = nowPlayer;
    }
}
```
/* == END FILE == */

/* == FILE: lib/augmentations.js == */
```js
/** @param {NS} ns */
/*
 * lib/augmentations.js
 *
 * Purchase-only augmentation automation helpers.
 *
 * Policy (Phase 2+):
 *  - Supports multiple â€œdesired setsâ€ (combat vs hacking allowlist)
 *  - Optional strict allowlist-only mode
 *  - Optional â€œforce NeuroFlux onlyâ€ mode (for NFG cadence)
 *  - Cash reserve supports:
 *      - base minReserve / pctReserve
 *      - hardReserve (absolute floor)
 *      - spendFracCap (cap spending to X% of current money, like corp lane)
 *
 * Notes
 *  - Probe-safe: if Singularity APIs aren't available, returns ok:false
 *  - This module is import-only (no --help; not intended to run directly)
 */

// ------------------------------------------------------------
// Defaults (keep these stable; tune later)
// ------------------------------------------------------------

export const AUG_DEFAULTS = {
  checkIntervalMs: 90_000,

  // Money safety:
  //  - minReserve: always keep at least this much cash
  //  - pctReserve: also keep this fraction of current cash (whichever is larger)
  minReserve: 1e9,
  pctReserve: 0.10,

  // Spend governor (optional):
  // If set (0..1), reserve will also include money * (1 - spendFracCap)
  // Example: spendFracCap=0.20 means â€œspend at most 20% of current cash per passâ€.
  spendFracCap: null,

  // Optional hard floor reserve (absolute dollars, independent of pctReserve)
  hardReserve: 0,

  // What to buy:
  buyNeuroFlux: false,
  maxPurchasesPerCheck: 8, // safety cap to avoid spending spree from one tick

  // Filtering behavior:
  preferDesiredOnly: false, // if true: buy only desired augs; else: buy any eligible unless blocked

  // Desired/blocked are passed in by caller per-phase.
  desiredNames: new Set(),
  blockedNames: new Set(),
};

// ------------------------------------------------------------
// Allowlists (Phase sets)
// ------------------------------------------------------------

// Your â€œafter gangâ€ allowlist from Hacking Augs.txt
export const HACKING_AUG_ALLOWLIST = new Set([
  "Neurotrainer I",
  "Hacknet Node NIC Architecture Neural-Upload",
  "Hacknet Node Cache Architecture Neural-Upload",
  "Synaptic Enhancement Implant",
  "BitWire",
  "ADR-V1 Pheromone Gene",
  "Social Negotiation Assistant (S.N.A)",
  "Neurotrainer II",
  "Hacknet Node Core Direct-Neural Interface",
  "Cranial Signal Processors - Gen I",
  "Artificial Synaptic Potentiation",
  "Cranial Signal Processors - Gen II",
  "Neurotrainer III",
  "Power Recirculation Core",
  "Neural-Retention Enhancement",
  "Embedded Netburner Module",
  "Neuregen Gene Modification",
  "The Shadow's Simulacrum",
  "DataJack",
  "Cranial Signal Processors - Gen III",
  "ADR-V2 Pheromone Gene",
  "FocusWire",
  "Cranial Signal Processors - Gen IV",
  "Enhanced Myelin Sheathing",
  "Embedded Netburner Module Core Implant",
  "HyperSight Corneal Implant",
  "Artificial Bio-neural Network Implant",
  "Neuralstimulator",
  "PC Direct-Neural Interface",
  "Xanipher",
  "BitRunners Neurolink",
  "Embedded Netburner Module Core V2 Upgrade",
  "PC Direct-Neural Interface Optimization Submodule",
  "SPTN-97 Gene Modification",
  "Embedded Netburner Module Analyze Engine",
  "Embedded Netburner Module Direct Memory Access Upgrade",
  "Embedded Netburner Module Core V3 Upgrade",
  "PC Direct-Neural Interface NeuroNet Injector",
  "QLink",
  "CRTX42-AA Gene Modification",
]);

// â€œPre-gangâ€ combat focus: keep this conservative + keyword assisted.
// (If you want a stricter/expanded combat set later, we can tune it.)
export const COMBAT_AUG_PREFER = new Set([
  // Common â€œgood early combatâ€ augs (names can vary by version/mods; keywords catch the rest)
  "Bionic Arms",
  "Bionic Legs",
  "Bionic Spine",
  "Synthetic Heart",
  "Graphene Bone Lacings",
  "Synfibril Muscle",
  "Nanofiber Weave",
  "NEMEAN Subdermal Weave",
  "Wired Reflexes",
]);

// Keywords for â€œcombat-ishâ€ augment names (fallback when allowlist doesnâ€™t include it)
const COMBAT_KEYWORDS = [
  "strength",
  "defense",
  "dexterity",
  "agility",
  "combat",
  "blade",
  "reflex",
  "muscle",
  "bone",
  "skin",
  "weave",
  "heart",
  "arm",
  "leg",
  "spine",
];

// Keywords: if aug name contains these (case-insensitive), itâ€™s likely valuable (hacking/rep)
const HACKING_KEYWORDS = [
  "hacking",
  "hack",
  "rep",
  "reputation",
  "faction",
  "company",
  "neural",
  "cranial",
  "bitwire",
  "datajack",
  "netburner",
  "synaptic",
  "cortex",
  "wires",
  "processor",
];

// ------------------------------------------------------------
// Capability probes
// ------------------------------------------------------------

export function hasAugApi(ns) {
  return Boolean(ns.singularity)
    && typeof ns.singularity.getOwnedAugmentations === "function"
    && typeof ns.singularity.getAugmentationsFromFaction === "function"
    && typeof ns.singularity.getAugmentationRepReq === "function"
    && typeof ns.singularity.getAugmentationPrice === "function"
    && typeof ns.singularity.purchaseAugmentation === "function"
    && typeof ns.singularity.getFactionRep === "function";
}

// ------------------------------------------------------------
// Core helpers
// ------------------------------------------------------------

export function getCashReserve(ns, opts = {}) {
  const minReserve = Number(opts.minReserve ?? AUG_DEFAULTS.minReserve);
  const pctReserve = Number(opts.pctReserve ?? AUG_DEFAULTS.pctReserve);
  const hardReserve = Number(opts.hardReserve ?? AUG_DEFAULTS.hardReserve ?? 0);

  const spendFracCap = (opts.spendFracCap ?? AUG_DEFAULTS.spendFracCap);
  const spendFrac = (spendFracCap === null || spendFracCap === undefined) ? null : Number(spendFracCap);

  const money = ns.getServerMoneyAvailable("home");

  const pct = Math.max(0, pctReserve) * money;
  const base = Math.max(0, minReserve, pct, hardReserve);

  // Mirror corp-lane style: reserve also includes money*(1-maxSpendFracPerCycle)
  // so spendable is capped to money*spendFracCap (when spendFracCap is set).
  if (Number.isFinite(spendFrac) && spendFrac > 0 && spendFrac < 1) {
    const fracReserve = money * (1 - spendFrac);
    return Math.max(base, fracReserve);
  }

  return base;
}

/**
 * Returns { ownedPlusPurchased, installedOnly, purchasedOnly } sets.
 */
export function getOwnedAndPurchasedAugs(ns) {
  const ownedPlusPurchased = new Set(ns.singularity.getOwnedAugmentations(true) || []);
  const installedOnly = new Set(ns.singularity.getOwnedAugmentations(false) || []);

  const purchasedOnly = new Set();
  for (const a of ownedPlusPurchased) {
    if (!installedOnly.has(a)) purchasedOnly.add(a);
  }

  return { ownedPlusPurchased, installedOnly, purchasedOnly };
}

export function isDesiredAug(name, opts = {}) {
  const desiredNames = opts.desiredNames ?? AUG_DEFAULTS.desiredNames;
  if (desiredNames instanceof Set && desiredNames.has(name)) return true;

  const mode = String(opts.desiredMode || "hacking"); // "hacking" | "combat"
  const lower = String(name || "").toLowerCase();

  const keys = mode === "combat" ? COMBAT_KEYWORDS : HACKING_KEYWORDS;
  for (const k of keys) {
    if (lower.includes(k)) return true;
  }
  return false;
}

/**
 * Collect augmentations you can see from your current factions.
 * Returns: { faction, name, repReq, price }
 */
export function listFactionAugmentations(ns) {
  if (!hasAugApi(ns)) return [];

  const player = ns.getPlayer();
  const factions = Array.from(player.factions || []);

  const out = [];
  for (const f of factions) {
    let augs = [];
    try {
      augs = ns.singularity.getAugmentationsFromFaction(f) || [];
    } catch {
      continue;
    }

    for (const name of augs) {
      try {
        const repReq = ns.singularity.getAugmentationRepReq(name);
        const price = ns.singularity.getAugmentationPrice(name);
        out.push({ faction: f, name, repReq, price });
      } catch {
        // ignore
      }
    }
  }

  return out;
}

/**
 * Determine whether an augmentation is buyable right now from a specific faction (rep gate only).
 */
export function isAugBuyableNow(ns, entry, opts = {}) {
  const name = entry?.name;
  if (!name) return false;

  const blockedNames = opts.blockedNames ?? AUG_DEFAULTS.blockedNames;
  if (blockedNames instanceof Set && blockedNames.has(name)) return false;

  if (!opts.buyNeuroFlux && name === "NeuroFlux Governor") return false;

  try {
    const rep = ns.singularity.getFactionRep(entry.faction);
    return rep >= entry.repReq;
  } catch {
    return false;
  }
}

/**
 * Purchase augmentations according to caller-supplied policy.
 *
 * Options (subset):
 *  - minReserve, pctReserve, hardReserve, spendFracCap
 *  - buyNeuroFlux
 *  - desiredNames, blockedNames
 *  - preferDesiredOnly
 *  - maxPurchasesPerCheck
 *  - desiredMode: "combat" | "hacking"  (keyword fallback)
 *
 * Returns:
 *  {
 *    ok: boolean,
 *    purchased: Array<{ name, faction, price }>,
 *    skipped: Array<{ name, faction, reason }>,
 *    nextTargets: Array<{ name, faction, repReq, repHave, repNeeded, price, desired }>,
 *    reserve: number,
 *    money: number,
 *    reason?: string
 *  }
 */
export function purchaseAugs(ns, opts = {}) {
  if (!hasAugApi(ns)) {
    return {
      ok: false,
      purchased: [],
      skipped: [],
      nextTargets: [],
      reserve: 0,
      money: ns.getServerMoneyAvailable("home"),
      reason: "no-singularity-aug-api",
    };
  }

  const config = {
    minReserve: Number(opts.minReserve ?? AUG_DEFAULTS.minReserve),
    pctReserve: Number(opts.pctReserve ?? AUG_DEFAULTS.pctReserve),
    hardReserve: Number(opts.hardReserve ?? AUG_DEFAULTS.hardReserve ?? 0),
    spendFracCap: (opts.spendFracCap ?? AUG_DEFAULTS.spendFracCap),

    buyNeuroFlux: Boolean(opts.buyNeuroFlux ?? AUG_DEFAULTS.buyNeuroFlux),

    desiredNames: (opts.desiredNames ?? AUG_DEFAULTS.desiredNames),
    blockedNames: (opts.blockedNames ?? AUG_DEFAULTS.blockedNames),

    preferDesiredOnly: Boolean(opts.preferDesiredOnly ?? AUG_DEFAULTS.preferDesiredOnly),
    maxPurchasesPerCheck: Math.max(1, Number(opts.maxPurchasesPerCheck ?? AUG_DEFAULTS.maxPurchasesPerCheck)),

    desiredMode: String(opts.desiredMode || "hacking"),
  };

  const money = ns.getServerMoneyAvailable("home");
  const reserve = getCashReserve(ns, config);

  const { ownedPlusPurchased } = getOwnedAndPurchasedAugs(ns);
  const entries = listFactionAugmentations(ns);

  const skipped = [];
  const candidates = [];

  for (const e of entries) {
    if (!e?.name) continue;

    if (ownedPlusPurchased.has(e.name)) {
      skipped.push({ name: e.name, faction: e.faction, reason: "already-owned-or-purchased" });
      continue;
    }

    const blockedNames = config.blockedNames;
    if (blockedNames instanceof Set && blockedNames.has(e.name)) {
      skipped.push({ name: e.name, faction: e.faction, reason: "blocked" });
      continue;
    }

    if (!config.buyNeuroFlux && e.name === "NeuroFlux Governor") {
      skipped.push({ name: e.name, faction: e.faction, reason: "neuroflux-disabled" });
      continue;
    }

    const desired = isDesiredAug(e.name, config);
    if (config.preferDesiredOnly && !desired) {
      skipped.push({ name: e.name, faction: e.faction, reason: "not-desired" });
      continue;
    }

    // NOTE: keep e's fields + add desired flag
    candidates.push({ ...e, desired });
  }

  // Build nextTargets list (rep gating) even if we canâ€™t buy yet
  const nextTargets = [];
  for (const c of candidates) {
    try {
      const repHave = ns.singularity.getFactionRep(c.faction);
      const repNeeded = Math.max(0, c.repReq - repHave);
      nextTargets.push({
        name: c.name,
        faction: c.faction,
        repReq: c.repReq,
        repHave,
        repNeeded,
        price: c.price,
        desired: c.desired,
      });
    } catch {
      // ignore
    }
  }

  // Sort nextTargets: desired first, then lowest rep needed, then cheapest
  nextTargets.sort((a, b) => {
    if (a.desired !== b.desired) return a.desired ? -1 : 1;
    if (a.repNeeded !== b.repNeeded) return a.repNeeded - b.repNeeded;
    return (a.price ?? 0) - (b.price ?? 0);
  });

  // Pick buyable-now candidates and sort by priority:
  // desired first, then cheapest first, then lowest repReq.
  const buyable = candidates
    .filter(c => isAugBuyableNow(ns, c, config))
    .sort((a, b) => {
      if (a.desired !== b.desired) return a.desired ? -1 : 1;
      if (a.price !== b.price) return (a.price ?? 0) - (b.price ?? 0);
      return (a.repReq ?? 0) - (b.repReq ?? 0);
    });

  const purchased = [];
  let purchasesLeft = config.maxPurchasesPerCheck;
  const boughtNames = new Set();

  for (const c of buyable) {
    if (purchasesLeft <= 0) break;
    if (boughtNames.has(c.name)) continue;

    // Re-check money live (prices can change as you buy)
    const curMoney = ns.getServerMoneyAvailable("home");
    const curReserve = getCashReserve(ns, config);
    const spendable = curMoney - curReserve;

    const price = Number(c.price ?? 0);
    if (!Number.isFinite(price) || price <= 0) continue;

    if (price > spendable) {
      skipped.push({ name: c.name, faction: c.faction, reason: "reserve-budget" });
      continue;
    }

    try {
      const ok = ns.singularity.purchaseAugmentation(c.faction, c.name);
      if (ok) {
        purchased.push({ name: c.name, faction: c.faction, price });
        boughtNames.add(c.name);
        purchasesLeft--;
      } else {
        skipped.push({ name: c.name, faction: c.faction, reason: "purchase-failed" });
      }
    } catch {
      skipped.push({ name: c.name, faction: c.faction, reason: "error" });
    }
  }

  return {
    ok: true,
    purchased,
    skipped,
    nextTargets,
    reserve,
    money: ns.getServerMoneyAvailable("home"),
  };
}
```
/* == END FILE == */

/* == FILE: lib/augs-controller.js == */
```js
/** @param {NS} ns */
/*
 * lib/augs-controller.js
 *
 * Description
 *  Controller lane wrapper for purchase-only augmentation automation.
 *   - Runs purchaseAugs() on an interval
 *   - Terminal output only when purchases happen (msgs[])
 *   - â€œNext targetsâ€ go to ns.print (tail log)
 *
 * Phase policy (your requested behavior):
 *  - Pre-gang: combat aug focus (aggressive)
 *  - Post-gang: switch to hacking/rep allowlist (Hacking Augs.txt)
 *      - Slow purchases to avoid sabotaging corp creation bankroll
 *      - Keep $150b reserved until corp exists
 *  - Post-corp: reserve mirrors corp-lane governor (reserveFunds + maxSpendFracPerCycle)
 *  - NFG cadence:
 *      - Once installed augs >= 20:
 *          After any non-NFG purchase, next two purchases must be NFG
 *          (strict: if NFG isnâ€™t buyable/affordable, skip instead of buying other augs)
 *
 * Notes
 *  - Import-only; not intended to be run directly.
 */

import {
  purchaseAugs,
  AUG_DEFAULTS,
  HACKING_AUG_ALLOWLIST,
  COMBAT_AUG_PREFER,
  getOwnedAndPurchasedAugs,
} from "lib/augmentations.js";

import { fmtMoney } from "lib/format.js";
import { inGang } from "lib/gang.js";
import { CORP_LANE_DEFAULTS } from "lib/corp-lane.js";

const CORP_CREATION_RESERVE = 150_000_000_000;

// Small convenience
function hasCorp(ns) {
  const c = ns.corporation;
  if (!c || typeof c.hasCorporation !== "function") return false;
  try { return Boolean(c.hasCorporation()); } catch { return false; }
}

function getInstalledAugCount(ns) {
  try {
    // installed only
    return (ns.singularity.getOwnedAugmentations(false) || []).length;
  } catch {
    return 0;
  }
}

export function runAugmentationTick(ns, state, msgs) {
  // state is owned by controller, but this lane defines expected keys:
  // {
  //   lastCheck:number,
  //   lastNextBrief:string,
  //   nfgDebt:number
  // }
  if (!state) return;

  if (state.nfgDebt === undefined) state.nfgDebt = 0;

  const now = Date.now();
  const last = Number(state.lastCheck || 0);
  if (now - last < AUG_DEFAULTS.checkIntervalMs) return;
  state.lastCheck = now;

  const gang = inGang(ns);
  const corp = hasCorp(ns);

  const installedAugs = getInstalledAugCount(ns);
  const nfgModeActive = installedAugs >= 20;

  // ------------------------------------------------------------
  // 1) Build policy for this tick
  // ------------------------------------------------------------

  // If we owe NFG purchases, we go strict: ONLY attempt NFG.
  // (This guarantees your â€œnext two purchases should be NFGâ€ rule.)
  let opts = { ...AUG_DEFAULTS };

  if (nfgModeActive && state.nfgDebt > 0) {
    opts = {
      ...opts,
      buyNeuroFlux: true,
      preferDesiredOnly: true,
      desiredNames: new Set(["NeuroFlux Governor"]),
      desiredMode: "hacking",
      maxPurchasesPerCheck: 1, // one NFG per interval to reduce â€œspend shockâ€
    };
  } else if (!gang) {
    // Pre-gang: combat focus
    opts = {
      ...opts,
      buyNeuroFlux: false,
      preferDesiredOnly: false, // allow keyword matches too (combat mode)
      desiredNames: COMBAT_AUG_PREFER,
      desiredMode: "combat",
      maxPurchasesPerCheck: opts.maxPurchasesPerCheck,
    };
  } else {
    // Post-gang: hacking/rep allowlist (your txt)
    opts = {
      ...opts,
      buyNeuroFlux: false,
      preferDesiredOnly: true, // strict allowlist so you donâ€™t drift into random combat augs
      desiredNames: HACKING_AUG_ALLOWLIST,
      desiredMode: "hacking",
      maxPurchasesPerCheck: 1, // slow down after gang as requested
    };

    // Pre-corp: dynamic spending based on progression (installed augmentations).
    // Goal: early/mid-game can buy hacking augs to accelerate income,
    // while still preventing runaway â€œspend shockâ€ before corp exists.
    if (!corp) {
      const a = Number(installedAugs || 0);

      // More aggressive early, tighter later.
      // Tune these thresholds later if you want; this is intentionally simple.
      let cap = 0.20;
      if (a < 5) cap = 0.50;
      else if (a < 10) cap = 0.35;
      else if (a < 15) cap = 0.25;
      else cap = 0.20;

      // Use existing reserve mechanics (no new system, no redesign)
      opts.spendFracCap = cap;

      // Keep a safety cash floor (defaults already include minReserve=1e9, but make it explicit)
      opts.minReserve = Math.max(Number(opts.minReserve || 0), 1e9);

      // IMPORTANT: remove the $150b hard block
      opts.hardReserve = 0;
    } else {
      // Post-corp: mirror corp-lane spend governor (your requested option C)
      // Apply corp-lane reserveFunds and maxSpendFracPerCycle to PLAYER aug spending.
      opts.minReserve = Math.max(Number(opts.minReserve), Number(CORP_LANE_DEFAULTS.reserveFunds || 0));
      opts.spendFracCap = Number(CORP_LANE_DEFAULTS.maxSpendFracPerCycle || 0.20);
    }
  }
  // ------------------------------------------------------------
  // 2) Run purchase pass
  // ------------------------------------------------------------

  const beforeOwned = getOwnedAndPurchasedAugs(ns);

  const res = purchaseAugs(ns, opts);

  // Reserve hint for other lanes (home upgrades, etc.)
  state.reserveHint = computeAugReserveHint(res.nextTargets);

  if (!res.ok) {
    ns.print(`[augs] skip: ok=false reason=${res.reason ?? "unknown"}`);
    return;
  }

  // Script log: â€œnext targetsâ€
  const brief = formatAugTargetsBrief(res.nextTargets, 3);
  if (brief) {
    ns.print(`[augs] next: ${brief}`);
    state.lastNextBrief = brief;
  }

  // Terminal: only when purchases happen
  if (res.purchased?.length) {
    for (const p of res.purchased) {
      msgs.push(`[augs] bought ${p.name} @ ${p.faction} for ${fmtMoney(ns, p.price)}`);
    }
  }

  // ------------------------------------------------------------
  // 3) Update NFG debt state (strict cadence)
  // ------------------------------------------------------------

  if (!nfgModeActive) return;
  if (!res.purchased?.length) return;

  // Determine what we bought this pass (names only)
  const boughtNames = new Set(res.purchased.map(x => x?.name).filter(Boolean));

  if (boughtNames.has("NeuroFlux Governor")) {
    // Paying down debt
    if (state.nfgDebt > 0) state.nfgDebt = Math.max(0, Number(state.nfgDebt) - 1);
    return;
  }

  // If we bought ANY non-NFG aug, set debt to 2 (your exact rule)
  // (We donâ€™t stack debt; we enforce â€œnext twoâ€ after each non-NFG purchase.)
  state.nfgDebt = 2;

  // Defensive: if somehow NFG was purchased but name mismatch, ignore
  // (we handled the common case above)
  void beforeOwned;
}

function formatAugTargetsBrief(nextTargets, max = 3) {
  const list = (nextTargets || []).slice(0, Math.max(0, max));
  if (!list.length) return "";

  return list.map(t => {
    const tag = t.desired ? "[D]" : "[ ]";
    const repNeed = Math.ceil(Number(t.repNeeded ?? 0));
    return `${tag} ${t.name} @ ${t.faction} repNeed=${repNeed}`;
  }).join(" | ");
}

function computeAugReserveHint(nextTargets) {
  const list = nextTargets || [];
  const desired = list.filter(t => t && t.desired);
  const pick = (desired.length ? desired : list)[0];
  if (!pick) return 0;

  const price = Number(pick.price || 0);
  if (!Number.isFinite(price) || price <= 0) return 0;

  return Math.ceil(price * 1.10);
}
```
/* == END FILE == */

/* == FILE: lib/corp-lane.js == */
```js
/** @param {NS} ns */
/*
 * lib/corp-lane.js
 *
 * Description
 *  Corporation automation lane with strict spend gating.
 *  Primary goal: NEVER â€œrun awayâ€ with spending early and sabotage investments.
 *
 * UPDATED (bootstrap, per-tick capex burst)
 *  - When bootstrapEnabled=true, performs up to bootstrapMaxCapexActionsPerTick CAPEX actions
 *    per runCorpTick() call (your â€œBâ€ requirement).
 *  - Bootstrap progression matches your intended setup:
 *      1) Create division (one at a time, in plan order)
 *      2) Expand first city
 *      3) Create warehouse
 *      4) Upgrade office to 15
 *      5) Hire employees to fill (NOW treated as maintenance, not capex-coupled)
 *      6) Staff employees (intern rule handled in maintenance)
 *      7) Set max/mp for sales (Agri materials + products handled in maintenance)
 *      8) For Agri only, between city 1 and 2: buy must-have unlocks/upgrades
 *      9) Expand next city and repeat until all cities have offices
 *     10) Move to next division and repeat
 *
 *  - After bootstrap is complete, reverts to the original conservative behavior
 *    (one capex per corp cycle if oneCapexActionPerCycle=true).
 *
 * Notes
 *  - Import-only module. Not meant to be run directly.
 *  - Designed for â€œquiet terminal / rich logâ€ controller style:
 *      - pushes terminal-facing messages into msgs[] only when a real action occurs
 *      - avoids repeated â€œcanâ€™t affordâ€ spam via cooldowns
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

  // Export planner
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

  // Anti-spam cooldown on failed â€œcanâ€™t affordâ€
  failCooldownMs: 60_000,

  // Warehouse upgrade policy (conservative)
  warehouseFillUpgradeThreshold: 0.85,   // if used/size >= this, consider upgrade (capex)
  warehouseMinSizeForUpgrade: 200,       // don't churn upgrades on tiny warehouses
  warehouseUpgradeLevelsPerAction: 1,    // upgradeWarehouse(div, city, levels)

  // Product policy
  productDivTypes: ["Tobacco", "Robotics"],
  productDevCityPreference: "Sector-12", // try this city first for makeProduct/getProduct
  productBudgetFracOfSpendable: 0.50,
  productBudgetMin: 100_000_000,
  productBudgetMax: 50_000_000_000,

  // When at capacity and all products are finished, discontinue the weakest before creating next
  enableProductDiscontinue: true,

  // AdVert policy (product divisions only)
  enableAdVert: true,
  advertBudgetFracOfSpendable: 0.10,
  advertBudgetMin: 50_000_000,
  advertBudgetMax: 5_000_000_000,

  // Unlock purchase order (global). (Kept for non-bootstrap mode; bootstrap has its own must-have list)
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
  // Bootstrap mode
  // ------------------------------------------------------------
  bootstrapEnabled: true,

  // Perform up to N CAPEX actions per tick (per runCorpTick call)
  bootstrapMaxCapexActionsPerTick: 8,

  // Bootstrap spend governor (more permissive so you can actually build out)
  bootstrapReserveFunds: 200_000_000,
  bootstrapMaxSpendFracPerCycle: 0.80,

  // Your initial staffing target: 15 max for now
  bootstrapOfficeSizeTarget: 15,

  // Must-have â€œbetween city 1 and city 2 for Agriâ€
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

  // Export throttle state
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
  //    IMPORTANT FIX:
  //      - Hiring to fill is FREE and now runs here every tick.
  //      - Office upgrades remain capex-gated; hiring no longer depends on them.
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

      // FREE: always hire to fill current office size
      ensureHireToFillSafe(corp, divName, city);
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
          ensureOfficeSizeOnlySafe(corp, divName, cityNeedingOffice, officeTarget);
          return { changed: true, msg: `[corp] [${divName}/${cityNeedingOffice}] office->${officeTarget} cost~${fmt(cost)}` };
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

    // 1) Create division (one at a time)
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

    // 2) Ensure city exists (expand in order)
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

    // 3) Warehouse
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

    // 4) Office size to target (capex). Hiring is handled in maintenance.
    if (needOfficeCity) {
      const ok = tryCapexBootstrap(
        ns,
        laneCfg,
        state,
        msgs,
        `bootstrap:upgradeOffice:${divName}:${needOfficeCity}:${officeTarget}`,
        () => getOfficeUpgradeCostSafe(corp, divName, needOfficeCity, officeTarget),
        (cost) => {
          ensureOfficeSizeOnlySafe(corp, divName, needOfficeCity, officeTarget);
          return { changed: true, msg: `[corp/bootstrap] [${divName}/${needOfficeCity}] office->${officeTarget} cost~${fmt(cost)}` };
        }
      );
      if (!ok) return;
      continue;
    }

    // 5) Must-haves between city1 and city2 for Agri
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

      // If we couldn't buy anything (too expensive), stop spending for this tick.
      return;
    }

    // Completed for current target; stop to avoid looping in place.
    return;
  }

  // keeps lint happy if firstCity used in future edits
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

    // 1) Need create
    if (!divisionExists(corp, divName)) {
      return { divName, divType, divObj: null, needCreate: true };
    }

    const divObj = safeObj(() => corp.getDivision(divName), null);
    if (!divObj) continue;

    const haveCities = new Set(divObj.cities || []);

    // 2) Ensure first city
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

    // Before expanding more cities: ensure all existing cities have warehouse+office size
    const needWarehouseCity = pickCityNeedingWarehouse(corp, divName, divObj.cities || []);
    if (needWarehouseCity) {
      return { divName, divType, divObj, needWarehouseCity };
    }

    const needOfficeCity = pickCityNeedingOfficeSize(corp, divName, divObj.cities || [], officeTarget);
    if (needOfficeCity) {
      return { divName, divType, divObj, needOfficeCity };
    }

    // Agri gate: must-haves between city1 and city2
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

    // Expand next city (and repeat)
    const nextCity = pickNextMissingCity(divObj, cities);
    if (nextCity) {
      return { divName, divType, divObj, needExpandCity: true, expandCity: nextCity };
    }

    // Division complete; continue to next division.
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
    // Employees are filled via maintenance, but we still consider it "built" only when filled.
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
// Corporate â€œsafe wrappersâ€
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

/**
 * IMPORTANT FIX:
 *   This must ONLY detect office SIZE upgrades (capex).
 *   Hiring to fill is FREE and handled in maintenance, so do NOT return a city just because
 *   employees < size.
 */
function pickCityNeedingOfficeSize(corp, divName, cities, targetSize) {
  for (const c of cities || []) {
    try {
      const o = corp.getOffice(divName, c);
      if ((o?.size || 0) < targetSize) return c;
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

    // Upgrade ONE level per action
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
// Actions: office sizing + hiring
// ---------------------------------------------------------------------

// CAPEX: size only
function ensureOfficeSizeOnlySafe(corp, divName, city, targetSize) {
  try {
    const office = corp.getOffice(divName, city);
    const size = Number(office?.size || 0);
    if (size < targetSize) {
      corp.upgradeOfficeSize(divName, city, targetSize - size);
    }
  } catch {}
}

// FREE: hire to fill
function ensureHireToFillSafe(corp, divName, city) {
  try {
    const o = corp.getOffice(divName, city);
    const need = Math.max(0, (o?.size || 0) - (o?.numEmployees || 0));
    for (let i = 0; i < need; i++) {
      try { corp.hireEmployee(divName, city); } catch { break; }
    }
  } catch {}
}

// ---------------------------------------------------------------------
// Product lane (sell + discontinue + create)
// ---------------------------------------------------------------------

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

    // Only discontinue if all are finished
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

    // Need at least one warehouse city
    if (!safeBool(() => corp.hasWarehouse(divName, buildCity), false)) {
      const anyWhCity = cities.find(c => safeBool(() => corp.hasWarehouse(divName, c), false));
      if (!anyWhCity) return false;
    }

    const products = Array.isArray(divObj?.products) ? divObj.products : [];
    const maxProducts = getMaxProductsSafe(corp, divName, divObj);
    if (products.length >= maxProducts) return false;

    // Don't start a new product if any existing product is still developing
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

    const cap = Math.max(1, officeSize * 2); // units/sec
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
```
/* == END FILE == */

/* == FILE: lib/daemon-lane.js == */
```js
// lib/daemon-lane.js

import { ensureDaemon, killScripts } from "lib/orchestrator.js";
import { hasTixAnd4S } from "lib/singularity.js";
import { inGang } from "lib/gang.js";

/** @param {NS} ns */
export function runDaemonLane(ns, cfg, targets, msgs) {
  // Enabled-map support (optional)
  // Controller can pass cfg.servicesEnabled = { batcher:true/false, ... }
  const enabled = (cfg && cfg.servicesEnabled && typeof cfg.servicesEnabled === "object")
    ? cfg.servicesEnabled
    : null;

  const pservScript = normScript(cfg.pserv);
  const batcherScript = normScript(cfg.batcher);
  const botnetScript = normScript(cfg.botnet);
  const traderScript = normScript(cfg.trader);
  const gangScript = normScript(cfg.gangManager);
  const bladeburnerScript = normScript(cfg.bladeburnerManager);

  const pservArgs = normArgs(cfg.pservArgs || []);

  // Helper: decide if a key is enabled (default true if no map present)
  const isEnabled = (key) => {
    if (!enabled) return true;
    if (!Object.prototype.hasOwnProperty.call(enabled, key)) return true;
    return !!enabled[key];
  };

  // Optional: once-per-boot disable log suppression
  // (controller can pass cfg._servicesDisableLogSet; otherwise we'll create one)
  if (!cfg._servicesDisableLogSet) cfg._servicesDisableLogSet = new Set();

  const noteDisabledOnce = (key, script) => {
    if (!msgs) return;
    const tag = `${key}:${script}`;
    if (cfg._servicesDisableLogSet.has(tag)) return;
    cfg._servicesDisableLogSet.add(tag);
    msgs.push(`[os] disabled ${key} (${script})`);
  };

  // ------------------------------------------------------------
  // pserv-manager: enforce args (maxRam cap policy)
  // ------------------------------------------------------------
  if (isEnabled("pserv")) {
    let pservRes = ensureDaemon(ns, pservScript, {
      host: "home",
      threads: 1,
      args: pservArgs,
      reserveRam: cfg.reserveRam,
      requireArgsMatch: true,
    });

    if (pservRes?.action === "skipped" && pservRes?.reason === "args-mismatch") {
      const killed = killScripts(ns, "home", new Set([pservScript]));
      pservRes = ensureDaemon(ns, pservScript, {
        host: "home",
        threads: 1,
        args: pservArgs,
        reserveRam: cfg.reserveRam,
        requireArgsMatch: true,
      });
      if (killed?.attempted > 0) msgs.push(`[restart] ${pservScript} (args changed)`);
    }
    msgs.push(...fmtEnsure(pservRes, pservScript, pservArgs));
  } else {
    noteDisabledOnce("pserv", pservScript);
  }

  // ------------------------------------------------------------
  // batcher: enforce args (target)
  // ------------------------------------------------------------
  if (isEnabled("batcher")) {
    const batchArgs = normArgs([targets.primary]);
    const batchRes = ensureWithArgsPolicy(ns, batcherScript, batchArgs, cfg, msgs);
    msgs.push(...fmtEnsure(batchRes, batcherScript, batchArgs));
  } else {
    noteDisabledOnce("batcher", batcherScript);
  }

  // ------------------------------------------------------------
  // botnet: enforce args (hgw target + mode)
  // ------------------------------------------------------------
  if (isEnabled("botnet")) {
    const botArgs = normArgs([targets.hgw, cfg.hgwMode]);
    const botRes = ensureWithArgsPolicy(ns, botnetScript, botArgs, cfg, msgs);
    msgs.push(...fmtEnsure(botRes, botnetScript, botArgs));
  } else {
    noteDisabledOnce("botnet", botnetScript);
  }

  // ------------------------------------------------------------
  // trader (only if stock APIs present)
  // ------------------------------------------------------------
  if (isEnabled("trader")) {
    if (hasTixAnd4S(ns)) {
      msgs.push(
        ...fmtEnsure(
          ensureDaemon(ns, traderScript, { host: "home", threads: 1, reserveRam: cfg.reserveRam }),
          traderScript
        )
      );
    }
  } else {
    noteDisabledOnce("trader", traderScript);
  }

  // ------------------------------------------------------------
  // gang manager
  // ------------------------------------------------------------
  if (isEnabled("gangManager")) {
    if (inGang(ns)) {
      msgs.push(
        ...fmtEnsure(
          ensureDaemon(ns, gangScript, { host: "home", threads: 1, reserveRam: cfg.reserveRam }),
          gangScript
        )
      );
    }
  } else {
    noteDisabledOnce("gangManager", gangScript);
  }

  // ------------------------------------------------------------
  // intelligence trainer
  // ------------------------------------------------------------
  // PERMANENT: intelligence training is governed by lib/player-policy.js.
  // Controller/daemon-lane MUST NOT spawn bin/intelligence-trainer.js.


  // ------------------------------------------------------------
  // Bladeburner manager (BN6 / SF7+)
  // ------------------------------------------------------------
  if (isEnabled("bladeburnerManager")) {
    const bbRes = ensureDaemon(ns, bladeburnerScript, {
      host: "home",
      threads: 1,
      args: [], // keep daemon args inside the script for now
      reserveRam: cfg.reserveRam,
    });

    if (bbRes?.action && msgs) msgs.push(`[svc] bladeburner: ${bbRes.action}`);
  } else {
    noteDisabledOnce("bladeburnerManager", bladeburnerScript);
  }
}


function ensureWithArgsPolicy(ns, script, args, cfg, msgs) {
  let res = ensureDaemon(ns, script, {
    host: "home",
    threads: 1,
    args,
    reserveRam: cfg.reserveRam,
    requireArgsMatch: true,
  });

  if (res?.action === "skipped" && res?.reason === "args-mismatch") {
    const killed = killScripts(ns, "home", new Set([script]));
    res = ensureDaemon(ns, script, {
      host: "home",
      threads: 1,
      args,
      reserveRam: cfg.reserveRam,
      requireArgsMatch: true,
    });
    if (killed?.attempted > 0) msgs.push(`[restart] ${script} (args changed)`);
  }

  return res;
}

function fmtEnsure(res, script, args = null) {
  const out = [];
  if (!res) return out;

  if (res.action === "started") {
    out.push(`[start] ${script}${args ? " " + JSON.stringify(args) : ""}`);
  } else if (res.action === "skipped") {
    if (res.reason === "insufficient-ram") {
      out.push(`[ram] skip ${script}`);
    } else if (res.reason === "missing-file") {
      out.push(`[missing] ${script}`);
    } else if (res.reason === "args-mismatch") {
      out.push(`[args] mismatch ${script}${args ? " want " + JSON.stringify(args) : ""}`);
    }
  }
  return out;
}

// ------------------------------------------------------------
// Normalization helpers
// ------------------------------------------------------------

function normScript(p) {
  return String(p || "").replace(/^\/+/, "");
}

function normArgs(args) {
  return (args || []).map((a) => String(a));
}
```
/* == END FILE == */

/* == FILE: lib/format.js == */
```js
/** @param {NS} ns */
/*
 * lib/format.js
 *
 * Shared formatting + small utility helpers used across scripts.
 *
 * Goals:
 *  - Eliminate duplicated clamp/format/padding helpers across UI, corp, and controllers.
 *  - Keep helpers small, predictable, and dependency-free.
 *
 * Notes:
 *  - This is a library module (import-only). It is not intended to be run directly.
 */

// ------------------------------------------------------------
// Numeric helpers
// ------------------------------------------------------------

export function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

export function clamp01(x) {
  if (!isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function pct(x, digits = 1) {
  const v = clamp01(Number(x));
  return (v * 100).toFixed(Math.max(0, digits)) + "%";
}

// ------------------------------------------------------------
// String helpers
// ------------------------------------------------------------

export function padLeft(s, width, ch = " ") {
  const str = String(s);
  const w = Math.max(0, Number(width) || 0);
  if (str.length >= w) return str;
  return ch.repeat(w - str.length) + str;
}

export function padRight(s, width, ch = " ") {
  const str = String(s);
  const w = Math.max(0, Number(width) || 0);
  if (str.length >= w) return str;
  return str + ch.repeat(w - str.length);
}

/**
 * Simple join that skips falsy/empty pieces.
 * Useful for building compact status lines.
 */
export function joinNonEmpty(parts, sep = " ") {
  return (parts || []).map(String).map(s => s.trim()).filter(Boolean).join(sep);
}

// ------------------------------------------------------------
// Money/number formatting helpers
// ------------------------------------------------------------

/**
 * Format money with consistent prefix and precision.
 * Mirrors patterns you already use in startup-home-advanced.js.
 */
export function fmtMoney(ns, value, decimals = 2, minPrefix = 1e3) {
  return "$" + ns.formatNumber(value, decimals, minPrefix);
}

/**
 * General number formatter (no $), useful for corp/UI dashboards.
 */
export function fmtNum(ns, value, decimals = 2, minPrefix = 1e3) {
  return ns.formatNumber(value, decimals, minPrefix);
}

/**
 * Format milliseconds as a compact human string.
 * Examples:
 *  - 950 -> "950ms"
 *  - 12_345 -> "12.3s"
 *  - 90_000 -> "1.5m"
 *  - 3_600_000 -> "1.0h"
 */
export function fmtTime(ms) {
  const x = Number(ms);
  if (!isFinite(x)) return "NaN";
  const abs = Math.abs(x);

  if (abs < 1000) return `${Math.round(x)}ms`;
  if (abs < 60_000) return `${(x / 1000).toFixed(1)}s`;
  if (abs < 3_600_000) return `${(x / 60_000).toFixed(1)}m`;
  return `${(x / 3_600_000).toFixed(1)}h`;
}
```
/* == END FILE == */

/* == FILE: lib/gang.js == */
```js
/** @param {NS} ns */
/*
 * lib/gang.js
 *
 * Shared gang helpers:
 *  - Capability / readiness checks
 *  - Choosing a candidate faction for gang creation
 *  - Attempting to create a gang (safe, retryable)
 *
 * Notes
 *  - This is a library module (import-only). It is not intended to be run directly.
 *  - createGang will fail until the game conditions are met (karma, faction membership, etc.).
 *    These helpers are designed for â€œtry each tick until it worksâ€ patterns.
 */

// ------------------------------------------------------------
// Capability / readiness checks
// ------------------------------------------------------------

export function hasGangApi(ns) {
  return Boolean(ns.gang) && typeof ns.gang.inGang === "function";
}

export function inGang(ns) {
  if (!hasGangApi(ns)) return false;
  try {
    return Boolean(ns.gang.inGang());
  } catch (_e) {
    return false;
  }
}

/**
 * True if the createGang API exists (does NOT guarantee it will succeed).
 */
export function canAttemptCreateGang(ns) {
  return Boolean(ns.gang && typeof ns.gang.createGang === "function");
}

/**
 * Convenience: â€œis it meaningful to attempt gang creation now?â€
 * - must have gang API
 * - must NOT already be in a gang
 * - must have createGang function
 */
export function shouldAttemptCreateGang(ns) {
  return hasGangApi(ns) && !inGang(ns) && canAttemptCreateGang(ns);
}

// ------------------------------------------------------------
// Faction selection
// ------------------------------------------------------------

/**
 * Default candidate factions (covers both combat and hacking gangs).
 * Order matters: earlier ones will be preferred if youâ€™re a member.
 */
export function defaultGangFactions() {
  return [
    "Slum Snakes",
    "Tetrads",
    "The Syndicate",
    "Speakers for the Dead",
    "The Dark Army",
    "NiteSec",
    "The Black Hand",
  ];
}

/**
 * Pick a gang faction that the player is currently in.
 * If preferredFaction is provided, it will be returned only if the player has joined it.
 */
export function pickGangFactionFromPlayer(ns, {
  preferredFaction = "",
  candidates = defaultGangFactions(),
} = {}) {
  const pref = String(preferredFaction || "").trim();
  const joined = new Set((ns.getPlayer().factions || []).map(String));

  if (pref && joined.has(pref)) return pref;

  for (const f of candidates || []) {
    if (joined.has(f)) return f;
  }

  return "";
}

// ------------------------------------------------------------
// Gang creation
// ------------------------------------------------------------

/**
 * Attempt to create a gang.
 *
 * Returns:
 *  { ok: boolean, changed: boolean, reason?: string, faction?: string }
 *
 * - ok=false indicates a hard inability (no API) or an error
 * - changed=true indicates gang was created successfully
 * - changed=false with ok=true indicates â€œnot ready yetâ€ (common; safe to retry)
 */
export function maybeCreateGang(ns, {
  preferredFaction = "",
  candidates = defaultGangFactions(),
} = {}) {
  if (!shouldAttemptCreateGang(ns)) {
    if (!hasGangApi(ns)) return { ok: false, changed: false, reason: "no-gang-api" };
    if (inGang(ns)) return { ok: true, changed: false, reason: "already-in-gang" };
    if (!canAttemptCreateGang(ns)) return { ok: false, changed: false, reason: "no-createGang" };
    return { ok: true, changed: false, reason: "not-ready" };
  }

  const faction = pickGangFactionFromPlayer(ns, { preferredFaction, candidates });
  if (!faction) return { ok: true, changed: false, reason: "no-eligible-faction" };

  try {
    const success = Boolean(ns.gang.createGang(faction));
    if (success) return { ok: true, changed: true, reason: "created", faction };
    return { ok: true, changed: false, reason: "create-failed", faction };
  } catch (_e) {
    // Failure is common when karma/requirements aren't met.
    return { ok: true, changed: false, reason: "error-or-not-ready", faction };
  }
}
```
/* == END FILE == */

/* == FILE: lib/hacknet-lane.js == */
```js
/** @param {NS} ns */
/*
 * lib/hacknet-lane.js
 *
 * Description
 *  Controller lane for Hacknet.
 *   - Budgeted upgrades (nodes/level/ram/core) with minimal terminal spam
 *   - ROI-gated upgrades (payback threshold) to avoid â€œmoney pitâ€ behavior
 *   - Optional hash spending when Hacknet Servers / hashes are available
 *
 * Notes
 *  - This module is import-only; not intended to be run directly.
 *  - Designed for â€œquiet terminal / rich logâ€ controller pattern:
 *      - pushes terminal-facing messages into msgs[] only when an action occurs
 *      - uses state to throttle work and avoid repeated spam
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

import { fmtMoney } from "lib/format.js";

export const HACKNET_LANE_DEFAULTS = {
  enabled: true,

  // How often we even consider Hacknet actions
  tickMs: 15_000,

  // Spend policy (money)
  spendFraction: 0.10,   // spend up to this fraction of current cash per tick
  minBudget: 100_000,    // if budget below this, skip

  // Optional â€œsave for augsâ€ gating (future-proof hook)
  pauseWhenCashAtOrAbove: 0, // 0 disables. If >0 and cash >= this, skip upgrades.

  // ROI gating
  roiMode: "payback",        // "payback" | "off"
  maxPaybackSec: 10 * 60,    // 10-minute gate (user requested)
  minDeltaPerSec: 0.5,       // ignore tiny deltas (noise / rounding)

  // Hash spending policy (when hashes exist)
  hashMode: "auto",      // "auto" | "on" | "off"
  hashSpendTickMs: 10_000,
  hashSpendAtCapacity: 0.90, // when hashes >= 90% capacity, start dumping
  hashDumpAction: "Sell for Money", // safest universal dump

  // Optional extra hash actions (applied only if affordable and not blocking dump)
  hashPreferredActions: [
    // "Increase Maximum Money",
    // "Reduce Minimum Security",
    // "Improve Studying",
    // "Improve Gym Training",
  ],
};

/**
 * Main lane tick: upgrades hacknet and/or spends hashes.
 * @param {NS} ns
 * @param {object} cfg  controller cfg (weâ€™ll read optional hacknet overrides from cfg.hacknet)
 * @param {object} state mutable lane state object (owned by controller)
 * @param {string[]} msgs terminal-facing messages (only when actions occur)
 */
export function runHacknetTick(ns, cfg, state, msgs) {
  const laneCfg = { ...HACKNET_LANE_DEFAULTS, ...((cfg && cfg.hacknet) || {}) };
  if (!laneCfg.enabled) return;

  if (!state) return;
  if (state.lastTick === undefined) state.lastTick = 0;
  if (state.lastHashTick === undefined) state.lastHashTick = 0;

  const now = Date.now();
  if (now - state.lastTick < laneCfg.tickMs) {
    // Hash spending can run on its own cadence
    runHashSpendingTick(ns, laneCfg, state, msgs);
    return;
  }
  state.lastTick = now;

  // Optional â€œhard pauseâ€ hook (useful later when you compute aug budget in controller)
  const cash = safeMoney(ns);
  if (laneCfg.pauseWhenCashAtOrAbove > 0 && cash >= laneCfg.pauseWhenCashAtOrAbove) {
    runHashSpendingTick(ns, laneCfg, state, msgs);
    return;
  }

  // Spend hashes first (so we donâ€™t waste production at cap)
  runHashSpendingTick(ns, laneCfg, state, msgs);

  // Then consider upgrades
  const budget = cash * laneCfg.spendFraction;
  if (!Number.isFinite(budget) || budget < laneCfg.minBudget) return;

  const best =
    laneCfg.roiMode === "payback"
      ? pickBestPaybackUpgrade(ns, laneCfg.maxPaybackSec, laneCfg.minDeltaPerSec)
      : pickCheapestHacknetUpgrade(ns);

  if (!best || !Number.isFinite(best.cost) || best.cost > budget) return;

  const ok = performHacknetUpgrade(ns, best);
  if (ok) {
    const pb = Number.isFinite(best.paybackSec) ? ` (payback~${Math.ceil(best.paybackSec)}s)` : "";
    msgs.push(`[hacknet] ${best.label} for ${fmtMoney(ns, best.cost)}${pb}`);
  }
}

// ------------------------------------------------------------
// Upgrade selection (ROI payback gate)
// ------------------------------------------------------------

function pickBestPaybackUpgrade(ns, maxPaybackSec, minDeltaPerSec) {
  if (!ns.hacknet) return null;

  const numNodes = safeNum(() => ns.hacknet.numNodes(), 0);
  const candidates = [];

  // Candidate: buy new node
  {
    const cost = safeNum(() => ns.hacknet.getPurchaseNodeCost(), Infinity);
    const delta = estimateNewNodeDelta(ns);
    if (Number.isFinite(cost) && delta >= minDeltaPerSec) {
      candidates.push(makeCandidate("node", -1, cost, delta, "buy node"));
    }
  }

  // Candidates: per-node upgrades
  for (let i = 0; i < numNodes; i++) {
    candidates.push(...estimateNodeUpgradeCandidates(ns, i, minDeltaPerSec));
  }

  const viable = candidates.filter(c => Number.isFinite(c.paybackSec) && c.paybackSec <= maxPaybackSec);
  if (!viable.length) return null;

  viable.sort((a, b) => a.paybackSec - b.paybackSec);
  return viable[0];
}

function makeCandidate(type, index, cost, deltaPerSec, label) {
  const paybackSec = deltaPerSec > 0 ? (cost / deltaPerSec) : Infinity;
  return { type, index, cost, deltaPerSec, paybackSec, label };
}

function estimateNodeUpgradeCandidates(ns, i, minDeltaPerSec) {
  const out = [];
  const stats = safeObj(() => ns.hacknet.getNodeStats(i), null);
  if (!stats) return out;

  const baseProd = estimateNodeProduction(ns, stats);

  const costLevel = safeNum(() => ns.hacknet.getLevelUpgradeCost(i, 1), Infinity);
  const costRam   = safeNum(() => ns.hacknet.getRamUpgradeCost(i, 1), Infinity);
  const costCore  = safeNum(() => ns.hacknet.getCoreUpgradeCost(i, 1), Infinity);

  // level+1
  if (Number.isFinite(costLevel)) {
    const prod2 = estimateNodeProduction(ns, { ...stats, level: stats.level + 1 });
    const delta = prod2 - baseProd;
    if (delta >= minDeltaPerSec) out.push(makeCandidate("level", i, costLevel, delta, `level+1 node ${i}`));
  }

  // ram+1 step (Hacknet node RAM doubles per "step")
  if (Number.isFinite(costRam)) {
    const prod2 = estimateNodeProduction(ns, { ...stats, ram: stats.ram * 2 });
    const delta = prod2 - baseProd;
    if (delta >= minDeltaPerSec) out.push(makeCandidate("ram", i, costRam, delta, `ram+1 node ${i}`));
  }

  // core+1
  if (Number.isFinite(costCore)) {
    const prod2 = estimateNodeProduction(ns, { ...stats, cores: stats.cores + 1 });
    const delta = prod2 - baseProd;
    if (delta >= minDeltaPerSec) out.push(makeCandidate("core", i, costCore, delta, `core+1 node ${i}`));
  }

  return out;
}

function hasHacknetFormulas(ns) {
  return Boolean(ns.formulas && ns.formulas.hacknetNodes && typeof ns.formulas.hacknetNodes.moneyGainRate === "function");
}

function estimateNodeProduction(ns, nodeStats) {
  // Best: formulas (requires Formulas.exe and API)
  if (hasHacknetFormulas(ns)) {
    try {
      // moneyGainRate(level, ramUsed, maxRam, cores, mult)
      // Mult handling is version-dependent; this field usually exists.
      const mult = ns.getPlayer()?.hacknet_node_money_mult ?? 1;
      return ns.formulas.hacknetNodes.moneyGainRate(
        nodeStats.level,
        0,
        nodeStats.ram,
        nodeStats.cores,
        mult
      );
    } catch (_e) {
      // fall through
    }
  }

  // Fallback: nodeStats.production is typically $/sec
  const p = Number(nodeStats.production ?? 0);
  return Number.isFinite(p) ? p : 0;
}

function estimateNewNodeDelta(ns) {
  // With formulas: estimate a baseline new node (lvl=1, ram=1, cores=1)
  if (hasHacknetFormulas(ns)) {
    try {
      const mult = ns.getPlayer()?.hacknet_node_money_mult ?? 1;
      return ns.formulas.hacknetNodes.moneyGainRate(1, 0, 1, 1, mult);
    } catch (_e) {
      // fall through
    }
  }

  // Fallback: assume at least small gain to avoid â€œfree spamâ€
  return 1;
}

// ------------------------------------------------------------
// Upgrade selection (cheapest-first fallback / legacy behavior)
// ------------------------------------------------------------

function pickCheapestHacknetUpgrade(ns) {
  if (!ns.hacknet) return null;

  const numNodes = safeNum(() => ns.hacknet.numNodes(), 0);
  let best = { type: null, index: -1, cost: Infinity, label: "" };

  // Buy new node
  const newNodeCost = safeNum(() => ns.hacknet.getPurchaseNodeCost(), Infinity);
  if (Number.isFinite(newNodeCost) && newNodeCost < best.cost) {
    best = { type: "node", index: -1, cost: newNodeCost, label: "buy node" };
  }

  // Upgrade existing nodes
  for (let i = 0; i < numNodes; i++) {
    const costLevel = safeNum(() => ns.hacknet.getLevelUpgradeCost(i, 1), Infinity);
    const costRam   = safeNum(() => ns.hacknet.getRamUpgradeCost(i, 1), Infinity);
    const costCore  = safeNum(() => ns.hacknet.getCoreUpgradeCost(i, 1), Infinity);

    if (Number.isFinite(costLevel) && costLevel < best.cost) {
      best = { type: "level", index: i, cost: costLevel, label: `level+1 node ${i}` };
    }
    if (Number.isFinite(costRam) && costRam < best.cost) {
      best = { type: "ram", index: i, cost: costRam, label: `ram+1 node ${i}` };
    }
    if (Number.isFinite(costCore) && costCore < best.cost) {
      best = { type: "core", index: i, cost: costCore, label: `core+1 node ${i}` };
    }
  }

  if (!best.type || !Number.isFinite(best.cost)) return null;
  return best;
}

function performHacknetUpgrade(ns, best) {
  try {
    switch (best.type) {
      case "node": {
        const idx = ns.hacknet.purchaseNode();
        return idx !== -1;
      }
      case "level":
        return ns.hacknet.upgradeLevel(best.index, 1);
      case "ram":
        return ns.hacknet.upgradeRam(best.index, 1);
      case "core":
        return ns.hacknet.upgradeCore(best.index, 1);
      default:
        return false;
    }
  } catch (_e) {
    return false;
  }
}

// ------------------------------------------------------------
// Hash spending (works only when the hashes API exists)
// ------------------------------------------------------------

function runHashSpendingTick(ns, laneCfg, state, msgs) {
  const wantHashes =
    laneCfg.hashMode === "on" ||
    (laneCfg.hashMode === "auto" && hasHashesApi(ns));

  if (!wantHashes) return;
  if (!hasHashesApi(ns)) return;

  const now = Date.now();
  if (now - state.lastHashTick < laneCfg.hashSpendTickMs) return;
  state.lastHashTick = now;

  const hashes = safeNum(() => ns.hacknet.numHashes(), 0);
  const cap = safeNum(() => ns.hacknet.hashCapacity(), 0);

  if (cap <= 0) return;

  // If weâ€™re near cap, dump hashes to avoid waste.
  const atCap = hashes >= cap * laneCfg.hashSpendAtCapacity;
  if (atCap) {
    const dumped = spendHashesLoop(ns, laneCfg.hashDumpAction, /*maxSpends*/ 20);
    if (dumped > 0) msgs.push(`[hacknet] hashes: dumped x${dumped} via "${laneCfg.hashDumpAction}"`);
    return;
  }

  // Otherwise, optionally apply â€œpreferredâ€ hash actions if affordable.
  for (const action of laneCfg.hashPreferredActions || []) {
    const cost = safeNum(() => ns.hacknet.hashCost(action), Infinity);
    if (!Number.isFinite(cost) || cost <= 0) continue;

    // Only spend if we have enough to pay once and still keep some buffer.
    if (hashes >= cost * 1.25) {
      const ok = safeBool(() => ns.hacknet.spendHashes(action), false);
      if (ok) msgs.push(`[hacknet] hashes: spent "${action}" (cost=${cost})`);
      break; // one preferred action per hash tick
    }
  }
}

function spendHashesLoop(ns, action, maxSpends = 20) {
  let spent = 0;
  for (let i = 0; i < maxSpends; i++) {
    const ok = safeBool(() => ns.hacknet.spendHashes(action), false);
    if (!ok) break;
    spent++;
  }
  return spent;
}

function hasHashesApi(ns) {
  try {
    return Boolean(
      ns.hacknet &&
      typeof ns.hacknet.numHashes === "function" &&
      typeof ns.hacknet.hashCapacity === "function" &&
      typeof ns.hacknet.spendHashes === "function" &&
      typeof ns.hacknet.hashCost === "function"
    );
  } catch (_e) {
    return false;
  }
}

// ------------------------------------------------------------
// Small safe helpers
// ------------------------------------------------------------

function safeMoney(ns) {
  try {
    return ns.getServerMoneyAvailable("home") || 0;
  } catch (_e) {
    return 0;
  }
}

function safeNum(fn, fallback) {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : fallback;
  } catch (_e) {
    return fallback;
  }
}

function safeBool(fn, fallback) {
  try {
    return Boolean(fn());
  } catch (_e) {
    return fallback;
  }
}

function safeObj(fn, fallback) {
  try {
    return fn();
  } catch (_e) {
    return fallback;
  }
}
```
/* == END FILE == */

/* == FILE: lib/home-upgrades-lane.js == */
```js
/** @param {NS} ns */
/*
 * lib/home-upgrades-lane.js
 *
 * Description
 *  Controller lane for automating home RAM + core upgrades (Singularity).
 *
 * Notes
 *  - Strictly purchase-only; no resets.
 *  - Budget-gated to avoid sabotaging aug/corp spending.
 *  - Terminal output only when an upgrade happens (pushes msgs[]).
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

import { fmtMoney } from "lib/format.js";

export const HOME_UPGRADES_DEFAULTS = {
  enabled: true,
  tickMs: 60_000,

  // Budget gating (home money)
  reserveCash: 2_000_000_000, // keep this much cash untouched
  maxSpendFrac: 0.20,         // also keep at least (1 - this) fraction liquid

  // What to buy
  buyRam: true,
  buyCores: true,

  // Soft priority:
  // - "cheapest": buy whichever upgrade is cheaper right now
  // - "ram-first": always prefer RAM if affordable, else cores
  policy: "cheapest",

  // Anti-spam
  failCooldownMs: 60_000,
};

export function runHomeUpgradesTick(ns, cfg, state, msgs, shared = null) {
  const laneCfg = { ...HOME_UPGRADES_DEFAULTS, ...((cfg && cfg.homeUpgrades) || {}) };
  if (!laneCfg.enabled) return;

  if (!state) return;
  if (!state.lastTick) state.lastTick = 0;
  if (!state.failAt) state.failAt = {};

  const now = Date.now();
  if (now - state.lastTick < laneCfg.tickMs) return;
  state.lastTick = now;

  const s = ns.singularity;
  if (!s) return;

  const augReserveHint = Number(shared?.augReserveHint || 0);

  // Capability checks (version-safe)
  const canRam = laneCfg.buyRam &&
    typeof s.getUpgradeHomeRamCost === "function" &&
    typeof s.upgradeHomeRam === "function";

  const canCores = laneCfg.buyCores &&
    typeof s.getUpgradeHomeCoresCost === "function" &&
    typeof s.upgradeHomeCores === "function";

  if (!canRam && !canCores) return;

  const money = safeNum(() => ns.getServerMoneyAvailable("home"), 0);

  // Spend governor: keep a cash reserve AND a liquidity floor
  const reserveA = laneCfg.reserveCash;
  const reserveB = money * (1 - laneCfg.maxSpendFrac);
  const reserveC = Math.max(0, Number(shared?.augReserveHint || 0));
  const reserve = Math.max(reserveA, reserveB, reserveC);

  const spendable = Math.max(0, money - reserve);
  if (spendable <= 0) return;

  const ramCost = canRam ? safeNum(() => s.getUpgradeHomeRamCost(), Infinity) : Infinity;
  const coreCost = canCores ? safeNum(() => s.getUpgradeHomeCoresCost(), Infinity) : Infinity;

  const choice = pickUpgrade(laneCfg.policy, ramCost, coreCost);
  if (!choice) return;

  // Cooldown repeated â€œcanâ€™t affordâ€
  if (!canAttempt(state, choice.key, laneCfg.failCooldownMs)) return;

  const cost = choice.key === "ram" ? ramCost : coreCost;
  if (!Number.isFinite(cost) || cost > spendable) {
    state.failAt[choice.key] = now;
    return;
  }

  // Execute
  let ok = false;
  try {
    ok = choice.key === "ram" ? Boolean(s.upgradeHomeRam()) : Boolean(s.upgradeHomeCores());
  } catch {
    ok = false;
  }

  if (ok) {
    msgs.push(`[home] upgraded ${choice.key.toUpperCase()} for ${fmtMoney(ns, cost)}`);
  } else {
    state.failAt[choice.key] = now;
  }
}

function pickUpgrade(policy, ramCost, coreCost) {
  const ramOk = Number.isFinite(ramCost);
  const coreOk = Number.isFinite(coreCost);

  if (!ramOk && !coreOk) return null;

  if (policy === "ram-first") {
    if (ramOk) return { key: "ram" };
    if (coreOk) return { key: "cores" };
    return null;
  }

  // cheapest (default)
  if (ramOk && coreOk) return ramCost <= coreCost ? { key: "ram" } : { key: "cores" };
  if (ramOk) return { key: "ram" };
  if (coreOk) return { key: "cores" };
  return null;
}

function canAttempt(state, key, cooldownMs) {
  const now = Date.now();
  const last = Number(state.failAt?.[key] || 0);
  return (now - last) >= cooldownMs;
}

function safeNum(fn, fallback) {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
```
/* == END FILE == */

/* == FILE: lib/logging.js == */
```js
/** @param {NS} ns */
/*
 * lib/logging.js
 *
 * Description
 *  Controller-friendly logging helpers.
 *   - Supports â€œsilentâ€, â€œalwaysâ€, and â€œchangesâ€ terminal modes
 *   - Designed for: quiet terminal, rich ns.print() logs elsewhere
 *
 * Notes
 *  - This module only emits to terminal (ns.tprint).
 *  - It does not call ns.print() so it wonâ€™t spam tail logs.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

export function flushLog(ns, mode, msgs, lastMsgs) {
  const lines = (msgs || []).filter(Boolean);
  if (!lines.length || mode === "silent") return;

  if (mode === "always") {
    for (const m of lines) ns.tprint(m);
    return;
  }

  // changes (default)
  for (const m of lines) {
    if (!lastMsgs || !lastMsgs.has(m)) ns.tprint(m);
  }
}
```
/* == END FILE == */

/* == FILE: lib/orchestrator.js == */
```js
/** @param {NS} ns */
/*
 * lib/orchestrator.js
 *
 * Shared process + RAM orchestration helpers.
 *
 * Goals:
 *  - Standardize â€œis script running?â€
 *  - Standardize RAM budgeting checks (reserve-based)
 *  - Provide safe â€œensureDaemonâ€ start helper (start only if affordable)
 *  - Provide targeted kill helpers for â€œmanaged scripts onlyâ€ restarts
 *
 * Notes:
 *  - This is a library module (import-only). It is not intended to be run directly.
 *  - These helpers intentionally avoid over-opinionated logging. They return structured
 *    results so caller can decide how/where to log.
 */

// ------------------------------------------------------------
// RAM helpers
// ------------------------------------------------------------

export function getMaxRam(ns, host = "home") {
  return ns.getServerMaxRam(host);
}

export function getUsedRam(ns, host = "home") {
  return ns.getServerUsedRam(host);
}

export function getFreeRam(ns, host = "home") {
  return getMaxRam(ns, host) - getUsedRam(ns, host);
}

/**
 * Returns â€œspendableâ€ RAM = free - reserve (never below 0).
 */
export function getSpendableRam(ns, host = "home", reserveRam = 0) {
  const free = getFreeRam(ns, host);
  return Math.max(0, free - Math.max(0, Number(reserveRam) || 0));
}

export function getScriptCost(ns, script, host = "home", threads = 1) {
  const s = normScript(script);
  if (!ns.fileExists(s, host)) return Infinity;
  return ns.getScriptRam(s, host) * Math.max(1, Math.floor(threads));
}

/**
 * True if we can afford to start script with given threads on host,
 * leaving reserveRam unallocated.
 */
export function canAfford(ns, script, host = "home", threads = 1, reserveRam = 0) {
  const cost = getScriptCost(ns, script, host, threads);
  const spendable = getSpendableRam(ns, host, reserveRam);
  return isFinite(cost) && cost <= spendable;
}

// ------------------------------------------------------------
// Process helpers
// ------------------------------------------------------------

/**
 * Returns true if any instance of script is running on host.
 * (Ignores args on purpose; this is a simple â€œis it aliveâ€ check.)
 */
export function isScriptRunning(ns, script, host = "home") {
  const s = normScript(script);
  return ns.ps(host).some(p => p.filename === s);
}

/**
 * Returns an array of processes for a given script on a host.
 * Useful when you want to kill specific scripts or check args.
 */
export function getScriptProcesses(ns, script, host = "home") {
  const s = normScript(script);
  return ns.ps(host).filter(p => p.filename === s);
}

/**
 * Kill all processes on host whose filename matches any entry in scriptsSet.
 * Returns { killed, attempted }.
 */
export function killScripts(ns, host, scriptsSet) {
  let attempted = 0;
  let killed = 0;

  // Normalize filenames in the set so callers can pass "/bin/x.js" safely.
  const raw = scriptsSet instanceof Set ? scriptsSet : new Set(scriptsSet || []);
  const set = new Set(Array.from(raw, normScript));

  for (const p of ns.ps(host)) {
    if (!set.has(p.filename)) continue;
    attempted++;
    if (ns.kill(p.pid)) killed++;
  }

  return { killed, attempted };
}

/**
 * Kill all scripts on host except:
 *  - the caller (this script pid)
 *  - any filenames in keepFiles (Set or array)
 * Returns { killed, attempted }.
 *
 * This is useful if you want a controller to do a â€œclean slateâ€ reset
 * without killing itself.
 */
export function killAllExcept(ns, host = "home", keepFiles = []) {
  const myPid = ns.pid;

  // Normalize keep list so callers can pass "/bin/x.js" safely.
  const raw = keepFiles instanceof Set ? keepFiles : new Set(keepFiles || []);
  const keep = new Set(Array.from(raw, normScript));

  let attempted = 0;
  let killed = 0;

  for (const p of ns.ps(host)) {
    if (p.pid === myPid) continue;
    if (keep.has(p.filename)) continue;

    attempted++;
    if (ns.kill(p.pid)) killed++;
  }

  return { killed, attempted };
}

// ------------------------------------------------------------
// Start / Ensure helpers
// ------------------------------------------------------------

/**
 * Start script on home using ns.run() (or ns.exec() if you provide host != "home").
 * Returns a structured result object so caller can log consistently.
 *
 * Result:
 *  {
 *    ok: boolean,
 *    reason?: string,
 *    pid?: number,
 *    cost?: number,
 *    spendable?: number
 *  }
 */
export function tryStart(ns, script, {
  host = "home",
  threads = 1,
  args = [],
  reserveRam = 0,
} = {}) {
  const s = normScript(script);

  if (!s) return { ok: false, reason: "no-script" };
  if (!ns.fileExists(s, host)) return { ok: false, reason: "missing-file" };

  const t = Math.max(1, Math.floor(threads));
  const cost = getScriptCost(ns, s, host, t);
  const spendable = getSpendableRam(ns, host, reserveRam);

  if (!isFinite(cost)) return { ok: false, reason: "unknown-cost", cost, spendable };
  if (cost > spendable) return { ok: false, reason: "insufficient-ram", cost, spendable };

  const a = normArgs(args);

  let pid = 0;
  try {
    if (host === "home") pid = ns.run(s, t, ...a);
    else pid = ns.exec(s, host, t, ...a);
  } catch (_e) {
    pid = 0;
  }

  if (!pid) return { ok: false, reason: "start-failed", pid, cost, spendable };
  return { ok: true, pid, cost, spendable };
}

/**
 * Ensure a daemon is running (start it if not running).
 *
 * Options:
 *  - requireArgsMatch: if true, only counts â€œrunningâ€ if args match exactly
 *    (default false: any running instance is considered good).
 *
 * Returns:
 *  {
 *    action: "noop" | "started" | "skipped",
 *    ok: boolean,
 *    reason?: string,
 *    pid?: number,
 *    cost?: number,
 *    spendable?: number
 *  }
 */
export function ensureDaemon(ns, script, {
  host = "home",
  threads = 1,
  args = [],
  reserveRam = 0,
  requireArgsMatch = false,
} = {}) {
  const s = normScript(script);

  if (!s) return { action: "skipped", ok: false, reason: "no-script" };
  if (!ns.fileExists(s, host)) return { action: "skipped", ok: false, reason: "missing-file" };

  const running = ns.ps(host).filter(p => p.filename === s);

  if (running.length > 0) {
    if (!requireArgsMatch) return { action: "noop", ok: true };

    const want = normArgs(args);
    const match = running.some(p => arraysEqual(normArgs(p.args), want));
    if (match) return { action: "noop", ok: true };

    // If running but args mismatch, we intentionally do NOT kill/restart here.
    // Caller can decide to kill + restart using killScripts().
    return { action: "skipped", ok: false, reason: "args-mismatch" };
  }

  const res = tryStart(ns, s, { host, threads, args, reserveRam });
  if (!res.ok) return { action: "skipped", ...res };
  return { action: "started", ...res };
}

// ------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normScript(p) {
  // Bitburner process filenames are typically stored without leading "/"
  return String(p || "").replace(/^\/+/, "");
}

function normArgs(args) {
  // Compare args as strings for stability (2048 vs "2048", etc.)
  return (args || []).map(a => String(a));
}
```
/* == END FILE == */

/* == FILE: lib/os/service-config.js == */
```js
/* == FILE: lib/os/service-config.js == */
/** @param {NS} ns */
/*
 * /lib/os/service-config.js
 *
 * Description
 *  Shared config helpers for bbOS service enable/disable state.
 *
 * Notes
 *  - Uses ns.read/ns.write so it works in Bitburner and persists on home.
 *  - Stores only overrides; effective enablement is computed from registry defaults.
 *  - Path normalization:
 *      Scripts often use leading "/" (e.g., /bin/controller.js),
 *      but ns.read/ns.write behave best with NO leading "/" (e.g., data/os-services.json).
 *    This module accepts either style and normalizes safely.
 *  - Robust write detection:
 *      Some environments return unexpected values from ns.write().
 *      We treat write as successful if we can read back the expected JSON.
 */

export const DEFAULT_SERVICE_CONFIG_PATH = "data/os-services.json";

/**
 * Normalize a data/config filename for ns.read/ns.write.
 * - Converts "\": to "/"
 * - Trims leading "./"
 * - Removes ONE leading "/" if present
 * @param {string} path
 * @returns {string}
 */
export function normalizeDataPath(path) {
  const p0 = String(path || "").trim();
  if (!p0) return DEFAULT_SERVICE_CONFIG_PATH;

  let p = p0.replaceAll("\\", "/");
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) p = p.slice(1); // important for ns.write/ns.read
  return p;
}

/**
 * Load persisted config (overrides).
 * @param {NS} ns
 * @param {string} path
 * @returns {{enabled?: Record<string, boolean>, updatedAt?: number}}
 */
export function loadServiceConfig(ns, path = DEFAULT_SERVICE_CONFIG_PATH) {
  const file = normalizeDataPath(path);

  const raw = safeStr(() => ns.read(file), "");
  if (!raw) return { enabled: {}, updatedAt: 0 };

  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return { enabled: {}, updatedAt: 0 };
    if (!obj.enabled || typeof obj.enabled !== "object") obj.enabled = {};
    return obj;
  } catch {
    return { enabled: {}, updatedAt: 0 };
  }
}

/**
 * Save persisted config (overrides).
 * Returns true if write succeeds (robust across ns.write return shapes).
 * @param {NS} ns
 * @param {string} path
 * @param {{enabled?: Record<string, boolean>}} config
 * @returns {boolean}
 */
export function saveServiceConfig(ns, path, config) {
  const file = normalizeDataPath(path);

  const out = {
    enabled: config?.enabled || {},
    updatedAt: Date.now(),
  };

  const payload = JSON.stringify(out, null, 2);

  // Attempt write
  let writeResult;
  try {
    writeResult = ns.write(file, payload, "w");
  } catch {
    writeResult = undefined;
  }

  // Interpret return value *if* useful:
  // - number: bytes written
  // - boolean: explicit success/fail (some implementations)
  // - undefined/other: fall back to readback verification
  if (typeof writeResult === "number" && writeResult > 0) return true;
  if (typeof writeResult === "boolean") return writeResult;

  // Readback verification (authoritative)
  const readBack = safeStr(() => ns.read(file), "");
  if (!readBack) return false;

  // If we can parse and the updatedAt matches, weâ€™re good
  try {
    const obj = JSON.parse(readBack);
    return !!obj && typeof obj === "object" && obj.updatedAt === out.updatedAt;
  } catch {
    // If parsing fails but content matches prefix, still likely written
    return readBack.trim().startsWith("{");
  }
}

/**
 * Compute effective enablement from registry + overrides.
 * Rules:
 *  - If override exists for key, use it.
 *  - Else default: managed services => enabled, non-managed => disabled (conservative).
 * @param {Array<{key:string, managed:boolean}>} registry
 * @param {{enabled?: Record<string, boolean>}} config
 * @returns {Record<string, boolean>}
 */
export function getEffectiveEnabledMap(registry, config) {
  const overrides = config?.enabled || {};
  /** @type {Record<string, boolean>} */
  const effective = {};

  for (const svc of registry) {
    if (Object.prototype.hasOwnProperty.call(overrides, svc.key)) {
      effective[svc.key] = !!overrides[svc.key];
    } else {
      effective[svc.key] = !!svc.managed;
    }
  }
  return effective;
}

function safeStr(fn, fallback) {
  try {
    return String(fn());
  } catch {
    return fallback;
  }
}
```
/* == END FILE == */

/* == FILE: lib/os/service-registry.js == */
```js
/** @param {NS} ns */
/*
 * lib/os/service-registry.js
 *
 * Description
 *  Canonical bbOS service registry.
 *  - Provides a single place to define "managed services" (daemons) and their defaults.
 *  - Import-only; not intended to be run directly.
 *
 * Notes
 *  - This registry is intentionally lightweight and static.
 *  - Controller may override script paths via flags; status tools can merge those overrides.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

/**
 * @typedef {object} ServiceSpec
 * @property {string} key            Stable identifier (e.g. "batcher")
 * @property {string} name           Human-friendly name
 * @property {string} script         Canonical script path (leading "/")
 * @property {string} host           Default host (usually "home")
 * @property {number} threads        Default threads
 * @property {boolean} managed       Whether controller is expected to manage it
 * @property {string} lane           Which logical lane owns it (daemon-lane, etc.)
 * @property {string} notes          Short description
 */

/**
 * Canonical list of bbOS "services".
 * These map directly to controller flags in your current repo (batcher/botnet/pserv/trader/gangManager).
 * @returns {ServiceSpec[]}
 */
export function getServiceRegistry() {
  return [
    {
      key: "controller",
      name: "Controller",
      script: "/bin/controller.js",
      host: "home",
      threads: 1,
      managed: false,
      lane: "os",
      notes: "Main bbOS orchestrator (not managed by itself).",
    },

    // Managed daemons (daemon-lane owns these today).
    {
      key: "pserv",
      name: "Pserv Manager",
      script: "/bin/pserv-manager.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Purchased server policy + lifecycle management.",
    },
    {
      key: "batcher",
      name: "Timed Net Batcher",
      script: "/bin/timed-net-batcher2.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Primary HWGW batcher.",
    },
    {
      key: "botnet",
      name: "Botnet HGW Sync",
      script: "/bin/botnet-hgw-sync.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Remote HGW deployment / sync layer.",
    },
    {
      key: "trader",
      name: "Basic Trader",
      script: "/bin/basic-trader.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Forecast-based stock trader (requires WSE/TIX/4S).",
    },
    {
      key: "gangManager",
      name: "Gang Manager",
      script: "/bin/gang-manager.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Gang automation daemon (if gang exists / API available).",
    },

    // Scheduled jobs (controller job-lane)
    {
      key: "backdoorJob",
      name: "Backdoor One-shot",
      script: "/bin/backdoor-oneshot.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "jobs",
      notes: "Periodically installs backdoors where possible.",
    },
    {
      key: "contractsJob",
      name: "Contracts Solver",
      script: "/bin/contracts-find-and-solve.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "jobs",
      notes: "Periodically scans and solves coding contracts.",
    },

    {
      key: "intTrainer",
      name: "Intelligence Trainer",
      script: "/bin/intelligence-trainer.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Passive INT XP: create missing programs, else study CS (idle-safe).",
    },

    {
      key: "bladeburnerManager",
      name: "Bladeburner Manager",
      script: "/bin/bladeburner-manager.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "BN6 Bladeburner automation: join/skills/city/actions/blackops.",
    },



    // Optional helper daemons controller may run or call into.
    {
      key: "darkwebBuyer",
      name: "Darkweb Auto Buyer",
      script: "/bin/darkweb-auto-buyer.js",
      host: "home",
      threads: 1,
      managed: false,
      lane: "singularity",
      notes: "Buys programs via TOR/darkweb when possible.",
    },

    // Bootstrap/early lane (not a managed daemon; started by bootstrap).
    {
      key: "earlyStartup",
      name: "Startup Home Advanced",
      script: "/bin/startup-home-advanced.js",
      host: "home",
      threads: 1,
      managed: false,
      lane: "bootstrap",
      notes: "Lightweight early daemon while waiting for controller RAM.",
    },
  ];
}

/**
 * Merge controller flag overrides into service specs.
 * Flags are expected to contain keys like: batcher/botnet/pserv/trader/gangManager/darkwebBuyer.
 * @param {ServiceSpec[]} specs
 * @param {any} flags  ns.flags() result from controller/bootstrap/tool
 * @returns {ServiceSpec[]}
 */
export function applyScriptOverrides(specs, flags) {
  const f = flags || {};
  const map = {
    batcher: "batcher",
    botnet: "botnet",
    pserv: "pserv",
    trader: "trader",
    gangManager: "gangManager",
    intTrainer: "intTrainer",
    bladeburnerManager: "bladeburnerManager",
    darkwebBuyer: "darkwebBuyer",
    controller: "controller",

    // Scheduled jobs (optional override support)
    backdoorJob: "backdoorJob",
    contractsJob: "contractsJob",
  };

  return specs.map((s) => {
    const flagKey = Object.keys(map).find((k) => map[k] === s.key);
    if (!flagKey) return s;

    const v = String(f[flagKey] || "").trim();
    if (!v) return s;

    const norm = v.startsWith("/") ? v : ("/" + v);
    return { ...s, script: norm };
  });
}

/**
 * Convenience: build final registry from a flags object (optional).
 * @param {any} flags
 * @returns {ServiceSpec[]}
 */
export function getRegistryWithOverrides(flags) {
  return applyScriptOverrides(getServiceRegistry(), flags);
}
```
/* == END FILE == */

/* == FILE: lib/player.js == */
```js
/** @param {NS} ns */
/*
 * lib/player.js
 *
 * Shared â€œplayer actionâ€ helpers (Singularity-driven):
 *  - Safe wrappers around getCurrentWork() and work state checks
 *  - Crime helpers (chance + ensure crime)
 *  - Training helpers (gym + university) with simple â€œdonâ€™t restart same workâ€ logic
 *  - Faction work helpers (ensure faction work)
 *
 * Design notes
 *  - These helpers are probe-safe: if Singularity APIs are missing, they fail gracefully.
 *  - Theyâ€™re intended for controllers/orchestrators that run every tick.
 *  - â€œEnsureâ€ functions do NOT spam-restart work; they check currentWork first.
 */

// ------------------------------------------------------------
// Capability probes
// ------------------------------------------------------------

export function hasSingularity(ns) {
  return Boolean(ns.singularity);
}

export function canGetCurrentWork(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.getCurrentWork === "function");
}

export function canCommitCrime(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.commitCrime === "function");
}

export function canGetCrimeChance(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.getCrimeChance === "function");
}

export function canGymWorkout(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.gymWorkout === "function");
}

export function canUniversityCourse(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.universityCourse === "function");
}

export function canWorkForFaction(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.workForFaction === "function");
}

export function canTravel(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.travelToCity === "function");
}

// ------------------------------------------------------------
// Current work (safe wrappers)
// ------------------------------------------------------------

/**
 * Returns ns.singularity.getCurrentWork() or null if unavailable/throws.
 */
export function getCurrentWorkSafe(ns) {
  if (!canGetCurrentWork(ns)) return null;
  try {
    return ns.singularity.getCurrentWork();
  } catch (_e) {
    return null;
  }
}

/**
 * True if player is currently working on a crime (any crime).
 */
export function isDoingCrime(ns) {
  const w = getCurrentWorkSafe(ns);
  return Boolean(w && w.type === "CRIME");
}

/**
 * True if player is currently training at gym.
 */
export function isDoingGym(ns) {
  const w = getCurrentWorkSafe(ns);
  return Boolean(w && w.type === "GYM");
}

/**
 * True if player is currently taking a class at university.
 */
export function isDoingClass(ns) {
  const w = getCurrentWorkSafe(ns);
  return Boolean(w && w.type === "CLASS");
}

/**
 * True if player is currently doing faction work.
 */
export function isDoingFactionWork(ns) {
  const w = getCurrentWorkSafe(ns);
  return Boolean(w && w.type === "FACTION");
}

// ------------------------------------------------------------
// Crime helpers
// ------------------------------------------------------------

/**
 * Returns crime success chance [0..1], or null if unavailable.
 */
export function getCrimeChanceSafe(ns, crimeName) {
  if (!canGetCrimeChance(ns)) return null;
  try {
    const v = ns.singularity.getCrimeChance(crimeName);
    return isFinite(v) ? v : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Ensure player is committing the specified crime.
 * Returns:
 *  { ok, changed, reason?, ms? }
 *
 * - changed=true means we started the crime (or switched to it)
 * - changed=false means we were already doing it, or couldn't start
 */
export function ensureCrime(ns, crimeName, focus = false) {
  if (!canCommitCrime(ns)) return { ok: false, changed: false, reason: "no-singularity" };

  const w = getCurrentWorkSafe(ns);
  if (w && w.type === "CRIME" && w.crimeType === crimeName) {
    return { ok: true, changed: false, reason: "already-doing" };
  }

  try {
    const ms = ns.singularity.commitCrime(crimeName, focus);
    if (ms > 0) return { ok: true, changed: true, reason: "started", ms };
    return { ok: true, changed: false, reason: "commit-returned-0", ms };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

// ------------------------------------------------------------
// Training helpers
// ------------------------------------------------------------

/**
 * Travel to a city if possible and not already there.
 * Returns { ok, changed }.
 */
export function ensureCity(ns, city) {
  const target = String(city || "").trim();
  if (!target) return { ok: true, changed: false };

  if (!canTravel(ns)) return { ok: false, changed: false };

  try {
    const p = ns.getPlayer();
    if (p.city === target) return { ok: true, changed: false };
    const ok = ns.singularity.travelToCity(target);
    return { ok: true, changed: Boolean(ok) };
  } catch (_e) {
    return { ok: false, changed: false };
  }
}

/**
 * Ensure player is training a given stat at a gym.
 * stat: "strength" | "defense" | "dexterity" | "agility"
 *
 * Returns { ok, changed, reason? }.
 */
export function ensureGymTraining(ns, { city = "", gym = "", stat = "strength" } = {}, focus = false) {
  if (!canGymWorkout(ns)) return { ok: false, changed: false, reason: "no-gym-api" };

  // Avoid restarting if already training at gym (any gym/stat is â€œgood enoughâ€ unless you want strict matching)
  const w = getCurrentWorkSafe(ns);
  if (w && w.type === "GYM") return { ok: true, changed: false, reason: "already-doing" };

  // Travel first if requested
  if (city) ensureCity(ns, city);

  try {
    const ok = ns.singularity.gymWorkout(gym, stat, focus);
    return ok ? { ok: true, changed: true, reason: "started" } : { ok: true, changed: false, reason: "start-failed" };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * Ensure player is studying a given course at a university.
 *
 * Returns { ok, changed, reason? }.
 */
export function ensureStudy(ns, { city = "", university = "", course = "Algorithms" } = {}, focus = false) {
  if (!canUniversityCourse(ns)) return { ok: false, changed: false, reason: "no-university-api" };

  const w = getCurrentWorkSafe(ns);
  if (w && w.type === "CLASS") return { ok: true, changed: false, reason: "already-doing" };

  if (city) ensureCity(ns, city);

  try {
    const ok = ns.singularity.universityCourse(university, course, focus);
    return ok ? { ok: true, changed: true, reason: "started" } : { ok: true, changed: false, reason: "start-failed" };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * Convenience: pick the lowest combat stat.
 * Returns one of: "strength" | "defense" | "dexterity" | "agility"
 */
export function pickLowestCombatStat(ns) {
  const p = ns.getPlayer();
  const stats = [
    ["strength", p.strength],
    ["defense", p.defense],
    ["dexterity", p.dexterity],
    ["agility", p.agility],
  ];
  stats.sort((a, b) => a[1] - b[1]);
  return stats[0][0];
}

// ------------------------------------------------------------
// Faction work helpers
// ------------------------------------------------------------

/**
 * Ensure player is working for a faction in a given mode:
 *  mode: "hacking" | "field" | "security"
 *
 * Returns { ok, changed, reason? }.
 */
export function ensureFactionWork(ns, faction, mode = "hacking", focus = false) {
  if (!canWorkForFaction(ns)) return { ok: false, changed: false, reason: "no-faction-api" };

  const f = String(faction || "").trim();
  if (!f) return { ok: false, changed: false, reason: "no-faction" };

  const m = (mode === "field" || mode === "security") ? mode : "hacking";

  const w = getCurrentWorkSafe(ns);
  if (w && w.type === "FACTION" && w.factionName === f && w.factionWorkType === m) {
    return { ok: true, changed: false, reason: "already-doing" };
  }

  try {
    const ok = ns.singularity.workForFaction(f, m, focus);
    return ok ? { ok: true, changed: true, reason: "started" } : { ok: true, changed: false, reason: "start-failed" };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}
```
/* == END FILE == */

/* == FILE: lib/player-policy.js == */
```js
/** @param {NS} ns */
/*
 * lib/player-policy.js
 *
 * SINGLE SOURCE OF TRUTH policy (hour-sliced):
 *
 * 1) Hacking 1-30: study "Computer Science" (bootstrap)
 * 2) Hacking >= 30, pre-gang:
 *    - Minute 00-09: INT slice (create missing programs else study)
 *    - Minute 50-59: faction rep work
 *    - Otherwise: crime logic
 * 3) In gang:
 *    - Minute 00-09: INT slice (same)
 *    - Otherwise: faction rep work
 * 4) If in Daedalus: prioritize Daedalus faction rep whenever doing faction work
 *
 * IMPORTANT:
 * - This policy assumes you DISABLE the separate bin/intelligence-trainer.js daemon,
 *   otherwise it will fight you by starting CLASS during its own slice.
 */

import { inGang } from "lib/gang.js";
import {
  getCurrentWorkSafe,
  getCrimeChanceSafe,
  ensureCrime,
  ensureGymTraining,
  pickLowestCombatStat,
  ensureFactionWork,
  ensureStudy,
} from "lib/player.js";

export const PLAYER_POLICY_DEFAULTS = {
  // ---- Crime policy ----
  crimeMinChance: 0.55,
  crimePreference: ["homicide", "mug", "larceny", "rob store", "shoplift"],

  // ---- Cash guardrails ----
  minCashFloor: 5_000_000,
  gymCashFloor: 25_000_000,

  // ---- Training ----
  trainCity: "Sector-12",
  trainGym: "Powerhouse Gym",

  // ---- Hack bootstrap (FREE) ----
  bootstrapHackThreshold: 30,
  bootstrapCity: "Sector-12",
  bootstrapUniversity: "Rothman University",
  bootstrapCourse: "Computer Science",

  // ---- Faction work ----
  factionWorkType: "hacking",
  preferredFactions: ["Daedalus", "NiteSec", "The Black Hand", "BitRunners"],

  // ---- Hour windows ----
  hourWindows: {
    // INT slice: top of hour through minute 9 (00-09)
    intStartMin: 0,
    intEndMin: 10, // exclusive

    // Faction window: last 10 minutes (50-59)
    factionStartMin: 50,
    factionEndMin: 60, // exclusive
  },

  // ---- INT slice behavior ----
  intSlice: {
    // Prefer making missing programs first
    programPriority: [
      "BruteSSH.exe",
      "FTPCrack.exe",
      "relaySMTP.exe",
      "HTTPWorm.exe",
      "SQLInject.exe",
      "Formulas.exe",
    ],

    // Fallback: study (INT XP)
    city: "Sector-12",
    university: "Rothman University",
    course: "Computer Science",
  },
};

// Module-level state (lives as long as the importing script instance does)
let bootstrapActive = false;
let lastMode = ""; // "", "BOOTSTRAP", "INT", "FACTION_WIN", "NORMAL"

/**
 * Run one policy tick. Returns terminal-facing messages (only on state changes).
 * @param {NS} ns
 * @param {object} opts
 * @returns {string[]}
 */
export function runHybridPlayerTick(ns, opts = PLAYER_POLICY_DEFAULTS) {
  const cfg = { ...PLAYER_POLICY_DEFAULTS, ...(opts || {}) };
  const out = [];

  const work = getCurrentWorkSafe(ns);

  // Guard: do not override non-automation work types.
  // We only “own” CRIME/GYM/CLASS/FACTION/CREATE_PROGRAM.
  if (work && !["CRIME", "GYM", "CLASS", "FACTION", "CREATE_PROGRAM"].includes(work.type)) {
    return out;
  }

  const p = safePlayer(ns);
  const money = p.money ?? 0;

  // IMPORTANT: ns.getPlayer() doesn't reliably expose p.hacking (it's usually p.skills.hacking)
  // Use getHackingLevel() as the authoritative value.
  let hacking = 0;
  try { hacking = ns.getHackingLevel(); } catch { hacking = 0; }

  const minute = safeMinute();
  const win = cfg.hourWindows || {};
  const inIntSlice = minute >= (win.intStartMin ?? 0) && minute < (win.intEndMin ?? 10);
  const inFactionWindow = minute >= (win.factionStartMin ?? 50) && minute < (win.factionEndMin ?? 60);

  // ------------------------------------------------------------
  // 1) Hack bootstrap 1-30: study CS
  // ------------------------------------------------------------
  if (hacking < cfg.bootstrapHackThreshold) {
    bootstrapActive = true;
    mode(out, "BOOTSTRAP", `bootstrap: study until hacking>=${cfg.bootstrapHackThreshold}`);

    const r = ensureStudy(
      ns,
      { city: cfg.bootstrapCity, university: cfg.bootstrapUniversity, course: cfg.bootstrapCourse },
      false
    );
    if (r.changed) {
      out.push(`[player] study: ${cfg.bootstrapCourse} @ ${cfg.bootstrapUniversity} (hacking<${cfg.bootstrapHackThreshold})`);
    }
    return out;
  }

  if (bootstrapActive) {
    bootstrapActive = false;
    // fall through immediately to normal logic
  }

  // ------------------------------------------------------------
  // 2) INT slice: top of hour 00-09 (ALWAYS, even if in gang)
  // ------------------------------------------------------------
  if (inIntSlice) {
    mode(out, "INT", "INT slice (top of hour)");

    // HARD HANDOFF: stop prior work once so INT slice reliably takes over
    if (ns.singularity && typeof ns.singularity.stopAction === "function") {
      if (work && ["FACTION", "CRIME", "GYM", "CLASS", "CREATE_PROGRAM"].includes(work.type)) {
        try { ns.singularity.stopAction(); } catch { /* ignore */ }
      }
    }

    // Re-read after stopAction to avoid stale decisions
    const work2 = getCurrentWorkSafe(ns);

    const intCfg = cfg.intSlice || {};

    // Prefer creating missing programs during the slice (INT + utility)
    const missing = (intCfg.programPriority || []).find((pp) => !ns.fileExists(pp, "home"));
    if (missing && ns.singularity && typeof ns.singularity.createProgram === "function") {
      let ok = false;
      try { ok = ns.singularity.createProgram(missing, false); } catch { ok = false; }

      if (ok) {
        out.push(`[player] INT slice: createProgram ${missing}`);
        return out; // action started; slice owns tick
      }

      // Skill gated or otherwise unavailable -> fall through to study
      out.push(`[player] INT slice: cannot createProgram ${missing} -> fallback to study`);
    }

    // Fallback: study for INT
    const r = ensureStudy(
      ns,
      { city: intCfg.city, university: intCfg.university, course: intCfg.course },
      false
    );

    // If study didn't "change", it can be because we were already in CLASS; that's fine.
    if (r.changed) out.push(`[player] INT slice: study: ${intCfg.course} @ ${intCfg.university}`);
    else if (work2?.type !== "CLASS") out.push(`[player] INT slice: study already active or could not switch (work=${work2?.type || "NONE"})`);

    return out;
  }

  // If we just left INT slice and we're still doing INT-owned work, stop it so we can switch immediately.
  if (ns.singularity && typeof ns.singularity.stopAction === "function") {
    if (work && (work.type === "CLASS" || work.type === "CREATE_PROGRAM")) {
      try { ns.singularity.stopAction(); } catch { /* ignore */ }
    }
  }

  // ------------------------------------------------------------
  // 3) Post-bootstrap “broke” safety: crime first
  // ------------------------------------------------------------
  if (money < cfg.minCashFloor) {
    mode(out, "NORMAL", "recovery: low cash => crime");
    const crime = pickBestCrime(ns, cfg.crimePreference, cfg.crimeMinChance);
    const r = ensureCrime(ns, crime, false);
    if (r.changed) out.push(`[player] recovery: crime: ${crime} (cash low)`);
    return out;
  }

  // ------------------------------------------------------------
  // 4) Pre-gang phase
  //    - last 10 minutes: faction rep grind
  //    - otherwise: crime logic
  // ------------------------------------------------------------
  if (!inGang(ns)) {
    if (inFactionWindow) {
      mode(out, "FACTION_WIN", "pre-gang: faction window (last 10 min)");
      const faction = pickRepFaction(ns, cfg.preferredFactions);
      if (faction) {
        const r = ensureFactionWork(ns, faction, cfg.factionWorkType, false);
        if (r.changed) out.push(`[player] faction window: ${faction} (${cfg.factionWorkType})`);
        return out;
      }
      // no faction => fall back to crime
    }

    mode(out, "NORMAL", "pre-gang: crime logic");

    const crime = pickBestCrime(ns, cfg.crimePreference, cfg.crimeMinChance);
    const chance = getCrimeChanceSafe(ns, crime);

    // If chance is known and too low, train *only if* we can afford gym safely.
    if (chance !== null && chance < cfg.crimeMinChance) {
      if (money >= cfg.gymCashFloor) {
        const stat = pickLowestCombatStat(ns);
        const r = ensureGymTraining(ns, { city: cfg.trainCity, gym: cfg.trainGym, stat }, false);
        if (r.changed) out.push(`[player] training ${stat} @ ${cfg.trainGym}`);
        return out;
      }
      // Gym blocked -> crime anyway
      const r = ensureCrime(ns, crime, false);
      if (r.changed) out.push(`[player] crime: ${crime} (gym blocked: cash<${fmtMoney(ns, cfg.gymCashFloor)})`);
      return out;
    }

    const r = ensureCrime(ns, crime, false);
    if (r.changed) out.push(`[player] crime: ${crime}`);
    return out;
  }

  // ------------------------------------------------------------
  // 5) In gang: faction rep (Daedalus priority)
  // ------------------------------------------------------------
  mode(out, "NORMAL", "in gang: faction rep");

  const faction = pickRepFaction(ns, cfg.preferredFactions);
  if (!faction) return out;

  const r = ensureFactionWork(ns, faction, cfg.factionWorkType, false);
  if (r.changed) out.push(`[player] faction work: ${faction} (${cfg.factionWorkType})`);
  return out;
}

/**
 * Picks Daedalus if you have it, else preferred list, else any faction.
 * @param {NS} ns
 * @param {string[]} preferred
 * @returns {string}
 */
export function pickRepFaction(ns, preferred) {
  try {
    const my = ns.getPlayer().factions || [];
    if (my.includes("Daedalus")) return "Daedalus";

    for (const f of preferred || []) {
      if (my.includes(f)) return f;
    }
    return my[0] || "";
  } catch (_e) {
    return "";
  }
}

/**
 * Crime chooser: returns the first crime in preference list that meets minChance (if chance is available),
 * otherwise falls back to the first item in list.
 */
function pickBestCrime(ns, preference, minChance) {
  const prefs = (preference && preference.length)
    ? preference
    : ["homicide", "mug", "larceny", "rob store", "shoplift"];

  for (const c of prefs) {
    const ch = getCrimeChanceSafe(ns, c);
    if (ch === null) return prefs[0];
    if (ch >= minChance) return c;
  }
  return prefs[prefs.length - 1];
}

function safePlayer(ns) {
  try {
    const p = ns.getPlayer();
    // Normalize hacking into a stable place if you ever want it later
    const hk = (p?.skills?.hacking ?? p?.hacking);
    return { ...p, hacking: hk };
  } catch (_e) {
    return { money: 0, hacking: 0 };
  }
}

function fmtMoney(ns, v) {
  try {
    return "$" + ns.formatNumber(v, 2, 1e3);
  } catch (_e) {
    return String(v);
  }
}

function safeMinute() {
  try {
    return new Date().getMinutes();
  } catch {
    return 0;
  }
}

function mode(out, m, why) {
  if (lastMode === m) return;
  lastMode = m;
  out.push(`[player] mode -> ${m} (${why})`);
}
```
/* == END FILE == */

/* == FILE: lib/rooting.js == */
```js
/** @param {NS} ns */
/*
 * lib/rooting.js
 *
 * Shared rooting helpers:
 *  - Network scan
 *  - Detect available port crackers
 *  - Root all servers that are rootable right now
 *  - Wait until â€œroot coverageâ€ is complete (prevents botnet/batcher racing rooting)
 */

// ------------------------------------------------
// Network helpers
// ------------------------------------------------

export function getAllServers(ns) {
  const visited = new Set();
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return Array.from(visited);
}

export function countPortCrackers(ns) {
  const programs = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
  ];
  return programs.filter(p => ns.fileExists(p, "home")).length;
}

// ------------------------------------------------
// Rooting helpers (prevents botnet/root timing race)
// ------------------------------------------------

export function getCrackerFns(ns) {
  const fns = [];
  if (ns.fileExists("BruteSSH.exe", "home")) fns.push((h) => ns.brutessh(h));
  if (ns.fileExists("FTPCrack.exe", "home")) fns.push((h) => ns.ftpcrack(h));
  if (ns.fileExists("relaySMTP.exe", "home")) fns.push((h) => ns.relaysmtp(h));
  if (ns.fileExists("HTTPWorm.exe", "home")) fns.push((h) => ns.httpworm(h));
  if (ns.fileExists("SQLInject.exe", "home")) fns.push((h) => ns.sqlinject(h));
  return fns;
}

/**
 * Returns true if host is rootable *right now* (by your level + crackers).
 */
export function isRootableNow(ns, host, crackerCount) {
  const s = ns.getServer(host);
  if (s.hasAdminRights) return false;
  if (host === "home" || host === "darkweb") return false;
  if (s.purchasedByPlayer) return false;

  const reqHack = s.requiredHackingSkill;
  const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

  return reqHack <= ns.getHackingLevel() && reqPorts <= crackerCount;
}

/**
 * Attempt to root all servers that are rootable now.
 * Returns { rooted, attempted } counts.
 */
export function rootAllPossible(ns) {
  const servers = getAllServers(ns);
  const crackerFns = getCrackerFns(ns);
  const crackerCount = crackerFns.length;

  let attempted = 0;
  let rooted = 0;

  for (const host of servers) {
    if (!isRootableNow(ns, host, crackerCount)) continue;

    attempted++;
    try {
      for (const fn of crackerFns) {
        try { fn(host); } catch (_e) { /* ignore */ }
      }

      try { ns.nuke(host); } catch (_e) { /* ignore */ }

      if (ns.hasRootAccess(host)) rooted++;
    } catch (_e) {
      // Keep going
    }
  }

  return { rooted, attempted };
}

/**
 * Wait until all currently-rootable servers are rooted (or timeout).
 * This is the key fix: prevents botnet/batcher from racing rooting.
 */
export async function waitForRootCoverage(ns, opts = {}) {
  const timeoutMs = Math.max(1_000, Number(opts.timeoutMs ?? 30_000));
  const pollMs = Math.max(100, Number(opts.pollMs ?? 500));

  const start = Date.now();
  while (true) {
    const servers = getAllServers(ns);
    const crackerCount = countPortCrackers(ns);
    const hackingLevel = ns.getHackingLevel();

    let rootableNow = 0;
    let rootedNow = 0;

    for (const host of servers) {
      const s = ns.getServer(host);
      if (host === "home" || host === "darkweb") continue;
      if (s.purchasedByPlayer) continue;

      const reqHack = s.requiredHackingSkill;
      const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

      if (reqHack <= hackingLevel && reqPorts <= crackerCount) {
        rootableNow++;
        if (s.hasAdminRights) rootedNow++;
      }
    }

    if (rootedNow >= rootableNow) return true;
    if (Date.now() - start > timeoutMs) return false;

    await ns.sleep(pollMs);
  }
}
```
/* == END FILE == */

/* == FILE: lib/singularity.js == */
```js
/** @param {NS} ns */
/*
 * lib/singularity.js
 *
 * Shared Singularity helpers for BN4 / SF4+:
 *  - Capability probes (safe to call even when Singularity isn't available)
 *  - TOR + Dark Web program automation (direct purchase helpers + "start buyer script" helper)
 *  - WSE/TIX/4S purchase automation (version-safe probing)
 *  - Faction invite acceptance
 *  - Stock API gating helpers (TIX + 4S)
 *
 * Notes
 *  - This is a library module (import-only). It is not intended to be run directly.
 *  - All functions are "probe-safe": they handle missing APIs gracefully.
 */

// ------------------------------------------------------------
// Capability probes
// ------------------------------------------------------------

export function hasSingularity(ns) {
  return Boolean(ns.singularity);
}

export function canPurchaseTor(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.purchaseTor === "function");
}

export function canBuyAugmentations(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.purchaseAugmentation === "function");
}

export function canCheckFactionInvites(ns) {
  return Boolean(ns.singularity && typeof ns.singularity.checkFactionInvitations === "function");
}

// ------------------------------------------------------------
// TOR + Dark Web helpers
// ------------------------------------------------------------

export function hasTorAccess(ns) {
  // In many versions, ns.getPlayer().tor indicates TOR ownership; darkweb server may also exist.
  try {
    const p = ns.getPlayer();
    if (p && p.tor) return true;
  } catch (_e) {
    // ignore
  }

  try {
    return ns.serverExists("darkweb");
  } catch (_e) {
    return false;
  }
}

/**
 * Attempt to purchase TOR router.
 * Returns: { ok, changed, reason? }
 */
export function maybeBuyTor(ns) {
  if (!canPurchaseTor(ns)) return { ok: false, changed: false, reason: "no-singularity" };
  if (hasTorAccess(ns)) return { ok: true, changed: false, reason: "already-owned" };

  try {
    const changed = Boolean(ns.singularity.purchaseTor());
    return { ok: true, changed, reason: changed ? "purchased" : "not-affordable-or-unavailable" };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * Default "must-have" Dark Web programs you listed (plus Formulas).
 * (Exclude Deepscan/Virus/AutoLink if you don't want them.)
 */
export function defaultDarkwebTargets() {
  return [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
    "Formulas.exe",
  ];
}

export function hasAllDarkwebTargets(ns, targets = defaultDarkwebTargets()) {
  try {
    return (targets || []).every(p => ns.fileExists(p, "home"));
  } catch (_e) {
    return false;
  }
}

/**
 * If TOR is owned and not all targets are owned, ensure the given buyer script is running.
 * This is useful if you already have a dedicated script like /bin/darkweb-auto-buyer.js.
 *
 * Returns: { ok, changed, reason?, pid? }
 */
export function ensureDarkwebBuyerScript(ns, buyerScript) {
  if (!buyerScript) return { ok: false, changed: false, reason: "no-script" };
  if (!hasTorAccess(ns)) return { ok: true, changed: false, reason: "no-tor" };

  if (hasAllDarkwebTargets(ns)) return { ok: true, changed: false, reason: "done" };

  try {
    if (!ns.fileExists(buyerScript, "home")) return { ok: false, changed: false, reason: "missing-file" };
    const running = ns.ps("home").some(p => p.filename === buyerScript);
    if (running) return { ok: true, changed: false, reason: "already-running" };

    const pid = ns.run(buyerScript, 1);
    if (!pid) return { ok: false, changed: false, reason: "start-failed" };
    return { ok: true, changed: true, reason: "started", pid };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * Buy a single program from Dark Web, if possible.
 * Returns: { ok, changed, reason? }
 *
 * Notes:
 *  - Requires Singularity and TOR.
 *  - This does not check cost; purchaseProgram will just return false if not affordable.
 */
export function maybeBuyDarkwebProgram(ns, programName) {
  if (!hasSingularity(ns) || typeof ns.singularity.purchaseProgram !== "function") {
    return { ok: false, changed: false, reason: "no-singularity" };
  }
  if (!hasTorAccess(ns)) return { ok: true, changed: false, reason: "no-tor" };

  try {
    if (ns.fileExists(programName, "home")) return { ok: true, changed: false, reason: "already-owned" };
    const changed = Boolean(ns.singularity.purchaseProgram(programName));
    return { ok: true, changed, reason: changed ? "purchased" : "not-affordable-or-unavailable" };
  } catch (_e) {
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * Attempt to buy any missing programs from a target list.
 * Returns: { ok, bought: string[] }
 *
 * This is a â€œdirect buyâ€ alternative to starting a dedicated buyer script.
 */
export function maybeBuyDarkwebPrograms(ns, targets = defaultDarkwebTargets()) {
  const bought = [];
  if (!hasSingularity(ns) || typeof ns.singularity.purchaseProgram !== "function") {
    return { ok: false, bought };
  }
  if (!hasTorAccess(ns)) return { ok: true, bought };

  for (const prog of targets || []) {
    try {
      if (ns.fileExists(prog, "home")) continue;
      if (ns.singularity.purchaseProgram(prog)) bought.push(prog);
    } catch (_e) {
      // ignore and continue
    }
  }

  return { ok: true, bought };
}

// ------------------------------------------------------------
// WSE / Stock API gating + purchase automation
// ------------------------------------------------------------

export function hasStockApi(ns) {
  return Boolean(ns.stock);
}

export function hasTixAccess(ns) {
  try {
    return Boolean(ns.stock && typeof ns.stock.hasTIXAPIAccess === "function" && ns.stock.hasTIXAPIAccess());
  } catch (_e) {
    return false;
  }
}

export function has4SDataTix(ns) {
  try {
    return Boolean(ns.stock && typeof ns.stock.has4SDataTIXAPI === "function" && ns.stock.has4SDataTIXAPI());
  } catch (_e) {
    return false;
  }
}

export function hasTixAnd4S(ns) {
  return hasTixAccess(ns) && has4SDataTix(ns);
}

/**
 * Attempt to buy WSE account + TIX + 4S.
 * Uses probe-safe function calls because naming differs between Bitburner versions.
 *
 * Returns: { ok, purchased: string[] }
 */
export function maybeBuyWseBundle(ns) {
  const purchased = [];
  if (!hasSingularity(ns)) return { ok: false, purchased };

  // WSE account
  try {
    if (typeof ns.singularity.purchaseWseAccount === "function") {
      if (ns.singularity.purchaseWseAccount()) purchased.push("WSE");
    }
  } catch (_e) { /* ignore */ }

  // TIX API
  try {
    if (typeof ns.singularity.purchaseTixApiAccess === "function") {
      if (ns.singularity.purchaseTixApiAccess()) purchased.push("TIX");
    }
  } catch (_e) { /* ignore */ }

  // 4S Market Data (two variants across versions)
  try {
    if (typeof ns.singularity.purchase4SMarketDataTixApi === "function") {
      if (ns.singularity.purchase4SMarketDataTixApi()) purchased.push("4S-TIX");
    } else if (typeof ns.singularity.purchase4SMarketData === "function") {
      if (ns.singularity.purchase4SMarketData()) purchased.push("4S");
    }
  } catch (_e) { /* ignore */ }

  return { ok: true, purchased };
}

// ------------------------------------------------------------
// Factions (invites)
// ------------------------------------------------------------

/**
 * Accepts all pending faction invitations.
 * Returns: { ok, joined: string[] }
 */
export function acceptFactionInvites(ns) {
  const joined = [];
  if (!canCheckFactionInvites(ns) || typeof ns.singularity.joinFaction !== "function") {
    return { ok: false, joined };
  }

  try {
    const invites = ns.singularity.checkFactionInvitations() || [];
    for (const f of invites) {
      try {
        if (ns.singularity.joinFaction(f)) joined.push(f);
      } catch (_e) {
        // ignore
      }
    }
    return { ok: true, joined };
  } catch (_e) {
    return { ok: false, joined };
  }
}
```
/* == END FILE == */

/* == FILE: lib/singularity-lane.js == */
```js
/** @param {NS} ns */
/*
 * lib/singularity-lane.js
 *
 * Description
 *  Controller lane wrapper for Singularity automation.
 *  Keeps /bin/controller.js clean while preserving â€œquiet terminal / rich logâ€ style.
 *
 * Notes
 *  - Calls into lib/singularity.js which provides probe-safe primitives.
 *  - This module is import-only; not intended to be run directly.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

import {
  maybeBuyTor,
  ensureDarkwebBuyerScript,
  maybeBuyWseBundle,
  acceptFactionInvites,
} from "lib/singularity.js";

export function runSingularityTick(ns, cfg, msgs) {
  if (cfg.autoTor) {
    const r = maybeBuyTor(ns);
    if (r.changed) msgs.push("[darkweb] Purchased TOR");
  }

  if (cfg.autoDarkweb) {
    const r = ensureDarkwebBuyerScript(ns, cfg.darkwebBuyer);
    if (r.changed && r.reason === "started") {
      msgs.push(`[darkweb] started ${cfg.darkwebBuyer}`);
    }
  }

  if (cfg.autoWse) {
    const r = maybeBuyWseBundle(ns);
    if (r.purchased?.length) msgs.push(`[wse] purchased: ${r.purchased.join(", ")}`);
  }

  if (cfg.autoInvites) {
    const r = acceptFactionInvites(ns);
    if (r.joined?.length) msgs.push(`[faction] joined: ${r.joined.join(", ")}`);
  }
}
```
/* == END FILE == */

/* == FILE: lib/solvers.js == */
```js
/** lib/solvers.js
 * Solver library for Coding Contracts.
 *
 * Notes:
 * - This file is primarily imported by other scripts.
 * - A small `main()` is included so `run contracts/solvers.js --help` works.
 */

export const solvers = {};

/** Print --help for this module (mainly for consistency / sanity checks). */
export function printHelp(ns) {
    ns.tprint([
        "contracts/solvers.js",
        "Description:",
        "  Library of Coding Contract solver functions keyed by contract type string.",
        "",
        "Usage:",
        "  run contracts/solvers.js --help",
        "",
        "Notes:",
        "  - This file is typically imported by another script (e.g. contracts/find-and-solve.js).",
        "  - The exported object is:  import { solvers } from \"contracts/solvers.js\";",
    ].join("\n"));
}

/** Optional entrypoint so this file supports --help. */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.tprint("contracts/solvers.js is a library. Try: run contracts/find-and-solve.js --help");
}

// ---------------------------------------------------------------------------
// Algorithmic Stock Trader IV
// ---------------------------------------------------------------------------

solvers["Algorithmic Stock Trader IV"] = (data) => {
    const k = data[0];
    const prices = data[1];

    const len = prices.length;
    if (len < 2 || k <= 0) return 0;

    // If k is large enough, it's equivalent to unlimited transactions.
    if (k >= Math.floor(len / 2)) {
        let res = 0;
        for (let i = 1; i < len; ++i) {
            res += Math.max(prices[i] - prices[i - 1], 0);
        }
        return res;
    }

    // DP: hold[j] = max profit after buying jth stock (j transactions used), rele[j] after selling jth
    const hold = Array(k + 1).fill(Number.NEGATIVE_INFINITY);
    const rele = Array(k + 1).fill(0);

    for (let i = 0; i < len; ++i) {
        const cur = prices[i];
        for (let j = k; j > 0; --j) {
            rele[j] = Math.max(rele[j], hold[j] + cur);
            hold[j] = Math.max(hold[j], rele[j - 1] - cur);
        }
    }
    return rele[k];
};

// ---------------------------------------------------------------------------
// HammingCodes (SECDED)
// Canonical key: "HammingCodes: Integer to Encoded Binary"
// ---------------------------------------------------------------------------

/**
 * Hamming(SECDED) encoding used by Bitburner coding contracts:
 * - Hamming parity bits at positions 1,2,4,8,... (1-indexed)
 * - Plus an overall parity bit at the very front (index 0 in the final string)
 *
 * Returns a string of bits.
 */
solvers["HammingCodes: Integer to Encoded Binary"] = (value) => {
    const dataBits = value.toString(2).split("");
    const m = dataBits.length;

    // Determine number of parity bits r such that: 2^r >= m + r + 1
    let r = 0;
    while ((1 << r) < (m + r + 1)) r++;

    // Build array with placeholders (1-indexed for hamming positions).
    const h = ["_"]; // dummy so h[1] is position 1
    let dataIdx = 0;

    for (let pos = 1; pos <= (m + r); pos++) {
        if ((pos & (pos - 1)) === 0) h[pos] = "0"; // parity placeholder
        else h[pos] = dataBits[dataIdx++];
    }

    // Compute parity bits (even parity)
    for (let i = 0; i < r; i++) {
        const p = 1 << i;
        let ones = 0;
        for (let pos = 1; pos < h.length; pos++) {
            if ((pos & p) && h[pos] === "1") ones++;
        }
        h[p] = (ones % 2).toString();
    }

    // Overall parity across all bits (excluding the overall bit itself)
    let totalOnes = 0;
    for (let pos = 1; pos < h.length; pos++) {
        if (h[pos] === "1") totalOnes++;
    }
    const overall = (totalOnes % 2).toString();

    return overall + h.slice(1).join("");
};

// Alias for mismatched casing you had earlier (prevents "No solver" surprises)
solvers["HammingCodes: Integer to encoded Binary"] = solvers["HammingCodes: Integer to Encoded Binary"];

/**
 * Decodes Hamming(SECDED) produced above.
 * Returns the original integer.
 *
 * If there are uncorrectable errors (e.g. 2-bit), Bitburner contract expects 0.
 */
solvers["HammingCodes: Encoded Binary to Integer"] = (_data) => {
    if (!_data || _data.length < 2) return 0;

    const bits = _data.split("");
    const overall = bits.shift(); // first bit is overall parity
    const h = ["_"].concat(bits); // 1-indexed

    const n = h.length - 1;

    // Determine r from length (largest power of two <= n)
    let r = 0;
    while ((1 << r) <= n) r++;

    // Compute syndrome
    let syndrome = 0;
    for (let i = 0; i < r; i++) {
        const p = 1 << i;
        let ones = 0;
        for (let pos = 1; pos <= n; pos++) {
            if ((pos & p) && h[pos] === "1") ones++;
        }
        if (ones % 2 !== 0) syndrome |= p;
    }

    // Check overall parity
    let totalOnes = 0;
    for (let pos = 1; pos <= n; pos++) {
        if (h[pos] === "1") totalOnes++;
    }
    if (overall === "1") totalOnes++; // include overall bit
    const overallOk = (totalOnes % 2 === 0);

    if (syndrome === 0 && overallOk) {
        // no error
    } else if (syndrome !== 0 && !overallOk) {
        // single-bit error in positions 1..n -> correct it
        if (syndrome >= 1 && syndrome <= n) {
            h[syndrome] = (h[syndrome] === "1") ? "0" : "1";
        } else {
            return 0;
        }
    } else if (syndrome === 0 && !overallOk) {
        // error is in the overall parity bit only -> ignore (correctable)
    } else {
        // syndrome != 0 and overall parity ok -> implies 2-bit error (uncorrectable)
        return 0;
    }

    // Extract data bits (skip parity positions 1,2,4,8,...)
    const dataBits = [];
    for (let pos = 1; pos <= n; pos++) {
        if ((pos & (pos - 1)) !== 0) dataBits.push(h[pos]);
    }

    const bin = dataBits.join("");
    return bin.length ? parseInt(bin, 2) : 0;
};

// ---------------------------------------------------------------------------
// Find Largest Prime Factor
// ---------------------------------------------------------------------------

solvers["Find Largest Prime Factor"] = (data) => {
    let n = (typeof data === "bigint") ? data : BigInt(data);
    if (n < 2n) return 0;

    let largest = 1n;

    while (n % 2n === 0n) {
        largest = 2n;
        n /= 2n;
    }

    let f = 3n;
    while (f * f <= n) {
        while (n % f === 0n) {
            largest = f;
            n /= f;
        }
        f += 2n;
    }

    if (n > 1n) largest = n;

    return (largest <= BigInt(Number.MAX_SAFE_INTEGER)) ? Number(largest) : largest.toString();
};

// ---------------------------------------------------------------------------
// Unique Paths in a Grid II
// ---------------------------------------------------------------------------

solvers["Unique Paths in a Grid II"] = (grid) => {
    const rows = grid.length;
    if (rows === 0) return 0;

    const cols = grid[0].length;
    if (cols === 0) return 0;

    if (grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1) return 0;

    const dp = Array(cols).fill(0);
    dp[0] = 1;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === 1) dp[c] = 0;
            else if (c > 0) dp[c] += dp[c - 1];
        }
    }

    return dp[cols - 1];
};

// ---------------------------------------------------------------------------
// Square Root (floor)
// ---------------------------------------------------------------------------

solvers["Square Root"] = (n) => {
    let x;
    if (typeof n === "bigint") x = n;
    else if (typeof n === "number") x = BigInt(Math.trunc(n));
    else x = BigInt(n);

    if (x < 0n) return 0;
    if (x < 2n) return x.toString();

    let lo = 1n;
    let hi = x;
    let ans = 1n;

    while (lo <= hi) {
        const mid = (lo + hi) >> 1n;
        const sq = mid * mid;
        if (sq <= x) {
            ans = mid;
            lo = mid + 1n;
        } else {
            hi = mid - 1n;
        }
    }

    if (ans <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(ans);
    return ans.toString();
};

// ---------------------------------------------------------------------------
// Sanitize Parentheses in Expression
// ---------------------------------------------------------------------------

solvers["Sanitize Parentheses in Expression"] = (s) => {
    const res = [];
    const visited = new Set();
    const queue = [s];
    visited.add(s);

    let found = false;

    const isValid = (str) => {
        let bal = 0;
        for (const ch of str) {
            if (ch === "(") bal++;
            else if (ch === ")") {
                if (--bal < 0) return false;
            }
        }
        return bal === 0;
    };

    while (queue.length > 0) {
        const cur = queue.shift();

        if (isValid(cur)) {
            res.push(cur);
            found = true;
        }

        if (found) continue; // only minimal removals

        for (let i = 0; i < cur.length; i++) {
            if (cur[i] !== "(" && cur[i] !== ")") continue;

            const next = cur.slice(0, i) + cur.slice(i + 1);
            if (!visited.has(next)) {
                visited.add(next);
                queue.push(next);
            }
        }
    }

    return res;
};

// ---------------------------------------------------------------------------
// Minimum Path Sum in a Triangle
// ---------------------------------------------------------------------------

solvers["Minimum Path Sum in a Triangle"] = (triangle) => {
    const n = triangle.length;
    if (n === 0) return 0;

    const dp = triangle[n - 1].slice();
    for (let i = n - 2; i >= 0; i--) {
        for (let j = 0; j < triangle[i].length; j++) {
            dp[j] = triangle[i][j] + Math.min(dp[j], dp[j + 1]);
        }
    }
    return dp[0];
};

// ---------------------------------------------------------------------------
// Compression I: RLE Compression
// ---------------------------------------------------------------------------

solvers["Compression I: RLE Compression"] = (s) => {
    if (!s || s.length === 0) return "";
    let out = "";
    let runChar = s[0];
    let runLen = 1;

    const flush = () => {
        while (runLen > 9) {
            out += "9" + runChar;
            runLen -= 9;
        }
        out += String(runLen) + runChar;
    };

    for (let i = 1; i < s.length; i++) {
        const ch = s[i];
        if (ch === runChar) runLen++;
        else {
            flush();
            runChar = ch;
            runLen = 1;
        }
    }
    flush();
    return out;
};

// ---------------------------------------------------------------------------
// Compression II: LZ Decompression (alternating-chunk spec)
// ---------------------------------------------------------------------------

solvers["Compression II: LZ Decompression"] = (data) => {
    const s = String(data);
    let out = "";
    let i = 0;
    let isLiteral = true; // start with literal chunk

    while (i < s.length) {
        const L = s.charCodeAt(i) - 48;
        i++;

        if (L === 0) {
            isLiteral = !isLiteral;
            continue;
        }

        if (isLiteral) {
            out += s.slice(i, i + L);
            i += L;
        } else {
            const X = s.charCodeAt(i) - 48;
            i++;
            const start = out.length - X;
            for (let k = 0; k < L; k++) out += out[start + k];
        }

        isLiteral = !isLiteral;
    }

    return out;
};

// ---------------------------------------------------------------------------
// Generate IP Addresses
// ---------------------------------------------------------------------------

solvers["Generate IP Addresses"] = (s) => {
    s = String(s);
    const res = [];

    const validOctet = (part) => {
        if (part.length === 0 || part.length > 3) return false;
        if (part.length > 1 && part[0] === "0") return false;
        const n = Number(part);
        return n >= 0 && n <= 255;
    };

    for (let a = 1; a <= 3; a++) {
        for (let b = 1; b <= 3; b++) {
            for (let c = 1; c <= 3; c++) {
                const d = s.length - (a + b + c);
                if (d < 1 || d > 3) continue;

                const p1 = s.slice(0, a);
                const p2 = s.slice(a, a + b);
                const p3 = s.slice(a + b, a + b + c);
                const p4 = s.slice(a + b + c);

                if (validOctet(p1) && validOctet(p2) && validOctet(p3) && validOctet(p4)) {
                    res.push(`${p1}.${p2}.${p3}.${p4}`);
                }
            }
        }
    }
    return res;
};

// ---------------------------------------------------------------------------
// Algorithmic Stock Trader I / II
// ---------------------------------------------------------------------------

solvers["Algorithmic Stock Trader I"] = (prices) => {
    if (!prices || prices.length < 2) return 0;
    let min = prices[0];
    let best = 0;
    for (let i = 1; i < prices.length; i++) {
        best = Math.max(best, prices[i] - min);
        min = Math.min(min, prices[i]);
    }
    return best;
};

solvers["Algorithmic Stock Trader II"] = (prices) => {
    let profit = 0;
    for (let i = 1; i < prices.length; i++) {
        const d = prices[i] - prices[i - 1];
        if (d > 0) profit += d;
    }
    return profit;
};

// ---------------------------------------------------------------------------
// Unique Paths in a Grid I
// ---------------------------------------------------------------------------

solvers["Unique Paths in a Grid I"] = (data) => {
    const rows = data[0];
    const cols = data[1];
    if (rows <= 0 || cols <= 0) return 0;

    const dp = Array(cols).fill(1);
    for (let r = 1; r < rows; r++) {
        for (let c = 1; c < cols; c++) dp[c] += dp[c - 1];
    }
    return dp[cols - 1];
};

// ---------------------------------------------------------------------------
// Array Jumping Game I / II
// ---------------------------------------------------------------------------

solvers["Array Jumping Game"] = (arr) => {
    let furthest = 0;
    for (let i = 0; i < arr.length; i++) {
        if (i > furthest) return 0;
        furthest = Math.max(furthest, i + arr[i]);
        if (furthest >= arr.length - 1) return 1;
    }
    return 1;
};

solvers["Array Jumping Game II"] = (arr) => {
    const n = arr.length;
    if (n <= 1) return 0;

    let jumps = 0;
    let curEnd = 0;
    let furthest = 0;

    for (let i = 0; i < n - 1; i++) {
        furthest = Math.max(furthest, i + arr[i]);
        if (i === curEnd) {
            jumps++;
            curEnd = furthest;
            if (curEnd >= n - 1) break;
        }
    }
    return jumps;
};

// ---------------------------------------------------------------------------
// Find All Valid Math Expressions
// ---------------------------------------------------------------------------

solvers["Find All Valid Math Expressions"] = (data) => {
    const num = String(data[0]);
    const target = Number(data[1]);
    const res = [];

    const dfs = (idx, expr, acc, last) => {
        if (idx === num.length) {
            if (acc === target) res.push(expr);
            return;
        }

        for (let j = idx; j < num.length; j++) {
            if (j > idx && num[idx] === "0") break;

            const partStr = num.slice(idx, j + 1);
            const partVal = Number(partStr);

            if (idx === 0) {
                dfs(j + 1, partStr, partVal, partVal);
            } else {
                dfs(j + 1, expr + "+" + partStr, acc + partVal, partVal);
                dfs(j + 1, expr + "-" + partStr, acc - partVal, -partVal);
                dfs(j + 1, expr + "*" + partStr, acc - last + last * partVal, last * partVal);
            }
        }
    };

    dfs(0, "", 0, 0);
    return res;
};

// ---------------------------------------------------------------------------
// Merge Overlapping Intervals
// ---------------------------------------------------------------------------

solvers["Merge Overlapping Intervals"] = (intervals) => {
    if (!intervals || intervals.length === 0) return [];

    intervals.sort((a, b) => a[0] - b[0]);

    const merged = [];
    let [s, e] = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
        const [cs, ce] = intervals[i];
        if (cs <= e) e = Math.max(e, ce);
        else {
            merged.push([s, e]);
            s = cs; e = ce;
        }
    }
    merged.push([s, e]);
    return merged;
};

// ---------------------------------------------------------------------------
// Spiralize Matrix
// ---------------------------------------------------------------------------

solvers["Spiralize Matrix"] = (matrix) => {
    const res = [];
    let top = 0;
    let left = 0;
    let bottom = matrix.length - 1;
    let right = matrix[0].length - 1;

    while (top <= bottom && left <= right) {
        for (let c = left; c <= right; c++) res.push(matrix[top][c]);
        top++;

        for (let r = top; r <= bottom; r++) res.push(matrix[r][right]);
        right--;

        if (top <= bottom) {
            for (let c = right; c >= left; c--) res.push(matrix[bottom][c]);
            bottom--;
        }

        if (left <= right) {
            for (let r = bottom; r >= top; r--) res.push(matrix[r][left]);
            left++;
        }
    }
    return res;
};

// ---------------------------------------------------------------------------
// Proper 2-Coloring of a Graph
// ---------------------------------------------------------------------------

solvers["Proper 2-Coloring of a Graph"] = (data) => {
    const n = data[0];
    const edges = data[1];

    const adj = Array.from({ length: n }, () => []);
    for (const [u, v] of edges) {
        adj[u].push(v);
        adj[v].push(u);
    }

    const color = Array(n).fill(-1);

    for (let start = 0; start < n; start++) {
        if (color[start] !== -1) continue;

        color[start] = 0;
        const q = [start];

        while (q.length) {
            const u = q.shift();
            for (const v of adj[u]) {
                if (color[v] === -1) {
                    color[v] = 1 - color[u];
                    q.push(v);
                } else if (color[v] === color[u]) {
                    return [];
                }
            }
        }
    }

    return color;
};

// ---------------------------------------------------------------------------
// Compression III: LZ Compression (alternating-chunk spec, minimum length DP)
// ---------------------------------------------------------------------------

solvers["Compression III: LZ Compression"] = (data) => {
    const s = String(data);
    const n = s.length;

    const digit = (x) => String.fromCharCode(48 + x);

    // match[pos][x] = max L (<=9) such that s[pos..pos+L) == s[pos-x..pos-x+L)
    const match = Array.from({ length: n + 1 }, () => Array(10).fill(0));
    for (let pos = 0; pos < n; pos++) {
        for (let x = 1; x <= 9; x++) {
            if (pos - x < 0) continue;
            const maxL = Math.min(9, n - pos);
            let L = 0;
            while (L < maxL && s[pos + L] === s[pos - x + L]) L++;
            match[pos][x] = L;
        }
    }

    // dpCost[pos][type], type 0 = literal next, type 1 = backref next
    const dpCost = Array.from({ length: n + 1 }, () => [Infinity, Infinity]);

    // choice[pos][type] = { kind:"lit", L } | { kind:"back", L, x } | { kind:"flip0" } | { kind:"end" }
    const choice = Array.from({ length: n + 1 }, () => [null, null]);

    dpCost[n][0] = 0; dpCost[n][1] = 0;
    choice[n][0] = { kind: "end" };
    choice[n][1] = { kind: "end" };

    for (let pos = n - 1; pos >= 0; pos--) {
        // ---- Best consume options (no flip0) ----
        // Literal consume: choose L=1..9
        let litBestCost = Infinity;
        let litBest = null;
        const maxLit = Math.min(9, n - pos);
        for (let L = 1; L <= maxLit; L++) {
            const cost = (1 + L) + dpCost[pos + L][1]; // 'L' + L chars, then next is backref
            if (cost < litBestCost) {
                litBestCost = cost;
                litBest = { kind: "lit", L };
            }
        }

        // Backref consume: choose x=1..9 and L=1..min(9, match)
        let backBestCost = Infinity;
        let backBest = null;
        for (let x = 1; x <= 9; x++) {
            const mL = match[pos][x];
            if (mL <= 0) continue;
            const maxBack = Math.min(9, mL);
            for (let L = 1; L <= maxBack; L++) {
                const cost = 2 + dpCost[pos + L][0]; // 'L' + 'x', then next is literal
                if (cost < backBestCost) {
                    backBestCost = cost;
                    backBest = { kind: "back", L, x };
                }
            }
        }

        // ---- Solve the coupled mins with quick relaxation ----
        // dp0 = min(litBestCost, 1 + dp1)
        // dp1 = min(backBestCost, 1 + dp0)
        //
        // Start with consume-only, then relax 2-3 times (converges fast due to +1 costs).
        let dp0 = litBestCost;
        let dp1 = backBestCost;

        // If backrefs impossible at this pos, dp1 starts Infinity, relaxation will use flip0.
        for (let it = 0; it < 4; it++) {
            dp0 = Math.min(litBestCost, 1 + dp1);
            dp1 = Math.min(backBestCost, 1 + dp0);
        }

        dpCost[pos][0] = dp0;
        dpCost[pos][1] = dp1;

        // ---- Record choices that reproduce dp0/dp1 ----
        // For type 0:
        if (dp0 === litBestCost) {
            choice[pos][0] = litBest; // literal consume
        } else {
            choice[pos][0] = { kind: "flip0" }; // 0-length chunk to flip to type 1
        }

        // For type 1:
        if (dp1 === backBestCost) {
            choice[pos][1] = backBest; // backref consume
        } else {
            choice[pos][1] = { kind: "flip0" }; // 0-length chunk to flip to type 0
        }
    }

    // ---- Reconstruct encoding from pos=0, type=0 (literal next) ----
    let pos = 0;
    let type = 0;
    const parts = [];

    while (pos < n) {
        const ch = choice[pos][type];
        if (!ch || ch.kind === "end") break;

        if (ch.kind === "flip0") {
            parts.push("0");
            type = 1 - type;
            continue;
        }

        if (type === 0 && ch.kind === "lit") {
            parts.push(digit(ch.L));
            parts.push(s.slice(pos, pos + ch.L));
            pos += ch.L;
            type = 1;
            continue;
        }

        if (type === 1 && ch.kind === "back") {
            parts.push(digit(ch.L));
            parts.push(digit(ch.x));
            pos += ch.L;
            type = 0;
            continue;
        }

        // Safety break (should never happen)
        break;
    }

    return parts.join("");


};

// ---------------------------------------------------------------------------
// Square Root (BigInt)
// ---------------------------------------------------------------------------
solvers["Square Root"] = (data) => {
    // Normalize input -> BigInt
    let n;
    if (typeof data === "bigint") {
        n = data;
    } else {
        const s = String(data).trim();
        n = BigInt(s.endsWith("n") ? s.slice(0, -1) : s);
    }

    if (n < 0n) return "";
    if (n < 2n) return n.toString();

    // Integer sqrt floor via Newton's method
    let x = n;
    let y = (x + 1n) >> 1n;
    while (y < x) {
        x = y;
        y = (x + n / x) >> 1n;
    }
    const floor = x;

    // Round to nearest integer: compare distances to floor^2 and (floor+1)^2
    const up = floor + 1n;
    const floorSq = floor * floor;
    const upSq = up * up;

    const downDiff = n >= floorSq ? (n - floorSq) : (floorSq - n);
    const upDiff = upSq >= n ? (upSq - n) : (n - upSq);

    // If tie, choose floor (stable)
    return (upDiff < downDiff ? up : floor).toString();
};
```
/* == END FILE == */

/* == FILE: lib/target-lane.js == */
```js
/** @param {NS} ns */
/*
 * lib/target-lane.js
 *
 * Description
 *  Target selection + retarget policy for the controller.
 *   - Computes primary â€œbatchâ€ target and secondary HGW target
 *   - Optionally re-scores on an interval when cfg.retarget=true
 *   - Optionally restarts managed scripts on target change (safe killScripts set)
 *
 * Notes
 *  - This module is policy/orchestration for targeting, not the scoring implementation.
 *  - Scoring is delegated to lib/targets.js.
 *  - Designed to be called from /bin/controller.js once per tick.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

import { choosePrimaryTarget, chooseXpTarget, chooseSecondaryTarget } from "lib/targets.js";
import { killScripts } from "lib/orchestrator.js";

/**
 * Initialize targets once at startup.
 * @param {NS} ns
 * @param {object} cfg
 * @param {boolean} verbose
 * @returns {{primaryTarget:string, hgwTarget:string, lastTargetCompute:number, msgs:string[]}}
 */
export function initTargets(ns, cfg, verbose = true) {
  const { primaryTarget, hgwTarget, lastTargetCompute } = computeTargets(ns, cfg, verbose);
  const msgs = [];
  if (verbose) msgs.push(`[target] init: batch=${primaryTarget} hgw=${hgwTarget} (${cfg.hgwMode})`);
  return { primaryTarget, hgwTarget, lastTargetCompute, msgs };
}

/**
 * Run one tick of retargeting logic. Returns updated targets + any terminal-facing messages.
 * @param {NS} ns
 * @param {object} cfg
 * @param {{primaryTarget:string, hgwTarget:string, lastTargetCompute:number}} state
 * @returns {{primaryTarget:string, hgwTarget:string, lastTargetCompute:number, msgs:string[]}}
 */
export function runTargetingTick(ns, cfg, state) {
  let { primaryTarget, hgwTarget, lastTargetCompute } = state;
  const msgs = [];

  // If user overrides batch target, we never retarget.
  if (cfg.batchTargetOverride) {
    return { primaryTarget: cfg.batchTargetOverride, hgwTarget: cfg.batchTargetOverride, lastTargetCompute, msgs };
  }

  if (!cfg.retarget) {
    return { primaryTarget, hgwTarget, lastTargetCompute, msgs };
  }

  const due = (Date.now() - lastTargetCompute) >= cfg.retargetEvery;
  if (!due) return { primaryTarget, hgwTarget, lastTargetCompute, msgs };

  const prevPrimary = primaryTarget;
  const prevHGW = hgwTarget;

  ({ primaryTarget, hgwTarget, lastTargetCompute } = computeTargets(ns, cfg, cfg.scoringVerbose));

  const changed = (primaryTarget !== prevPrimary) || (hgwTarget !== prevHGW);
  if (!changed) return { primaryTarget, hgwTarget, lastTargetCompute, msgs };

  msgs.push(`[target] updated: batch=${primaryTarget} hgw=${hgwTarget} (${cfg.hgwMode})`);

  if (cfg.restartOnRetarget) {
    // Only restart managed scripts (safe). Controller stays alive.
    const managed = new Set([cfg.batcher, cfg.botnet]);
    const res = killScripts(ns, "home", managed);
    msgs.push(`[retarget] restarted managed scripts: killed=${res.killed}/${res.attempted}`);
  }

  return { primaryTarget, hgwTarget, lastTargetCompute, msgs };
}

// ------------------------------------------------------------
// Internal: computes targets using lib/targets.js
// ------------------------------------------------------------

function computeTargets(ns, cfg, verbose) {
  const now = Date.now();

  // Batch target override
  if (cfg.batchTargetOverride) {
    const primaryTarget = cfg.batchTargetOverride;
    const hgwTarget = primaryTarget;
    if (verbose) ns.tprint(`[target] override: batch=${primaryTarget}, hgw=${hgwTarget} (${cfg.hgwMode})`);
    return { primaryTarget, hgwTarget, lastTargetCompute: now };
  }

  const { target: primaryTarget } = choosePrimaryTarget(ns, { verbose });

  let hgwTarget;
  if (cfg.hgwMode === "xp") {
    hgwTarget = chooseXpTarget(ns, primaryTarget, { verbose });
  } else {
    hgwTarget = chooseSecondaryTarget(ns, primaryTarget, { verbose });
  }

  return { primaryTarget, hgwTarget, lastTargetCompute: now };
}
```
/* == END FILE == */

/* == FILE: lib/targets.js == */
```js
/** @param {NS} ns */
/*
 * lib/targets.js
 *
 * Shared target selection helpers:
 *  - Formulas.exe auto-detect + safe fallback
 *  - Money/sec scoring for primary batch target
 *  - XP scoring for HGW farm target
 */

import { getAllServers, countPortCrackers } from "/lib/rooting.js";

// ------------------------------------------------
// Small helpers
// ------------------------------------------------

export function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

export function fmtMoney(ns, value) {
  return "$" + ns.formatNumber(value, 2, 1e3);
}

// ------------------------------------------------
// Formulas.exe helpers (auto-detect + safe fallback)
// ------------------------------------------------

export function hasFormulas(ns) {
  try {
    return (
      ns.fileExists("Formulas.exe", "home") &&
      ns.formulas &&
      ns.formulas.hacking &&
      typeof ns.formulas.hacking.hackTime === "function"
    );
  } catch (_e) {
    return false;
  }
}

export function getHackTimeAndChance(ns, host) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(host),
      chance: ns.hackAnalyzeChance(host),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(host);

  // Compute optimistic baseline (min difficulty, max money)
  s.hackDifficulty = s.minDifficulty;
  s.moneyAvailable = Math.max(1, s.moneyMax || 0);

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    chance: ns.formulas.hacking.hackChance(s, player),
    usingFormulas: true,
  };
}

// ------------------------------------------------
// MONEY/sec SCORING (for main batch target)
// ------------------------------------------------

export function getScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  const MIN_MONEY_ABS = 1_000_000;
  const MIN_HACK_RATIO = 0.02;
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    "n00dles",
    "foodnstuff",
    "sigma-cosmetics",
    "joesguns",
    "harakiri-sushi",
    "hong-fang-tea",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue;

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;
    if (!maxMoney || maxMoney < MIN_MONEY_ABS) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);
    if (hackRatio < MIN_HACK_RATIO) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const moneyPerSec = maxMoney / tHack;

    const secPenalty = 1 + (minSec - 1) / 100;

    let bandBonus;
    if (hackRatio < 0.2)       bandBonus = 0.7;
    else if (hackRatio <= 0.8) bandBonus = 1.0;
    else                       bandBonus = 0.85;

    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1);

    const score = (moneyPerSec * bandBonus * chanceModifier) / secPenalty;

    scored.push({
      host,
      maxMoney,
      minSec,
      tHack,
      score,
      reqHack,
      chance,
      moneyPerSec,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function choosePrimaryTarget(ns, opts = {}) {
  const extraExcluded = opts.extraExcluded ?? [];
  const verbose = opts.verbose ?? true;

  const scored = getScoredServers(ns, extraExcluded);

  if (scored.length === 0) {
    if (verbose) {
      ns.tprint("â“ No juicy advanced target found with current filters.");
      ns.tprint("   Falling back to n00dles.");
    }
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  if (verbose) {
    ns.tprint("=======================================");
    ns.tprint("   ðŸ’° Juiciest Advanced Target (money/sec)");
    ns.tprint("=======================================");
    ns.tprint(`ðŸŽ¯ Host:       ${best.host}`);
    ns.tprint(`ðŸ’¸ Max Money:  ${fmtMoney(ns, best.maxMoney)}`);
    ns.tprint(`ðŸ§  Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
    ns.tprint(`ðŸŽ¯ Chance:     ${(best.chance * 100).toFixed(1)}%`);
    ns.tprint(`ðŸ›¡ MinSec:     ${best.minSec.toFixed(2)}`);
    ns.tprint(`â± Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
    ns.tprint(`ðŸ’° Money/sec:  ${fmtMoney(ns, best.moneyPerSec * 1000)}`);
    ns.tprint(`ðŸ“ˆ Score:      ${best.score.toExponential(3)}`);

    const topN = Math.min(5, scored.length);
    ns.tprint("=======================================");
    ns.tprint("   ðŸ† Top Candidates (by money/sec)");
    ns.tprint("=======================================");
    for (let i = 0; i < topN; i++) {
      const h = scored[i];
      ns.tprint(
        `${i + 1}. ${h.host} | ` +
        `Score=${h.score.toExponential(2)} | ` +
        `Money=${fmtMoney(ns, h.maxMoney)} | ` +
        `ReqHack=${h.reqHack} | ` +
        `Chance=${(h.chance * 100).toFixed(1)}% | ` +
        `Sec=${h.minSec.toFixed(1)} | ` +
        `T=${(h.tHack / 1000).toFixed(1)}s | ` +
        `hackRatio=${(h.hackRatio * 100).toFixed(0)}% | ` +
        `$/sec=${fmtMoney(ns, h.moneyPerSec * 1000)}`
      );
    }
  }

  return { target: best.host, scored };
}

export function chooseSecondaryTarget(ns, primary, opts = {}) {
  const extraExcluded = opts.extraExcluded ?? [];
  const verbose = opts.verbose ?? true;

  const scored = getScoredServers(ns, [primary, ...extraExcluded]);

  if (scored.length === 0) {
    if (verbose) ns.tprint("â“ No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  if (verbose) ns.tprint(`ðŸ’° Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ------------------------------------------------
// XP SCORING (for HGW farm target)
// ------------------------------------------------

export function getXpScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  const EXCLUDED = new Set([
    "home",
    "darkweb",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue;

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);

    let bandBonus;
    if (hackRatio < 0.4)       bandBonus = 0.5;
    else if (hackRatio <= 1.2) bandBonus = 1.1;
    else if (hackRatio <= 1.6) bandBonus = 1.0;
    else                       bandBonus = 0.7;

    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1);
    const baseXpScore    = (reqHack * chanceModifier) / Math.pow(tHack, 1.2);

    const score = baseXpScore * bandBonus;

    scored.push({
      host,
      score,
      reqHack,
      chance,
      tHack,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function chooseXpTarget(ns, primary, opts = {}) {
  const extraExcluded = opts.extraExcluded ?? [];
  const verbose = opts.verbose ?? true;

  const scored = getXpScoredServers(ns, [primary, ...extraExcluded]);

  if (scored.length === 0) {
    if (verbose) {
      ns.tprint("â“ No distinct XP-optimized HGW target found.");
      ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    }
    return "n00dles";
  }

  const best = scored[0];

  if (verbose) {
    ns.tprint("=======================================");
    ns.tprint("   ðŸ§  XP-Optimized HGW Target");
    ns.tprint("=======================================");
    ns.tprint(`ðŸŽ¯ Host:       ${best.host}`);
    ns.tprint(`ðŸ§  Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
    ns.tprint(`ðŸŽ¯ Chance:     ${(best.chance * 100).toFixed(1)}%`);
    ns.tprint(`â± Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
    ns.tprint(`ðŸ“ˆ XP Score:   ${best.score.toExponential(3)}`);
    ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

    const topN = Math.min(5, scored.length);
    ns.tprint("=======================================");
    ns.tprint("   ðŸ§  Top XP Candidates");
    ns.tprint("=======================================");
    for (let i = 0; i < topN; i++) {
      const h = scored[i];
      ns.tprint(
        `${i + 1}. ${h.host} | ` +
        `XPScore=${h.score.toExponential(2)} | ` +
        `ReqHack=${h.reqHack} | ` +
        `Chance=${(h.chance * 100).toFixed(1)}% | ` +
        `T=${(h.tHack / 1000).toFixed(1)}s | ` +
        `hackRatio=${(h.hackRatio * 100).toFixed(0)}%`
      );
    }
  }

  return best.host;
}
```
/* == END FILE == */

/* == FILE: lib/work.js == */
```js
/** @param {NS} ns */
/*
 * lib/work.js
 *
 * Description
 *  Small helpers for representing â€œcurrent workâ€ in a compact, log-friendly way,
 *  plus a few safe helpers for enforcing Singularity work policies.
 *
 * Notes
 *  - Formatting helpers are safe to use anywhere.
 *  - Singularity helpers are guarded (they no-op if Singularity API isn't available).
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

export const FACTION_DAEDALUS = "Daedalus";
export const DAEDALUS_DEFAULT_WORKTYPE = "Hacking Contracts";

export function formatWorkBrief(work) {
  if (!work) return "none";

  try {
    if (work.type === "CRIME") return `CRIME:${work.crimeType}`;
    if (work.type === "GYM") return `GYM:${work.gymStatType}`;
    if (work.type === "CLASS") return `CLASS:${work.classType ?? work.courseName ?? "?"}`;
    if (work.type === "FACTION") return `FACTION:${work.factionName}:${work.factionWorkType}`;
    return String(work.type || "unknown");
  } catch (_e) {
    return "unknown";
  }
}

/**
 * Ensure we are earning Daedalus rep once we are a member.
 *
 * This is designed to be called repeatedly (e.g., every controller tick).
 * It is idempotent and will only switch work if you're a Daedalus member and
 * you are NOT already doing Daedalus faction work.
 *
 * @param {NS} ns
 * @param {{
 *   workType?: string,
 *   focus?: boolean,
 *   verbose?: boolean,
 * }} [opts]
 * @returns {{didSwitch:boolean, reason:string}}
 */
export function ensureDaedalusFactionWork(ns, opts = {}) {
  const workType = String(opts.workType || DAEDALUS_DEFAULT_WORKTYPE);
  const focus = Boolean(opts.focus);
  const verbose = Boolean(opts.verbose);

  // Guard: Singularity API must exist
  if (!ns?.singularity || typeof ns.singularity.getCurrentWork !== "function") {
    return { didSwitch: false, reason: "no_singularity_api" };
  }

  const player = ns.getPlayer();
  const factions = player?.factions || [];

  // Only act if we are actually in Daedalus
  if (!factions.includes(FACTION_DAEDALUS)) {
    return { didSwitch: false, reason: "not_in_daedalus" };
  }

  // If already working for Daedalus, do nothing
  const cur = ns.singularity.getCurrentWork();
  if (cur && cur.type === "FACTION" && cur.factionName === FACTION_DAEDALUS) {
    return { didSwitch: false, reason: "already_working_daedalus" };
  }

  // Switch to Daedalus work
  const ok = ns.singularity.workForFaction(FACTION_DAEDALUS, workType, focus);

  if (verbose) {
    const before = formatWorkBrief(cur);
    ns.print(`[work] ensureDaedalusFactionWork: ${before} -> FACTION:${FACTION_DAEDALUS}:${workType} (ok=${ok})`);
  }

  return { didSwitch: Boolean(ok), reason: ok ? "switched" : "workForFaction_failed" };
}
```
/* == END FILE == */

/* == FILE: workers/hwgw/batch-grow.js == */
```js
/** @param {NS} ns **/
export async function main(ns) {
    // Use flags so we can support --help without breaking existing positional usage.
    // Existing callers that pass only positional args are preserved via flags._.
    const flags = ns.flags([
        ["help", false],
    ]);

    // If called with --help, print help text and exit immediately.
    // Do NOT run grow logic or propagate this flag to any children.
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Original positional arguments, now read from flags._ to keep behavior identical:
    //   0: target (string)
    //   1: startDelay (ms, number)
    //   2: expectedTime (ms, grow time, number)
    const target = flags._[0];
    const startDelay = Number(flags._[1] ?? 0);
    const expectedTime = Number(flags._[2] ?? 0); // grow time

    if (!target) return;

    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.grow(target);
    const end = performance.now();

    const drift = expectedTime - (end - start);
    if (drift > 1) await ns.sleep(drift);
}

function printHelp(ns) {
    ns.tprint("workers/hwgw/batch-grow.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Grow worker used by batch controllers in HWGW pipelines.");
    ns.tprint("  Supports an optional start delay and expected run time for drift correction.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Typically launched by controller scripts, not directly from the terminal.");
    ns.tprint("  Positional arguments are: target, startDelay(ms), expectedGrowTime(ms).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run batch/batch-grow.js [target] [startDelay] [expectedGrowTime] [--help]");
}
```
/* == END FILE == */

/* == FILE: workers/hwgw/batch-hack.js == */
```js
/** @param {NS} ns **/
export async function main(ns) {
    // Use flags so we can support a --help flag without breaking existing positional usage.
    // Existing callers that pass only positional args are preserved via flags._.
    const flags = ns.flags([
        ["help", false],
    ]);

    // If called with --help, print help text and exit immediately.
    // Do NOT run hack logic or propagate this flag to any children.
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Original positional arguments, now read from flags._ to keep behavior identical:
    //   0: target (string)
    //   1: startDelay (ms, number)
    //   2: expectedTime (ms, hack time, number)
    const target = flags._[0];
    const startDelay = Number(flags._[1] ?? 0);
    const expectedTime = Number(flags._[2] ?? 0);  // MUST be hack time

    if (!target) return;

    // Delay until batch start
    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.hack(target);
    const end = performance.now();

    const actual = end - start;
    const drift = expectedTime - actual;

    if (drift > 1) await ns.sleep(drift);
}

function printHelp(ns) {
    ns.tprint("workers/hwgw/batch-hack.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Timed hack worker used by batch controllers in HWGW pipelines.");
    ns.tprint("  Supports an optional start delay and expected run time for drift correction.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Typically launched by controller scripts, not directly from the terminal.");
    ns.tprint("  Positional arguments are: target, startDelay(ms), expectedHackTime(ms).");
    ns.tprint("  The expected time should match the hack time used by the batch controller.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run batch/batch-hack.js [target] [startDelay] [expectedHackTime] [--help]");
}
```
/* == END FILE == */

/* == FILE: workers/hwgw/batch-weaken.js == */
```js
/** @param {NS} ns **/
export async function main(ns) {
    // Use flags to add --help without breaking positional usage.
    const flags = ns.flags([
        ["help", false],
    ]);

    // When --help is used, print help and exit.
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Preserve original positional args:
    //   0: target
    //   1: startDelay (ms)
    //   2: expectedWeakenTime (ms)
    const target = flags._[0];
    const startDelay = Number(flags._[1] ?? 0);
    const expectedTime = Number(flags._[2] ?? 0);

    if (!target) return;

    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.weaken(target);
    const end = performance.now();

    const actual = end - start;
    const drift = expectedTime - actual;

    if (drift > 1) await ns.sleep(drift);
}

function printHelp(ns) {
    ns.tprint("workers/hwgw/batch-weaken.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Timed weaken worker used by batch controllers in HWGW pipelines.");
    ns.tprint("  Supports an optional start delay and expected run time for drift correction.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Usually launched automatically by controller scripts rather than the terminal.");
    ns.tprint("  Positional arguments are: target, startDelay(ms), expectedWeakenTime(ms).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run batch/batch-weaken.js [target] [startDelay] [expectedWeakenTime] [--help]");
}
```
/* == END FILE == */

