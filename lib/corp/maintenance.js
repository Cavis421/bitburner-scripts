/*
 * lib/corp/maintenance.js
 *
 * No-spend, safe-to-run-every-tick routines.
 * Keeps offices filled and (later) assigns jobs / sales / smart supply.
 */

export function runMaintenance(ns, corp, cfg, log) {
  // Match tick.js semantics: enabled by default, only skip when explicitly false.
  if (cfg?.maintenance?.enabled === false) return;

  const bootstrap = cfg?.bootstrap;
  const divPlan = Array.isArray(bootstrap?.divisions) ? bootstrap.divisions : [];

  for (const d of divPlan) {
    const divName = String(d?.name || "").trim();
    if (!divName) continue;

    const div = safeObj(() => corp.getDivision(divName), null);
    if (!div) continue;

    // Hire to fill every city we already have
    if (cfg?.maintenance?.hireToFill) {
      for (const city of div.cities || []) {
        hireToFillSafe(corp, divName, city);
      }
    }

    // Placeholder for job assignment (we can wire your ratios here next)
    if (cfg?.maintenance?.assignJobs) {
      // TODO: integrate your intern rule + ratios module
      // log.debug("maint", `[${divName}] job assignment hook`);
      void ns; void log; // keep lint quiet if unused for now
    }
  }
}

function hireToFillSafe(corp, divName, city) {
  try {
    const office = corp.getOffice(divName, city);
    const size = Number(office?.size || 0);
    const emp = Number(office?.numEmployees || 0);
    const need = Math.max(0, size - emp);

    for (let i = 0; i < need; i++) {
      try { corp.hireEmployee(divName, city); } catch { break; }
    }
  } catch {}
}

function safeObj(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}
