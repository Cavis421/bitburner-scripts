/*
 * lib/corp/spend.js
 *
 * Unified spend gate for ALL capex.
 * Modules should return "intents" and the daemon executes them through this gate.
 */

export function canSpend(corpFunds, capexCfg, cost) {
  const funds = Number(corpFunds || 0);
  const reserveA = Number(capexCfg?.reserveFunds ?? 0);
  const maxSpendFrac = Number(capexCfg?.maxSpendFrac ?? 1);

  const reserveB = funds * (1 - maxSpendFrac);
  const reserve = Math.max(reserveA, reserveB);

  const spendable = Math.max(0, funds - reserve);
  return {
    ok: cost <= spendable,
    funds,
    reserve,
    spendable,
  };
}

export function tryExecuteIntent(ns, corp, state, capexCfg, log, intent) {
  void ns; // reserved for future logging/telemetry hooks

  if (!intent) return { did: false };

  // Defensive: allow spend gate to be used even if caller didn't pre-init state.
  if (!state) state = {};
  if (!state.failAt) state.failAt = {};

  const key = String(intent.key || intent.action || "capex");
  const now = Date.now();
  const lastFail = Number(state.failAt[key] || 0);
  const failCooldownMs = Number(capexCfg?.failCooldownMs ?? 60_000);

  if (now - lastFail < failCooldownMs) {
    return { did: false };
  }

  // cost may be numeric or a function (cost probe)
  let cost = 0;
  try {
    cost = typeof intent.cost === "function" ? Number(intent.cost()) : Number(intent.cost || 0);
  } catch {
    cost = Infinity;
  }

  const corpInfo = safeObj(() => corp.getCorporation(), null);
  if (!corpInfo) return { did: false };

  const gate = canSpend(corpInfo.funds, capexCfg, cost);
  if (!Number.isFinite(cost) || cost < 0) cost = Infinity;

  if (!gate.ok) {
    state.failAt[key] = now;
    log.debug(
      "spend",
      `blocked ${key} cost=${fmt(cost)} spendable=${fmt(gate.spendable)} reserve=${fmt(gate.reserve)}`
    );
    return { did: false };
  }

  // Defensive: schema enforcement
  if (typeof intent.exec !== "function") {
    state.failAt[key] = now;
    log.warn("spend", `intent ${key} missing exec()`);
    return { did: false };
  }

  try {
    const result = intent.exec();
    log.info("capex", intent.desc || key);
    return { did: true, result };
  } catch (e) {
    state.failAt[key] = now;
    log.warn("spend", `failed ${key}: ${String(e)}`);
    return { did: false };
  }
}

// small helpers
function safeObj(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function fmt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "?";
  if (x >= 1e12) return (x / 1e12).toFixed(2) + "t";
  if (x >= 1e9)  return (x / 1e9).toFixed(2) + "b";
  if (x >= 1e6)  return (x / 1e6).toFixed(2) + "m";
  if (x >= 1e3)  return (x / 1e3).toFixed(2) + "k";
  return String(Math.round(x));
}
