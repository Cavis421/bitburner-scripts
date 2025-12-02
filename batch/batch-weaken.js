/** @param {NS} ns **/
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

    // Preserve original positional args:
    //   0: target
    //   1: startDelay (ms)
    //   2: expectedWeakenTime (ms)
    const target = flags._[0];
    const startDelay = Number(flags._[1] ?? 0);
    const expectedTime = Number(flags._[2] ?? 0);

    if (!target) return;

    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.weaken(target);
    const end = performance.now();

    const actual = end - start;
    const drift = expectedTime - actual;

    if (drift > 1) await ns.sleep(drift);
}

function printHelp(ns) {
    ns.tprint("batch/batch-weaken.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Timed weaken worker used by batch controllers in HWGW pipelines.");
    ns.tprint("  Supports an optional start delay and expected run time for drift correction.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Usually launched automatically by controller scripts rather than the terminal.");
    ns.tprint("  Positional arguments are: target, startDelay(ms), expectedWeakenTime(ms).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run batch/batch-weaken.js [target] [startDelay] [expectedWeakenTime] [--help]");
}
