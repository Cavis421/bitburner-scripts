/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    // Starting snapshot
    let lastMoney = ns.getServerMoneyAvailable("home");
    let startTime = Date.now();
    let totalGained = 0;

    ns.tprint("📊 Money Tracker started. Updating every 5 minutes...");

    while (true) {
        await ns.sleep(5 * 60 * 1000); // 5 minutes

        const now = Date.now();
        const currentMoney = ns.getServerMoneyAvailable("home");

        // Calculate deltas
        const gained = currentMoney - lastMoney;
        totalGained += gained;

        const runtimeMs = now - startTime;
        const runtimeHours = runtimeMs / (1000 * 60 * 60);

        const avgPerHour = totalGained / runtimeHours;

        // Render output
        ns.tprint("==========================================");
        ns.tprint("💰 MONEY TRACKER — 5 MIN UPDATE");
        ns.tprint(`⏱ Runtime:     ${ns.tFormat(runtimeMs)}`);
        ns.tprint(`📈 Gained (5m): $${ns.formatNumber(gained)}`);
        ns.tprint(`💵 Total Gained: $${ns.formatNumber(totalGained)}`);
        ns.tprint(`⚡ Avg/hr:       $${ns.formatNumber(avgPerHour)}`);
        ns.tprint("==========================================");

        // Update snapshot
        lastMoney = currentMoney;
    }
}
