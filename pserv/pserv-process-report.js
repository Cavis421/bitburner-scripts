/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const pservs = ns.getPurchasedServers();
    if (pservs.length === 0) {
        ns.tprint("? No purchased servers found.");
        return;
    }

    ns.tprint("???  PSERV PROCESS REPORT");
    ns.tprint("------------------------------------------");

    for (const host of pservs) {
        const procs = ns.ps(host);

        if (procs.length === 0) {
            ns.tprint(`\n${host} (RAM: ${ns.getServerMaxRam(host)}GB)`);
            ns.tprint("  • No processes running");
            continue;
        }

        ns.tprint(`\n${host} (RAM: ${ns.getServerMaxRam(host)}GB)`);

        for (const p of procs) {
            const ram = ns.getScriptRam(p.filename);
            const ramUsed = ram * p.threads;

            ns.tprint(
                `  • ${p.filename.padEnd(18)}  ` +
                `PID=${p.pid.toString().padEnd(6)}  ` +
                `Threads=${p.threads.toString().padEnd(5)}  ` +
                `RAM=${ramUsed.toFixed(1)}GB`
            );
        }
    }

    ns.tprint("\n------------------------------------------");
    ns.tprint("?? End of report.");
}