/**
 * legacy/shims/core/root-all.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/root-all.js.
 *
 * Syntax
 *  run /bin/root-all.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("legacy/shims/core/root-all.js (deprecated)");
  ns.tprint("Use: run /bin/root-all.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/root-all.js");
  ns.run("/bin/root-all.js", 1, ...flags._);
}
