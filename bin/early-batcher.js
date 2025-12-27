/** /bin/early-batcher.js


 *


 * Simple early-game HWGW batcher that:


 *   - Runs only on home


 *   - Auto-selects a money target (or uses a manual override)


 *   - Uses a simple H/G/W ratio with up to ~90% of home RAM


 *


 * Usage:


 *   run /bin/early-batcher.js


 *   run /bin/early-batcher.js <target>


 *   run /bin/early-batcher.js --help


 *


 * @param {NS} ns


 */





// ------------------------------------------------------------


// Minimal HELP: Description, Notes, Syntax


// ------------------------------------------------------------


function printHelp(ns) {


    const script = "/bin/early-batcher.js";





    ns.tprint("==============================================================");


    ns.tprint(`HELP - ${script}`);


    ns.tprint("==============================================================");


    ns.tprint("");





    // DESCRIPTION


    ns.tprint("DESCRIPTION");


    ns.tprint("  Early-game HWGW batcher that runs only on home.");


    ns.tprint("  Picks a target automatically based on money/growth/security,");


    ns.tprint("  or uses a manual override if you supply one.");


    ns.tprint("");


    ns.tprint("  It repeatedly:");


    ns.tprint("    - Computes how much of home's RAM is available (up to 90%),");


    ns.tprint("    - Schedules a single batch with 20% hack, 40% grow, 40% weaken,");


    ns.tprint("    - Waits for weaken to finish, then repeats.");


    ns.tprint("");





    // NOTES


    ns.tprint("NOTES");


    ns.tprint("  - Runs only on home; does not use purchased servers.");


    ns.tprint("  - Requires batch/hack-worker.js, batch/grow-worker.js,");


    ns.tprint("    and batch/weaken-worker.js to exist on home.");


    ns.tprint("  - Uses findBestTarget(ns) when no target is provided.");


    ns.tprint("  - Attempts to gain root on the chosen target using available");


    ns.tprint("    port crackers before starting batches.");


    ns.tprint("");





    // SYNTAX


    ns.tprint("SYNTAX");


    ns.tprint("  run /bin/early-batcher.js");


    ns.tprint("  run /bin/early-batcher.js <target>");


    ns.tprint("  run /bin/early-batcher.js --help");


    ns.tprint("");





    ns.tprint("==============================================================");


    ns.tprint("");


}





// ------------------------------------------------------------


// Flag parser for this script


// ------------------------------------------------------------





function parseFlags(ns) {


    const flags = ns.flags([


        ["help", false],


    ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }





    const positionals = flags._ || [];


    const wantsHelp = flags.help;





    return { flags, positionals, wantsHelp };


}





// ------------------------------------------------------------


// MAIN


// ------------------------------------------------------------





/** @param {NS} ns */


export async function main(ns) {


    ns.disableLog("ALL");





    const { positionals, wantsHelp } = parseFlags(ns);





    if (wantsHelp) {


        printHelp(ns);


        return;


    }





    const argTarget = positionals[0] || null; // optional manual override


    const target = argTarget || findBestTarget(ns);





    if (!target) {


        ns.tprint("No suitable target found.");


        return;


    }





    ns.tprint(`Batching against: ${target}`);





    // Ensure root


    if (!ns.hasRootAccess(target)) {


        openPortsAndNuke(ns, target);


    }


    if (!ns.hasRootAccess(target)) {


        ns.tprint(


            `Still no root on ${target}. Need more port crackers or hacking level.`


        );


        return;


    }





    const hackScript   = "workers/hwgw/hack-worker.js";


    const growScript   = "workers/hwgw/grow-worker.js";


    const weakenScript = "workers/hwgw/weaken-worker.js";





    // Basic safety check: make sure worker scripts exist


    for (const s of [hackScript, growScript, weakenScript]) {


        if (!ns.fileExists(s, "home")) {


            ns.tprint(`Missing required worker script on home: ${s}`);


            return;


        }


    }





    while (true) {


        const maxRam  = ns.getServerMaxRam("home");


        const usedRam = ns.getServerUsedRam("home");





        // Use up to 90% of home RAM in total


        const targetUsage = maxRam * 0.9;


        const freeForBatch = targetUsage - usedRam;


        if (freeForBatch <= 0) {


            ns.print("No room for more batches, waiting.");


            await ns.sleep(2000);


            continue;


        }





        const hackRam   = ns.getScriptRam(hackScript);


        const growRam   = ns.getScriptRam(growScript);


        const weakenRam = ns.getScriptRam(weakenScript);





        const perBatchRam = hackRam + growRam + weakenRam;


        let maxThreads = Math.floor(freeForBatch / perBatchRam);





        if (maxThreads < 3) { // need at least 1 of each


            await ns.sleep(2000);


            continue;


        }





        // With lots of RAM, cap the size a bit to avoid massive overkill


        maxThreads = Math.min(maxThreads, 2000);





        // Simple ratio: 20% hack, 40% grow, 40% weaken


        let hThreads = Math.max(1, Math.floor(maxThreads * 0.2));


        let gThreads = Math.max(1, Math.floor(maxThreads * 0.4));


        let wThreads = Math.max(1, maxThreads - hThreads - gThreads);





        ns.print(`Batch: H=${hThreads}, G=${gThreads}, W=${wThreads}`);





        ns.exec(weakenScript, "home", wThreads, target);


        ns.exec(growScript, "home", gThreads, target);


        ns.exec(hackScript, "home", hThreads, target);





        const weakenTime = ns.getWeakenTime(target);


        await ns.sleep(weakenTime + 200);


    }


}





// ------------------------------------------------------------


// Helpers - same idea as botnet/auto-hgw.js


// ------------------------------------------------------------





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





function openPortsAndNuke(ns, target) {


    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(target);


    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(target);


    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(target);


    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(target);


    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(target);


    try {


        ns.nuke(target);


    } catch {


        // hasRootAccess will tell us if it worked


    }


}





function findBestTarget(ns) {


    const servers       = getAllServers(ns);


    const hackingLevel  = ns.getHackingLevel();


    const portCrackers  = countPortCrackers(ns);





    let bestTarget = null;


    let bestScore  = 0;





    for (const server of servers) {


        if (server === "home") continue;





        const maxMoney = ns.getServerMaxMoney(server);


        const minSec   = ns.getServerMinSecurityLevel(server);


        const growth   = ns.getServerGrowth(server);


        const reqHack  = ns.getServerRequiredHackingLevel(server);


        const reqPorts = ns.getServerNumPortsRequired(server);





        if (maxMoney <= 250_000) continue;


        if (growth < 10) continue;


        if (reqHack > hackingLevel) continue;


        if (reqPorts > portCrackers) continue;





        const score = (maxMoney * growth) / minSec;





        if (score > bestScore) {


            bestScore  = score;


            bestTarget = server;


        }


    }





    return bestTarget;


}


