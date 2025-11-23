/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("scan");
    ns.disableLog("sleep");
    ns.disableLog("getServerNumPortsRequired");
    ns.disableLog("getServerRequiredHackingLevel");

    const hackingLevel = ns.getHackingLevel();
    const portCrackers = getPortCrackerCount(ns);

    ns.tprint(`🔍 Starting network scan from 'home'...`);
    ns.tprint(`📈 Hacking level: ${hackingLevel}`);
    ns.tprint(`🛠 Port crackers available: ${portCrackers}`);

    const servers = getAllServers(ns);
    ns.tprint(`🌐 Found ${servers.length} servers (including home).`);

    let rooted = 0;
    let skippedAlreadyRoot = 0;
    let skippedNotEnoughTools = 0;
    let skippedTooHighHack = 0;

    for (const host of servers) {
        if (host === "home") continue; // don't root home

        const hasRoot = ns.hasRootAccess(host);
        const reqHack = ns.getServerRequiredHackingLevel(host);
        const reqPorts = ns.getServerNumPortsRequired(host);

        if (hasRoot) {
            skippedAlreadyRoot++;
            ns.print(`✅ Already rooted: ${host}`);
            continue;
        }

        // Hacking level check
        if (reqHack > hackingLevel) {
            skippedTooHighHack++;
            ns.print(`⛔ Skipping ${host} (required hacking ${reqHack} > ${hackingLevel})`);
            continue;
        }

        // Port tools check
        if (reqPorts > portCrackers) {
            skippedNotEnoughTools++;
            ns.print(`🔒 Skipping ${host} (needs ${reqPorts} ports, only ${portCrackers} tools)`);
            continue;
        }

        // Try to open ports and nuke
        tryOpenPorts(ns, host);
        try {
            ns.nuke(host);
        } catch (e) {
            ns.print(`❌ Failed to nuke ${host}: ${String(e)}`);
            continue;
        }

        if (ns.hasRootAccess(host)) {
            rooted++;
            ns.tprint(`🚀 Rooted: ${host} (ports=${reqPorts}, reqHack=${reqHack})`);
        } else {
            ns.print(`❌ Something went wrong, still no root on ${host}`);
        }

        await ns.sleep(10); // tiny yield to avoid lag
    }

    ns.tprint("========== 🧮 Rooting Summary ==========");
    ns.tprint(`✅ Newly rooted:       ${rooted}`);
    ns.tprint(`ℹ️ Already rooted:    ${skippedAlreadyRoot}`);
    ns.tprint(`🔒 Not enough tools:  ${skippedNotEnoughTools}`);
    ns.tprint(`📈 Hack level too low:${skippedTooHighHack}`);
    ns.tprint("========================================");
}

/**
 * DFS to find all servers reachable from 'home'
 */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        const neighbors = ns.scan(host);
        for (const n of neighbors) {
            if (!visited.has(n)) {
                stack.push(n);
            }
        }
    }

    return Array.from(visited);
}

/**
 * Count how many port crackers we own.
 */
function getPortCrackerCount(ns) {
    const tools = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return tools.filter(t => ns.fileExists(t, "home")).length;
}

/**
 * Open all ports we can on a host.
 */
function tryOpenPorts(ns, host) {
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);
}
