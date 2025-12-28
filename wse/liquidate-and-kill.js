export async function main(ns) {
  // Legacy shim: moved to /apps/wse/liquidate-and-kill.js
  ns.run("/apps/wse/liquidate-and-kill.js", 1, ...ns.args);
}
