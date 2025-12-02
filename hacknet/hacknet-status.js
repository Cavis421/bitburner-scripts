/** @param {NS} ns **/

// Prints Hacknet node status: levels, RAM, cores, and production.
// Now supports a --help flag that prints usage and exits without running logic.
export async function main(ns) {
    ns.disableLog("ALL");

    // ------------------------------------------------------------
    // Help handling
    // ------------------------------------------------------------
    // Honor a --help flag without breaking any future positional args.
    // If present, print help text and exit immediately (no normal logic).
    if (ns.args.includes("--help")) {
        printHelp(ns);
        return;
    }

    // Existing formatting helpers preserved
    const fmtMoney = (value) => "$" + ns.formatNumber(value, 2, 1e3);
    const fmtNum   = (value) => ns.formatNumber(value, 2, 1e3); // for prod/sec etc.

    const count = ns.hacknet.numNodes();

    // Removed emojis / mojibake, kept simple header
    ns.tprint("HACKNET STATUS");
    ns.tprint("------------------------------------------------------------");

    if (count === 0) {
        ns.tprint("You don't own any Hacknet nodes yet.");
        return;
    }

    ns.tprint("Idx  Level   RAM   Cores   Prod/sec        Lifetime");
    ns.tprint("------------------------------------------------------------");

    let totalProd = 0;
    let totalLifetime = 0;

    for (let i = 0; i < count; i++) {
        const n = ns.hacknet.getNodeStats(i);

        totalProd += n.production;
        totalLifetime += n.totalProduction;

        const idxStr   = String(i).padStart(3, " ");
        const lvlStr   = String(n.level).padStart(5, " ");
        const ramStr   = String(n.ram).padStart(5, " ");
        const coreStr  = String(n.cores).padStart(6, " ");
        const prodStr  = fmtNum(n.production).padStart(12, " ");
        const lifeStr  = fmtMoney(n.totalProduction).padStart(12, " ");

        ns.tprint(`${idxStr}  ${lvlStr}  ${ramStr}GB  ${coreStr}  ${prodStr}  ${lifeStr}`);
    }

    ns.tprint("------------------------------------------------------------");
    ns.tprint(`Nodes:      ${count}`);
    ns.tprint(`Total Prod: ${fmtNum(totalProd)} / sec`);
    // Keeping output minimal to match existing behavior; totals above are unchanged.
}


function printHelp(ns) {
    ns.tprint("hacknet/hacknet-status.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Snapshot of Hacknet node levels, RAM, cores, and production.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  One-shot read-only summary; does not purchase or upgrade nodes.");
    ns.tprint("  Helpful for seeing how much income Hacknet is contributing.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run hacknet/hacknet-status.js [arguments] [--help]");
}
