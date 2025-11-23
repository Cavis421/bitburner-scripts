/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const workerScript = "remote-hgw.js";

    // --- Discover ALL servers ---
    const allServers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());

    ns.tprint("🛰  FULL BOTNET HGW STATUS");
    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("Server               Type     RAM(GB)   Threads   Target");
    ns.tprint("────────────────────────────────────────────────────────────");

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
    const typeOrder = { "HOME":0, "PSERV":1, "NPC":2 };
    entries.sort((a, b) => {
        if (typeOrder[a.type] !== typeOrder[b.type])
            return typeOrder[a.type] - typeOrder[b.type];
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

    ns.tprint("────────────────────────────────────────────────────────────");
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
