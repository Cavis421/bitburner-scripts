/** @param {NS} ns
 *
 * AUTO-GENERATED legacy compatibility shim.
 * Forwarding to: /bin/legacy-real/pserv/pserv-process-report.js
 */
export async function main(ns) {
  const args = ns.args || [];
  ns.spawn("/bin/legacy-real/pserv/pserv-process-report.js", 1, ...args);
}
