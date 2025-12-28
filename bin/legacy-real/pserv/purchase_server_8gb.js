export async function main(ns) {
  // Legacy shim: moved to /apps/pserv/purchase_server_8gb.js
  ns.run("/apps/pserv/purchase_server_8gb.js", 1, ...ns.args);
}
