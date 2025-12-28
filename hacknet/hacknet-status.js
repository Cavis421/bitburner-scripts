/** @param {NS} ns
 *
 * AUTO-GENERATED legacy compatibility shim.
 * Forwarding to: /bin/legacy-real/hacknet/hacknet-status.js
 */
export async function main(ns) {
  const args = ns.args || [];
  ns.spawn("/bin/legacy-real/hacknet/hacknet-status.js", 1, ...args);
}
