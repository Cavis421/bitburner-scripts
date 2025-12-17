/** botnet/remote-weaken-xp.js
 * Ultra-light XP worker: weaken-only loop for maximum hacking XP per RAM.
 *
 * Designed for end-game "set and forget" XP grinds (e.g., pushing to w0r1d_d43m0n / level 6000).
 * Intentionally avoids hack()/grow() so RAM cost stays low.
 *
 * Usage:
 *   run botnet/remote-weaken-xp.js <target> [mode]
 *   run botnet/remote-weaken-xp.js <target> [mode] --help
 *
 * Notes:
 *   - Arg1 "mode" is accepted for compatibility with botnet/xp-all.js and remote-hgw.js call style.
 *     It is ignored (XP is always weaken-only).
 *   - This script does not attempt to maintain money. Expect $0/sec and lots of hacking XP/sec.
 *
 * @param {NS} ns
 */
export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags([
        ["help", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Positional compatibility:
    //   arg0: target (default "n00dles")
    //   arg1: mode (ignored; usually "xp")
    const target = String(flags._[0] || "n00dles");
    const _mode = String(flags._[1] || "xp").toLowerCase(); // ignored intentionally

    ns.print(`botnet/remote-weaken-xp.js online for target: ${target} | Mode: XP (WEAKEN-ONLY)`);

    // Prep-to-min (optional but cheap): keep weaken time as low as possible.
    // Even if target is already at min, we just fall through instantly.
    while (true) {
        const sec = ns.getServerSecurityLevel(target);
        const minSec = ns.getServerMinSecurityLevel(target);

        if (sec <= minSec + 0.5) break;
        await ns.weaken(target);
    }

    // Steady-state: maximize XP per RAM via weaken spam.
    while (true) {
        await ns.weaken(target);
    }
}

/** @param {NS} ns */
function printHelp(ns) {
    const script = "botnet/remote-weaken-xp.js";

    ns.tprint("==============================================================");
    ns.tprint(`HELP — ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");

    ns.tprint("DESCRIPTION");
    ns.tprint("  Ultra-light XP worker that only runs weaken() in a loop.");
    ns.tprint("  This maximizes hacking XP/sec per GB of RAM.");
    ns.tprint("");

    ns.tprint("NOTES");
    ns.tprint("  - Accepts an optional [mode] arg for compatibility, but ignores it.");
    ns.tprint("  - Does not hack or grow; money production will be $0/sec.");
    ns.tprint("  - Great for end-game level pushes (e.g. 6000).");
    ns.tprint("");

    ns.tprint("SYNTAX");
    ns.tprint("  run botnet/remote-weaken-xp.js <target> [mode]");
    ns.tprint("  run botnet/remote-weaken-xp.js <target> [mode] --help");
    ns.tprint("");
}
