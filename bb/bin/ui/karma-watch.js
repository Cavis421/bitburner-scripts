/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.ui.openTail(); // open a small log window

    while (true) {
        ns.clearLog();

        // "Secret" karma function (now semi-documented)
        const karma = ns.heart.break();

        // On newer versions, it's also on getPlayer().karma
        const p = ns.getPlayer();

        ns.print(`Karma (heart.break): ${karma}`);
        if (p.karma !== undefined) {
            ns.print(`Karma (getPlayer):  ${p.karma}`);
        }

        await ns.sleep(1000);
    }
}