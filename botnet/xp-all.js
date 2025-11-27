/** botnet/xp-all.js
 * Hard-switch the entire botnet (home + pservs + NPC) into XP mode.
 *
 * - Kills ALL other scripts on every rooted server (except this script).
 * - Chooses an XP target automatically if not provided (Formulas-aware when available).
 * - Deploys botnet/remote-hgw.js in "xp" mode with as many threads as possible.
 *
 * Usage:
 *   run botnet/xp-all.js             // auto-pick XP target
 *   run botnet/xp-all.js joesguns    // force a specific XP target
 *
 * @param {NS} ns
 */
export async function main(ns) {
    ns.disableLog("ALL");

    const argTarget = ns.args[0];
    const xpTarget = argTarget || chooseXpTarget(ns);

    if (!ns.fileExists("botnet/remote-hgw.js", "home")) {
        ns.tprint("? botnet/remote-hgw.js not found on home. Aborting XP-all.");
        return;
    }

    ns.tprint("===============================================");
    ns.tprint("?? XP-ALL MODE: FULL BOTNET XP GRIND");
    ns.tprint("===============================================");
    ns.tprint(`?? XP target: ${xpTarget}`);

    if (argTarget) {
        ns.tprint("?? Using manually provided XP target.");
    } else if (hasFormulas(ns)) {
        ns.tprint("?? XP target chosen automatically (?? Formulas.exe).");
    } else {
        ns.tprint("?? XP target chosen automatically (vanilla heuristic).");
    }

    const allServers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());
    const myPid = ns.pid;

    // 1) Clean HOME (but keep this script running)
    ns.tprint("?? Cleaning home (killing all other scripts)...");
    for (const p of ns.ps("home")) {
        if (p.pid === myPid) continue;
        ns.kill(p.pid);
    }

    // 2) Deploy XP workers to HOME
    await ns.sleep(200); // let things die
    deployXpWorker(ns, "home", xpTarget, "xp", true);

    // 3) Clean and deploy on all rooted servers (pserv + NPC)
    ns.tprint("?? Cleaning & deploying XP workers to all rooted servers...");
    for (const host of allServers) {
        if (host === "home") continue;
        if (host === "darkweb") continue;
        if (!ns.hasRootAccess(host)) continue;

        // Kill everything on this host
        ns.killall(host);

        // Deploy XP worker
        deployXpWorker(ns, host, xpTarget, "xp", pservs.has(host));
    }

    ns.tprint("? XP-ALL deployment complete. All rooted servers now grinding XP.");
    ns.tprint("   Re-run your normal startup script when you're ready to return to money mode.");
}

/** @param {NS} ns */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking
        );
    } catch (_e) {
        return false;
    }
}

/**
 * Deploy botnet/remote-hgw.js in XP mode on a single host.
 * @param {NS} ns
 * @param {string} host
 * @param {string} target
 * @param {string} mode  "xp" or "money" (we use "xp" here)
 * @param {boolean} isPserv
 */
function deployXpWorker(ns, host, target, mode, isPserv = false) {
    const maxRam = ns.getServerMaxRam(host);
    if (maxRam < 2) {
        ns.print(`?? Skipping ${host}: only ${maxRam}GB RAM`);
        return;
    }

    // Make sure script is present
    if (host !== "home") {
        const ok = ns.scp("botnet/remote-hgw.js", host, "home");
        if (!ok) {
            ns.tprint(`?? Failed to SCP botnet/remote-hgw.js to ${host}`);
            return;
        }
    }

    const scriptRam = ns.getScriptRam("botnet/remote-hgw.js", host);
    if (scriptRam === 0) {
        ns.tprint(`?? botnet/remote-hgw.js has 0 RAM cost on ${host} (missing or miscompiled?).`);
        return;
    }

    // Allow for this controller script on home
    let usableRam = maxRam;
    if (host === "home") {
        const used = ns.getServerUsedRam("home");
        usableRam = maxRam - used;
    }

    const threads = Math.floor(usableRam / scriptRam);
    if (threads < 1) {
        ns.print(`?? ${host}: not enough free RAM for even 1 XP thread.`);
        return;
    }

    const pid = ns.exec("botnet/remote-hgw.js", host, threads, target, mode);
    if (pid === 0) {
        ns.tprint(`? Failed to start botnet/remote-hgw.js on ${host}`);
        return;
    }

    const label =
        host === "home"
            ? "HOME"
            : isPserv
            ? "PSERV"
            : "NPC";

    ns.tprint(
        `?? ${label.padEnd(5)} ${host}: botnet/remote-hgw.js x${threads} ? ` +
        `${target} [${mode.toUpperCase()}]`
    );
}

/**
 * Heuristic + Formulas-aware XP target picker:
 * - Only consider rooted, hackable, non-home, non-darkweb servers with money.
 * - If Formulas.exe is present, prefer highest XP/sec approx: reqHack / weakenTime.
 * - Otherwise, prefer highest required hacking level we can handle.
 * @param {NS} ns
 */
function chooseXpTarget(ns) {
    const playerHack = ns.getHackingLevel();
    const servers = getAllServers(ns);

    let best = "n00dles";
    let bestReqHack = 0;

    const useFormulas = hasFormulas(ns);
    let bestScore = -1;

    const player = useFormulas ? ns.getPlayer() : null;

    for (const host of servers) {
        if (host === "home" || host === "darkweb") continue;
        if (!ns.hasRootAccess(host)) continue;

        const reqHack = ns.getServerRequiredHackingLevel(host);
        const maxMoney = ns.getServerMaxMoney(host);

        if (maxMoney <= 0) continue;
        if (reqHack > playerHack) continue;

        if (useFormulas) {
            let s = ns.getServer(host);
            if (typeof s.minDifficulty === "number") {
                s.hackDifficulty = s.minDifficulty;
            }
            if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
                s.moneyAvailable = s.moneyMax;
            }

            const tWeaken = ns.formulas.hacking.weakenTime(s, player);
            if (tWeaken <= 0) continue;

            // Approximate XP/sec score: higher reqHack and shorter weaken time is better.
            const score = reqHack / tWeaken;

            if (score > bestScore) {
                bestScore = score;
                best = host;
                bestReqHack = reqHack;
            }
        } else {
            // Vanilla heuristic: prefer highest required hacking level we can handle
            if (reqHack > bestReqHack) {
                bestReqHack = reqHack;
                best = host;
            }
        }
    }

    return best;
}

/**
 * Simple BFS over the network.
 * @param {NS} ns
 */
function getAllServers(ns) {
    const visited = new Set();
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) queue.push(neighbor);
        }
    }

    return Array.from(visited);
}