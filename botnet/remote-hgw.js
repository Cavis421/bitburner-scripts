/** botnet/remote-hgw.js
 * Simple HGW loop intended for NPC servers.
 * Tries to keep the target prepped: low security, high money.
 *
 * Usage:
 *   run botnet/remote-hgw.js <target> [mode]
 *   run botnet/remote-hgw.js <target> [mode] --help
 *   mode: "xp" (default) | "money"
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

    const target = flags._[0] || "n00dles";
    const mode = String(flags._[1] || "xp").toLowerCase();

    ns.print(`botnet/remote-hgw.js online for target: ${target} | Mode: ${mode.toUpperCase()}`);

    if (mode === "xp") {
        await runXpMode(ns, target);
        return; // unreachable, but explicit
    }

    // Default: money mode behavior (your existing logic)
    await runMoneyMode(ns, target);
}

/** XP mode: minimize security once, then weaken forever for maximum hacking XP/sec. */
async function runXpMode(ns, target) {
    // Prep: drive security to minimum so weaken time stays as low as possible
    while (true) {
        const sec = ns.getServerSecurityLevel(target);
        const minSec = ns.getServerMinSecurityLevel(target);

        // If we’re close enough to min, stop “prep” and enter steady-state.
        // (0.5 is just a small buffer to avoid bouncing on float precision.)
        if (sec <= minSec + 0.5) break;

        await ns.weaken(target);
    }

    // Steady-state: pure XP grind
    while (true) {
        await ns.weaken(target);
    }
}

/** Money mode: conservative prep -> hack. (Your existing policy preserved.) */
async function runMoneyMode(ns, target) {
    while (true) {
        const money    = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);
        const sec      = ns.getServerSecurityLevel(target);
        const minSec   = ns.getServerMinSecurityLevel(target);

        const moneyRatio = maxMoney > 0 ? money / maxMoney : 0;
        const secDelta   = sec - minSec;

        if (secDelta > 3) {
            await ns.weaken(target);
        } else if (moneyRatio < 0.98) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}

/** Print help/usage information for this script. */
function printHelp(ns) {
    ns.tprint("botnet/remote-hgw.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Per-server worker used by the botnet system.");
    ns.tprint("  Money mode keeps a target prepped (low security, high money).");
    ns.tprint("  XP mode is a pure hacking XP grind (weaken-focused).");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - Intended primarily for NPC servers (not home/pserv batchers).");
    ns.tprint("  - Mode controls behavior:");
    ns.tprint("      xp    = weaken-focused XP grind (prep to minSec, then weaken forever).");
    ns.tprint("      money = conservative hacking, prefers grow/weaken.");
    ns.tprint("  - Safe to run in many threads on the same host.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run botnet/remote-hgw.js <target> [mode]");
    ns.tprint("  run botnet/remote-hgw.js <target> [mode] --help");
    ns.tprint("");
    ns.tprint("Examples");
    ns.tprint("  run botnet/remote-hgw.js ecorp xp");
    ns.tprint("  run botnet/remote-hgw.js joesguns money");
    ns.tprint("  run botnet/remote-hgw.js foodnstuff xp --help");
}
// ------------------------------------------------------------