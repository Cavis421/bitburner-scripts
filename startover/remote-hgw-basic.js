/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = ns.args[0] || "n00dles";

    if (!ns.serverExists(target)) {
        ns.tprint(`❌ remote-hgw-basic: target '${target}' does not exist.`);
        return;
    }

    ns.print(`🔁 remote-hgw-basic started on ${ns.getHostname()} vs ${target}`);

    while (true) {
        const minSec = ns.getServerMinSecurityLevel(target);
        const curSec = ns.getServerSecurityLevel(target);
        const maxMoney = ns.getServerMaxMoney(target);
        const curMoney = ns.getServerMoneyAvailable(target);

        const secThresh = minSec + 5;     // keep security within +5 of minimum
        const moneyThresh = maxMoney * 0.75; // keep at least 75% of max money

        if (curSec > secThresh) {
            await ns.weaken(target);
        } else if (curMoney < moneyThresh) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}
