/** util/find-juicy-target.js
 * Scan all reachable servers and pick a "juicy" target:
 * - Good max money
 * - Solid growth
 * - Not too high security
 * - Reasonable hack time (Formulas-aware when available)
 *
 * Prints the best target and a small leaderboard of top candidates.
 *
 * @param {NS} ns
 **/
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
        const minSec   = s.minDifficulty || 1;
        const growth   = s.serverGrowth;
        const reqHack  = s.requiredHackingSkill;
        const reqPorts = s.numOpenPortsRequired; // pre-root is fine here

        // Skip servers that are obviously trash or out of reach
        if (maxMoney <= 0) continue;
        if (maxMoney < 250_000) continue;       // ignore tiny money servers
        if (growth < 10) continue;              // low growth = meh
        if (reqHack > hackingLevel) continue;   // too hard for us
        if (reqPorts > portCrackers) continue;  // need more port crackers

        // Formulas-aware hack time when available, vanilla fallback otherwise
        const hackTime = getJuicyHackTime(ns, host) || 1;

        // Higher money, growth, and lower sec/time ? better
        const score = (maxMoney * growth) / (minSec * hackTime);

        scored.push({ host, maxMoney, growth, minSec, hackTime, score });

        if (score > bestScore) {
            bestScore = score;
            bestHost  = host;
        }
    }

    if (!bestHost) {
        ns.tprint("? No juicy target found. (Probably need more hacking level or port crackers.)");
        return;
    }

    // Sort for a little leaderboard
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    ns.tprint("=======================================");
    ns.tprint("   ?? Juiciest Target Found");
    ns.tprint("=======================================");
    ns.tprint(`?? Host: ${best.host}`);
    ns.tprint(`?? Max Money: ${ns.nFormat(best.maxMoney, "$0.00a")}`);
    ns.tprint(`?? Growth: ${best.growth.toFixed(1)}`);
    ns.tprint(`?? Min Security: ${best.minSec.toFixed(2)}`);
    ns.tprint(`? Hack Time: ${(best.hackTime / 1000).toFixed(1)}s`);
    ns.tprint(`?? Score: ${best.score.toExponential(3)}  (${hasFormulas(ns) ? "?? Formulas" : "vanilla"})`);

    // Print top 5 for context
    ns.tprint("=======================================");
    ns.tprint("   ?? Top 5 Juicy Targets");
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

/**
 * Formulas-aware hack time helper:
 * - If Formulas.exe is present, use ns.formulas.hacking.hackTime()
 *   assuming prepped-ish (min security, max money).
 * - Otherwise, fall back to ns.getHackTime(host).
 *
 * @param {NS} ns
 * @param {string} host
 */
function getJuicyHackTime(ns, host) {
    if (!hasFormulas(ns)) {
        return ns.getHackTime(host);
    }

    const player = ns.getPlayer();
    const s = ns.getServer(host);

    // Assume prepped for speed estimation
    if (typeof s.minDifficulty === "number") {
        s.hackDifficulty = s.minDifficulty;
    }
    if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
        s.moneyAvailable = s.moneyMax;
    }

    try {
        return ns.formulas.hacking.hackTime(s, player);
    } catch (_e) {
        // Extremely defensive: if anything goes wrong, fall back
        return ns.getHackTime(host);
    }
}

/** Safe check for formulas availability.
 *  This matches the pattern in other scripts: only touch ns.formulas
 *  if Formulas.exe exists to avoid early-game errors.
 * @param {NS} ns
 */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking &&
            typeof ns.formulas.hacking.hackTime === "function"
        );
    } catch (_e) {
        return false;
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