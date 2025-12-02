/** @param {NS} ns **/
export async function main(ns) {
    // Use flags so we can support a --help flag without breaking existing positional usage.
    // Existing callers that pass only positional args are preserved via flags._.
    const flags = ns.flags([
        ["help", false],
    ]);

    // If called with --help, print help text and exit immediately.
    // Do NOT run hack logic or propagate this flag to any children.
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Original positional arguments, now read from flags._ to keep behavior identical:
    //   0: target (string)
    //   1: startDelay (ms, number)
    //   2: expectedTime (ms, hack time, number)
    const target = flags._[0];
    const startDelay = Number(flags._[1] ?? 0);
    const expectedTime = Number(flags._[2] ?? 0);  // MUST be hack time

    if (!target) return;

    // Delay until batch start
    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.hack(target);
    const end = performance.now();

    const actual = end - start;
    const drift = expectedTime - actual;

    if (drift > 1) await ns.sleep(drift);
}


function printHelp(ns) {
    ns.tprint("batch/batch-hack.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Timed hack worker used by batch controllers in HWGW pipelines.");
    ns.tprint("  Supports an optional start delay and expected run time for drift correction.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Typically launched by controller scripts, not directly from the terminal.");
    ns.tprint("  Positional arguments are: target, startDelay(ms), expectedHackTime(ms).");
    ns.tprint("  The expected time should match the hack time used by the batch controller.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run batch/batch-hack.js [target] [startDelay] [expectedHackTime] [--help]");
}
