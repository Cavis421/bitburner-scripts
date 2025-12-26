/*
 * lib/corp/exports.js
 *
 * Applies export routes on a throttle.
 */

export function maybeApplyExports(ns, corp, cfg, state, log) {
  const ex = cfg?.exports;
  if (!ex?.enabled) return;

  const now = Date.now();
  const refreshMs = Number(ex.refreshMs || 60_000);
  if (now - Number(state.lastExportAt || 0) < refreshMs) return;

  if (!safeBool(() => corp.hasUnlock("Export"), false)) return;

  const plan = Array.isArray(ex.plan) ? ex.plan : [];
  if (plan.length === 0) return;

  for (const route of plan) {
    const from = String(route?.from || "").trim();
    const to = String(route?.to || "").trim();
    const mat = String(route?.mat || "").trim();
    const amount = route?.amount ?? "IPROD";
    if (!from || !to || !mat) continue;

    // only if both divisions exist
    if (!divisionExists(corp, from) || !divisionExists(corp, to)) continue;

    // apply for each shared city
    const fromDiv = safeObj(() => corp.getDivision(from), null);
    const toDiv = safeObj(() => corp.getDivision(to), null);
    if (!fromDiv || !toDiv) continue;

    const fromCities = new Set(fromDiv.cities || []);
    for (const city of toDiv.cities || []) {
      if (!fromCities.has(city)) continue;

      if (!safeBool(() => corp.hasWarehouse(from, city), false)) continue;
      if (!safeBool(() => corp.hasWarehouse(to, city), false)) continue;

      try { corp.exportMaterial(from, city, to, city, mat, amount); } catch {}
    }
  }

  state.lastExportAt = now;
  log.info("exports", `applied export routes (${plan.length} rules)`);
}

// helpers
function divisionExists(corp, divName) {
  try { corp.getDivision(divName); return true; } catch { return false; }
}
function safeBool(fn, fallback) {
  try { return Boolean(fn()); } catch { return fallback; }
}
function safeObj(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}
