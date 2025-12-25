/** @param {NS} ns */
/*
 * lib/rooting.js
 *
 * Shared rooting helpers:
 *  - Network scan
 *  - Detect available port crackers
 *  - Root all servers that are rootable right now
 *  - Wait until “root coverage” is complete (prevents botnet/batcher racing rooting)
 */

// ------------------------------------------------
// Network helpers
// ------------------------------------------------

export function getAllServers(ns) {
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

export function countPortCrackers(ns) {
  const programs = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
  ];
  return programs.filter(p => ns.fileExists(p, "home")).length;
}

// ------------------------------------------------
// Rooting helpers (prevents botnet/root timing race)
// ------------------------------------------------

export function getCrackerFns(ns) {
  const fns = [];
  if (ns.fileExists("BruteSSH.exe", "home")) fns.push((h) => ns.brutessh(h));
  if (ns.fileExists("FTPCrack.exe", "home")) fns.push((h) => ns.ftpcrack(h));
  if (ns.fileExists("relaySMTP.exe", "home")) fns.push((h) => ns.relaysmtp(h));
  if (ns.fileExists("HTTPWorm.exe", "home")) fns.push((h) => ns.httpworm(h));
  if (ns.fileExists("SQLInject.exe", "home")) fns.push((h) => ns.sqlinject(h));
  return fns;
}

/**
 * Returns true if host is rootable *right now* (by your level + crackers).
 */
export function isRootableNow(ns, host, crackerCount) {
  const s = ns.getServer(host);
  if (s.hasAdminRights) return false;
  if (host === "home" || host === "darkweb") return false;
  if (s.purchasedByPlayer) return false;

  const reqHack = s.requiredHackingSkill;
  const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

  return reqHack <= ns.getHackingLevel() && reqPorts <= crackerCount;
}

/**
 * Attempt to root all servers that are rootable now.
 * Returns { rooted, attempted } counts.
 */
export function rootAllPossible(ns) {
  const servers = getAllServers(ns);
  const crackerFns = getCrackerFns(ns);
  const crackerCount = crackerFns.length;

  let attempted = 0;
  let rooted = 0;

  for (const host of servers) {
    if (!isRootableNow(ns, host, crackerCount)) continue;

    attempted++;
    try {
      for (const fn of crackerFns) {
        try { fn(host); } catch (_e) { /* ignore */ }
      }

      try { ns.nuke(host); } catch (_e) { /* ignore */ }

      if (ns.hasRootAccess(host)) rooted++;
    } catch (_e) {
      // Keep going
    }
  }

  return { rooted, attempted };
}

/**
 * Wait until all currently-rootable servers are rooted (or timeout).
 * This is the key fix: prevents botnet/batcher from racing rooting.
 */
export async function waitForRootCoverage(ns, opts = {}) {
  const timeoutMs = Math.max(1_000, Number(opts.timeoutMs ?? 30_000));
  const pollMs = Math.max(100, Number(opts.pollMs ?? 500));

  const start = Date.now();
  while (true) {
    const servers = getAllServers(ns);
    const crackerCount = countPortCrackers(ns);
    const hackingLevel = ns.getHackingLevel();

    let rootableNow = 0;
    let rootedNow = 0;

    for (const host of servers) {
      const s = ns.getServer(host);
      if (host === "home" || host === "darkweb") continue;
      if (s.purchasedByPlayer) continue;

      const reqHack = s.requiredHackingSkill;
      const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

      if (reqHack <= hackingLevel && reqPorts <= crackerCount) {
        rootableNow++;
        if (s.hasAdminRights) rootedNow++;
      }
    }

    if (rootedNow >= rootableNow) return true;
    if (Date.now() - start > timeoutMs) return false;

    await ns.sleep(pollMs);
  }
}
