/*
 * lib/corp/bootstrap.js
 *
 * Planner that returns capex "intents". No direct spending here.
 * Minimal bootstrap:
 *  1) Create planned divisions if missing (with optional minFunds gates)
 *  2) Expand ONE division into target cities at a time (reduces thrash)
 *
 * Intent shape:
 *  { key, desc, cost: number, exec: () => any }
 */

export function getBootstrapIntents(ns, corp, cfg, log) {
  if (!cfg?.capex?.enabled) return [];
  if (cfg?.bootstrap?.enabled === false) return [];

  const b = cfg?.bootstrap || {};
  const divPlan = Array.isArray(b.divisions) ? b.divisions : [];
  const targetCities = Array.isArray(b.cities) ? b.cities : [];

  if (divPlan.length === 0) return [];

  const corpInfo = safeObj(() => corp.getCorporation(), null);
  const funds = Number(corpInfo?.funds || 0);

  const intents = [];

  // Optional: per-division "don't even try yet" gates (prevents spam + failures)
  // You can move these into config later if you want.
  const minFundsByDivName = {
    Robo: 300_000_000_000, // 300b: adjust to taste
  };

  // 1) Create missing divisions (in config order)
  for (const d of divPlan) {
    const type = String(d?.type || "").trim();
    const name = String(d?.name || "").trim();
    if (!type || !name) continue;

    if (divisionExists(corp, name)) continue;

    const minFunds = Number(minFundsByDivName[name] || 0);
    if (funds < minFunds) {
      if (cfg?.logging?.debug) log.debug("bootstrap", `skip create ${name}: funds ${fmt(funds)} < min ${fmt(minFunds)}`);
      continue;
    }

    intents.push({
      key: `div:create:${name}`,
      desc: `Create division ${name} (${type})`,
      cost: 0,
      exec: () => corp.expandIndustry(type, name),
    });
  }

  // 2) Expand cities: pick the first division (by plan order) that still needs cities
  const firstNeedingCities = findFirstDivisionNeedingCities(corp, divPlan, targetCities);
  if (firstNeedingCities) {
    const { divName, missingCities } = firstNeedingCities;

    for (const c of missingCities) {
      intents.push({
        key: `div:expandCity:${divName}:${c}`,
        desc: `Expand ${divName} to ${c}`,
        cost: 0,
        exec: () => corp.expandCity(divName, c),
      });
    }
  }

  if (cfg?.logging?.debug) {
    log.debug("bootstrap", `planned ${intents.length} intents`);
  }

  void ns;
  return intents;
}

function findFirstDivisionNeedingCities(corp, divPlan, targetCities) {
  for (const d of divPlan) {
    const divName = String(d?.name || "").trim();
    if (!divName) continue;

    const div = safeObj(() => corp.getDivision(divName), null);
    if (!div) continue;

    const have = new Set(div.cities || []);
    const missing = [];
    for (const city of targetCities) {
      const c = String(city || "").trim();
      if (!c) continue;
      if (!have.has(c)) missing.push(c);
    }

    if (missing.length > 0) {
      return { divName, missingCities: missing };
    }
  }
  return null;
}

// helpers
function divisionExists(corp, divName) {
  try { corp.getDivision(divName); return true; } catch { return false; }
}
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
