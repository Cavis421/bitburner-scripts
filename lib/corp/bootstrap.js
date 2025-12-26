/*
 * lib/corp/bootstrap.js
 *
 * Planner that returns capex "intents". No direct spending here.
 * We'll implement your exact sequence next:
 *  create division -> expand city -> warehouse -> office size -> must-have unlocks/upgrades -> next city ...
 */

export function getBootstrapIntents(ns, corp, cfg, log) {
  if (!cfg?.bootstrap?.enabled) return [];

  // TODO: implement planner; return array of intents
  // Intent shape:
  // { key, desc, cost: () => number, exec: () => void }
  void ns; void corp; void log;
  return [];
}
