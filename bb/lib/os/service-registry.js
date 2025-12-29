/** @param {NS} ns */
/*
 * lib/os/service-registry.js
 *
 * Description
 *  Canonical bbOS service registry.
 *  - Provides a single place to define "managed services" (daemons) and their defaults.
 *  - Import-only; not intended to be run directly.
 *
 * Notes
 *  - This registry is intentionally lightweight and static.
 *  - Controller may override script paths via flags; status tools can merge those overrides.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

/**
 * @typedef {object} ServiceSpec
 * @property {string} key            Stable identifier (e.g. "batcher")
 * @property {string} name           Human-friendly name
 * @property {string} script         Canonical script path (leading "/")
 * @property {string} host           Default host (usually "home")
 * @property {number} threads        Default threads
 * @property {boolean} managed       Whether controller is expected to manage it
 * @property {string} lane           Which logical lane owns it (daemon-lane, etc.)
 * @property {string} notes          Short description
 */

/**
 * Canonical list of bbOS "services".
 * These map directly to controller flags in your current repo (batcher/botnet/pserv/trader/gangManager).
 * @returns {ServiceSpec[]}
 */
export function getServiceRegistry() {
  return [
    {
      key: "controller",
      name: "Controller",
      script: "/bin/controller.js",
      host: "home",
      threads: 1,
      managed: false,
      lane: "os",
      notes: "Main bbOS orchestrator (not managed by itself).",
    },

    // Managed daemons (daemon-lane owns these today).
    {
      key: "pserv",
      name: "Pserv Manager",
      script: "/bin/pserv-manager.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Purchased server policy + lifecycle management.",
    },
    {
      key: "batcher",
      name: "Timed Net Batcher",
      script: "/bin/timed-net-batcher2.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Primary HWGW batcher.",
    },
    {
      key: "botnet",
      name: "Botnet HGW Sync",
      script: "/bin/botnet-hgw-sync.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Remote HGW deployment / sync layer.",
    },
    {
      key: "trader",
      name: "Basic Trader",
      script: "/bin/basic-trader.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Forecast-based stock trader (requires WSE/TIX/4S).",
    },
    {
      key: "gangManager",
      name: "Gang Manager",
      script: "/bin/gang-manager.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "daemon-lane",
      notes: "Gang automation daemon (if gang exists / API available).",
    },

    // Scheduled jobs (controller job-lane)
    {
      key: "backdoorJob",
      name: "Backdoor One-shot",
      script: "/bin/backdoor-oneshot.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "jobs",
      notes: "Periodically installs backdoors where possible.",
    },
    {
      key: "contractsJob",
      name: "Contracts Solver",
      script: "/bin/contracts-find-and-solve.js",
      host: "home",
      threads: 1,
      managed: true,
      lane: "jobs",
      notes: "Periodically scans and solves coding contracts.",
    },

    // Optional helper daemons controller may run or call into.
    {
      key: "darkwebBuyer",
      name: "Darkweb Auto Buyer",
      script: "/bin/darkweb-auto-buyer.js",
      host: "home",
      threads: 1,
      managed: false,
      lane: "singularity",
      notes: "Buys programs via TOR/darkweb when possible.",
    },

    // Bootstrap/early lane (not a managed daemon; started by bootstrap).
    {
      key: "earlyStartup",
      name: "Startup Home Advanced",
      script: "/bin/startup-home-advanced.js",
      host: "home",
      threads: 1,
      managed: false,
      lane: "bootstrap",
      notes: "Lightweight early daemon while waiting for controller RAM.",
    },
  ];
}

/**
 * Merge controller flag overrides into service specs.
 * Flags are expected to contain keys like: batcher/botnet/pserv/trader/gangManager/darkwebBuyer.
 * @param {ServiceSpec[]} specs
 * @param {any} flags  ns.flags() result from controller/bootstrap/tool
 * @returns {ServiceSpec[]}
 */
export function applyScriptOverrides(specs, flags) {
  const f = flags || {};
  const map = {
    batcher: "batcher",
    botnet: "botnet",
    pserv: "pserv",
    trader: "trader",
    gangManager: "gangManager",
    darkwebBuyer: "darkwebBuyer",
    controller: "controller",

    // Scheduled jobs (optional override support)
    backdoorJob: "backdoorJob",
    contractsJob: "contractsJob",
  };

  return specs.map((s) => {
    const flagKey = Object.keys(map).find((k) => map[k] === s.key);
    if (!flagKey) return s;

    const v = String(f[flagKey] || "").trim();
    if (!v) return s;

    const norm = v.startsWith("/") ? v : ("/" + v);
    return { ...s, script: norm };
  });
}

/**
 * Convenience: build final registry from a flags object (optional).
 * @param {any} flags
 * @returns {ServiceSpec[]}
 */
export function getRegistryWithOverrides(flags) {
  return applyScriptOverrides(getServiceRegistry(), flags);
}
