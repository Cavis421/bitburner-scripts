/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("getServerMaxRam");
    ns.disableLog("getServerUsedRam");
    ns.disableLog("scan");
    ns.disableLog("sleep");

    const target = ns.args[0] || "n00dles";
    const workerScript = "botnet/remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`? Cannot deploy – ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`?? Deploying HGW swarm (${workerScript}) vs ${target}...`);

    const servers = getAllServers(ns);
    let totalThreads = 0;

    for (const host of servers) {
        if (host === "home") continue;
        if (!ns.hasRootAccess(host)) continue;

        const maxRam = ns.getServerMaxRam(host);
        if (maxRam < 2) {
            ns.print(`?? Skipping ${host}: too little RAM (${maxRam} GB)`);
            continue;
        }

        const usableRam = maxRam * 0.95;
        const scriptRam = ns.getScriptRam(workerScript, "home");
        const threads = Math.floor(usableRam / scriptRam);
        if (threads < 1) {
            ns.print(`?? ${host}: not enough RAM for even 1 thread.`);
            continue;
        }

        ns.killall(host);
        await ns.scp(workerScript, host);

        const pid = ns.exec(workerScript, host, threads, target);
        if (pid === 0) {
            ns.print(`? Failed to start ${workerScript} on ${host}`);
            continue;
        }

        totalThreads += threads;
        ns.tprint(`?? ${host}: running ${workerScript} x${threads} vs ${target}`);
        await ns.sleep(5);
    }

    ns.tprint("========== ?? HGW Swarm Deployment ==========");
    ns.tprint(`?? Target: ${target}`);
    ns.tprint(`?? Total threads running: ${totalThreads}`);
    ns.tprint("=============================================");
}

function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) stack.push(neighbor);
        }
    }

    return Array.from(visited);
}