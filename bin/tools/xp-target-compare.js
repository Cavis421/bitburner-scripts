/** util/xp-target-compare.js
 * Compare XP-target candidates using the same heuristic as xp-all.js.
 *
 * Shows:
 *   - Required hacking level
 *   - Weaken time (min security, max money if Formulas.exe is present)
 *   - reqHack / weakenTime score
 *
 * Usage:
 *   run util/xp-target-compare.js
 *   run util/xp-target-compare.js max-hardware ecorp
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

    const targets = flags._.length > 0
        ? flags._
        : ["max-hardware", "ecorp", "fulcrumtech", "megacorp"];

    const useFormulas = hasFormulas(ns);
    const player = useFormulas ? ns.getPlayer() : null;

    ns.tprint("===============================================");
    ns.tprint("XP TARGET COMPARISON");
    ns.tprint("===============================================");
    ns.tprint(`Formulas.exe: ${useFormulas ? "YES" : "NO"}`);
    ns.tprint("");

    for (const host of targets) {
        if (!ns.serverExists(host)) {
            ns.tprint(`? ${host}: server does not exist`);
            continue;
        }
        if (!ns.hasRootAccess(host)) {
            ns.tprint(`? ${host}: no root access`);
            continue;
        }

        const reqHack = ns.getServerRequiredHackingLevel(host);
        let weakenTime = ns.getWeakenTime(host);

        if (useFormulas) {
            const s = ns.getServer(host);
            s.hackDifficulty = s.minDifficulty;
            s.moneyAvailable = s.moneyMax;

            weakenTime = ns.formulas.hacking.weakenTime(s, player);
        }

        const score = reqHack / weakenTime;

        ns.tprint("-----------------------------------------------");
        ns.tprint(`Server: ${host}`);
        ns.tprint(`  Required hack: ${reqHack}`);
        ns.tprint(`  Weaken time:   ${(weakenTime / 1000).toFixed(2)}s`);
        ns.tprint(`  XP score:      ${(score * 1000).toFixed(6)}  (reqHack / weakenTime)`);
    }

    ns.tprint("===============================================");
}

/** @param {NS} ns */
function printHelp(ns) {
    ns.tprint("bin/tools/xp-target-compare.js");
    ns.tprint("===============================================");
    ns.tprint("Description:");
    ns.tprint("  Compare servers using the XP target heuristic used by botnet/xp-all.js.");
    ns.tprint("");
    ns.tprint("Usage:");
    ns.tprint("  run util/xp-target-compare.js");
    ns.tprint("  run util/xp-target-compare.js <server1> <server2> ...");
    ns.tprint("");
    ns.tprint("Notes:");
    ns.tprint("  - Uses Formulas.exe if available for accurate weaken times.");
    ns.tprint("  - XP score is reqHack / weakenTime (higher is better).");
    ns.tprint("===============================================");
}

/** @param {NS} ns */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas?.hacking &&
            typeof ns.formulas.hacking.weakenTime === "function"
        );
    } catch (_e) {
        return false;
    }
}
