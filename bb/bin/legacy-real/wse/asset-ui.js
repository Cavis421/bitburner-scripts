export async function main(ns) {
  // Legacy shim: moved to /bin/ui/asset-ui.js
  ns.run("/bin/ui/asset-ui.js", 1, ...ns.args);
}
