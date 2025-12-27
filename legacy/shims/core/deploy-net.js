/**
 * legacy/shims/core/deploy-net.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/deploy-net.js.
 *
 * Syntax
 *  run /bin/deploy-net.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("legacy/shims/core/deploy-net.js (deprecated)");
  ns.tprint("Use: run /bin/deploy-net.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/deploy-net.js");
  ns.run("/bin/deploy-net.js", 1, ...flags._);
}
