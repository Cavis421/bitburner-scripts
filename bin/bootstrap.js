/**
 * /bin/bootstrap.js
 *
 * Description
 *  Minimal BN-restart-safe launcher that starts the heavy controller only when home has enough free RAM.
 *  While waiting, it can keep one or more lightweight early daemons running.
 *
 * Notes
 *  - Avoids heavy imports to keep RAM cost tiny.
 *  - Early daemons are best-effort and will only start if affordable.
 *  - If --stopEarly true, early daemons are stopped right before starting the controller.
 *
 * Syntax
 *  run /bin/bootstrap.js
 *  run /bin/bootstrap.js --controllerRam 700 --poll 5000
 *  run /bin/bootstrap.js --early "/bin/startup-home-advanced.js"
 *  run /bin/bootstrap.js --earlyList "/bin/startup-home-advanced.js,/bin/botnet-hgw-sync.js"
 *  run /bin/bootstrap.js --stopEarly false
 *  run /bin/bootstrap.js --help
 */

/** @param {NS} ns */

const FLAGS = [
  ["help", false],
  // Heavy controller
  ["controller", "/bin/controller.js"],
  ["controllerThreads", 1],
  ["controllerRam", 1000],        // how much FREE home RAM required to start controller

  // Early daemon(s)
  // Back-compat single early script:
  ["early", "/bin/startup-home-advanced.js"], // set "" to disable
  // New: comma-separated list of early scripts (overrides --early if provided)
  ["earlyList", ""], // e.g. "/bin/startup-home-advanced.js,/bin/botnet-hgw-sync.js"
  ["earlyThreads", 1],
  ["stopEarly", true],           // stop early daemon(s) right before launching controller

  // Loop cadence
  ["poll", 5000],

  // Behavior
  ["exitAfterStart", true],
];

export async function main(ns) {
  const flags = ns.flags(FLAGS);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  const controller = String(flags.controller);
  const poll = Math.max(1000, Number(flags.poll) || 5000);
  const needFree = Math.max(0, Number(flags.controllerRam) || 0);
  const controllerThreads = Math.max(1, Math.floor(Number(flags.controllerThreads) || 1));
  const exitAfterStart = !!flags.exitAfterStart;

  const stopEarly = !!flags.stopEarly;
  const earlyThreads = Math.max(1, Math.floor(Number(flags.earlyThreads) || 1));

  // Pass-through args after `--` go to the early daemon(s)
  // Example: run /bin/bootstrap.js -- n00dles money
  const earlyArgs = flags._.slice(0);

  // Determine early scripts:
  // - If earlyList provided, use that
  // - Else fall back to `early`
  const earlyList = parseEarlyList(String(flags.earlyList || "").trim());
  const earlySingle = String(flags.early || "").trim();

  /** @type {string[]} */
  const earlyScripts = (earlyList.length > 0)
    ? earlyList
    : (earlySingle ? [earlySingle] : []);

  // Normalize: allow "bin/x.js" or "/bin/x.js" — ensure leading "/"
  const earlyScriptsNorm = earlyScripts
    .map(s => String(s || "").trim())
    .filter(Boolean)
    .map(s => s.startsWith("/") ? s : ("/" + s));

  const controllerNorm = controller.startsWith("/") ? controller : ("/" + controller);

  while (true) {
    // Keep early daemon(s) alive while waiting
    for (const s of earlyScriptsNorm) {
      ensureEarlyDaemon(ns, s, earlyThreads, earlyArgs);
    }

    // Attempt to start controller if affordable
    const freeAfter = getFreeRam(ns);
    if (freeAfter < needFree) {
      await ns.sleep(poll);
      continue;
    }

    if (!ns.fileExists(controllerNorm, "home")) {
      ns.tprint(`[bootstrap] ERROR: controller missing on home: ${controllerNorm}`);
      return;
    }

    const controllerCost = ns.getScriptRam(controllerNorm, "home") * controllerThreads;
    if (!Number.isFinite(controllerCost) || controllerCost <= 0) {
      ns.tprint(`[bootstrap] ERROR: controller RAM cost invalid: ${controllerNorm}`);
      return;
    }

    if (controllerCost > getFreeRam(ns)) {
      await ns.sleep(poll);
      continue;
    }

    // Stop early daemon(s) just before launching controller if configured
    if (stopEarly && earlyScriptsNorm.length > 0) {
      for (const s of earlyScriptsNorm) {
        tryStop(ns, s, "home");
      }
      // Give a moment for RAM to free up
      await ns.sleep(50);
    }

    const pid = ns.run(controllerNorm, controllerThreads);
    if (pid) {
      ns.tprint(`[bootstrap] started ${controllerNorm} (pid=${pid}) freeRam=${getFreeRam(ns).toFixed(1)}`);
      if (exitAfterStart) return;
    } else {
      // Rare: run failed (race) — keep looping
      ns.tprint(`[bootstrap] WARN: failed to start ${controllerNorm} (ns.run returned ${pid})`);
    }

    await ns.sleep(poll);
  }
}

// ------------------------------------------------------------
// Helpers (keep tiny; no imports)
// ------------------------------------------------------------

function getFreeRam(ns) {
  const max = ns.getServerMaxRam("home");
  const used = ns.getServerUsedRam("home");
  return Math.max(0, max - used);
}

function isRunning(ns, script, host) {
  try {
    // normalize slashes just in case
    const s = String(script || "");
    return ns.isRunning(s, host);
  } catch {
    return false;
  }
}

function tryStop(ns, script, host) {
  try {
    if (isRunning(ns, script, host)) ns.scriptKill(script, host);
  } catch {
    // ignore
  }
}

function ensureEarlyDaemon(ns, script, threads, args) {
  if (!script) return;
  if (!ns.fileExists(script, "home")) return;

  // If already running (normalized), don't duplicate
  if (isRunning(ns, script, "home")) return;

  const t = Math.max(1, Math.floor(threads));
  const cost = ns.getScriptRam(script, "home") * t;
  const free = getFreeRam(ns);

  if (!Number.isFinite(cost) || cost <= 0) return;
  if (cost > free) return;

  try {
    ns.run(script, t, ...(args || []));
  } catch {
    // ignore
  }
}

function parseEarlyList(listStr) {
  if (!listStr) return [];
  return listStr
    .split(",")
    .map(s => String(s || "").trim())
    .filter(Boolean);
}

// ------------------------------------------------------------
// Help
// ------------------------------------------------------------
function printHelp(ns) {
  ns.tprint("/bin/bootstrap.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Minimal BN-restart-safe launcher that starts /bin/controller.js only when home has enough free RAM.");
  ns.tprint("  While waiting, it can keep one or more lightweight early daemons running.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Avoids heavy imports to keep RAM cost tiny.");
  ns.tprint("  - Early daemons are best-effort and will only start if affordable.");
  ns.tprint("  - By default, early daemons are stopped right before starting the heavy controller.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/bootstrap.js");
  ns.tprint("  run /bin/bootstrap.js --controllerRam 700 --poll 5000");
  ns.tprint("  run /bin/bootstrap.js --early \"/bin/startup-home-advanced.js\"");
  ns.tprint("  run /bin/bootstrap.js --earlyList \"/bin/startup-home-advanced.js,/bin/botnet-hgw-sync.js\"");
  ns.tprint("  run /bin/bootstrap.js --stopEarly false");
  ns.tprint("  run /bin/bootstrap.js --help");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --controller <path>       Controller script (default /bin/controller.js)");
  ns.tprint("  --controllerThreads <n>   Threads to run controller (default 1)");
  ns.tprint("  --controllerRam <gb>      Free RAM required before starting controller (default 700)");
  ns.tprint("  --early <path>            Single early daemon (default /bin/startup-home-advanced.js). Set \"\" to disable.");
  ns.tprint("  --earlyList <csv>         Comma-separated early daemons. Overrides --early if provided.");
  ns.tprint("  --earlyThreads <n>        Threads for each early daemon (default 1)");
  ns.tprint("  --stopEarly true|false    Stop early daemon(s) before starting controller (default true)");
  ns.tprint("  --poll <ms>               Poll interval while waiting (default 5000)");
  ns.tprint("  --exitAfterStart true|false  Exit after launching controller (default true)");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  Pass-through args after `--` are forwarded to early daemon(s).");
  ns.tprint("  Example: run /bin/bootstrap.js -- n00dles money");
}
