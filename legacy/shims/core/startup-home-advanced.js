/**
 * /bin/startup-home-advanced.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/startup-home-advanced.js.
 *
 * Syntax
 *  run /bin/startup-home-advanced.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("/bin/startup-home-advanced.js (deprecated)");
  ns.tprint("Use: run /bin/startup-home-advanced.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/startup-home-advanced.js");
  ns.run("/bin/startup-home-advanced.js", 1, ...flags._);
}
