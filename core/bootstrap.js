/** @param {NS} ns */
/*
 * core/bootstrap.js
 *
 * Description
 *  Minimal BN-restart-safe launcher.
 *  Keeps RAM tiny by avoiding heavy imports.
 *  Starts core/controller.js only when home has enough free RAM.
 *
 * Notes
 *  - Designed to be the “first script” you run after reset.
 *  - Once the controller starts successfully, bootstrap can exit or keep monitoring.
 *
 * Syntax
 *  run core/bootstrap.js
 *  run core/bootstrap.js --controllerRam 700 --poll 5000
 *  run core/bootstrap.js --help
 */

const FLAGS = [
  ["help", false],
  ["controller", "core/controller.js"],
  ["controllerThreads", 1],
  ["controllerRam", 700],   // how much FREE home RAM required to start controller
  ["poll", 5000],
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
  const threads = Math.max(1, Math.floor(Number(flags.controllerThreads) || 1));
  const exitAfterStart = !!flags.exitAfterStart;

  while (true) {
    const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    const alreadyRunning = ns.ps("home").some(p => p.filename === controller);

    if (alreadyRunning) return;

    if (free >= needFree && ns.fileExists(controller, "home")) {
      const pid = ns.run(controller, threads);
      if (pid) {
        ns.tprint(`[bootstrap] started ${controller} (pid=${pid}) freeRam=${free.toFixed(1)}`);
        if (exitAfterStart) return;
      } else {
        ns.print(`[bootstrap] failed to start controller (pid=0). freeRam=${free.toFixed(1)}`);
      }
    } else {
      ns.print(`[bootstrap] waiting: freeRam=${free.toFixed(1)} need=${needFree}`);
    }

    await ns.sleep(poll);
  }
}

function printHelp(ns) {
  ns.tprint("core/bootstrap.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Minimal BN-restart-safe launcher that starts core/controller.js only when home has enough free RAM.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  - Avoids heavy imports to keep RAM cost tiny.");
  ns.tprint("  - Will wait until you have enough home RAM before launching the heavy controller.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run core/bootstrap.js");
  ns.tprint("  run core/bootstrap.js --controllerRam 700 --poll 5000");
  ns.tprint("  run core/bootstrap.js --exitAfterStart true");
  ns.tprint("  run core/bootstrap.js --help");
}
