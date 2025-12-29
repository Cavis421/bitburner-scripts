export async function main(ns) {
  // Legacy shim: moved to /apps/pserv/pserv-process-report.js
  ns.run("/apps/pserv/pserv-process-report.js", 1, ...ns.args);
}
