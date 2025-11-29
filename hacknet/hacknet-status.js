/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const fmtMoney = (value) => "$" + ns.formatNumber(value, 2, 1e3);
    const fmtNum   = (value) => ns.formatNumber(value, 2, 1e3); // for prod/sec etc.

    const count = ns.hacknet.numNodes();

    ns.tprint("?? HACKNET STATUS");
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
    ns.tprint(`Lifetime:   ${fmtMoney(totalLifetime)}`);
    ns.tprint("------------------------------------------------------------");
}
