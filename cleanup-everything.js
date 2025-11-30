/** @param {NS} ns */
/*
------------------------------------------------------------
 cleanup-everything.js
------------------------------------------------------------
*/

export async function main(ns) {
  ns.disableLog("ALL");

  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const home = "home";

  ns.tprint("🧹 CLEANUP EVERYTHING: starting cleanup across entire network...");
  ns.tprint(`🖥 Found ${servers.length} servers`);

  // ------------------------------------------------------------
  // 1) Kill EVERYTHING everywhere (except this script)
  // ------------------------------------------------------------
  ns.tprint("🔪 Killing all scripts on all servers...");
  const myPid = ns.pid;
  for (const s of servers) {
    for (const p of ns.ps(s)) {
      if (s === home && p.pid === myPid) continue;
      ns.kill(p.pid);
    }
  }
  await ns.sleep(200);

  // ------------------------------------------------------------
  // 2) CLEAN NPC SERVERS (ONLY .js)
  // ------------------------------------------------------------
  ns.tprint("🗑 Cleaning NPC servers (deleting .js only)...");
  for (const host of servers) {
    if (host === home) continue;
    if (pservs.has(host)) continue;

    await wipeServer(ns, host);
  }

  // ------------------------------------------------------------
  // 3) CLEAN PURCHASED SERVERS (ONLY .js)
  // ------------------------------------------------------------
  ns.tprint("🗑 Cleaning purchased servers (deleting .js only)...");
  for (const host of pservs) {
    await wipeServer(ns, host);
  }

  ns.tprint("✨ CLEANUP-EVERYTHING COMPLETE ✨");
}

/* ------------------------------------------------------------
   HELPERS
------------------------------------------------------------ */

function getAllServers(ns) {
  const visited = new Set();
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const h of ns.scan(host)) {
      if (!visited.has(h)) queue.push(h);
    }
  }
  return Array.from(visited);
}

// NEW: Delete only .js files
async function wipeServer(ns, host) {
  const files = ns.ls(host);
  let removed = 0;

  for (const f of files) {
    if (isSafeToDelete(f)) {
      ns.rm(f, host);
      removed++;
    }
  }

  ns.tprint(`   - ${host}: removed ${removed} files`);
}

// ONLY delete .js — no .txt, no .lit, no contracts
function isSafeToDelete(file) {
  if (file.endsWith(".cct")) return false;
  if (file.startsWith("README")) return false;

  // UPDATED RULE: only remove .js
  return file.endsWith(".js");
}
