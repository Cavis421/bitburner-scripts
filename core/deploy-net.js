/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const manualTarget = ns.args[0] || null;
    const target = manualTarget || findBestTarget(ns);

    if (!target) {
        ns.tprint("? No suitable target found.");
        return;
    }

    ns.tprint(`?? Deploying farm against: ${target}`);

    const servers = getAllServers(ns);
    const portCrackers = countPortCrackers(ns);

    for (const host of servers) {
        if (host === "home") continue; // handle home separately if you want

        // Try to gain root if we don't have it yet
        if (!ns.hasRootAccess(host)) {
            tryRoot(ns, host, portCrackers);
        }

        if (!ns.hasRootAccess(host)) {
            ns.print(`?? Skipping ${host} (no root)`);
            continue;
        }

        const maxRam = ns.getServerMaxRam(host);
        if (maxRam < 2) {
            ns.print(`?? Skipping ${host} (too little RAM)`);
            continue;
        }

        // Clear the box
        ns.killall(host);

        // Copy worker script
        const script = "botnet/remote-hgw.js";
        await ns.scp(script, host);

        const scriptRam = ns.getScriptRam(script);
        const usableRam = maxRam * 0.95; // leave 5% breathing room
        const threads = Math.floor(usableRam / scriptRam);

        if (threads < 1) {
            ns.print(`?? Not enough RAM on ${host} for even 1 thread.`);
            continue;
        }

        const pid = ns.exec(script, host, threads, target);
        if (pid === 0) {
            ns.print(`? Failed to exec ${script} on ${host}`);
        } else {
            ns.print(`?? ${host}: running ${script} x${threads} vs ${target}`);
        }
    }

    // Optionally, also use some RAM on home itself
    await deployToHome(ns, target);

    ns.tprint("? Deployment complete.");
}

/** Use some of home’s RAM as well */
async function deployToHome(ns, target) {
    const host = "home";
    const script = "botnet/remote-hgw.js";

    const maxRam  = ns.getServerMaxRam(host);
    const usedRam = ns.getServerUsedRam(host);

    // Leave 32 GB free on home for you / misc scripts
    const reserved = 32;
    const usableRam = Math.max(0, maxRam - usedRam - reserved);

    if (usableRam < 2) {
        ns.print("?? Not enough free RAM on home to deploy.");
        return;
    }

    await ns.scp(script, host);

    const scriptRam = ns.getScriptRam(script);
    const threads = Math.floor(usableRam / scriptRam);

    if (threads < 1) {
        ns.print("?? Not enough RAM on home for even 1 thread.");
        return;
    }

    ns.print(`?? home: running ${script} x${threads} vs ${target}`);
    ns.exec(script, host, threads, target);
}

/** DFS search to get all servers from 'home' */
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

/** Try to open ports + nuke if we have enough tools */
function tryRoot(ns, host, portCrackers) {
    const requiredPorts = ns.getServerNumPortsRequired(host);
    if (requiredPorts > portCrackers) return;

    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);

    try {
        ns.nuke(host);
    } catch {
        // if it fails, hasRootAccess will catch that
    }
}

/** “Best” target: maxMoney * growth / security with filters */
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

        // Filters to avoid junk
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