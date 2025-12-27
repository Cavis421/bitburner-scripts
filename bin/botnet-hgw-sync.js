/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags([
        ["help", false], // --help flag for inline usage info
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }
    // Positional args
    const target = flags._[0] || "omega-net";
    const mode = String(flags._[1] || "xp").toLowerCase();
    const workerScript = "/botnet/remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`[X] ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`[OK] Botnet HGW sync started. Target: ${target} | Mode: ${mode.toUpperCase()}`);

    const lastRam = {};

    while (true) {
        // IMPORTANT: refresh purchased servers EVERY cycle (pserv-manager can add/upgrade them anytime)
        const pservs = new Set(ns.getPurchasedServers());
        const allServers = getAllServers(ns);
        for (const host of allServers) {
            // Always skip home
            if (host === "home") continue;
            // Always skip purchased servers (dynamic)
            if (pservs.has(host)) continue;
            // Belt-and-suspenders: if your naming convention is pserv-#, skip by prefix too.
            // This protects you during the tiny window where a server is purchased but
            // ns.getPurchasedServers() result hasn't "settled" yet (rare, but harmless).
            if (host.startsWith("pserv-")) continue;
            if (!ns.hasRootAccess(host)) continue;
            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < 2) {
                ns.print(`[WARN] Skipping ${host}: only ${maxRam}GB RAM`);
                continue;
            }

            // Check if the worker is already running on this host for this target+mode combo
            const running = ns.isRunning(workerScript, host, target, mode);
            const previousRam = lastRam[host] ?? 0;
            // Redeploy when:
            //   - not running at all,
            //   - RAM was upgraded (NPC servers can change in some BN contexts),
            //   - or the worker script is missing on the host.
            const needsDeploy =
                !running ||
                maxRam > previousRam ||
                !ns.fileExists(workerScript, host);

            if (!needsDeploy) continue;

            ns.tprint(`ðŸ” (re)deploying HGW on ${host}: RAM ${previousRam}GB -> ${maxRam}GB`);
            // Only kill this worker (safer than killall), but keep killall if you intentionally want it.
            // Using killall on NPC servers is usually fine, but kill() is more polite to other tooling.
            // ns.killall(host);
            ns.kill(workerScript, host, target, mode);
            const ok = await ns.scp(workerScript, host);
            if (!ok) {
                ns.tprint(`[X] Failed to SCP ${workerScript} to ${host}`);
                continue;
            }

            const scriptRam = ns.getScriptRam(workerScript);
            const threads = Math.floor(maxRam / scriptRam);

            if (threads < 1) {
                ns.tprint(`[WARN] ${host}: not enough RAM for even 1 thread.`);
                continue;
            }

            const pid = ns.exec(workerScript, host, threads, target, mode);
            if (pid === 0) {
                ns.tprint(`[X] Failed to start ${workerScript} on ${host}`);
                continue;
            }

            lastRam[host] = maxRam;
            ns.print(`[OK] ${host}: running ${workerScript} x${threads} vs ${target} [${mode}]`);
        }
        await ns.sleep(10_000); // every 10s, resync
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

function printHelp(ns) {
    ns.tprint("/bin/botnet-hgw-sync.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Keep /botnet/remote-hgw.js deployed on all rooted NPC servers.");
    ns.tprint("  Skips home and purchased servers (pserv-*) so they can be managed by batchers.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Target defaults to omega-net when no argument is provided.");
    ns.tprint("  Mode controls remote behavior: \"xp\" (default) or \"money\".");
    ns.tprint("  Requires /botnet/remote-hgw.js to exist on home before running.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run /bin/botnet-hgw-sync.js [target] [mode] [--help]");
}
// change to exclude pservs from sync targets on upgrade/purchase