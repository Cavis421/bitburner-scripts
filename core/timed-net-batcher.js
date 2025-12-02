/** @param {NS} ns */

export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags([
        ["help", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    const target = flags._[0];
    if (!target) {
        ns.tprint("No batch target provided. core/timed-net-batcher.js requires a target server.");
        ns.tprint("");
        ns.tprint("Syntax");
        ns.tprint("  run core/timed-net-batcher.js <target>");
        ns.tprint("");
        ns.tprint("Example");
        ns.tprint("  run core/timed-net-batcher.js n00dles");
        return;
    }

    const hackScript   = "batch/batch-hack.js";
    const growScript   = "batch/batch-grow.js";
    const weakenScript = "batch/batch-weaken.js";

    for (const s of [hackScript, growScript, weakenScript]) {
        if (!ns.fileExists(s, "home")) {
            ns.tprint(`Missing script on home: ${s}`);
            return;
        }
    }

    const purchased = ns.getPurchasedServers();
    const hasPservs = purchased.length > 0;

    if (!hasPservs) {
        ns.tprint("No purchased servers found. Using HOME for full HWGW batches.");
        await runAllOnHome(ns, target, hackScript, growScript, weakenScript);
        return;
    }

    for (const host of purchased) {
        await ns.scp([hackScript, growScript, weakenScript], host);
    }

    ns.tprint(`Multi-batch HYBRID batcher targeting: ${target}`);
    ns.tprint(`HOME: hack only  |  PSERVs: grow + weaken`);

    // -- Timing setup -------------------------------------
    const tHack   = ns.getHackTime(target);
    const tGrow   = ns.getGrowTime(target);
    const tWeaken = ns.getWeakenTime(target);

    const GAP = 200; // ms
    const T   = tWeaken + 4 * GAP;

    const delayHack   = Math.max(0, T - 3 * GAP - tHack);
    const delayGrow   = Math.max(0, T - 2 * GAP - tGrow);
    const delayWeak1  = Math.max(0, T - 1 * GAP - tWeaken);
    const delayWeak2  = Math.max(0, T          - tWeaken);

    const cycleTime = T + GAP;
    const DESIRED_CONCURRENCY = 8;
    const batchInterval = Math.max(GAP, Math.floor(cycleTime / DESIRED_CONCURRENCY));

    ns.tprint(`Times (sec): H=${(tHack/1000).toFixed(1)}, G=${(tGrow/1000).toFixed(1)}, W=${(tWeaken/1000).toFixed(1)}`);
    ns.tprint(`Delays (sec): H=${(delayHack/1000).toFixed(1)}, G=${(delayGrow/1000).toFixed(1)}, W1=${(delayWeak1/1000).toFixed(1)}, W2=${(delayWeak2/1000).toFixed(1)}`);
    ns.tprint(`Base cycleTime: ${ns.tFormat(cycleTime)} (aiming for ${DESIRED_CONCURRENCY} overlapping batches)`);
    ns.tprint(`Launch interval: ${ns.tFormat(batchInterval)} per batch`);

    const basePlan = calcBaseThreads(ns, target);
    if (!basePlan) {
        ns.tprint("Failed to compute base batch plan.");
        return;
    }

    const hackRam   = ns.getScriptRam(hackScript);
    const growRam   = ns.getScriptRam(growScript);
    const weakenRam = ns.getScriptRam(weakenScript);

    const HOME_RAM_RESERVE = 256;     // GB kept free on home
    const MAX_HACK_FRACTION = 0.90;   // <= 90% of money in one wave

    let lastStatusPrint = 0;
    const STATUS_INTERVAL = 10 * 60 * 1000; // 10 minutes

    while (true) {
        const now = Date.now();

        // Optional: status pulse every STATUS_INTERVAL (if you already have something like this below,
        // keep your existing logic instead of this stub).
        if (now - lastStatusPrint >= STATUS_INTERVAL) {
            if (typeof printTargetStatus === "function") {
                printTargetStatus(ns, target);
            }
            lastStatusPrint = now;
        }

        // Existing hybrid-batch loop logic continues here in your file...
        // (keep your current allocation / scaling / ns.exec loop intact)
        // ...
        await ns.sleep(batchInterval);
    }
}

/**
 * Help text for core/timed-net-batcher.js
 * Only prints to terminal and exits; does not start any batches.
 */
function printHelp(ns) {
    ns.tprint("core/timed-net-batcher.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Time-aligned HWGW batch controller.");
    ns.tprint("  Uses home for hack threads and purchased servers for grow/weaken.");
    ns.tprint("  Falls back to a home-only HWGW loop when no purchased servers exist.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - Requires batch/batch-hack.js, batch/batch-grow.js, batch/batch-weaken.js on home.");
    ns.tprint("  - Expects the target server to be rooted and reasonably prepped.");
    ns.tprint("  - This is the \"classic\" hybrid batcher; timed-net-batcher2.js is the newer variant.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run core/timed-net-batcher.js <target> [--help]");
    ns.tprint("");
    ns.tprint("Examples");
    ns.tprint("  run core/timed-net-batcher.js n00dles");
    ns.tprint("  run core/timed-net-batcher.js omega-net");
}


// ------------------------------------------------
// BASE BATCH CALCULATION (per "unit" batch)
// ------------------------------------------------

function calcBaseThreads(ns, target) {
    const hackPercentTarget    = 0.05; // 5% per "unit" batch (scaled later)
    const hackPercentPerThread = ns.hackAnalyze(target);
    if (hackPercentPerThread <= 0) return null;

    let hackThreads = Math.floor(hackPercentTarget / hackPercentPerThread);
    if (hackThreads < 1) hackThreads = 1;

    const growMultiplier = 1 / (1 - hackPercentTarget);
    let growThreads = Math.ceil(ns.growthAnalyze(target, growMultiplier));
    if (growThreads < 1) growThreads = 1;

    const secFromHack = ns.hackAnalyzeSecurity(hackThreads);
    const secFromGrow = ns.growthAnalyzeSecurity(growThreads);
    const secTotal    = secFromHack + secFromGrow;

    const weakenPerThread = ns.weakenAnalyze(1);
    if (weakenPerThread <= 0) return null;

    let weakenThreads = Math.ceil(secTotal / weakenPerThread);

    return {
        baseHack: hackThreads,
        baseGrow: growThreads,
        baseWeak: weakenThreads,
    };
}

// ------------------------------------------------
// HYBRID SCALING: home = hack, pservs = grow+weaken
// ------------------------------------------------

function scaleHybridBatch(
    ns,
    target,
    base,
    homeFreeRam,
    totalPservFreeRam,
    hackRam,
    growRam,
    weakenRam,
    MAX_HACK_FRACTION
) {
    const { baseHack, baseGrow, baseWeak } = base;

    const ramHackUnit = baseHack * hackRam;
    const ramGWUnit =
        baseGrow * growRam +
        (2 * baseWeak) * weakenRam;

    let multHome  = Math.floor(homeFreeRam       / ramHackUnit);
    let multPserv = Math.floor(totalPservFreeRam / ramGWUnit);

    if (multHome < 1)  multHome  = 1;
    if (multPserv < 1) multPserv = 1;

    // Hack safety: never steal more than MAX_HACK_FRACTION per wave
    const pctPerHackThread = ns.hackAnalyze(target);
    const basePct          = baseHack * pctPerHackThread;

    let safeMult = multHome;
    if (basePct > 0) {
        const m = Math.floor(MAX_HACK_FRACTION / basePct);
        if (m > 0) safeMult = Math.min(safeMult, m);
    }

    const mult = Math.max(1, Math.min(multHome, multPserv, safeMult));

    const hackThreads    = Math.max(1, baseHack * mult);
    const growThreads    = Math.max(1, baseGrow * mult);
    const weaken1Threads = Math.max(1, baseWeak * mult);
    const weaken2Threads = Math.max(1, baseWeak * mult);

    return { hackThreads, growThreads, weaken1Threads, weaken2Threads };
}

// ------------------------------------------------
// GENERIC ALLOCATION ACROSS HOSTS
// ------------------------------------------------

function allocToHosts(ns, hosts, script, target, threadsNeeded, delay, extraArg = null) {
    if (threadsNeeded <= 0) return;
    if (!hosts || hosts.length === 0) return;

    const ramPerThread = ns.getScriptRam(script);

    for (const h of hosts) {
        if (threadsNeeded <= 0) break;

        const maxThreadsHere = Math.floor(h.freeRam / ramPerThread);
        if (maxThreadsHere <= 0) continue;

        const allocate = Math.min(maxThreadsHere, threadsNeeded);

        const pid = extraArg == null
            ? ns.exec(script, h.host, allocate, target, delay)
            : ns.exec(script, h.host, allocate, target, delay, extraArg);

        if (pid !== 0) {
            h.freeRam -= allocate * ramPerThread;
            threadsNeeded -= allocate;
        }
    }
}

// ------------------------------------------------
// STATUS & HELPERS
// ------------------------------------------------

function printTargetStatus(ns, target) {
    const money   = ns.getServerMoneyAvailable(target);
    const max     = ns.getServerMaxMoney(target);
    const sec     = ns.getServerSecurityLevel(target);
    const minSec  = ns.getServerMinSecurityLevel(target);

    const moneyPct = max > 0 ? (money / max) * 100 : 0;
    const secDelta = sec - minSec;

    const now = new Date();
    const ts = now.toLocaleTimeString();

    ns.print("--------------------------------------");
    ns.print(`?? TARGET STATUS � ${target} @ ${ts}`);
    ns.print(`?? Money:       ${ns.nFormat(money, "$0.00a")} / ${ns.nFormat(max, "$0.00a")} (${moneyPct.toFixed(2)}%)`);
    ns.print(`?? Security:     ${sec.toFixed(2)} (min ${minSec.toFixed(2)})  ?=${secDelta.toFixed(2)}`);
    ns.print("--------------------------------------");
}

function shuffleArray(ns, arr) {
    // Simple Fisher�Yates; ns used just to avoid unused param warnings if you like
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

// ------------------------------------------------
// FALLBACK: classic full HWGW on home only
// ------------------------------------------------

async function runAllOnHome(ns, target, hackScript, growScript, weakenScript) {
    const tHack   = ns.getHackTime(target);
    const tGrow   = ns.getGrowTime(target);
    const tWeaken = ns.getWeakenTime(target);

    const GAP = 200; // ms
    const T = tWeaken + 4 * GAP;

    const delayHack   = Math.max(0, T - 3 * GAP - tHack);
    const delayGrow   = Math.max(0, T - 2 * GAP - tGrow);
    const delayWeak1  = Math.max(0, T - 1 * GAP - tWeaken);
    const delayWeak2  = Math.max(0, T          - tWeaken);

    const cycleTime = T + GAP;
    const DESIRED_CONCURRENCY = 8;
    const batchInterval = Math.max(GAP, Math.floor(cycleTime / DESIRED_CONCURRENCY));

    ns.tprint(`? Times (sec): H=${(tHack/1000).toFixed(1)}, G=${(tGrow/1000).toFixed(1)}, W=${(tWeaken/1000).toFixed(1)}`);
    ns.tprint(`? Delays (sec): H=${(delayHack/1000).toFixed(1)}, G=${(delayGrow/1000).toFixed(1)}, W1=${(delayWeak1/1000).toFixed(1)}, W2=${(delayWeak2/1000).toFixed(1)}`);
    ns.tprint(`?? Base cycleTime: ${ns.tFormat(cycleTime)} (aiming for ${DESIRED_CONCURRENCY} overlapping batches)`);
    ns.tprint(`?? Launch interval: ${ns.tFormat(batchInterval)} per batch`);
    ns.tprint("?? Single-host mode: HOME running full HWGW.");

    const basePlan = calcBaseThreads(ns, target);
    if (!basePlan) {
        ns.tprint("? Failed to compute base batch plan.");
        return;
    }

    const hackRam   = ns.getScriptRam(hackScript);
    const growRam   = ns.getScriptRam(growScript);
    const weakenRam = ns.getScriptRam(weakenScript);

    const minRamNeeded =
        hackRam + growRam + (2 * weakenRam);

    const HOME_RAM_RESERVE = 256;
    const MAX_HACK_FRACTION = 0.90;

    while (true) {
        const maxRam  = ns.getServerMaxRam("home");
        const usedRam = ns.getServerUsedRam("home");
        let freeRam   = maxRam - usedRam - HOME_RAM_RESERVE;
        if (freeRam < 0) freeRam = 0;

        if (freeRam < minRamNeeded) {
            ns.print("?? Insufficient RAM on home for even 1 minimal batch. Retrying...");
            await ns.sleep(batchInterval);
            continue;
        }

        const { baseHack, baseGrow, baseWeak } = basePlan;

        const ramBase =
            baseHack * hackRam +
            baseGrow * growRam +
            (2 * baseWeak) * weakenRam;

        let mult = Math.floor(freeRam / ramBase);
        if (mult < 1) mult = 1;

        const pctPerHackThread = ns.hackAnalyze(target);
        const basePct          = baseHack * pctPerHackThread;

        if (basePct > 0) {
            const safeMult = Math.floor(MAX_HACK_FRACTION / basePct);
            if (safeMult > 0 && safeMult < mult) mult = safeMult;
        }

        const hackThreads    = Math.max(1, baseHack * mult);
        const growThreads    = Math.max(1, baseGrow * mult);
        const weaken1Threads = Math.max(1, baseWeak * mult);
        const weaken2Threads = Math.max(1, baseWeak * mult);

        const ramUsed =
            hackThreads * hackRam +
            growThreads * growRam +
            (weaken1Threads + weaken2Threads) * weakenRam;

        ns.print(
            `?? Home batch: ` +
            `H=${hackThreads}, G=${growThreads}, ` +
            `W1=${weaken1Threads}, W2=${weaken2Threads} ` +
            `(RAM=${ramUsed.toFixed(1)}GB)`
        );

        const host = { host: "home", freeRam };

        allocToHosts(ns, [host], weakenScript, target, weaken1Threads, delayWeak1);
        allocToHosts(ns, [host], hackScript,   target, hackThreads,    delayHack, tHack);
        allocToHosts(ns, [host], growScript,   target, growThreads,    delayGrow);
        allocToHosts(ns, [host], weakenScript, target, weaken2Threads, delayWeak2);

        await ns.sleep(batchInterval);
    }
}