import { findPath } from '/lib/network.js';

/** @param {NS} ns */
export async function main(ns) {
    // Add --help without breaking positional usage
    const flags = ns.flags([
        ["help", false],
    ]);

    // Print help and exit immediately
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Script expects exactly one positional argument: target hostname
    if (flags._.length !== 1) {
        ns.tprint("Incorrect usage. See help below.\n");
        printHelp(ns);
        return;
    }

    const target = flags._[0];
    const start = "home";

    const path = await findPath(ns, target, start);
    if (path === null) {
        ns.tprint(`find: target "${target}" is not reachable from "${start}"`);
        return;
    }

    ns.tprint(`Path to ${target}:`);
    ns.tprint(path.join(" -> "));
}

function printHelp(ns) {
    ns.tprint("bin/find.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Locate a host by name and print the navigation path from home.");
    ns.tprint("  Uses the BFS-based findPath() function from lib/network.js.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Requires an exact hostname. Returns the path from home.");
    ns.tprint("  Positional arguments must contain exactly one target name.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run bin/find.js <hostname> [--help]");
}
