/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    // Tunable knobs
    const MIN_MONEY_ABS      = 2_500_000; // skip anything poorer than this
    const MIN_HACK_RATIO     = 0.25;      // reqHack must be at least 25% of your level
    const EXCLUDED_SERVERS   = new Set([
        "home",
        "n00dles",
        "foodnstuff",
        "sigma-cosmetics",
        "joesguns",
        "harakiri-sushi",
        "hong-fang-tea",
    ]);

    const hackingLevel = ns.getHackingLevel();
    const servers      = getAllServers(ns);

    let best = null;
    let bestScore = 0;
    const scored = [];

    for (const host of servers) {
        if (EXCLUDED_SERVERS.has(host)) continue;

        const s = ns.getServer(host);

        // Must be rooted and hackable
        if (!s.hasAdminRights) continue;
        if (s.requiredHackingSkill > hackingLevel) continue;

        // Skip stuff that is *too* easy
        if (s.requiredHackingSkill < hackingLevel * MIN_HACK_RATIO) continue;

        // Must have decent money
        if (s.moneyMax < MIN_MONEY_ABS) continue;

        const maxMoney = s.moneyMax;
        const minSec   = s.minDifficulty || 1;
        const hackTime = ns.getHackTime(host) || 1;

        // Simple "juicy" heuristic
        const score = maxMoney / hackTime / minSec;

        scored.push({ host, maxMoney, minSec, hackTime, score });

        if (score > bestScore) {
            bestScore = score;
            best = scored[scored.length - 1];
        }
    }

    if (!best) {
        ns.tprint("❌ No juicy advanced target found with current filters.");
        ns.tprint("   (Either you need to root more servers, or we’re still early-game.)");
        return;
    }

    ns.tprint("=======================================");
    ns.tprint("   🧃 Juiciest Advanced Target");
    ns.tprint("=======================================");
    ns.tprint(`🎯 Host: ${best.host}`);
    ns.tprint(`💰 Max Money: ${ns.nFormat(best.maxMoney, "$0.00a")}`);
    ns.tprint(`🛡 MinSec: ${best.minSec.toFixed(2)}`);
    ns.tprint(`⏱ Hack Time: ${(best.hackTime / 1000).toFixed(1)}s`);
    ns.tprint(`📈 Score: ${best.score.toExponential(3)}`);

    // Optional: quick top 5
    scored.sort((a, b) => b.score - a.score);
    const topN = Math.min(5, scored.length);
    ns.tprint("=======================================");
    ns.tprint("   🏆 Top Juicy Candidates");
    ns.tprint("=======================================");
    for (let i = 0; i < topN; i++) {
        const h = scored[i];
        ns.tprint(
            `${i + 1}. ${h.host} | ` +
            `Score=${h.score.toExponential(2)} | ` +
            `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
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
