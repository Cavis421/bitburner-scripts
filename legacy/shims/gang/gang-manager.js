/**
 * /bin/gang-manager.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/gang-manager.js.
 *
 * Syntax
 *  run /bin/gang-manager.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("/bin/gang-manager.js (deprecated)");
  ns.tprint("Use: run /bin/gang-manager.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/gang-manager.js");
  // Optional auto-forward:
  // ns.run("/bin/gang-manager.js", 1, ...flags._);
}
