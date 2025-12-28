export async function main(ns) {
  // Legacy shim: moved to /apps/wse/stock-api-probe.js
  ns.run("/apps/wse/stock-api-probe.js", 1, ...ns.args);
}
