/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Parse flags so we can support --help without breaking positional args
    const flags = ns.flags([
        ["help", false], // allow run ... --help
    ]);

    // If --help requested, print usage info and exit before normal logic
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Original positional behavior:
    //   flag._[0] = target (default "omega-net")
    //   flag._[1] = mode   (default "xp")
    const target = flags._[0] || "omega-net";
    const mode = String(flags._[1] || "xp").toLowerCase();

    const workerScript = "botnet/remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`Missing ${workerScript} on home. Cannot deploy to purchased servers.`);
        return;
    }

    const purchased = ns.getPurchasedServers();
    ns.tprint(`Pserv HGW sync started. Target: ${target} | Mode: ${mode.toUpperCase()}`);

    const lastRam = {};

    while (true) {
        for (const host of purchased) {
            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < 2) continue;

            // Check if correct worker is already running
            const running = ns.isRunning(workerScript, host, target, mode);
            const previousRam = lastRam[host] ?? 0;

            const needsDeploy =
                !running ||
                maxRam > previousRam ||
                !ns.fileExists(workerScript, host);

            if (!needsDeploy) continue;

            ns.tprint(`(re)deploying pserv HGW on ${host}: RAM ${previousRam}GB -> ${maxRam}GB`);

            ns.killall(host);

            const ok = await ns.scp(workerScript, host);
            if (!ok) {
                ns.tprint(`Failed to SCP ${workerScript} to ${host}`);
                continue;
            }

            const scriptRam = ns.getScriptRam(workerScript);
            const threads = Math.floor(maxRam / scriptRam);

            if (threads < 1) {
                ns.tprint(`${host}: insufficient RAM for even one thread.`);
                continue;
            }

            const pid = ns.exec(workerScript, host, threads, target, mode);
            if (pid === 0) {
                ns.tprint(`Failed to start ${workerScript} on ${host}`);
                continue;
            }

            lastRam[host] = maxRam;
        }

        await ns.sleep(10_000); // check every 10s
    }
}

/** Print help for this script. */
function printHelp(ns) {
    ns.tprint("botnet/pserv-hgw-sync.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Deploy botnet/remote-hgw.js onto all purchased servers.");
    ns.tprint("  Ensures each server runs the correct target and mode, and redeploys");
    ns.tprint("  when RAM is upgraded or the worker script is missing.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Default target is omega-net.");
    ns.tprint("  Mode may be xp or money.");
    ns.tprint("  Does not manage NPC servers. Use botnet-hgw-sync.js for those.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run botnet/pserv-hgw-sync.js [target] [mode] [--help]");
}
