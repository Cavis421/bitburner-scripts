/**
 * /bin/bladeburner-manager.js
 */

const FLAGS = [
    ["help", false],
    ["loop", true],
    ["pollMs", 2500],
    ["autoJoin", true],
    ["minChance", 0.70],            // Threshold to start an action
    ["blackopMinChance", 0.80],
    ["staminaMinFrac", 0.55],
    ["chaosThresh", 50],
    ["preferOps", true],
    ["cityHop", true],
    ["cityHopCooldownMs", 60_000],
    ["spendSkills", true],
    ["lockActions", true],
    ["lockMinFrac", 0.90],          // Don't interrupt if > 90% done
    ["staminaResumeFrac", 0.85],
    ["staminaHardMinFrac", 0.25],
    ["chanceBuffer", 0.10],         // Hysteresis: Stay in action if chance > (minChance - buffer)
    ["autoLevel", true]             // Automatically adjust action levels to match stats
];

const norm = (t) => String(t || "").toLowerCase().replace(/s$/, "").trim();
const isWorkAction = (t) => ["contract", "operation", "blackop", "black op"].includes(norm(t));

export async function main(ns) {
    const flags = ns.flags(FLAGS);
    if (flags.help) { printHelp(ns); return; }

    ns.disableLog("ALL");
    ns.ui.openTail();

    const state = { lastCitySwitchAt: 0, inRecovery: false };

    while (true) {
        ns.clearLog();
        tick(ns, flags, state);
        if (!flags.loop) break;
        await ns.sleep(Math.max(200, Number(flags.pollMs) || 2500));
    }
}

function tick(ns, flags, state) {
    if (flags.spendSkills) spendSkillPoints(ns);

    const curAction = safeObj(() => ns.bladeburner.getCurrentAction(), { type: "Idle", name: "Idle" });
    const curType = curAction?.type ?? "Idle";
    const curName = curAction?.name ?? "Idle";

    // Plural mapping for API calls
    let typeArg = curType;
    if (norm(curType) === "contract") typeArg = "Contracts";
    else if (norm(curType) === "operation") typeArg = "Operations";
    else if (norm(curType) === "black op" || norm(curType) === "blackop") typeArg = "Black Ops";

    // --- 1) AUTO-LEVEL MANAGEMENT (The Thrash Fix) ---
    // If our current action is too hard, immediately level it down so we can finish it.
    if (flags.autoLevel && isWorkAction(curType) && norm(curType) !== "blackop") {
        const ch = chanceInfo(ns, typeArg, curName).cons;
        if (ch < flags.minChance - flags.chanceBuffer) {
            const curLvl = ns.bladeburner.getActionCurrentLevel(typeArg, curName);
            if (curLvl > 1) {
                ns.print(`[Alert] Chance ${(ch * 100).toFixed(1)}% too low for Lvl ${curLvl}. Leveling Down.`);
                ns.bladeburner.setActionLevel(typeArg, curName, curLvl - 1);
                return; // Re-evaluate on next tick
            }
        }
    }

    // --- 2) HARD LOCK (90%+) ---
    const tCur = isWorkAction(curType) ? safeNum(() => ns.bladeburner.getActionTime(typeArg, curName), 0) : 0;
    const tNow = isWorkAction(curType) ? safeNum(() => ns.bladeburner.getActionCurrentTime(), 0) : 0;
    const curFrac = tCur > 0 ? (tNow / tCur) : 0;

    if (isWorkAction(curType) && flags.lockActions && curFrac > Number(flags.lockMinFrac)) {
        ns.print(`[Status] Completing: ${curName} (${(curFrac * 100).toFixed(1)}%)`);
        return true;
    }

    // --- 3) STAMINA RECOVERY ---
    const stamina = safeObj(() => ns.bladeburner.getStamina(), [0, 1]);
    const staFrac = stamina[0] / Math.max(1, stamina[1]);
    if (!state.inRecovery && staFrac < Number(flags.staminaMinFrac)) state.inRecovery = true;
    if (state.inRecovery && staFrac >= Number(flags.staminaResumeFrac)) state.inRecovery = false;

    if (state.inRecovery) {
        const recoveryAction = (staFrac < 0.2) ? "Training" : "Field Analysis";
        ns.print(`[Status] Recovery Mode (${(staFrac * 100).toFixed(1)}%) -> ${recoveryAction}`);
        return ensureAction(ns, "General", recoveryAction, "[bb] Low Stamina", flags);
    }

    // --- 4) CITY & CHAOS ---
    handleCityHopping(ns, flags, state);
    const city = safeStr(() => ns.bladeburner.getCity(), "Sector-12");
    if (safeNum(() => ns.bladeburner.getCityChaos(city), 0) > Number(flags.chaosThresh)) {
        const prefer = pickChaosReduction(ns, Number(flags.minChance));
        return ensureAction(ns, prefer.type, prefer.name, `[bb] Reducing Chaos`, flags);
    }

    // --- 5) ACTION SELECTION ---
    const blackopPick = pickBestBlackOp(ns, Number(flags.blackopMinChance));
    if (blackopPick) return ensureAction(ns, "Black Ops", blackopPick.name, `[bb] BlackOp: ${blackopPick.name}`, flags);

    const bestOp = pickBestAction(ns, "Operations", Number(flags.minChance));
    const bestContract = pickBestAction(ns, "Contracts", Number(flags.minChance));

    let chosen = null;
    if (bestOp && bestContract) {
        chosen = (flags.preferOps || bestOp.score > bestContract.score) ? bestOp : bestContract;
    } else {
        chosen = bestOp || bestContract;
    }

    if (chosen) {
        ns.print(`[Status] Best: ${chosen.name} (${(chosen.chance * 100).toFixed(1)}%)`);
        return ensureAction(ns, chosen.type, chosen.name, `[bb] Working`, flags);
    }

    // --- 6) FALLBACK ---
    ns.print(`[Status] No safe actions > ${(flags.minChance * 100).toFixed(0)}%. Analyzing...`);
    return ensureAction(ns, "General", "Field Analysis", "[bb] Scouting", flags);
}

// --- LOGIC HELPERS ---

function chanceInfo(ns, type, name) {
    const pair = ns.bladeburner.getActionEstimatedSuccessChance(type, name);
    const lo = pair[0], hi = pair[1];
    const uncertainty = hi - lo;
    // Smoother Conservative Chance: Weighted average that respects uncertainty
    // If uncertainty is 0.4 (like yours), we stay very close to the 'lo' value.
    const cons = lo + (uncertainty * 0.1);
    return { cons, uncertainty };
}

function pickBestAction(ns, type, minChance) {
    const names = (type === "Operations") ? ns.bladeburner.getOperationNames() : ns.bladeburner.getContractNames();
    const out = [];
    for (const name of names) {
        if (ns.bladeburner.getActionCountRemaining(type, name) <= 0) continue;
        const ch = chanceInfo(ns, type, name);
        if (ch.cons < minChance) continue;

        const t = Math.max(1, ns.bladeburner.getActionTime(type, name));
        const val = ns.bladeburner.getActionRepGain(type, name);
        const score = (val / t) * Math.pow(ch.cons, 3);
        out.push({ type, name, chance: ch.cons, score });
    }
    return out.sort((a, b) => b.score - a.score)[0] || null;
}

function ensureAction(ns, type, name, msg, flags) {
    const cur = safeObj(() => ns.bladeburner.getCurrentAction(), { type: "Idle", name: "Idle" });
    if (norm(cur.type) === norm(type) && cur.name.toLowerCase() === name.toLowerCase()) return true;
    if (safeBool(() => ns.bladeburner.startAction(type, name), false)) {
        ns.print(msg);
        return true;
    }
    return false;
}

function pickBestBlackOp(ns, minChance) {
    const rawOp = ns.bladeburner.getNextBlackOp();
    if (!rawOp) return null;
    const opName = (typeof rawOp === 'object') ? rawOp.name : rawOp;
    if (!opName || ns.bladeburner.getRank() < ns.bladeburner.getBlackOpRank(opName)) return null;
    const ch = chanceInfo(ns, "Black Ops", opName);
    return (ch.cons >= minChance) ? { name: opName, chance: ch.cons } : null;
}

function pickChaosReduction(ns, minChance) {
    const ch = chanceInfo(ns, "Operations", "Stealth Retirement");
    if (ch.cons >= minChance && ns.bladeburner.getActionCountRemaining("Operations", "Stealth Retirement") > 0) {
        return { type: "Operations", name: "Stealth Retirement" };
    }
    return { type: "General", name: "Diplomacy" };
}

function spendSkillPoints(ns) {
    const sp = ns.bladeburner.getSkillPoints();
    if (sp <= 0) return;
    const plan = ["Blade's Intuition", "Tracer", "Digital Observer", "Reaper", "Cyber's Edge"];
    for (const sk of plan) {
        const cost = ns.bladeburner.getSkillUpgradeCost(sk);
        if (cost <= ns.bladeburner.getSkillPoints()) ns.bladeburner.upgradeSkill(sk, 1);
    }
}

function handleCityHopping(ns, flags, state) {
    if (!flags.cityHop) return;
    const now = Date.now();
    if (now - state.lastCitySwitchAt < flags.cityHopCooldownMs) return;
    const cities = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];
    let bestCity = ns.bladeburner.getCity(), bestScore = -1;
    for (const c of cities) {
        const pop = ns.bladeburner.getCityCommunities(c);
        const chaos = ns.bladeburner.getCityChaos(c);
        const score = pop * (1 - (chaos * 0.02));
        if (score > bestScore) { bestScore = score; bestCity = c; }
    }
    if (bestCity !== ns.bladeburner.getCity()) {
        ns.bladeburner.switchCity(bestCity);
        state.lastCitySwitchAt = now;
    }
}

function safeNum(fn, fallback) { try { return Number(fn()) || fallback; } catch { return fallback; } }
function safeBool(fn, fallback) { try { return Boolean(fn()); } catch { return fallback; } }
function safeStr(fn, fallback) { try { return String(fn()); } catch { return fallback; } }
function safeObj(fn, fallback) { try { const r = fn(); return r !== undefined && r !== null ? r : fallback; } catch { return fallback; } }

function printHelp(ns) {
    ns.tprint("Bladeburner Manager - Level Management Edition");
}
