/**
 * legacy/shims/core/net-hwgw-batcher.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/net-hwgw-batcher.js.
 *
 * Syntax
 *  run /bin/net-hwgw-batcher.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("legacy/shims/core/net-hwgw-batcher.js (deprecated)");
  ns.tprint("Use: run /bin/net-hwgw-batcher.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/net-hwgw-batcher.js");
  ns.run("/bin/net-hwgw-batcher.js", 1, ...flags._);
}
