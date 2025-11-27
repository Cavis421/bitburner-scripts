/** botnet/remote-hgw.js
 * Simple HGW loop intended for NPC servers.
 * Tries to keep the target prepped: low security, high money.
 *
 * Usage:
 *   run botnet/remote-hgw.js <target> [mode]
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

    const target = ns.args[0] || "n00dles";
    const mode = String(ns.args[1] || "xp").toLowerCase();
    ns.print(`?? botnet/remote-hgw.js online for target: ${target} | Mode: ${mode.toUpperCase()}`);

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