/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    // Positional args: [mode, spendFraction, stopFraction]
    const modeRaw = (flags._[0] ?? "hack").toString().toLowerCase();

    // Clamp + NaN-guard
    const spendFraction = clampNum(
        flags._[1] !== undefined ? Number(flags._[1]) : 0.10,
        0.01,
        0.50,
        0.10,
    );

    const stopFraction = clampNum(
        flags._[2] !== undefined ? Number(flags._[2]) : 0.70,
        0.10,
        0.99,
        0.70,
    );

    const mode = modeRaw === "hack" ? "hack" : "hack";
    if (modeRaw !== "hack") {
        ns.tprint("Only 'hack' mode is implemented for now. Using hacking-focused augmentation bundle.");
    }

    ns.tprint(
        `hacknet-smart started (mode=${mode}, spend=${(spendFraction * 100).toFixed(
            0,
        )}% money, pause at ${(stopFraction * 100).toFixed(0)}% of aug bundle).`,
    );

    while (true) {
        const money = ns.getServerMoneyAvailable("home");

        if (money < 1e5) {
            await ns.sleep(5000);
            continue;
        }

        // 1) Compute ideal hacking aug bundle cost (approx)
        const bundleCost = getIdealHackingBundleCost(ns);
        if (bundleCost > 0) {
            if (money >= bundleCost * stopFraction) {
                ns.print(
                    `Close to ideal aug bundle. Money=${ns.nFormat(
                        money,
                        "0.00a",
                    )} | Bundle~${ns.nFormat(bundleCost, "0.00a")}.`,
                );
                ns.print("Pausing Hacknet upgrades to save for augmentations and reset.");
                await ns.sleep(10000);
                continue;
            }
        } else {
            ns.print("No suitable aug bundle found (maybe no factions or no reputation). Proceeding with normal Hacknet upgrades.");
        }

        // 2) Decide Hacknet upgrade under budget
        const budget = money * spendFraction;
        const numNodes = ns.hacknet.numNodes();

        let best = {
            type: null, // "node" | "level" | "ram" | "core"
            index: -1,
            cost: Infinity,
        };

        // Option 1: buy a new node
        const newNodeCost = ns.hacknet.getPurchaseNodeCost();
        if (Number.isFinite(newNodeCost) && newNodeCost < best.cost) {
            best = { type: "node", index: -1, cost: newNodeCost };
        }

        // Option 2-4: upgrade existing nodes
        for (let i = 0; i < numNodes; i++) {
            const costLevel = ns.hacknet.getLevelUpgradeCost(i, 1);
            const costRam   = ns.hacknet.getRamUpgradeCost(i, 1);
            const costCore  = ns.hacknet.getCoreUpgradeCost(i, 1);

            if (Number.isFinite(costLevel) && costLevel < best.cost) best = { type: "level", index: i, cost: costLevel };
            if (Number.isFinite(costRam)   && costRam   < best.cost) best = { type: "ram",   index: i, cost: costRam   };
            if (Number.isFinite(costCore)  && costCore  < best.cost) best = { type: "core",  index: i, cost: costCore  };
        }

        if (!Number.isFinite(best.cost) || best.cost > budget) {
            await ns.sleep(5000);
            continue;
        }

        // Perform the chosen upgrade
        switch (best.type) {
            case "node": {
                const nodeIdx = ns.hacknet.purchaseNode();
                if (nodeIdx !== -1) {
                    ns.print(`Bought Hacknet node #${nodeIdx} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;
            }
            case "level":
                if (ns.hacknet.upgradeLevel(best.index, 1)) {
                    ns.print(`Level +1 on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;
            case "ram":
                if (ns.hacknet.upgradeRam(best.index, 1)) {
                    ns.print(`RAM +1 step on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;
            case "core":
                if (ns.hacknet.upgradeCore(best.index, 1)) {
                    ns.print(`Core +1 on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;
        }

        await ns.sleep(1000);
    }
}

function clampNum(x, lo, hi, fallback) {
    if (!Number.isFinite(x)) return fallback;
    return Math.min(hi, Math.max(lo, x));
}

function printHelp(ns) {
    ns.tprint("hacknet/hacknet-smart.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Smart Hacknet manager that considers hacking-focused augmentation costs.");
    ns.tprint("  Upgrades Hacknet while keeping money available to buy a strong aug bundle.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  Positional arguments are: mode, spendFraction, stopFraction.");
    ns.tprint("  mode: currently only 'hack' is implemented.");
    ns.tprint("  spendFraction: fraction of current money used per upgrade (default 0.10).");
    ns.tprint("  stopFraction: pause Hacknet when money reaches this fraction of bundle cost (default 0.70).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run hacknet/hacknet-smart.js [mode] [spendFraction] [stopFraction] [--help]");
}
