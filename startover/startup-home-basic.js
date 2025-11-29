/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Aggressive home usage for early bitnodes
    const HOME_RAM_RESERVE = 2;   // leave a small buffer for manual scripts
    const PSERV_TARGET_RAM = 32;  // cap per your request

    const overrideTarget = ns.args[0] || null;

    const hackingLevel = ns.getHackingLevel();
    const portCrackers = countPortCrackers(ns);
    const autoTarget = chooseBasicTarget(ns, portCrackers, hackingLevel);
    const target = overrideTarget || autoTarget;

    ns.tprint("=======================================");
    ns.tprint("      🚀 BASIC STARTUP (fresh node)    ");
    ns.tprint("=======================================");
    ns.tprint(`🧠 Hacking level:  ${hackingLevel}`);
    ns.tprint(`🛠 Port crackers:  ${portCrackers}`);
    ns.tprint(`🎯 Chosen target:  ${target}`);
    if (overrideTarget) {
        ns.tprint(`(Manual override applied from args[0])`);
    }
    ns.tprint("=======================================\n");

    // --- Always killall on home (except this script) ---
    ns.tprint("🏠 Killing all processes on home (except startup-home-basic.js).");
    const myPid = ns.pid;
    for (const p of ns.ps("home")) {
        if (p.pid === myPid) continue;
        ns.kill(p.pid);
    }
    await ns.sleep(200);
    ns.tprint("✔️ Home is clean. Launching basic automation...\n");

    function safeExec(script, threads = 1, ...args) {
        if (!ns.fileExists(script, "home")) {
            ns.tprint(`⚠️ Missing script: ${script}`);
            return;
        }

        const ramCost = ns.getScriptRam(script, "home") * threads;
        const used = ns.getServerUsedRam("home");
        const max = ns.getServerMaxRam("home");
        const free = max - used - HOME_RAM_RESERVE;

        if (ramCost > free) {
            ns.tprint(`❌ Not enough RAM to start ${script} (${threads} threads).`);
            return;
        }

        const pid = ns.exec(script, "home", threads, ...args);
        if (pid === 0) {
            ns.tprint(`❌ Failed to launch ${script}`);
        } else {
            const argInfo = args.length ? ` ${JSON.stringify(args)}` : "";
            ns.tprint(`▶️ Started ${script} (pid ${pid})${argInfo}`);
        }
    }

    // Core stack
    safeExec("pserv-manager-basic.js", 1, PSERV_TARGET_RAM);
    safeExec("root-and-deploy-basic.js", 1, target);

    // Use leftover home RAM to hack with remote-hgw-basic.js
    const worker = "remote-hgw-basic.js";
    if (!ns.fileExists(worker, "home")) {
        ns.tprint("⚠️ remote-hgw-basic.js not found on home; home will not hack.");
    } else {
        const max = ns.getServerMaxRam("home");
        const used = ns.getServerUsedRam("home");
        const free = max - used - HOME_RAM_RESERVE;
        const scriptRam = ns.getScriptRam(worker, "home");
        const threads = Math.floor(free / scriptRam);

        if (threads >= 1) {
            const pid = ns.exec(worker, "home", threads, target);
            if (pid === 0) {
                ns.tprint("⚠️ Failed to start remote-hgw-basic.js on home.");
            } else {
                ns.tprint(`🚀 Launched remote-hgw-basic.js on home x${threads} vs ${target}`);
            }
        } else {
            ns.tprint("ℹ️ Not enough free RAM on home for remote-hgw-basic.js.");
        }
    }

    ns.tprint("\n🎉 BASIC STARTUP COMPLETE — early-game money engine online.");
}

/**
 * Simple static progression for early-game money targets.
 * Picks the "highest" server in the list that you can both hack and root.
 */
function chooseBasicTarget(ns, portCrackers, hackingLevel) {
    const candidates = [
        "n00dles",
        "foodnstuff",
        "sigma-cosmetics",
        "joesguns",
        "nectar-net",
        "hong-fang-tea",
        "harakiri-sushi",
        "neo-net",
        "max-hardware",
        "iron-gym",
        "silver-helix",
        "phantasy",
        "omega-net",
        "the-hub",
        "comptek",
        "rothman-uni",
        "catalyst",
        "summit-uni",
    ];

    let best = "n00dles";

    for (const host of candidates) {
        if (!ns.serverExists(host)) continue;

        const s = ns.getServer(host);
        const reqHack = s.requiredHackingSkill;
        const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
        const maxMoney = s.moneyMax ?? 0;

        if (reqHack > hackingLevel) continue;
        if (reqPorts > portCrackers) continue;
        if (maxMoney <= 0) continue;

        // Because the list is in increasing difficulty, we just keep the last valid one
        best = host;
    }

    return best;
}

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
