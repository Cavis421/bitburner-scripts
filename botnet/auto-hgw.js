/** @param {NS} ns */
export async function main(ns) {
    // Use flags so we can support --help without breaking positional args
    const flags = ns.flags([
        ["help", false], // standard help flag for all scripts
    ]);

    // Help: print description/notes/syntax and exit before any normal logic
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // This script previously did not use any arguments; keep behavior the same
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

/**
 * Print script help in a consistent, minimal format.
 * Uses only ns.tprint and exits before running any main logic.
 * @param {NS} ns
 */
function printHelp(ns) {
    ns.tprint("botnet/auto-hgw.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Automatically selects a strong money target and runs a simple hack-grow-weaken loop.");
    ns.tprint("  Tries to keep the server near max money and low security for steady income.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Chooses targets based on money, growth, and security using your current hacking stats.");
    ns.tprint("  Attempts to gain root on the chosen target using any available port crackers.");
    ns.tprint("  Intended for use on a single host; it does not coordinate batches across the network.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run botnet/auto-hgw.js [--help]");
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

/** Pick the "best" target: money × growth / security, with some filters */
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
