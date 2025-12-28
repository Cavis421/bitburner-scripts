export async function main(ns) {
  // Legacy shim: moved to /apps/pserv/list-pservs.js
  ns.run("/apps/pserv/list-pservs.js", 1, ...ns.args);
}
