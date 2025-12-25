/** @param {NS} ns */
/*
 * lib/format.js
 *
 * Shared formatting + small utility helpers used across scripts.
 *
 * Goals:
 *  - Eliminate duplicated clamp/format/padding helpers across UI, corp, and controllers.
 *  - Keep helpers small, predictable, and dependency-free.
 *
 * Notes:
 *  - This is a library module (import-only). It is not intended to be run directly.
 */

// ------------------------------------------------------------
// Numeric helpers
// ------------------------------------------------------------

export function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

export function clamp01(x) {
  if (!isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function pct(x, digits = 1) {
  const v = clamp01(Number(x));
  return (v * 100).toFixed(Math.max(0, digits)) + "%";
}

// ------------------------------------------------------------
// String helpers
// ------------------------------------------------------------

export function padLeft(s, width, ch = " ") {
  const str = String(s);
  const w = Math.max(0, Number(width) || 0);
  if (str.length >= w) return str;
  return ch.repeat(w - str.length) + str;
}

export function padRight(s, width, ch = " ") {
  const str = String(s);
  const w = Math.max(0, Number(width) || 0);
  if (str.length >= w) return str;
  return str + ch.repeat(w - str.length);
}

/**
 * Simple join that skips falsy/empty pieces.
 * Useful for building compact status lines.
 */
export function joinNonEmpty(parts, sep = " ") {
  return (parts || []).map(String).map(s => s.trim()).filter(Boolean).join(sep);
}

// ------------------------------------------------------------
// Money/number formatting helpers
// ------------------------------------------------------------

/**
 * Format money with consistent prefix and precision.
 * Mirrors patterns you already use in startup-home-advanced.js.
 */
export function fmtMoney(ns, value, decimals = 2, minPrefix = 1e3) {
  return "$" + ns.formatNumber(value, decimals, minPrefix);
}

/**
 * General number formatter (no $), useful for corp/UI dashboards.
 */
export function fmtNum(ns, value, decimals = 2, minPrefix = 1e3) {
  return ns.formatNumber(value, decimals, minPrefix);
}

/**
 * Format milliseconds as a compact human string.
 * Examples:
 *  - 950 -> "950ms"
 *  - 12_345 -> "12.3s"
 *  - 90_000 -> "1.5m"
 *  - 3_600_000 -> "1.0h"
 */
export function fmtTime(ms) {
  const x = Number(ms);
  if (!isFinite(x)) return "NaN";
  const abs = Math.abs(x);

  if (abs < 1000) return `${Math.round(x)}ms`;
  if (abs < 60_000) return `${(x / 1000).toFixed(1)}s`;
  if (abs < 3_600_000) return `${(x / 60_000).toFixed(1)}m`;
  return `${(x / 3_600_000).toFixed(1)}h`;
}
