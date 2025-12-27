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

    await ns.weaken(target);
}

function printHelp(ns) {
    ns.tprint("workers/hwgw/weaken-worker.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Simple weaken worker that calls ns.weaken(target) once.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Usually launched by batch controllers or automation scripts.");
    ns.tprint("  Positional arguments are: target.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run batch/weaken-worker.js [target] [--help]");
}
