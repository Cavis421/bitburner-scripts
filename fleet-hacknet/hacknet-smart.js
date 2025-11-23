/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Args: [mode, spendFraction, stopFraction]
    // mode: "hack" (only hacking-focused bundle for now)
    // spendFraction: max fraction of money to spend per upgrade (default 0.10 = 10%)
    // stopFraction: when money >= stopFraction * bundleCost, pause Hacknet (default 0.7 = 70%)
    const mode          = (ns.args[0] || "hack").toString().toLowerCase();
    const spendFraction = ns.args[1] !== undefined ? Number(ns.args[1]) : 0.10;
    const stopFraction  = ns.args[2] !== undefined ? Number(ns.args[2]) : 0.70;

    if (mode !== "hack") {
        ns.tprint("⚠️ Only 'hack' mode is implemented for now. Using hacking-focused aug bundle.");
    }

    ns.tprint(`⚙️ hacknet-smart started (mode=${mode}, spend≤${(spendFraction*100).toFixed(0)}% money, pause at ${(stopFraction*100).toFixed(0)}% of aug bundle).`);

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
                ns.print(`🧬 Close to ideal aug bundle. Money=${ns.nFormat(money, "0.00a")} | Bundle≈${ns.nFormat(bundleCost, "0.00a")}.`);
                ns.print("⏸ Pausing Hacknet upgrades to save for augmentations & reset.");
                await ns.sleep(10000);
                continue;
            }
        } else {
            // No reasonable aug bundle found (no factions or no rep yet) – just act as a normal manager
            ns.print("ℹ️ No suitable aug bundle found (maybe no factions / rep). Proceeding with normal Hacknet upgrades.");
        }

        // 2) Decide Hacknet upgrade under budget
        const budget = money * spendFraction;
        const numNodes = ns.hacknet.numNodes();

        let best = {
            type: null,  // "node" | "level" | "ram" | "core"
            index: -1,
            cost: Infinity
        };

        // Option 1: buy a new node
        const newNodeCost = ns.hacknet.getPurchaseNodeCost();
        if (isFinite(newNodeCost) && newNodeCost < best.cost) {
            best = { type: "node", index: -1, cost: newNodeCost };
        }

        // Option 2–4: upgrade existing nodes
        for (let i = 0; i < numNodes; i++) {
            const costLevel = ns.hacknet.getLevelUpgradeCost(i, 1);
            const costRam   = ns.hacknet.getRamUpgradeCost(i, 1);
            const costCore  = ns.hacknet.getCoreUpgradeCost(i, 1);

            if (isFinite(costLevel) && costLevel < best.cost) best = { type: "level", index: i, cost: costLevel };
            if (isFinite(costRam)   && costRam   < best.cost) best = { type: "ram",   index: i, cost: costRam   };
            if (isFinite(costCore)  && costCore  < best.cost) best = { type: "core",  index: i, cost: costCore  };
        }

        // If even the cheapest option is outside our budget, wait and try again
        if (!isFinite(best.cost) || best.cost > budget) {
            ns.print(`💸 No affordable Hacknet upgrade yet (cheapest=${ns.nFormat(best.cost, "0.00a")}, budget=${ns.nFormat(budget, "0.00a")}).`);
            await ns.sleep(5000);
            continue;
        }

        // 3) Perform the chosen upgrade
        switch (best.type) {
            case "node": {
                const nodeIdx = ns.hacknet.purchaseNode();
                if (nodeIdx !== -1) {
                    ns.print(`🆕 Bought Hacknet node #${nodeIdx} for ${ns.nFormat(best.cost, "0.00a")}`);
                } else {
                    ns.print("❌ purchaseNode failed unexpectedly.");
                }
                break;
            }

            case "level":
                if (ns.hacknet.upgradeLevel(best.index, 1)) {
                    ns.print(`⬆️ Level +1 on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                } else {
                    ns.print(`❌ Failed to upgrade level on node ${best.index}`);
                }
                break;

            case "ram":
                if (ns.hacknet.upgradeRam(best.index, 1)) {
                    ns.print(`🧠 RAM +1 step on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                } else {
                    ns.print(`❌ Failed to upgrade RAM on node ${best.index}`);
                }
                break;

            case "core":
                if (ns.hacknet.upgradeCore(best.index, 1)) {
                    ns.print(`🧪 Core +1 on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                } else {
                    ns.print(`❌ Failed to upgrade core on node ${best.index}`);
                }
                break;
        }

        await ns.sleep(1000);
    }
}

/**
 * Estimate the cost of an "ideal" hacking-focused augment bundle for this run.
 * Uses logic similar to aug-plan.js:
 *  - Look at all joined factions
 *  - Consider only augs you can afford by rep (repReq <= current rep)
 *  - Skip NeuroFlux for the bundle (we treat NF as a money sink after)
 *  - Score augs by hacking usefulness
 *  - Take top N and sum their prices
 */
function getIdealHackingBundleCost(ns, maxCount = 6) {
    // If we don't have the necessary aug APIs (no SF4 / early), just bail out
    if (!hasAugApis(ns)) {
        return 0;
    }

    const player   = ns.getPlayer();
    const factions = player.factions;
    const owned = new Set(getOwnedAugmentationsSafe(ns, true)); // include queued

    if (factions.length === 0) return 0;

    const entries = [];

    for (const fac of factions) {
        const rep = getFactionRepSafe(ns, fac);
        const augs = ns.getAugmentationsFromFaction(fac);

        for (const aug of augs) {
            if (owned.has(aug)) continue; // already own or queued

            const isNeuroFlux = aug.toLowerCase().includes("neuroflux");
            if (isNeuroFlux) continue; // exclude NF from bundle calculation

            const repReq = ns.getAugmentationRepReq(aug);
            if (repReq > rep) continue; // can't reasonably get it THIS run yet

            const price = ns.getAugmentationPrice(aug);
            const stats = ns.getAugmentationStats(aug);
            const score = computeHackScore(stats);

            entries.push({ aug, faction: fac, price, repReq, score });
        }
    }

    if (entries.length === 0) return 0;

    // Sort best hacking augs by score desc, then cheaper first
    entries.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.price - b.price;
    });

    // Take top N (maxCount) and sum their prices
    let sum = 0;
    for (let i = 0; i < Math.min(maxCount, entries.length); i++) {
        sum += entries[i].price;
    }

    return sum;
}

function getOwnedAugmentationsSafe(ns, purchased = true) {
    try {
        // New API: ns.singularity.getOwnedAugmentations
        if (ns.singularity && typeof ns.singularity.getOwnedAugmentations === "function") {
            return ns.singularity.getOwnedAugmentations(purchased);
        }

        // (Very old API fallback, in case you ever load a legacy script):
        if (typeof ns.getOwnedAugmentations === "function") {
            return ns.getOwnedAugmentations(purchased);
        }
    } catch (_e) {
        // ignore and fall through
    }

    // No Singularity access (no SF4 / early game): pretend we have none
    return [];
}

function getFactionRepSafe(ns, faction) {
    try {
        // Newer Singularity API
        if (ns.singularity && typeof ns.singularity.getFactionRep === "function") {
            return ns.singularity.getFactionRep(faction);
        }

        // Older / direct API
        if (typeof ns.getFactionRep === "function") {
            return ns.getFactionRep(faction);
        }
    } catch (_e) {
        // ignore errors and fall through
    }
    // If we can't read rep, treat it as 0
    return 0;
}

function hasAugApis(ns) {
    // Basic aug/faction APIs we need
    const basicFns = [
        "getAugmentationsFromFaction",
        "getAugmentationRepReq",
        "getAugmentationPrice",
        "getAugmentationStats",
    ];

    for (const fn of basicFns) {
        if (typeof ns[fn] !== "function") {
            return false;
        }
    }

    // Need *some* way to get faction rep
    const hasRep =
        (typeof ns.getFactionRep === "function") ||
        (ns.singularity && typeof ns.singularity.getFactionRep === "function");

    return hasRep;
}


/**
 * Compute a rough 'hacking value' score for an augmentation.
 * Same idea as aug-plan.js (hack mode):
 *  - hacking_mult
 *  - hacking_exp_mult
 *  - hacking_speed_mult
 *  - hacking_money_mult
 *  - hacking_chance_mult
 *  - faction_rep_mult & company_rep_mult
 *  - small nod to crime multipliers
 */
function computeHackScore(stats) {
    const {
        hacking_mult                 = 1,
        hacking_exp_mult             = 1,
        hacking_speed_mult           = 1,
        hacking_money_mult           = 1,
        hacking_chance_mult          = 1,
        faction_rep_mult             = 1,
        company_rep_mult             = 1,
        crime_money_mult             = 1,
        crime_success_mult           = 1
    } = stats;

    const wHack       = 5;
    const wHackExp    = 3;
    const wHackSpeed  = 4;
    const wHackMoney  = 5;
    const wHackChance = 2;
    const wFacRep     = 1.5;
    const wComRep     = 0.5;
    const wCrime      = 0.5;

    let score = 0;
    score += (hacking_mult        - 1) * wHack;
    score += (hacking_exp_mult    - 1) * wHackExp;
    score += (hacking_speed_mult  - 1) * wHackSpeed;
    score += (hacking_money_mult  - 1) * wHackMoney;
    score += (hacking_chance_mult - 1) * wHackChance;
    score += (faction_rep_mult    - 1) * wFacRep;
    score += (company_rep_mult    - 1) * wComRep;
    score += ((crime_money_mult - 1) + (crime_success_mult - 1)) * wCrime;

    return score;
}
