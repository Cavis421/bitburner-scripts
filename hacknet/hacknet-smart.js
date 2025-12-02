/** @param {NS} ns */
export async function main(ns) {
    // Use flags to add --help without breaking positional usage:
    //   0: mode
    //   1: spendFraction
    //   2: stopFraction
    const flags = ns.flags([
        ["help", false],
    ]);

    // When --help is used, show help and exit immediately.
    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    // Args: [mode, spendFraction, stopFraction]
    // mode: "hack" (only hacking-focused bundle for now)
    // spendFraction: max fraction of money to spend per upgrade (default 0.10 = 10%)
    // stopFraction: when money >= stopFraction * bundleCost, pause Hacknet (default 0.7 = 70%)
    const mode          = (flags._[0] || "hack").toString().toLowerCase();
    const spendFraction = flags._[1] !== undefined ? Number(flags._[1]) : 0.10;
    const stopFraction  = flags._[2] !== undefined ? Number(flags._[2]) : 0.70;

    if (mode !== "hack") {
        ns.tprint("Only 'hack' mode is implemented for now. Using hacking-focused augmentation bundle.");
    }

    ns.tprint(
        `hacknet-smart started (mode=${mode}, spend=${(spendFraction * 100).toFixed(
            0,
        )}% money, pause at ${(stopFraction * 100).toFixed(0)}% of aug bundle).`,
    );

    while (true) {
        const money = ns.getServerMoneyAvailable("home");

        // If you're really broke, chill
        if (money < 1e5) {
            await ns.sleep(5000);
            continue;
        }

        // 1) Compute ideal hacking aug bundle cost (approx)
        const bundleCost = getIdealHackingBundleCost(ns);
        if (bundleCost > 0) {
            // If we are close to being able to afford the bundle, stop upgrading Hacknet
            if (money >= bundleCost * stopFraction) {
                ns.print(
                    `Close to ideal aug bundle. Money=${ns.nFormat(
                        money,
                        "0.00a",
                    )} | Bundle≈${ns.nFormat(bundleCost, "0.00a")}.`,
                );
                ns.print("Pausing Hacknet upgrades to save for augmentations and reset.");
                await ns.sleep(10000);
                continue;
            }
        } else {
            // No reasonable aug bundle found (no factions or no rep yet) – just act as a normal manager
            ns.print(
                "No suitable aug bundle found (maybe no factions or no reputation). Proceeding with normal Hacknet upgrades.",
            );
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
        if (isFinite(newNodeCost) && newNodeCost < best.cost) {
            best = { type: "node", index: -1, cost: newNodeCost };
        }

        // Option 2–4: upgrade existing nodes
        for (let i = 0; i < numNodes; i++) {
            const costLevel = ns.hacknet.getLevelUpgradeCost(i, 1);
            const costRam = ns.hacknet.getRamUpgradeCost(i, 1);
            const costCore = ns.hacknet.getCoreUpgradeCost(i, 1);

            if (isFinite(costLevel) && costLevel < best.cost) best = { type: "level", index: i, cost: costLevel };
            if (isFinite(costRam) && costRam < best.cost) best = { type: "ram", index: i, cost: costRam };
            if (isFinite(costCore) && costCore < best.cost) best = { type: "core", index: i, cost: costCore };
        }

        // If even the cheapest option is outside our budget, wait and try again
        if (!isFinite(best.cost) || best.cost > budget) {
            ns.print(
                `No affordable Hacknet upgrade yet (cheapest=${ns.nFormat(
                    best.cost,
                    "0.00a",
                )}, budget=${ns.nFormat(budget, "0.00a")}).`,
            );
            await ns.sleep(5000);
            continue;
        }

        // 3) Perform the chosen upgrade
        switch (best.type) {
            case "node": {
                const nodeIdx = ns.hacknet.purchaseNode();
                if (nodeIdx !== -1) {
                    ns.print(
                        `Bought Hacknet node #${nodeIdx} for ${ns.nFormat(
                            best.cost,
                            "0.00a",
                        )}`,
                    );
                } else {
                    ns.print("purchaseNode failed unexpectedly.");
                }
                break;
            }

            case "level":
                if (ns.hacknet.upgradeLevel(best.index, 1)) {
                    ns.print(
                        `Level +1 on node ${best.index} for ${ns.nFormat(
                            best.cost,
                            "0.00a",
                        )}`,
                    );
                } else {
                    ns.print(`Failed to upgrade level on node ${best.index}`);
                }
                break;

            case "ram":
                if (ns.hacknet.upgradeRam(best.index, 1)) {
                    ns.print(
                        `RAM +1 step on node ${best.index} for ${ns.nFormat(
                            best.cost,
                            "0.00a",
                        )}`,
                    );
                } else {
                    ns.print(`Failed to upgrade RAM on node ${best.index}`);
                }
                break;

            case "core":
                if (ns.hacknet.upgradeCore(best.index, 1)) {
                    ns.print(
                        `Core +1 on node ${best.index} for ${ns.nFormat(
                            best.cost,
                            "0.00a",
                        )}`,
                    );
                } else {
                    ns.print(`Failed to upgrade core on node ${best.index}`);
                }
                break;
        }

        await ns.sleep(1000);
    }
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

/**
 * Estimate the cost of an "ideal" hacking-focused augmentation bundle for this run.
 * Uses logic similar to aug-plan.js:
 *  - Look at all joined factions
 *  - Consider only augs you can afford by rep (repReq <= current rep)
 *  - Skip NeuroFlux for the bundle (we treat NF as a money sink after)
 *  - Score augs by hacking usefulness
 *  - Take top N and sum their prices
 */
function getIdealHackingBundleCost(ns, maxCount = 6) {
    // If we do not have the necessary aug APIs (no SF4 / early), just bail out
    if (!hasAugApis(ns)) {
        return 0;
    }

    const player = ns.getPlayer();
    const factions = player.factions;
    const owned = new Set(getOwnedAugmentationsSafe(ns, true)); // include queued

    if (factions.length === 0) return 0;

    const entries = [];

    for (const fac of factions) {
        const rep = getFactionRepSafe(ns, fac);
        const augs = ns.getAugmentationsFromFaction(fac);

        for (const aug of augs) {
            if (owned.has(aug)) continue; // already own or queued

            const isNeuroFlux = aug === "NeuroFlux Governor";
            if (isNeuroFlux) continue;

            const repReq = ns.getAugmentationRepReq(aug);
            if (repReq > rep) continue;

            const price = ns.getAugmentationPrice(aug);
            if (!isFinite(price) || price <= 0) continue;

            const stats = ns.getAugmentationStats(aug);
            const score = scoreAugForHacking(stats);

            if (score <= 0) continue;

            entries.push({ aug, price, score });
        }
    }

    if (entries.length === 0) return 0;

    // Sort by hacking usefulness score (descending)
    entries.sort((a, b) => b.score - a.score);

    // Take top N and sum their prices
    const chosen = entries.slice(0, maxCount);
    let total = 0;
    for (const e of chosen) {
        total += e.price;
    }

    return total;
}

function hasAugApis(ns) {
    return (
        typeof ns.getAugmentationsFromFaction === "function" &&
        typeof ns.getAugmentationStats === "function" &&
        typeof ns.getOwnedAugmentations === "function" &&
        typeof ns.getFactionRep === "function"
    );
}

function getOwnedAugmentationsSafe(ns, includeQueued = false) {
    try {
        return ns.getOwnedAugmentations(includeQueued);
    } catch {
        return [];
    }
}

function getFactionRepSafe(ns, faction) {
    try {
        return ns.getFactionRep(faction) || 0;
    } catch {
        return 0;
    }
}

function scoreAugForHacking(stats) {
    const {
        hacking_mult = 1,
        hacking_exp_mult = 1,
        hacking_speed_mult = 1,
        hacking_money_mult = 1,
        hacking_chance_mult = 1,
        faction_rep_mult = 1,
        company_rep_mult = 1,
        crime_money_mult = 1,
        crime_success_mult = 1,
    } = stats;

    const wHack = 5;
    const wHackExp = 3;
    const wHackSpeed = 4;
    const wHackMoney = 5;
    const wHackChance = 2;
    const wFacRep = 1.5;
    const wComRep = 0.5;
    const wCrime = 0.5;

    let score = 0;
    score += (hacking_mult - 1) * wHack;
    score += (hacking_exp_mult - 1) * wHackExp;
    score += (hacking_speed_mult - 1) * wHackSpeed;
    score += (hacking_money_mult - 1) * wHackMoney;
    score += (hacking_chance_mult - 1) * wHackChance;
    score += (faction_rep_mult - 1) * wFacRep;
    score += (company_rep_mult - 1) * wComRep;
    score += ((crime_money_mult - 1) + (crime_success_mult - 1)) * wCrime;

    return score;
}
