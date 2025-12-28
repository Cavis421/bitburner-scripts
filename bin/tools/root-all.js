/** /bin/root-all.js


 *


 * Scan the network from "home" and attempt to gain root access on every


 * reachable server using whatever port crackers you own.


 *


 * This script:


 *   - Walks the entire network (DFS from "home")


 *   - Skips "home" itself


 *   - Checks your hacking level and port-cracker count


 *   - Attempts to open ports and nuke each eligible server


 *   - Prints a summary of newly rooted vs skipped servers


 *


 * Usage:


 *   run /bin/root-all.js


 *   run /bin/root-all.js --help


 *


 * @param {NS} ns


 */





// ------------------------------------------------------------


// Minimal HELP: Description, Notes, Syntax


// ------------------------------------------------------------


function printHelp(ns) {


    const script = "/bin/root-all.js";





    ns.tprint("==============================================================");


    ns.tprint(`HELP - ${script}`);


    ns.tprint("==============================================================");


    ns.tprint("");





    // DESCRIPTION


    ns.tprint("DESCRIPTION");


    ns.tprint("  Scans the network from 'home' and attempts to gain root access");


    ns.tprint("  on every reachable server using any port-cracking programs you");


    ns.tprint("  currently own.");


    ns.tprint("");


    ns.tprint("  For each server, it checks your hacking level and the number");


    ns.tprint("  of required ports, opens ports where possible, calls nuke(),");


    ns.tprint("  and prints a summary of what was rooted and what was skipped.");


    ns.tprint("");





    // NOTES


    ns.tprint("NOTES");


    ns.tprint("  - Does not touch 'home'.");


    ns.tprint("  - Safe to run multiple times; already-rooted servers are skipped.");


    ns.tprint("  - Uses your current hacking level and available port crackers at");


    ns.tprint("    the time of execution.");


    ns.tprint("  - This script only gains root access; it does not copy or deploy");


    ns.tprint("    any batch or botnet scripts.");


    ns.tprint("");





    // SYNTAX


    ns.tprint("SYNTAX");


    ns.tprint("  run /bin/root-all.js");


    ns.tprint("  run /bin/root-all.js --help");


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





    const { wantsHelp } = parseFlags(ns);





    if (wantsHelp) {


        printHelp(ns);


        return;


    }





    const hackingLevel = ns.getHackingLevel();


    const portCrackers = getPortCrackerCount(ns);





    ns.tprint("ROOT-ALL: Starting network scan from 'home'...");


    ns.tprint(`ROOT-ALL: Hacking level: ${hackingLevel}`);


    ns.tprint(`ROOT-ALL: Port crackers available: ${portCrackers}`);





    const servers = getAllServers(ns);


    ns.tprint(`ROOT-ALL: Found ${servers.length} servers (including home).`);





    let rooted = 0;


    let skippedAlreadyRoot = 0;


    let skippedNotEnoughTools = 0;


    let skippedTooHighHack = 0;





    for (const host of servers) {


        if (host === "home") continue; // do not root home





        const hasRoot = ns.hasRootAccess(host);


        const reqHack = ns.getServerRequiredHackingLevel(host);


        const reqPorts = ns.getServerNumPortsRequired(host);





        if (hasRoot) {


            skippedAlreadyRoot++;


            ns.print(`Already rooted: ${host}`);


            continue;


        }





        // Hacking level check


        if (reqHack > hackingLevel) {


            skippedTooHighHack++;


            ns.print(`Skipping ${host} (required hacking ${reqHack} > ${hackingLevel})`);


            continue;


        }





        // Port tools check


        if (reqPorts > portCrackers) {


            skippedNotEnoughTools++;


            ns.print(`Skipping ${host} (needs ${reqPorts} ports, only ${portCrackers} tools)`);


            continue;


        }





        // Try to open ports and nuke


        tryOpenPorts(ns, host);


        try {


            ns.nuke(host);


        } catch (e) {


            ns.print(`Failed to nuke ${host}: ${String(e)}`);


            continue;


        }





        if (ns.hasRootAccess(host)) {


            rooted++;


            ns.tprint(`Rooted: ${host} (ports=${reqPorts}, reqHack=${reqHack})`);


        } else {


            ns.print(`Something went wrong, still no root on ${host}`);


        }





        await ns.sleep(10); // tiny yield to avoid lag


    }





    ns.tprint("========== Rooting Summary ==========");


    ns.tprint(`Newly rooted:        ${rooted}`);


    ns.tprint(`Already rooted:      ${skippedAlreadyRoot}`);


    ns.tprint(`Not enough tools:    ${skippedNotEnoughTools}`);


    ns.tprint(`Hack level too low:  ${skippedTooHighHack}`);


    ns.tprint("=====================================");


}





// ------------------------------------------------------------


// Helpers


// ------------------------------------------------------------





/**


 * DFS to find all servers reachable from 'home'.


 */


function getAllServers(ns) {


    const visited = new Set();


    const stack = ["home"];





    while (stack.length > 0) {


        const host = stack.pop();


        if (visited.has(host)) continue;


        visited.add(host);





        const neighbors = ns.scan(host);


        for (const n of neighbors) {


            if (!visited.has(n)) {


                stack.push(n);


            }


        }


    }





    return Array.from(visited);


}





/**


 * Count how many port crackers we own.


 */


function getPortCrackerCount(ns) {


    const tools = [


        "BruteSSH.exe",


        "FTPCrack.exe",


        "relaySMTP.exe",


        "HTTPWorm.exe",


        "SQLInject.exe",


    ];


    return tools.filter(t => ns.fileExists(t, "home")).length;


}





/**


 * Open all ports we can on a host.


 */


function tryOpenPorts(ns, host) {


    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);


    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);


    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);


    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);


    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);


}


