/**
 * /bin/bladeburner-manager.js
 *
 * Description
 *  BN6 Bladeburner automation daemon:
 *   - (Optional) auto-join Bladeburner division when eligible
 *   - spends skill points by priority
 *   - manages stamina (train/field analysis when low)
 *   - manages chaos (diplomacy when high)
 *   - selects best contract/operation by success chance + expected value
 *   - attempts BlackOps when rank/chance thresholds are met
 *
 * Notes
 *  - Requires Bladeburner API (BN6 or SF7+).
 *  - Safe to run even before joining: it can idle/exit cleanly.
 *  - Uses conservative success thresholds by default to avoid fail spirals.
 *
 * Syntax
 *  run /bin/bladeburner-manager.js
 *  run /bin/bladeburner-manager.js --minChance 0.7 --blackopMinChance 0.8
 *  run /bin/bladeburner-manager.js --city "Sector-12"
 *  run /bin/bladeburner-manager.js --help
 */

/** @param {NS} ns */
const FLAGS = [
    ["help", false],

    // Looping
    ["loop", true],
    ["pollMs", 2500],

    // Join behavior
    ["autoJoin", true],

    // Action safety
    ["minChance", 0.70],           // min success chance for contracts/ops
    ["blackopMinChance", 0.80],    // min chance for blackops
    ["staminaMinFrac", 0.55],      // if stamina/max below this, recover
    ["chaosThresh", 50],           // if city chaos above this, run diplomacy
    ["preferOps", true],           // prefer operations over contracts when both are good

    // City control (optional)
    ["city", ""],                  // if set, will try to stay here

    // Skill upgrades
    ["spendSkills", true],
];

export async function main(ns) {
    const flags = ns.flags(FLAGS);
    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    if (!hasBladeburner(ns)) {
        ns.tprint("ERROR: Bladeburner API not available (need BN6 or SF7+).");
        return;
    }

    // Main daemon loop
    while (true) {
        const did = tick(ns, flags);

        if (!flags.loop) break;
        await ns.sleep(Math.max(200, Number(flags.pollMs) || 2500));

        // If we *can't* do anything (not joined + can't join), don't spam.
        // (tick() already prints minimal info; keep this silent.)
        void did;
    }
}

function tick(ns, flags) {
    // 1) Ensure we're in Bladeburners (optional)
    const inBB = safeBool(() => ns.bladeburner.inBladeburner(), false);

    if (!inBB) {
        if (flags.autoJoin) {
            const joined = safeBool(() => ns.bladeburner.joinBladeburnerDivision(), false);
            if (joined) ns.print("[bb] Joined Bladeburner division.");
        }

        const nowIn = safeBool(() => ns.bladeburner.inBladeburner(), false);
        if (!nowIn) {
            ns.print("[bb] Not in Bladeburners yet (idle).");
            return false;
        }
    }

    // 2) City preference
    const desiredCity = String(flags.city || "").trim();
    if (desiredCity) {
        const cur = safeStr(() => ns.bladeburner.getCity(), "");
        if (cur && cur !== desiredCity) {
            safeBool(() => ns.bladeburner.switchCity(desiredCity), false);
        }
    }

    // 3) Spend skill points
    if (flags.spendSkills) spendSkillPoints(ns);

    // 4) Stamina management
    const stamina = safeObj(() => ns.bladeburner.getStamina(), [0, 0]);
    const curSta = Number(stamina?.[0] ?? 0);
    const maxSta = Math.max(1, Number(stamina?.[1] ?? 1));
    const staFrac = curSta / maxSta;

    if (staFrac < Number(flags.staminaMinFrac)) {
        return ensureAction(ns, "General", pickRecoveryGeneral(ns), "[bb] recovering stamina");
    }

    // 5) Chaos management (in current city)
    const city = safeStr(() => ns.bladeburner.getCity(), "Sector-12");
    const chaos = safeNum(() => ns.bladeburner.getCityChaos(city), 0);
    if (chaos > Number(flags.chaosThresh)) {
        // Diplomacy is the standard “reduce chaos” lever.
        return ensureAction(ns, "General", "Diplomacy", `[bb] chaos ${chaos.toFixed(1)} in ${city} -> Diplomacy`);
    }

    // 6) BlackOps (when available and safe)
    const blackopPick = pickBestBlackOp(ns, Number(flags.blackopMinChance));
    if (blackopPick) {
        return ensureAction(ns, "BlackOp", blackopPick.name, `[bb] BLACKOP ${blackopPick.name} (chance ${(blackopPick.chance * 100).toFixed(1)}%)`);
    }

    // 7) Normal money/rank actions: operations/contracts
    const bestOp = pickBestAction(ns, "Operation", Number(flags.minChance));
    const bestContract = pickBestAction(ns, "Contract", Number(flags.minChance));

    const preferOps = !!flags.preferOps;

    const chosen =
        pickByValue(bestOp, bestContract, { preferOps });

    if (chosen) {
        return ensureAction(ns, chosen.type, chosen.name, `[bb] ${chosen.type} ${chosen.name} (chance ${(chosen.chance * 100).toFixed(1)}%)`);
    }

    // 8) Fallback: Field Analysis (improves estimates and is always safe)
    return ensureAction(ns, "General", "Field Analysis", "[bb] fallback -> Field Analysis");
}

// -----------------------------------------------------------------------------
// Action picking
// -----------------------------------------------------------------------------

function pickRecoveryGeneral(ns) {
    // Training improves stats; Field Analysis improves chance estimates.
    // When stamina is low, both are fine — training is a better “BN6 ramp”.
    const hasTraining = includesSafe(() => ns.bladeburner.getGeneralActionNames(), "Training");
    if (hasTraining) return "Training";
    return "Field Analysis";
}

function pickBestBlackOp(ns, minChance) {
    const names = safeArr(() => ns.bladeburner.getBlackOpNames(), []);
    if (!names.length) return null;

    // Only attempt blackops that are “available” (remaining count > 0).
    const candidates = [];
    for (const name of names) {
        const remaining = safeNum(() => ns.bladeburner.getActionCountRemaining("BlackOp", name), 0);
        if (remaining <= 0) continue;

        const chance = estimateChance(ns, "BlackOp", name);
        if (chance < minChance) continue;

        // Some versions expose rank requirement; if not, just rely on chance + remaining.
        const rank = safeNum(() => ns.bladeburner.getRank(), 0);
        const req = safeNum(() => ns.bladeburner.getBlackOpRank(name), 0);
        if (req > 0 && rank < req) continue;

        candidates.push({ name, chance, remaining, req });
    }

    // Prefer the *highest* rank requirement you can do (progression).
    candidates.sort((a, b) => (b.req - a.req) || (b.chance - a.chance) || a.name.localeCompare(b.name));
    return candidates[0] || null;
}

function pickBestAction(ns, type, minChance) {
    const names =
        type === "Operation"
            ? safeArr(() => ns.bladeburner.getOperationNames(), [])
            : safeArr(() => ns.bladeburner.getContractNames(), []);

    const out = [];
    for (const name of names) {
        const remaining = safeNum(() => ns.bladeburner.getActionCountRemaining(type, name), 0);
        if (remaining <= 0) continue;

        const chance = estimateChance(ns, type, name);
        if (chance < minChance) continue;

        // Use a simple “expected success” score. Without deep formulas,
        // (chance * remaining) is a decent proxy to avoid running out of tasks.
        const score = chance * Math.min(1000, remaining);

        out.push({ type, name, chance, remaining, score });
    }

    out.sort((a, b) => (b.score - a.score) || (b.chance - a.chance) || a.name.localeCompare(b.name));
    return out[0] || null;
}

function pickByValue(bestOp, bestContract, opts) {
    if (!bestOp && !bestContract) return null;
    if (bestOp && !bestContract) return bestOp;
    if (!bestOp && bestContract) return bestContract;

    // Both exist. Respect preference unless the other is *meaningfully* better.
    const preferOps = !!opts.preferOps;
    const a = preferOps ? bestOp : bestContract;
    const b = preferOps ? bestContract : bestOp;

    // If b’s score is at least 15% better, take b.
    if ((b.score || 0) > (a.score || 0) * 1.15) return b;
    return a;
}

function ensureAction(ns, type, name, reason) {
    const cur = safeObj(() => ns.bladeburner.getCurrentAction(), null);
    const curType = String(cur?.type ?? "");
    const curName = String(cur?.name ?? "");

    if (curType === type && curName === name) return true;

    const ok = safeBool(() => ns.bladeburner.startAction(type, name), false);
    if (ok) ns.print(reason);
    else ns.print(`[bb] failed to start ${type}:${name}`);
    return ok;
}

function estimateChance(ns, type, name) {
    const pair = safeArr(() => ns.bladeburner.getActionEstimatedSuccessChance(type, name), [0, 0]);
    const lo = Number(pair?.[0] ?? 0);
    const hi = Number(pair?.[1] ?? 0);
    // Conservative: use low bound (avoids surprise fails early in BN6)
    return clamp01(lo || 0);
}

// -----------------------------------------------------------------------------
// Skill spending
// -----------------------------------------------------------------------------

function spendSkillPoints(ns) {
    const points = safeNum(() => ns.bladeburner.getSkillPoints(), 0);
    if (points <= 0) return;

    const skills = safeArr(() => ns.bladeburner.getSkillNames(), []);

    // Priority: survivability + success + stamina economy.
    // We only upgrade skills that exist in this version/save.
    const priority = [
        "Overclock",
        "Reaper",
        "Evasive System",
        "Evasive Systems",
        "Cloak",
        "Digital Observer",
        "Blade's Intuition",
        "Hyperdrive",
        "Hands of Midas",
    ].filter((s) => skills.includes(s));

    for (let i = 0; i < 50; i++) {
        const p = safeNum(() => ns.bladeburner.getSkillPoints(), 0);
        if (p <= 0) return;

        let upgraded = false;

        for (const sk of priority) {
            const cost = safeNum(() => ns.bladeburner.getSkillUpgradeCost(sk), Infinity);
            if (cost <= p) {
                const ok = safeBool(() => ns.bladeburner.upgradeSkill(sk, 1), false);
                if (ok) {
                    ns.print(`[bb] skill+ ${sk}`);
                    upgraded = true;
                    break;
                }
            }
        }

        if (!upgraded) return;
    }
}

// -----------------------------------------------------------------------------
// Small safe helpers
// -----------------------------------------------------------------------------

function hasBladeburner(ns) {
    return !!ns.bladeburner
        && typeof ns.bladeburner.inBladeburner === "function"
        && typeof ns.bladeburner.startAction === "function";
}

function clamp01(x) {
    x = Number(x) || 0;
    return Math.min(1, Math.max(0, x));
}

function safeNum(fn, fallback) {
    try {
        const v = Number(fn());
        return Number.isFinite(v) ? v : fallback;
    } catch {
        return fallback;
    }
}

function safeBool(fn, fallback) {
    try { return Boolean(fn()); } catch { return fallback; }
}

function safeStr(fn, fallback) {
    try { return String(fn()); } catch { return fallback; }
}

function safeArr(fn, fallback) {
    try {
        const v = fn();
        return Array.isArray(v) ? v : fallback;
    } catch {
        return fallback;
    }
}

function safeObj(fn, fallback) {
    try { return fn(); } catch { return fallback; }
}

function includesSafe(fn, item) {
    try {
        const a = fn();
        return Array.isArray(a) && a.includes(item);
    } catch {
        return false;
    }
}

/** @param {NS} ns */
function printHelp(ns) {
    ns.tprint("/bin/bladeburner-manager.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  BN6 Bladeburner automation daemon (join/skills/city/actions/blackops).");
    ns.tprint("");
    ns.tprint("Notes");
    ns.tprint("  - Requires Bladeburner API (BN6 or SF7+).");
    ns.tprint("  - Conservative defaults: uses LOW success chance estimate to avoid fail spirals.");
    ns.tprint("  - Chaos is controlled via Diplomacy; stamina via Training/Field Analysis.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run /bin/bladeburner-manager.js");
    ns.tprint("  run /bin/bladeburner-manager.js --minChance 0.75 --blackopMinChance 0.85");
    ns.tprint("  run /bin/bladeburner-manager.js --city \"Sector-12\" --chaosThresh 40");
    ns.tprint("  run /bin/bladeburner-manager.js --autoJoin false");
    ns.tprint("  run /bin/bladeburner-manager.js --help");
    ns.tprint("");
    ns.tprint("Flags");
    ns.tprint("  --loop true|false             Loop forever (default true)");
    ns.tprint("  --pollMs <ms>                 Poll interval (default 2500)");
    ns.tprint("  --autoJoin true|false         Attempt to join BB when eligible (default true)");
    ns.tprint("  --minChance <0..1>            Min chance for contracts/ops (default 0.70)");
    ns.tprint("  --blackopMinChance <0..1>     Min chance for blackops (default 0.80)");
    ns.tprint("  --staminaMinFrac <0..1>       Recover below this stamina fraction (default 0.55)");
    ns.tprint("  --chaosThresh <n>             Diplomacy above this chaos (default 50)");
    ns.tprint("  --preferOps true|false        Prefer operations over contracts (default true)");
    ns.tprint("  --city <name>                 Optional city lock (default none)");
    ns.tprint("  --spendSkills true|false      Auto-upgrade skills (default true)");
}
