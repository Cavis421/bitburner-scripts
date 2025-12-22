/**
 * gang/territory-ui.js
 *
 * Always-on territory dashboard:
 *  - Your gang: territory %, power, warfare ON/OFF, wanted penalty
 *  - Clash chances vs each other gang (sorted by their territory)
 *  - Quick stats: best / median / worst clash chance
 *
 * No modes. No fluff. Just territory truth.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
  ]);

  if (flags.help) return printHelp(ns);

  ns.disableLog("ALL");
  ns.ui.openTail();

  if (!ns.gang || typeof ns.gang.getGangInformation !== "function") {
    ns.tprint("ERROR: Gang API not available.");
    return;
  }
  if (!ns.gang.inGang()) {
    ns.tprint("ERROR: You are not in a gang.");
    return;
  }

  const interval = 3_000;

  while (true) {
    const snap = getSnapshot(ns);
    render(ns, snap);
    await ns.sleep(interval);
  }
}

// ---------------------------------------------------------------------------
// Snapshot logic
// ---------------------------------------------------------------------------

function getSnapshot(ns) {
  const g = ns.gang.getGangInformation();
  const others = ns.gang.getOtherGangInformation();

  /** @type {Array<{name:string, power:number, territory:number, chance:number}>} */
  const rows = [];

  const chances = [];
  for (const name of Object.keys(others)) {
    // getOtherGangInformation includes your own gang too; keep it for display,
    // but exclude it from summary stats (chance is always 50% vs yourself).
    const info = others[name];
    const chance = safeChance(ns, name);

    rows.push({
      name,
      power: info.power ?? 0,
      territory: info.territory ?? 0,
      chance,
    });

    if (name !== g.faction && Number.isFinite(chance)) chances.push(chance);
  }

  rows.sort((a, b) => (b.territory - a.territory) || a.name.localeCompare(b.name));

  chances.sort((a, b) => a - b);

  const best = chances.length ? chances[chances.length - 1] : 0;
  const worst = chances.length ? chances[0] : 0;
  const median = chances.length ? chances[Math.floor(chances.length / 2)] : 0;

  const gte50 = chances.filter(c => c >= 0.50).length;
  const gte62 = chances.filter(c => c >= 0.62).length;
  const gte75 = chances.filter(c => c >= 0.75).length;
  const gte90 = chances.filter(c => c >= 0.90).length;

  return {
    gang: {
      faction: g.faction,
      isHacking: g.isHacking,
      territory: g.territory,
      power: g.power,
      engaged: g.territoryWarfareEngaged,
      wantedPenalty: g.wantedPenalty,
      wantedLevel: g.wantedLevel,
      respect: g.respect,
    },
    summary: {
      n: chances.length,
      best,
      median,
      worst,
      gte50,
      gte62,
      gte75,
      gte90,
    },
    rows,
  };
}

function safeChance(ns, otherGangName) {
  try {
    const c = ns.gang.getChanceToWinClash(otherGangName);
    return Number.isFinite(c) ? c : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(ns, s) {
  ns.clearLog();

  ns.print("============================================================");
  ns.print("GANG TERRITORY DASHBOARD (AUTOMATIC)");
  ns.print("============================================================");

  const type = s.gang.isHacking ? "HACKING" : "COMBAT";
  ns.print(`Type: ${type} | Faction: ${s.gang.faction}`);
  ns.print(
    `Territory: ${fmtPct(s.gang.territory)} | ` +
    `Power: ${fmtNumber(ns, s.gang.power)} | ` +
    `Warfare: ${s.gang.engaged ? "ON" : "OFF"}`
  );
  ns.print(
    `Wanted Penalty: ${fmtPct(s.gang.wantedPenalty)} | ` +
    `Wanted: ${fmtNumber(ns, s.gang.wantedLevel)} | ` +
    `Respect: ${fmtNumber(ns, s.gang.respect)}`
  );

  ns.print("------------------------------------------------------------");
  ns.print(
    `Clash chances (vs others): best=${fmtPct(s.summary.best)} ` +
    `median=${fmtPct(s.summary.median)} ` +
    `worst=${fmtPct(s.summary.worst)}`
  );
  ns.print(
    `Counts: >=50%:${s.summary.gte50}/${s.summary.n} ` +
    `>=62%:${s.summary.gte62}/${s.summary.n} ` +
    `>=75%:${s.summary.gte75}/${s.summary.n} ` +
    `>=90%:${s.summary.gte90}/${s.summary.n}`
  );
  ns.print("============================================================");

  ns.print("");
  ns.print("Other Gangs (sorted by territory)");
  ns.print("------------------------------------------------------------");

  for (const r of s.rows) {
    const isUs = r.name === s.gang.faction;
    ns.print(
      `${isUs ? "* " : "  "}${padRight(r.name, 18)} ` +
      `terr=${padLeft(fmtPct(r.territory), 7)} ` +
      `power=${padLeft(fmtNumber(ns, r.power), 9)} ` +
      `win=${padLeft(fmtPct(r.chance), 7)}`
    );
  }

  ns.print("");
  ns.print("* = your gang");
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtPct(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return "n/a";
  return (v * 100).toFixed(1) + "%";
}

function fmtNumber(ns, v) {
  if (!Number.isFinite(v)) return "n/a";
  if (typeof ns.formatNumber === "function") return ns.formatNumber(v, 2);
  // fallback
  const abs = Math.abs(v);
  if (abs >= 1e12) return (v / 1e12).toFixed(2) + "t";
  if (abs >= 1e9)  return (v / 1e9).toFixed(2) + "b";
  if (abs >= 1e6)  return (v / 1e6).toFixed(2) + "m";
  if (abs >= 1e3)  return (v / 1e3).toFixed(2) + "k";
  return v.toFixed(2);
}

function padRight(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function padLeft(s, n) {
  s = String(s);
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
gang/territory-ui.js
Description:
  Always-on territory dashboard for gangs.
  Shows your territory/power/warfare state and clash chances vs all other gangs.

Usage:
  run gang/territory-ui.js [--help]

Notes:
  - Opens a tail window automatically.
  - Read-only; does not modify gang warfare or tasks.
  - "win" is the chance to win a territory clash vs that gang.
`);
}
