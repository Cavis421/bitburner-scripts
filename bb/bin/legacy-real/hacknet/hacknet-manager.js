export async function main(ns) {
  // Legacy shim: moved to /apps/hacknet/hacknet-manager.js
  ns.run("/apps/hacknet/hacknet-manager.js", 1, ...ns.args);
}
