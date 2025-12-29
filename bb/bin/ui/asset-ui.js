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
          `close≈${fmtMoney(ns, r.closeCost)}`,
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
