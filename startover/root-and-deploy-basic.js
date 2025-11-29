/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = ns.args[0] || "n00dles";
    const workerScript = "remote-hgw-basic.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`❌ ${workerScript} not found on home. Copy it first.`);
        return;
    }

    ns.tprint(`🔓 root-and-deploy-basic started. Target: ${target}`);

    const lastRam = {};

    while (true) {
        const servers = getAllServers(ns);
        const pservs = new Set(ns.getPurchasedServers());
        const portCrackers = countPortCrackers(ns);

        for (const host of servers) {
            if (host === "home") continue; // home is handled by startup script

            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < 2) continue; // skip tiny hosts

            // Try to gain root if we don't have it yet
            if (!ns.hasRootAccess(host)) {
                const rooted = tryRoot(ns, host, portCrackers);
                if (!rooted) continue; // can't root yet
            }

            // (Re)deploy worker when:
            //  - not running
            //  - RAM changed (upgrade)
            //  - worker file missing on host
            const running = ns.isRunning(workerScript, host, target);
            const previousRam = lastRam[host] ?? 0;

            const needsDeploy =
                !running ||
                maxRam > previousRam ||
                !ns.fileExists(workerScript, host);

            if (!needsDeploy) continue;

            ns.tprint(`🚀 (re)deploying HGW on ${host}: RAM ${previousRam}GB → ${maxRam}GB`);

            // Always killall as requested
            ns.killall(host);

            const ok = await ns.scp(workerScript, host);
            if (!ok) {
                ns.tprint(`⚠️ Failed to SCP ${workerScript} to ${host}`);
                continue;
            }

            const scriptRam = ns.getScriptRam(workerScript);
            const threads = Math.floor(maxRam / scriptRam);

            if (threads < 1) {
                ns.tprint(`⚠️ ${host}: not enough RAM for even 1 thread.`);
                continue;
            }

            const pid = ns.exec(workerScript, host, threads, target);
            if (pid === 0) {
                ns.tprint(`❌ Failed to start ${workerScript} on ${host}`);
                continue;
            }

            lastRam[host] = maxRam;
            const type = pservs.has(host) ? "PSERV" : "NPC";
            ns.print(`✅ ${host} [${type}]: running ${workerScript} x${threads} vs ${target}`);
        }

        await ns.sleep(10_000); // resync every 10s
    }
}

/** Breadth-first search of the network */
function getAllServers(ns) {
    const visited = new Set();
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) queue.push(neighbor);
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

function openPortsIfPossible(ns, host) {
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);
}

/**
 * Try to root a host using whatever port crackers we have.
 * Returns true if rooted, false otherwise.
 */
function tryRoot(ns, host, portCrackers) {
    if (ns.hasRootAccess(host)) return true;

    const reqPorts = ns.getServerNumPortsRequired(host);
    if (portCrackers < reqPorts) return false;

    openPortsIfPossible(ns, host);
    try {
        ns.nuke(host);
    } catch {
        // ignore
    }
    return ns.hasRootAccess(host);
}
