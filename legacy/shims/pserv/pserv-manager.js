/**
 * /bin/pserv-manager.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/pserv-manager.js.
 *
 * Syntax
 *  run /bin/pserv-manager.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("/bin/pserv-manager.js (deprecated)");
  ns.tprint("Use: run /bin/pserv-manager.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/pserv-manager.js");
  // Optional auto-forward:
  // ns.run("/bin/pserv-manager.js", 1, ...flags._);
}
