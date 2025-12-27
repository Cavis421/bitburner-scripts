/**
 * /bin/darkweb-auto-buyer.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/darkweb-auto-buyer.js.
 *
 * Syntax
 *  run /bin/darkweb-auto-buyer.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("/bin/darkweb-auto-buyer.js (deprecated)");
  ns.tprint("Use: run /bin/darkweb-auto-buyer.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/darkweb-auto-buyer.js");
  // Optional auto-forward:
  // ns.run("/bin/darkweb-auto-buyer.js", 1, ...flags._);
}
