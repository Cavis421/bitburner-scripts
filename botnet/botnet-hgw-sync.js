/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Parse flags first so we can support --help without breaking positional args.
    // ns.flags() returns an object where:
    //   - known flags become properties (e.g. flags.help)
    //   - remaining positional args are in flags._ (array)
    const flags = ns.flags([
        ["help", false], // --help flag for inline usage info
    ]);

    // If the user requested help, print usage info and exit immediately.
    // We do NOT run any of the normal sync logic in this mode.
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Preserve original positional behavior:
    //   arg0: target (default "omega-net")
    //   arg1: mode   (default "xp", case-insensitive, normalized to lowercase)
    const target = flags._[0] || "omega-net";
    const mode = String(flags._[1] || "xp").toLowerCase();

    const workerScript = "botnet/remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`? ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`?? Botnet HGW sync started. Target: ${target} | Mode: ${mode.toUpperCase()}`);

    const lastRam = {};
    const pservs = new Set(ns.getPurchasedServers());

    while (true) {
        const allServers = getAllServers(ns);

        for (const host of allServers) {
            // We let home + pservs be handled by the batcher.
            if (host === "home") continue;
            if (pservs.has(host)) continue;

            if (!ns.hasRootAccess(host)) continue;

            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < 2) {
                ns.print(`?? Skipping ${host}: only ${maxRam}GB RAM`);
                continue;
            }

            // Check if the worker is already running on this host for this target+mode combo
            const running = ns.isRunning(workerScript, host, target, mode);
            const previousRam = lastRam[host] ?? 0;

            // Redeploy when:
            //   - not running at all,
            //   - RAM was upgraded,
            //   - or the worker script is missing on the host.
            const needsDeploy =
                !running ||
                maxRam > previousRam ||
                !ns.fileExists(workerScript, host);

            if (!needsDeploy) continue;

            ns.tprint(`?? (re)deploying HGW on ${host}: RAM ${previousRam}GB ? ${maxRam}GB`);

            ns.killall(host);

            const ok = await ns.scp(workerScript, host);
            if (!ok) {
                ns.tprint(`?? Failed to SCP ${workerScript} to ${host}`);
                continue;
            }

            const scriptRam = ns.getScriptRam(workerScript);
            const threads = Math.floor(maxRam / scriptRam);

            if (threads < 1) {
                ns.tprint(`?? ${host}: not enough RAM for even 1 thread.`);
                continue;
            }

            const pid = ns.exec(workerScript, host, threads, target, mode);
            if (pid === 0) {
                ns.tprint(`? Failed to start ${workerScript} on ${host}`);
                continue;
            }

            lastRam[host] = maxRam;
            ns.print(`? ${host}: running ${workerScript} x${threads} vs ${target} [${mode}]`);
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
    ns.tprint("botnet/botnet-hgw-sync.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Keep botnet/remote-hgw.js deployed on all rooted NPC servers.");
    ns.tprint("  Skips home and purchased servers so they can be managed by batchers or");
    ns.tprint("  other dedicated controllers.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Target defaults to omega-net when no argument is provided.");
    ns.tprint("  Mode controls remote behavior: \"xp\" (default) or \"money\".");
    ns.tprint("  Requires botnet/remote-hgw.js to exist on home before running.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run botnet/botnet-hgw-sync.js [target] [mode] [--help]");
}
