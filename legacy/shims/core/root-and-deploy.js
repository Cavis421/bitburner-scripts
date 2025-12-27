/**
 * legacy/shims/core/root-and-deploy.js (DEPRECATED SHIM)
 *
 * Description
 *  Compatibility shim. Script moved to /bin/root-and-deploy.js.
 *
 * Syntax
 *  run /bin/root-and-deploy.js
 */

/** @param {NS} ns */
export function printHelp(ns) {
  ns.tprint("legacy/shims/core/root-and-deploy.js (deprecated)");
  ns.tprint("Use: run /bin/root-and-deploy.js");
}

export async function main(ns) {
  const flags = ns.flags([["help", false]]);
  if (flags.help) return printHelp(ns);

  ns.tprint("[DEPRECATED] Use /bin/root-and-deploy.js");
  ns.run("/bin/root-and-deploy.js", 1, ...flags._);
}
