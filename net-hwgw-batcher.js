/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Optional: override target with arg, else auto-pick
    const manualTarget = ns.args[0] || null;
    const target = manualTarget || findBestTarget(ns);

    if (!target) {
        ns.tprint("❌ No suitable target found.");
        return;
    }

    ns.tprint(`🎯 Network HWGW batcher targeting: ${target}`);

    // Pre-root as much of the network as we can
    const allServers = getAllServers(ns);
    const portCrackers = countPortCrackers(ns);

    for (const host of allServers) {
        if (host === "home") continue;
        if (!ns.hasRootAccess(host)) {
            tryRoot(ns, host, portCrackers);
        }
    }

    if (!ns.hasRootAccess(target)) {
        ns.tprint(`❌ No root access on target ${target}. Get more programs / levels.`);
        return;
    }

    const hackScript   = "batch-hack.js";
    const growScript   = "batch-grow.js";
    const weakenScript = "batch-weaken.js";

    // Main batch loop
    while (true) {
        // Recalculate per-batch threads in case your stats changed
        const batchPlan = calcBatchThreads(ns, target, hackScript, growScript, weakenScript);
        if (!batchPlan) {
            ns.tprint("❌ Failed to calculate batch threads (maybe target has no money?).");
            return;
        }

        let { hackThreads, growThreads, weak1Threads, weak2Threads, ramPerBatch } = batchPlan;

        // Get current free RAM across the whole network
        const hosts = getUsableHosts(ns); // includes home with reserve
        const totalFreeRam = hosts.reduce((sum, h) => sum + h.freeRam, 0);

        if (totalFreeRam < ramPerBatch) {
            ns.tprint("⚠️ Not enough total RAM for even one full batch; scaling down.");
        }

        // Scale down threads if needed to fit available RAM
        const totalRamNeededFull =
            (hackThreads * ns.getScriptRam(hackScript)) +
            (growThreads * ns.getScriptRam(growScript)) +
            ((weak1Threads + weak2Threads) * ns.getScriptRam(weakenScript));

        let scale = 1;
        if (totalRamNeededFull > totalFreeRam) {
            scale = totalFreeRam / totalRamNeededFull;
        }

        hackThreads   = Math.max(1, Math.floor(hackThreads * scale));
        growThreads   = Math.max(1, Math.floor(growThreads * scale));
        weak1Threads  = Math.max(1, Math.floor(weak1Threads * scale));
        weak2Threads  = Math.max(1, Math.floor(weak2Threads * scale));

        ns.print(`Batch threads (scaled x${scale.toFixed(2)}): H=${hackThreads}, G=${growThreads}, W1=${weak1Threads}, W2=${weak2Threads}`);

        // Refresh RAM info for allocation
        refreshHostRam(ns, hosts);

        // Allocate threads for each job type across the network
        allocThreads(ns, hosts, weakenScript, target, weak1Threads);
        allocThreads(ns, hosts, hackScript,   target, hackThreads);
        allocThreads(ns, hosts, growScript,   target, growThreads);
        allocThreads(ns, hosts, weakenScript, target, weak2Threads);

        const tHack   = ns.getHackTime(target);
        const tGrow   = ns.getGrowTime(target);
        const tWeaken = ns.getWeakenTime(target);

        const cycleTime = Math.max(tHack, tGrow, tWeaken) + 2000; // little safety buffer

        ns.print(`⏱ Waiting ${ns.tFormat(cycleTime)} for batch to settle...`);
        await ns.sleep(cycleTime);
    }
}

/**
 * Calculate threads for a single HWGW batch targeting ~5% of money.
 */
function calcBatchThreads(ns, target, hackScript, growScript, weakenScript) {
    const maxMoney = ns.getServerMaxMoney(target);
    if (maxMoney <= 0) return null;

    const hackPercent = 0.05; // target 5% of max money per batch
    const hackAnalyzeValue = ns.hackAnalyze(target);

    if (hackAnalyzeValue <= 0) return null;

    let hackThreads = Math.floor(hackPercent / hackAnalyzeValue);
    if (hackThreads < 1) hackThreads = 1;

    // Money after hack: maxMoney * (1 - hackPercent)
    const growMultiplier = 1 / (1 - hackPercent);
    let growThreads = Math.ceil(ns.growthAnalyze(target, growMultiplier));
    if (growThreads < 1) growThreads = 1;

    const secIncreaseHack = ns.hackAnalyzeSecurity(hackThreads);
    const secIncreaseGrow = ns.growthAnalyzeSecurity(growThreads);
    const totalSecIncrease = secIncreaseHack + secIncreaseGrow;

    const weakenPower = ns.weakenAnalyze(1);
    if (weakenPower <= 0) return null;

    const totalWeakenThreads = Math.ceil(totalSecIncrease / weakenPower) || 1;

    // Split weaken threads into two waves
    const weak1Threads = Math.ceil(totalWeakenThreads / 2);
    const weak2Threads = totalWeakenThreads - weak1Threads;

    const hackRam   = ns.getScriptRam(hackScript);
    const growRam   = ns.getScriptRam(growScript);
    const weakenRam = ns.getScriptRam(weakenScript);

    const ramPerBatch =
        (hackThreads * hackRam) +
        (growThreads * growRam) +
        ((weak1Threads + weak2Threads) * weakenRam);

    return {
        hackThreads,
        growThreads,
        weak1Threads,
        weak2Threads,
        ramPerBatch
    };
}

/**
 * Get all reachable servers.
 */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/**
 * Count port crackers we own.
 */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}

/**
 * Try to root server if we have enough tools.
 */
function tryRoot(ns, host, portCrackers) {
    const reqPorts = ns.getServerNumPortsRequired(host);
    if (reqPorts > portCrackers) return;

    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);

    try {
        ns.nuke(host);
    } catch {
        // ignore; hasRootAccess will tell the truth
    }
}

/**
 * Get list of hosts with free RAM we can use.
 * Home gets special treatment: we keep some RAM free for you.
 */
function getUsableHosts(ns) {
    const hosts = [];
    const allServers = getAllServers(ns);

    for (const host of allServers) {
        if (!ns.hasRootAccess(host)) continue;

        const maxRam = ns.getServerMaxRam(host);
        if (maxRam < 2) continue;

        let usedRam = ns.getServerUsedRam(host);
        let freeRam = maxRam - usedRam;

        if (host === "home") {
            const reserve = 32; // keep 32GB free for other stuff
            freeRam = Math.max(0, maxRam - usedRam - reserve);
        }

        if (freeRam < 1) continue;

        hosts.push({ host, freeRam });
    }

    return hosts;
}

/**
 * Refresh freeRam snapshot for existing host list.
 */
function refreshHostRam(ns, hosts) {
    for (const h of hosts) {
        const maxRam = ns.getServerMaxRam(h.host);
        let usedRam  = ns.getServerUsedRam(h.host);
        let freeRam  = maxRam - usedRam;

        if (h.host === "home") {
            const reserve = 32;
            freeRam = Math.max(0, maxRam - usedRam - reserve);
        }
        h.freeRam = Math.max(0, freeRam);
    }
}

/**
 * Allocate threads for a job type across all hosts.
 */
function allocThreads(ns, hosts, script, target, threadsNeeded) {
    if (threadsNeeded <= 0) return;
    const ramPerThread = ns.getScriptRam(script);

    for (const h of hosts) {
        if (threadsNeeded <= 0) break;
        if (h.freeRam < ramPerThread) continue;

        const maxThreadsHere = Math.floor(h.freeRam / ramPerThread);
        const threadsHere = Math.min(threadsNeeded, maxThreadsHere);
        if (threadsHere <= 0) continue;

        const pid = ns.exec(script, h.host, threadsHere, target);
        if (pid !== 0) {
            h.freeRam -= threadsHere * ramPerThread;
            threadsNeeded -= threadsHere;
        }
    }

    if (threadsNeeded > 0) {
        ns.print(`⚠️ Could not allocate ${threadsNeeded} threads for ${script}; RAM exhausted.`);
    }
}

/**
 * Auto-pick a "good" money target: maxMoney * growth / minSec with reasonable filters.
 */
function findBestTarget(ns) {
    const servers      = getAllServers(ns);
    const hackingLevel = ns.getHackingLevel();
    const portCrackers = countPortCrackers(ns);

    let bestTarget = null;
    let bestScore  = 0;

    for (const server of servers) {
        if (server === "home") continue;

        const maxMoney = ns.getServerMaxMoney(server);
        const minSec   = ns.getServerMinSecurityLevel(server);
        const growth   = ns.getServerGrowth(server);
        const reqHack  = ns.getServerRequiredHackingLevel(server);
        const reqPorts = ns.getServerNumPortsRequired(server);

        if (maxMoney <= 250_000) continue;
        if (growth < 10) continue;
        if (reqHack > hackingLevel) continue;
        if (reqPorts > portCrackers) continue;

        const score = (maxMoney * growth) / minSec;
        if (score > bestScore) {
            bestScore  = score;
            bestTarget = server;
        }
    }

    return bestTarget;
}
