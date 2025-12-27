/**
 * lib/infiltration.js
 *
 * Helper utilities for scoring infiltrations.
 *
 * Notes:
 * - This is a helper module (imported by bin scripts).
 * - Does not automate infiltrations; only ranks / formats / estimates.
 */

/**
 * @typedef {Object} InfiltrationRow
 * @property {any} locObj               Raw location object from ns.infiltration.getPossibleLocations()
 * @property {string} city
 * @property {string} location
 * @property {number} difficulty
 * @property {number} levels           (aka "max clearance level" / number of stages)
 * @property {number} rewardMoney
 * @property {number} timeSeconds
 */

/** Clamp helper */
export function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}

/**
 * Normalize the (sadly) slightly-shifty shapes that Bitburner uses for infiltration objects across versions.
 * @param {any} loc
 */
export function normalizeLocation(loc) {
    const city = (loc?.city ?? loc?.[0] ?? "").toString();
    const location = (loc?.name ?? loc?.location ?? loc?.[1] ?? "").toString();
    return { city, location };
}

/**
 * Extract core fields from ns.infiltration.getInfiltration(loc) across common versions.
 * @param {any} info
 */
export function extractInfiltrationInfo(info) {
    const difficulty = Number(info?.difficulty ?? info?.difficultyRating ?? 0);

    const levels = Number(
        info?.maxClearanceLevel ??
        info?.maxLevel ??
        info?.levels ??
        info?.clearanceLevels ??
        0
    );

        const rewardMoney = Number(
            info?.reward?.sellCash ??
            info?.reward?.money ??
            info?.moneyReward ??
            info?.maxMoney ??
            info?.rewardMoney ??
            0
        );


    const timeSeconds = Number(
        info?.time ??
        info?.timeSeconds ??
        info?.estimatedTime ??
        info?.expectedTime ??
        0
    );

    return {
        difficulty,
        levels,
        rewardMoney,
        timeSeconds,
    };
}

/**
 * Build infiltration rows from Netscript API.
 * @param {NS} ns
 * @returns {InfiltrationRow[]}
 */
export function getInfiltrationRows(ns, debug = false) {
    const rows = [];
    const locs = ns.infiltration.getPossibleLocations();

    if (debug) {
        ns.tprint(`[debug] getPossibleLocations() returned ${locs.length}`);
        if (locs.length > 0) ns.tprint(`[debug] sample loc: ${JSON.stringify(locs[0])}`);
    }

    for (const loc of locs) {
        const { city, location } = normalizeLocation(loc);

        const locationName =
            (typeof loc === "string") ? loc :
            (typeof loc?.name === "string") ? loc.name :
            (typeof loc?.location === "string") ? loc.location :
            (typeof location === "string" && location.length > 0) ? location :
            "";

        if (!locationName) {
            if (debug) ns.tprint(`[debug] SKIP: could not derive locationName from ${JSON.stringify(loc)}`);
            continue;
        }

        const info = ns.infiltration.getInfiltration(locationName);
        if (debug) ns.tprint(`[debug] info for "${locationName}": ${JSON.stringify(info)}`);

        const extracted = extractInfiltrationInfo(info);

        // If the API doesn't provide time in your version, don't discard the row.
        // We'll fallback to a heuristic estimate.
        let timeSeconds = extracted.timeSeconds;
        if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) {
            // heuristic fallback: 90 seconds base + 15 seconds per level + difficulty factor
            const levels = extracted.levels > 0 ? extracted.levels : 10;
            timeSeconds = 90 + (levels * 15) + (extracted.difficulty * 2);
            if (debug) ns.tprint(`[debug] timeSeconds missing -> fallback ${timeSeconds.toFixed(0)}s`);
        }

        rows.push({
            locObj: loc,
            city,
            location,
            difficulty: extracted.difficulty,
            levels: extracted.levels > 0 ? extracted.levels : 10,
            rewardMoney: extracted.rewardMoney,
            timeSeconds,
        });
    }

    return rows;
}


/**
 * Estimate probability of a *full successful infiltration run* (i.e. completing all levels).
 *
 * Model:
 * - We estimate a per-level success chance using your player stats vs difficulty
 * - Then raise to the number of levels: pRun = pLevel ^ levels
 *
 * This is a heuristic; it won’t match the internal engine perfectly, but it’s consistent
 * and “feels right” as a ranking metric.
 *
 * @param {NS} ns
 * @param {InfiltrationRow} row
 * @param {{
 *   minLevelP?: number,
 *   maxLevelP?: number,
 *   difficultyScale?: number,
 *   levelExponentScale?: number,
 *   overrideSuccess?: number|null
 * }} [opts]
 */
export function estimateInfiltrationSuccess(ns, row, opts = {}) {
    const minLevelP = opts.minLevelP ?? 0.70;          // per-level floor (so we don’t go to 0)
    const maxLevelP = opts.maxLevelP ?? 0.999;         // per-level ceiling
    const difficultyScale = opts.difficultyScale ?? 55; // bigger => difficulty matters less
    const levelExponentScale = opts.levelExponentScale ?? 1.0;

    if (opts.overrideSuccess != null && Number.isFinite(opts.overrideSuccess)) {
        return clamp(Number(opts.overrideSuccess), 0, 1);
    }

    const p = ns.getPlayer();

    // Infiltration difficulty is affected by combat stats and charisma (per docs).
    const combatChaAvg = (
        (p.strength ?? 1) +
        (p.defense ?? 1) +
        (p.dexterity ?? 1) +
        (p.agility ?? 1) +
        (p.charisma ?? 1)
    ) / 5;

    // Convert stats + difficulty into a per-level chance.
    // This is a smooth curve: higher stats help, higher difficulty hurts.
    const d = Math.max(0, row.difficulty);
    const statTerm = Math.max(1, combatChaAvg);
    const diffTerm = d * difficultyScale;

    //  statTerm / (statTerm + diffTerm) gives (0..1)
    let pLevel = statTerm / (statTerm + diffTerm);

    // Nudge into a more usable range with clamps
    pLevel = clamp(pLevel, minLevelP, maxLevelP);

    // Full run success probability
    const levels = Math.max(1, Math.floor(row.levels));
    const exponent = levels * levelExponentScale;

    return clamp(Math.pow(pLevel, exponent), 0, 1);
}

/**
 * Expected money per hour with success weighting.
 * @param {InfiltrationRow} row
 * @param {number} successProb (0..1)
 */
export function expectedMoneyPerHour(row, successProb) {
    const p = clamp(successProb, 0, 1);
    const expectedMoney = row.rewardMoney * p;
    return (expectedMoney / row.timeSeconds) * 3600;
}

// Formatting helpers
export function formatMoney(v) {
    const abs = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}t`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}b`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}m`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}k`;
    return `${sign}$${abs.toFixed(0)}`;
}

export function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m >= 60) {
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return `${h}h${String(mm).padStart(2, "0")}m`;
    }
    return `${m}m${String(s).padStart(2, "0")}s`;
}

export function trunc(s, n) {
    s = String(s);
    if (s.length <= n) return s;
    return s.slice(0, Math.max(0, n - 1)) + "…";
}

export function pad(s, n) {
    s = String(s);
    if (s.length >= n) return s;
    return s + " ".repeat(n - s.length);
}
