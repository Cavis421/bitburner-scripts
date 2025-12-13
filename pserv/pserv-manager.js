/** @param {NS} ns */

// ------------------------------------------------------------
// Flags
// ------------------------------------------------------------
const FLAGS = [
    ["maxRam", 8192],   // Target max RAM per pserv
    ["spendFrac", 0.5], // Max fraction of money to spend per purchase/upgrade
    ["minRam", 8],      // Smallest tier (GB) and purchase size
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

    // Backwards-compat: allow positional [maxRam] as before
    const positionalMax = flags._[0];
    let maxDesiredRam = Number(positionalMax ?? flags.maxRam);
    let minRam = Number(flags.minRam);
    const spendFraction = Number(flags.spendFrac);

    // Basic sanity clamping
    if (!Number.isFinite(maxDesiredRam) || maxDesiredRam < 8) maxDesiredRam = 8;
    if (!Number.isFinite(minRam) || minRam < 8) minRam = 8;
    if (minRam > maxDesiredRam) minRam = maxDesiredRam;

    // Helper: nice $ formatting using ns.formatNumber
    const fmtMoney = (value) => "$" + ns.formatNumber(value, 2, 1e3);

    // --------------------------------------------------------
    // Build RAM tiers: minRam, minRam*2, ..., up to maxDesiredRam
    // (last tier is always exactly maxDesiredRam)
    // --------------------------------------------------------
    const tiers = [];
    let ram = minRam;
    while (ram < maxDesiredRam) {
        tiers.push(ram);
        ram *= 2;
    }
    if (tiers.length === 0 || tiers[tiers.length - 1] !== maxDesiredRam) {
        tiers.push(maxDesiredRam);
    }

    ns.tprint("🖥️ pserv-manager started.");
    ns.tprint(`    Min tier / purchase size: ${minRam}GB`);
    ns.tprint(`    Max target RAM per pserv: ${maxDesiredRam}GB`);
    ns.tprint(`    Spend fraction per purchase: ${(spendFraction * 100).toFixed(0)}%`);

    while (true) {
        const limit = ns.getPurchasedServerLimit();
        if (limit <= 0) {
            ns.print("⚠️ Purchased server limit is 0 in this BitNode. Sleeping.");
            await ns.sleep(30000);
            continue;
        }

        const money = ns.getServerMoneyAvailable("home");
        const servers = ns.getPurchasedServers();

        const info = servers
            .map(name => ({
                name,
                ram: ns.getServerMaxRam(name),
            }))
            .sort((a, b) => a.ram - b.ram);

        // ----------------------------------------------------
        // PHASE 1: Buy new 8GB (minRam) pservs until we hit the limit
        // ----------------------------------------------------
        if (servers.length < limit) {
            const purchaseRam = minRam; // ALWAYS buy at minRam in phase 1
            const cost = ns.getPurchasedServerCost(purchaseRam);
            const budget = money * spendFraction;

            if (cost > budget || cost > money) {
                ns.print(
                    `💸 Not enough funds to buy new ${purchaseRam}GB pserv. ` +
                    `Cost=${fmtMoney(cost)}, Budget=${fmtMoney(budget)}, Money=${fmtMoney(money)}. Waiting...`
                );
                await ns.sleep(10000);
                continue;
            }

            const newName = nextServerName(ns);
            const result = ns.purchaseServer(newName, purchaseRam);

            if (result) {
                ns.tprint(
                    `🖥️ Purchased ${newName} with ${purchaseRam}GB ` +
                    `for ${fmtMoney(cost)}. (${servers.length + 1}/${limit})`
                );
            } else {
                ns.print("⚠️ purchaseServer failed unexpectedly (new server).");
            }

            await ns.sleep(500);
            continue;
        }

        // From here on, servers.length === limit (we're at the cap)

        const smallestRam = info.length > 0 ? info[0].ram : 0;

        // If at limit and all pservs at/above maxDesiredRam, we're done
        if (smallestRam >= maxDesiredRam) {
            ns.print("✅ All purchased servers at or above target max RAM. Sleeping longer.");
            await ns.sleep(60000);
            continue;
        }

        // ----------------------------------------------------
        // PHASE 2: Tiered upgrades
        //
        // Determine current tier = highest tier for which
        // *all* servers are >= tier.
        // Then target tier is the next one.
        // ----------------------------------------------------
        let currentTierIndex = -1; // -1 means "below the first tier"
        if (info.length > 0) {
            for (let i = 0; i < tiers.length; i++) {
                const tierRam = tiers[i];
                if (info.every(s => s.ram >= tierRam)) {
                    currentTierIndex = i;
                } else {
                    break;
                }
            }
        }

        let nextTierIndex = currentTierIndex + 1;
        if (nextTierIndex >= tiers.length) {
            // All servers are already >= max tier, but we know smallestRam < maxDesiredRam
            // only because maxDesiredRam may have been changed; clamp to last tier.
            nextTierIndex = tiers.length - 1;
        }

        const targetRam = tiers[nextTierIndex];
        const cost = ns.getPurchasedServerCost(targetRam);
        const budget = money * spendFraction; // still useful for logging/insight

        // For Phase 2 upgrades, only block if you *literally* can't afford it.
        // spendFrac is informational here, not a hard cap.
        if (cost > money) {
            ns.print(
                `💸 Not enough funds to reach tier ${targetRam}GB. ` +
                `Cost=${fmtMoney(cost)}, Money=${fmtMoney(money)}. Waiting...`
            );
            await ns.sleep(10000);
            continue;
        } else if (cost > budget) {
            ns.print(
                `⚠️ Upgrade to tier ${targetRam}GB exceeds spendFrac budget ` +
                `(Cost=${fmtMoney(cost)} > Budget=${fmtMoney(budget)}), ` +
                `but proceeding since we have enough money.`
            );
        }

        // ----------------------------------------------------
        // At server limit → upgrade weakest servers that
        // are below the current target tier.
        //
        // This ensures:
        //   - All servers are brought up to targetRam
        //   - THEN we move up to the next tier
        // ----------------------------------------------------
        const upgradeCandidates = info.filter(s => s.ram < targetRam);

        if (upgradeCandidates.length === 0) {
            // All servers are at/above target tier; next loop will move us to a higher tier.
            ns.print(
                `📈 All servers are at or above current target tier (${targetRam}GB). ` +
                `Advancing tiers soon...`
            );
            await ns.sleep(5000);
            continue;
        }

        const weakest = upgradeCandidates[0];

        if (cost > money) {
            ns.print(
                `💸 Not enough money to upgrade ${weakest.name} ` +
                `from ${weakest.ram}GB → ${targetRam}GB. Waiting...`
            );
            await ns.sleep(10000);
            continue;
        }

        ns.tprint(
            `⬆️ Tier upgrade: ${weakest.name} from ${weakest.ram}GB → ${targetRam}GB ` +
            `for ${fmtMoney(cost)} (tier=${targetRam}GB).`
        );

        ns.killall(weakest.name);
        ns.deleteServer(weakest.name);
        const result = ns.purchaseServer(weakest.name, targetRam);

        if (!result) {
            ns.print("⚠️ purchaseServer (upgrade) failed unexpectedly.");
        }

        await ns.sleep(500);
    }
}

/** @param {NS} ns */
function nextServerName(ns) {
    const base = "pserv-";
    const existing = new Set(ns.getPurchasedServers());
    let i = 0;
    while (existing.has(base + i)) i++;
    return base + i;
}

// ------------------------------------------------------------
// Minimal HELP: Description, Notes, Syntax
// ------------------------------------------------------------
function printHelp(ns) {
    const script = "pserv/pserv-manager.js";

    ns.tprint("==============================================================");
    ns.tprint(`HELP — ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");

    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Manages your purchased servers (pserv-*), buying and upgrading");
    ns.tprint("  them in RAM tiers while keeping them roughly equal.");
    ns.tprint("");
    ns.tprint("  Phase 1:");
    ns.tprint("    - Buys new pservs at minRam (default 8GB) until you reach");
    ns.tprint("      the purchased server limit.");
    ns.tprint("  Phase 2:");
    ns.tprint("    - Once at the limit, finds the lowest-RAM pserv and upgrades");
    ns.tprint("      it to the next tier (minRam, minRam*2, ..., maxRam).");
    ns.tprint("    - All servers are brought up to a given RAM tier before any");
    ns.tprint("      move to the next tier (e.g., all reach 512GB before any");
    ns.tprint("      go to 1024GB).");
    ns.tprint("");

    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Uses a tier list: minRam, minRam*2, minRam*4, ... up to maxRam.");
    ns.tprint("  - New servers are ALWAYS bought at minRam while under the server limit.");
    ns.tprint("  - When at the server limit, the weakest servers below the");
    ns.tprint("    current target tier are upgraded to that tier.");
    ns.tprint("  - Only spends up to --spendFrac of current funds on a single");
    ns.tprint("    purchase or upgrade (default 0.5 = 50%).");
    ns.tprint("");

    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run pserv/pserv-manager.js");
    ns.tprint("  run pserv/pserv-manager.js <maxRam>");
    ns.tprint("  run pserv/pserv-manager.js --maxRam 16384");
    ns.tprint("  run pserv/pserv-manager.js --maxRam 32768 --spendFrac 0.25");
    ns.tprint("  run pserv/pserv-manager.js --minRam 8");
    ns.tprint("  run pserv/pserv-manager.js --help");
    ns.tprint("");

    ns.tprint("==============================================================");
    ns.tprint("");
}
