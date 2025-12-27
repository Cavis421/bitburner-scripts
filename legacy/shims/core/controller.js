/**
 * /bin/controller.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Controller moved to /bin/controller.js.
 *
 * Syntax
 *  run /bin/controller.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("/bin/controller.js (deprecated)");
  ns.tprint("Use: run /bin/controller.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/controller.js");
  // Forward args
  ns.run("/bin/controller.js", 1, ...flags._);
}
