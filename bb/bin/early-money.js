/**
 * /bin/early-money.js
 *
 * Description
 *  Ultra-light early-game money script for low-RAM homes.
 *  Runs a simple HWG loop on a single target with no imports and no Singularity.
 *  Exits cleanly once home MAX RAM reaches a threshold (bootstrap handles stage switching).
 *
 * Notes
 *  - Designed to be launched by /bin/bootstrap.js as Stage A.
 *  - Avoids ns.singularity entirely to keep RAM very low.
 *  - If you don't have root on the target yet, it will idle until you do.
 *
 * Syntax
 *  run /bin/early-money.js
 *  run /bin/early-money.js --target n00dles --stopAtRam 64
 *  run /bin/early-money.js --minMoneyFrac 0.85 --maxSecDelta 5
 *  run /bin/early-money.js --help
 */

/** @param {NS} ns */
const FLAGS = [
    ["help", false],

    // Target + behavior
    ["target", "n00dles"],
    ["minMoneyFrac", 0.85], // grow until money >= this * maxMoney
    ["maxSecDelta", 5],     // weaken until (sec - minSec) <= this

    // Timing / exit
    ["sleep", 200],
    ["stopAtRam", 64],      // exit when home MAX RAM >= this (bootstrap will switch stages)
];

export async function main(ns) {
    const flags = ns.flags(FLAGS);
    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    const target = String(flags.target || "n00dles");
    const minMoneyFrac = clamp01(Number(flags.minMoneyFrac ?? 0.85));
    const maxSecDelta = Math.max(0, Number(flags.maxSecDelta ?? 5));
    const sleep = Math.max(50, Number(flags.sleep) || 200);
    const stopAtRam = Math.max(1, Number(flags.stopAtRam) || 64);

    while (true) {
        // Exit condition (bootstrap handles next stage)
        const homeMax = ns.getServerMaxRam("home");
        if (homeMax >= stopAtRam) {
            ns.tprint(`[early] Home MAX RAM ${homeMax}GB >= ${stopAtRam}GB -> exiting (bootstrap will switch stages)`);
            return;
        }

        // If we can't hack the target yet, do nothing (cheap idle)
        if (!safeBool(() => ns.hasRootAccess(target), false)) {
            await ns.sleep(1000);
            continue;
        }

        // Decide action based on server state
        const maxMoney = safeNum(() => ns.getServerMaxMoney(target), 0);
        const money = safeNum(() => ns.getServerMoneyAvailable(target), 0);
        const minSec = safeNum(() => ns.getServerMinSecurityLevel(target), 1);
        const sec = safeNum(() => ns.getServerSecurityLevel(target), minSec);
        const secDelta = sec - minSec;

        if (secDelta > maxSecDelta) {
            await ns.weaken(target);
            await ns.sleep(sleep);
            continue;
        }

        if (maxMoney > 0 && money / maxMoney < minMoneyFrac) {
            await ns.grow(target);
            await ns.sleep(sleep);
            continue;
        }

        // Otherwise hack for cash
        await ns.hack(target);
        await ns.sleep(sleep);
    }
}

// ------------------------------------------------------------
// Utils
// ------------------------------------------------------------

function clamp01(x) {
    x = Number(x);
    if (!Number.isFinite(x)) return 0;
    return Math.min(1, Math.max(0, x));
}

function safeNum(fn, fallback) {
    try {
        const v = Number(fn());
        return Number.isFinite(v) ? v : fallback;
    } catch {
        return fallback;
    }
}

function safeBool(fn, fallback) {
    try { return Boolean(fn()); } catch { return fallback; }
}

/** @param {NS} ns */
function printHelp(ns) {
    ns.tprint("/bin/early-money.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Ultra-light early-game money script for low-RAM homes.");
    ns.tprint("  Runs a simple HWG loop on one target with no imports and no Singularity.");
    ns.tprint("  Exits once home MAX RAM reaches a threshold (bootstrap handles stage switching).");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - If you do not have root on the target yet, it will idle.");
    ns.tprint("  - Keep this tiny: do NOT add ns.singularity calls here (they are RAM-expensive).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run /bin/early-money.js");
    ns.tprint("  run /bin/early-money.js --target n00dles --stopAtRam 64");
    ns.tprint("  run /bin/early-money.js --minMoneyFrac 0.9 --maxSecDelta 2");
    ns.tprint("  run /bin/early-money.js --help");
    ns.tprint("");
    ns.tprint("Flags");
    ns.tprint("  --target <host>            Target to farm (default n00dles)");
    ns.tprint("  --minMoneyFrac <0..1>      Grow until money >= frac*max (default 0.85)");
    ns.tprint("  --maxSecDelta <n>          Weaken until sec-minSec <= n (default 5)");
    ns.tprint("  --sleep <ms>               Extra delay between cycles (default 200)");
    ns.tprint("  --stopAtRam <gb>           Exit when home MAX RAM >= this (default 64)");
}
