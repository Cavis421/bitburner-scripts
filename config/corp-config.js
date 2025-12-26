/*
 * config/corp-config.js
 *
 * Central corp config. Keep logic out of here; this file is safe to tweak.
 */

export const CORP_CONFIG = {
  enabled: true,

  tickMs: 5000,

  // CAPEX policy (global)
  capex: {
    enabled: true,

    // Max number of capex actions per daemon tick
    maxActionsPerTick: 8,

    // Spend gating
    reserveFunds: 200_000_000,
    maxSpendFrac: 0.80,

    // Anti-spam for actions we can't afford
    failCooldownMs: 60_000,
  },

  // Bootstrap targets (used later by bootstrap.js)
  bootstrap: {
    enabled: true,
    cities: ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"],
    officeSizeTarget: 15,
    divisions: [
      { type: "Agriculture", name: "Agri" },
      { type: "Tobacco", name: "Tobacco" },
      { type: "Chemical", name: "Chem" },
      { type: "Robotics", name: "Robo" },
    ],
  },

  maintenance: {
    enabled: true,

    // Keep office filled up to size
    hireToFill: true,

    // Enable auto jobs (we'll wire ratios later)
    assignJobs: true,
  },

  exports: {
    enabled: true,
    refreshMs: 60_000,
    plan: [
      { from: "Agri", to: "Tobacco", mat: "Plants", amount: "IPROD" },
      { from: "Agri", to: "Tobacco", mat: "Food", amount: "IPROD" },
      { from: "Agri", to: "Chem", mat: "Plants", amount: "IPROD" },
      { from: "Agri", to: "Chem", mat: "Food", amount: "IPROD" },
      { from: "Agri", to: "Robo", mat: "Plants", amount: "IPROD" },
      { from: "Agri", to: "Robo", mat: "Food", amount: "IPROD" },
    ],
  },

  logging: {
    debug: false,
  },
};
