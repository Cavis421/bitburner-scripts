export async function main(ns) {
  // Legacy shim: moved to /apps/pserv/clean-pservs.js
  ns.run("/apps/pserv/clean-pservs.js", 1, ...ns.args);
}
