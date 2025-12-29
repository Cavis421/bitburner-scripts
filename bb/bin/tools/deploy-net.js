/** /bin/deploy-net.js


 *


 * Deploy /botnet/remote-hgw.js across the network.


 *


 * - Optional positional arg: target hostname to attack.


 * - If no target is given, automatically picks a "best" money server.


 * - Attempts to gain root on each server where possible.


 * - Kills existing scripts on each host, then runs remote-hgw.js there.


 * - Also uses some of home's RAM after deploying to the network.


 *


 * Usage:


 *   run /bin/deploy-net.js


 *   run /bin/deploy-net.js <target>


 *   run /bin/deploy-net.js --help


 *


 * @param {NS} ns


 */





// ------------------------------------------------------------


// Minimal HELP: Description, Notes, Syntax


// ------------------------------------------------------------


function printHelp(ns) {


    const script = "/bin/deploy-net.js";





    ns.tprint("==============================================================");


    ns.tprint(`HELP - ${script}`);


    ns.tprint("==============================================================");


    ns.tprint("");





    // DESCRIPTION


    ns.tprint("DESCRIPTION");


    ns.tprint("  Deploys /botnet/remote-hgw.js to all rooted servers with usable RAM,");


    ns.tprint("  auto-selecting a good money target if none is specified.");


    ns.tprint("");


    ns.tprint("  For each non-home server it will:");


    ns.tprint("    - Attempt to gain root access using available port crackers;");


    ns.tprint("    - Kill all running scripts;");


    ns.tprint("    - Copy /botnet/remote-hgw.js; and");


    ns.tprint("    - Launch it with as many threads as RAM allows.");


    ns.tprint("");


    ns.tprint("  Afterward, it also uses spare RAM on home to run remote-hgw.js.");


    ns.tprint("");





    // NOTES


    ns.tprint("NOTES");


    ns.tprint("  - Requires /botnet/remote-hgw.js to exist on home.");


    ns.tprint("  - Uses findBestTarget(ns) when no explicit target is provided.");


    ns.tprint("  - Only deploys to servers where you have (or can gain) root access.");


    ns.tprint("  - Skips servers with less than 2GB of RAM.");


    ns.tprint("  - Leaves a small RAM reserve on home for other scripts.");


    ns.tprint("");





    // SYNTAX


    ns.tprint("SYNTAX");


    ns.tprint("  run /bin/deploy-net.js");


    ns.tprint("  run /bin/deploy-net.js <target>");


    ns.tprint("  run /bin/deploy-net.js --help");


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





    const manualTarget = positionals[0] || null;


    const target = manualTarget || findBestTarget(ns);





    if (!target) {


        ns.tprint("No suitable target found.");


        return;


    }





    const workerScript = "//botnet/remote-hgw.js";





    if (!ns.fileExists(workerScript, "home")) {


        ns.tprint(`Cannot deploy - ${workerScript} not found on home.`);


        return;


    }





    ns.tprint(`Deploying remote HGW farm against target: ${target}`);





    const servers = getAllServers(ns);


    const portCrackers = countPortCrackers(ns);





    for (const host of servers) {


        if (host === "home") continue; // handle home separately





        // Try to gain root if we do not have it yet


        if (!ns.hasRootAccess(host)) {


            tryRoot(ns, host, portCrackers);


        }





        if (!ns.hasRootAccess(host)) {


            ns.print(`Skipping ${host}: no root access.`);


            continue;


        }





        const maxRam = ns.getServerMaxRam(host);


        if (maxRam < 2) {


            ns.print(`Skipping ${host}: not enough RAM (${maxRam} GB).`);


            continue;


        }





        // Clear the box


        ns.killall(host);





        // Copy worker script


        const copied = await ns.scp(workerScript, host);


        if (!copied) {


            ns.print(`Failed to copy ${workerScript} to ${host}.`);


            continue;


        }





        const scriptRam = ns.getScriptRam(workerScript);


        const usableRam = maxRam * 0.95; // leave 5% breathing room


        const threads = Math.floor(usableRam / scriptRam);





        if (threads < 1) {


            ns.print(`Not enough RAM on ${host} for even 1 thread.`);


            continue;


        }





        const pid = ns.exec(workerScript, host, threads, target);


        if (pid === 0) {


            ns.print(`Failed to exec ${workerScript} on ${host}.`);


        } else {


            ns.print(`${host}: running ${workerScript} x${threads} versus ${target}.`);


        }


    }





    // Optionally, also use some RAM on home itself


    await deployToHome(ns, target);





    ns.tprint("Network deployment complete.");


}





// ------------------------------------------------------------


// Existing helpers (logic preserved, logs de-emoji-fied)


// ------------------------------------------------------------





/** Use some of home's RAM as well */


async function deployToHome(ns, target) {


    const host = "home";


    const script = "//botnet/remote-hgw.js";





    const maxRam  = ns.getServerMaxRam(host);


    const usedRam = ns.getServerUsedRam(host);





    // Leave 32 GB free on home for you / misc scripts


    const reserved = 32;


    const usableRam = Math.max(0, maxRam - usedRam - reserved);





    if (usableRam < 2) {


        ns.print("Not enough free RAM on home to deploy.");


        return;


    }





    const copied = await ns.scp(script, host);


    if (!copied) {


        ns.print(`Failed to copy ${script} to home.`);


        return;


    }





    const scriptRam = ns.getScriptRam(script);


    const threads = Math.floor(usableRam / scriptRam);





    if (threads < 1) {


        ns.print("Not enough RAM on home for even 1 thread.");


        return;


    }





    ns.print(`home: running ${script} x${threads} versus ${target}.`);


    ns.exec(script, host, threads, target);


}





/** DFS search to get all servers from 'home' */


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





/** Count how many port crackers we have */


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





/** Try to open ports + nuke if we have enough tools */


function tryRoot(ns, host, portCrackers) {


    const requiredPorts = ns.getServerNumPortsRequired(host);


    if (requiredPorts > portCrackers) return;





    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);


    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);


    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);


    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);


    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);





    try {


        ns.nuke(host);


    } catch {


        // if it fails, hasRootAccess will catch that


    }


}





/** "Best" target: maxMoney * growth / security with filters */


function findBestTarget(ns) {


    const servers      = getAllServers(ns);


    const hackingLevel = ns.getHackingLevel();


    const portCrackers = countPortCrackers(ns);





    let bestTarget = null;


    let bestScore  = 0;





    for (const server of servers) {


        if (server === "home") continue;





        const maxMoney = ns.getServerMaxMoney(server);


        const minSec   = ns.getServerMinSecurityLevel(server);


        const growth   = ns.getServerGrowth(server);


        const reqHack  = ns.getServerRequiredHackingLevel(server);


        const reqPorts = ns.getServerNumPortsRequired(server);





        // Filters to avoid junk


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


