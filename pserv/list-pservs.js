/** @param {NS} ns */

// ------------------------------------------------------------
// Flags
// ------------------------------------------------------------
const FLAGS = [
    ["help", false],
];

export async function main(ns) {
    const flags = ns.flags(FLAGS);

    // --help handler
    if (flags.help) {
        printHelp(ns);
        return;
    }

    const servers = ns.getPurchasedServers();

    if (servers.length === 0) {
        ns.tprint("No purchased servers found.");
        return;
    }

    ns.tprint("Purchased Servers:");
    for (const s of servers) {
        ns.tprint(" - " + s);
    }
}

// ------------------------------------------------------------
// Minimal HELP: Description, Notes, Syntax
// ------------------------------------------------------------
function printHelp(ns) {
    const script = "pserv/list-pservs.js";

    ns.tprint("==============================================================");
    ns.tprint(`HELP — ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");

    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Lists all of your purchased servers (pserv-*) by hostname.");
    ns.tprint("");

    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Uses ns.getPurchasedServers() to obtain the list of hosts.");
    ns.tprint("  - Output is printed with ns.tprint(), one server per line.");
    ns.tprint("  - Shows a simple 'No purchased servers found.' message when");
    ns.tprint("    you have not bought any yet.");
    ns.tprint("");

    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run pserv/list-pservs.js");
    ns.tprint("  run pserv/list-pservs.js --help");
    ns.tprint("");

    ns.tprint("==============================================================");
    ns.tprint("");
}
