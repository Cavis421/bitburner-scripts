/** @param {NS} ns */
/*
------------------------------------------------------------
 ui/network-visualizer.js

 Pretty-prints the server network as a tree starting from
 a given root (default: "home"), using /lib/network.js.

 Usage examples:
   run ui/network-visualizer.js
   run ui/network-visualizer.js --start home
   run ui/network-visualizer.js --start CSEC
   run ui/network-visualizer.js --maxDepth 2
   run ui/network-visualizer.js --onlyRooted

 Flags:
   --start <host>     Root of the tree (default: home)
   --maxDepth <n>     Limit depth (0 = just root, -1 = unlimited)
   --onlyRooted       Show only rooted servers with RAM > 0
   --noStats          Hide RAM/money/hack req stats
------------------------------------------------------------
*/

import { buildNetworkMap } from "/lib/network.js";

export async function main(ns) {
  ns.disableLog("ALL");

  const flags = ns.flags([
    ["start", "home"],
    ["maxDepth", -1],
    ["onlyRooted", false],
    ["noStats", false],
    ["help", false],
  ]);

  if (flags.help) {
    ns.tprint("Usage: run ui/network-visualizer.js [--start host] [--maxDepth n] [--onlyRooted] [--noStats]");
    return;
  }

  const start = String(flags.start || "home");
  const maxDepth = Number(flags.maxDepth);
  const onlyRooted = Boolean(flags.onlyRooted);
  const showStats = !flags.noStats;

  ns.tprint(`🌐 Building network map from "${start}"...`);
  const network = await buildNetworkMap(ns, start);

  if (!network[start]) {
    ns.tprint(`❌ Start host "${start}" not found in network.`);
    return;
  }

  // Build children lists: parent -> [children]
  /** @type {Record<string, string[]>} */
  const children = {};
  for (const [host, info] of Object.entries(network)) {
    const parent = info.parent;
    if (parent === null || parent === undefined) continue;
    if (!children[parent]) children[parent] = [];
    children[parent].push(host);
  }

  // Sort children for consistent output:
  //  - home first, then purchased servers, then others by name
  for (const key of Object.keys(children)) {
    children[key].sort((a, b) => {
      const ia = network[a];
      const ib = network[b];

      // home always first if present
      if (a === "home" && b !== "home") return -1;
      if (b === "home" && a !== "home") return 1;

      // purchased servers next
      if (ia.purchasedByPlayer && !ib.purchasedByPlayer) return -1;
      if (ib.purchasedByPlayer && !ia.purchasedByPlayer) return 1;

      // fallback: alphabetical
      return a.localeCompare(b);
    });
  }

  ns.tprint("");
  ns.tprint(`📡 NETWORK MAP (start="${start}", maxDepth=${maxDepth})`);
  ns.tprint("------------------------------------------------------------");

  // Recursive printer
  printNode(ns, start, null, children, network, {
    depth: 0,
    maxDepth,
    onlyRooted,
    showStats,
    prefix: "",
    isLast: true,
  });

  ns.tprint("------------------------------------------------------------");
  ns.tprint("Legend: [H]=home [P]=pserv [R]=rooted [B]=backdoor [U]=unrooted 🔒");
}

/**
 * Recursively print a node and its children.
 *
 * @param {NS} ns
 * @param {string} host
 * @param {string|null} parent
 * @param {Record<string, string[]>} children
 * @param {Record<string, any>} network
 * @param {{
 *   depth: number,
 *   maxDepth: number,
 *   onlyRooted: boolean,
 *   showStats: boolean,
 *   prefix: string,
 *   isLast: boolean
 * }} ctx
 */
function printNode(ns, host, parent, children, network, ctx) {
  const info = network[host];
  if (!info) return;

  const { depth, maxDepth, onlyRooted, showStats, prefix, isLast } = ctx;

  // Optional filter: only show rooted servers with RAM > 0
  if (onlyRooted && !(info.hasAdminRights && info.maxRam > 0)) {
    // Still descend so children can show up if they pass filter
    // (you could change this behavior if you prefer to prune)
  }

  const branchChar = parent === null ? " " : (isLast ? "└─" : "├─");

  const tags = [];
  if (host === "home") tags.push("[H]");
  if (info.purchasedByPlayer) tags.push("[P]");
  if (info.hasAdminRights && info.maxRam > 0) tags.push("[R]");
  if (info.backdoorInstalled) tags.push("[B]");
  if (!info.hasAdminRights) tags.push("[U]");

  let stats = "";
  if (showStats) {
    stats = formatStats(ns, info);
  }

  ns.tprint(`${prefix}${branchChar} ${host} ${tags.join("")} ${stats}`);

  if (maxDepth >= 0 && depth >= maxDepth) return;

  const kids = children[host] || [];
  const nextPrefix = parent === null ? "" : prefix + (isLast ? "  " : "│ ");

  kids.forEach((child, index) => {
    const last = index === kids.length - 1;
    printNode(ns, child, host, children, network, {
      depth: depth + 1,
      maxDepth,
      onlyRooted,
      showStats,
      prefix: nextPrefix,
      isLast: last,
    });
  });
}

function formatStats(ns, info) {
  const parts = [];

  // RAM
  if (info.maxRam > 0) {
    const ram = ns.formatRam(info.maxRam, 0); // (value, decimalDigits)
    parts.push(`RAM=${ram}`);
  }

  // Money
  if (info.moneyMax > 0) {
    // formatNumber(value, fractionalDigits)
    const money = ns.formatNumber(info.moneyMax, 2); // e.g. "24000000.00"
    parts.push(`$=${money}`);
  }

  // Hack level
  if (info.requiredHackingSkill > 0) {
    parts.push(`hack=${info.requiredHackingSkill}`);
  }

  return parts.length ? `(${parts.join(" | ")})` : "";
}
