/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const currentLevel = ns.getHackingLevel();
    const currentXp    = ns.getPlayer().exp.hacking;

    // Optional arg: target hacking level
    // - If omitted or invalid: default to next level
    // - If <= current level: we still show XP delta (likely <= 0)
    const argLevel = ns.args.length > 0 ? Number(ns.args[0]) : NaN;
    const targetLevel = Number.isFinite(argLevel) && argLevel > 0
        ? Math.floor(argLevel)
        : currentLevel + 1;

    const targetXp = calculateHackingExp(targetLevel);
    const needed   = targetXp - currentXp;

    ns.tprint("==================================");
    ns.tprint(`📈 Current hacking level: ${currentLevel}`);
    ns.tprint(`🔢 Current XP: ${Math.floor(currentXp).toLocaleString()}`);
    ns.tprint(`🎯 Target level: ${targetLevel}`);
    ns.tprint(`🎯 Target XP:   ${Math.ceil(targetXp).toLocaleString()}`);

    if (needed <= 0) {
        ns.tprint(`✅ You already have enough XP for level ${targetLevel}.`);
        ns.tprint("==================================");
        return;
    }

    ns.tprint(`📊 XP needed to reach level ${targetLevel}: ${Math.ceil(needed).toLocaleString()} XP`);

    // Try to estimate ETA using xp-throughput-monitor.js output
    const eta = estimateEtaFromThroughput(ns, needed);

    if (eta) {
        const { xpPerSec, seconds } = eta;
        const pretty = formatDuration(seconds);

        ns.tprint("----------------------------------");
        ns.tprint(
            `⌛ Estimated time at ~${xpPerSec.toFixed(2)} XP/s: ` +
            `${pretty}`
        );
        ns.tprint("   (based on latest xp-throughput-monitor.js sample)");
    } else {
        ns.tprint("----------------------------------");
        ns.tprint("ℹ️ No valid XP/sec data found.");
        ns.tprint("   Run `xp-throughput-monitor.js` and let it collect a sample first.");
    }

    ns.tprint("==================================");
}

/**
 * Estimate ETA using the file written by xp-throughput-monitor.js.
 * Returns { xpPerSec, seconds } or null if no valid data.
 */
function estimateEtaFromThroughput(ns, neededXp) {
    const FILE = "xp-throughput.txt";
    const raw  = ns.read(FILE);

    if (!raw) return null;

    let xpPerSec = null;

    try {
        const parsed = JSON.parse(raw);
        xpPerSec = Number(parsed.xpPerSec);
    } catch (_e) {
        // Fallback: maybe the file just contains a bare number
        const num = Number(raw);
        if (Number.isFinite(num) && num > 0) {
            xpPerSec = num;
        }
    }

    if (!Number.isFinite(xpPerSec) || xpPerSec <= 0) return null;

    const seconds = neededXp / xpPerSec;
    if (!Number.isFinite(seconds) || seconds <= 0) return null;

    return { xpPerSec, seconds };
}

/**
 * Same formula as before: XP required for a given hacking level.
 */
function calculateHackingExp(level) {
    return Math.exp((level + 200) / 32) - 534.5;
}

/**
 * Turn a duration in seconds into something readable like:
 *  "3m 12s", "1h 5m", "2d 3h 10m"
 */
function formatDuration(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
        return "0s";
    }

    let seconds = Math.floor(totalSeconds);

    const days = Math.floor(seconds / 86400);
    seconds -= days * 86400;

    const hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;

    const minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;

    const parts = [];

    if (days > 0) parts.push(`${days}d`);
    if (days > 0 || hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);

    // Only show seconds if we’re under ~1 day; keep it simple for long ETAs
    if (days === 0) {
        parts.push(`${seconds}s`);
    }

    return parts.join(" ");
}
