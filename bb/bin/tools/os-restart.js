/** @param {NS} ns */
/*
 * /bin/tools/os-restart.js
 *
 * Description
 *  Direct bbOS "reboot" tool.
 *
 *  Default behavior (OS restart):
 *   - Kills controller/bootstrap/early startup and all known bbOS-managed service scripts.
 *   - Optionally kills matching scripts across all hosts via --allHosts.
 *   - Optionally starts bootstrap (default) or controller after cleanup.
 *
 *  Single service mode:
 *   - If --key is provided, kills + restarts only that service (plus optional --enable override).
 *
 * Notes
 *  - Direct tool: does not call controller.
 *  - For data files, prefer "data/..." (no leading "/").
 *
 * Syntax
 *  run /bin/tools/os-restart.js
 *  run /bin/tools/os-restart.js --allHosts true
 *  run /bin/tools/os-restart.js --start controller
 *  run /bin/tools/os-restart.js --start none
 *
 *  run /bin/tools/os-restart.js --key trader
 *  run /bin/tools/os-restart.js --help
 */

import { getServiceRegistry } from "/lib/os/service-registry.js";
import {
  DEFAULT_SERVICE_CONFIG_PATH,
  normalizeDataPath,
  loadServiceConfig,
  saveServiceConfig,
} from "/lib/os/service-config.js";

const FLAGS = [
  ["help", false],

  // Optional: single-service mode (if empty => OS reboot mode)
  ["key", ""],

  // Host scope
  ["host", "home"],
  ["allHosts", false],

  // Restart launch controls
  ["start", "bootstrap"],  // bootstrap | controller | none
  ["startArgs", ""],

  // Process matching controls
  ["includeBin", true],    // OS reboot mode: also kill any script under bin/ (except this tool)
  ["fuzzy", false],

  // Single-service restart run controls
  ["threads", 1],
  ["args", ""],

  // RAM safety (optional) for (re)starting
  ["reserveRam", 0],

  // Optional integration with os-services config (single-service mode only)
  ["enable", false],
  ["servicesFile", DEFAULT_SERVICE_CONFIG_PATH],

  // output controls
  ["dryRun", false],
];

export async function main(ns) {
  const flags = ns.flags(FLAGS);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  const key = String(flags.key || "").trim();
  const dryRun = !!flags.dryRun;

  if (key) {
    await restartSingleService(ns, flags, { dryRun });
    return;
  }

  await rebootOs(ns, flags, { dryRun });
}

// ------------------------------------------------------------
// OS reboot mode
// ------------------------------------------------------------
async function rebootOs(ns, flags, { dryRun }) {
  const allHosts = !!flags.allHosts;
  const host = String(flags.host || "home").trim() || "home";
  const includeBin = !!flags.includeBin;
  const fuzzy = !!flags.fuzzy;

  const startMode = String(flags.start || "bootstrap").trim().toLowerCase();
  const startArgs = parseArgs(flags.startArgs);

  const reserveRam = Math.max(0, Number(flags.reserveRam) || 0);

  const targets = buildOsKillTargets(); // registry-driven now
  const hosts = allHosts ? discoverHosts(ns) : [host];

  ns.tprint("==============================================================");
  ns.tprint("   bbOS OS-RESTART (OS reboot mode)");
  ns.tprint("==============================================================");
  ns.tprint(`Scope:      ${allHosts ? "ALL HOSTS" : host}`);
  ns.tprint(`KillTargets:${targets.scripts.size} exact script(s) (+bin/*=${includeBin ? "YES" : "NO"})`);
  ns.tprint(`StartAfter: ${startMode} args=[${startArgs.join(", ")}]`);
  ns.tprint(`Mode:       ${dryRun ? "DRY RUN" : "LIVE"}`);
  ns.tprint("--------------------------------------------------------------");

  const killOrder = targets.killOrder;

  /** @type {{host:string, killed:number, matched:number}[]} */
  const perHost = [];

  for (const h of hosts) {
    const procs = safeArr(() => ns.ps(h), []);
    const matches = findMatchesForOsReboot(procs, killOrder, includeBin, fuzzy);

    if (matches.length > 0) {
      ns.tprint(`[kill] ${h}: matched ${matches.length}`);
      for (const p of matches) {
        ns.tprint(`  pid=${p.pid} thr=${p.threads} ${p.filename} args=[${(p.args || []).join(", ")}]`);
      }
    } else {
      ns.tprint(`[kill] ${h}: matched 0`);
    }

    let killed = 0;
    if (!dryRun) {
      for (const p of matches) {
        const ok = safeBool(() => ns.kill(p.pid, h), false);
        if (ok) killed++;
      }
    }

    perHost.push({ host: h, killed, matched: matches.length });
  }

  const totalMatched = perHost.reduce((a, x) => a + x.matched, 0);
  const totalKilled = perHost.reduce((a, x) => a + x.killed, 0);
  ns.tprint("--------------------------------------------------------------");
  ns.tprint(`[summary] matched=${totalMatched} killed=${dryRun ? "(dryRun)" : totalKilled} hosts=${hosts.length}`);

  if (startMode === "none") {
    ns.tprint("[start] skipped (start=none)");
    ns.tprint("==============================================================");
    return;
  }

  const startScript =
    startMode === "controller" ? "/bin/controller.js" :
    startMode === "bootstrap" ? "/bin/bootstrap.js" :
    "";

  if (!startScript) {
    ns.tprint(`[start] WARN: unknown --start value "${startMode}" (expected bootstrap|controller|none)`);
    ns.tprint("==============================================================");
    return;
  }

  if (reserveRam > 0) {
    const need = safeNum(() => ns.getScriptRam(startScript, "home"), NaN);
    if (Number.isFinite(need)) {
      const max = safeNum(() => ns.getServerMaxRam("home"), 0);
      const used = safeNum(() => ns.getServerUsedRam("home"), 0);
      const free = Math.max(0, max - used);
      const avail = free - reserveRam;

      if (avail < need) {
        ns.tprint(`[start] NOT starting ${startScript} (reserveRam gate). need=${need.toFixed(2)}GB avail=${avail.toFixed(2)}GB reserve=${reserveRam.toFixed(2)}GB`);
        ns.tprint("==============================================================");
        return;
      }
    }
  }

  if (dryRun) {
    ns.tprint(`[start] (dryRun) would run ${startScript} args=[${startArgs.join(", ")}]`);
    ns.tprint("==============================================================");
    return;
  }

  let pid = safeNum(() => ns.run(startScript, 1, ...startArgs), 0);
  if (pid <= 0) {
    const noSlash = startScript.startsWith("/") ? startScript.slice(1) : startScript;
    pid = safeNum(() => ns.run(noSlash, 1, ...startArgs), 0);
  }

  if (pid > 0) ns.tprint(`[start] started ${startScript} pid=${pid}`);
  else ns.tprint(`[start] WARN: failed to start ${startScript} (ns.run returned ${pid})`);

  ns.tprint("==============================================================");
}

/**
 * Registry-driven kill targets:
 * - includes ALL scripts from registry (managed + unmanaged)
 * - plus OS core (bootstrap/controller/earlyStartup) to be safe
 * - plus common child scripts (botnet remote worker)
 */
function buildOsKillTargets() {
  /** @type {Set<string>} */
  const scripts = new Set();

  // Registry scripts (single source of truth)
  const reg = getServiceRegistry();
  for (const s of reg) addScriptVariants(scripts, String(s.script || ""));

  // OS core (extra safety)
  addScriptVariants(scripts, "/bin/bootstrap.js");
  addScriptVariants(scripts, "/bin/controller.js");
  addScriptVariants(scripts, "/bin/startup-home-advanced.js");

  // Common child worker (botnet)
  addScriptVariants(scripts, "botnet/remote-hgw.js");

  // Kill ordering: leaf scripts first, controller/bootstrap last.
  const coreLast = new Set(["/bin/controller.js", "bin/controller.js", "/bin/bootstrap.js", "bin/bootstrap.js"]);
  const killOrder = [
    ...Array.from(scripts).filter((x) => !coreLast.has(x)),
    ...Array.from(scripts).filter((x) => coreLast.has(x)),
  ];

  return { scripts, killOrder };
}

function addScriptVariants(set, script) {
  const s = String(script || "").trim();
  if (!s) return;

  const norm = s.replaceAll("\\", "/");
  set.add(norm);

  if (norm.startsWith("/")) set.add(norm.slice(1));
  else set.add("/" + norm);
}

function findMatchesForOsReboot(procs, killOrder, includeBin, fuzzy) {
  const byFilename = new Map();
  for (const p of procs) {
    const fn = String(p.filename || "");
    if (!byFilename.has(fn)) byFilename.set(fn, []);
    byFilename.get(fn).push(p);
  }

  /** @type {any[]} */
  const matches = [];
  const seenPid = new Set();

  for (const script of killOrder) {
    const arr = byFilename.get(script);
    if (!arr) continue;
    for (const p of arr) {
      if (!seenPid.has(p.pid)) {
        matches.push(p);
        seenPid.add(p.pid);
      }
    }
  }

  if (includeBin) {
    for (const p of procs) {
      const fn = String(p.filename || "");
      if (fn === "/bin/tools/os-restart.js" || fn === "bin/tools/os-restart.js") continue;
      if (fn.startsWith("/bin/") || fn.startsWith("bin/")) {
        if (!seenPid.has(p.pid)) {
          matches.push(p);
          seenPid.add(p.pid);
        }
      }
    }
  }

  if (fuzzy) {
    for (const p of procs) {
      if (seenPid.has(p.pid)) continue;
      const fn = String(p.filename || "");
      for (const s of killOrder) {
        if (fn.includes(s)) {
          matches.push(p);
          seenPid.add(p.pid);
          break;
        }
      }
    }
  }

  matches.sort((a, b) => Number(b.pid) - Number(a.pid));
  return matches;
}

// ------------------------------------------------------------
// Single-service mode (unchanged)
// ------------------------------------------------------------
async function restartSingleService(ns, flags, { dryRun }) {
  const key = String(flags.key || "").trim();
  const host = String(flags.host || "home").trim() || "home";
  const threads = Math.max(1, Math.floor(Number(flags.threads) || 1));
  const argList = parseArgs(flags.args);
  const fuzzy = !!flags.fuzzy;
  const reserveRam = Math.max(0, Number(flags.reserveRam) || 0);

  const reg = getServiceRegistry();
  const svc = reg.find((s) => s.key === key);
  if (!svc) {
    const known = reg.map((s) => s.key).sort().join(", ");
    throw new Error(`Unknown service key "${key}". Known: ${known}`);
  }

  const script = String(svc.script || "").trim();
  if (!script) throw new Error(`Service "${key}" has empty script path in registry.`);

  const scriptNoSlash = script.startsWith("/") ? script.slice(1) : script;

  if (flags.enable) {
    const file = normalizeDataPath(flags.servicesFile);
    if (!dryRun) {
      const cfg = loadServiceConfig(ns, file);
      cfg.enabled = cfg.enabled || {};
      cfg.enabled[key] = true;
      const ok = saveServiceConfig(ns, file, cfg);
      if (ok) ns.tprint(`[bbOS] os-restart: enabled override written: ${file} (${key}=true)`);
      else ns.tprint(`[bbOS] os-restart: WARN: failed to write services config: ${file}`);
    } else {
      ns.tprint(`[bbOS] os-restart(dryRun): would write enabled override for ${key}`);
    }
  }

  const procs = safeArr(() => ns.ps(host), []);
  const matches = [];
  for (const p of procs) {
    const fn = String(p.filename || "");
    if (fn === script || fn === scriptNoSlash) matches.push(p);
    else if (fuzzy && (fn.includes(script) || fn.includes(scriptNoSlash))) matches.push(p);
  }

  ns.tprint("==============================================================");
  ns.tprint("   bbOS OS-RESTART (single service)");
  ns.tprint("==============================================================");
  ns.tprint(`Key:    ${key}`);
  ns.tprint(`Script: ${script}`);
  ns.tprint(`Host:   ${host}`);
  ns.tprint(`Start:  threads=${threads} args=[${argList.join(", ")}]`);
  ns.tprint(`Kill:   ${matches.length} matching process(es)${fuzzy ? " (fuzzy)" : ""}`);
  ns.tprint(`Mode:   ${dryRun ? "DRY RUN" : "LIVE"}`);
  ns.tprint("--------------------------------------------------------------");

  let killed = 0;
  if (!dryRun) {
    for (const p of matches) {
      const ok = safeBool(() => ns.kill(p.pid, host), false);
      if (ok) killed++;
    }
  }
  ns.tprint(`Killed: ${dryRun ? "(dryRun)" : killed}/${matches.length}`);

  const needRam = safeNum(() => ns.getScriptRam(script, host), NaN) * threads;
  if (reserveRam > 0 && Number.isFinite(needRam)) {
    const max = safeNum(() => ns.getServerMaxRam(host), 0);
    const used = safeNum(() => ns.getServerUsedRam(host), 0);
    const free = Math.max(0, max - used);
    const avail = free - reserveRam;

    if (avail < needRam) {
      ns.tprint(`[bbOS] os-restart: NOT starting (reserveRam gate). need=${needRam.toFixed(2)}GB avail=${avail.toFixed(2)}GB reserve=${reserveRam.toFixed(2)}GB`);
      ns.tprint("==============================================================");
      return;
    }
  }

  if (dryRun) {
    ns.tprint(`[bbOS] os-restart(dryRun): would run ${script} with ${threads} thread(s) args=[${argList.join(", ")}]`);
    ns.tprint("==============================================================");
    return;
  }

  let pid = safeNum(() => ns.run(script, threads, ...argList), 0);
  if (pid <= 0) pid = safeNum(() => ns.run(scriptNoSlash, threads, ...argList), 0);

  if (pid > 0) ns.tprint(`[bbOS] os-restart: started pid=${pid}`);
  else ns.tprint(`[bbOS] os-restart: WARN: failed to start (ns.run returned ${pid})`);

  ns.tprint("==============================================================");
}

// ------------------------------------------------------------
// Host discovery (for --allHosts)
// ------------------------------------------------------------
function discoverHosts(ns) {
  const out = [];
  const seen = new Set();
  const q = ["home"];
  seen.add("home");

  while (q.length > 0) {
    const cur = q.shift();
    out.push(cur);

    const next = safeArr(() => ns.scan(cur), []);
    for (const n of next) {
      if (!seen.has(n)) {
        seen.add(n);
        q.push(n);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------
// Help + utilities
// ------------------------------------------------------------
function printHelp(ns) {
  ns.tprint("/bin/tools/os-restart.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Direct bbOS reboot tool (kill bbOS processes, then optionally start bootstrap/controller).");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/tools/os-restart.js");
  ns.tprint("  run /bin/tools/os-restart.js --allHosts true");
  ns.tprint("  run /bin/tools/os-restart.js --start controller");
  ns.tprint("  run /bin/tools/os-restart.js --start none");
  ns.tprint("");
  ns.tprint("  run /bin/tools/os-restart.js --key trader");
  ns.tprint("  run /bin/tools/os-restart.js --help");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - OS reboot kill list is registry-driven (lib/os/service-registry.js).");
  ns.tprint("  - With --includeBin true (default), kills ANY script under bin/ (except this tool).");
  ns.tprint("  - --allHosts true will apply kills on every discovered host (via scan).");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --key <name>            Optional: single service key from registry");
  ns.tprint("  --host <name>           Host scope when allHosts=false (default home)");
  ns.tprint("  --allHosts true|false   Kill across all discovered hosts (default false)");
  ns.tprint("  --includeBin true|false In OS reboot mode: also kill bin/* (default true)");
  ns.tprint("  --fuzzy true|false      Allow substring matching for kills (default false)");
  ns.tprint("  --start bootstrap|controller|none  Start script after kills (default bootstrap)");
  ns.tprint('  --startArgs "<csv>"     Args for bootstrap/controller start (default none)');
  ns.tprint("  --reserveRam <gb>       Optional RAM gate for starting (default 0)");
  ns.tprint("  --threads <n>           Single-service start threads (default 1)");
  ns.tprint('  --args "<csv>"          Single-service args (default none)');
  ns.tprint("  --enable true|false     Single-service: write enabled override (default false)");
  ns.tprint("  --servicesFile <path>   Config file (default data/os-services.json)");
  ns.tprint("  --dryRun true|false     Print actions only (default false)");
}

function parseArgs(v) {
  const s = String(v || "").trim();
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
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

function safeArr(fn, fallback) {
  try {
    const v = fn();
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
