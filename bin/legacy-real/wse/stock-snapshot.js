export async function main(ns) {
  // Legacy shim: moved to /apps/wse/stock-snapshot.js
  ns.run("/apps/wse/stock-snapshot.js", 1, ...ns.args);
}
