/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const servers      = getAllServers(ns);
    const hackingLevel = ns.getHackingLevel();
    const portCrackers = countPortCrackers(ns);

    let bestHost  = null;
    let bestScore = 0;
    const scored  = [];

    for (const host of servers) {
        if (host === "home") continue;

        const s = ns.getServer(host);
        const maxMoney = s.moneyMax;
        const minSec   = s.minDifficulty;
        const growth   = s.serverGrowth;
        const reqHack  = s.requiredHackingSkill;
        const reqPorts = s.numOpenPortsRequired; // pre-root is fine here

        // Skip servers that are obviously trash or out of reach
        if (maxMoney <= 0) continue;
        if (maxMoney < 250_000) continue;       // ignore tiny money servers
        if (growth < 10) continue;              // low growth = meh
        if (reqHack > hackingLevel) continue;   // too hard for us
        if (reqPorts > portCrackers) continue;  // need more port crackers

        const hackTime = ns.getHackTime(host) || 1;

        // Higher money, growth, and lower sec/time → better
        const score = (maxMoney * growth) / (minSec * hackTime);

        scored.push({ host, maxMoney, growth, minSec, hackTime, score });

        if (score > bestScore) {
            bestScore = score;
            bestHost  = host;
        }
    }

    if (!bestHost) {
        ns.tprint("❌ No juicy target found. (Probably need more hacking level or port crackers.)");
        return;
    }

    // Sort for a little leaderboard
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    ns.tprint("=======================================");
    ns.tprint("   🧃 Juiciest Target Found");
    ns.tprint("=======================================");
    ns.tprint(`🎯 Host: ${best.host}`);
    ns.tprint(`💰 Max Money: ${ns.nFormat(best.maxMoney, "$0.00a")}`);
    ns.tprint(`🌱 Growth: ${best.growth.toFixed(1)}`);
    ns.tprint(`🛡 Min Security: ${best.minSec.toFixed(2)}`);
    ns.tprint(`⏱ Hack Time: ${(best.hackTime / 1000).toFixed(1)}s`);
    ns.tprint(`📈 Score: ${best.score.toExponential(3)}`);

    // Print top 5 for context
    ns.tprint("=======================================");
    ns.tprint("   🏆 Top 5 Juicy Targets");
    ns.tprint("=======================================");
    const topN = Math.min(5, scored.length);
    for (let i = 0; i < topN; i++) {
        const h = scored[i];
        ns.tprint(
            `${i + 1}. ${h.host} | ` +
            `Score=${h.score.toExponential(2)} | ` +
            `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
            `Grow=${h.growth.toFixed(1)} | ` +
            `Sec=${h.minSec.toFixed(1)} | ` +
            `T=${(h.hackTime / 1000).toFixed(1)}s`
        );
    }
}

/** DFS all servers reachable from home */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/** Count how many port crackers we have on home */
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
