/** @param {NS} ns */
/*
 * bitnode-reset-autostart.js
 *
 * Run this right after installing Augs / starting a new BitNode.
 * Goals:
 *  - Clean up home (lightly) and bring up a simple HGW farm ASAP
 *  - Use `remote-hgw.js` if available, otherwise fall back to early-hack-template-style hacking
 *  - Push workers to the classic early servers (sigma-cosmetics, joesguns, etc.)
 *  - Once you have enough RAM / pservs / stats, automatically hand off to
 *    `startup-home-advanced.js` for your full late-game automation.
 *
 * Safe to re-run; it will just refresh deployments and re-check thresholds.
 */

export async function main(ns) {
    ns.disableLog("ALL");

    // ────────────────────────────────────────────────
    // CONFIG / THRESHOLDS
    // ────────────────────────────────────────────────

    // When these “progress” conditions are met, we hand off to advanced startup.
    const MIN_HOME_RAM_FOR_ADVANCED = 64;   // GB
    const MIN_HACK_FOR_ADVANCED     = 200;  // hacking level
    const MIN_PSERV_COUNT_FOR_ADV   = 1;    // at least one purchased server

    // Early-game “fixed” server lists from the official getting-started guide.
    const servers0Port = [
        "n00dles",
        "sigma-cosmetics",
        "joesguns",
        "nectar-net",
        "hong-fang-tea",
        "harakiri-sushi",
    ];

    const servers1Port = [
        "neo-net",
        "zer0",
        "max-hardware",
        "iron-gym",
    ];

    const advancedStartupScript = "startup-home-advanced.js";
    const remoteWorkerScript    = "remote-hgw.js";
    const fallbackHackScript    = "early-hack-template.js"; // optional, if you keep it around

    // ────────────────────────────────────────────────
    // HELPER: pick a starter target (n00dles → joesguns)
    // ────────────────────────────────────────────────

    function chooseStarterTarget() {
        const hacking = ns.getHackingLevel();

        // Prefer joesguns once we can actually hack it; otherwise fall back.
        if (ns.serverExists("joesguns")) {
            const s = ns.getServer("joesguns");
            if (hacking >= s.requiredHackingSkill) {
                return "joesguns";
            }
        }

        if (ns.serverExists("n00dles")) return "n00dles";

        // Extreme edge case: if somehow neither exists, just pick home (no-op-ish).
        return "n00dles";
    }

    // ────────────────────────────────────────────────
    // HELPER: choose which worker script we’ll use
    // ────────────────────────────────────────────────

    function chooseWorkerScript() {
        if (ns.fileExists(remoteWorkerScript, "home")) {
            return remoteWorkerScript; // preferred: HGW worker used by your botnet stack
        }
        if (ns.fileExists(fallbackHackScript, "home")) {
            return fallbackHackScript; // simple hack/grow/weaken loop (guide-style)
        }
        return null;
    }

    // ────────────────────────────────────────────────
    // HELPER: simple, RAM-safe exec wrapper
    // ────────────────────────────────────────────────

    function safeExec(host, script, threads, ...args) {
        if (!ns.fileExists(script, host)) {
            ns.print(`⚠️ ${host}: ${script} not found; skipping exec.`);
            return 0;
        }
        if (threads < 1) return 0;

        const ramPerThread = ns.getScriptRam(script, host);
        const maxRam = ns.getServerMaxRam(host);
        const used   = ns.getServerUsedRam(host);

        const maxPossibleThreads = Math.floor((maxRam - used) / ramPerThread);
        if (maxPossibleThreads <= 0) return 0;

        const actualThreads = Math.min(threads, maxPossibleThreads);
        const pid = ns.exec(script, host, actualThreads, ...args);
        if (pid === 0) {
            ns.print(`❌ ${host}: exec failed for ${script} x${actualThreads}`);
        } else {
            ns.print(`▶️ ${host}: started ${script} x${actualThreads} ${JSON.stringify(args)}`);
        }
        return pid;
    }

    // ────────────────────────────────────────────────
    // HELPER: gain root on a host (up to available port crackers)
    // ────────────────────────────────────────────────

    function countPortCrackers() {
        const programs = [
            "BruteSSH.exe",
            "FTPCrack.exe",
            "relaySMTP.exe",
            "HTTPWorm.exe",
            "SQLInject.exe",
        ];
        return programs.filter(p => ns.fileExists(p, "home")).length;
    }

    function tryRoot(host) {
        if (ns.hasRootAccess(host)) return true;
        if (!ns.serverExists(host)) return false;

        const neededPorts = ns.getServerNumPortsRequired(host);
        const crackers = countPortCrackers();

        if (!ns.fileExists("NUKE.exe", "home")) {
            ns.print(`⚠️ No NUKE.exe found; cannot root ${host} yet.`);
            return false;
        }

        // Use port crackers we do have, in the usual order
        if (crackers >= 1 && ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
        if (crackers >= 2 && ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
        if (crackers >= 3 && ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
        if (crackers >= 4 && ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
        if (crackers >= 5 && ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);

        if (crackers < neededPorts) {
            ns.print(`💤 ${host}: needs ${neededPorts} ports, we only have ${crackers}.`);
            return false;
        }

        try {
            ns.nuke(host);
        } catch (e) {
            ns.print(`❌ nuke(${host}) failed: ${String(e)}`);
            return false;
        }

        return ns.hasRootAccess(host);
    }

    // ────────────────────────────────────────────────
    // HELPER: deploy worker to a list of servers
    // ────────────────────────────────────────────────

    function deployToServers(hosts, worker, target, modeArg) {
        for (const host of hosts) {
            if (!ns.serverExists(host)) continue;

            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < 2) {
                ns.print(`💤 Skipping ${host}: only ${maxRam}GB RAM.`);
                continue;
            }

            const rooted = tryRoot(host);
            if (!rooted) continue;

            // Ensure worker is present
            const ok = ns.scp(worker, host);
            if (!ok) {
                ns.print(`⚠️ Failed to SCP ${worker} to ${host}`);
                continue;
            }

            const ramPerThread = ns.getScriptRam(worker, host);
            if (ramPerThread <= 0) {
                ns.print(`⚠️ ${worker} RAM unknown on ${host}; skipping.`);
                continue;
            }

            const threads = Math.floor(maxRam / ramPerThread);
            if (threads < 1) {
                ns.print(`⚠️ ${host}: not enough RAM for ${worker}.`);
                continue;
            }

            // Kill old instance(s) using this worker on that host
            ns.killall(host);

            if (worker === remoteWorkerScript) {
                safeExec(host, worker, threads, target, modeArg);
            } else {
                // early-hack-template.js takes only a target arg (no mode)
                safeExec(host, worker, threads, target);
            }
        }
    }

    // ────────────────────────────────────────────────
    // STARTUP PHASE: choose worker + target, clean home, deploy
    // ────────────────────────────────────────────────

    const worker = chooseWorkerScript();
    if (!worker) {
        ns.tprint("❌ bitnode-reset-autostart: No worker found.");
        ns.tprint("   Expected one of:");
        ns.tprint(`   - ${remoteWorkerScript}`);
        ns.tprint(`   - ${fallbackHackScript}`);
        ns.tprint("   Please copy your toolkit onto 'home' first.");
        return;
    }

    const starterTarget = chooseStarterTarget();
    ns.tprint("==================================================");
    ns.tprint("🚀 BitNode Reset Autostart");
    ns.tprint("==================================================");
    ns.tprint(`👾 Worker script : ${worker}`);
    ns.tprint(`🎯 Starter target : ${starterTarget}`);
    ns.tprint("==================================================");

    // Light “clean” home: kill other scripts, but keep this one alive.
    const myPid = ns.pid;
    for (const proc of ns.ps("home")) {
        if (proc.pid === myPid) continue;
        ns.kill(proc.pid);
    }

    // Give the kills a moment to land
    await ns.sleep(200);

    // Ensure we have root & local worker on home as well
    tryRoot("home");
    if (!ns.fileExists(worker, "home")) {
        ns.tprint(`⚠️ Worker ${worker} not present on home? (Did you forget to copy it?)`);
    }

    // Start worker on home
    {
        const host = "home";
        const maxRam = ns.getServerMaxRam(host);
        const used   = ns.getServerUsedRam(host);
        const ramPerThread = ns.getScriptRam(worker, host);

        const freeRam = maxRam - used;
        const homeThreads = Math.max(1, Math.floor(freeRam / ramPerThread));

        if (homeThreads < 1) {
            ns.tprint("⚠️ Not enough free RAM on home to start worker.");
        } else {
            if (worker === remoteWorkerScript) {
                safeExec(host, worker, homeThreads, starterTarget, "xp");
            } else {
                safeExec(host, worker, homeThreads, starterTarget);
            }
        }
    }

    // Deploy to the early 0-port servers immediately
    deployToServers(servers0Port, worker, starterTarget, "xp");

    // If/when we have BruteSSH (or more), also deploy to 1-port servers
    if (countPortCrackers() >= 1) {
        deployToServers(servers1Port, worker, starterTarget, "xp");
    }

    // ────────────────────────────────────────────────
    // MONITOR LOOP: wait until we’re “big enough”, then hand off
    // ────────────────────────────────────────────────

    while (true) {
        await ns.sleep(30_000); // check every 30s; adjust if you like

        const homeRam   = ns.getServerMaxRam("home");
        const hackLevel = ns.getHackingLevel();
        const pservs    = ns.getPurchasedServers().length;

        const readyForAdvanced =
            homeRam >= MIN_HOME_RAM_FOR_ADVANCED ||
            hackLevel >= MIN_HACK_FOR_ADVANCED   ||
            pservs >= MIN_PSERV_COUNT_FOR_ADV;

        ns.print(
            `Heartbeat: homeRam=${homeRam}GB, hack=${hackLevel}, pservs=${pservs}` +
            ` → readyForAdvanced=${readyForAdvanced}`
        );

        if (!readyForAdvanced) continue;

        if (!ns.fileExists(advancedStartupScript, "home")) {
            ns.tprint(`⚠️ Would transition to ${advancedStartupScript}, but it is missing.`);
            ns.tprint("   Leaving simple HGW online; please sync your toolkit and run it manually.");
            continue; // we stay as a simple monitor
        }

        // Try to keep a little RAM free so startup-home-advanced can launch comfortably
        const startupRam = ns.getScriptRam(advancedStartupScript, "home") || 4;
        const freeRam    = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");

        if (freeRam < startupRam) {
            ns.print(`💤 Waiting for enough free RAM to start ${advancedStartupScript}...`);
            continue;
        }

        ns.tprint("==================================================");
        ns.tprint("🎉 Progress threshold reached!");
        ns.tprint(`   homeRAM=${homeRam}GB, hack=${hackLevel}, pservs=${pservs}`);
        ns.tprint(`   Handing off to ${advancedStartupScript} ...`);
        ns.tprint("==================================================");

        const pid = ns.exec(advancedStartupScript, "home", 1);
        if (pid === 0) {
            ns.tprint(`❌ Failed to start ${advancedStartupScript}; will retry later.`);
        } else {
            ns.tprint(`▶️ ${advancedStartupScript} launched with pid=${pid}.`);
            // startup-home-advanced will kill us shortly anyway; we just exit.
            return;
        }
    }
}
