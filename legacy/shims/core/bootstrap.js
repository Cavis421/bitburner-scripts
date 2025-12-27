/**
 * legacy/shims/core/bootstrap.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/bootstrap.js.
 *
 * Syntax
 *  run /bin/bootstrap.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("legacy/shims/core/bootstrap.js (deprecated)");
  ns.tprint("Use: run /bin/bootstrap.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/bootstrap.js");
  ns.run("/bin/bootstrap.js", 1, ...flags._);
}
