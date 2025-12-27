/**
 * legacy/shims/core/early-batcher.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/early-batcher.js.
 *
 * Syntax
 *  run /bin/early-batcher.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("legacy/shims/core/early-batcher.js (deprecated)");
  ns.tprint("Use: run /bin/early-batcher.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/early-batcher.js");
  ns.run("/bin/early-batcher.js", 1, ...flags._);
}
