/** @param {NS} ns */
/*
 * lib/logging.js
 *
 * Description
 *  Controller-friendly logging helpers.
 *   - Supports “silent”, “always”, and “changes” terminal modes
 *   - Designed for: quiet terminal, rich ns.print() logs elsewhere
 *
 * Notes
 *  - This module only emits to terminal (ns.tprint).
 *  - It does not call ns.print() so it won’t spam tail logs.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

export function flushLog(ns, mode, msgs, lastMsgs) {
  const lines = (msgs || []).filter(Boolean);
  if (!lines.length || mode === "silent") return;

  if (mode === "always") {
    for (const m of lines) ns.tprint(m);
    return;
  }

  // changes (default)
  for (const m of lines) {
    if (!lastMsgs || !lastMsgs.has(m)) ns.tprint(m);
  }
}
