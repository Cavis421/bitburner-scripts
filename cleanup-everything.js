/** @param {NS} ns */
/*
------------------------------------------------------------
 cleanup-everything.js
 Combined utility:
   - Kill ALL running scripts on ALL servers
   - Delete ALL deployed .js payloads from NPC servers
   - Delete ALL deployed .js payloads from purchased servers
   - Leaves home scripts intact (only kills processes)
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
  // 2) CLEAN NPC SERVERS
  // ------------------------------------------------------------
  ns.tprint("🗑 Cleaning NPC servers (deleting .js, .txt payloads)...");
  for (const host of servers) {
    if (host === home) continue;
    if (pservs.has(host)) continue; // handled separately

    await wipeServer(ns, host);
  }

  // ------------------------------------------------------------
  // 3) CLEAN PURCH SERVERS
  // ------------------------------------------------------------
  ns.tprint("🗑 Cleaning purchased servers...");
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

// Delete all .js, .txt files except the root filesystem
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

function isSafeToDelete(file) {
  // Never delete contracts or important files
  if (file.endsWith(".cct")) return false;
  if (file.startsWith("README")) return false;

  return (
    file.endsWith(".js") ||
    file.endsWith(".txt") ||
    file.endsWith(".lit")
  );
}
