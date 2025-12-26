/*
 * lib/corp/state.js
 *
 * Persistent state container for corp daemon/modules.
 */

export function initCorpState(state) {
  if (!state) return null;

  if (!state.corp) state.corp = {};
  const s = state.corp;

  if (!s.lastTick) s.lastTick = 0;

  // spend gate / cooldowns
  if (!s.failAt) s.failAt = {}; // key -> timestamp

  // exports throttle
  if (!s.lastExportAt) s.lastExportAt = 0;

  return s;
}
