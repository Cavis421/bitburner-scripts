/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // ------------------------------------------------------------
    // Help handling
    // ------------------------------------------------------------
    // Honor a --help flag without changing any existing positional behavior.
    // If present, print help text and exit immediately.
    if (ns.args.includes("--help")) {
        printHelp(ns);
        return;
    }

    // Manager mode:
    //   run botnet/xp-home-burner.js --auto [target] [reserveRam]
    //
    // Worker mode:
    //   run botnet/xp-home-burner.js [target]  (with N threads)
    //
    if (ns.args[0] === "--auto") {
        const target = ns.args[1] || "run4theh111z";  // good XP target for you
        const reserveRam = ns.args[2] !== undefined ? Number(ns.args[2]) : 64; // GB to keep free on home

        const scriptName = ns.getScriptName();
        const scriptRam  = ns.getScriptRam(scriptName);
        const maxRam     = ns.getServerMaxRam("home");
        const usedRam    = ns.getServerUsedRam("home");

        const freeRam = maxRam - usedRam - reserveRam;
        const threads = Math.floor(freeRam / scriptRam);

        if (threads < 1) {
            ns.tprint(`xp-home-burner: Not enough free RAM on home after reserving ${reserveRam}GB.`);
            ns.tprint(`   Free: ${freeRam.toFixed(1)}GB, Script RAM: ${scriptRam.toFixed(2)}GB`);
            return;
        }

        ns.tprint(`xp-home-burner: Spawning ${threads} XP threads vs ${target} on home (reserve ${reserveRam}GB).`);
        ns.run(scriptName, threads, target);
        return;
    }

    // Worker mode: this instance just spams hack() forever with its threads
    const target = ns.args[0] || "run4theh111z";

    ns.print(`xp-home-burner worker: Hacking ${target} for XP.`);
    while (true) {
        await ns.hack(target);
    }
}

// ------------------------------------------------------------
// Help text
// ------------------------------------------------------------

function printHelp(ns) {
    ns.tprint("botnet/xp-home-burner.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Home-only XP burner with manager and worker modes.");
    ns.tprint("  In --auto manager mode, it calculates spare home RAM (after");
    ns.tprint("  a configurable reserve) and spawns worker threads that hack");
    ns.tprint("  a chosen XP target in a tight loop.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - Manager mode (--auto) should be run with 1 thread.");
    ns.tprint("  - Worker mode is the same script run with N threads.");
    ns.tprint("  - Default XP target is run4theh111z; override with a positional arg.");
    ns.tprint("  - Default reserveRam is 64GB; override with a third positional arg.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run botnet/xp-home-burner.js --auto [target] [reserveRam]");
    ns.tprint("  run botnet/xp-home-burner.js [target]");
    ns.tprint("  run botnet/xp-home-burner.js --help");
}
