/**
 * gang/gang-ui.js
 *
 * Always-on gang dashboard (live tail):
 *  - Gang status: territory, power, warfare, wanted penalty, rates
 *  - Task distribution
 *  - Combat-gear coverage (avg / worst / best)
 *  - Territory table: other gangs by territory + clash win chances
 *  - Compact member table (power-sorted)
 *
 * No modes. No micromanagement. Just gang truth.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["interval", 3000],
  ]);
  if (flags.help) {
    printHelp(ns);
    return;
  }

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

  const interval = Math.max(250, Number(flags.interval) || 3000);

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
  const names = ns.gang.getMemberNames();

  // Members
  const members = names.map((name) => {
    const m = ns.gang.getMemberInformation(name);
    const minC = Math.min(m.str, m.def, m.dex, m.agi);
    const power = (m.str + m.def + m.dex + m.agi);
    return { name, m, minC, power };
  });

  members.sort((a, b) => b.power - a.power || a.name.localeCompare(b.name));

  // Tasks distribution
  const tasks = new Map();
  for (const { m } of members) {
    const t = m.task || "(none)";
    tasks.set(t, (tasks.get(t) || 0) + 1);
  }

  // Combat gear list (items that affect str/def/dex/agi)
  const combatEquip = ns.gang.getEquipmentNames()
    .map((name) => ({
      name,
      stats: ns.gang.getEquipmentStats(name) || {},
    }))
    .filter((e) =>
      (e.stats.str || 0) > 0 ||
      (e.stats.def || 0) > 0 ||
      (e.stats.dex || 0) > 0 ||
      (e.stats.agi || 0) > 0
    );

  const totalCombatEquip = combatEquip.length;

  // Gear coverage per member
  let avgPct = 0;
  let worst = { name: "(none)", pct: 1, have: totalCombatEquip, total: totalCombatEquip };
  let best = { name: "(none)", pct: 0, have: 0, total: totalCombatEquip };

  const gearRows = [];
  for (const { name, m } of members) {
    const owned = new Set([...(m.upgrades || []), ...(m.augmentations || [])]);

    let have = 0;
    for (const e of combatEquip) if (owned.has(e.name)) have++;

    const pct = totalCombatEquip > 0 ? have / totalCombatEquip : 1;
    avgPct += pct;

    if (pct < worst.pct) worst = { name, pct, have, total: totalCombatEquip };
    if (pct > best.pct) best = { name, pct, have, total: totalCombatEquip };

    gearRows.push({
      name,
      pct,
      have,
      total: totalCombatEquip,
      upgrades: (m.upgrades || []).length,
      augs: (m.augmentations || []).length,
    });
  }

  avgPct = members.length ? (avgPct / members.length) : 1;

  // Territory / clash table
  const otherInfo = ns.gang.getOtherGangInformation();
  const gangs = [];
  const chances = [];

  for (const gangName of Object.keys(otherInfo)) {
    const info = otherInfo[gangName];
    const chance = safeChance(ns, gangName);

    const isUs = gangName === g.faction;
    gangs.push({
      name: gangName,
      territory: info.territory ?? 0,
      power: info.power ?? 0,
      chance,
      isUs,
    });

    // Exclude self from summary stats (self is always 50%)
    if (!isUs && Number.isFinite(chance)) chances.push(chance);
  }

  gangs.sort((a, b) => (b.territory - a.territory) || a.name.localeCompare(b.name));

  chances.sort((a, b) => a - b);
  const clashBest = chances.length ? chances[chances.length - 1] : 0;
  const clashWorst = chances.length ? chances[0] : 0;
  const clashMedian = chances.length ? chances[Math.floor(chances.length / 2)] : 0;

  const gte62 = chances.filter((c) => c >= 0.62).length;

  return {
    gang: {
      faction: g.faction,
      type: g.isHacking ? "HACKING" : "COMBAT",
      territory: g.territory,
      power: g.power,
      warfare: g.territoryWarfareEngaged,
      wantedPenalty: g.wantedPenalty,
      wantedLevel: g.wantedLevel,
      respect: g.respect,
      moneyGainRate: g.moneyGainRate,
      respectGainRate: g.respectGainRate,
      wantedGainRate: g.wantedGainRate,
    },
    members,
    tasks,
    equip: {
      totalCombatEquip,
      avgPct,
      worst,
      best,
      gearRows,
    },
    territory: {
      gangs,
      clashBest,
      clashMedian,
      clashWorst,
      gte62,
      n: chances.length,
    },
  };
}

function safeChance(ns, gangName) {
  try {
    const c = ns.gang.getChanceToWinClash(gangName);
    return Number.isFinite(c) ? c : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Rendering (asset-ui style)
// ---------------------------------------------------------------------------

function render(ns, s) {
  ns.clearLog();

  ns.print("============================================================");
  ns.print("GANG DASHBOARD (AUTOMATIC)");
  ns.print("============================================================");

  ns.print(`Type: ${s.gang.type} | Faction: ${s.gang.faction}`);
  ns.print(
    `Territory: ${fmtPct(s.gang.territory)} | Power: ${fmtNumber(ns, s.gang.power)} | Warfare: ${s.gang.warfare ? "ON" : "OFF"}`
  );
  ns.print(
    `Wanted Penalty: ${fmtPct(s.gang.wantedPenalty)} | Wanted: ${fmtNumber(ns, s.gang.wantedLevel)} | Respect: ${fmtNumber(ns, s.gang.respect)}`
  );

  ns.print("------------------------------------------------------------");
  ns.print(
    `Rates: ${fmtMoney(ns, s.gang.moneyGainRate)}/s | ` +
    `+${fmtNumber(ns, s.gang.respectGainRate)}/s rep | ` +
    `+${fmtNumber(ns, s.gang.wantedGainRate)}/s wanted`
  );

  ns.print("============================================================");
  ns.print("");

  // Task distribution
  ns.print("Task Distribution");
  ns.print("------------------------------------------------------------");
  ns.print(formatTaskLine(s.tasks));
  ns.print("");

  // Equipment coverage
  ns.print("Equipment Coverage (combat-stat gear)");
  ns.print("------------------------------------------------------------");
  if (s.equip.totalCombatEquip <= 0) {
    ns.print("(No combat gear items detected.)");
  } else {
    ns.print(
      `Items considered: ${s.equip.totalCombatEquip} | ` +
      `Avg: ${fmtPct(s.equip.avgPct)} | ` +
      `Worst: ${s.equip.worst.name} ${fmtPct(s.equip.worst.pct)} (${s.equip.worst.have}/${s.equip.worst.total}) | ` +
      `Best: ${s.equip.best.name} ${fmtPct(s.equip.best.pct)} (${s.equip.best.have}/${s.equip.best.total})`
    );
  }
  ns.print("");

  // Territory / clashes
  ns.print("Territory / Clash Chances");
  ns.print("------------------------------------------------------------");
  ns.print(
    `Clash chances (vs others): best=${fmtPct(s.territory.clashBest)} ` +
    `median=${fmtPct(s.territory.clashMedian)} ` +
    `worst=${fmtPct(s.territory.clashWorst)} | ` +
    `gte62=${s.territory.gte62}/${s.territory.n}`
  );
  ns.print("");

  for (const r of s.territory.gangs) {
    ns.print(
      `${r.isUs ? "* " : "  "}${padRight(r.name, 18)} ` +
      `terr=${padLeft(fmtPct(r.territory), 7)} ` +
      `power=${padLeft(fmtNumber(ns, r.power), 9)} ` +
      `win=${padLeft(fmtPct(r.chance), 7)}`
    );
  }

  ns.print("");
  ns.print("* = your gang");
  ns.print("");

  // Members table (compact)
  ns.print("Members (power desc)");
  ns.print("------------------------------------------------------------");
  ns.print(
    `${padRight("name", 12)} ${padRight("task", 20)} ` +
    `${padLeft("str", 6)} ${padLeft("def", 6)} ${padLeft("dex", 6)} ${padLeft("agi", 6)} ` +
    `${padLeft("minC", 6)} ${padLeft("rep", 8)} ${padLeft("up/aug", 7)}`
  );

  for (const r of s.members) {
    const up = (r.m.upgrades || []).length;
    const aug = (r.m.augmentations || []).length;

    ns.print(
      `${padRight(r.name, 12)} ${padRight(trimMid(r.m.task || "(none)", 20), 20)} ` +
      `${padLeft(String(Math.floor(r.m.str)), 6)} ${padLeft(String(Math.floor(r.m.def)), 6)} ` +
      `${padLeft(String(Math.floor(r.m.dex)), 6)} ${padLeft(String(Math.floor(r.m.agi)), 6)} ` +
      `${padLeft(String(Math.floor(r.minC)), 6)} ${padLeft(fmtShort(r.m.earnedRespect), 8)} ` +
      `${padLeft(`${up}/${aug}`, 7)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers / formatting
// ---------------------------------------------------------------------------

function formatTaskLine(tasks) {
  // "Territory Warfare:11 | Human Trafficking:1 | ..."
  const entries = [...tasks.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`);
  return entries.length ? entries.join(" | ") : "(none)";
}

function fmtPct(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return "n/a";
  return (v * 100).toFixed(1) + "%";
}

function fmtMoney(ns, v) {
  if (!Number.isFinite(v)) return "n/a";
  if (typeof ns.formatMoney === "function") return ns.formatMoney(v);
  return `$${ns.formatNumber(v)}`;
}

function fmtNumber(ns, v) {
  if (!Number.isFinite(v)) return "n/a";
  if (typeof ns.formatNumber === "function") return ns.formatNumber(v, 2);
  return String(v);
}

function fmtShort(n) {
  if (!Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "t";
  if (abs >= 1e9)  return (n / 1e9).toFixed(2) + "b";
  if (abs >= 1e6)  return (n / 1e6).toFixed(2) + "m";
  if (abs >= 1e3)  return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(0);
}

function padRight(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function padLeft(s, n) {
  s = String(s);
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function trimMid(s, n) {
  s = String(s);
  if (s.length <= n) return s;
  if (n <= 3) return s.slice(0, n);
  const left = Math.floor((n - 3) / 2);
  const right = n - 3 - left;
  return s.slice(0, left) + "..." + s.slice(s.length - right);
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
gang/gang-ui.js
Description:
  Always-on gang dashboard (live tail).
  Shows territory + clash chances, gear coverage, task distribution, and members.

Usage:
  run gang/gang-ui.js [--help] [--interval 3000]

Notes:
  - Opens a tail window automatically.
  - Read-only; does not change warfare or member tasks.
  - "win" is the chance to win a territory clash vs that gang.
`);
}
