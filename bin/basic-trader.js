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


//update: 2025-12-13 13:25 