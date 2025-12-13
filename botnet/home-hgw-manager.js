/** @param {NS} ns */
export async function main(ns) {
    // Use flags so we can support --help without breaking existing positional usage.
    const flags = ns.flags([
        ["help", false],
    ]);

    // If called with --help, print help text and exit immediately.
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Original positional behavior:
    //   args[0] = target (default "rho-construction")
    const target = flags._[0] || "rho-construction";
    const workerScript = "botnet/remote-hgw.js";

    // How much RAM (in GB) to always keep free on home.
    const HOME_RESERVE = 256;

    const home = "home";

    if (!ns.fileExists(workerScript, home)) {
        ns.tprint(`home-hgw-manager: ${workerScript} not found on ${home}; aborting.`);
        return;
    }

    ns.tprint(`home-hgw-manager: managing HGW threads on ${home} vs ${target}`);

    // Optional: quiet most logs
    ns.disableLog("getServerMaxRam");
    ns.disableLog("getServerUsedRam");
    ns.disableLog("sleep");

    while (true) {
        const maxRam = ns.getServerMaxRam(home);
        const usedRam = ns.getServerUsedRam(home);

        // RAM we’re allowed to use for workers, never dipping into HOME_RESERVE.
        const usableRam = Math.max(0, maxRam - usedRam - HOME_RESERVE);
        const scriptRam = ns.getScriptRam(workerScript, home);

        if (scriptRam <= 0) {
            ns.print(`home-hgw-manager: script RAM for ${workerScript} is 0; sleeping.`);
            await ns.sleep(10_000);
            continue;
        }

        // How many threads we *could* run with the available RAM.
        const desiredThreads = Math.floor(usableRam / scriptRam);

        // Count how many threads of workerScript vs this target are currently running on home.
        const processes = ns.ps(home);
        let currentThreads = 0;
        const matchingProcs = [];

        for (const p of processes) {
            if (p.filename === workerScript && p.args[0] === target) {
                currentThreads += p.threads;
                matchingProcs.push(p);
            }
        }

        // If we have too many threads, kill the extras.
        if (currentThreads > desiredThreads) {
            let toKill = currentThreads - desiredThreads;
            ns.print(`home-hgw-manager: over-provisioned by ${toKill} threads; trimming.`);

            for (const p of matchingProcs) {
                if (toKill <= 0) break;

                const killThreads = Math.min(p.threads, toKill);
                // ns.kill(pid) kills the whole process (all its threads).
                // For simplicity, we kill entire processes until we’re back under the target.
                ns.kill(p.pid);
                toKill -= killThreads;
            }
        }

        // If we have capacity for more threads, launch them.
        if (desiredThreads > currentThreads) {
            const toLaunch = desiredThreads - currentThreads;
            if (toLaunch > 0) {
                const pid = ns.exec(workerScript, home, toLaunch, target);
                if (pid !== 0) {
                    ns.tprint(
                        `home-hgw-manager: started ${workerScript} x${toLaunch} on ${home} vs ${target}`
                    );
                } else {
                    ns.print("home-hgw-manager: exec failed; possible race on RAM.");
                }
            }
        }

        await ns.sleep(10_000); // Re-check every 10 seconds
    }
}

function printHelp(ns) {
    ns.tprint("botnet/home-hgw-manager.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Manage HGW worker threads on 'home' against a single target.");
    ns.tprint("  Dynamically scales botnet/remote-hgw.js threads using spare RAM.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - Reserves 256GB of RAM on home by default.");
    ns.tprint("  - Only manages processes for the given target.");
    ns.tprint("  - Intended to keep home busy with HGW while leaving headroom.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run botnet/home-hgw-manager.js [target] [--help]");
}
