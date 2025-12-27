/**
 * /bin/basic-trader.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/basic-trader.js.
 *
 * Syntax
 *  run /bin/basic-trader.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("/bin/basic-trader.js (deprecated)");
  ns.tprint("Use: run /bin/basic-trader.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/basic-trader.js");
  // Optional auto-forward:
  // ns.run("/bin/basic-trader.js", 1, ...flags._);
}
