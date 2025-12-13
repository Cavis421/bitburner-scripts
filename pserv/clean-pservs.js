/** pserv/clean-pservs.js
 * Kill all scripts on purchased servers.
 * (Does NOT delete files — only kills processes.)
 *
 * @param {NS} ns
 */

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
        ns.tprint("No purchased servers found.");
        return;
    }

    ns.tprint("==============================================================");
    ns.tprint("PSERV CLEANUP — Killing all scripts on purchased servers");
    ns.tprint("==============================================================");
    ns.tprint(`Found ${pservs.length} purchased servers.`);
    ns.tprint("");

    let totalKilled = 0;

    for (const host of pservs) {
        const procs = ns.ps(host);

        if (procs.length === 0) {
            ns.tprint(`${host}: no running scripts.`);
            continue;
        }

        ns.tprint(`${host}: killing ${procs.length} script(s)...`);

        for (const p of procs) {
            try {
                if (ns.kill(p.pid)) {
                    totalKilled++;
                }
            } catch (err) {
                ns.tprint(`  Error killing PID ${p.pid} on ${host}: ${String(err)}`);
            }
        }
    }

    ns.tprint("");
    ns.tprint(`Done. Total scripts killed: ${totalKilled}.`);
    ns.tprint("==============================================================");
}

// ------------------------------------------------------------
// Minimal HELP: Description, Notes, Syntax
// ------------------------------------------------------------
function printHelp(ns) {
    const script = "pserv/clean-pservs.js";

    ns.tprint("==============================================================");
    ns.tprint(`HELP — ${script}`);
    ns.tprint("==============================================================");
    ns.tprint("");

    // DESCRIPTION
    ns.tprint("DESCRIPTION");
    ns.tprint("  Kills ALL running scripts on every purchased server.");
    ns.tprint("  Does NOT delete deployed files — only terminates processes.");
    ns.tprint("");

    // NOTES
    ns.tprint("NOTES");
    ns.tprint("  - Uses ns.getPurchasedServers() to enumerate pserv hosts.");
    ns.tprint("  - Does not touch 'home' or any NPC servers.");
    ns.tprint("  - Safe to run before redeploying updated payloads or batch scripts.");
    ns.tprint("  - Only processes are killed; files remain on disk.");
    ns.tprint("");

    // SYNTAX
    ns.tprint("SYNTAX");
    ns.tprint("  run pserv/clean-pservs.js");
    ns.tprint("  run pserv/clean-pservs.js --help");
    ns.tprint("");

    ns.tprint("==============================================================");
    ns.tprint("");
}
