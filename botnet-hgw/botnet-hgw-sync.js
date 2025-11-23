/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = ns.args[0] || "omega-net";
    const mode = String(ns.args[1] || "xp").toLowerCase();
    const workerScript = "remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`❌ ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`🔄 Botnet HGW sync started. Target: ${target} | Mode: ${mode.toUpperCase()}`);

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
                ns.print(`💤 Skipping ${host}: only ${maxRam}GB RAM`);
                continue;
            }

            const running = ns.isRunning(workerScript, host, target, mode);
            const previousRam = lastRam[host] ?? 0;

            const needsDeploy =
                !running ||
                maxRam > previousRam ||
                !ns.fileExists(workerScript, host);

            if (!needsDeploy) continue;

            ns.tprint(`🚀 (re)deploying HGW on ${host}: RAM ${previousRam}GB → ${maxRam}GB`);

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

            const pid = ns.exec(workerScript, host, threads, target, mode);
            if (pid === 0) {
                ns.tprint(`❌ Failed to start ${workerScript} on ${host}`);
                continue;
            }

            lastRam[host] = maxRam;
            ns.print(`✅ ${host}: running ${workerScript} x${threads} vs ${target} [${mode}]`);
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
