export async function main(ns) {
  // Legacy shim: moved to /apps/hacknet/hacknet-status.js
  ns.run("/apps/hacknet/hacknet-status.js", 1, ...ns.args);
}
