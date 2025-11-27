/** @param {NS} ns **/
export async function main(ns) {
    const node = ns.getPlayer().bitNodeN;
    ns.tprint(`?? You are in BitNode-${node}`);
}