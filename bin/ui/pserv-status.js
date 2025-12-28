/** @param {NS} ns */

// ------------------------------------------------------------
// Flags
// ------------------------------------------------------------
const FLAGS = [
    ["help", false],
];

export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags(FLAGS);

    // --help handler
    if (flags.help) {
        printHelp(ns);
        return;
    }

    // Optional: target minimum RAM for "progress" metric
    const target = Number(flags._[0] ?? 2048); // e.g., run ... 8192

    const servers = ns.getPurchasedServers();
    if (servers.length === 0) {
        ns.tprint("? You have no purchased servers.");
        return;
    }

    let totalRam = 0;
    let minRam = Infinity;
    let maxRam = 0;

    ns.tprint("??? Purchased Server Fleet Status");
    ns.tprint("----------------------------------");

    for (const host of servers) {
        const ram = ns.getServerMaxRam(host);
        totalRam += ram;
        if (ram < minRam) minRam = ram;
        if (ram > maxRam) maxRam = ram;

        ns.tprint(`• ${host} — ${ram} GB`);
    }

    const avgRam = totalRam / servers.length;

    // Guard against goofy/zero targets
    const safeTarget = target > 0 ? target : 1;
    const completion = Math.min(100, (minRam / safeTarget) * 100).toFixed(1);

    ns.tprint("----------------------------------");
    ns.tprint(`?? Total Servers: ${servers.length}`);
    ns.tprint(`?? Total Fleet RAM: ${ns.nFormat(totalRam * 1e9, "0.00b")}`);
    ns.tprint(`?? Weakest Server: ${minRam} GB`);
    ns.tprint(`?? Strongest Server: ${maxRam} GB`);
    ns.tprint(`?? Average RAM: ${avgRam.toFixed(1)} GB`);
    ns.tprint(`?? Progress to target (${safeTarget}GB min): ${completion}%`);
    ns.tprint("----------------------------------");
}

// ------------------------------------------------------------
// Minimal HELP: Description, Notes, Syntax
// ------------------------------------------------------------
function printHelp(ns) {
    const script = "pserv/pserv-status.js";

    ns.tprint("==============================================================");
    ns.tprint(`HELP — ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");

    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Summarizes the status of your purchased server fleet.");
    ns.tprint("  Prints each pserv's RAM, plus overall fleet stats and");
    ns.tprint("  a simple 'progress to target' metric based on the weakest");
    ns.tprint("  server compared to a target minimum RAM value.");
    ns.tprint("");

    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Uses ns.getPurchasedServers() to enumerate pserv hosts.");
    ns.tprint("  - Target RAM is optional; defaults to 2048GB if omitted.");
    ns.tprint("  - Progress is computed as (minRam / target) * 100, capped");
    ns.tprint("    at 100%.");
    ns.tprint("  - Total Fleet RAM is printed using ns.nFormat(..., '0.00b').");
    ns.tprint("");

    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run pserv/pserv-status.js");
    ns.tprint("  run pserv/pserv-status.js <targetMinRam>");
    ns.tprint("  run pserv/pserv-status.js --help");
    ns.tprint("");

    ns.tprint("==============================================================");
    ns.tprint("");
}
