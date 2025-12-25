/** @param {NS} ns */
/*
 * lib/work.js
 *
 * Description
 *  Small helpers for representing “current work” in a compact, log-friendly way.
 *
 * Notes
 *  - Pure formatting (no Singularity calls). Safe to use anywhere.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

export function formatWorkBrief(work) {
  if (!work) return "none";

  try {
    if (work.type === "CRIME") return `CRIME:${work.crimeType}`;
    if (work.type === "GYM") return `GYM:${work.gymStatType}`;
    if (work.type === "CLASS") return `CLASS:${work.classType ?? work.courseName ?? "?"}`;
    if (work.type === "FACTION") return `FACTION:${work.factionName}:${work.factionWorkType}`;
    return String(work.type || "unknown");
  } catch (_e) {
    return "unknown";
  }
}
