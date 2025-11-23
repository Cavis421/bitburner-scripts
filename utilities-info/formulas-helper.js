// formulas-helper.js (or at top of your script)
/** @param {NS} ns */
export function hasFormulas(ns) {
    // Safe: ns.formulas is only usable when Formulas.exe exists
    return ns.fileExists("Formulas.exe", "home");
}

/** @param {NS} ns */
export function getHackTimes(ns, target) {
    if (hasFormulas(ns)) {
        const player = ns.getPlayer();
        const server = ns.getServer(target);
        return {
            hack:   ns.formulas.hacking.hackTime(server, player),
            grow:   ns.formulas.hacking.growTime(server, player),
            weaken: ns.formulas.hacking.weakenTime(server, player),
        };
    } else {
        return {
            hack:   ns.getHackTime(target),
            grow:   ns.getGrowTime(target),
            weaken: ns.getWeakenTime(target),
        };
    }
}

/** @param {NS} ns */
export function getHackStats(ns, target) {
    if (hasFormulas(ns)) {
        const player = ns.getPlayer();
        const server = ns.getServer(target);
        return {
            chance:  ns.formulas.hacking.hackChance(server, player),
            percent: ns.formulas.hacking.hackPercent(server, player),
            exp:     ns.formulas.hacking.hackExp(server, player),
        };
    } else {
        return {
            chance:  ns.hackAnalyzeChance(target),
            percent: ns.hackAnalyze(target),
            // exp isn’t exposed without formulas; just return null
            exp:     null,
        };
    }
}
