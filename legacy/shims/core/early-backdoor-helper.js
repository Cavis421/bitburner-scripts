/**
 * legacy/shims/core/early-backdoor-helper.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/early-backdoor-helper.js.
 *
 * Syntax
 *  run /bin/early-backdoor-helper.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("legacy/shims/core/early-backdoor-helper.js (deprecated)");
  ns.tprint("Use: run /bin/early-backdoor-helper.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/early-backdoor-helper.js");
  ns.run("/bin/early-backdoor-helper.js", 1, ...flags._);
}
