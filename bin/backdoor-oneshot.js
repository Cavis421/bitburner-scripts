/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["tail", false],

    // One-shot behavior
    ["dryRun", false],     // print paths, don't connect/install
    ["skipAlready", true], // skip servers with backdoorInstalled
    ["delay", 25],         // ms between connect hops
    ["verbose", true],     // print per-server actions
  ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  if (flags.help) return printHelp(ns);
  if (flags.tail) ns.tail();

  ns.disableLog("sleep");
  ns.disableLog("scan");
  ns.disableLog("getHackingLevel");

  // Needs Singularity (SF4)
  if (!ns.singularity || typeof ns.singularity.connect !== "function" || typeof ns.singularity.installBackdoor !== "function") {
    ns.tprint("ERROR: Requires Singularity (Source-File 4): ns.singularity.connect/installBackdoor.");
    return;
  }

  const all = discoverAll(ns)
    .filter(s => s !== "home" && s !== "darkweb" && !ns.getPurchasedServers().includes(s))
    .sort((a, b) => a.localeCompare(b));

  let installed = 0, skipped = 0, failed = 0;

  for (const target of all) {
    const info = ns.getServer(target);

    // You said rooting is handled elsewhere; assume rooted-only.
    if (!info.hasAdminRights) {
      if (flags.verbose) ns.print(`[skip] ${target}: no root`);
      skipped++;
      continue;
    }

    if (flags.skipAlready && info.backdoorInstalled) {
      if (flags.verbose) ns.print(`[skip] ${target}: already backdoored`);
      skipped++;
      continue;
    }

    const myHack = ns.getHackingLevel();
    if (myHack < info.requiredHackingSkill) {
      if (flags.verbose) ns.print(`[skip] ${target}: hack too low (${myHack} < ${info.requiredHackingSkill})`);
      skipped++;
      continue;
    }

    const path = findPath(ns, target);
    if (!path) {
      ns.print(`[fail] ${target}: no route from home`);
      failed++;
      continue;
    }

    if (flags.dryRun) {
      ns.print(`[dry] ${target}: home -> ${path.join(" -> ")}`);
      installed++;
      continue;
    }

    try {
      // Always start from home for a deterministic route
      ns.singularity.connect("home");
      await ns.sleep(flags.delay);

      for (const hop of path) {
        const ok = ns.singularity.connect(hop);
        if (!ok) throw new Error(`connect failed at ${hop}`);
        await ns.sleep(flags.delay);
      }

      if (flags.verbose) ns.print(`[bd] ${target}: installing backdoor...`);
      await ns.singularity.installBackdoor();
      installed++;
      if (flags.verbose) ns.print(`[ok] ${target}: backdoor installed`);
    } catch (e) {
      failed++;
      ns.print(`[fail] ${target}: ${String(e)}`);
    } finally {
      try { ns.singularity.connect("home"); } catch {}
    }
  }

  ns.tprint(`One-shot backdoor complete: installed=${installed}, skipped=${skipped}, failed=${failed}`);
}

/** @returns {string[]} */
function discoverAll(ns) {
  const seen = new Set(["home"]);
  const stack = ["home"];
  while (stack.length) {
    const cur = stack.pop();
    for (const next of ns.scan(cur)) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return [...seen];
}

/** BFS parent map from home; returns hops excluding home. @returns {string[] | null} */
function findPath(ns, target) {
  const q = ["home"];
  const parent = new Map([["home", null]]);
  while (q.length) {
    const cur = q.shift();
    for (const next of ns.scan(cur)) {
      if (parent.has(next)) continue;
      parent.set(next, cur);
      if (next === target) q.length = 0;
      else q.push(next);
    }
  }
  if (!parent.has(target)) return null;

  const path = [];
  let cur = target;
  while (cur && cur !== "home") {
    path.push(cur);
    cur = parent.get(cur);
  }
  path.reverse();
  return path;
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
backdoor-oneshot.js
Description:
  One-shot backdoor installer. Discovers all servers reachable from home, then:
    - skips home/darkweb/purchased servers
    - requires ROOT access (assumes your controller already rooted everything)
    - requires hacking level >= required
    - connects hop-by-hop and runs ns.singularity.installBackdoor()

Usage:
  run backdoor-oneshot.js [--help] [--tail]
    [--dryRun false]
    [--skipAlready true]
    [--delay 25]
    [--verbose true]

Notes:
  - Requires Singularity (Source-File 4).
  - If you want it to attempt backdooring even without root, set up rooting first (in your controller).
  - Use --dryRun to print the route it would take for each server.
`);
}
