/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Helper: nice $ formatting using ns.formatNumber
    const fmtMoney = (value) => "$" + ns.formatNumber(value, 2, 1e3);

    // Max RAM you ultimately want per server (default 8192 GB; pass 2048 if you want smaller cap)
    const maxDesiredRam = Number(ns.args[0] ?? 8192);

    // How aggressively to spend money:
    // 0.5 = use up to 50% of current money on a single purchase/upgrade
    const spendFraction = 0.5;

    const minRam = 8; // minimum pserv size in GB (Bitburner default)

    ns.tprint(`🖥️ pserv-manager started. Target max RAM: ${maxDesiredRam}GB`);

    while (true) {
        const limit = ns.getPurchasedServerLimit();
        let servers = ns.getPurchasedServers();
        const money = ns.getServerMoneyAvailable("home");

        // Build list of {name, ram}
        const info = servers
            .map(name => ({
                name,
                ram: ns.getServerMaxRam(name),
            }))
            .sort((a, b) => a.ram - b.ram);

        // If we have no servers yet, we treat smallestRam as 0
        const smallestRam = info.length > 0 ? info[0].ram : 0;

        // If all servers already at or above desired max, chill
        if (info.length === limit && smallestRam >= maxDesiredRam) {
            ns.print("✅ All purchased servers at or above target RAM. Sleeping longer.");
            await ns.sleep(60000);
            continue;
        }

        // Decide best RAM we can afford right now
        const budget = money * spendFraction;
        let bestAffordableRam = 0;

        for (let ram = minRam; ram <= maxDesiredRam; ram *= 2) {
            const cost = ns.getPurchasedServerCost(ram);
            if (cost <= budget) {
                bestAffordableRam = ram;
            } else {
                break; // costs only go up from here
            }
        }

        if (bestAffordableRam === 0) {
            ns.print("💸 Not enough money to afford even the smallest upgrade. Waiting...");
            await ns.sleep(10000);
            continue;
        }

        // If we have fewer than the max number of servers: buy a new one
        if (servers.length < limit) {
            const ram = bestAffordableRam;
            const cost = ns.getPurchasedServerCost(ram);

            if (cost > money) {
                ns.print("💸 Not enough money to buy new server with chosen RAM. Waiting...");
                await ns.sleep(10000);
                continue;
            }

            const newName = nextServerName(ns);
            const result = ns.purchaseServer(newName, ram);

            if (result) {
                ns.tprint(`🖥️ Purchased ${newName} with ${ram}GB for ${fmtMoney(cost)}`);
            } else {
                ns.print("⚠️ purchaseServer failed unexpectedly.");
            }

            await ns.sleep(500); // small delay
            continue;
        }

        // Else: we are at server limit → upgrade the weakest server if possible
        const weakest = info[0]; // sorted ascending by RAM

        // If the best we can afford is not better than what weakest already has, wait
        if (bestAffordableRam <= weakest.ram) {
            ns.print(
                `💤 Best affordable RAM (${bestAffordableRam}GB) <= weakest server ` +
                `(${weakest.name}: ${weakest.ram}GB). Waiting...`
            );
            await ns.sleep(15000);
            continue;
        }

        const upgradeRam = bestAffordableRam;
        const upgradeCost = ns.getPurchasedServerCost(upgradeRam);

        if (upgradeCost > money) {
            ns.print("💸 Not enough money to perform upgrade. Waiting...");
            await ns.sleep(10000);
            continue;
        }

        // Upgrade weakest server by deleting & repurchasing with same name
        ns.tprint(
            `⬆️ Upgrading ${weakest.name} from ${weakest.ram}GB → ${upgradeRam}GB ` +
            `for ${fmtMoney(upgradeCost)}`
        );

        ns.killall(weakest.name);
        ns.deleteServer(weakest.name);
        const result = ns.purchaseServer(weakest.name, upgradeRam);

        if (!result) {
            ns.print("⚠️ purchaseServer (upgrade) failed unexpectedly.");
        }

        await ns.sleep(500); // small delay after upgrade
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
