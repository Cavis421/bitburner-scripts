/** @param {NS} ns **/
export async function main(ns) {
    // Use flags so we can support --help without breaking existing positional usage.
    // Existing callers that pass only positional args are preserved via flags._.
    const flags = ns.flags([
        ["help", false],
    ]);

    // If called with --help, print help text and exit immediately.
    // Do NOT run grow logic or propagate this flag to any children.
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Original positional arguments, now read from flags._ to keep behavior identical:
    //   0: target (string)
    //   1: startDelay (ms, number)
    //   2: expectedTime (ms, grow time, number)
    const target = flags._[0];
    const startDelay = Number(flags._[1] ?? 0);
    const expectedTime = Number(flags._[2] ?? 0); // grow time

    if (!target) return;

    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.grow(target);
    const end = performance.now();

    const drift = expectedTime - (end - start);
    if (drift > 1) await ns.sleep(drift);
}

function printHelp(ns) {
    ns.tprint("batch/batch-grow.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Grow worker used by batch controllers in HWGW pipelines.");
    ns.tprint("  Supports an optional start delay and expected run time for drift correction.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Typically launched by controller scripts, not directly from the terminal.");
    ns.tprint("  Positional arguments are: target, startDelay(ms), expectedGrowTime(ms).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run batch/batch-grow.js [target] [startDelay] [expectedGrowTime] [--help]");
}
