/** @param {NS} ns **/
export async function main(ns) {
    const pservs = ns.getPurchasedServers();
    for (const host of pservs) {
        ns.tprint(`🔪 Killing all scripts on ${host}...`);
        ns.killall(host);
    }
    ns.tprint("✅ All pservs cleaned.");
}