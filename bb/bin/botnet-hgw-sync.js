/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags([
        ["help", false],
        ["tick", 10_000],          // resync interval
        ["minRam", 2],             // skip hosts below this max RAM
        ["reserveFrac", 0.05],     // leave this fraction of FREE ram unused on each host
        ["verbose", false],        // extra logging
        ["killAll", false],        // if true, killall(host) when redeploying (NPC-only, still skips pserv/home)
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Positional args
    const target = String(flags._[0] || "omega-net");
    const mode = String(flags._[1] || "xp").toLowerCase();
    const workerScript = "botnet/remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`[X] ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`[OK] Botnet HGW sync started. Target: ${target} | Mode: ${mode.toUpperCase()}`);

    const lastMaxRam = {};       // remember last seen MAX ram (for “RAM upgraded” redeploy)
    const failStreak = {};       // per-host exponential backoff when exec keeps failing
    const nextTryAt = {};        // per-host next allowed attempt time (ms)

    while (true) {
        const now = Date.now();

        // IMPORTANT: refresh purchased servers EVERY cycle (pserv-manager can add/upgrade them anytime)
        const pservs = new Set(ns.getPurchasedServers());
        const allServers = getAllServers(ns);

        for (const host of allServers) {
            // Skip home
            if (host === "home") continue;

            // Skip purchased servers (dynamic) + belt-and-suspenders prefix check
            if (pservs.has(host)) continue;
            if (host.startsWith("pserv-")) continue;

            if (!ns.hasRootAccess(host)) continue;

            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < Number(flags.minRam)) {
                if (flags.verbose) ns.print(`[skip] ${host}: maxRam=${maxRam}GB < minRam=${flags.minRam}GB`);
                continue;
            }

            // Backoff gate (prevents log spam + tight loops when a host can’t run the worker yet)
            if ((nextTryAt[host] ?? 0) > now) continue;

            const prevMax = lastMaxRam[host] ?? 0;

            // “Expected running” check (args-sensitive)
            const runningExpected = ns.isRunning(workerScript, host, target, mode);

            // Also detect any stale instances of the worker (different args) consuming RAM
            const processes = ns.ps(host);
            const stalePids = [];
            for (const p of processes) {
                if (p.filename === workerScript) {
                    // Keep the one that exactly matches args; everything else is stale
                    const args = p.args || [];
                    const isExact = args.length === 2 && String(args[0]) === target && String(args[1]).toLowerCase() === mode;
                    if (!isExact) stalePids.push(p.pid);
                }
            }

            // Worker missing on host?
            const missingOnHost = !ns.fileExists(workerScript, host);

            // Redeploy when:
            //  - not running (expected),
            //  - RAM increased since last pass,
            //  - worker missing on host,
            //  - or stale worker instances exist (they can block RAM + cause exec failures)
            const needsDeploy =
                !runningExpected ||
                maxRam > prevMax ||
                missingOnHost ||
                stalePids.length > 0;

            if (!needsDeploy) continue;

            ns.tprint(`+ (re)deploying HGW on ${host}: RAM ${prevMax}GB -> ${maxRam}GB`);

            // Kill stale worker instances first (these are the #1 cause of “exec=0 forever” after stage switches)
            for (const pid of stalePids) ns.kill(pid);

            // Kill the “expected” worker too, if it’s running (ensures clean thread recalculation)
            if (runningExpected) ns.kill(workerScript, host, target, mode);

            // Optional nuclear option (still safe because we never touch home/pservs here)
            if (flags.killAll) ns.killall(host);

            // Ensure script exists on host
            const ok = await ns.scp(workerScript, host);
            if (!ok) {
                ns.tprint(`[X] Failed to SCP ${workerScript} to ${host}`);
                bumpBackoff(host, failStreak, nextTryAt, now);
                continue;
            }

            // IMPORTANT FIX: threads based on FREE ram, not MAX ram
            const scriptRam = ns.getScriptRam(workerScript);
            const usedRam = ns.getServerUsedRam(host);
            const freeRam = Math.max(0, maxRam - usedRam);

            // Leave a little breathing room so we don’t thrash if something else starts on the host
            const usable = freeRam * (1 - Number(flags.reserveFrac));
            const threads = Math.floor(usable / scriptRam);

            if (threads < 1) {
                ns.tprint(
                    `[WARN] ${host}: not enough FREE RAM. max=${maxRam} used=${usedRam.toFixed(1)} free=${freeRam.toFixed(
                        1
                    )} script=${scriptRam.toFixed(1)}`
                );
                bumpBackoff(host, failStreak, nextTryAt, now);
                // still record maxRam so “RAM upgraded” logic doesn’t spam redeploy messages
                lastMaxRam[host] = maxRam;
                continue;
            }

            const pid = ns.exec(workerScript, host, threads, target, mode);
            if (pid === 0) {
                // This is the actionable diagnostic you were missing
                ns.tprint(
                    `[X] Failed to start ${workerScript} on ${host} | threads=${threads} max=${maxRam} used=${usedRam.toFixed(
                        1
                    )} free=${freeRam.toFixed(1)} scriptRam=${scriptRam.toFixed(1)}`
                );
                bumpBackoff(host, failStreak, nextTryAt, now);
                continue;
            }

            // Success: reset backoff + remember RAM
            failStreak[host] = 0;
            nextTryAt[host] = 0;
            lastMaxRam[host] = maxRam;

            if (flags.verbose) {
                ns.tprint(`[OK] ${host}: running ${workerScript} x${threads} vs ${target} [${mode}] (pid=${pid})`);
            } else {
                ns.print(`[OK] ${host}: running ${workerScript} x${threads} vs ${target} [${mode}]`);
            }
        }

        await ns.sleep(Number(flags.tick));
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

/**
 * Exponential backoff per-host to avoid tight “redeploy spam” loops when exec keeps failing.
 * Backoff: 10s, 20s, 40s, 80s, ... up to 5 minutes.
 */
function bumpBackoff(host, failStreak, nextTryAt, nowMs) {
    const s = (failStreak[host] ?? 0) + 1;
    failStreak[host] = s;

    const base = 10_000;
    const delay = Math.min(300_000, base * Math.pow(2, Math.min(8, s - 1)));
    nextTryAt[host] = nowMs + delay;
}

function printHelp(ns) {
    ns.tprint("/bin/botnet-hgw-sync.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Keep botnet/remote-hgw.js deployed on all rooted NPC servers.");
    ns.tprint("  Skips home and purchased servers (pserv-*) so batchers/pserv-manager own those.");
    ns.tprint("  FIXED: threads are computed from FREE RAM (max-used), so it won’t loop forever after stage switches.");
    ns.tprint("  FIXED: kills stale remote-hgw.js instances with mismatched args that can block RAM.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint('  Target defaults to "omega-net" when no argument is provided.');
    ns.tprint('  Mode controls worker behavior: "xp" (default) or "money".');
    ns.tprint("  Requires botnet/remote-hgw.js to exist on home before running.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run /bin/botnet-hgw-sync.js [target] [mode] [--tick ms] [--minRam gb] [--reserveFrac 0.05] [--verbose true] [--killAll true] [--help]");
}
