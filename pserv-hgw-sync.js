/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Target server to farm; override with arg if you want
    const target = ns.args[0] || "omega-net";
    const workerScript = "remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`❌ ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`🔄 pserv HGW sync started. Target: ${target}`);

    // Remember last known RAM per pserv so we can detect upgrades
    const lastRam = {};

    while (true) {
        const pservs = ns.getPurchasedServers();

        if (pservs.length === 0) {
            ns.print("ℹ️ No purchased servers yet. Sleeping...");
            await ns.sleep(5000);
            continue;
        }

        for (const host of pservs) {
            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < 2) {
                ns.print(`💤 Skipping ${host}: only ${maxRam}GB RAM`);
                continue;
            }

            // Check if remote-hgw is already running for this target
            const running = ns.isRunning(workerScript, host, target);
            const previousRam = lastRam[host] ?? 0;

            // Conditions to redeploy:
            //  - server is new (no lastRam entry)
            //  - RAM increased (upgraded server)
            //  - worker script not running
            const needsDeploy =
                !running ||
                maxRam > previousRam ||
                !ns.fileExists(workerScript, host);

            if (!needsDeploy) {
                continue; // nothing to do for this host this cycle
            }

            // Redeploy on this pserv
            ns.tprint(`🚀 (re)deploying HGW on ${host}: RAM ${previousRam}GB → ${maxRam}GB`);

            ns.killall(host);

            // Copy worker script from home to pserv
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
            ns.print(`✅ ${host}: running ${workerScript} x${threads} vs ${target}`);
        }

        // Check again every 10 seconds (tweak if you want faster/slower reaction)
        await ns.sleep(10000);
    }
}
