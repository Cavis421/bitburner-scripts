/** @param {NS} ns **/

// ------------------------------------------------------------
// Flags
// ------------------------------------------------------------
const FLAGS = [
    ["help", false],
];

export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags(FLAGS);

    // --help handler
    if (flags.help) {
        printHelp(ns);
        return;
    }

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

// ------------------------------------------------------------
// Minimal HELP: Description, Notes, Syntax
// ------------------------------------------------------------
function printHelp(ns) {
    const script = "pserv/pserv-process-report.js";

    ns.tprint("==============================================================");
    ns.tprint(`HELP — ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");

    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Displays all running scripts across your purchased servers.");
    ns.tprint("  For each pserv, prints:");
    ns.tprint("    - Total RAM on the server");
    ns.tprint("    - Whether it has any running scripts");
    ns.tprint("    - PID, filename, thread count, and RAM usage per script.");
    ns.tprint("");

    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Uses ns.getPurchasedServers() to enumerate pserv-* hosts.");
    ns.tprint("  - Uses ns.ps(host) to list running scripts on each host.");
    ns.tprint("  - RAM per script is computed as scriptRam * thread count.");
    ns.tprint("  - Servers with no processes show 'No processes running'.");
    ns.tprint("");

    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run pserv/pserv-process-report.js");
    ns.tprint("  run pserv/pserv-process-report.js --help");
    ns.tprint("");

    ns.tprint("==============================================================");
    ns.tprint("");
}
