/** @param {NS} ns */


/*
 * /bin/bootstrap.js
 *
 * Description
 *  Minimal BN-restart-safe launcher.
 *  Keeps RAM tiny by avoiding heavy imports.
 *
 *  While waiting for home RAM to be sufficient, it can keep a lightweight
 *  "early daemon" running (default: /bin/botnet-hgw-sync.js).
 *
 * Notes
 *  - Designed to be the "first script you run" after reset.
 *  - Early daemon is best-effort: starts only if not already running and affordable.
 *  - By default, early daemon is stopped right before starting /bin/controller.js
 *    to help meet the free-RAM gate.
 *
 * Syntax
 *  run /bin/bootstrap.js
 *  run /bin/bootstrap.js --controllerRam 700 --poll 5000
 *  run /bin/bootstrap.js --early /bin/botnet-hgw-sync.js -- n00dles money
 *  run /bin/bootstrap.js --early /bin/early-hgw.js -- n00dles
 *  run /bin/bootstrap.js --stopEarly false
 *  run /bin/bootstrap.js --help
 */

const FLAGS = [
  ["help", false],
  // Heavy controller
  ["controller", "/bin/controller.js"],
  ["controllerThreads", 1],
  ["controllerRam", 700],        // how much FREE home RAM required to start controller
  // Early daemon (runs while waiting)
  ["early", "/bin/botnet-hgw-sync.js"], // set "" to disable
  ["earlyThreads", 1],
  ["stopEarly", true],           // stop early daemon right before launching controller
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
  const early = String(flags.early || "").trim();
  const earlyThreads = Math.max(1, Math.floor(Number(flags.earlyThreads) || 1));
  const stopEarly = !!flags.stopEarly;

  // Pass-through args after `--` go to the early daemon
  // Example: run /bin/bootstrap.js -- n00dles money
  const earlyArgs = flags._.slice(0);

  while (true) {
    const alreadyRunning = isRunning(ns, controller, "home");
    if (alreadyRunning) return;

    // 1) Keep early daemon running (best-effort) while we wait
    ensureEarlyDaemon(ns, early, earlyThreads, earlyArgs);

    // 2) Controller gate checks
    if (!ns.fileExists(controller, "home")) {
      ns.print(`[bootstrap] missing ${controller}; waiting...`);
      await ns.sleep(poll);
      continue;
    }

    const free = getFreeRam(ns);
    if (free < needFree) {
      ns.print(`[bootstrap] waiting: freeRam=${free.toFixed(1)} need=${needFree}`);
      await ns.sleep(poll);
      continue;
    }

    // 3) Optionally stop early daemon to free RAM, then launch controller
    if (stopEarly && early) {
      // Kill all instances regardless of args (simple + safe)
      try { ns.scriptKill(early, "home"); } catch {}
      await ns.sleep(0);
    }

    const freeAfter = getFreeRam(ns);
    if (freeAfter < needFree) {
      ns.print(`[bootstrap] controller gate not met after stopping early daemon. freeRam=${freeAfter.toFixed(1)} need=${needFree}`);
      await ns.sleep(poll);
      continue;
    }

    const pid = ns.run(controller, controllerThreads);
    if (pid) {
      ns.tprint(`[bootstrap] started ${controller} (pid=${pid}) freeRam=${freeAfter.toFixed(1)}`);
      if (exitAfterStart) return;
    } else {
      ns.print(`[bootstrap] failed to start controller (pid=0). freeRam=${freeAfter.toFixed(1)}`);
    }

    await ns.sleep(poll);
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function getFreeRam(ns) {
  return ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
}

function isRunning(ns, script, host = "home") {
  try { return ns.ps(host).some(p => p.filename === script); } catch { return false; }
}
function ensureEarlyDaemon(ns, script, threads, args) {
  if (!script) return;
  if (!ns.fileExists(script, "home")) return;

  // If already running, don't duplicate
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


function printHelp(ns) {
  ns.tprint("/bin/bootstrap.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Minimal BN-restart-safe launcher that starts /bin/controller.js only when home has enough free RAM.");
  ns.tprint("  While waiting, it can keep a lightweight early daemon running (default: /bin/botnet-hgw-sync.js).");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Avoids heavy imports to keep RAM cost tiny.");
  ns.tprint("  - Early daemon is best-effort and will only start if affordable.");
  ns.tprint("  - By default, early daemon is stopped right before starting the heavy controller.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/bootstrap.js");
  ns.tprint("  run /bin/bootstrap.js --controllerRam 700 --poll 5000");
  ns.tprint('  run /bin/bootstrap.js --early /bin/botnet-hgw-sync.js -- n00dles money');
  ns.tprint('  run /bin/bootstrap.js --early /bin/early-hgw.js -- n00dles');
  ns.tprint("  run /bin/bootstrap.js --stopEarly false");
  ns.tprint("  run /bin/bootstrap.js --help");
}


