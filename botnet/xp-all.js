/** botnet/xp-all.js
 * Hard-switch the entire botnet (home + pservs + NPC) into XP mode + monitor ETA.
 *
 * - Kills ALL other scripts on every rooted server (except this script on home), unless --no-kill.
 * - Chooses an XP target automatically if not provided (Formulas-aware when available).
 * - Deploys an XP worker in "xp" mode with as many threads as possible.
 * - Continuously monitors XP progress to a target hacking level (next level by default).
 *
 * Usage:
 *   run botnet/xp-all.js
 *   run botnet/xp-all.js joesguns
 *   run botnet/xp-all.js joesguns 2500
 *   run botnet/xp-all.js joesguns --delta 10
 *   run botnet/xp-all.js --to 2500
 *
 * @param {NS} ns
 */
export async function main(ns) {
    ns.disableLog("ALL");

    // Keep positional behavior:
    //   flags._[0] => xp target server
    //   flags._[1] => optional absolute target level
    const flags = ns.flags([
        ["help", false],

        // Deploy controls
        ["reserve", 32],     // GB to keep free on home
        ["min-ram", 2],      // skip hosts with less than this max RAM
        ["no-kill", false],
        ["dry-run", false],
        ["no-home", false],
        ["no-pserv", false],
        ["no-npc", false],
        ["verify", true],    // verify worker args after deploy

        // Worker selection
        // Default: in XP runs, use the ultra-light weaken-only worker.
        ["worker", ""],      // override worker script path

        // Monitor controls
        ["to", 0],           // absolute target hacking level
        ["delta", 0],        // levels above current
        ["interval", 10],    // seconds between monitor prints
        ["sample", 10],      // seconds to locally sample XP/sec if file missing/stale
        ["no-file", false],  // ignore data/xp-throughput.txt and always do local sampling
        ["no-monitor", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    const metricFile = "data/xp-throughput.txt";

    const dryRun = !!flags["dry-run"];
    const doKill = !flags["no-kill"];
    const verify = flags.verify !== false;

    const reserveHome = Math.max(0, Number(flags.reserve) || 0);
    const minRam = Math.max(0, Number(flags["min-ram"]) || 0);

    // Positional args
    const argXpTarget = flags._[0];             // server name
    const argLevelMaybe = Number(flags._[1]);   // absolute level (optional)

    // Pick XP target server
    const xpTarget = argXpTarget || chooseXpTarget(ns);

    // Force XP mode always
    const forcedMode = "xp";

    // Worker selection:
    // - Default for XP: botnet/remote-weaken-xp.js (lower RAM, faster overall XP/sec)
    // - Override via --worker
    const defaultXpWorker = "botnet/remote-weaken-xp.js";
    const fallbackWorker = "botnet/remote-hgw.js";

    const workerScript = String(flags.worker || "").trim() || defaultXpWorker;

    // Validate worker presence (fallback if user hasn't created the new script yet)
    let chosenWorker = workerScript;
    if (!ns.fileExists(chosenWorker, "home")) {
        // If they didn't make remote-weaken-xp yet, fall back gracefully.
        if (chosenWorker === defaultXpWorker && ns.fileExists(fallbackWorker, "home")) {
            ns.tprint(`?? ${defaultXpWorker} not found; falling back to ${fallbackWorker}.`);
            chosenWorker = fallbackWorker;
        } else {
            ns.tprint(`? Worker script not found on home: ${chosenWorker}`);
            ns.tprint("  Fix the path or copy the file to home, then re-run.");
            return;
        }
    }

    const workerRam = ns.getScriptRam(chosenWorker, "home");
    if (!workerRam || workerRam <= 0) {
        ns.tprint(`? ${chosenWorker} has 0 RAM cost on home (missing or miscompiled?).`);
        return;
    }

    // Determine target hacking level
    const player0 = ns.getPlayer();
    const currentLevel0 = getHackLevel(ns, player0);

    let targetLevel = 0;
    const to = Number(flags.to) || 0;
    const delta = Number(flags.delta) || 0;

    if (to > 0 && delta > 0) {
        ns.tprint("?? Both --to and --delta provided; preferring --to.");
    }

    if (to > 0) {
        targetLevel = to;
    } else if (Number.isFinite(argLevelMaybe) && argLevelMaybe > 0) {
        targetLevel = argLevelMaybe;
    } else if (delta > 0) {
        targetLevel = currentLevel0 + delta;
    } else {
        targetLevel = currentLevel0 + 1;
    }

    if (!Number.isFinite(targetLevel) || targetLevel <= currentLevel0) {
        ns.tprint("? Target level must be greater than your current level.");
        ns.tprint(`   Current: ${currentLevel0}, Requested: ${targetLevel}`);
        return;
    }

    ns.tprint("===============================================");
    ns.tprint("XP-ALL MODE: FULL BOTNET XP GRIND + MONITOR");
    ns.tprint("===============================================");
    ns.tprint(`XP target: ${xpTarget}`);
    ns.tprint(`Level target: ${targetLevel} (current ${currentLevel0})`);
    ns.tprint(`Worker: ${chosenWorker} (${workerRam.toFixed(2)} GB/thread)`);
    ns.tprint(`Worker mode: XP (forced)`);
    ns.tprint(
        `Options: reserveHome=${reserveHome}GB, minRam=${minRam}GB, ` +
        `kill=${doKill}, dryRun=${dryRun}, verify=${verify}, monitor=${!flags["no-monitor"]}`
    );

    if (argXpTarget) ns.tprint("Using manually provided XP target.");
    else if (hasFormulas(ns)) ns.tprint("XP target chosen automatically (Formulas.exe detected).");
    else ns.tprint("XP target chosen automatically (vanilla heuristic).");

    // ----------------------------
    // DEPLOY PHASE
    // ----------------------------
    const allServers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());
    const myPid = ns.pid;

    const hosts = [];
    for (const host of allServers) {
        if (host === "darkweb") continue;
        if (!ns.hasRootAccess(host)) continue;

        const isHome = host === "home";
        const isPserv = pservs.has(host);
        const isNpc = !isHome && !isPserv;

        if (isHome && flags["no-home"]) continue;
        if (isPserv && flags["no-pserv"]) continue;
        if (isNpc && flags["no-npc"]) continue;

        const maxRam = ns.getServerMaxRam(host);
        if (maxRam < minRam) continue;

        hosts.push(host);
    }

    const countHome = hosts.includes("home") ? 1 : 0;
    const countPserv = hosts.filter(h => pservs.has(h)).length;
    const countNpc = hosts.length - countHome - countPserv;
    ns.tprint(`Targets: home=${countHome}, pserv=${countPserv}, npc=${countNpc} (total ${hosts.length})`);

    if (dryRun) {
        ns.tprint("DRY RUN: No kills, no SCP, no exec will occur.");
    }

    if (hosts.includes("home")) {
        ns.tprint("Cleaning home (killing all other scripts)...");
        if (!dryRun && doKill) {
            for (const p of ns.ps("home")) {
                if (p.pid === myPid) continue;
                ns.kill(p.pid);
            }
        }
    }

    if (doKill) {
        ns.tprint("Cleaning rooted servers (killall)...");
        for (const host of hosts) {
            if (host === "home") continue;
            if (dryRun) continue;
            ns.killall(host);
        }
    }

    if (!dryRun) await ns.sleep(250);

    ns.tprint("Deploying XP workers...");
    let okCount = 0;
    let skipCount = 0;

    for (const host of hosts) {
        const isPserv = pservs.has(host);
        const res = deployXpWorker(ns, {
            host,
            target: xpTarget,
            mode: forcedMode,
            isPserv,
            workerScript: chosenWorker,
            workerRam,
            reserveHome,
            dryRun,
        });
        if (res === "ok") okCount++;
        else skipCount++;
    }

    ns.tprint(`XP deployment complete. Started on ${okCount}/${hosts.length} hosts (skipped ${skipCount}).`);

    // Verify that workers are actually in XP mode (args check)
    if (verify) {
        if (dryRun) {
            ns.tprint("Verify enabled, but DRY RUN prevents process inspection.");
        } else {
            await ns.sleep(250);
            const v = verifyWorkers(ns, hosts, chosenWorker, xpTarget, forcedMode);
            if (v.bad > 0) {
                ns.tprint("==============================================================");
                ns.tprint("?? WARNING: Some workers are not in forced XP mode as expected.");
                ns.tprint("   Re-run without --no-kill and ensure the worker script is correct.");
                ns.tprint("==============================================================");
            }
        }
    }

    // ----------------------------
    // MONITOR PHASE
    // ----------------------------
    if (flags["no-monitor"]) {
        ns.tprint("Monitor disabled (--no-monitor).");
        return;
    }

    const intervalSec = Math.max(1, Number(flags.interval) || 10);
    const sampleSeconds = Math.max(1, Number(flags.sample) || 10);

    const useFormulas = hasFormulas(ns);
    if (!useFormulas) {
        ns.tprint("?? Formulas.exe not found; monitor will show level progress but ETA will be unavailable.");
    }

    ns.tprint("===============================================");
    ns.tprint("MONITOR: XP progress (Ctrl+C to stop)");
    ns.tprint("===============================================");

    while (true) {
        const player = ns.getPlayer();
        const curLevel = getHackLevel(ns, player);
        const curXp = getHackXp(player);

        if (curLevel >= targetLevel) {
            ns.tprint(`?? Target reached! Current hacking level: ${curLevel} (target ${targetLevel})`);
            break;
        }

        let throughput = null;
        if (!flags["no-file"]) {
            throughput = readThroughputFresh(ns, metricFile);
            if (throughput) throughput.source = "file";
        }
        if (!throughput) {
            const xpPerSec = await measureXpPerSec(ns, sampleSeconds, 250);
            throughput = { xpPerSec, windowSeconds: sampleSeconds, ts: Date.now(), source: "local" };
        }

        ns.tprint("-----------------------------------------------");
        ns.tprint(`botnet/xp-all.js: ?? Level: ${curLevel}  ->  ${targetLevel}`);
        ns.tprint(`botnet/xp-all.js: ?? XP:    ${formatXp(ns, curXp)}`);

        if (useFormulas) {
            const mult = getBestSkillMult(ns, player, curXp, curLevel);
            const targetXp = xpForLevelBinarySearch(ns, targetLevel, mult);
            const xpNeeded = Math.max(0, targetXp - curXp);

            ns.tprint(`botnet/xp-all.js: ?? XP@T:  ${formatXp(ns, targetXp)}`);
            ns.tprint(`botnet/xp-all.js: ?? Need:  ${formatXp(ns, xpNeeded)} XP`);
            ns.tprint(`botnet/xp-all.js: ?? Mult:  ${mult.toFixed(6)}`);

            if (throughput && throughput.xpPerSec > 0) {
                const seconds = xpNeeded / throughput.xpPerSec;
                ns.tprint(`botnet/xp-all.js: ?? XP/s:  ${throughput.xpPerSec.toFixed(2)} (src=${throughput.source}, win=${throughput.windowSeconds}s)`);
                ns.tprint(`botnet/xp-all.js: ?  ETA:   ${formatDuration(seconds)}`);
            } else {
                ns.tprint("botnet/xp-all.js: ?? XP/s:  0.00  (are you currently gaining hacking XP?)");
            }
        } else {
            ns.tprint("botnet/xp-all.js: ?? Need:  (requires Formulas.exe for exact XP-to-level threshold/ETA)");
            if (throughput && throughput.xpPerSec > 0) {
                ns.tprint(`botnet/xp-all.js: ?? XP/s:  ${throughput.xpPerSec.toFixed(2)} (src=${throughput.source}, win=${throughput.windowSeconds}s)`);
            }
        }

        await ns.sleep(intervalSec * 1000);
    }

    ns.tprint("===============================================");
    ns.tprint("Done. Re-run your normal startup script to return to money mode.");
}

// ------------------------------------------------------------
// HELP
// ------------------------------------------------------------

/** @param {NS} ns */
function printHelp(ns) {
    const script = "botnet/xp-all.js";

    ns.tprint("==============================================================");
    ns.tprint(`HELP â€” ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");

    ns.tprint("DESCRIPTION");
    ns.tprint("  Hard-switch the entire botnet into XP mode (kills workloads, redeploys XP workers)");
    ns.tprint("  and continuously monitors progress/ETA to a target hacking level.");
    ns.tprint("");

    ns.tprint("NOTES");
    ns.tprint("  - Default XP worker is botnet/remote-weaken-xp.js (lowest RAM, fastest XP/sec).");
    ns.tprint("  - Override worker with --worker <path> (e.g. botnet/remote-hgw.js).");
    ns.tprint("  - Target server is positional arg #1 (or auto-picked).");
    ns.tprint("  - Target hacking level comes from: --to, OR positional arg #2, OR --delta, OR next level.");
    ns.tprint("  - Formulas.exe enables exact XP thresholds + accurate ETA.");
    ns.tprint("");

    ns.tprint("SYNTAX");
    ns.tprint("  run botnet/xp-all.js");
    ns.tprint("  run botnet/xp-all.js <xp-target>");
    ns.tprint("  run botnet/xp-all.js <xp-target> <target-level>");
    ns.tprint("  run botnet/xp-all.js --to <level>");
    ns.tprint("  run botnet/xp-all.js --delta <levels>");
    ns.tprint("");
    ns.tprint("OPTIONS");
    ns.tprint("  --worker <path>    Worker script to deploy (default botnet/remote-weaken-xp.js).");
    ns.tprint("  --reserve <GB>     Reserve RAM on home (default 32).");
    ns.tprint("  --min-ram <GB>     Skip hosts with less than this max RAM (default 2).");
    ns.tprint("  --no-kill          Do not kill existing scripts (just tries to start XP workers).");
    ns.tprint("  --dry-run          Print actions only; no kills/SCP/exec.");
    ns.tprint("  --no-home          Do not deploy to home.");
    ns.tprint("  --no-pserv         Do not deploy to purchased servers.");
    ns.tprint("  --no-npc           Do not deploy to NPC servers.");
    ns.tprint("  --verify           Verify worker args after deploy (default true).");
    ns.tprint("  --interval <sec>   Monitor print interval (default 10).");
    ns.tprint("  --sample <sec>     Local XP/sec sample window if file missing/stale (default 10).");
    ns.tprint("  --no-file          Ignore data/xp-throughput.txt and always sample locally.");
    ns.tprint("  --no-monitor       Deploy only; skip monitoring loop.");
    ns.tprint("  --help             Show this help and exit.");
}

// ------------------------------------------------------------
// Internal helpers (unchanged except worker verification)
// ------------------------------------------------------------

/** @param {NS} ns */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas?.skills &&
            ns.formulas?.hacking &&
            typeof ns.formulas.skills.calculateSkill === "function"
        );
    } catch (_e) {
        return false;
    }
}

/** @param {NS} ns */
function getHackLevel(ns, player) {
    try {
        if (typeof ns.getHackingLevel === "function") return ns.getHackingLevel();
    } catch (_e) { /* ignore */ }

    if (typeof player.hacking === "number") return player.hacking;
    if (player.skills && typeof player.skills.hacking === "number") return player.skills.hacking;
    return 0;
}

function getHackXp(player) {
    if (player.exp && typeof player.exp.hacking === "number") return player.exp.hacking;
    if (typeof player.hacking_exp === "number") return player.hacking_exp;
    return 0;
}

function getEffectiveSkillMult(ns, currentXp, currentLevel) {
    try {
        const baseLevel = ns.formulas.skills.calculateSkill(currentXp, 1);
        if (!Number.isFinite(baseLevel) || baseLevel <= 0) return 1;

        const mult = currentLevel / baseLevel;
        if (!Number.isFinite(mult) || mult <= 0) return 1;

        return mult;
    } catch (_e) {
        return 1;
    }
}

function getBestSkillMult(ns, player, curXp, curLevel) {
    const m = Number(player?.mults?.hacking);
    if (Number.isFinite(m) && m > 0) return m;
    return getEffectiveSkillMult(ns, curXp, curLevel);
}

function xpForLevelBinarySearch(ns, level, mult) {
    if (level <= 1) return 0;

    let lo = 0;
    let hi = 1;

    while (ns.formulas.skills.calculateSkill(hi, mult) < level) {
        hi *= 2;
        if (!Number.isFinite(hi) || hi <= 0) return hi;
        if (hi > 1e308) return hi;
    }

    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const midLevel = ns.formulas.skills.calculateSkill(mid, mult);
        if (midLevel >= level) hi = mid;
        else lo = mid;
    }

    return hi;
}

function verifyWorkers(ns, hosts, workerScript, target, mode) {
    let ok = 0;
    let bad = 0;

    for (const host of hosts) {
        const procs = ns.ps(host);
        const found = procs.filter(p => p.filename === workerScript);

        if (found.length === 0) {
            bad++;
            ns.tprint(`?? VERIFY FAIL ${host}: no ${workerScript} running`);
            continue;
        }

        const match = found.some(p => {
            const a0 = String(p.args?.[0] ?? "");
            const a1 = String(p.args?.[1] ?? "").toLowerCase();
            return a0 === target && a1 === mode;
        });

        if (!match) {
            bad++;
            const sample = found[0];
            ns.tprint(`?? VERIFY FAIL ${host}: args mismatch. Example args: ${JSON.stringify(sample.args)}`);
        } else {
            ok++;
        }
    }

    ns.tprint(`Verify: ok=${ok}, bad=${bad}`);
    return { ok, bad };
}

function readThroughputFresh(ns, file) {
    try {
        if (!ns.fileExists(file, "home")) return null;
        const text = ns.read(file);
        if (!text) return null;

        const data = JSON.parse(text);
        if (!data || typeof data.xpPerSec !== "number") return null;

        const windowSeconds = Number(data.windowSeconds) || 0;
        const ts = Number(data.ts) || 0;

        if (!Number.isFinite(ts) || ts <= 0) return null;
        if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) return null;

        const ageSec = (Date.now() - ts) / 1000;
        if (ageSec > windowSeconds * 2) return null;

        return { xpPerSec: data.xpPerSec, windowSeconds, ts };
    } catch (_e) {
        return null;
    }
}

async function measureXpPerSec(ns, durationSeconds, tickMs) {
    const startT = Date.now();
    const startXp = getHackXp(ns.getPlayer());

    let lastXp = startXp;

    while (Date.now() - startT < durationSeconds * 1000) {
        await ns.sleep(tickMs);

        const xp = getHackXp(ns.getPlayer());
        if (xp < lastXp) return 0;
        lastXp = xp;
    }

    const endT = Date.now();
    const endXp = getHackXp(ns.getPlayer());

    const dt = (endT - startT) / 1000;
    const dx = endXp - startXp;

    if (dt <= 0 || dx <= 0) return 0;
    return dx / dt;
}

function formatXp(ns, xp) {
    if (typeof ns.nFormat === "function") {
        return ns.nFormat(xp, "0,0.00") + ` (${xp.toFixed(2)})`;
    }
    return xp.toFixed(2);
}

function formatDuration(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));

    const days = Math.floor(totalSeconds / 86400);
    totalSeconds -= days * 86400;

    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds -= hours * 3600;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(" ");
}

function deployXpWorker(ns, opts) {
    const {
        host, target, mode, isPserv,
        workerScript, workerRam,
        reserveHome, dryRun
    } = opts;

    const maxRam = ns.getServerMaxRam(host);
    if (maxRam < 2) {
        ns.print(`Skipping ${host}: only ${maxRam}GB RAM`);
        return "skip";
    }

    if (host !== "home") {
        if (!dryRun) {
            const ok = ns.scp(workerScript, host, "home");
            if (!ok) {
                ns.tprint(`Failed to SCP ${workerScript} to ${host}`);
                return "skip";
            }
        }
    }

    const usedNow = ns.getServerUsedRam(host);
    let usableRam = Math.max(0, maxRam - usedNow);

    if (host === "home") {
        usableRam = Math.max(0, usableRam - reserveHome);
    }

    const threads = Math.floor(usableRam / workerRam);
    if (threads < 1) {
        ns.print(`${host}: not enough free RAM for 1 XP thread (free=${usableRam.toFixed(2)}GB).`);
        return "skip";
    }

    const label =
        host === "home"
            ? "HOME"
            : isPserv
            ? "PSERV"
            : "NPC";

    if (dryRun) {
        ns.tprint(
            `[DRY] ${label.padEnd(5)} ${host}: would run ${workerScript} x${threads} -> ` +
            `${target} [${mode.toUpperCase()}]`
        );
        return "ok";
    }

    const pid = ns.exec(workerScript, host, threads, target, mode);
    if (pid === 0) {
        ns.tprint(`Failed to start ${workerScript} on ${host}`);
        return "skip";
    }

    ns.tprint(
        `${label.padEnd(5)} ${host}: ${workerScript} x${threads} -> ` +
        `${target} [${mode.toUpperCase()}]`
    );

    return "ok";
}

function chooseXpTarget(ns) {
    const playerHack = ns.getHackingLevel();
    const servers = getAllServers(ns);

    let best = "n00dles";
    let bestReqHack = 0;

    const useFormulas = hasFormulas(ns);
    let bestScore = -1;

    const player = useFormulas ? ns.getPlayer() : null;

    for (const host of servers) {
        if (host === "home") continue;
        if (host === "darkweb") continue;
        if (!ns.hasRootAccess(host)) continue;

        const s = ns.getServer(host);
        const maxMoney = s.moneyMax;

        const reqHack = (s.requiredHackingSkill || s.requiredHackingSkill === 0)
            ? s.requiredHackingSkill
            : ns.getServerRequiredHackingLevel(host);

        if (maxMoney <= 0) continue;
        if (reqHack > playerHack) continue;

        if (useFormulas) {
            const serverClone = ns.getServer(host);
            if (typeof serverClone.minDifficulty === "number") {
                serverClone.hackDifficulty = serverClone.minDifficulty;
            }
            if (typeof serverClone.moneyMax === "number" && serverClone.moneyMax > 0) {
                serverClone.moneyAvailable = serverClone.moneyMax;
            }

            const tWeaken = ns.formulas.hacking.weakenTime(serverClone, player);
            if (tWeaken <= 0) continue;

            const score = reqHack / tWeaken;

            if (score > bestScore) {
                bestScore = score;
                best = host;
                bestReqHack = reqHack;
            }
        } else {
            if (reqHack > bestReqHack) {
                bestReqHack = reqHack;
                best = host;
            }
        }
    }

    return best;
}

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
//pew mew