/** @param {NS} ns */
export async function main(ns) {
    // Use flags to add --help without breaking positional usage.
    const flags = ns.flags([
        ["help", false],
    ]);

    // When --help is used, print help and exit.
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Preserve original positional arg:
    //   0: target
    const target = flags._[0];
    if (!target) return;

    await ns.grow(target);
}

function printHelp(ns) {
    ns.tprint("workers/hwgw/grow-worker.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Simple grow worker that calls ns.grow(target) once.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Typically launched by controller scripts or swarm managers.");
    ns.tprint("  Positional arguments are: target.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run batch/grow-worker.js [target] [--help]");
}
