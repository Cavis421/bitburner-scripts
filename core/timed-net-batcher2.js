// ⚙️ Global health thresholds (more relaxed)
const MONEY_THRESHOLD = 0.90;  // Accept 95%+ money (normal mode)
const SEC_TOLERANCE   = 0.75;   // Allow up to +0.5 sec above min

// Softer thresholds for low-RAM mode (still looser)
const LOWRAM_MONEY_THRESHOLD = 0.90; // Accept 90%+ money
const LOWRAM_SEC_TOLERANCE   = 1.50; // Accept up to +1.5 sec above min


// Interval for status + profit summaries
const STATUS_INTERVAL = 10 * 60 * 1000; // 10 minutes


// Each batch will only try to use this fraction of *currently free* RAM.
// This leaves space for overlapping batches and avoids "one huge batch" behavior.
const BATCH_RAM_FRACTION = 0.6;  // 60% of free RAM per batch


// Simple formatter wrapper for money values
function fmtMoney(ns, value) {
    // 2 decimal places, suffixes from 1k and up
    // formatNumber(value, fractionalDigits = 2, suffixStart = 1000)
    return "$" + ns.formatNumber(value, 2, 1e3);
}

// ------------------------------------------------
// Home RAM reserve helper (shared by both modes)
// ------------------------------------------------

function getHomeReserve(ns) {
    const max = ns.getServerMaxRam("home");
    // 10% of home, clamped between 8GB and 128GB
    return Math.min(128, Math.max(8, Math.floor(max * 0.10)));
}

// ------------------------------------------------
// Formulas.exe helpers
// ------------------------------------------------

function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking &&
            typeof ns.formulas.hacking.hackTime === "function"
        );
    } catch (_e) {
        return false;
    }
}

/**
 * Compute hack/grow/weaken times for a "prepped" target.
 * Uses ns.formulas.hacking.* if available, otherwise falls back
 * to ns.getHackTime / ns.getGrowTime / ns.getWeakenTime.
 */
function getHackGrowWeakenTimes(ns, target) {
    if (!hasFormulas(ns)) {
        return {
            tHack: ns.getHackTime(target),
            tGrow: ns.getGrowTime(target),
            tWeaken: ns.getWeakenTime(target),
            usingFormulas: false,
        };
    }

    const player = ns.getPlayer();
    const s = ns.getServer(target);

    // Assume prepped state for planning timings.
    s.hackDifficulty = s.minDifficulty;
    s.moneyAvailable = Math.max(1, s.moneyMax || 0);

    return {
        tHack: ns.formulas.hacking.hackTime(s, player),
        tGrow: ns.formulas.hacking.growTime(s, player),
        tWeaken: ns.formulas.hacking.weakenTime(s, player),
        usingFormulas: true,
    };
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Use flags so we can support --lowram
    const flags = ns.flags([
        ["lowram", false],
    ]);

    const target = flags._[0];
    const lowRamMode = !!flags.lowram;

    if (!target) {
        ns.tprint("? No batch target provided! (core/timed-net-batcher2.js needs one)");
        ns.tprint("   Example: run core/timed-net-batcher2.js n00dles");
        ns.tprint("   Or:      run core/timed-net-batcher2.js n00dles --lowram");
        return;
    }

    const hackScript   = "batch/batch-hack.js";
    const growScript   = "batch/batch-grow.js";
    const weakenScript = "batch/batch-weaken.js";

    for (const s of [hackScript, growScript, weakenScript]) {
        if (!ns.fileExists(s, "home")) {
            ns.tprint(`? Missing script on home: ${s}`);
            return;
        }
    }

    const purchased = ns.getPurchasedServers();
    const hasPservs = purchased.length > 0;

    if (!hasPservs) {
        ns.tprint("💻 No purchased servers found. Using HOME for full HWGW batches.");
        await runAllOnHome(ns, target, hackScript, growScript, weakenScript, lowRamMode);
        return;
    }

    // Make sure pservs have the batch scripts
    for (const host of purchased) {
        await ns.scp([hackScript, growScript, weakenScript], host);
    }

    const { tHack, tGrow, tWeaken, usingFormulas } = getHackGrowWeakenTimes(ns, target);

    ns.tprint(`🎯 Multi-batch HYBRID batcher targeting: ${target}`);
    ns.tprint(`🏠 HOME: hack only  |  🖥️ PSERVs: grow + weaken`);
    ns.tprint(
        usingFormulas
            ? "ℹ️ Using Formulas.exe for batch timing."
            : "ℹ️ Formulas.exe not detected – using ns.getHack/Grow/WeakenTime."
    );

    if (lowRamMode) {
        ns.tprint("🩳 LOW-RAM MODE ENABLED: single batch at a time, softer prep thresholds.");
    } else {
        ns.tprint("🧪 NORMAL MODE: multi-batch pipeline with strict prep thresholds.");
    }

    // -- Timing setup -------------------------------------
    const GAP = 200; // ms
    const T   = tWeaken + 4 * GAP;

    // Concurrency: 8 in normal mode, 1 in low-RAM mode (no overlapping batches)
    const DESIRED_CONCURRENCY = lowRamMode ? 1 : 8;

    const cycleTime     = T + GAP;
    const batchInterval = Math.max(GAP, Math.floor(cycleTime / DESIRED_CONCURRENCY));

    const delayHack   = Math.max(0, T - 3 * GAP - tHack);
    const delayGrow   = Math.max(0, T - 2 * GAP - tGrow);
    const delayWeak1  = Math.max(0, T - 1 * GAP - tWeaken);
    const delayWeak2  = Math.max(0, T          - tWeaken);

    ns.tprint(`⏱ Times (sec): H=${(tHack/1000).toFixed(1)}, G=${(tGrow/1000).toFixed(1)}, W=${(tWeaken/1000).toFixed(1)}`);
    ns.tprint(`⏱ Delays (sec): H=${(delayHack/1000).toFixed(1)}, G=${(delayGrow/1000).toFixed(1)}, W1=${(delayWeak1/1000).toFixed(1)}, W2=${(delayWeak2/1000).toFixed(1)}`);
    ns.tprint(`🔁 Base cycleTime: ${ns.tFormat(cycleTime)} (concurrency=${DESIRED_CONCURRENCY})`);
    ns.tprint(`🚀 Launch interval: ${ns.tFormat(batchInterval)} per batch`);

    const basePlan = calcBaseThreads(ns, target);
    if (!basePlan) {
        ns.tprint("? Failed to compute base batch plan.");
        return;
    }

    const hackRam   = ns.getScriptRam(hackScript);
    const growRam   = ns.getScriptRam(growScript);
    const weakenRam = ns.getScriptRam(weakenScript);

    const HOME_RAM_RESERVE = getHomeReserve(ns);

    // In low-RAM mode, hack a smaller fraction per batch to keep things lighter.
    const MAX_HACK_FRACTION = lowRamMode ? 0.50 : 0.90;   // <= 50% vs 90% of money in one wave

    // Softer prep thresholds in low-RAM mode
    const moneyThreshold = lowRamMode ? LOWRAM_MONEY_THRESHOLD : MONEY_THRESHOLD;
    const secTolerance   = lowRamMode ? LOWRAM_SEC_TOLERANCE   : SEC_TOLERANCE;

    let lastStatusPrint = 0;

    // 📈 Throughput tracking (hybrid mode)
    let cumulativeBatchMoney = 0;
    let batchCount = 0;
    const startTime = Date.now();
    let rollingStart = startTime;
    let rollingMoney = 0;
    let rollingBatches = 0;

    while (true) {
        const now = Date.now();

        // 🩺 HEALTHCHECK & PREP (before launching any new batch)
        await ensurePrepped(
            ns,
            target,
            purchased,
            growScript,
            weakenScript,
            HOME_RAM_RESERVE,
            moneyThreshold,
            secTolerance
        );

        // -- Periodic target + profit summary (every STATUS_INTERVAL) ---
        if (now - lastStatusPrint >= STATUS_INTERVAL) {
            printTargetStatus(ns, target);

            // Heartbeat: always hits console, even if no batches yet
            const runtimeMs = Date.now() - startTime;
            const runtimeSec = runtimeMs / 1000;
            const avgPerSecHeartbeat =
                runtimeSec > 0 ? cumulativeBatchMoney / runtimeSec : 0;
            const avgPerHourHeartbeat = avgPerSecHeartbeat * 3600;

            ns.tprint(
                `⏱ HEARTBEAT – ${target} | runtime=${ns.tFormat(runtimeMs)} | ` +
                `batches=${batchCount} | est≈${fmtMoney(ns, avgPerHourHeartbeat)}/hr`
            );

            // GLOBAL lifetime summary (only if we actually launched batches)
            if (batchCount > 0) {
                const runtimeSec = (Date.now() - startTime) / 1000;
                const avgPerSec  = cumulativeBatchMoney / runtimeSec;
                const avgPerHour = avgPerSec * 3600;

                ns.tprint(
                    `📈 PROFIT SUMMARY – lifetime\n` +
                    `    batches launched:   ${batchCount}\n` +
                    `    est money gained:   ${fmtMoney(ns, cumulativeBatchMoney)}\n` +
                    `    avg income:         ${fmtMoney(ns, avgPerSec)}/sec ` +
                    `(${fmtMoney(ns, avgPerHour)}/hr)\n` +
                    `    runtime:            ${ns.tFormat(runtimeSec * 1000)}`
                );
            }

            // Rolling 10-minute (or whatever interval) window
            const windowSec = (Date.now() - rollingStart) / 1000;
            if (rollingBatches > 0 && windowSec > 0) {
                const sliceAvg  = rollingMoney / windowSec;
                const sliceHour = sliceAvg * 3600;

                ns.tprint(
                    `🕒 PROFIT (last ${ns.tFormat(windowSec * 1000)}):\n` +
                    `    batches:            ${rollingBatches}\n` +
                    `    money gained:       ${fmtMoney(ns, rollingMoney)}\n` +
                    `    avg income:         ${fmtMoney(ns, sliceAvg)}/sec ` +
                    `(${fmtMoney(ns, sliceHour)}/hr)`
                );
            }

            // reset rolling window
            rollingStart   = Date.now();
            rollingMoney   = 0;
            rollingBatches = 0;

            lastStatusPrint = now;
        }

        // -- RAM snapshot -----------------------------------
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

        // -- Scale threads with hybrid constraints ---------
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

        // If we can't even support 1 safe hack thread, bail for this tick
        if (hackThreads <= 0 || growThreads <= 0 || weaken1Threads <= 0 || weaken2Threads <= 0) {
            ns.print("⚠️ Not enough effective RAM (home or pservs) for even a tiny hybrid batch. Retrying...");
            await ns.sleep(batchInterval);
            continue;
        }

        const ramHackHome =
            hackThreads * hackRam;
        const ramGWOnPservs =
            growThreads * growRam +
            (weaken1Threads + weaken2Threads) * weakenRam;

        // 💰 Estimated income metrics (per batch and per second)
        const maxMoney = ns.getServerMaxMoney(target);
        const pctPerHackThread = ns.hackAnalyze(target);
        const rawHackFrac = pctPerHackThread * hackThreads;
        const hackFrac = Math.min(MAX_HACK_FRACTION, rawHackFrac);
        const estBatchMoney = maxMoney * hackFrac;
        const estMoneyPerSec = estBatchMoney / (cycleTime / 1000);

        // Update throughput stats
        cumulativeBatchMoney += estBatchMoney;
        batchCount++;
        rollingMoney   += estBatchMoney;
        rollingBatches += 1;

        const runtimeSec = (Date.now() - startTime) / 1000;
        const avgPerSec  = cumulativeBatchMoney / Math.max(runtimeSec, 1);
        const avgPerHour = avgPerSec * 3600;

        ns.print(
            `💥 Hybrid batch${lowRamMode ? " [LOWRAM]" : ""}: ` +
            `H=${hackThreads} (home ${ramHackHome.toFixed(1)}GB), ` +
            `G=${growThreads}, W1=${weaken1Threads}, W2=${weaken2Threads} ` +
            `(pserv RAM=${ramGWOnPservs.toFixed(1)}GB) ` +
            `| 💰 batch≈${fmtMoney(ns, estBatchMoney)} ` +
            `(~${fmtMoney(ns, estMoneyPerSec)}/sec) ` +
            `| 📊 avg≈${fmtMoney(ns, avgPerSec)}/sec ` +
            `(${fmtMoney(ns, avgPerHour)}/hr over ${batchCount} batches)`
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

        // Landing order: W1 → H → G → W2 (recomputed timings in case difficulty changed)
        const { tHack: tHackCurrent, tGrow: tGrowCurrent, tWeaken: tWeakenCurrent } = getHackGrowWeakenTimes(ns, target);

        const GAP2 = 200;
        const T2 = tWeakenCurrent + 4 * GAP2;
        const delayHack2  = Math.max(0, T2 - 3 * GAP2 - tHackCurrent);
        const delayGrow2  = Math.max(0, T2 - 2 * GAP2 - tGrowCurrent);
        const delayWeak1b = Math.max(0, T2 - 1 * GAP2 - tWeakenCurrent);
        const delayWeak2b = Math.max(0, T2          - tWeakenCurrent);

        allocToHosts(ns, pservHostObjs, weakenScript, target, weaken1Threads, delayWeak1b);
        allocToHosts(ns, [homeHost],    hackScript,   target, hackThreads,    delayHack2, tHackCurrent);
        allocToHosts(ns, pservHostObjs, growScript,   target, growThreads,    delayGrow2);
        allocToHosts(ns, pservHostObjs, weakenScript, target, weaken2Threads, delayWeak2b);

        await ns.sleep(batchInterval);
    }
}

// ------------------------------------------------
// BASE BATCH CALCULATION (per "unit" batch)
// ------------------------------------------------

function calcBaseThreads(ns, target) {
    const hackPercentTarget    = 0.02; // 2% per "unit" batch (scaled later)
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

    // 🔧 New: only use a fraction of the *currently free* RAM for this batch
    // so that we can have multiple batches in flight.
    homeFreeRam       = homeFreeRam * BATCH_RAM_FRACTION;
    totalPservFreeRam = totalPservFreeRam * BATCH_RAM_FRACTION;

    // Derive ratios per 1 hack thread from the base plan
    const growPerHack  = baseGrow / baseHack;
    const weakPerHack  = baseWeak / baseHack;

    // RAM cost per *hack thread* worth of support:
    const ramPerHackOnHome   = hackRam;
    const ramPerHackOnPservs =
        growPerHack * growRam +
        2 * weakPerHack * weakenRam; // grow + two weakens (W1/W2)

    // If we literally can't support even 1 hack thread's worth of support, bail
    if (homeFreeRam < ramPerHackOnHome || totalPservFreeRam < ramPerHackOnPservs) {
        return { hackThreads: 0, growThreads: 0, weaken1Threads: 0, weaken2Threads: 0 };
    }

    // Limits from RAM
    const maxHackByHome  = Math.floor(homeFreeRam       / ramPerHackOnHome);
    const maxHackByPserv = Math.floor(totalPservFreeRam / ramPerHackOnPservs);

    // Limit from money safety (don't over-hack)
    let maxHackBySafety = Infinity;
    const pctPerHackThread = ns.hackAnalyze(target);
    if (pctPerHackThread > 0) {
        maxHackBySafety = Math.floor(MAX_HACK_FRACTION / pctPerHackThread);
    }

    let hackThreads = Math.min(maxHackByHome, maxHackByPserv, maxHackBySafety);
    if (!Number.isFinite(hackThreads) || hackThreads <= 0) {
        return { hackThreads: 0, growThreads: 0, weaken1Threads: 0, weaken2Threads: 0 };
    }

    // Round down a bit to be safe
    hackThreads = Math.max(1, Math.floor(hackThreads));

    // Scale grow/weaken proportionally to hack threads
    let growThreads    = Math.max(1, Math.round(hackThreads * growPerHack));
    let weaken1Threads = Math.max(1, Math.round(hackThreads * weakPerHack));
    let weaken2Threads = Math.max(1, weaken1Threads);

    // Final sanity check: if after rounding we no longer fit, step down once
    const totalRamHomeNeeded   = hackThreads * hackRam;
    const totalRamPservsNeeded =
        growThreads * growRam +
        (weaken1Threads + weaken2Threads) * weakenRam;

    if (totalRamHomeNeeded > homeFreeRam || totalRamPservsNeeded > totalPservFreeRam) {
        // Try dropping hackThreads by one step and recompute
        hackThreads = Math.max(0, hackThreads - 1);
        if (hackThreads <= 0) {
            return { hackThreads: 0, growThreads: 0, weaken1Threads: 0, weaken2Threads: 0 };
        }

        growThreads    = Math.max(1, Math.round(hackThreads * growPerHack));
        weaken1Threads = Math.max(1, Math.round(hackThreads * weakPerHack));
        weaken2Threads = Math.max(1, weaken1Threads);
    }

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

    // Switched to tprint so status shows in the main terminal every interval
    ns.tprint("--------------------------------------");
    ns.tprint(`📊 TARGET STATUS – ${target} @ ${ts}`);
    ns.tprint(`💰 Money:       ${fmtMoney(ns, money)} / ${fmtMoney(ns, max)} (${moneyPct.toFixed(2)}%)`);
    ns.tprint(`🛡 Security:    ${sec.toFixed(2)} (min ${minSec.toFixed(2)})  Δ=${secDelta.toFixed(2)}`);
    ns.tprint("--------------------------------------");
}

function shuffleArray(ns, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

// ------------------------------------------------
// 🩺 SERVER HEALTHCHECK + PREP LOGIC
// ------------------------------------------------

function checkServerHealth(ns, target, moneyThreshold, secTolerance) {
    const max    = ns.getServerMaxMoney(target);
    const money  = ns.getServerMoneyAvailable(target);
    const sec    = ns.getServerSecurityLevel(target);
    const minSec = ns.getServerMinSecurityLevel(target);

    const moneyPct = max > 0 ? money / max : 0;
    const moneyOk  = moneyPct >= moneyThreshold;
    const secOk    = sec <= minSec + secTolerance;

    return {
        moneyOk,
        secOk,
        moneyPct,
        money,
        max,
        sec,
        minSec
    };
}

/**
 * Ensure the target is "prepped" (high money, low security).
 * If not, run prep-only G/W waves using all hosts, then return.
 */
async function ensurePrepped(
    ns,
    target,
    purchased,
    growScript,
    weakenScript,
    HOME_RAM_RESERVE,
    moneyThreshold,
    secTolerance
) {
    const GAP = 200; // ms

    while (true) {
        const { tGrow, tWeaken } = getHackGrowWeakenTimes(ns, target);
        const h = checkServerHealth(ns, target, moneyThreshold, secTolerance);

        ns.print(
            `🩺 HEALTHCHECK: ` +
            `money=${(h.moneyPct * 100).toFixed(2)}% ` +
            `sec=${h.sec.toFixed(2)} (min=${h.minSec.toFixed(2)})`
        );

        if (h.moneyOk && h.secOk) {
            ns.print("✅ HEALTHCHECK: Target prepped. Proceeding with normal batching.");
            return true;
        }

        ns.tprint(
            `🩺 HEALTHCHECK: Target ${target} needs prep ` +
            `(money ${(h.moneyPct * 100).toFixed(2)}%, sec ${h.sec.toFixed(2)} vs min ${h.minSec.toFixed(2)}).`
        );
        ns.tprint("   🔧 Starting prep-only grow+weaken wave...");

        // RAM snapshot across all hosts
        const growRam   = ns.getScriptRam(growScript);
        const weakenRam = ns.getScriptRam(weakenScript);

        const homeMax  = ns.getServerMaxRam("home");
        const homeUsed = ns.getServerUsedRam("home");
        let homeFree   = homeMax - homeUsed - HOME_RAM_RESERVE;
        if (homeFree < 0) homeFree = 0;

        const allHosts = [];
        let totalFree = 0;

        if (homeFree > 0) {
            allHosts.push({ host: "home", freeRam: homeFree });
            totalFree += homeFree;
        }

        for (const p of purchased) {
            const maxRam  = ns.getServerMaxRam(p);
            const usedRam = ns.getServerUsedRam(p);
            const freeRam = Math.max(0, maxRam - usedRam);
            if (freeRam > 0) {
                allHosts.push({ host: p, freeRam });
                totalFree += freeRam;
            }
        }

        if (totalFree < growRam + weakenRam) {
            ns.print("⚠️ Not enough RAM anywhere for even minimal prep wave. Retrying in 1s...");
            await ns.sleep(1000);
            continue;
        }

        // Calculate needed grow/weaken threads
        let growThreads = 0;
        if (!h.moneyOk && h.max > 0 && h.money > 0) {
            const desiredMult = h.max / Math.max(h.money, 1);
            growThreads = Math.ceil(ns.growthAnalyze(target, desiredMult));
            if (!Number.isFinite(growThreads) || growThreads < 0) growThreads = 0;
        }

        let secDelta          = h.sec - h.minSec;
        let extraSecFromGrow  = growThreads > 0 ? ns.growthAnalyzeSecurity(growThreads) : 0;
        let totalSecToWeaken  = Math.max(0, secDelta + extraSecFromGrow);
        let weakenThreads     = totalSecToWeaken > 0 ? Math.ceil(totalSecToWeaken / ns.weakenAnalyze(1)) : 0;

        // Make sure we do *something* if unhealthy
        if (!h.moneyOk && growThreads === 0)  growThreads = 1;
        if (!h.secOk   && weakenThreads === 0) weakenThreads = 1;

        let totalRamNeeded =
            growThreads * growRam +
            weakenThreads * weakenRam;

        if (totalRamNeeded > totalFree && totalRamNeeded > 0) {
            const scale = totalFree / totalRamNeeded;
            growThreads   = Math.floor(growThreads   * scale);
            weakenThreads = Math.floor(weakenThreads * scale);

            if (growThreads <= 0 && weakenThreads <= 0) {
                ns.print("⚠️ Prep scaling resulted in 0 threads; waiting 1s and retrying...");
                await ns.sleep(1000);
                continue;
            }

            totalRamNeeded =
                growThreads * growRam +
                weakenThreads * weakenRam;
        }

        const T = tWeaken + 2 * GAP;
        const delayGrow = growThreads   > 0 ? Math.max(0, T - GAP - tGrow)   : 0;
        const delayWeak = weakenThreads > 0 ? Math.max(0, T        - tWeaken) : 0;

        ns.print(
            `🔧 Prep wave: G=${growThreads}, W=${weakenThreads} ` +
            `(RAM≈${totalRamNeeded.toFixed(1)}GB, duration≈${ns.tFormat(T)})`
        );

        if (growThreads > 0) {
            allocToHosts(ns, allHosts, growScript, target, growThreads, delayGrow);
        }
        if (weakenThreads > 0) {
            allocToHosts(ns, allHosts, weakenScript, target, weakenThreads, delayWeak);
        }

        // Wait for prep wave to land before evaluating again
        await ns.sleep(T + 200);
    }
}

// ------------------------------------------------
// FALLBACK: classic full HWGW on home only
// ------------------------------------------------

async function runAllOnHome(ns, target, hackScript, growScript, weakenScript, lowRamMode) {
    const { tHack, tGrow, tWeaken, usingFormulas } = getHackGrowWeakenTimes(ns, target);

    const GAP = 200; // ms
    const T = tWeaken + 4 * GAP;

    // Concurrency: 8 in normal mode, 1 in low-RAM mode
    const DESIRED_CONCURRENCY = lowRamMode ? 1 : 8;

    const cycleTime     = T + GAP;
    const batchInterval = Math.max(GAP, Math.floor(cycleTime / DESIRED_CONCURRENCY));

    const delayHack   = Math.max(0, T - 3 * GAP - tHack);
    const delayGrow   = Math.max(0, T - 2 * GAP - tGrow);
    const delayWeak1  = Math.max(0, T - 1 * GAP - tWeaken);
    const delayWeak2  = Math.max(0, T          - tWeaken);

    ns.tprint(`⏱ Times (sec): H=${(tHack/1000).toFixed(1)}, G=${(tGrow/1000).toFixed(1)}, W=${(tWeaken/1000).toFixed(1)}`);
    ns.tprint(`⏱ Delays (sec): H=${(delayHack/1000).toFixed(1)}, G=${(delayGrow/1000).toFixed(1)}, W1=${(delayWeak1/1000).toFixed(1)}, W2=${(delayWeak2/1000).toFixed(1)}`);
    ns.tprint(`🔁 Base cycleTime: ${ns.tFormat(cycleTime)} (concurrency=${DESIRED_CONCURRENCY})`);
    ns.tprint(
        usingFormulas
            ? `🏠 Single-host mode: HOME running full HWGW (${lowRamMode ? "LOW-RAM" : "NORMAL"} / Formulas.exe timing).`
            : `🏠 Single-host mode: HOME running full HWGW (${lowRamMode ? "LOW-RAM" : "NORMAL"} / built-in timing).`
    );

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

    const HOME_RAM_RESERVE = getHomeReserve(ns);

    const MAX_HACK_FRACTION = lowRamMode ? 0.50 : 0.90;
    const moneyThreshold    = lowRamMode ? LOWRAM_MONEY_THRESHOLD : MONEY_THRESHOLD;
    const secTolerance      = lowRamMode ? LOWRAM_SEC_TOLERANCE   : SEC_TOLERANCE;

    // 📈 Throughput tracking (home-only mode)
    let cumulativeBatchMoney = 0;
    let batchCount = 0;
    const startTime = Date.now();
    let rollingStart = startTime;
    let rollingMoney = 0;
    let rollingBatches = 0;
    let lastStatusPrint = 0;

    while (true) {
        // Even in home-only mode, ensure target is prepped with mode-appropriate thresholds
        await ensurePrepped(
            ns,
            target,
            [],               // no pservs
            growScript,
            weakenScript,
            HOME_RAM_RESERVE,
            moneyThreshold,
            secTolerance
        );

        const now = Date.now();

        // Periodic target + profit summary
        if (now - lastStatusPrint >= STATUS_INTERVAL) {
            printTargetStatus(ns, target);

            // Heartbeat: always hits console, even if no batches yet
            const runtimeMs = Date.now() - startTime;
            const runtimeSec = runtimeMs / 1000;
            const avgPerSecHeartbeat =
                runtimeSec > 0 ? cumulativeBatchMoney / runtimeSec : 0;
            const avgPerHourHeartbeat = avgPerSecHeartbeat * 3600;

            ns.tprint(
                `⏱ HEARTBEAT – ${target} [HOME-ONLY] | runtime=${ns.tFormat(runtimeMs)} | ` +
                `batches=${batchCount} | est≈${fmtMoney(ns, avgPerHourHeartbeat)}/hr`
            );

            if (batchCount > 0) {
                const runtimeSec = (Date.now() - startTime) / 1000;
                const avgPerSec  = cumulativeBatchMoney / runtimeSec;
                const avgPerHour = avgPerSec * 3600;

                ns.tprint(
                    `📈 PROFIT SUMMARY – lifetime\n` +
                    `    batches launched:   ${batchCount}\n` +
                    `    est money gained:   ${fmtMoney(ns, cumulativeBatchMoney)}\n` +
                    `    avg income:         ${fmtMoney(ns, avgPerSec)}/sec ` +
                    `(${fmtMoney(ns, avgPerHour)}/hr)\n` +
                    `    runtime:            ${ns.tFormat(runtimeSec * 1000)}`
                );
            }

            const windowSec = (Date.now() - rollingStart) / 1000;
            if (rollingBatches > 0 && windowSec > 0) {
                const sliceAvg  = rollingMoney / windowSec;
                const sliceHour = sliceAvg * 3600;

                ns.tprint(
                    `🕒 PROFIT (last ${ns.tFormat(windowSec * 1000)}):\n` +
                    `    batches:            ${rollingBatches}\n` +
                    `    money gained:       ${fmtMoney(ns, rollingMoney)}\n` +
                    `    avg income:         ${fmtMoney(ns, sliceAvg)}/sec ` +
                    `(${fmtMoney(ns, sliceHour)}/hr)`
                );
            }

            rollingStart   = Date.now();
            rollingMoney   = 0;
            rollingBatches = 0;
            lastStatusPrint = now;
        }

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

        const maxMoney = ns.getServerMaxMoney(target);
        const rawHackFrac = pctPerHackThread * hackThreads;
        const hackFrac = Math.min(MAX_HACK_FRACTION, rawHackFrac);
        const estBatchMoney = maxMoney * hackFrac;
        const estMoneyPerSec = estBatchMoney / (cycleTime / 1000);

        // Update throughput stats
        cumulativeBatchMoney += estBatchMoney;
        batchCount++;
        rollingMoney   += estBatchMoney;
        rollingBatches += 1;

        const runtimeSec = (Date.now() - startTime) / 1000;
        const avgPerSec  = cumulativeBatchMoney / Math.max(runtimeSec, 1);
        const avgPerHour = avgPerSec * 3600;

        ns.print(
            `💥 Home batch${lowRamMode ? " [LOWRAM]" : ""}: ` +
            `H=${hackThreads}, G=${growThreads}, ` +
            `W1=${weaken1Threads}, W2=${weaken2Threads} ` +
            `(RAM=${ramUsed.toFixed(1)}GB) ` +
            `| 💰 batch≈${fmtMoney(ns, estBatchMoney)} ` +
            `(~${fmtMoney(ns, estMoneyPerSec)}/sec) ` +
            `| 📊 avg≈${fmtMoney(ns, avgPerSec)}/sec ` +
            `(${fmtMoney(ns, avgPerHour)}/hr over ${batchCount} batches)`
        );

        const host = { host: "home", freeRam };

        allocToHosts(ns, [host], weakenScript, target, weaken1Threads, delayWeak1);
        allocToHosts(ns, [host], hackScript,   target, hackThreads,    delayHack, tHack);
        allocToHosts(ns, [host], growScript,   target, growThreads,    delayGrow);
        allocToHosts(ns, [host], weakenScript, target, weaken2Threads, delayWeak2);

        await ns.sleep(batchInterval);
    }
}
