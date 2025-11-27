/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const startDelay = Number(ns.args[1] ?? 0);
    const expectedTime = Number(ns.args[2] ?? 0); // grow time

    if (!target) return;

    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.grow(target);
    const end = performance.now();

    const drift = expectedTime - (end - start);
    if (drift > 1) await ns.sleep(drift);
}