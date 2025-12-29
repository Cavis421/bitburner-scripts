export async function main(ns) {
  // Legacy shim: moved to /bin/ui/pserv-status.js
  ns.run("/bin/ui/pserv-status.js", 1, ...ns.args);
}
