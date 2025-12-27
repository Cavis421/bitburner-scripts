/** ui/process-monitor.js
 * Live-ish snapshot of running processes across the network.
 * Highlights critical scripts and shows formulas-aware batch $/sec.
 *
 * Usage: run ui/process-monitor.js
 */

/** @param {NS} ns */
function fmt(ns, val, decimals = 2) {
    return ns.nFormat(val, `0.${"0".repeat(decimals)}a`);
}

// -------------------------------------------------------------
// Config: script names (respect pseudo-folder structure)
// -------------------------------------------------------------

const BATCH_CONTROLLERS = ["/bin/timed-net-batcher2.js", "/bin/timed-net-batcher2.js"];
const BATCH_HACK_SCRIPT = "workers/hwgw/batch-hack.js";      // moved into /workers/hwgw
const REMOTE_HGW_SCRIPT = "botnet/remote-hgw.js";     // moved into /botnet

/** @param {NS} ns */
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

/**
 * Get hack/grow/weaken times (ms) + chance for a target.
 * Uses ns.formulas.hacking when available, falls back otherwise.
 * @param {NS} ns
 */
function getHackGrowWeakenTimes(ns, target) {
    const player = ns.getPlayer();

    if (hasFormulas(ns)) {
        const s = ns.getServer(target);

        // Assume prepped-ish for planning
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        const tHack   = ns.formulas.hacking.hackTime(s, player);
        const tGrow   = ns.formulas.hacking.growTime(s, player);
        const tWeaken = ns.formulas.hacking.weakenTime(s, player);
        const chance  = ns.formulas.hacking.hackChance(s, player);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: true };
    } else {
        const tHack   = ns.getHackTime(target);
        const tGrow   = ns.getGrowTime(target);
        const tWeaken = ns.getWeakenTime(target);
        const chance  = ns.hackAnalyzeChance(target);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: false };
    }
}

/** @param {NS} ns */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const n of ns.scan(host)) {
            if (!visited.has(n)) stack.push(n);
        }
    }
    return Array.from(visited);
}

/** @param {NS} ns */
function findBatchTarget(ns) {
    const servers = getAllServers(ns);

    for (const host of servers) {
        for (const p of ns.ps(host)) {
            if (p.filename === BATCH_CONTROLLERS[0] && p.args.length > 0) {
                return p.args[0];
            }
        }
    }
    return null;
}

/**
 * Estimate current batch money/sec based on:
 * - total batch-hack threads
 * - hackAnalyze
 * - formulas-based (or vanilla) timing
 *
 * @param {NS} ns
 */
function printBatchOverview(ns) {
    const target = findBatchTarget(ns);

    ns.tprint("------------------------------------------------------------");
    ns.tprint("?? BATCH OVERVIEW (/bin/timed-net-batcher2.js)");
    if (!target) {
        ns.tprint("No active /bin/timed-net-batcher2.js controller found.");
        return;
    }

    const servers = getAllServers(ns);

    let totalHackThreads = 0;
    for (const host of servers) {
        for (const p of ns.ps(host)) {
            // CHANGED: look for /batch path
            if (p.filename === BATCH_HACK_SCRIPT) {
                totalHackThreads += p.threads;
            }
        }
    }

    if (totalHackThreads === 0) {
        ns.tprint(`Controller target: ${target} (no ${BATCH_HACK_SCRIPT} threads detected)`);
        return;
    }

    const maxMoney   = ns.getServerMaxMoney(target);
    const hackPerThr = ns.hackAnalyze(target);
    const rawFrac    = hackPerThr * totalHackThreads;
    const MAX_HACK_FRACTION = 0.9;
    const hackFrac   = Math.min(MAX_HACK_FRACTION, rawFrac);

    const { tHack, tGrow, tWeaken, usingFormulas } = getHackGrowWeakenTimes(ns, target);

    const GAP = 200; // ms ï¿½ same shape as timed-net-batcher2
    const cycleTime = tWeaken + 4 * GAP;
    const estBatchMoney = maxMoney * hackFrac;
    const estMoneyPerSec = cycleTime > 0 ? estBatchMoney / (cycleTime / 1000) : 0;

    ns.tprint(`Target: ${target}`);
    ns.tprint(
        `Threads (hack): ${totalHackThreads}  |  ` +
        `HackFracï¿½${(hackFrac * 100).toFixed(1)}% (capped at ${(MAX_HACK_FRACTION * 100).toFixed(0)}%)`
    );
    ns.tprint(
        `Times: H=${(tHack/1000).toFixed(1)}s, ` +
        `G=${(tGrow/1000).toFixed(1)}s, ` +
        `W=${(tWeaken/1000).toFixed(1)}s  |  cycleï¿½${ns.tFormat(cycleTime)}`
    );
    ns.tprint(
        `Est batch: ${ns.nFormat(estBatchMoney, "$0.00a")}  |  ` +
        `Est ~${ns.nFormat(estMoneyPerSec, "$0.00a")}/sec`
    );
    ns.tprint(
        usingFormulas
            ? "Timing model: Formulas.exe (ns.formulas.hacking)"
            : "Timing model: vanilla API (no Formulas.exe detected)"
    );
}

/** @param {NS} ns */
function printCriticalProcesses(ns) {
    const CRITICAL = new Set([
        "/bin/startup-home-advanced.js", "/bin/startup-home-advanced.js",
        "/bin/timed-net-batcher2.js",
        "/bin/pserv-manager.js",
        "/bin/root-and-deploy.js", "legacy/shims/core/root-and-deploy.js",
        "/bin/botnet-hgw-sync.js", // if youï¿½ve renamed it already
        REMOTE_HGW_SCRIPT,
        "hacknet/hacknet-smart.js",
        "bin/ui/ops-dashboard.js",
        "bin/ui/process-monitor.js",
    ]);

    const servers = getAllServers(ns);
    const rows = [];

    for (const host of servers) {
        const procs = ns.ps(host);
        const maxRam = ns.getServerMaxRam(host);

        for (const p of procs) {
            if (!CRITICAL.has(p.filename)) continue;

            const ramPerThread = ns.getScriptRam(p.filename, host) || 0;
            const ramUsage = ramPerThread * p.threads;

            rows.push({
                host,
                script: p.filename,
                threads: p.threads,
                ram: ramUsage,
                maxRam,
            });
        }
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint("?? CRITICAL PROCESS WATCH");
    if (rows.length === 0) {
        ns.tprint("No critical scripts currently running.");
        return;
    }

    rows.sort((a, b) => b.ram - a.ram);

    ns.tprint("Host           Script                        Thr   RAM(GB)");
    ns.tprint("------------------------------------------------------------");
    for (const r of rows) {
        const hostStr   = r.host.padEnd(13, " ");
        const scriptStr = r.script.padEnd(28, " ");
        const thrStr    = String(r.threads).padStart(3, " ");
        const ramStr    = r.ram.toFixed(1).padStart(7, " ");

        ns.tprint(`${hostStr}  ${scriptStr}  ${thrStr}  ${ramStr}`);
    }
}

/** @param {NS} ns */
function printRamSummary(ns) {
    const servers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());

    let homeUsed = 0, homeMax = 0;
    let pservUsed = 0, pservMax = 0;
    let npcUsed = 0, npcMax = 0;

    for (const host of servers) {
        const maxRam  = ns.getServerMaxRam(host);
        const usedRam = ns.getServerUsedRam(host);

        if (host === "home") {
            homeUsed += usedRam;
            homeMax  += maxRam;
        } else if (pservs.has(host)) {
            pservUsed += usedRam;
            pservMax  += maxRam;
        } else {
            npcUsed += usedRam;
            npcMax  += maxRam;
        }
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint("?? RAM SUMMARY");
    ns.tprint(
        `Home:   ${homeUsed.toFixed(1)} / ${homeMax.toFixed(1)} GB` +
        (homeMax > 0 ? ` (${(homeUsed/homeMax*100).toFixed(1)}%)` : "")
    );
    ns.tprint(
        `Pserv:  ${pservUsed.toFixed(1)} / ${pservMax.toFixed(1)} GB` +
        (pservMax > 0 ? ` (${(pservUsed/pservMax*100).toFixed(1)}%)` : "")
    );
    ns.tprint(
        `NPC:    ${npcUsed.toFixed(1)} / ${npcMax.toFixed(1)} GB` +
        (npcMax > 0 ? ` (${(npcUsed/npcMax*100).toFixed(1)}%)` : "")
    );
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    ns.tprint("?? PROCESS MONITOR");
    printRamSummary(ns);
    printCriticalProcesses(ns);
    printBatchOverview(ns);

    ns.tprint("------------------------------------------------------------");
    ns.tprint("Snapshot complete.");
}