/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0] || "rho-construction"; // or fallback default
    const workerScript = "remote-hgw.js";

    const HOME_RESERVE = 256; // GB to always keep free on home (tweak this)

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`❌ ${workerScript} not found on home; aborting home HGW manager.`);
        return;
    }

    ns.tprint(`🏠 home-hgw-manager: managing HGW threads on home vs ${target}`);

    while (true) {
        const maxRam = ns.getServerMaxRam("home");
        const usedRam = ns.getServerUsedRam("home");
        const freeRam = maxRam - usedRam - HOME_RESERVE;

        if (freeRam <= 0) {
            await ns.sleep(5000);
            continue;
        }

        const scriptRam = ns.getScriptRam(workerScript, "home");
        if (scriptRam <= 0) {
            ns.tprint(`❌ Could not read RAM usage for ${workerScript}`);
            return;
        }

        const desiredThreads = Math.floor(freeRam / scriptRam);

        // How many threads are already running on home for this target?
        const running = ns.ps("home").filter(
            p => p.filename === workerScript && p.args[0] === target
        );
        const currentThreads = running.reduce((sum, p) => sum + p.threads, 0);

        const toLaunch = desiredThreads - currentThreads;

        if (toLaunch > 0) {
            const pid = ns.exec(workerScript, "home", toLaunch, target);
            if (pid !== 0) {
                ns.tprint(`🚀 home: started ${workerScript} x${toLaunch} vs ${target}`);
            } else {
                ns.print(`⚠️ home-hgw-manager: exec failed; maybe race on RAM.`);
            }
        }

        await ns.sleep(10_000); // adjust every 10s; no need to spam
    }
}
