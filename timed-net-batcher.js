/** @param {NS} ns */

export async function main(ns) {
    ns.disableLog("ALL");

    const target = ns.args[0];
    if (!target) {
        ns.tprint("❌ No batch target provided! (timed-net-batcher.js needs one)");
        ns.tprint("   Example: run timed-net-batcher.js n00dles");
        return;
    }

    const hackScript   = "batch-hack.js";
    const growScript   = "batch-grow.js";
    const weakenScript = "batch-weaken.js";

    for (const s of [hackScript, growScript, weakenScript]) {
        if (!ns.fileExists(s, "home")) {
            ns.tprint(`❌ Missing script on home: ${s}`);
            return;
        }
    }

    const purchased = ns.getPurchasedServers();
    const hasPservs = purchased.length > 0;

    if (!hasPservs) {
        ns.tprint("⚠️ No purchased servers found. Using HOME for full HWGW batches.");
        await runAllOnHome(ns, target, hackScript, growScript, weakenScript);
        return;
    }

    for (const host of purchased) {
        await ns.scp([hackScript, growScript, weakenScript], host);
    }

    ns.tprint(`🎯 Multi-batch HYBRID batcher targeting: ${target}`);
    ns.tprint(`🏠 HOME: hack only  |  🛰 PSERVs: grow + weaken`);

    // ── Timing setup ─────────────────────────────────────
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

    ns.tprint(`⏱ Times (sec): H=${(tHack/1000).toFixed(1)}, G=${(tGrow/1000).toFixed(1)}, W=${(tWeaken/1000).toFixed(1)}`);
    ns.tprint(`⏱ Delays (sec): H=${(delayHack/1000).toFixed(1)}, G=${(delayGrow/1000).toFixed(1)}, W1=${(delayWeak1/1000).toFixed(1)}, W2=${(delayWeak2/1000).toFixed(1)}`);
    ns.tprint(`🔁 Base cycleTime: ${ns.tFormat(cycleTime)} (aiming for ${DESIRED_CONCURRENCY} overlapping batches)`);
    ns.tprint(`📡 Launch interval: ${ns.tFormat(batchInterval)} per batch`);

    const basePlan = calcBaseThreads(ns, target);
    if (!basePlan) {
        ns.tprint("❌ Failed to compute base batch plan.");
        return;
    }

    const hackRam   = ns.getScriptRam(hackScript);
    const growRam   = ns.getScriptRam(growScript);
    const weakenRam = ns.getScriptRam(weakenScript);

    const HOME_RAM_RESERVE = 256;     // GB kept free on home
    const MAX_HACK_FRACTION = 0.90;   // <= 90% of money in one wave
    const STATUS_INTERVAL = 10 * 60 * 1000; // 10 minutes

    let lastStatusPrint = 0;

    while (true) {
        const now = Date.now();

        // ── Periodic target status (logs only) ─────────────
        if (now - lastStatusPrint >= STATUS_INTERVAL) {
            printTargetStatus(ns, target);
            lastStatusPrint = now;
        }

        // ── RAM snapshot ───────────────────────────────────
        const homeMax  = ns.getServerMaxRam("home");
        const homeUsed = ns.getServerUsedRam("home");
        let homeFree   = homeMax - homeUsed - HOME_RAM_RESERVE;
        if (homeFree < 0) homeFree = 0;

        const pservHosts = [];
        let totalPservFree = 0;
        for (const h of purchased) {
            const maxRam  = ns.getServerMaxRam(h);
            const usedRam = ns.getServerUsedRam(h);
            const freeRam = Math.max(0, maxRam - usedRam);
            if (freeRam > 0) {
                pservHosts.push({ host: h, freeRam });
                totalPservFree += freeRam;
            }
        }

        if (homeFree < hackRam || totalPservFree < (growRam + 2 * weakenRam)) {
            ns.print("⚠️ Not enough RAM (home or pservs) for even a minimal hybrid batch. Retrying...");
            await ns.sleep(batchInterval);
            continue;
        }

        // ── Scale threads with hybrid constraints ─────────
        const {
            hackThreads,
            growThreads,
            weaken1Threads,
            weaken2Threads
        } = scaleHybridBatch(
            ns,
            target,
            basePlan,
            homeFree,
            totalPservFree,
            hackRam,
            growRam,
            weakenRam,
            MAX_HACK_FRACTION
        );

        const ramHackHome =
            hackThreads * hackRam;
        const ramGWOnPservs =
            growThreads * growRam +
            (weaken1Threads + weaken2Threads) * weakenRam;

        ns.print(
            `🚀 Hybrid batch: ` +
            `H=${hackThreads} (home ${ramHackHome.toFixed(1)}GB), ` +
            `G=${growThreads}, W1=${weaken1Threads}, W2=${weaken2Threads} ` +
            `(pserv RAM=${ramGWOnPservs.toFixed(1)}GB)`
        );

        // Rebuild host objects using fresh RAM before allocation
        const homeHost = {
            host: "home",
            freeRam: Math.max(0, ns.getServerMaxRam("home") - ns.getServerUsedRam("home") - HOME_RAM_RESERVE)
        };

        // Shuffle pservs so usage spreads more evenly over time
        const pservHostObjs = shuffleArray(ns, pservHosts.map(h => ({
            host: h.host,
            freeRam: Math.max(0, ns.getServerMaxRam(h.host) - ns.getServerUsedRam(h.host))
        })).filter(h => h.freeRam > 0));

        // Landing order: W1 → H → G → W2
        allocToHosts(ns, pservHostObjs, weakenScript, target, weaken1Threads, delayWeak1);
        allocToHosts(ns, [homeHost],    hackScript,   target, hackThreads,    delayHack, tHack);
        allocToHosts(ns, pservHostObjs, growScript,   target, growThreads,    delayGrow);
        allocToHosts(ns, pservHostObjs, weakenScript, target, weaken2Threads, delayWeak2);

        await ns.sleep(batchInterval);
    }
}

// ────────────────────────────────────────────────
// BASE BATCH CALCULATION (per "unit" batch)
// ────────────────────────────────────────────────

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

// ────────────────────────────────────────────────
// HYBRID SCALING: home = hack, pservs = grow+weaken
// ────────────────────────────────────────────────

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

// ────────────────────────────────────────────────
// GENERIC ALLOCATION ACROSS HOSTS
// ────────────────────────────────────────────────

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

// ────────────────────────────────────────────────
// STATUS & HELPERS
// ────────────────────────────────────────────────

function printTargetStatus(ns, target) {
    const money   = ns.getServerMoneyAvailable(target);
    const max     = ns.getServerMaxMoney(target);
    const sec     = ns.getServerSecurityLevel(target);
    const minSec  = ns.getServerMinSecurityLevel(target);

    const moneyPct = max > 0 ? (money / max) * 100 : 0;
    const secDelta = sec - minSec;

    const now = new Date();
    const ts = now.toLocaleTimeString();

    ns.print("──────────────────────────────────────");
    ns.print(`📊 TARGET STATUS — ${target} @ ${ts}`);
    ns.print(`💰 Money:       ${ns.nFormat(money, "$0.00a")} / ${ns.nFormat(max, "$0.00a")} (${moneyPct.toFixed(2)}%)`);
    ns.print(`🛡 Security:     ${sec.toFixed(2)} (min ${minSec.toFixed(2)})  Δ=${secDelta.toFixed(2)}`);
    ns.print("──────────────────────────────────────");
}

function shuffleArray(ns, arr) {
    // Simple Fisher–Yates; ns used just to avoid unused param warnings if you like
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

// ────────────────────────────────────────────────
// FALLBACK: classic full HWGW on home only
// ────────────────────────────────────────────────

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

    ns.tprint(`⏱ Times (sec): H=${(tHack/1000).toFixed(1)}, G=${(tGrow/1000).toFixed(1)}, W=${(tWeaken/1000).toFixed(1)}`);
    ns.tprint(`⏱ Delays (sec): H=${(delayHack/1000).toFixed(1)}, G=${(delayGrow/1000).toFixed(1)}, W1=${(delayWeak1/1000).toFixed(1)}, W2=${(delayWeak2/1000).toFixed(1)}`);
    ns.tprint(`🔁 Base cycleTime: ${ns.tFormat(cycleTime)} (aiming for ${DESIRED_CONCURRENCY} overlapping batches)`);
    ns.tprint(`📡 Launch interval: ${ns.tFormat(batchInterval)} per batch`);
    ns.tprint("🏠 Single-host mode: HOME running full HWGW.");

    const basePlan = calcBaseThreads(ns, target);
    if (!basePlan) {
        ns.tprint("❌ Failed to compute base batch plan.");
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
            ns.print("⚠️ Insufficient RAM on home for even 1 minimal batch. Retrying...");
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
            `🚀 Home batch: ` +
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
