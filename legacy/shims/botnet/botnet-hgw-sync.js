/**
 * /bin/botnet-hgw-sync.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/botnet-hgw-sync.js.
 *
 * Syntax
 *  run /bin/botnet-hgw-sync.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("/bin/botnet-hgw-sync.js (deprecated)");
  ns.tprint("Use: run /bin/botnet-hgw-sync.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/botnet-hgw-sync.js");
  // Optional auto-forward:
  // ns.run("/bin/botnet-hgw-sync.js", 1, ...flags._);
}
