/** core/root-and-deploy.js
 * Scan the network, gain root where possible, and prep servers for batch usage.
 *
 * ?? Does NOT deploy or start swarm/HGW workers (botnet/remote-hgw.js, botnet/botnet-hgw-sync.js).
 * ?? Safe to run multiple times; it only (re)roots and copies scripts.
 *
 * Usage:
 *   run core/root-and-deploy.js
 *   run core/root-and-deploy.js joesguns   // optional arg, currently informational only
 *   run core/root-and-deploy.js --help     // show description/notes/syntax
 *
 * @param {NS} ns
 */

// ------------------------------------------------------------
// HELP + FLAG PARSING
// ------------------------------------------------------------

/**
 * Minimal help: Description, Notes, Syntax.
 * @param {NS} ns
 */
function printHelp(ns) {
    const script = "core/root-and-deploy.js";

    ns.tprint("==============================================================");
    ns.tprint(`   HELP — ${script}`);
    ns.tprint("==============================================================\n");

    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Scan the network from 'home', gain root on servers when possible,");
    ns.tprint("  and copy batch infrastructure scripts to rooted hosts with RAM.");
    ns.tprint("  This prepares the network for HWGW batchers without actually");
    ns.tprint("  starting any swarm/HGW worker scripts.");
    ns.tprint("");

    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Does NOT start botnet/remote-hgw.js or botnet/botnet-hgw-sync.js.");
    ns.tprint("  - Safe to run repeatedly; it only (re)roots and copies scripts.");
    ns.tprint("  - Respects your hacking level and available port crackers.");
    ns.tprint("  - Only copies batch scripts to servers with at least 2GB RAM.");
    ns.tprint("  - The optional [target] argument is currently informational only");
    ns.tprint("    and does not change behavior.");
    ns.tprint("");

    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run core/root-and-deploy.js");
    ns.tprint("  run core/root-and-deploy.js [target]");
    ns.tprint("  run core/root-and-deploy.js --help   # show this help");
    ns.tprint("");

    ns.tprint("==============================================================\n");
}

/**
 * Simple flag parser for this script.
 * - Supports: --help and -? (both show help and exit).
 * - Returns positionals separately.
 *
 * @param {NS} ns
 */
function parseFlags(ns) {
    const raw = [...ns.args];

    const flags = ns.flags([
        ["help", false],
    ]);

    const positionals = flags._ || [];
    const wantsHelp = flags.help || raw.includes("-?");

    return { flags, positionals, wantsHelp };
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

export async function main(ns) {
    ns.disableLog("ALL");

    const { positionals, wantsHelp } = parseFlags(ns);

    if (wantsHelp) {
        printHelp(ns);
        return; // do not run normal behavior
    }

    // Original positional arg behavior preserved:
    //   manualTarget = first positional, or null if none provided.
    const manualTarget = positionals[0] || null;

    const hackingLevel = ns.getHackingLevel();
    const portCrackers = countPortCrackers(ns);

    ns.tprint("?? ROOT-AND-DEPLOY: scanning network from 'home'...");
    ns.tprint(`?? Hacking level: ${hackingLevel}`);
    ns.tprint(`?? Port crackers: ${portCrackers}`);
    if (manualTarget) {
        ns.tprint(`?? Manual target (informational only): ${manualTarget}`);
    }

    const servers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());

    let rooted = 0;
    let total = 0;

    // Scripts we may want present on remote hosts (batch infrastructure only)
    const batchScripts = [
        "batch-hack.js",
        "batch/batch-grow.js",
        "batch/batch-weaken.js",
    ];

    for (const host of servers) {
        if (host === "home") continue;
        if (host === "darkweb") continue;

        total++;

        const hadRootBefore = ns.hasRootAccess(host);
        const nowHasRoot = tryRoot(ns, host, hackingLevel, portCrackers);

        if (!hadRootBefore && nowHasRoot) rooted++;

        // Only bother copying scripts to machines where we have RAM + root
        if (!nowHasRoot) continue;

        const maxRam = ns.getServerMaxRam(host);
        if (maxRam < 2) {
            ns.print(`?? Skipping ${host}: only ${maxRam}GB RAM`);
            continue;
        }

        // Copy batch-only scripts; swarm scripts are managed by botnet/botnet-hgw-sync.js
        await ns.scp(batchScripts, host, "home");
        ns.print(`?? Deployed batch scripts to ${host} (RAM=${maxRam}GB)`);
    }

    ns.tprint("? ROOT-AND-DEPLOY COMPLETE");
    ns.tprint(`   Scanned: ${total} non-home servers`);
    ns.tprint(`   Newly rooted: ${rooted}`);
}

/**
 * Try to gain root on a server using available port crackers and Nuke.
 * Returns true if the server is rooted after this call.
 *
 * @param {NS} ns
 * @param {string} host
 * @param {number} hackingLevel
 * @param {number} portCrackers
 */
function tryRoot(ns, host, hackingLevel, portCrackers) {
    if (ns.hasRootAccess(host)) return true;

    const requiredHack = ns.getServerRequiredHackingLevel(host);
    const requiredPorts = ns.getServerNumPortsRequired(host);

    // Can't meet requirements yet
    if (requiredHack > hackingLevel) return false;
    if (requiredPorts > portCrackers) return false;

    // Open all ports we can
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);

    // Try to nuke
    try {
        ns.nuke(host);
    } catch {
        // if nuke fails for any reason, just fall through
    }

    return ns.hasRootAccess(host);
}

/**
 * Count how many port cracking programs we have.
 * @param {NS} ns
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
 * Simple BFS to discover all servers reachable from "home".
 * @param {NS} ns
 */
function getAllServers(ns) {
    const visited = new Set();
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const h of ns.scan(host)) {
            if (!visited.has(h)) queue.push(h);
        }
    }
    return Array.from(visited);
}
