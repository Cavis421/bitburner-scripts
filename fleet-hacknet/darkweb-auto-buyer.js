/** @param {NS} ns */
/*
 * darkweb-auto-buyer.js
 *
 * After you purchase TOR, run this once per BitNode.
 * It will automatically purchase all DarkWeb programs that are
 * referenced by startup-home-advanced.js:
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
  ns.disableLog("ALL");

  // Programs actually used in startup-home-advanced.js
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

  // Make sure we really have TOR / DarkWeb access
  const player = ns.getPlayer();
  const hasTor = player.tor || ns.serverExists("darkweb");

  if (!hasTor) {
    ns.tprint("❌ darkweb-auto-buyer: No TOR router detected.");
    ns.tprint("   Buy TOR from the DarkWeb hardware vendor first, then rerun this.");
    return;
  }

  ns.tprint("🎯 darkweb-auto-buyer: Starting DarkWeb program purchases...");
  ns.tprint("   Target programs:");
  for (const p of TARGET_PROGRAMS) ns.tprint(`    - ${p}`);

  while (true) {
    let remaining = 0;

    for (const prog of TARGET_PROGRAMS) {
      // Already owned? Skip.
      if (ns.fileExists(prog, "home")) continue;

      remaining++;

      const cost = ns.getDarkwebProgramCost(prog);
      if (!isFinite(cost) || cost <= 0) {
        ns.print(`⚠️ ${prog}: cost is ${cost}, maybe not available yet? Skipping for now.`);
        continue;
      }

      const money = ns.getServerMoneyAvailable("home");

      if (money >= cost) {
        ns.tprint(
          `🛒 Attempting to purchase ${prog} for ${ns.nFormat(cost, "$0.00a")} (you: ${ns.nFormat(money, "$0.00a")})`
        );
        const ok = ns.purchaseProgram(prog);
        if (ok) {
          ns.tprint(`✅ Purchased ${prog}.`);
        } else {
          ns.tprint(`❌ purchaseProgram(${prog}) failed (maybe already owned or some other issue).`);
        }
      } else {
        ns.print(
          `💤 Waiting for funds for ${prog}: ` +
          `${ns.nFormat(money, "$0.00a")} / ${ns.nFormat(cost, "$0.00a")}`
        );
      }
    }

    if (remaining === 0) {
      ns.tprint("🎉 darkweb-auto-buyer: All target programs purchased. Exiting.");
      return;
    }

    // Wait a bit before checking again
    await ns.sleep(CHECK_INTERVAL);
  }
}
