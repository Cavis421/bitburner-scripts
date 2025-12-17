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
