export async function main(ns) {
  // Legacy shim: moved to /apps/hacknet/hacknet-smart.js
  ns.run("/apps/hacknet/hacknet-smart.js", 1, ...ns.args);
}
