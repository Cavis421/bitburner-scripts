/** @param {NS} ns */
export async function main(ns) {
    const target = findBestTarget(ns);

    if (!target) {
        ns.tprint("? No suitable target found.");
        return;
    }

    // Make sure we have root on the target
    if (!ns.hasRootAccess(target)) {
        openPortsAndNuke(ns, target);
    }

    if (!ns.hasRootAccess(target)) {
        ns.tprint(`? Still no root on ${target}. Need more port crackers or hacking level.`);
        return;
    }

    ns.tprint(`?? Best target: ${target}`);

    const maxMoney = ns.getServerMaxMoney(target);
    const minSec   = ns.getServerMinSecurityLevel(target);

    // With your stats, we can be a little more aggressive
    const moneyThresh    = maxMoney * 0.95;       // 95% of max
    const securityThresh = minSec + 1;            // keep it close to min

    ns.tprint(`?? Max: ${ns.nFormat(maxMoney, "$0.00a")} | Thresh: ${ns.nFormat(moneyThresh, "$0.00a")}`);
    ns.tprint(`?? MinSec: ${minSec.toFixed(2)} | Thresh: ${securityThresh.toFixed(2)}`);

    while (true) {
        const curSec   = ns.getServerSecurityLevel(target);
        const curMoney = ns.getServerMoneyAvailable(target);

        if (curSec > securityThresh) {
            await ns.weaken(target);
        } else if (curMoney < moneyThresh) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}

/** Find all servers reachable from 'home' */
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

/** Count how many port crackers we have */
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

/** Try to open ports and nuke target */
function openPortsAndNuke(ns, target) {
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(target);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(target);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(target);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(target);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(target);
    try {
        ns.nuke(target);
    } catch {
        // hasRootAccess will tell us if it worked
    }
}

/** Pick the “best” target: money × growth / security, with some filters */
function findBestTarget(ns) {
    const servers       = getAllServers(ns);
    const hackingLevel  = ns.getHackingLevel();
    const portCrackers  = countPortCrackers(ns);

    let bestTarget = null;
    let bestScore  = 0;

    for (const server of servers) {
        if (server === "home") continue;

        const maxMoney   = ns.getServerMaxMoney(server);
        const minSec     = ns.getServerMinSecurityLevel(server);
        const growth     = ns.getServerGrowth(server);
        const reqHack    = ns.getServerRequiredHackingLevel(server);
        const reqPorts   = ns.getServerNumPortsRequired(server);

        // Skip junk servers
        if (maxMoney <= 250_000) continue;   // ignore tiny ones
        if (growth < 10) continue;           // ignore low-growth
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