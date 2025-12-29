/* == FILE: bin/tools/os-status.js == */
/** @param {NS} ns */
/*
 * /bin/tools/os-status.js
 *
 * Description
 *  bbOS status viewer (popout-friendly).
 *  - Uses registry + services config to compute effective enablement.
 *  - Scans running processes to show what is actually running.
 *
 * Notes
 *  - Use --popout to open a Tail window and render there.
 *  - Use --interval <ms> for live refresh.
 *
 * Syntax
 *  run /bin/tools/os-status.js --popout
 *  run /bin/tools/os-status.js --popout --interval 1000
 *  run /bin/tools/os-status.js --once
 *  run /bin/tools/os-status.js --help
 */

import { getServiceRegistry } from "/lib/os/service-registry.js";
import {
  DEFAULT_SERVICE_CONFIG_PATH,
  normalizeDataPath,
  loadServiceConfig,
  getEffectiveEnabledMap,
} from "/lib/os/service-config.js";

const FLAGS = [
  ["help", false],

  // UI mode
  ["popout", true],     // if true: ns.tail() + ns.print dashboard
  ["once", false],      // if true: render once and exit (ignores interval)
  ["interval", 1500],   // ms refresh when not --once
  ["compact", true],     // one-line status (default)
  ["verbose", false],    // force full dashboard


  // Scope
  ["host", "home"],
  ["allHosts", false],

  // Filters
  ["lane", ""],
  ["onlyRunning", false],
  ["onlyEnabled", false],

  // Config
  ["servicesFile", DEFAULT_SERVICE_CONFIG_PATH],

  // Output shaping
  ["maxArgs", 6],
];

export async function main(ns) {
  const flags = ns.flags(FLAGS);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");
  ns.clearLog();

  const popout = !!flags.popout;
  const once = !!flags.once;

  if (popout) ns.tail();

  const interval = Math.max(250, Number(flags.interval) || 1500);

  while (true) {
    ns.clearLog();
    renderStatus(ns, flags);

    if (once) return;
    await ns.sleep(interval);
  }
}

function renderStatus(ns, flags) {
  if (flags.verbose || !flags.compact) {
    renderVerbose(ns, flags);
  } else {
    renderCompact(ns, flags);
  }
}

function renderCompact(ns, flags) {
  const registry = getServiceRegistry();
  const conf = loadServiceConfig(ns, normalizeDataPath(flags.servicesFile));
  const effective = getEffectiveEnabledMap(registry, conf);

  const host = flags.host || "home";
  const procs = safeArr(() => ns.ps(host), []);

  const running = new Set(procs.map(p => p.filename.replace(/^\/+/, "")));

  const parts = [];

  for (const svc of registry) {
    if (!svc.managed) continue;

    const script = svc.script.replace(/^\/+/, "");
    const isEnabled = !!effective[svc.key];
    const isRunning = running.has(script);

    const icon =
      !isEnabled ? "✖" :
      isRunning ? "✔" :
      "…";

    parts.push(`${icon} ${svc.key}`);
  }

  // Jobs (derived from controller behavior)
  const jobs = [];
  if (!conf?.enabled?.backdoorJob) jobs.push("backdoor");
  if (!conf?.enabled?.contractsJob) jobs.push("contracts");

  const ramFree = Math.floor(
    ns.getServerMaxRam("home") - ns.getServerUsedRam("home")
  );

  ns.print(
    `[bbOS] ${parts.join(" | ")} ` +
    `|| jobs:${jobs.length ? jobs.join(",") : "none"} ` +
    `|| RAM free: ${ramFree}GB`
  );
}


function buildScriptVariants(scriptWithSlash) {
  const s = String(scriptWithSlash || "").trim().replaceAll("\\", "/");
  const set = new Set();
  if (!s) return set;

  set.add(s);
  if (s.startsWith("/")) set.add(s.slice(1));
  else set.add("/" + s);

  return set;
}

function formatArgs(args, maxArgs) {
  if (!args || args.length === 0) return "[]";
  const a = args.map((x) => String(x));
  if (maxArgs > 0 && a.length > maxArgs) {
    return `[${a.slice(0, maxArgs).join(", ")}, …(+${a.length - maxArgs})]`;
  }
  return `[${a.join(", ")}]`;
}

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

function safeArr(fn, fallback) {
  try {
    const v = fn();
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function printHelp(ns) {
  ns.tprint("/bin/tools/os-status.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  bbOS status viewer (popout-friendly via Tail window).");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/tools/os-status.js --popout");
  ns.tprint("  run /bin/tools/os-status.js --popout --interval 1000");
  ns.tprint("  run /bin/tools/os-status.js --once");
  ns.tprint("  run /bin/tools/os-status.js --help");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --popout true|false     Use Tail window + log rendering (default true)");
  ns.tprint("  --once true|false       Render once and exit (default false)");
  ns.tprint("  --interval <ms>         Refresh cadence (default 1500)");
  ns.tprint("  --host <name>           Host scope when allHosts=false (default home)");
  ns.tprint("  --allHosts true|false   Scan all discovered hosts (default false)");
  ns.tprint("  --lane <name>           Filter to a single lane (default none)");
  ns.tprint("  --onlyRunning true|false Only show running services (default false)");
  ns.tprint("  --onlyEnabled true|false Only show enabled services (default false)");
  ns.tprint("  --servicesFile <path>   Config file (default data/os-services.json)");
  ns.tprint("  --maxArgs <n>           Truncate args list (default 6)");
}
