/** @param {NS} ns */
/*
 * /bin/tools/os-restart.js
 *
 * Goal
 *  - Run cleanup-everything.js
 *  - Then restart /bin/bootstrap.js
 *
 * Why this works
 *  - cleanup-everything.js avoids killing the current PID on home.
 *  - By importing + calling its main() directly, THIS script is the "current PID",
 *    so cleanup won't kill restart-os, and we can safely continue to relaunch bootstrap.
 *
 * Syntax
 *  run /bin/tools/restart-os.js
 *  run /bin/tools/restart-os.js --noCleanup true
 *  run /bin/tools/restart-os.js --bootArgs "neo-net money"
 *  run /bin/tools/restart-os.js --tail true
 */

import { main as cleanupEverythingMain } from "/bin/tools/cleanup-everything.js";

const FLAGS = [
  ["help", false],
  ["noCleanup", false],
  ["tail", false],

  // Bootstrap launch
  ["bootstrap", "/bin/bootstrap.js"],
  ["bootArgs", ""], // space-delimited string of args passed to bootstrap
];

export async function main(ns) {
  const flags = ns.flags(FLAGS);

  if (flags.help) return printHelp(ns);

  ns.disableLog("ALL");

  if (flags.tail) {
    if (ns.ui?.openTail) ns.ui.openTail();
    else ns.tail();
  }

  const bootstrap = String(flags.bootstrap || "/bin/bootstrap.js");
  const bootArgs = parseArgs(String(flags.bootArgs || ""));

  ns.tprint(`[restart-os] Starting OS restart...`);
  ns.tprint(`[restart-os] Bootstrap: ${bootstrap} ${bootArgs.join(" ")}`.trim());

  // 1) Cleanup
  if (!flags.noCleanup) {
    ns.tprint(`[restart-os] Running cleanup-everything...`);
    try {
      await cleanupEverythingMain(ns);
      ns.tprint(`[restart-os] Cleanup complete.`);
    } catch (e) {
      // Don't abort the restart if cleanup hiccups; still try to bring the OS back up.
      ns.tprint(`[restart-os] WARN cleanup failed: ${String(e)}`);
    }
  } else {
    ns.tprint(`[restart-os] Skipping cleanup (--noCleanup).`);
  }

  // 2) Restart bootstrap
  // Use spawn so this script cleanly hands off and doesn't sit around.
  ns.tprint(`[restart-os] Spawning bootstrap...`);
  ns.spawn(bootstrap, 1, ...bootArgs);
}

// -----------------------------

function parseArgs(s) {
  // simple, practical: split on whitespace; if you need quoted args later we can upgrade this
  return s.trim() ? s.trim().split(/\s+/g) : [];
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint("/bin/tools/restart-os.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Runs cleanup-everything.js, then restarts /bin/bootstrap.js.");
  ns.tprint("  Uses import+call so cleanup won't kill this script's PID.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/tools/restart-os.js");
  ns.tprint("  run /bin/tools/restart-os.js --noCleanup true");
  ns.tprint('  run /bin/tools/restart-os.js --bootArgs "neo-net money"');
  ns.tprint("  run /bin/tools/restart-os.js --tail true");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --noCleanup true|false     Skip cleanup step (default false)");
  ns.tprint("  --bootstrap <path>         Bootstrap script path (default /bin/bootstrap.js)");
  ns.tprint('  --bootArgs "<args>"        Space-delimited bootstrap args (default empty)');
  ns.tprint("  --tail true|false          Open tail window (default false)");
}
