/**
 * hacknet/hacknet-ui.js
 *
 * Always-on Hacknet dashboard:
 *  - Total production rate
 *  - Total hashes (if Hacknet Servers)
 *  - Node/server count, avg level/ram/cores (as applicable)
 *  - Upgrade affordability quick hints (cheapest next upgrades)
 *
 * No flags. No modes. Just truth.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  const interval = 6_000;

  const hasHacknet =
    ns.hacknet && typeof ns.hacknet.numNodes === "function" && typeof ns.hacknet.getNodeStats === "function";

  if (!hasHacknet) {
    ns.tprint("ERROR: Hacknet API not available.");
    return;
  }

  const isServerMode =
    typeof ns.hacknet.numHashes === "function" &&
    typeof ns.hacknet.hashCapacity === "function" &&
    typeof ns.hacknet.getHashGainRate === "function";

  while (true) {
    const snap = getSnapshot(ns, { isServerMode });
    render(ns, snap, { isServerMode });
    await ns.sleep(interval);
  }
}

// ---------------------------------------------------------------------------
// Snapshot logic
// ---------------------------------------------------------------------------

function getSnapshot(ns, caps) {
  const cash = ns.getServerMoneyAvailable("home");
  const n = ns.hacknet.numNodes();

  let totalProd = 0;

  // Aggregate stats
  let sumLevel = 0;
  let sumRam = 0;
  let sumCores = 0;
  let sumCache = 0;

  let minProd = Infinity;
  let maxProd = 0;

  // Cheapest upgrades (rough “what can I buy next?”)
  let best = {
    level: { cost: Infinity, node: -1, delta: 1 },
    ram: { cost: Infinity, node: -1, delta: 1 },
    core: { cost: Infinity, node: -1, delta: 1 },
    cache: { cost: Infinity, node: -1, delta: 1 },
  };

  for (let i = 0; i < n; i++) {
    const s = ns.hacknet.getNodeStats(i);

    // Nodes: s.production is money/sec
    // Servers: s.production is hashes/sec in many versions; we also have getHashGainRate()
    const prod = Number(s.production || 0);

    totalProd += prod;

    sumLevel += Number(s.level || 0);
    sumRam += Number(s.ram || 0);
    sumCores += Number(s.cores || 0);
    sumCache += Number(s.cache || 0);

    minProd = Math.min(minProd, prod);
    maxProd = Math.max(maxProd, prod);

    // Upgrade costs (guard by function existence for version differences)
    if (typeof ns.hacknet.getLevelUpgradeCost === "function") {
      const c = ns.hacknet.getLevelUpgradeCost(i, 1);
      if (Number.isFinite(c) && c > 0 && c < best.level.cost) best.level = { cost: c, node: i, delta: 1 };
    }

    if (typeof ns.hacknet.getRamUpgradeCost === "function") {
      const c = ns.hacknet.getRamUpgradeCost(i, 1);
      if (Number.isFinite(c) && c > 0 && c < best.ram.cost) best.ram = { cost: c, node: i, delta: 1 };
    }

    if (typeof ns.hacknet.getCoreUpgradeCost === "function") {
      const c = ns.hacknet.getCoreUpgradeCost(i, 1);
      if (Number.isFinite(c) && c > 0 && c < best.core.cost) best.core = { cost: c, node: i, delta: 1 };
    }

    if (typeof ns.hacknet.getCacheUpgradeCost === "function") {
      const c = ns.hacknet.getCacheUpgradeCost(i, 1);
      if (Number.isFinite(c) && c > 0 && c < best.cache.cost) best.cache = { cost: c, node: i, delta: 1 };
    }
  }

  const avg = {
    level: n ? sumLevel / n : 0,
    ram: n ? sumRam / n : 0,
    cores: n ? sumCores / n : 0,
    cache: n ? sumCache / n : 0,
  };

  // Purchase next node/server cost if available
  let nextNodeCost = null;
  if (typeof ns.hacknet.getPurchaseNodeCost === "function") {
    nextNodeCost = ns.hacknet.getPurchaseNodeCost();
  } else if (typeof ns.hacknet.getPurchaseNodeCost === "undefined" && typeof ns.hacknet.getPurchaseNodeCost !== "function") {
    // older variants exist, ignore
  }

  // Hacknet Servers extras
  let hashes = null;
  let hashCap = null;
  let hashRate = null;
  if (caps.isServerMode) {
    hashes = ns.hacknet.numHashes();
    hashCap = ns.hacknet.hashCapacity();
    hashRate = ns.hacknet.getHashGainRate();
  }

  return {
    cash,
    n,
    totalProd,
    minProd: minProd === Infinity ? 0 : minProd,
    maxProd,
    avg,
    best,
    nextNodeCost,
    hashes,
    hashCap,
    hashRate,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(ns, s, caps) {
  ns.clearLog();

  ns.print("============================================================");
  ns.print("HACKNET DASHBOARD (AUTOMATIC)");
  ns.print("============================================================");

  ns.print(`Cash on hand:             ${fmtMoney(ns, s.cash)}`);
  ns.print(`Nodes/Servers:            ${s.n}`);

  if (!caps.isServerMode) {
    ns.print(`Total production:         ${fmtMoney(ns, s.totalProd)}/sec`);
    ns.print(`Per-node production:      min=${fmtMoney(ns, s.minProd)}/s  max=${fmtMoney(ns, s.maxProd)}/s`);
  } else {
    ns.print(`Total hash rate:          ${fmtNum(ns, s.hashRate)}/sec`);
    ns.print(`Hashes stored:            ${fmtNum(ns, s.hashes)} / ${fmtNum(ns, s.hashCap)}`);
  }

  ns.print("------------------------------------------------------------");
  ns.print(
    `Avg stats: lvl=${s.avg.level.toFixed(1)} ` +
    `ram=${s.avg.ram.toFixed(1)} ` +
    `cores=${s.avg.cores.toFixed(1)}` +
    (Number.isFinite(s.avg.cache) ? ` cache=${s.avg.cache.toFixed(1)}` : "")
  );

  if (s.n === 0) {
    ns.print("");
    ns.print("(No hacknet nodes/servers yet.)");
    if (s.nextNodeCost != null) {
      ns.print(`Next purchase cost:       ${fmtMoney(ns, s.nextNodeCost)}`);
    }
    return;
  }

  ns.print("------------------------------------------------------------");
  ns.print("Cheapest next upgrades (1 step)");
  ns.print("------------------------------------------------------------");

  printCheapest(ns, "LEVEL", s.best.level, s.cash);
  printCheapest(ns, "RAM  ", s.best.ram, s.cash);
  printCheapest(ns, "CORE ", s.best.core, s.cash);
  // Cache only meaningful in server mode, but safe to show if API exists
  if (Number.isFinite(s.best.cache.cost) && s.best.cache.node >= 0) {
    printCheapest(ns, "CACHE", s.best.cache, s.cash);
  }

  if (s.nextNodeCost != null && Number.isFinite(s.nextNodeCost)) {
    const ok = s.cash >= s.nextNodeCost ? "BUYABLE" : "save";
    ns.print("------------------------------------------------------------");
    ns.print(
      `Next node/server cost:    ${fmtMoney(ns, s.nextNodeCost)} ` +
      `[${ok}]`
    );
  }
}

function printCheapest(ns, label, entry, cash) {
  if (!Number.isFinite(entry.cost) || entry.node < 0) {
    ns.print(`${label}: (n/a)`);
    return;
  }
  const ok = cash >= entry.cost ? "BUYABLE" : "save";
  ns.print(`${label}: node ${entry.node} -> ${fmtMoney(ns, entry.cost)} [${ok}]`);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtMoney(ns, v) {
  if (typeof ns.formatMoney === "function") return ns.formatMoney(v);
  return `$${ns.formatNumber(v)}`;
}

function fmtNum(ns, v) {
  if (v === null || v === undefined) return "n/a";
  if (typeof ns.formatNumber === "function") return ns.formatNumber(v, 2, 1e3);
  return String(v);
}
