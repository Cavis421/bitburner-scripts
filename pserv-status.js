/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = Number(ns.args[0] ?? 2048); // optional: target RAM for % completion

    const servers = ns.getPurchasedServers();
    if (servers.length === 0) {
        ns.tprint("❌ You have no purchased servers.");
        return;
    }

    let totalRam = 0;
    let minRam = Infinity;
    let maxRam = 0;

    ns.tprint("🖥️ Purchased Server Fleet Status");
    ns.tprint("──────────────────────────────────");

    for (const host of servers) {
        const ram = ns.getServerMaxRam(host);
        totalRam += ram;
        if (ram < minRam) minRam = ram;
        if (ram > maxRam) maxRam = ram;

        ns.tprint(`• ${host} — ${ram} GB`);
    }

    const avgRam = totalRam / servers.length;
    const completion = Math.min(100, (minRam / target) * 100).toFixed(1);

    ns.tprint("──────────────────────────────────");
    ns.tprint(`📊 Total Servers: ${servers.length}`);
    ns.tprint(`📈 Total Fleet RAM: ${ns.nFormat(totalRam * 1e9, "0.00b")}`);
    ns.tprint(`🔻 Weakest Server: ${minRam} GB`);
    ns.tprint(`🔺 Strongest Server: ${maxRam} GB`);
    ns.tprint(`📉 Average RAM: ${avgRam.toFixed(1)} GB`);
    ns.tprint(`🎯 Progress to target (${target}GB min): ${completion}%`);
    ns.tprint("──────────────────────────────────");
}
