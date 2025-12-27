import {
    getInfiltrationRows,
    estimateInfiltrationSuccess,
    expectedMoneyPerHour,
    formatMoney,
    formatTime,
    pad,
    trunc,
} from "lib/infiltration.js";

/**
 * bin/infiltrate-money.js
 *
 * Top infiltrations sorted by ${sortMode}, showing ${out.length}/${scored.length}:`
 */

export function printHelp(ns) {
    ns.tprint([
        "bin/infiltrate-money.js",
        "Description:",
        "  Lists infiltration locations and ranks them by expected money per hour,",
        "  weighted by an estimated success probability based on your stats.",
        "",
        "Usage:",
        "  run bin/infiltrate-money.js [--top N] [--city NAME] [--min-diff X] [--max-diff X]",
        "                             [--min-p P] [--max-p P] [--diff-scale N] [--level-scale N]",
        "                             [--success P] [--json] [--runbook]",
        "",
        "Options:",
        "  --help         Show this help and exit.",
        "  --top          Show top N results (default: 10).",
        "  --city         Filter by city substring (case-insensitive).",
        "  --min-diff     Minimum difficulty (default: 0).",
        "  --max-diff     Maximum difficulty (default: 999).",
        "  --debug        Print API diagnostics (counts + sample objects).",
        "  --sort         Sort by: money (expected $/hr), psuccess (highest success)",
        "                 time (fastest), diff (lowest difficulty), payout (highest raw payout).",
        "                 Default: money.",
        "",
        "Success weighting (estimation knobs):",
        "  --success      Override overall success probability (0..1). If set, disables estimation.",
        "  --min-p        Minimum per-level success probability floor (default: 0.70).",
        "  --max-p        Maximum per-level success probability ceiling (default: 0.999).",
        "  --diff-scale   Difficulty scale factor (default: 55). Higher => difficulty hurts less.",
        "  --level-scale  Multiplier on level exponent (default: 1.0). Higher => long infiltrations penalized more.",
        "",
        "Output:",
        "  --json         Print results as JSON.",
        "  --runbook      Print a short step-by-step for the #1 pick.",
        "",
        "Notes:",
        "  - This does not automate infiltration minigames; it only helps you choose targets.",
        "  - Expected $/hr assumes the provided/estimated time per run; your actual speed affects results.",
    ].join("\n"));
}

/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
        ["top", 10],
        ["city", ""],
        ["min-diff", 0],
        ["max-diff", 999],

        ["success", null],
        ["min-p", 0.70],
        ["max-p", 0.999],
        ["diff-scale", 55],
        ["level-scale", 1.0],

        ["json", false],
        ["runbook", false],
        ["debug", false],
        ["sort", "money"], // money|psuccess|time|diff|payout


    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    if (!ns.infiltration || !ns.infiltration.getPossibleLocations || !ns.infiltration.getInfiltration) {
        ns.tprint("ERROR: ns.infiltration API not available in this Bitburner version.");
        return;
    }

    const topN = Math.max(1, Number(flags.top) || 10);
    const cityFilter = String(flags.city || "").trim().toLowerCase();
    const minDiff = Number(flags["min-diff"]) ?? 0;
    const maxDiff = Number(flags["max-diff"]) ?? 999;

    const opts = {
        overrideSuccess: flags.success == null ? null : Number(flags.success),
        minLevelP: Number(flags["min-p"]),
        maxLevelP: Number(flags["max-p"]),
        difficultyScale: Number(flags["diff-scale"]),
        levelExponentScale: Number(flags["level-scale"]),
    };

    let rows = getInfiltrationRows(ns, flags.debug);

    rows = rows.filter(r =>
        r.difficulty >= minDiff &&
        r.difficulty <= maxDiff &&
        (!cityFilter || r.city.toLowerCase().includes(cityFilter))
    );

    const scored = rows.map(r => {
        const pRun = estimateInfiltrationSuccess(ns, r, opts);
        const expPerHour = expectedMoneyPerHour(r, pRun);
        return { ...r, successProb: pRun, expectedPerHour: expPerHour };
    });

    const sortMode = String(flags.sort || "money").toLowerCase();

if (sortMode === "psuccess") {
    scored.sort((a, b) => b.successProb - a.successProb);
} else if (sortMode === "time") {
    scored.sort((a, b) => a.timeSeconds - b.timeSeconds);
} else if (sortMode === "diff") {
    scored.sort((a, b) => a.difficulty - b.difficulty);
} else if (sortMode === "payout") {
    scored.sort((a, b) => b.rewardMoney - a.rewardMoney);
} else {
    // default: expected money/hr
    scored.sort((a, b) => b.expectedPerHour - a.expectedPerHour);
}


    const out = scored.slice(0, topN);

    if (flags.json) {
        ns.tprint(JSON.stringify(out, null, 2));
        return;
    }

    ns.tprint(
        [
            `Top infiltrations by expected $/hr (weighted), showing ${out.length}/${scored.length}:`,
            "------------------------------------------------------------------------------------------------------------",
            pad("City", 14) + " " +
            pad("Location", 28) + " " +
            pad("Diff", 6) + " " +
            pad("Lvls", 5) + " " +
            pad("Time", 10) + " " +
            pad("Money", 14) + " " +
            pad("P(success)", 10) + " " +
            pad("Exp $/hr", 14),
            "------------------------------------------------------------------------------------------------------------",
            ...out.map(r =>
                pad(r.city, 14) + " " +
                pad(trunc(r.location, 28), 28) + " " +
                pad(r.difficulty.toFixed(1), 6) + " " +
                pad(String(r.levels), 5) + " " +
                pad(formatTime(r.timeSeconds), 10) + " " +
                pad(formatMoney(r.rewardMoney), 14) + " " +
                pad((r.successProb * 100).toFixed(1) + "%", 10) + " " +
                pad(formatMoney(r.expectedPerHour), 14)
            ),
        ].join("\n")
    );

    if (flags.runbook && out.length > 0) {
        const best = out[0];
        ns.tprint("\nRunbook for best expected money/hr target:");
        ns.tprint(`1) Travel to: ${best.city}`);
        ns.tprint(`2) Go to location: ${best.location}`);
        ns.tprint("3) Start infiltration manually (World → City → Company/Location → Infiltrate).");
        ns.tprint("4) Choose the MONEY reward option at the end.");
        ns.tprint(`   Raw: ${formatMoney(best.rewardMoney)} per run, ~${formatTime(best.timeSeconds)} per run`);
        ns.tprint(`   Estimated success: ${(best.successProb * 100).toFixed(1)}%`);
        ns.tprint(`   Expected: ${formatMoney(best.expectedPerHour)}/hr (estimate; your skill/speed matters)`);
    }
}
