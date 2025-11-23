/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0];
    if (!target) {
        ns.tprint("Usage: run prep-target.js [server]");
        return;
    }

    ns.tprint(`🌱 PREPPING ${target}...`);

    while (true) {
        const sec = ns.getServerSecurityLevel(target);
        const minSec = ns.getServerMinSecurityLevel(target);
        const money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);

        if (sec > minSec + 0.5) {
            await ns.weaken(target);
        } 
        else if (money < maxMoney * 0.99) {
            await ns.grow(target);
        }
        else {
            ns.tprint(`✨ ${target} fully prepped!`);
            return;
        }
    }
}
