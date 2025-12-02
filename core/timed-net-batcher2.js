// Global health thresholds (more relaxed)
const MONEY_THRESHOLD = 0.90;  // Accept 90%+ money in normal mode
const SEC_TOLERANCE   = 0.75;  // Allow some security above min

// Softer thresholds for low-RAM mode
const LOWRAM_MONEY_THRESHOLD = 0.90; // Accept 90%+ money
const LOWRAM_SEC_TOLERANCE   = 1.50; // Allow more security drift

// Interval for status + profit summaries
const STATUS_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Each batch will only try to use this fraction of *currently free* RAM.
// This leaves space for overlapping batches and avoids "one huge batch".
const BATCH_RAM_FRACTION = 0.6;  // 60% of free RAM per batch

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
    ns.tprint("    - Uses pservs for grow/weaken and home for hacks when possible,");
    ns.tprint("    - Falls back to home-only HWGW when you have no pservs.");
    ns.tprint("");

    ns.tprint("NOTES");
    ns.tprint("  - Requires batch/batch-hack.js, batch/batch-grow.js,");
    ns.tprint("    and batch/batch-weaken.js on home.");
    ns.tprint("  - Expects the target to be rooted and reasonably prepped.");
    ns.tprint("  - --lowram:");
    ns.tprint("      * Enables single-batch mode (no overlapping batches),");
    ns.tprint("      * Uses softer money/security thresholds when prepping.");
    ns.tprint("  - Normal mode aims for multiple overlapping batches with stricter");
    ns.tprint("    money/security thresholds.");
    ns.tprint("");

    ns.tprint("SYNTAX");
    ns.tprint("  run core/timed-net-batcher2.js <target>");
    ns.tprint("  run core/timed-net-batcher2.js <target> --lowram");
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

    // Use flags so we can support --lowram and --help
    const flags = ns.flags([
        ["lowram", false],
        ["help", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    const target = flags._[0];
    const lowRamMode = !!flags.lowram;

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
    const hasPservs = purchased.length > 0;

    // If no pservs, fall back to a classic home-only HWGW loop
    if (!hasPservs) {
        ns.tprint("No purchased servers found. Using HOME for full HWGW batches.");
        await runAllOnHome(ns, target, hackScript, growScript, weakenScript);
        return;
    }

    // Make sure pservs have the batch scripts
    for (const host of purchased) {
        await ns.scp([hackScript, growScript, weakenScript], host);
    }

    const { tHack, tGrow, tWeaken, usingFormulas } = getHackGrowWeakenTimes(ns, target);

    ns.tprint(`Multi-batch HYBRID batcher targeting: ${target}`);
    ns.tprint("HOME: hack only  |  PSERVs: grow + weaken");
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
    let lastStatusPrint = 0;

    while (true) {
        const now = Date.now();
        if (now - lastStatusPrint >= STATUS_INTERVAL) {
            printTargetStatus(ns, target);
            lastStatusPrint = now;
        }

        // Collect worker hosts: home + pservs (others optional)
        const hosts = getAllServers(ns)
            .filter(h => ns.hasRootAccess(h) && ns.getServerMaxRam(h) > 0);

        const pservSet = new Set(purchased);

        // Calculate free RAM, with home reserve
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

        if (totalFree <= 0) {
            ns.print("No free RAM available for a new batch. Sleeping.");
            await ns.sleep(batchInterval);
            continue;
        }

        const allowedRam = totalFree * BATCH_RAM_FRACTION;

        // Target health
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

        // Decide whether to run a money batch or a prep batch
        const prepping = !(moneyOk && secOk);

        // Base threads
        const hackRam   = ns.getScriptRam(hackScript);
        const growRam   = ns.getScriptRam(growScript);
        const weakenRam = ns.getScriptRam(weakenScript);

        let hackThreads = 0;
        let growThreads = 0;
        let weakenThreads = 0;

        if (!prepping) {
            // Normal money batch: target ~5% money per batch
            const pctPerHackThread = ns.hackAnalyze(target);
            const targetFrac = 0.05;
            hackThreads = pctPerHackThread > 0 ? Math.floor(targetFrac / pctPerHackThread) : 1;
            if (hackThreads < 1) hackThreads = 1;

            const growMult = 1 / (1 - targetFrac);
            growThreads = Math.ceil(ns.growthAnalyze(target, growMult));
            if (growThreads < 1) growThreads = 1;

            const secIncHack = ns.hackAnalyzeSecurity(hackThreads);
            const secIncGrow = ns.growthAnalyzeSecurity(growThreads);
            const totalSec   = secIncHack + secIncGrow;
            weakenThreads = ns.weakenAnalyze(1) > 0
                ? Math.ceil(totalSec / ns.weakenAnalyze(1))
                : 1;
        } else {
            // Prep batch: favor grow + weaken
            // If money is low, bias towards grow; if security is high, bias towards weaken.
            if (moneyRatio < moneyThresh) {
                const growMult = max > 0 && money > 0 ? max / Math.max(1, money) : 2;
                growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target, growMult)));
            }

            if (secDelta > 0) {
                weakenThreads = ns.weakenAnalyze(1) > 0
                    ? Math.max(1, Math.ceil(secDelta / ns.weakenAnalyze(1)))
                    : 1;
            }

            // If for some reason both are zero, do at least some weaken
            if (growThreads === 0 && weakenThreads === 0) {
                weakenThreads = 1;
            }
        }

        // Total RAM needed for this conceptual batch
        let totalRamNeeded =
            hackThreads * hackRam +
            growThreads * growRam +
            weakenThreads * weakenRam * 2; // two weakens

        // If we do not have enough RAM, scale everything down
        if (totalRamNeeded > allowedRam && totalRamNeeded > 0) {
            const scale = allowedRam / totalRamNeeded;
            if (!prepping) {
                hackThreads   = Math.max(1, Math.floor(hackThreads * scale));
                growThreads   = Math.max(1, Math.floor(growThreads * scale));
                weakenThreads = Math.max(1, Math.floor(weakenThreads * scale));
            } else {
                growThreads   = Math.max(1, Math.floor(growThreads * scale));
                weakenThreads = Math.max(1, Math.floor(weakenThreads * scale));
            }

            totalRamNeeded =
                hackThreads * hackRam +
                growThreads * growRam +
                weakenThreads * weakenRam * 2;
        }

        if (!prepping) {
            ns.print(
                `Money batch: H=${hackThreads}, G=${growThreads}, ` +
                `W1=${weakenThreads}, W2=${weakenThreads} (RAM=${totalRamNeeded.toFixed(1)}GB)`
            );
        } else {
            ns.print(
                `Prep batch: G=${growThreads}, W=${weakenThreads} (RAM=${totalRamNeeded.toFixed(1)}GB)`
            );
        }

        // Split hosts into home and non-home (we want hacks on home, grow/weaken elsewhere)
        const homeHost = workers.find(w => w.isHome);
        const nonHome  = workers.filter(w => !w.isHome);

        if (!homeHost) {
            ns.print("No usable home RAM found; running everything on non-home servers.");
        }

        // Schedule weaken1, hack, grow, weaken2 with alignment
        const weak1Threads = weakenThreads;
        const weak2Threads = weakenThreads;

        // Weaken 1 (non-home preferred)
        allocToHosts(ns, nonHome, weakenScript, target, weak1Threads, delayWeak1);

        // Hacks on home if possible, else on non-home
        if (!prepping && hackThreads > 0) {
            if (homeHost && homeHost.freeRam >= hackRam) {
                allocToHosts(ns, [homeHost], hackScript, target, hackThreads, delayHack, tHack);
            } else {
                allocToHosts(ns, nonHome, hackScript, target, hackThreads, delayHack, tHack);
            }
        }

        // Grows on non-home
        if (growThreads > 0) {
            allocToHosts(ns, nonHome, growScript, target, growThreads, delayGrow, tGrow);
        }

        // Weaken 2 (non-home)
        allocToHosts(ns, nonHome, weakenScript, target, weak2Threads, delayWeak2);

        await ns.sleep(batchInterval);
    }
}

// ------------------------------------------------
// ALLOCATION HELPERS
// ------------------------------------------------

/** @param {NS} ns */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const n of ns.scan(host)) {
            if (!visited.has(n)) stack.push(n);
        }
    }
    return Array.from(visited);
}

/**
 * Allocate threads for a given script across a list of hosts.
 * The batch worker scripts accept:
 *   - target
 *   - startDelay (ms)
 *   - expectedTime (ms) [only for hack/grow]
 */
function allocToHosts(ns, hosts, script, target, threadsNeeded, delay = 0, extraArg = null) {
    if (threadsNeeded <= 0) return;

    const ramPerThread = ns.getScriptRam(script);
    if (ramPerThread <= 0) return;

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
        }
    }
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

// Simple Fisher–Yates; ns param kept for consistency if you want to log
function shuffleArray(_ns, arr) {
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

        const MAX_HACK_FRACTION = 0.9;
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
            "Home batch: " +
            `H=${hackThreads}, G=${growThreads}, ` +
            `W1=${weaken1Threads}, W2=${weaken2Threads} ` +
            `(RAM=${ramUsed.toFixed(1)}GB)`
        );

        const host = { host: "home", freeRam };

        allocToHosts(ns, [host], weakenScript, target, weaken1Threads, delayWeak1);
        allocToHosts(ns, [host], hackScript,   target, hackThreads,    delayHack, tHack);
        allocToHosts(ns, [host], growScript,   target, growThreads,    delayGrow, tGrow);
        allocToHosts(ns, [host], weakenScript, target, weaken2Threads, delayWeak2);

        await ns.sleep(batchInterval);
    }
}
