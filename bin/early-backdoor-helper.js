/** /bin/early-backdoor-helper.js


 *


 * Helper: list all rooted servers (excluding home and pserv-*) that do not yet


 * have a backdoor installed, sorted by required hacking level.


 *


 * This is intended as a planning aid for manual backdooring via Terminal or


 * Singularity scripts.


 *


 * Usage:


 *   run /bin/early-backdoor-helper.js


 *   run /bin/early-backdoor-helper.js --help


 *


 * @param {NS} ns


 */





// ------------------------------------------------------------


// Minimal HELP: Description, Notes, Syntax


// ------------------------------------------------------------


function printHelp(ns) {


    const script = "/bin/early-backdoor-helper.js";





    ns.tprint("==============================================================");


    ns.tprint(`HELP - ${script}`);


    ns.tprint("==============================================================");


    ns.tprint("");





    // DESCRIPTION


    ns.tprint("DESCRIPTION");


    ns.tprint("  Lists all rooted, non-home, non-pserv servers that do not yet");


    ns.tprint("  have a backdoor installed. The output is sorted by required");


    ns.tprint("  hacking level, lowest to highest.");


    ns.tprint("");


    ns.tprint("  Use this as a checklist when running around backdooring servers");


    ns.tprint("  manually, or when writing Singularity automation to install");


    ns.tprint("  backdoors in a sensible order.");


    ns.tprint("");





    // NOTES


    ns.tprint("NOTES");


    ns.tprint("  - Excludes 'home'.");


    ns.tprint("  - Excludes purchased servers (pserv-*).");


    ns.tprint("  - Only includes servers where you already have root access.");


    ns.tprint("  - Safe to run repeatedly; it is read-only.");


    ns.tprint("");





    // SYNTAX


    ns.tprint("SYNTAX");


    ns.tprint("  run /bin/early-backdoor-helper.js");


    ns.tprint("  run /bin/early-backdoor-helper.js --help");


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





/** @param {NS} ns **/


export async function main(ns) {


    ns.disableLog("ALL");





    const { wantsHelp } = parseFlags(ns);





    if (wantsHelp) {


        printHelp(ns);


        return;


    }





    const servers = getAllServers(ns);


    const todo = [];





    for (const host of servers) {


        if (host === "home") continue;


        if (host.startsWith("pserv")) continue;   // exclude pserv-* servers





        const s = ns.getServer(host);





        // We only care about servers where we have root but no backdoor


        if (s.hasAdminRights && !s.backdoorInstalled) {


            todo.push({


                host,


                reqHack: s.requiredHackingSkill,


            });


        }


    }





    if (todo.length === 0) {


        ns.tprint("All rooted non-pserv servers are already backdoored.");


        return;


    }





    // Sort by required hacking level (ascending)


    todo.sort((a, b) => a.reqHack - b.reqHack);





    ns.tprint("========================================");


    ns.tprint(" Servers that still need backdoors      ");


    ns.tprint("========================================");


    for (const s of todo) {


        ns.tprint(`${s.host} (required hacking: ${s.reqHack})`);


    }


}





// ------------------------------------------------------------


// Helpers


// ------------------------------------------------------------





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





    return [...visited];


}


