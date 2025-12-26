/*
 * lib/corp/state.js
 *
 * Persistent state container for corp daemon/modules.
 */

export function initCorpState(state) {
  if (!state) return null;

  // Root namespace
  if (!state.corp) state.corp = {};
  const s = state.corp;

  if (!s.lastTick) s.lastTick = 0;

  // spend gate / cooldowns
  if (!s.failAt) s.failAt = {}; // key -> timestamp

  // exports throttle
  if (!s.lastExportAt) s.lastExportAt = 0;

  // ------------------------------------------------------------------
  // Compatibility bridge:
  // Older modules/tick code may expect these fields on the top-level
  // state object. Keep them in sync by referencing the same objects.
  // ------------------------------------------------------------------
  if (!state.failAt) state.failAt = s.failAt;
  else s.failAt = state.failAt; // if someone already created it, prefer existing

  if (typeof state.lastExportAt !== "number") state.lastExportAt = s.lastExportAt;
  else s.lastExportAt = state.lastExportAt;

  if (typeof state.lastTick !== "number") state.lastTick = s.lastTick;
  else s.lastTick = state.lastTick;

  return s;
}
