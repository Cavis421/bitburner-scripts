/** @param {NS} ns */
/*
 * darkweb/darkweb-auto-buyer.js
 *
 * After you purchase TOR, run this once per BitNode.
 * It will automatically purchase all Dark Web programs that are
 * referenced by core/startup-home-advanced.js:
 *
 *   - BruteSSH.exe
 *   - FTPCrack.exe
 *   - relaySMTP.exe
 *   - HTTPWorm.exe
 *   - SQLInject.exe
 *   - Formulas.exe
 *
 * It loops until all target programs are owned, then exits.
 */

export async function main(ns) {
  // Add --help support (script does not use positional args)
  const flags = ns.flags([
    ["help", false],
  ]);

  if (flags.help) {
    printHelp(ns);
    return; // Do not run auto-buy logic when showing help
  }

  ns.disableLog("ALL");

  // Singularity API check (BN4 / SF4 required)
  if (
    !ns.singularity ||
    typeof ns.singularity.getDarkwebProgramCost !== "function" ||
    typeof ns.singularity.purchaseProgram !== "function"
  ) {
    ns.tprint("darkweb-auto-buyer: Singularity API not available.");
    ns.tprint("  This script requires BN4 or Source-File 4.1+.");
    ns.tprint("  Until then, buy Dark Web programs manually with 'buy' in Terminal.");
    return;
  }

  // Programs actually used in core/startup-home-advanced.js
  // (via countPortCrackers() and hasFormulas()).
  const TARGET_PROGRAMS = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
    "Formulas.exe",
  ];

  const CHECK_INTERVAL = 60_000; // 60s between checks

  // Make sure we really have TOR / Dark Web access
  const player = ns.getPlayer();
  const hasTor = player.tor || ns.serverExists("darkweb");

  if (!hasTor) {
    ns.tprint("darkweb-auto-buyer: No TOR router detected.");
    ns.tprint("  Buy TOR from the Dark Web hardware vendor first, then rerun this.");
    return;
  }

  ns.tprint("darkweb-auto-buyer: Starting Dark Web program purchases...");
  ns.tprint("  Target programs:");
  for (const p of TARGET_PROGRAMS) ns.tprint(`    - ${p}`);

  while (true) {
    let remaining = 0;

    for (const prog of TARGET_PROGRAMS) {
      // Already owned? Skip.
      if (ns.fileExists(prog, "home")) continue;

      remaining++;

      const cost = ns.singularity.getDarkwebProgramCost(prog);
      if (!isFinite(cost) || cost <= 0) {
        ns.print(`${prog}: cost is ${cost}, maybe not available yet. Skipping for now.`);
        continue;
      }

      const money = ns.getServerMoneyAvailable("home");

      if (money >= cost) {
        // Fix: use ns.formatNumber instead of invalid ns.ns.formatNumber
        const costStr = ns.formatNumber(cost, "$0.00a");
        const moneyStr = ns.formatNumber(money, "$0.00a");

        ns.tprint(
          `Attempting to purchase ${prog} for ${costStr} ` +
          `(you: ${moneyStr})`
        );
        const ok = ns.singularity.purchaseProgram(prog);
        if (ok) {
          ns.tprint(`Purchased ${prog}.`);
        } else {
          ns.tprint(`purchaseProgram(${prog}) failed (maybe already owned or some other issue).`);
        }
      } else {
        const moneyStr = ns.formatNumber(money, "$0.00a");
        const costStr = ns.formatNumber(cost, "$0.00a");
        ns.print(
          `Waiting for funds for ${prog}: ` +
          `${moneyStr} / ${costStr}`
        );
      }
    }

    if (remaining === 0) {
      ns.tprint("darkweb-auto-buyer: All target programs purchased. Exiting.");
      return;
    }

    // Wait a bit before checking again
    await ns.sleep(CHECK_INTERVAL);
  }
}

function printHelp(ns) {
  ns.tprint("darkweb/darkweb-auto-buyer.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Automatically purchases key Dark Web programs once you have TOR access.");
  ns.tprint("  Loops until BruteSSH.exe, FTPCrack.exe, relaySMTP.exe, HTTPWorm.exe,");
  ns.tprint("  SQLInject.exe, and Formulas.exe are all owned, then exits.");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  Requires Singularity access (BN4 or Source-File 4.1+) to use purchaseProgram.");
  ns.tprint("  Also requires that you already own a TOR router or have Dark Web access.");
  ns.tprint("  Script takes no positional arguments and is typically run once per BitNode.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run darkweb/darkweb-auto-buyer.js [--help]");
}
