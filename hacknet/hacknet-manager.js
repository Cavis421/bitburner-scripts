/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Max fraction of your current money this script is allowed to spend per cycle
    const spendFraction = 0.10;  // 10%

    ns.tprint("?? hacknet-manager started (spend up to 10% of money per cycle).");

    while (true) {
        const money  = ns.getServerMoneyAvailable("home");
        const budget = money * spendFraction;

        // If you're broke, chill a bit
        if (budget < 1e5) { // < 100k
            await ns.sleep(5000);
            continue;
        }

        const numNodes = ns.hacknet.numNodes();

        // Track best upgrade
        let best = {
            type: null,   // "node" | "level" | "ram" | "core"
            index: -1,    // which node (for upgrades)
            cost: Infinity
        };

        // Option 1: buy a new node
        const newNodeCost = ns.hacknet.getPurchaseNodeCost();
        if (newNodeCost < best.cost) {
            best = { type: "node", index: -1, cost: newNodeCost };
        }

        // Option 2–4: upgrade existing nodes
        for (let i = 0; i < numNodes; i++) {
            const costLevel = ns.hacknet.getLevelUpgradeCost(i, 1);
            const costRam   = ns.hacknet.getRamUpgradeCost(i, 1);
            const costCore  = ns.hacknet.getCoreUpgradeCost(i, 1);

            if (costLevel < best.cost) best = { type: "level", index: i, cost: costLevel };
            if (costRam   < best.cost) best = { type: "ram",   index: i, cost: costRam   };
            if (costCore  < best.cost) best = { type: "core",  index: i, cost: costCore  };
        }

        // If even the cheapest option is outside our budget, wait and try again
        if (best.cost > budget || !isFinite(best.cost)) {
            // ns.print(`No affordable Hacknet upgrade yet (cheapest=${ns.nFormat(best.cost, "0.00a")}, budget=${ns.nFormat(budget, "0.00a")})`);
            await ns.sleep(5000);
            continue;
        }

        // Perform the chosen upgrade
        switch (best.type) {
            case "node":
                const nodeIdx = ns.hacknet.purchaseNode();
                if (nodeIdx !== -1) {
                    ns.print(`?? Bought Hacknet node #${nodeIdx} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;

            case "level":
                if (ns.hacknet.upgradeLevel(best.index, 1)) {
                    ns.print(`?? Level +1 on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;

            case "ram":
                if (ns.hacknet.upgradeRam(best.index, 1)) {
                    ns.print(`?? RAM +1 step on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;

            case "core":
                if (ns.hacknet.upgradeCore(best.index, 1)) {
                    ns.print(`?? Core +1 on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;
        }

        // Short sleep so we don't spam upgrades too fast
        await ns.sleep(1000);
    }
}