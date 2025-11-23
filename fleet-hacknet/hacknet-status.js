/** @param {NS} ns */
function fmt(ns, val, decimals = 3) {
    // Universal formatter using nFormat as fallback
    return ns.nFormat(val, `0.${"0".repeat(decimals)}a`);
}

export async function main(ns) {
    ns.disableLog("ALL");

    const count = ns.hacknet.numNodes();
    if (count === 0) {
        ns.tprint("❌ You don't own any Hacknet nodes yet.");
        return;
    }

    ns.tprint("💻 HACKNET STATUS");
    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("Idx  Level   RAM   Cores   Prod/sec        Lifetime");
    ns.tprint("────────────────────────────────────────────────────────────");

    let totalProd = 0;
    let totalLife = 0;
    let totalLevels = 0;
    let totalRam = 0;
    let totalCores = 0;

    for (let i = 0; i < count; i++) {
        const s = ns.hacknet.getNodeStats(i);

        totalProd  += s.production;
        totalLife  += s.totalProduction;
        totalLevels += s.level;
        totalRam    += s.ram;
        totalCores  += s.cores;

        const idxStr  = String(i).padStart(2, " ");
        const lvlStr  = String(s.level).padStart(5, " ");
        const ramStr  = String(s.ram).padStart(5, " ");
        const coreStr = String(s.cores).padStart(6, " ");

        const prodStr = fmt(ns, s.production, 3).padStart(10, " ");
        const lifeStr = fmt(ns, s.totalProduction, 3).padStart(12, " ");

        ns.tprint(`${idxStr}  ${lvlStr}  ${ramStr}  ${coreStr}   ${prodStr}   ${lifeStr}`);
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint(`Nodes:      ${count}`);
    ns.tprint(`Avg Level:  ${(totalLevels / count).toFixed(1)}`);
    ns.tprint(`Avg RAM:    ${(totalRam / count).toFixed(1)} GB`);
    ns.tprint(`Avg Cores:  ${(totalCores / count).toFixed(1)}`);
    ns.tprint(`Total Prod: ${fmt(ns, totalProd, 3)} / sec`);
    ns.tprint(`Lifetime:   $${fmt(ns, totalLife, 3)}`);
    ns.tprint("────────────────────────────────────────────────────────────");
}
