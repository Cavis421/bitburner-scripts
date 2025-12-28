/** @param {NS} ns */
/*
 * lib/orchestrator.js
 *
 * Shared process + RAM orchestration helpers.
 *
 * Goals:
 *  - Standardize “is script running?”
 *  - Standardize RAM budgeting checks (reserve-based)
 *  - Provide safe “ensureDaemon” start helper (start only if affordable)
 *  - Provide targeted kill helpers for “managed scripts only” restarts
 *
 * Notes:
 *  - This is a library module (import-only). It is not intended to be run directly.
 *  - These helpers intentionally avoid over-opinionated logging. They return structured
 *    results so caller can decide how/where to log.
 */

// ------------------------------------------------------------
// RAM helpers
// ------------------------------------------------------------

export function getMaxRam(ns, host = "home") {
  return ns.getServerMaxRam(host);
}

export function getUsedRam(ns, host = "home") {
  return ns.getServerUsedRam(host);
}

export function getFreeRam(ns, host = "home") {
  return getMaxRam(ns, host) - getUsedRam(ns, host);
}

/**
 * Returns “spendable” RAM = free - reserve (never below 0).
 */
export function getSpendableRam(ns, host = "home", reserveRam = 0) {
  const free = getFreeRam(ns, host);
  return Math.max(0, free - Math.max(0, Number(reserveRam) || 0));
}

export function getScriptCost(ns, script, host = "home", threads = 1) {
  const s = normScript(script);
  if (!ns.fileExists(s, host)) return Infinity;
  return ns.getScriptRam(s, host) * Math.max(1, Math.floor(threads));
}

/**
 * True if we can afford to start script with given threads on host,
 * leaving reserveRam unallocated.
 */
export function canAfford(ns, script, host = "home", threads = 1, reserveRam = 0) {
  const cost = getScriptCost(ns, script, host, threads);
  const spendable = getSpendableRam(ns, host, reserveRam);
  return isFinite(cost) && cost <= spendable;
}

// ------------------------------------------------------------
// Process helpers
// ------------------------------------------------------------

/**
 * Returns true if any instance of script is running on host.
 * (Ignores args on purpose; this is a simple “is it alive” check.)
 */
export function isScriptRunning(ns, script, host = "home") {
  const s = normScript(script);
  return ns.ps(host).some(p => p.filename === s);
}

/**
 * Returns an array of processes for a given script on a host.
 * Useful when you want to kill specific scripts or check args.
 */
export function getScriptProcesses(ns, script, host = "home") {
  const s = normScript(script);
  return ns.ps(host).filter(p => p.filename === s);
}

/**
 * Kill all processes on host whose filename matches any entry in scriptsSet.
 * Returns { killed, attempted }.
 */
export function killScripts(ns, host, scriptsSet) {
  let attempted = 0;
  let killed = 0;

  // Normalize filenames in the set so callers can pass "/bin/x.js" safely.
  const raw = scriptsSet instanceof Set ? scriptsSet : new Set(scriptsSet || []);
  const set = new Set(Array.from(raw, normScript));

  for (const p of ns.ps(host)) {
    if (!set.has(p.filename)) continue;
    attempted++;
    if (ns.kill(p.pid)) killed++;
  }

  return { killed, attempted };
}

/**
 * Kill all scripts on host except:
 *  - the caller (this script pid)
 *  - any filenames in keepFiles (Set or array)
 * Returns { killed, attempted }.
 *
 * This is useful if you want a controller to do a “clean slate” reset
 * without killing itself.
 */
export function killAllExcept(ns, host = "home", keepFiles = []) {
  const myPid = ns.pid;

  // Normalize keep list so callers can pass "/bin/x.js" safely.
  const raw = keepFiles instanceof Set ? keepFiles : new Set(keepFiles || []);
  const keep = new Set(Array.from(raw, normScript));

  let attempted = 0;
  let killed = 0;

  for (const p of ns.ps(host)) {
    if (p.pid === myPid) continue;
    if (keep.has(p.filename)) continue;

    attempted++;
    if (ns.kill(p.pid)) killed++;
  }

  return { killed, attempted };
}

// ------------------------------------------------------------
// Start / Ensure helpers
// ------------------------------------------------------------

/**
 * Start script on home using ns.run() (or ns.exec() if you provide host != "home").
 * Returns a structured result object so caller can log consistently.
 *
 * Result:
 *  {
 *    ok: boolean,
 *    reason?: string,
 *    pid?: number,
 *    cost?: number,
 *    spendable?: number
 *  }
 */
export function tryStart(ns, script, {
  host = "home",
  threads = 1,
  args = [],
  reserveRam = 0,
} = {}) {
  const s = normScript(script);

  if (!s) return { ok: false, reason: "no-script" };
  if (!ns.fileExists(s, host)) return { ok: false, reason: "missing-file" };

  const t = Math.max(1, Math.floor(threads));
  const cost = getScriptCost(ns, s, host, t);
  const spendable = getSpendableRam(ns, host, reserveRam);

  if (!isFinite(cost)) return { ok: false, reason: "unknown-cost", cost, spendable };
  if (cost > spendable) return { ok: false, reason: "insufficient-ram", cost, spendable };

  const a = normArgs(args);

  let pid = 0;
  try {
    if (host === "home") pid = ns.run(s, t, ...a);
    else pid = ns.exec(s, host, t, ...a);
  } catch (_e) {
    pid = 0;
  }

  if (!pid) return { ok: false, reason: "start-failed", pid, cost, spendable };
  return { ok: true, pid, cost, spendable };
}

/**
 * Ensure a daemon is running (start it if not running).
 *
 * Options:
 *  - requireArgsMatch: if true, only counts “running” if args match exactly
 *    (default false: any running instance is considered good).
 *
 * Returns:
 *  {
 *    action: "noop" | "started" | "skipped",
 *    ok: boolean,
 *    reason?: string,
 *    pid?: number,
 *    cost?: number,
 *    spendable?: number
 *  }
 */
export function ensureDaemon(ns, script, {
  host = "home",
  threads = 1,
  args = [],
  reserveRam = 0,
  requireArgsMatch = false,
} = {}) {
  const s = normScript(script);

  if (!s) return { action: "skipped", ok: false, reason: "no-script" };
  if (!ns.fileExists(s, host)) return { action: "skipped", ok: false, reason: "missing-file" };

  const running = ns.ps(host).filter(p => p.filename === s);

  if (running.length > 0) {
    if (!requireArgsMatch) return { action: "noop", ok: true };

    const want = normArgs(args);
    const match = running.some(p => arraysEqual(normArgs(p.args), want));
    if (match) return { action: "noop", ok: true };

    // If running but args mismatch, we intentionally do NOT kill/restart here.
    // Caller can decide to kill + restart using killScripts().
    return { action: "skipped", ok: false, reason: "args-mismatch" };
  }

  const res = tryStart(ns, s, { host, threads, args, reserveRam });
  if (!res.ok) return { action: "skipped", ...res };
  return { action: "started", ...res };
}

// ------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normScript(p) {
  // Bitburner process filenames are typically stored without leading "/"
  return String(p || "").replace(/^\/+/, "");
}

function normArgs(args) {
  // Compare args as strings for stability (2048 vs "2048", etc.)
  return (args || []).map(a => String(a));
}
