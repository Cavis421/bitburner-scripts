/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const argTarget = ns.args[0]; // optional manual override
    const target = argTarget || findBestTarget(ns);

    if (!target) {
        ns.tprint("❌ No suitable target found.");
        return;
    }

    ns.tprint(`🎯 Batching against: ${target}`);

    // Ensure root
    if (!ns.hasRootAccess(target)) {
        openPortsAndNuke(ns, target);
    }
    if (!ns.hasRootAccess(target)) {
        ns.tprint(`❌ Still no root on ${target}. Need more port crackers or hacking level.`);
        return;
    }

    const hackScript   = "hack-worker.js";
    const growScript   = "grow-worker.js";
    const weakenScript = "weaken-worker.js";

    while (true) {
        const maxRam  = ns.getServerMaxRam("home");
        const usedRam = ns.getServerUsedRam("home");

        // Use up to 90% of home RAM in total
        const targetUsage = maxRam * 0.9;
        const freeForBatch = targetUsage - usedRam;
        if (freeForBatch <= 0) {
            ns.print("🕒 No room for more batches, waiting...");
            await ns.sleep(2000);
            continue;
        }

        const hackRam   = ns.getScriptRam(hackScript);
        const growRam   = ns.getScriptRam(growScript);
        const weakenRam = ns.getScriptRam(weakenScript);

        const perBatchRam = hackRam + growRam + weakenRam;
        let maxThreads = Math.floor(freeForBatch / perBatchRam);

        if (maxThreads < 3) { // need at least 1 of each
            await ns.sleep(2000);
            continue;
        }

        // With lots of RAM, cap the size a bit to avoid massive overkill
        maxThreads = Math.min(maxThreads, 2000);

        // Simple ratio: 20% hack, 40% grow, 40% weaken
        let hThreads = Math.max(1, Math.floor(maxThreads * 0.2));
        let gThreads = Math.max(1, Math.floor(maxThreads * 0.4));
        let wThreads = Math.max(1, maxThreads - hThreads - gThreads);

        ns.print(`🚀 Batch: H=${hThreads}, G=${gThreads}, W=${wThreads}`);

        ns.exec(weakenScript, "home", wThreads, target);
        ns.exec(growScript, "home", gThreads, target);
        ns.exec(hackScript, "home", hThreads, target);

        const weakenTime = ns.getWeakenTime(target);
        await ns.sleep(weakenTime + 200);
    }
}

/** Helpers – same idea as auto-hgw.js */

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

function openPortsAndNuke(ns, target) {
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(target);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(target);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(target);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(target);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(target);
    try {
        ns.nuke(target);
    } catch { }
}

function findBestTarget(ns) {
    const servers       = getAllServers(ns);
    const hackingLevel  = ns.getHackingLevel();
    const portCrackers  = countPortCrackers(ns);

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
