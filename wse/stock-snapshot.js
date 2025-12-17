/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
        ["minRating", ""],     // e.g. +++, ++++
        ["minForecast", 0],    // e.g. 0.6
        ["positions", true],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    const minForecast = Math.max(0, Math.min(1, Number(flags.minForecast) || 0));
    const minRating   = String(flags.minRating || "").trim();

    const symbols = ns.stock.getSymbols();

    ns.tprint("");
    ns.tprint("STOCK MARKET SNAPSHOT");
    ns.tprint("====================================================================================================");
    ns.tprint(
        "SYM   PRICE       BID         ASK         SPRD    FCST    RATE  VOL    SHARES      AVG        P/L"
    );
    ns.tprint(
        "----------------------------------------------------------------------------------------------------"
    );

    let shown = 0;

    for (const sym of symbols) {
        const price = safe(() => ns.stock.getPrice(sym));
        const bid   = safe(() => ns.stock.getBidPrice(sym));
        const ask   = safe(() => ns.stock.getAskPrice(sym));
        const vol   = safe(() => ns.stock.getVolatility(sym));
        const fcst  = safe(() => ns.stock.getForecast(sym));

        const spreadPct =
            price > 0 ? ((ask - bid) / price) * 100 : 0;

        const rating = forecastToRating(fcst);

        if (fcst < minForecast) continue;
        if (minRating && ratingRank(rating) < ratingRank(minRating)) continue;

        let sharesStr = "-";
        let avgStr    = "-";
        let pnlStr    = "-";

        if (flags.positions) {
            const [long, longAvg, short, shortAvg] = ns.stock.getPosition(sym);

            if (long > 0) {
                sharesStr = long.toString();
                avgStr    = ns.nFormat(longAvg, "$0.000a");
                pnlStr    = ns.nFormat((bid - longAvg) * long, "$0.000a");
            } else if (short > 0) {
                sharesStr = "-" + short;
                avgStr    = ns.nFormat(shortAvg, "$0.000a");
                pnlStr    = ns.nFormat((shortAvg - ask) * short, "$0.000a");
            }
        }

        ns.tprint(
            `${pad(sym, 4)} ` +
            `${pad(ns.nFormat(price, "$0.000a"), 10)} ` +
            `${pad(ns.nFormat(bid,   "$0.000a"), 10)} ` +
            `${pad(ns.nFormat(ask,   "$0.000a"), 10)} ` +
            `${pad(spreadPct.toFixed(2) + "%", 6)} ` +
            `${pad(fcst.toFixed(3), 6)} ` +
            `${pad(rating, 5)} ` +
            `${pad(vol.toFixed(3), 6)} ` +
            `${pad(sharesStr, 10)} ` +
            `${pad(avgStr, 10)} ` +
            `${pad(pnlStr, 10)}`
        );

        shown++;
    }

    ns.tprint("----------------------------------------------------------------------------------------------------");
    ns.tprint(`Shown ${shown} / ${symbols.length} symbols`);
    ns.tprint("");
}

/* ================= helpers ================= */

function forecastToRating(f) {
    if (!isFinite(f)) return "N/A";
    if (f >= 0.65) return "++++";
    if (f >= 0.60) return "+++";
    if (f >= 0.55) return "++";
    if (f >  0.50) return "+";
    if (f <= 0.35) return "----";
    if (f <= 0.40) return "---";
    if (f <= 0.45) return "--";
    if (f <  0.50) return "-";
    return "0";
}

function ratingRank(r) {
    if (!r || r === "N/A" || r === "0") return 0;
    return r[0] === "+" ? r.length : -r.length;
}

function pad(s, n) {
    s = String(s);
    return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function safe(fn) {
    try { return fn(); } catch { return 0; }
}

function printHelp(ns) {
    ns.tprint("wse/stock-console-report.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Prints all stock prices and forecasts directly to the terminal.");
    ns.tprint("  Designed to debug auto-trader buy decisions.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run wse/stock-console-report.js");
    ns.tprint("  run wse/stock-console-report.js --minRating +++");
    ns.tprint("  run wse/stock-console-report.js --minForecast 0.60");
    ns.tprint("");
}
