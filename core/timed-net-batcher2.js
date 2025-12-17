// Global health thresholds (more relaxed)
const MONEY_THRESHOLD = 0.90;  // Accept 90%+ money in normal mode
const SEC_TOLERANCE   = 0.90;  // Allow some security above min

// Softer thresholds for low-RAM mode
const LOWRAM_MONEY_THRESHOLD = 0.90; // Accept 90%+ money
const LOWRAM_SEC_TOLERANCE   = 1.50; // Allow more security drift

// Interval for status + profit summaries
const STATUS_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Each batch will only try to use this fraction of *currently free* RAM.
// This leaves space for overlapping batches but is more aggressive now.
const BATCH_RAM_FRACTION = 0.9;  // 90% of free RAM per batch

// Target hack fraction per money batch (aggressive, but capped)
const TARGET_HACK_FRACTION = 0.10; // Aim to hack ~10% money per batch
const MAX_HACK_FRACTION    = 0.30; // Never hack more than 30% per batch

// Prep behavior
const WEAKEN_FIRST_DELTA = 5; // If secDelta > this, do weaken-only prep

// Simple formatter wrapper for money values
function fmtMoney(ns, value) {
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
 * Compute hack/grow/weaken times.
 * - assumePrepped=true  => min security + max money (great for steady-state batching)
 * - assumePrepped=false => CURRENT server state (critical during prep!)
 *
 * Uses formulas if available, otherwise falls back to ns.getHack/Grow/WeakenTime.
 */
function getHackGrowWeakenTimes(ns, target, assumePrepped = true) {
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

    if (assumePrepped) {
        s.hackDifficulty = s.minDifficulty;
        s.moneyAvailable = Math.max(1, s.moneyMax || 0);
    } else {
        // Keep current hackDifficulty; ensure moneyAvailable is non-zero
        s.moneyAvailable = Math.max(1, s.moneyAvailable || 0);
    }

    return {
        tHack: ns.formulas.hacking.hackTime(s, player),
        tGrow: ns.formulas.hacking.growTime(s, player),
        tWeaken: ns.formulas.hacking.weakenTime(s, player),
        usingFormulas: true,
    };
}

// ------------------------------------------------
// HELP
// ------------------------------------------------

function printHelp(ns) {
    const script = "core/timed-net-batcher2.js";

    ns.tprint("==============================================================");
    ns.tprint(`HELP — ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");

    ns.tprint("DESCRIPTION");
    ns.tprint("  Advanced timed HWGW batch controller that:");
    ns.tprint("    - Uses Formulas.exe when available for precise timings,");
    ns.tprint("    - Runs multi-batch pipelines in normal mode,");
    ns.tprint("    - Falls back to a simpler single-batch loop in low-RAM mode,");
    ns.tprint("    - Uses home + pservs for HWGW (home prefers hacks),");
    ns.tprint("    - Falls back to home-only HWGW when you have no pservs.");
    ns.tprint("");

    ns.tprint("NOTES");
    ns.tprint("  - Requires batch/batch-hack.js, batch/batch-grow.js,");
    ns.tprint("    and batch/batch-weaken.js on home.");
    ns.tprint("  - Expects the target to be rooted.");
    ns.tprint("  - --lowram:");
    ns.tprint("      * Enables single-batch mode (no overlapping batches),");
    ns.tprint("      * Uses softer money/security thresholds when prepping.");
    ns.tprint("  - Timing fix (this revision):");
    ns.tprint("      * During PREP, uses CURRENT-state hack/grow/weaken times,");
    ns.tprint("        so it doesn't re-launch prep before long weakens land.");
    ns.tprint("      * During MONEY batching, uses PREPPED-state times for tight alignment.");
    ns.tprint("  - --debug:");
    ns.tprint("      * Prints extra heartbeat lines (useful to confirm it isn't 'stalled').");
    ns.tprint("");

    ns.tprint("SYNTAX");
    ns.tprint("  run core/timed-net-batcher2.js <target>");
    ns.tprint("  run core/timed-net-batcher2.js <target> --lowram");
    ns.tprint("  run core/timed-net-batcher2.js <target> --concurrency <n>");
    ns.tprint("  run core/timed-net-batcher2.js <target> --concurrency 0 --maxconc <n>");
    ns.tprint("  run core/timed-net-batcher2.js <target> --debug");
    ns.tprint("  run core/timed-net-batcher2.js --help");
    ns.tprint("");

    ns.tprint("==============================================================");
    ns.tprint("");
}

// ------------------------------------------------
// MAIN
// ------------------------------------------------

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags([
        ["lowram", false],
        ["help", false],
        ["debug", false],
        ["concurrency", 0],   // 0 = auto (based on available RAM)
        ["maxconc", 64],      // cap for auto/explicit concurrency
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    const target = flags._[0];
    const lowRamMode = !!flags.lowram;
    const debug = !!flags.debug;
    const requestedConcurrency = Number(flags.concurrency) || 0; // 0 => auto
    const maxConcurrency = Math.max(1, Math.floor(Number(flags.maxconc) || 64));

    if (!target) {
        ns.tprint("No batch target provided. core/timed-net-batcher2.js requires a target.");
        ns.tprint("");
        ns.tprint("Syntax");
        ns.tprint("  run core/timed-net-batcher2.js <target>");
        ns.tprint("  run core/timed-net-batcher2.js <target> --lowram");
        ns.tprint("");
        ns.tprint("Examples");
        ns.tprint("  run core/timed-net-batcher2.js n00dles");
        ns.tprint("  run core/timed-net-batcher2.js omega-net --lowram");
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
    let totalPservRam = 0;
    for (const host of purchased) totalPservRam += ns.getServerMaxRam(host);

    if (totalPservRam < 64) {
        ns.tprint(
            `Pserv fleet too small (${totalPservRam.toFixed(1)}GB). ` +
            "Using HOME for full HWGW batches."
        );
        await runAllOnHome(ns, target, hackScript, growScript, weakenScript);
        return;
    }

    for (const host of purchased) {
        await ns.scp([hackScript, growScript, weakenScript], host);
    }

    // Startup banner: just to show whether formulas exists.
    const usingFormulas = hasFormulas(ns);

    ns.tprint(`Multi-batch HYBRID batcher targeting: ${target}`);
    ns.tprint("HOME: hacks (plus spillover GW)  |  PSERVs: primary grow + weaken");
    ns.tprint(
        usingFormulas
            ? "Using Formulas.exe for batch timing."
            : "Formulas.exe not detected; using ns.getHack/Grow/WeakenTime."
    );

    if (lowRamMode) {
        ns.tprint("LOW-RAM MODE: single batch at a time with softer prep thresholds.");
    } else {
        ns.tprint("NORMAL MODE: multi-batch pipeline with stricter prep thresholds.");
    }

    const HOME_RAM_RESERVE = getHomeReserve(ns);
    let lastStatusPrint = 0;

    // Fixed batch spacing constant (alignment gap)
    const GAP = 200; // ms

    // One-time initial telemetry (prepped timing)
    {
        const { tHack, tGrow, tWeaken } = getHackGrowWeakenTimes(ns, target, true);
        const T = tWeaken + 4 * GAP;
        const cycleTime = T + GAP;

        const delayHack  = Math.max(0, T - 3 * GAP - tHack);
        const delayGrow  = Math.max(0, T - 2 * GAP - tGrow);
        const delayWeak1 = Math.max(0, T - 1 * GAP - tWeaken);
        const delayWeak2 = Math.max(0, T          - tWeaken);

        ns.tprint(
            `Times (sec): H=${(tHack / 1000).toFixed(1)}, ` +
            `G=${(tGrow / 1000).toFixed(1)}, W=${(tWeaken / 1000).toFixed(1)}`
        );
        ns.tprint(
            `Delays (sec): H=${(delayHack / 1000).toFixed(1)}, ` +
            `G=${(delayGrow / 1000).toFixed(1)}, ` +
            `W1=${(delayWeak1 / 1000).toFixed(1)}, W2=${(delayWeak2 / 1000).toFixed(1)}`
        );

        const initialConcurrency = lowRamMode ? 1 : (requestedConcurrency > 0 ? requestedConcurrency : 16);
        const initialBatchInterval = Math.max(GAP, Math.floor(cycleTime / initialConcurrency));

        ns.tprint(
            `Base cycleTime: ${ns.tFormat(cycleTime)} (initial conc=${initialConcurrency}${requestedConcurrency === 0 && !lowRamMode ? ", auto" : ""})`
        );
        ns.tprint(`Initial launch interval: ${ns.tFormat(initialBatchInterval)} per batch`);
    }

    while (true) {
        const now = Date.now();
        if (now - lastStatusPrint >= STATUS_INTERVAL) {
            printTargetStatus(ns, target);
            lastStatusPrint = now;
        }

        // ------------------------------------------------
        // Worker discovery: ONLY home + pservs for this batcher
        // ------------------------------------------------
        const pservSet = new Set(purchased);
        const hosts = ["home", ...purchased];

        const workers = [];
        let totalFree = 0;

        for (const host of hosts) {
            const maxRam  = ns.getServerMaxRam(host);
            const usedRam = ns.getServerUsedRam(host);
            let freeRam   = maxRam - usedRam;

            if (host === "home") {
                freeRam = Math.max(0, maxRam - usedRam - HOME_RAM_RESERVE);
            }

            if (freeRam < 0.1) continue;

            workers.push({ host, freeRam, isHome: host === "home", isPserv: pservSet.has(host) });
            totalFree += freeRam;
        }

        // Target health (drives prep vs money batching)
        const money   = ns.getServerMoneyAvailable(target);
        const max     = ns.getServerMaxMoney(target);
        const sec     = ns.getServerSecurityLevel(target);
        const minSec  = ns.getServerMinSecurityLevel(target);

        const moneyRatio = max > 0 ? money / max : 0;
        const secDelta   = sec - minSec;

        const moneyThresh = lowRamMode ? LOWRAM_MONEY_THRESHOLD : MONEY_THRESHOLD;
        const secThresh   = lowRamMode ? LOWRAM_SEC_TOLERANCE   : SEC_TOLERANCE;

        const moneyOk = moneyRatio >= moneyThresh;
        const secOk   = secDelta <= secThresh;

        const prepping = !(moneyOk && secOk);

        // ------------------------------------------------
        // STATE-AWARE TIMING (the core fix)
        // ------------------------------------------------
        // Prep: use CURRENT-state times (sec high => weaken long)
        // Money batching: use PREPPED-state times (tight alignment)
        const times = getHackGrowWeakenTimes(ns, target, !prepping);
        const tHack   = times.tHack;
        const tGrow   = times.tGrow;
        const tWeaken = times.tWeaken;

        const T = tWeaken + 4 * GAP;
        const cycleTime = T + GAP;

        const delayHack  = Math.max(0, T - 3 * GAP - tHack);
        const delayGrow  = Math.max(0, T - 2 * GAP - tGrow);
        const delayWeak1 = Math.max(0, T - 1 * GAP - tWeaken);
        const delayWeak2 = Math.max(0, T          - tWeaken);

        if (totalFree <= 0) {
            ns.print("No free RAM available for a new batch. Sleeping.");
            const idleInterval = Math.max(GAP, Math.floor(cycleTime / (lowRamMode ? 1 : 16)));
            await ns.sleep(idleInterval);
            continue;
        }

        // Deterministic packing
        workers.sort((a, b) => b.freeRam - a.freeRam);

        const allowedRam = totalFree * BATCH_RAM_FRACTION;

        // Base RAM per thread
        const hackRam   = ns.getScriptRam(hackScript);
        const growRam   = ns.getScriptRam(growScript);
        const weakenRam = ns.getScriptRam(weakenScript);

        let hackThreads = 0;
        let growThreads = 0;
        let weakenThreads = 0;

        // ============================================================
        // PREP: serial, weaken-first, and grow-security-aware
        // (NOTE: timings in prep are now CURRENT-state -> no double-launch)
        // ============================================================
        if (prepping) {
            const weakenPerThread    = ns.weakenAnalyze(1);
            const secPerGrowThread   = ns.growthAnalyzeSecurity(1);

            // If security is far above min, do WEAKEN-ONLY.
            if (secDelta > WEAKEN_FIRST_DELTA) {
                growThreads = 0;
                weakenThreads = weakenPerThread > 0
                    ? Math.max(1, Math.ceil(secDelta / weakenPerThread))
                    : 1;
            } else {
                // Close to min sec: allow grow, but pay for its security.
                if (moneyRatio < moneyThresh) {
                    const growMult = max > 0 && money > 0 ? max / Math.max(1, money) : 2;
                    growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target, growMult)));
                } else {
                    growThreads = 0;
                }

                const secFromGrow = growThreads * secPerGrowThread;
                const totalSecToRemove = Math.max(0, secDelta) + secFromGrow;

                weakenThreads = weakenPerThread > 0
                    ? Math.max(1, Math.ceil(totalSecToRemove / weakenPerThread))
                    : 1;
            }

            let totalRamNeeded =
                growThreads * growRam +
                weakenThreads * weakenRam;

            if (totalRamNeeded > allowedRam && totalRamNeeded > 0) {
                const scale = allowedRam / totalRamNeeded;
                growThreads   = Math.max(0, Math.floor(growThreads * scale));
                weakenThreads = Math.max(1, Math.floor(weakenThreads * scale));

                totalRamNeeded =
                    growThreads * growRam +
                    weakenThreads * weakenRam;
            }

            ns.print(`Prep batch: G=${growThreads}, W=${weakenThreads} (RAM=${totalRamNeeded.toFixed(1)}GB)`);

            const homeHost = workers.find(w => w.isHome);
            const nonHome  = workers.filter(w => !w.isHome);
            const gwHosts  = homeHost ? [...nonHome, homeHost] : nonHome;

            const launchedW = allocToHosts(ns, gwHosts, weakenScript, target, weakenThreads, 0, tWeaken);
            const launchedG = growThreads > 0 ? allocToHosts(ns, gwHosts, growScript, target, growThreads, 0, tGrow) : 0;

            if (launchedW < weakenThreads) ns.print(`WARN: Only launched W=${launchedW}/${weakenThreads} threads (prep).`);
            if (growThreads > 0 && launchedG < growThreads) ns.print(`WARN: Only launched G=${launchedG}/${growThreads} threads (prep).`);

            if (debug) {
                ns.print(
                    `Prep timing: W=${(tWeaken/1000).toFixed(1)}s (current-state). ` +
                    `Sleeping ${ns.tFormat(tWeaken + 2 * GAP)} until weaken should land...`
                );
            }
            
            if (debug) {
                ns.print(
                `DEBUG: PREP sleeping ${ns.tFormat(tWeaken + 2 * GAP)} ` +
                `(secDelta=${secDelta.toFixed(2)}, money=${(moneyRatio*100).toFixed(2)}%)`
                );
            }


            await ns.sleep(tWeaken + 2 * GAP);
            continue;
        }

        // ============================================================
        // MONEY BATCH: HWGW
        // ============================================================

        const pctPerHackThread = ns.hackAnalyze(target);
        if (pctPerHackThread > 0) {
            let desiredThreads = Math.floor(TARGET_HACK_FRACTION / pctPerHackThread);
            const maxThreads = Math.floor(MAX_HACK_FRACTION / pctPerHackThread);
            if (maxThreads > 0) desiredThreads = Math.min(desiredThreads, maxThreads);
            hackThreads = Math.max(1, desiredThreads);
        } else {
            hackThreads = 1;
        }

        const growMult = 1 / (1 - TARGET_HACK_FRACTION);
        growThreads = Math.ceil(ns.growthAnalyze(target, growMult));
        if (growThreads < 1) growThreads = 1;

        const secIncHack = ns.hackAnalyzeSecurity(hackThreads);
        const secIncGrow = ns.growthAnalyzeSecurity(growThreads);
        const totalSec   = secIncHack + secIncGrow;

        const weakenPerThread = ns.weakenAnalyze(1);
        weakenThreads = weakenPerThread > 0 ? Math.ceil(totalSec / weakenPerThread) : 1;
        if (weakenThreads < 1) weakenThreads = 1;

        let totalRamNeeded =
            hackThreads * hackRam +
            growThreads * growRam +
            weakenThreads * weakenRam * 2;

        if (totalRamNeeded > allowedRam && totalRamNeeded > 0) {
            const scale = allowedRam / totalRamNeeded;
            hackThreads   = Math.max(1, Math.floor(hackThreads * scale));
            growThreads   = Math.max(1, Math.floor(growThreads * scale));
            weakenThreads = Math.max(1, Math.floor(weakenThreads * scale));

            totalRamNeeded =
                hackThreads * hackRam +
                growThreads * growRam +
                weakenThreads * weakenRam * 2;
        }

        // --- Dynamic concurrency ---
        let concurrency = lowRamMode ? 1 : 16;
        if (!lowRamMode) {
            const maxByTiming = Math.max(1, Math.floor(cycleTime / GAP) - 1);
            if (requestedConcurrency > 0) {
                concurrency = clampInt(requestedConcurrency, 1, Math.min(maxConcurrency, maxByTiming));
            } else {
                const ramPerBatch = Math.max(1, totalRamNeeded);
                const maxByRam = Math.max(1, Math.floor(allowedRam / ramPerBatch));
                concurrency = clampInt(maxByRam, 1, Math.min(maxConcurrency, maxByTiming));
            }
        }

        const batchInterval = Math.max(GAP, Math.floor(cycleTime / concurrency));

        if (requestedConcurrency === 0 && !lowRamMode) {
            if (typeof globalThis.__tnb_lastConc !== "number") globalThis.__tnb_lastConc = 0;
            if (Math.abs(concurrency - globalThis.__tnb_lastConc) >= 4) {
                ns.print(`AUTO-CONC: concurrency=${concurrency}, interval=${ns.tFormat(batchInterval)}`);
                globalThis.__tnb_lastConc = concurrency;
            }
        }

        ns.print(
            `Money batch: H=${hackThreads}, G=${growThreads}, ` +
            `W1=${weakenThreads}, W2=${weakenThreads} (RAM=${totalRamNeeded.toFixed(1)}GB, conc=${concurrency})`
        );

        const homeHost = workers.find(w => w.isHome);
        const nonHome  = workers.filter(w => !w.isHome);

        if (!homeHost) {
            ns.print("No usable home RAM found; running everything on non-home servers.");
        }

        const weak1Threads = weakenThreads;
        const weak2Threads = weakenThreads;

        const gwHosts = homeHost ? [...nonHome, homeHost] : nonHome;

        const launchedW1 = allocToHosts(ns, gwHosts, weakenScript, target, weak1Threads, delayWeak1, tWeaken);

        let launchedH = 0;
        if (hackThreads > 0) {
            let remainingH = hackThreads;

            if (homeHost) {
                const launchedHome = allocToHosts(ns, [homeHost], hackScript, target, remainingH, delayHack, tHack);
                launchedH += launchedHome;
                remainingH -= launchedHome;
            }

            if (remainingH > 0) {
                const launchedElsewhere = allocToHosts(ns, nonHome, hackScript, target, remainingH, delayHack, tHack);
                launchedH += launchedElsewhere;
                remainingH -= launchedElsewhere;
            }
        }

        const launchedG = growThreads > 0
            ? allocToHosts(ns, gwHosts, growScript, target, growThreads, delayGrow, tGrow)
            : 0;

        const launchedW2 = allocToHosts(ns, gwHosts, weakenScript, target, weak2Threads, delayWeak2, tWeaken);

        if (launchedW1 < weak1Threads) ns.print(`WARN: Only launched W1=${launchedW1}/${weak1Threads}`);
        if (launchedH  < hackThreads)  ns.print(`WARN: Only launched H=${launchedH}/${hackThreads}`);
        if (launchedG  < growThreads)  ns.print(`WARN: Only launched G=${launchedG}/${growThreads}`);
        if (launchedW2 < weak2Threads) ns.print(`WARN: Only launched W2=${launchedW2}/${weak2Threads}`);

        if (debug) {
            ns.print(
            `DEBUG: batchInterval=${ns.tFormat(batchInterval)} ` +
            `conc=${concurrency}, freeRAM≈${totalFree.toFixed(0)}GB`
            );
        }

        await ns.sleep(batchInterval);
    }
}

// ------------------------------------------------
// ALLOCATION HELPERS
// ------------------------------------------------

/**
 * Allocate threads for a given script across a list of hosts.
 * The batch worker scripts accept:
 *   - target
 *   - startDelay (ms)
 *   - expectedTime (ms) [hack/grow/weaken drift correction]
 *
 * Returns the number of threads successfully launched.
 */
function allocToHosts(ns, hosts, script, target, threadsNeeded, delay = 0, extraArg = null) {
    if (threadsNeeded <= 0) return 0;

    const ramPerThread = ns.getScriptRam(script);
    if (ramPerThread <= 0) return 0;

    let launched = 0;

    for (const h of hosts) {
        if (threadsNeeded <= 0) break;
        if (h.freeRam < ramPerThread) continue;

        const maxThreadsHere = Math.floor(h.freeRam / ramPerThread);
        if (maxThreadsHere <= 0) continue;

        const allocate = Math.min(maxThreadsHere, threadsNeeded);

        const pid = extraArg == null
            ? ns.exec(script, h.host, allocate, target, delay)
            : ns.exec(script, h.host, allocate, target, delay, extraArg);

        if (pid !== 0) {
            h.freeRam -= allocate * ramPerThread;
            threadsNeeded -= allocate;
            launched += allocate;
        }
    }

    return launched;
}

// ------------------------------------------------
// STATUS HELPERS
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
    ns.print(`TARGET STATUS — ${target} @ ${ts}`);
    ns.print(
        `Money:       ${ns.nFormat(money, "$0.00a")} / ` +
        `${ns.nFormat(max, "$0.00a")} (${moneyPct.toFixed(2)}%)`
    );
    ns.print(
        `Security:    ${sec.toFixed(2)} (min ${minSec.toFixed(2)})  delta=${secDelta.toFixed(2)}`
    );
    ns.print("--------------------------------------");
}

function clampInt(value, min, max) {
    const v = Math.floor(Number(value) || 0);
    return Math.min(max, Math.max(min, v));
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

    ns.tprint(
        `Times (sec): H=${(tHack / 1000).toFixed(1)}, ` +
        `G=${(tGrow / 1000).toFixed(1)}, W=${(tWeaken / 1000).toFixed(1)}`
    );
    ns.tprint(
        `Delays (sec): H=${(delayHack / 1000).toFixed(1)}, ` +
        `G=${(delayGrow / 1000).toFixed(1)}, ` +
        `W1=${(delayWeak1 / 1000).toFixed(1)}, W2=${(delayWeak2 / 1000).toFixed(1)}`
    );
    ns.tprint(
        `Base cycleTime: ${ns.tFormat(cycleTime)} (aiming for ${DESIRED_CONCURRENCY} overlapping batches)`
    );
    ns.tprint(`Launch interval: ${ns.tFormat(batchInterval)} per batch`);

    const HOME_RAM_RESERVE = getHomeReserve(ns);

    while (true) {
        const maxRam  = ns.getServerMaxRam("home");
        const usedRam = ns.getServerUsedRam("home");
        let freeRam   = maxRam - usedRam - HOME_RAM_RESERVE;
        if (freeRam < 0) freeRam = 0;

        if (freeRam < 1) {
            ns.print("Home-only mode: no free RAM available. Sleeping.");
            await ns.sleep(batchInterval);
            continue;
        }

        const hackRam   = ns.getScriptRam(hackScript);
        const growRam   = ns.getScriptRam(growScript);
        const weakenRam = ns.getScriptRam(weakenScript);

        const baseHack = 2;
        const baseGrow = 4;
        const baseWeak = 4;

        const ramBase =
            baseHack * hackRam +
            baseGrow * growRam +
            2 * baseWeak * weakenRam;

        let mult = Math.floor(freeRam / ramBase);
        if (mult < 1) mult = 1;

        const pctPerHackThread = ns.hackAnalyze(target);
        const basePct          = baseHack * pctPerHackThread;

        const MAX_HACK_FRACTION_HOME = 0.9;
        if (basePct > 0) {
            const safeMult = Math.floor(MAX_HACK_FRACTION_HOME / basePct);
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
            "Home batch: " +
            `H=${hackThreads}, G=${growThreads}, ` +
            `W1=${weaken1Threads}, W2=${weaken2Threads} ` +
            `(RAM=${ramUsed.toFixed(1)}GB)`
        );

        const host = { host: "home", freeRam };

        allocToHosts(ns, [host], weakenScript, target, weaken1Threads, delayWeak1, tWeaken);
        allocToHosts(ns, [host], hackScript,   target, hackThreads,    delayHack, tHack);
        allocToHosts(ns, [host], growScript,   target, growThreads,    delayGrow, tGrow);
        allocToHosts(ns, [host], weakenScript, target, weaken2Threads, delayWeak2, tWeaken);

        await ns.sleep(batchInterval);
    }
}
//fixed 123