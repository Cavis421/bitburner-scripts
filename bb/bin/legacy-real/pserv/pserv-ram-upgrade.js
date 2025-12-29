export async function main(ns) {
  // Legacy shim: moved to /apps/pserv/pserv-ram-upgrade.js
  ns.run("/apps/pserv/pserv-ram-upgrade.js", 1, ...ns.args);
}
