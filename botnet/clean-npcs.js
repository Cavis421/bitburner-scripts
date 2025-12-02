/** @param {NS} ns **/
export async function main(ns) {
    // Use flags so we can support --help without breaking positional args
    const flags = ns.flags([
        ["help", false],
    ]);

    // If --help is passed, print help text and exit before any normal logic
    if (flags.help) {
        printHelp(ns);
        return;
    }

    const pservs = new Set(ns.getPurchasedServers());
    const servers = getAllServers(ns);

    for (const host of servers) {
        if (host === "home") continue;
        if (pservs.has(host)) continue;      // do not touch pservs here

        if (!ns.hasRootAccess(host)) continue;

        ns.tprint(`Killing all scripts on ${host}...`);
        ns.killall(host);
    }
    ns.tprint("All NPC servers cleaned.");
}

/** Print help for this script. */
function printHelp(ns) {
    ns.tprint("botnet/clean-npcs.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Kill all running scripts on rooted non-home, non-purchased servers.");
    ns.tprint("  Intended to quickly clean NPC servers without affecting your own fleet.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Does not touch home or any purchased servers.");
    ns.tprint("  Does not delete files; only stops running processes.");
    ns.tprint("  Safe to run multiple times; each run just re-cleans NPC servers.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run botnet/clean-npcs.js [--help]");
}

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
