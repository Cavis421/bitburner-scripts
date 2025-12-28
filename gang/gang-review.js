/** @param {NS} ns
 *
 * AUTO-GENERATED legacy compatibility shim.
 * Forwarding to: /bin/legacy-real/gang/gang-review.js
 */
export async function main(ns) {
  const args = ns.args || [];
  ns.spawn("/bin/legacy-real/gang/gang-review.js", 1, ...args);
}
