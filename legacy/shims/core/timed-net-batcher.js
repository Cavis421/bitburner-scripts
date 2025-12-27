/**
 * legacy/shims/core/timed-net-batcher.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/timed-net-batcher.js.
 *
 * Syntax
 *  run /bin/timed-net-batcher.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("legacy/shims/core/timed-net-batcher.js (deprecated)");
  ns.tprint("Use: run /bin/timed-net-batcher.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/timed-net-batcher.js");
  ns.run("/bin/timed-net-batcher.js", 1, ...flags._);
}
