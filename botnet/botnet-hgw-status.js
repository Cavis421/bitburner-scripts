/** @param {NS} ns */
export async function main(ns) {
    // Use flags so we can support --help without breaking positional args
    const flags = ns.flags([
        ["help", false], // standard help flag
    ]);

    // If --help is passed, print help text and exit before any normal logic
    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    const workerScript = "botnet/remote-hgw.js";

    // --- Discover ALL servers ---
    const allServers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());

    // Removed decorative emojis; keep plain, readable headers instead
    ns.tprint("FULL BOTNET HGW STATUS");
    ns.tprint("------------------------------------------------------------");
    ns.tprint("Server               Type     RAM(GB)   Threads   Target");
    ns.tprint("------------------------------------------------------------");

    // Collect info entries
    const entries = [];

    for (const host of allServers) {
        if (!ns.hasRootAccess(host)) continue; // skip unrooted

        const ram = ns.getServerMaxRam(host);
        if (ram < 2) continue; // too small to matter

        const procs = ns.ps(host);
        const hgwProcs = procs.filter(p => p.filename === workerScript);

        let threads = 0;
        let target = "-";

        if (hgwProcs.length > 0) {
            threads = hgwProcs.reduce((sum, p) => sum + p.threads, 0);
            target = hgwProcs[0].args[0] ?? "-";
        }

        const type =
            host === "home" ? "HOME" :
            pservs.has(host) ? "PSERV" :
            "NPC";

        entries.push({ host, type, ram, threads, target });
    }

    // Sort: by type group first (HOME / PSERV / NPC), then by RAM desc
    const typeOrder = { "HOME": 0, "PSERV": 1, "NPC": 2 };
    entries.sort((a, b) => {
        if (typeOrder[a.type] !== typeOrder[b.type]) {
            return typeOrder[a.type] - typeOrder[b.type];
        }
        return b.ram - a.ram; // RAM desc
    });

    // Print nicely
    for (const e of entries) {
        const hostPad = e.host.padEnd(18, " ");
        const typePad = e.type.padEnd(7, " ");
        const ramPad  = String(e.ram).padStart(7, " ");
        const thrPad  = String(e.threads).padStart(8, " ");

        ns.tprint(`${hostPad} ${typePad} ${ramPad}   ${thrPad}   ${e.target}`);
    }

    ns.tprint("------------------------------------------------------------");
}

/**
 * Print script help in a consistent, minimal format.
 * Uses only ns.tprint and exits before running any main logic.
 * @param {NS} ns
 */
function printHelp(ns) {
    ns.tprint("botnet/botnet-hgw-status.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Show a snapshot of all botnet HGW workers running on rooted servers.");
    ns.tprint("  Groups hosts by type and shows RAM, threads, and target for each.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Tracks only processes running botnet/remote-hgw.js on rooted servers.");
    ns.tprint("  Useful for checking how your HGW swarm is distributed across the network.");
    ns.tprint("  Does not start, stop, or modify any scripts; it only reports status.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run botnet/botnet-hgw-status.js [arguments] [--help]");
}

// --- Breadth-first server discovery ---
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
