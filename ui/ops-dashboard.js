/** Combined operational dashboard for Bitburner
 *  Shows: player/home, target snapshot, botnet, pservs, Hacknet
 *  Usage: run ui/ops-dashboard.js [optional-target-override]
 */

/** Simple number formatter using ns.formatNumber (works on all versions) */
/** @param {NS} ns */
function fmt(ns, val, decimals = 3) {
    return ns.ns.formatNumber(val, `0.${"0".repeat(decimals)}a`);
}

/** Formulas.exe detection */
function hasFormulas(ns) {
    return (
        typeof ns.formulas !== "undefined" &&
        ns.formulas &&
        typeof ns.formulas.hacking !== "undefined"
    );
}

/**
 * Get hack/grow/weaken times (ms) + chance for a target.
 * Uses Formulas.exe when available, falls back to vanilla timing otherwise.
 */
function getHackGrowWeakenTimes(ns, target) {
    const player = ns.getPlayer();

    if (hasFormulas(ns)) {
        const s = ns.getServer(target);

        // Normalize to "ideal" batch conditions
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        const tHack  = ns.formulas.hacking.hackTime(s, player);
        const tGrow  = ns.formulas.hacking.growTime(s, player);
        const tWeaken = ns.formulas.hacking.weakenTime(s, player);
        const chance = ns.formulas.hacking.hackChance(s, player);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: true };
    } else {
        const tHack  = ns.getHackTime(target);
        const tGrow  = ns.getGrowTime(target);
        const tWeaken = ns.getWeakenTime(target);
        const chance = ns.hackAnalyzeChance(target);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: false };
    }
}

/**
 * Pretty-print a target snapshot (timings, chance, money/sec cap).
 */
function printTargetTiming(ns, target) {
    if (!target || target === "unknown") {
        ns.tprint("?? Target snapshot: (no active target detected)");
        return;
    }

    const maxMoney = ns.getServerMaxMoney(target);
    const minSec   = ns.getServerMinSecurityLevel(target);

    const { tHack, tGrow, tWeaken, chance, usingFormulas } =
        getHackGrowWeakenTimes(ns, target);

    const moneyPerSecCap =
        maxMoney > 0 && tHack > 0 ? (maxMoney / tHack) * 1000 : 0;

    ns.tprint("?? TARGET SNAPSHOT");
    ns.tprint(`   Host: ${target}`);
    ns.tprint(
        "   ? Times: " +
        `H=${(tHack / 1000).toFixed(1)}s, ` +
        `G=${(tGrow / 1000).toFixed(1)}s, ` +
        `W=${(tWeaken / 1000).toFixed(1)}s`
    );
    ns.tprint(
        `   ?? Chance: ${(chance * 100).toFixed(1)}% | ` +
        `MinSec=${minSec.toFixed(2)}`
    );

    if (maxMoney > 0) {
        ns.tprint(
            "   ?? Theo cap: " +
            `Max=${ns.ns.formatNumber(maxMoney, "$0.00a")} | ` +
            `~${ns.ns.formatNumber(moneyPerSecCap, "$0.00a")}/sec (if perfectly farmed)`
        );
    }

    ns.tprint(
        usingFormulas
            ? "   ?? Timing model: Formulas.exe"
            : "   ?? Timing model: vanilla API (no Formulas.exe detected)"
    );
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const targetOverride = ns.args[0];

    // 1) PLAYER / HOME SUMMARY
    const player = ns.getPlayer();

    // Name may not exist in your version; fall back to a generic label
    const playerName =
        player && typeof player.name === "string" && player.name.length > 0
            ? player.name
            : "Player";

    // Hacking level is always safe via ns.getHackingLevel()
    const hackingLevel = ns.getHackingLevel();

    const money    = ns.getServerMoneyAvailable("home");
    const homeMax  = ns.getServerMaxRam("home");
    const homeUsed = ns.getServerUsedRam("home");
    const homeFree = homeMax - homeUsed;

    const guessedTarget = targetOverride || guessMainTarget(ns) || "unknown";

    ns.tprint("?? OPS DASHBOARD");
    ns.tprint("=================================================================");
    ns.tprint(`Player: ${playerName}   |   Hacking: ${hackingLevel}`);
    ns.tprint(`Money:  $${fmt(ns, money, 3)}`);
    ns.tprint(`Home RAM: ${homeUsed.toFixed(1)} / ${homeMax.toFixed(1)} GB (free ${homeFree.toFixed(1)} GB)`);
    ns.tprint(`Main target (guessed): ${guessedTarget}`);
    ns.tprint("=================================================================\n");

    // 1b) TARGET SNAPSHOT (formulas-aware when available)
    printTargetTiming(ns, guessedTarget);
    ns.tprint("");

    // 2) BOTNET STATUS (HOME + PSERV + NPC, HGW + BATCH)
    printBotnetStatus(ns, guessedTarget);

    // 3) PSERV FLEET DETAILS
    ns.tprint("");
    printPservStatus(ns);

    // 4) HACKNET SUMMARY
    ns.tprint("");
    printHacknetStatus(ns);

    ns.tprint("\n? Dashboard snapshot complete.");
}


/* ---------------- BOTNET STATUS ---------------- */

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

function guessMainTarget(ns) {
    const hosts = getAllServers(ns);
    const candidates = ["core/timed-net-batcher2.js", "botnet/remote-hgw.js"];

    for (const host of hosts) {
        const procs = ns.ps(host);
        for (const p of procs) {
            if (candidates.includes(p.filename) && p.args.length > 0) {
                return p.args[0];
            }
        }
    }
    return null;
}

function printBotnetStatus(ns, guessedTarget) {
    const allServers = getAllServers(ns);
    const pservsSet = new Set(ns.getPurchasedServers());

    const workerScript = "botnet/remote-hgw.js";
    const batchScripts = new Set(["batch/batch-hack.js", "batch/batch-grow.js", "batch/batch-weaken.js"]);

    let totalRooted = 0;
    let totalHGWThreads = 0;
    let totalBatchThreads = 0;

    let homeHGW = 0, homeBatch = 0;
    let pservHGW = 0, pservBatch = 0;
    let npcHGW = 0, npcBatch = 0;

    for (const host of allServers) {
        if (!ns.hasRootAccess(host)) continue;
        totalRooted++;

        const procs = ns.ps(host);
        const maxRam = ns.getServerMaxRam(host);

        let hgwThreads = 0;
        let batchThreads = 0;

        for (const p of procs) {
            if (p.filename === workerScript) {
                hgwThreads += p.threads;
            } else if (batchScripts.has(p.filename)) {
                batchThreads += p.threads;
            }
        }

        totalHGWThreads += hgwThreads;
        totalBatchThreads += batchThreads;

        const type =
            host === "home" ? "HOME" :
            pservsSet.has(host) ? "PSERV" :
            "NPC";

        if (type === "HOME") {
            homeHGW += hgwThreads;
            homeBatch += batchThreads;
        } else if (type === "PSERV") {
            pservHGW += hgwThreads;
            pservBatch += batchThreads;
        } else {
            npcHGW += hgwThreads;
            npcBatch += batchThreads;
        }
    }

    ns.tprint("??  BOTNET STATUS (HGW + BATCH)");
    ns.tprint("------------------------------------------------------------");
    ns.tprint(`Rooted servers:       ${totalRooted}`);
    ns.tprint("");
    ns.tprint("                 HGW Threads   Batch Threads");
    ns.tprint("                 -----------   -------------");
    ns.tprint(`Home:            ${String(homeHGW).padStart(11)}   ${String(homeBatch).padStart(13)}`);
    ns.tprint(`Purchased (pserv)${String(pservHGW).padStart(11)}   ${String(pservBatch).padStart(13)}`);
    ns.tprint(`NPC Servers:      ${String(npcHGW).padStart(11)}   ${String(npcBatch).padStart(13)}`);
    ns.tprint("                 -----------   -------------");
    ns.tprint(`TOTAL:           ${String(totalHGWThreads).padStart(11)}   ${String(totalBatchThreads).padStart(13)}`);
    ns.tprint("------------------------------------------------------------");
}


/* ---------------- PSERV STATUS ---------------- */

function printPservStatus(ns) {
    const pservs = ns.getPurchasedServers();
    const workerScript = "botnet/remote-hgw.js";

    ns.tprint("???  PURCHASed SERVER FLEET");
    if (pservs.length === 0) {
        ns.tprint("------------------------------------------------------------");
        ns.tprint("You don't own any purchased servers yet.");
        return;
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint("Server          RAM(GB)   HGW Threads   Target");
    ns.tprint("------------------------------------------------------------");

    let totalRam = 0;
    let totalThreads = 0;

    for (const host of pservs) {
        const ram = ns.getServerMaxRam(host);
        totalRam += ram;

        const procs = ns.ps(host);
        const hgwProcs = procs.filter(p => p.filename === workerScript);

        let threads = 0;
        let target = "-";

        if (hgwProcs.length > 0) {
            threads = hgwProcs.reduce((sum, p) => sum + p.threads, 0);
            target = hgwProcs[0].args[0] ?? "-";
        }

        totalThreads += threads;

        const namePad = host.padEnd(14, " ");
        const ramPad  = String(ram).padStart(7, " ");
        const thrPad  = String(threads).padStart(11, " ");

        ns.tprint(`${namePad}  ${ramPad}   ${thrPad}   ${target}`);
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint(`Total pservs:   ${pservs.length}`);
    ns.tprint(`Total RAM:      ${totalRam.toFixed(1)} GB`);
    ns.tprint(`Total HGW threads: ${totalThreads}`);
    ns.tprint("------------------------------------------------------------");
}


/* ---------------- HACKNET STATUS ---------------- */

function printHacknetStatus(ns) {
    const count = ns.hacknet.numNodes();
    ns.tprint("?? HACKNET STATUS");
    ns.tprint("------------------------------------------------------------");

    if (count === 0) {
        ns.tprint("You don't own any Hacknet nodes yet.");
        return;
    }

    ns.tprint("Idx  Level   RAM   Cores   Prod/sec        Lifetime");
    ns.tprint("------------------------------------------------------------");

    let totalProd = 0;
    let totalLife = 0;
    let totalLevels = 0;
    let totalRam = 0;
    let totalCores = 0;

    for (let i = 0; i < count; i++) {
        const s = ns.hacknet.getNodeStats(i);

        totalProd   += s.production;
        totalLife   += s.totalProduction;
        totalLevels += s.level;
        totalRam    += s.ram;
        totalCores  += s.cores;

        const idxStr  = String(i).padStart(2, " ");
        const lvlStr  = String(s.level).padStart(5, " ");
        const ramStr  = String(s.ram).padStart(5, " ");
        const coreStr = String(s.cores).padStart(6, " ");

        const prodStr = fmt(ns, s.production, 3).padStart(10, " ");
        const lifeStr = fmt(ns, s.totalProduction, 3).padStart(12, " ");

        ns.tprint(`${idxStr}  ${lvlStr}  ${ramStr}  ${coreStr}   ${prodStr}   ${lifeStr}`);
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint(`Nodes:      ${count}`);
    ns.tprint(`Avg Level:  ${(totalLevels / count).toFixed(1)}`);
    ns.tprint(`Avg RAM:    ${(totalRam / count).toFixed(1)} GB`);
    ns.tprint(`Avg Cores:  ${(totalCores / count).toFixed(1)}`);
    ns.tprint(`Total Prod: ${fmt(ns, totalProd, 3)} / sec`);
    ns.tprint(`Lifetime:   $${fmt(ns, totalLife, 3)}`);
    ns.tprint("------------------------------------------------------------");
}