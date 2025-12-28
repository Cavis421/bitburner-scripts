/** @param {NS} ns
 *
 * AUTO-GENERATED legacy compatibility shim.
 * Forwarding to: /bin/legacy-real/hacknet/hacknet-manager.js
 */
export async function main(ns) {
  const args = ns.args || [];
  ns.spawn("/bin/legacy-real/hacknet/hacknet-manager.js", 1, ...args);
}
