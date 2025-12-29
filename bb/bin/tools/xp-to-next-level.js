/** util/xp-to-next-level.js
 * Show XP needed to reach a target hacking level, plus ETA based on XP throughput.
 *
 * Uses:
 *   - Formulas.exe (ns.formulas.skills.calculateExp / calculateSkill) for exact XP thresholds.
 *   - Optional: data/xp-throughput.txt (written by ui/xp-throughput-monitor.js) for XP/sec estimate.
 *     If missing/stale, measures throughput locally over a short window.
 *
 * Usage:
 *   run util/xp-to-next-level.js                 // XP to next level (current + 1)
 *   run util/xp-to-next-level.js --delta 10      // XP to +10 levels above current
 *   run util/xp-to-next-level.js --to 2500       // XP to absolute level 2500
 *
 * Notes:
 *   - If both --to and --delta are provided, --to is preferred.
 *   - Requires Formulas.exe for accurate XP calculations.
 *
 * @param {NS} ns
 */
export async function main(ns) {
    ns.disableLog("ALL");

    const flags = ns.flags([
        ["help", false],
        ["to", 0],          // absolute target level
        ["delta", 0],       // levels above current
        ["sample", 10],     // seconds to locally sample XP/sec if file is missing/stale
        ["no-file", false], // ignore data/xp-throughput.txt and always do local sampling
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    const METRIC_FILE = "data/xp-throughput.txt";

    const player = ns.getPlayer();
    const currentLevel = getHackLevel(ns, player);
    const currentXp = getHackXp(player);

    let targetLevel;

    const to = Number(flags.to) || 0;
    const delta = Number(flags.delta) || 0;

    if (to > 0 && delta > 0) {
        ns.tprint("?? Both --to and --delta provided; preferring --to.");
    }

    if (to > 0) {
        targetLevel = to;
    } else if (delta > 0) {
        targetLevel = currentLevel + delta;
    } else {
        targetLevel = currentLevel + 1; // default: next level only
    }

    if (!Number.isFinite(targetLevel) || targetLevel <= currentLevel) {
        ns.tprint("? Target level must be greater than your current level.");
        ns.tprint(`   Current: ${currentLevel}, Requested: ${targetLevel}`);
        return;
    }

    if (!hasFormulas(ns)) {
        ns.tprint("? Formulas.exe not found or ns.formulas.skills unavailable.");
        ns.tprint("   This script needs Formulas.exe to compute exact XP thresholds.");
        ns.tprint("   Buy Formulas.exe from the Dark Web to enable util/xp-to-next-level.js.");
        return;
    }

    // Derive effective multiplier so XP thresholds match your displayed level.
    const effMult = getEffectiveSkillMult(ns, currentXp, currentLevel);

    const targetXp = ns.formulas.skills.calculateExp(targetLevel, effMult);
    const xpNeeded = Math.max(0, targetXp - currentXp);

    ns.tprint("=======================================");
    ns.tprint("        ?? XP To Target Level");
    ns.tprint("=======================================");
    ns.tprint(`?? Current hacking level: ${currentLevel}`);
    ns.tprint(`?? Target hacking level:  ${targetLevel}`);
    ns.tprint("---------------------------------------");
    ns.tprint(`?? Current XP:           ${formatXp(ns, currentXp)}`);
    ns.tprint(`?? XP at target level:   ${formatXp(ns, targetXp)}`);
    ns.tprint(`?? XP needed:            ${formatXp(ns, xpNeeded)} XP`);
    ns.tprint(`?? Effective skill mult: ${effMult.toFixed(6)}`);

    // ETA: prefer throughput file if fresh, otherwise sample locally for N seconds.
    const sampleSeconds = Math.max(1, Number(flags.sample) || 10);

    let throughput = null;

    if (!flags["no-file"]) {
        throughput = readThroughputFresh(ns, METRIC_FILE);
    }

    if (!throughput) {
        ns.tprint("---------------------------------------");
        ns.tprint(`?  No fresh throughput file sample found. Measuring XP/sec for ${sampleSeconds}s...`);
        const xpPerSec = await measureXpPerSec(ns, sampleSeconds, 250); // 250ms tick
        throughput = { xpPerSec, windowSeconds: sampleSeconds, ts: Date.now(), source: "local" };
    } else {
        throughput.source = "file";
    }

    if (throughput && throughput.xpPerSec > 0) {
        const seconds = xpNeeded / throughput.xpPerSec;
        const eta = formatDuration(seconds);

        ns.tprint("---------------------------------------");
        ns.tprint("?  ETA based on XP throughput");
        ns.tprint(`?? Source: ${throughput.source}`);
        ns.tprint(`?? XP/sec (avg last ${throughput.windowSeconds.toFixed(0)}s): ${throughput.xpPerSec.toFixed(2)} XP/s`);
        ns.tprint(`? Estimated time to target: ${eta}`);
    } else {
        ns.tprint("---------------------------------------");
        ns.tprint("?? Could not measure XP/sec (are you currently gaining hacking XP?).");
        ns.tprint("   Start your XP grind (weaken/grow/hack/study/contract/whatever gives hack XP), then re-run.");
    }

    ns.tprint("=======================================");
}

function printHelp(ns) {
    ns.tprint("");
    ns.tprint("bin/tools/xp-to-next-level.js");
    ns.tprint("=======================================");
    ns.tprint("Description:");
    ns.tprint("  Show hacking XP needed to reach a target level, plus an ETA.");
    ns.tprint("");
    ns.tprint("Usage:");
    ns.tprint("  run util/xp-to-next-level.js");
    ns.tprint("  run util/xp-to-next-level.js --delta <levels>");
    ns.tprint("  run util/xp-to-next-level.js --to <level>");
    ns.tprint("");
    ns.tprint("Options:");
    ns.tprint("  --help            Show this help and exit.");
    ns.tprint("  --delta <levels>  Target level = current + delta.");
    ns.tprint("  --to <level>      Target level = absolute level.");
    ns.tprint("  --sample <sec>    If throughput file missing/stale, sample XP/sec locally for this long (default 10).");
    ns.tprint("  --no-file         Ignore data/xp-throughput.txt and always do local sampling.");
    ns.tprint("");
    ns.tprint("Notes:");
    ns.tprint("  - Requires Formulas.exe for exact XP thresholds.");
    ns.tprint("  - Local sampling reads hacking XP from ns.getPlayer().exp.hacking (fallback: hacking_exp).");
    ns.tprint("=======================================");
    ns.tprint("");
}

function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas?.skills &&
            typeof ns.formulas.skills.calculateExp === "function" &&
            typeof ns.formulas.skills.calculateSkill === "function"
        );
    } catch (_e) {
        return false;
    }
}

function getHackLevel(ns, player) {
    try {
        if (typeof ns.getHackingLevel === "function") return ns.getHackingLevel();
    } catch (_e) { /* ignore */ }

    if (typeof player.hacking === "number") return player.hacking;
    if (player.skills && typeof player.skills.hacking === "number") return player.skills.hacking;
    return 0;
}

function getHackXp(player) {
    if (player.exp && typeof player.exp.hacking === "number") return player.exp.hacking;
    if (typeof player.hacking_exp === "number") return player.hacking_exp;
    return 0;
}

function getEffectiveSkillMult(ns, currentXp, currentLevel) {
    try {
        const baseLevel = ns.formulas.skills.calculateSkill(currentXp, 1);
        if (!Number.isFinite(baseLevel) || baseLevel <= 0) return 1;

        const mult = currentLevel / baseLevel;
        if (!Number.isFinite(mult) || mult <= 0) return 1;

        return mult;
    } catch (_e) {
        return 1;
    }
}

/**
 * Read throughput and reject stale samples.
 * "Fresh" means ts is within ~2 windows of now.
 */
function readThroughputFresh(ns, file) {
    try {
        if (!ns.fileExists(file, "home")) return null;
        const text = ns.read(file);
        if (!text) return null;

        const data = JSON.parse(text);
        if (!data || typeof data.xpPerSec !== "number") return null;

        const windowSeconds = Number(data.windowSeconds) || 0;
        const ts = Number(data.ts) || 0;

        if (!Number.isFinite(ts) || ts <= 0) return null;
        if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) return null;

        const ageSec = (Date.now() - ts) / 1000;
        if (ageSec > windowSeconds * 2) return null;

        return { xpPerSec: data.xpPerSec, windowSeconds, ts };
    } catch (_e) {
        return null;
    }
}

/**
 * Measure hacking XP/sec locally by sampling hacking XP over a short window.
 * Uses multiple ticks to average out update cadence.
 */
async function measureXpPerSec(ns, durationSeconds, tickMs) {
    const startT = Date.now();
    const startXp = getHackXp(ns.getPlayer());

    let lastXp = startXp;

    // Take intermediate samples so we can detect resets / backwards movement.
    while (Date.now() - startT < durationSeconds * 1000) {
        await ns.sleep(tickMs);

        const xp = getHackXp(ns.getPlayer());
        if (xp < lastXp) {
            // Reset/aug install/etc during measurement -> treat as unusable.
            return 0;
        }
        lastXp = xp;
    }

    const endT = Date.now();
    const endXp = getHackXp(ns.getPlayer());

    const dt = (endT - startT) / 1000;
    const dx = endXp - startXp;

    if (dt <= 0 || dx <= 0) return 0;
    return dx / dt;
}

function formatXp(ns, xp) {
    if (typeof ns.nFormat === "function") {
        return ns.nFormat(xp, "0,0.00") + ` (${xp.toFixed(2)})`;
    }
    return xp.toFixed(2);
}

function formatDuration(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));

    const days = Math.floor(totalSeconds / 86400);
    totalSeconds -= days * 86400;

    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds -= hours * 3600;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(" ");
}
