//** util/find-juicy-advanced.js
 * Advanced juicy target finder:
 *
 * - Filters out trash / too-easy / too-hard / low-money servers.
 * - Considers only rooted, hackable servers within a band of your current level.
 * - Scores by money/sec and security, using Formulas.exe when available.
 * - Falls back to vanilla ns.getHackTime / ns.hackAnalyze* when Formulas.exe is missing.
 *
 * @param {NS} ns
 **/
export async function main(ns) {
    ns.disableLog("ALL");

    // Tunable knobs
    const MIN_MONEY_ABS  = 2_500_000; // skip anything poorer than this
    const MIN_HACK_RATIO = 0.25;      // reqHack must be at least 25% of your level
    const EXCLUDED_SERVERS = new Set([
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

    let best      = null;
    let bestScore = 0;
    const scored  = [];

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

        const {
            maxMoney,
            minSec,
            tHack,
            chance,
            moneyPerSec,
            score,
        } = getAdvancedHackMetrics(ns, host, s);

        scored.push({
            host,
            maxMoney,
            minSec,
            tHack,
            chance,
            moneyPerSec,
            score,
            reqHack: s.requiredHackingSkill,
        });

        if (score > bestScore) {
            bestScore = score;
            best      = scored[scored.length - 1];
        }
    }

    if (!best) {
        ns.tprint("? No juicy advanced target found with current filters.");
        ns.tprint("   (Either you need to root more servers, or we’re still early-game.)");
        return;
    }

    const usingFormulas = hasFormulas(ns);

    ns.tprint("=======================================");
    ns.tprint("   ?? Juiciest Advanced Target");
    ns.tprint("=======================================");
    ns.tprint(`?? Host:        ${best.host}`);
    ns.tprint(`?? Max Money:   ${ns.nFormat(best.maxMoney, "$0.00a")}`);
    ns.tprint(`?? Req Hack:    ${best.reqHack} (you: ${ns.getHackingLevel()})`);
    ns.tprint(`?? MinSec:      ${best.minSec.toFixed(2)}`);
    ns.tprint(`? Hack Time:   ${(best.tHack / 1000).toFixed(1)}s`);
    ns.tprint(`?? Chance:      ${(best.chance * 100).toFixed(1)}%`);
    ns.tprint(`?? Money/sec:   ${ns.nFormat(best.moneyPerSec * 1000, "$0.00a")}`);
    ns.tprint(`?? Score:       ${best.score.toExponential(3)} (${usingFormulas ? "?? Formulas" : "vanilla"})`);

    // Optional: quick top 5
    scored.sort((a, b) => b.score - a.score);
    const topN = Math.min(5, scored.length);
    ns.tprint("=======================================");
    ns.tprint("   ?? Top Juicy Candidates");
    ns.tprint("=======================================");
    for (let i = 0; i < topN; i++) {
        const h = scored[i];
        ns.tprint(
            `${i + 1}. ${h.host} | ` +
            `Score=${h.score.toExponential(2)} | ` +
            `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
            `ReqHack=${h.reqHack} | ` +
            `Chance=${(h.chance * 100).toFixed(1)}% | ` +
            `Sec=${h.minSec.toFixed(1)} | ` +
            `T=${(h.tHack / 1000).toFixed(1)}s | ` +
            `$/sec=${ns.nFormat(h.moneyPerSec * 1000, "$0.00a")}`
        );
    }
}

/**
 * Compute metrics for scoring a target.
 *
 * - With Formulas.exe:
 *     - Use ns.formulas.hacking.hackTime / hackChance / hackPercent
 *     - Assume prepped (min difficulty, max money)
 *     - Score is (moneyPerSec / minSec)
 *
 * - Without Formulas.exe:
 *     - Use ns.getHackTime / ns.hackAnalyze / ns.hackAnalyzeChance
 *     - Score is the original: maxMoney / hackTime / minSec
 *
 * This keeps behavior similar pre-Formulas, but upgrades nicely once unlocked.
 *
 * @param {NS} ns
 * @param {string} host
 * @param {Server} s
 */
function getAdvancedHackMetrics(ns, host, s) {
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    // Defensive defaults
    let tHack  = 1;
    let chance = 1;
    let moneyPerSec;
    let score;

    if (hasFormulas(ns)) {
        const player = ns.getPlayer();

        // Assume prepped for scoring
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        try {
            tHack  = ns.formulas.hacking.hackTime(s, player) || 1;
            chance = ns.formulas.hacking.hackChance(s, player) || 1;
            const percent      = ns.formulas.hacking.hackPercent(s, player) || 0;
            const moneyPerHack = maxMoney * percent;
            moneyPerSec        = (moneyPerHack * chance) / tHack;
            score              = moneyPerSec / minSec;
        } catch (_e) {
            // If anything weird happens, fall back to vanilla behavior
            tHack       = ns.getHackTime(host) || 1;
            chance      = ns.hackAnalyzeChance(host) ?? 1;
            moneyPerSec = maxMoney / tHack;
            score       = maxMoney / tHack / minSec;
        }
    } else {
        // Vanilla case: preserve your original-ish scoring style
        tHack       = ns.getHackTime(host) || 1;
        chance      = ns.hackAnalyzeChance(host) ?? 1;
        moneyPerSec = maxMoney / tHack;
        score       = maxMoney / tHack / minSec;
    }

    return { maxMoney, minSec, tHack, chance, moneyPerSec, score };
}

/** Safe check for formulas availability.
 *  Only touch ns.formulas if Formulas.exe exists to avoid early-game errors.
 * @param {NS} ns
 */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking
        );
    } catch (_e) {
        return false;
    }
}

/** DFS all servers reachable from home */
function getAllServers(ns) {
    const visited = new Set();
    const stack   = ["home"];

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