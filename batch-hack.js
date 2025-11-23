/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const startDelay = Number(ns.args[1] ?? 0);
    const expectedTime = Number(ns.args[2] ?? 0);  // MUST be hack time

    if (!target) return;

    // Delay until batch start
    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.hack(target);
    const end = performance.now();

    const actual = end - start;
    const drift = expectedTime - actual;

    if (drift > 1) await ns.sleep(drift);
}