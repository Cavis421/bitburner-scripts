/**
 * bin/intelligence-trainer.js
 *
 * Description
 *  Passive Intelligence XP trainer meant to run as a controller-managed daemon.
 *  Uses a time-slice approach so you still gain INT even if your controller keeps you busy.
 *
 *  Behavior (during INT slice window):
 *   1) If any darkweb programs are missing: createProgram() (INT XP + utility)
 *   2) Otherwise: study "Computer Science" at university
 *  Outside the slice: does nothing (lets controller run your normal work)
 *
 * Notes
 *  - Requires Singularity (Source-File 4).
 *  - Uses ns.singularity.stopAction() at end of slice; controller will re-assert its work next tick.
 *  - By default, does NOT interrupt faction work (set --respectFaction false to allow).
 *
 * Syntax
 *  run bin/intelligence-trainer.js [--help]
 *  run bin/intelligence-trainer.js --periodMin 60 --sliceMin 10
 *  run bin/intelligence-trainer.js --respectFaction false
 *  run bin/intelligence-trainer.js --city Sector-12 --university "Rothman University"
 */

/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],

        // Time slicing
        ["periodMin", 60],        // repeat interval
        ["sliceMin", 10],         // how long to do INT work each period
        ["offsetMin", 0],         // shift schedule (useful if you want it aligned differently)
        ["respectFaction", true], // if true: don't interrupt FACTION work

        // Study settings
        ["city", "Sector-12"],
        ["university", "Rothman University"],

        // Loop cadence
        ["pollMs", 5_000],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    if (!ns.singularity) {
        ns.tprint("ERROR: Requires Singularity (SF4).");
        return;
    }

    const periodMs = Math.max(60_000, Number(flags.periodMin) * 60_000);
    const sliceMs = Math.max(5_000, Number(flags.sliceMin) * 60_000);
    const offsetMs = Math.max(0, Number(flags.offsetMin) * 60_000);
    const pollMs = Math.max(1_000, Number(flags.pollMs) || 5_000);

    const respectFaction = !!flags.respectFaction;
    const city = String(flags.city || "Sector-12");
    const university = String(flags.university || "Rothman University");

    // Track whether *we* started an INT slice so we can stopAction() cleanly at end.
    let sliceActive = false;
    let sliceEndAt = 0;

    while (true) {
        const now = Date.now();

        // Compute whether we should be in the slice window.
        // Window is [windowStart, windowStart + sliceMs) within each period.
        const phase = mod(now - offsetMs, periodMs);
        const shouldSlice = phase < sliceMs;

        // If slice time ended and we were active, stop and let controller resume normal work.
        if (!shouldSlice && sliceActive) {
            try {
                ns.singularity.stopAction();
            } catch { /* ignore */ }
            sliceActive = false;
            sliceEndAt = 0;
            await ns.sleep(pollMs);
            continue;
        }

        // If not in slice window, do nothing.
        if (!shouldSlice) {
            await ns.sleep(pollMs);
            continue;
        }

        // We are in slice window.
        // If respectFaction=true and current work is FACTION, skip the slice (no interruption).
        const work = safe(() => ns.singularity.getCurrentWork(), null);
        if (respectFaction && work && String(work.type || "").toUpperCase() === "FACTION") {
            await ns.sleep(pollMs);
            continue;
        }

        // Mark slice active (so we can stopAction() when leaving the window).
        if (!sliceActive) {
            sliceActive = true;
            // for debugging / optional logging
            sliceEndAt = now + (sliceMs - phase);
            ns.print(`[intTrainer] INT slice started; ends in ${Math.ceil((sliceEndAt - now) / 1000)}s`);
        }

        // During the slice: prefer creating missing programs, else study CS.
        if (tryStartCreateMissingProgram(ns)) {
            await ns.sleep(pollMs);
            continue;
        }

        // Fall back to studying CS
        try { ns.singularity.travelToCity(city); } catch { /* ignore */ }
        const ok = safe(() => ns.singularity.universityCourse(university, "Computer Science", false), false);
        if (!ok) ns.print(`[intTrainer] WARN: failed to start universityCourse at "${university}" in "${city}"`);

        await ns.sleep(pollMs);
    }
}

function tryStartCreateMissingProgram(ns) {
    // If we can’t access darkweb list yet, just return false and study instead.
    const progs = safe(() => ns.singularity.getDarkwebPrograms(), null);
    if (!Array.isArray(progs) || progs.length === 0) return false;

    for (const p of progs) {
        if (!ns.fileExists(p, "home")) {
            const ok = safe(() => ns.singularity.createProgram(p, false), false);
            if (ok) {
                ns.print(`[intTrainer] creating program: ${p}`);
                return true;
            }
            // If createProgram fails (requirements not met), move on to studying.
            return false;
        }
    }
    return false;
}

function safe(fn, fallback) {
    try { return fn(); } catch { return fallback; }
}

// Proper modulo for negative values too
function mod(a, b) {
    const r = a % b;
    return r < 0 ? r + b : r;
}

function printHelp(ns) {
    ns.tprint("bin/intelligence-trainer.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Time-sliced Intelligence XP trainer for controller-managed use.");
    ns.tprint("  During slice window: create missing programs, else study Computer Science.");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - Requires Singularity (SF4).");
    ns.tprint("  - Calls stopAction() when leaving slice; controller will resume normal work next tick.");
    ns.tprint("  - By default does not interrupt FACTION work (use --respectFaction false to allow).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run bin/intelligence-trainer.js [--help]");
    ns.tprint("  run bin/intelligence-trainer.js --periodMin 60 --sliceMin 10");
    ns.tprint("  run bin/intelligence-trainer.js --respectFaction false");
    ns.tprint("  run bin/intelligence-trainer.js --city Sector-12 --university \"Rothman University\"");
    ns.tprint("");
    ns.tprint("Flags");
    ns.tprint("  --periodMin <n>         Repeat interval in minutes (default 60)");
    ns.tprint("  --sliceMin <n>          INT slice duration per period (default 10)");
    ns.tprint("  --offsetMin <n>         Shift schedule by minutes (default 0)");
    ns.tprint("  --respectFaction true|false  Don't interrupt faction work (default true)");
    ns.tprint("  --city <name>           City for university (default Sector-12)");
    ns.tprint("  --university <name>     University name (default Rothman University)");
    ns.tprint("  --pollMs <ms>           Loop polling interval (default 5000)");
}
