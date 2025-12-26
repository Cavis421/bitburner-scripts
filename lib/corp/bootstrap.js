/*
 * lib/corp/bootstrap.js
 *
 * Planner that returns capex "intents". No direct spending here.
 * We'll implement your exact sequence next:
 *  create division -> expand city -> warehouse -> office size -> must-have unlocks/upgrades -> next city ...
 */

export function getBootstrapIntents(ns, corp, cfg, log) {
  // Single source of truth: only plan when capex is enabled.
  if (!cfg?.capex?.enabled) return [];

  // Optional override: allow explicitly disabling the bootstrap planner.
  if (cfg?.bootstrap?.enabled === false) return [];

  // TODO: implement planner; return array of intents
  // Intent shape (proposed; must match spend.js):
  // { key, desc, cost: () => number, exec: () => void }
  void ns; void corp; void log;
  return [];
}
