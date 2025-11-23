/** @param {NS} ns */
export async function main(ns) {
    const servers = ns.getPurchasedServers();
    ns.tprint("Purchased Servers:");
    for (const s of servers) ns.tprint(" - " + s);
}
