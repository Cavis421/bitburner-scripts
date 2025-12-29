/**
 * /bin/early-money.js
 *
 * Description
 *  Ultra-light early-game daemon.
 *  Generates starter cash while home MAX RAM is below a threshold.
 *  Intended to be run by /bin/bootstrap.js as Stage A.
 *
 * Notes
 *  - Very low RAM usage (no imports).
 *  - Exits cleanly once home MAX RAM reaches the threshold (bootstrap will switch stages).
 *
 * Syntax
 *  run /bin/early-money.js
 *  run /bin/early-money.js --target n00dles --stopAtRam 64
 *  run /bin/early-money.js --mode crime
 *  run /bin/early-money.js --help
 */

/** @param {NS} ns */
const FLAGS = [
    ["help", false],

    // Early money behavior
    ["mode", "auto"],      // auto | crime | hack
    ["target", "n00dles"],
    ["sleep", 200],

    // Exit condition (handed off by bootstrap)
    ["stopAtRam", 64],     // home MAX RAM at/above this -> exit
];

export async function main(ns) {
    const flags = ns.flags(FLAGS);
    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    const mode = String(flags.mode || "auto").toLowerCase();
    const target = String(flags.target || "n00dles");
    const sleep = Math.max(50, Number(flags.sleep) || 200);
    const stopAtRam = Math.max(1, Number(flags.stopAtRam) || 64);

    while (true) {
        // Exit when bootstrap should switch you to Stage B
        const homeRam = ns.getServerMaxRam("home");
        if (homeRam >= stopAtRam) {
            ns.tprint(`[early] Home MAX RAM ${homeRam}GB >= ${stopAtRam}GB → exiting (bootstrap will switch stages)`);
            return;
        }

        // Generate early money
        let didWork = false;
        if (mode === "crime") {
            didWork = await doCrime(ns);
        } else if (mode === "hack") {
            didWork = await doHack(ns, target);
        } else {
            didWork = (await doCrime(ns)) || (await doHack(ns, target));
        }

        await ns.sleep(didWork ? sleep : 1000);
    }
}

// -----------------------------------------------------------------------------
// Early money helpers
// -----------------------------------------------------------------------------

async function doCrime(ns) {
    if (!ns.singularity || typeof ns.singularity.commitCrime !== "function") return false;

    // Mug is reliable early; low failure cost
    const t = ns.singularity.commitCrime("Mug", false);
    if (!t) return false;

    await ns.sleep(Math.max(50, Number(t) || 0));
    return true;
}

async function doHack(ns, target) {
    try {
        if (!ns.hasRootAccess(target)) return false;
        await ns.hack(target);
        return true;
    } catch {
        return false;
    }
}

/** @param {NS} ns */
function printHelp(ns) {
    ns.tprint("/bin/early-money.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Ultra-light early daemon that generates starter cash.");
    ns.tprint("  Exits once home MAX RAM reaches a threshold (bootstrap will switch stages).");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - Intended to be run by /bin/bootstrap.js as Stage A.");
    ns.tprint("  - No imports; minimal RAM footprint.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run /bin/early-money.js");
    ns.tprint("  run /bin/early-money.js --stopAtRam 64");
    ns.tprint("  run /bin/early-money.js --mode crime");
    ns.tprint("  run /bin/early-money.js --help");
    ns.tprint("");
    ns.tprint("Flags");
    ns.tprint("  --mode auto|crime|hack     Money strategy (default auto)");
    ns.tprint("  --target <host>            Hack target (default n00dles)");
    ns.tprint("  --sleep <ms>               Loop delay (default 200)");
    ns.tprint("  --stopAtRam <gb>           Exit when home MAX RAM >= this (default 64)");
}
