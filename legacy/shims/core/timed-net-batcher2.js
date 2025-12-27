/**
 * /bin/timed-net-batcher2.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/timed-net-batcher2.js.
 *
 * Syntax
 *  run /bin/timed-net-batcher2.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("/bin/timed-net-batcher2.js (deprecated)");
  ns.tprint("Use: run /bin/timed-net-batcher2.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/timed-net-batcher2.js");
  // Forward args (important for batcher)
  ns.run("/bin/timed-net-batcher2.js", 1, ...flags._);
}
