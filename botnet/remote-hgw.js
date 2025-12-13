/** botnet/remote-hgw.js
 * Simple HGW loop intended for NPC servers.
 * Tries to keep the target prepped: low security, high money.
 *
 * Usage:
 *   run botnet/remote-hgw.js <target> [mode]
 *   run botnet/remote-hgw.js <target> [mode] --help
 *   mode: "xp" (default) | "money"
 *
 * This script is intentionally "dumb but safe" so it plays nicely
 * alongside the more advanced batcher running on home + pservs.
 * All threads on a host share the same simple decision loop.
 *
 * @param {NS} ns
 */
export async function main(ns) {
    ns.disableLog("ALL");

    // Parse flags so we can support --help without breaking positional args.
    const flags = ns.flags([
        ["help", false],
    ]);

    // If help was requested, print usage and exit.
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Preserve original positional behavior:
    //   arg0: target (default "n00dles")
    //   arg1: mode   (default "xp", case-insensitive)
    const target = flags._[0] || "n00dles";
    const mode = String(flags._[1] || "xp").toLowerCase();

    ns.print(
        `botnet/remote-hgw.js online for target: ${target} | Mode: ${mode.toUpperCase()}`
    );

    while (true) {
        const money    = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);
        const sec      = ns.getServerSecurityLevel(target);
        const minSec   = ns.getServerMinSecurityLevel(target);

        const moneyRatio = maxMoney > 0 ? money / maxMoney : 0;
        const secDelta   = sec - minSec;

        // Mode-aware policy:
        //   XP mode (default): keep behavior similar to original:
        //     - If security is quite elevated, weaken.
        //     - Else if money is low, grow.
        //     - Otherwise, hack.
        //
        //   MONEY mode: be more conservative on hacking:
        //     - Weaken a bit earlier.
        //     - Grow until we're almost at max money.
        //     - Hack only when target is very "fat".
        if (mode === "money") {
            if (secDelta > 3) {
                await ns.weaken(target);
            } else if (moneyRatio < 0.98) {
                await ns.grow(target);
            } else {
                await ns.hack(target);
            }
        } else {
            if (secDelta > 5) {
                await ns.weaken(target);
            } else if (moneyRatio < 0.9) {
                await ns.grow(target);
            } else {
                await ns.hack(target);
            }
        }
    }
}

/** Print help/usage information for this script. */
function printHelp(ns) {
    ns.tprint("botnet/remote-hgw.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Per-server HGW worker used by the botnet system.");
    ns.tprint("  Keeps a target prepped (low security, high money) in a simple loop.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - Intended primarily for NPC servers (not home/pserv batchers).");
    ns.tprint("  - Mode controls behavior:");
    ns.tprint("      xp    = classic HGW with frequent hacks for experience.");
    ns.tprint("      money = more conservative hacking, prefers grow/weaken.");
    ns.tprint("  - Safe to run in many threads on the same host.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run botnet/remote-hgw.js <target> [mode]");
    ns.tprint("  run botnet/remote-hgw.js <target> [mode] --help");
    ns.tprint("");
    ns.tprint("Examples");
    ns.tprint("  run botnet/remote-hgw.js n00dles");
    ns.tprint("  run botnet/remote-hgw.js joesguns money");
    ns.tprint("  run botnet/remote-hgw.js foodnstuff xp --help");
}
