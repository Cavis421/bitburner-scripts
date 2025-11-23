/** xp-to-next-level.js
 * Show XP needed to reach a target hacking level, plus ETA based on XP throughput.
 *
 * Uses:
 *   - Formulas.exe (ns.formulas.skills.calculateExp) for exact XP thresholds.
 *   - xp-throughput.txt (written by xp-throughput-monitor.js) for XP/sec estimate.
 *
 * Usage:
 *   run xp-to-next-level.js                 // XP to next level (current + 1)
 *   run xp-to-next-level.js --delta 10      // XP to +10 levels above current
 *   run xp-to-next-level.js --to 2500       // XP to absolute level 2500
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
        ["to", 0],      // absolute target level
        ["delta", 0],   // levels above current
    ]);

    const METRIC_FILE = "xp-throughput.txt";

    const player = ns.getPlayer();
    const currentLevel = getHackLevel(player);
    const currentXp    = player.exp?.hacking ?? player.hacking_exp ?? 0;

    let targetLevel;

    const to    = Number(flags.to) || 0;
    const delta = Number(flags.delta) || 0;

    if (to > 0 && delta > 0) {
        ns.tprint("⚠️ Both --to and --delta provided; preferring --to.");
    }

    if (to > 0) {
        targetLevel = to;
    } else if (delta > 0) {
        targetLevel = currentLevel + delta;
    } else {
        targetLevel = currentLevel + 1; // default: next level only
    }

    if (!Number.isFinite(targetLevel) || targetLevel <= currentLevel) {
        ns.tprint("❌ Target level must be greater than your current level.");
        ns.tprint(`   Current: ${currentLevel}, Requested: ${targetLevel}`);
        return;
    }

    if (!hasFormulas(ns)) {
        ns.tprint("❌ Formulas.exe not found or ns.formulas.skills unavailable.");
        ns.tprint("   This script needs Formulas.exe to compute exact XP thresholds.");
        ns.tprint("   Buy Formulas.exe from the Dark Web to enable xp-to-next-level.js.");
        return;
    }

    const hackingMult = getHackingSkillMult(player);

    // Exact XP requirement using Formulas API
    const targetXp = ns.formulas.skills.calculateExp(targetLevel, hackingMult);
    const xpNeededRaw = targetXp - currentXp;
    const xpNeeded = Math.max(0, xpNeededRaw);

    ns.tprint("=======================================");
    ns.tprint("        🧠 XP To Target Level");
    ns.tprint("=======================================");
    ns.tprint(`📊 Current hacking level: ${currentLevel}`);
    ns.tprint(`🎯 Target hacking level:  ${targetLevel}`);
    ns.tprint("---------------------------------------");
    ns.tprint(`📈 Current XP:           ${formatXp(ns, currentXp)}`);
    ns.tprint(`🎯 XP at target level:   ${formatXp(ns, targetXp)}`);
    ns.tprint(`💡 XP needed:            ${formatXp(ns, xpNeeded)} XP`);

    // Try to read XP/sec from xp-throughput.txt for ETA
    const throughput = readThroughput(ns, METRIC_FILE);

    if (throughput && throughput.xpPerSec > 0) {
        const seconds = xpNeeded / throughput.xpPerSec;
        const eta = formatDuration(seconds);

        ns.tprint("---------------------------------------");
        ns.tprint("⏱  ETA based on recent XP throughput");
        ns.tprint(`📊 XP/sec (avg last ${throughput.windowSeconds.toFixed(0)}s): `
            + `${throughput.xpPerSec.toFixed(2)} XP/s`);
        ns.tprint(`⏳ Estimated time to target: ${eta}`);
    } else {
        ns.tprint("---------------------------------------");
        ns.tprint("ℹ️ No recent XP throughput sample found.");
        ns.tprint("   Run xp-throughput-monitor.js alongside your XP grinding");
        ns.tprint("   to get an estimated time-to-level here.");
    }

    ns.tprint("=======================================");
}

/**
 * Safely detect if Formulas.exe + skills formulas are available.
 * @param {NS} ns
 */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.skills &&
            typeof ns.formulas.skills.calculateExp === "function"
        );
    } catch (_e) {
        return false;
    }
}

/**
 * Get the player's hacking level in a forwards-compatible way.
 */
function getHackLevel(player) {
    if (typeof player.hacking === "number") return player.hacking;
    if (player.skills && typeof player.skills.hacking === "number") {
        return player.skills.hacking;
    }
    return 0;
}

/**
 * Get the hacking skill multiplier for formulas.skills.
 * Falls back to 1 if not present.
 */
function getHackingSkillMult(player) {
    // In current Bitburner, this is player.hacking_mult
    if (typeof player.hacking_mult === "number") return player.hacking_mult;

    // Fallback: if multipliers nested under player.mults, use that
    if (player.mults && typeof player.mults.hacking === "number") {
        return player.mults.hacking;
    }

    return 1;
}

/**
 * Read XP throughput from the metric file written by xp-throughput-monitor.js.
 * Returns null if missing or malformed.
 *
 * @param {NS} ns
 * @param {string} file
 */
function readThroughput(ns, file) {
    try {
        if (!ns.fileExists(file, "home")) return null;
        const text = ns.read(file);
        if (!text) return null;

        const data = JSON.parse(text);
        if (!data || typeof data.xpPerSec !== "number") return null;

        return {
            xpPerSec: data.xpPerSec,
            windowSeconds: Number(data.windowSeconds) || 0,
            ts: Number(data.ts) || 0,
        };
    } catch (_e) {
        return null;
    }
}

/**
 * Format XP with both raw and compact views when nFormat is available.
 */
function formatXp(ns, xp) {
    if (typeof ns.nFormat === "function") {
        return ns.nFormat(xp, "0,0.00") + ` (${xp.toFixed(2)})`;
    }
    return xp.toFixed(2);
}

/**
 * Format a duration in seconds into a human-readable string.
 * e.g. "3m 20s", "1h 5m", "2d 4h".
 */
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
