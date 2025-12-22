/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["tail", false],

    // Output controls
    ["sort", "power"],            // name | task | respect | min | power | str | def | dex | agi | hack | cha
    ["order", "desc"],            // asc | desc
    ["compact", false],           // compact member rows
    ["showEquip", true],          // show equipment coverage + per-member counts
    ["showEquipLists", false],    // show per-member equipment name lists (long)
    ["showOtherGangs", true],     // show other gangs + clash chance table
    ["showTasks", true],          // show task distribution summary
    ["showAsc", true],            // show ascension suggestions
    ["ascMin", 1.55],             // suggest ascend if best combat mult >= this
    ["trainMin", 0],              // highlight if min combat < this (0 disables)
    ["lines", 40],                // clamp long lists (0 disables)
  ]);

  if (flags.help) return printHelp(ns);
  if (flags.tail) ns.tail();

  if (!ns.gang.inGang()) {
    ns.tprint("ERROR: You are not in a gang.");
    return;
  }

  const cfg = {
    sort: String(flags.sort),
    order: String(flags.order).toLowerCase() === "asc" ? "asc" : "desc",
    compact: Boolean(flags.compact),
    showEquip: Boolean(flags.showEquip),
    showEquipLists: Boolean(flags.showEquipLists),
    showOtherGangs: Boolean(flags.showOtherGangs),
    showTasks: Boolean(flags.showTasks),
    showAsc: Boolean(flags.showAsc),
    ascMin: Number(flags.ascMin),
    trainMin: Number(flags.trainMin),
    lines: Math.max(0, Number(flags.lines) | 0),
  };

  const g = ns.gang.getGangInformation();
  const isCombat = !g.isHacking;

  // ---- Collect members ----
  const members = ns.gang.getMemberNames().map((name) => {
    const m = ns.gang.getMemberInformation(name);
    const asc = ns.gang.getAscensionResult(name);
    const minCombat = Math.min(m.str, m.def, m.dex, m.agi);
    const sumCombat = (m.str + m.def + m.dex + m.agi);
    const equipCount = (m.upgrades?.length ?? 0) + (m.augmentations?.length ?? 0);

    // "Member power" proxy for sorting/at-a-glance (not gang power)
    // - For combat gangs: sumCombat is a good proxy
    // - For hacking gangs: hack+cha often matter depending on task, but keep consistent
    const proxyPower = isCombat ? sumCombat : (m.hack + m.cha);

    // Asc suggestion score
    const ascBestCombat = asc
      ? Math.max(asc.str ?? 1, asc.def ?? 1, asc.dex ?? 1, asc.agi ?? 1)
      : 0;

    return {
      name,
      m,
      asc,
      minCombat,
      sumCombat,
      proxyPower,
      ascBestCombat,
      equipCount,
    };
  });

  // ---- Sort members ----
  const dir = cfg.order === "asc" ? 1 : -1;
  const key = cfg.sort;
  members.sort((a, b) => {
    const cmpNum = (x, y) => (x === y ? 0 : (x < y ? -1 : 1));
    const cmpStr = (x, y) => String(x ?? "").localeCompare(String(y ?? ""));
    switch (key) {
      case "name": return cmpStr(a.name, b.name);
      case "task": return cmpStr(a.m.task, b.m.task);
      case "respect": return dir * cmpNum(a.m.earnedRespect, b.m.earnedRespect);
      case "min": return dir * cmpNum(a.minCombat, b.minCombat);
      case "power": return dir * cmpNum(a.proxyPower, b.proxyPower);
      case "str": return dir * cmpNum(a.m.str, b.m.str);
      case "def": return dir * cmpNum(a.m.def, b.m.def);
      case "dex": return dir * cmpNum(a.m.dex, b.m.dex);
      case "agi": return dir * cmpNum(a.m.agi, b.m.agi);
      case "hack": return dir * cmpNum(a.m.hack, b.m.hack);
      case "cha": return dir * cmpNum(a.m.cha, b.m.cha);
      default: return dir * cmpNum(a.proxyPower, b.proxyPower);
    }
  });

  // ---- Header ----
  ns.tprint("=== GANG REVIEW (ONE-SHOT) ===");
  ns.tprint(`Type: ${g.isHacking ? "HACKING" : "COMBAT"} | Faction: ${g.faction}`);
  ns.tprint(
    `Territory: ${(g.territory * 100).toFixed(2)}% | Power: ${fmt(g.power)} | Warfare: ${g.territoryWarfareEngaged ? "ON" : "OFF"}`
  );
  ns.tprint(
    `Respect: ${fmt(g.respect)} | Wanted: ${fmt(g.wantedLevel)} | Wanted Penalty: ${(g.wantedPenalty * 100).toFixed(2)}%`
  );
  ns.tprint(
    `Rates: $${fmt(g.moneyGainRate)}/s | +${fmt(g.respectGainRate)} rep/s | +${fmt(g.wantedGainRate)} wanted/s`
  );

  // Quick “health” hints
  const hints = [];
  if (g.wantedPenalty < 0.995) hints.push(`wantedPenalty low (${(g.wantedPenalty * 100).toFixed(2)}%) -> add Vigilante`);
  if (g.territory < 0.20) hints.push(`low territory (${(g.territory * 100).toFixed(1)}%) -> build power / gear / TW`);
  if (members.length < 12) hints.push(`not full roster (${members.length}/12) -> recruit more`);
  if (!hints.length) hints.push("status OK");
  ns.tprint(`Hints: ${hints.join(" | ")}`);
  ns.tprint("");

  // ---- Task distribution ----
  if (cfg.showTasks) {
    const taskCounts = new Map();
    for (const x of members) {
      const t = x.m.task || "(none)";
      taskCounts.set(t, (taskCounts.get(t) ?? 0) + 1);
    }
    const items = [...taskCounts.entries()].sort((a, b) => b[1] - a[1]);
    ns.tprint("Task distribution:");
    ns.tprint(items.map(([t, c]) => `${t}:${c}`).join(" | ") || "(none)");
    ns.tprint("");
  }

  // ---- Equipment coverage ----
  if (cfg.showEquip) {
    const equipNames = ns.gang.getEquipmentNames();
    const combatEquip = equipNames
      .map((name) => ({ name, stats: ns.gang.getEquipmentStats(name) || {} }))
      .filter((e) => (e.stats.str || 0) > 0 || (e.stats.def || 0) > 0 || (e.stats.dex || 0) > 0 || (e.stats.agi || 0) > 0);

    const totalCombatEquip = combatEquip.length;
    const cover = members.map((x) => {
      const owned = new Set([...(x.m.upgrades || []), ...(x.m.augmentations || [])]);
      let have = 0;
      for (const e of combatEquip) if (owned.has(e.name)) have++;
      const pct = totalCombatEquip > 0 ? (have / totalCombatEquip) : 1;
      return { name: x.name, have, total: totalCombatEquip, pct, up: x.m.upgrades?.length ?? 0, aug: x.m.augmentations?.length ?? 0 };
    });

    cover.sort((a, b) => a.pct - b.pct);

    const avgPct = cover.length ? cover.reduce((s, r) => s + r.pct, 0) / cover.length : 1;
    const worst = cover[0];
    const best = cover[cover.length - 1];

    ns.tprint("Equipment (combat-stat gear) coverage:");
    ns.tprint(
      `  Items considered: ${totalCombatEquip} | Avg: ${(avgPct * 100).toFixed(1)}% | Worst: ${worst ? `${worst.name} ${(worst.pct * 100).toFixed(1)}%` : "n/a"} | Best: ${best ? `${best.name} ${(best.pct * 100).toFixed(1)}%` : "n/a"}`
    );

    // Optional per-member counts
    const maxLines = clampLines(cfg.lines, cover.length);
    for (let i = 0; i < maxLines; i++) {
      const r = cover[i];
      ns.tprint(`  - ${r.name}: ${(r.pct * 100).toFixed(1)}% (${r.have}/${r.total}) | upgrades=${r.up} augs=${r.aug}`);
    }
    if (cfg.lines > 0 && cover.length > maxLines) ns.tprint(`  ... (${cover.length - maxLines} more)`);

    if (cfg.showEquipLists) {
      ns.tprint("");
      ns.tprint("Equipment lists (per member):");
      const maxLines2 = clampLines(cfg.lines, members.length);
      for (let i = 0; i < maxLines2; i++) {
        const x = members[i];
        const ups = x.m.upgrades || [];
        const augs = x.m.augmentations || [];
        ns.tprint(`  - ${x.name}:`);
        ns.tprint(`     upgrades: ${ups.length ? ups.join(", ") : "(none)"}`);
        ns.tprint(`     augs:     ${augs.length ? augs.join(", ") : "(none)"}`);
      }
      if (cfg.lines > 0 && members.length > maxLines2) ns.tprint(`  ... (${members.length - maxLines2} more)`);
    }

    ns.tprint("");
  }

  // ---- Other gangs / clash chance ----
  if (cfg.showOtherGangs) {
    const others = ns.gang.getOtherGangInformation();
    const rows = [];
    for (const name of Object.keys(others)) {
      const info = others[name];
      const chance = ns.gang.getChanceToWinClash(name);
      rows.push({
        name,
        power: info.power,
        territory: info.territory,
        chance,
      });
    }
    rows.sort((a, b) => (b.territory - a.territory) || (b.power - a.power));

    const chances = rows.map(r => r.chance).filter(Number.isFinite).sort((a, b) => a - b);
    const median = chances.length ? chances[Math.floor(chances.length / 2)] : 0;
    const bestChance = chances.length ? chances[chances.length - 1] : 0;
    const worstChance = chances.length ? chances[0] : 0;

    ns.tprint("Other gangs (by territory):");
    ns.tprint(`  Clash chances: best=${(bestChance * 100).toFixed(1)}% median=${(median * 100).toFixed(1)}% worst=${(worstChance * 100).toFixed(1)}%`);
    const maxLines = clampLines(cfg.lines, rows.length);
    for (let i = 0; i < maxLines; i++) {
      const r = rows[i];
      ns.tprint(
        `  - ${padRight(r.name, 18)} | power=${padLeft(fmt(r.power), 8)} | terr=${padLeft((r.territory * 100).toFixed(3) + "%", 9)} | win=${padLeft((r.chance * 100).toFixed(3) + "%", 9)}`
      );
    }
    if (cfg.lines > 0 && rows.length > maxLines) ns.tprint(`  ... (${rows.length - maxLines} more)`);
    ns.tprint("");
  }

  // ---- Members table ----
  ns.tprint(`Members (${members.length}) [sort=${cfg.sort} ${cfg.order}]:`);

  // Column headers
  if (cfg.compact) {
    ns.tprint(`  name           task                     minC  sumC   rep      eq  ascBest`);
  } else {
    ns.tprint(`  name           task                     str    def    dex    agi    minC  rep      up/aug  ascBest  hack  cha`);
  }

  const maxLines = clampLines(cfg.lines, members.length);
  for (let i = 0; i < maxLines; i++) {
    const x = members[i];
    const m = x.m;

    const warnTrain = (cfg.trainMin > 0 && x.minCombat < cfg.trainMin) ? "!" : " ";
    const rep = fmt(m.earnedRespect);
    const ascBest = x.asc ? x.ascBestCombat.toFixed(2) : "n/a";
    const up = (m.upgrades?.length ?? 0);
    const aug = (m.augmentations?.length ?? 0);

    if (cfg.compact) {
      ns.tprint(
        ` ${warnTrain} ${padRight(x.name, 13)} ${padRight((m.task || "(none)"), 24)} ` +
        `${padLeft(String(x.minCombat | 0), 4)}  ${padLeft(String(x.sumCombat | 0), 5)}  ${padLeft(rep, 8)}  ` +
        `${padLeft(String(x.equipCount), 2)}  ${padLeft(ascBest, 7)}`
      );
    } else {
      ns.tprint(
        ` ${warnTrain} ${padRight(x.name, 13)} ${padRight((m.task || "(none)"), 24)} ` +
        `${padLeft(String(m.str | 0), 5)} ${padLeft(String(m.def | 0), 5)} ${padLeft(String(m.dex | 0), 5)} ${padLeft(String(m.agi | 0), 5)} ` +
        `${padLeft(String(x.minCombat | 0), 5)} ${padLeft(rep, 8)} ` +
        `${padLeft(`${up}/${aug}`, 7)} ${padLeft(ascBest, 7)} ` +
        `${padLeft(String(m.hack | 0), 4)} ${padLeft(String(m.cha | 0), 4)}`
      );
    }
  }
  if (cfg.lines > 0 && members.length > maxLines) ns.tprint(`  ... (${members.length - maxLines} more)`);
  ns.tprint("");

  // ---- Ascension suggestions ----
  if (cfg.showAsc) {
    const ascList = members
      .filter(x => x.asc && x.ascBestCombat >= cfg.ascMin)
      .sort((a, b) => (b.ascBestCombat - a.ascBestCombat) || a.name.localeCompare(b.name));

    ns.tprint(`Ascension suggestions (best combat >= ${cfg.ascMin.toFixed(2)}): ${ascList.length}`);
    if (!ascList.length) {
      ns.tprint("  (none)");
    } else {
      const maxLinesA = clampLines(cfg.lines, ascList.length);
      for (let i = 0; i < maxLinesA; i++) {
        const x = ascList[i];
        ns.tprint(`  - ${padRight(x.name, 13)} bestCombat=${x.ascBestCombat.toFixed(2)} | task=${x.m.task || "(none)"}`);
      }
      if (cfg.lines > 0 && ascList.length > maxLinesA) ns.tprint(`  ... (${ascList.length - maxLinesA} more)`);
    }
    ns.tprint("");
  }
}

function fmt(n) {
  if (n === undefined || n === null) return "n/a";
  if (n === Infinity) return "∞";
  if (typeof n !== "number") return String(n);

  const abs = Math.abs(n);
  if (abs >= 1e15) return (n / 1e15).toFixed(2) + "q";
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "t";
  if (abs >= 1e9)  return (n / 1e9).toFixed(2) + "b";
  if (abs >= 1e6)  return (n / 1e6).toFixed(2) + "m";
  if (abs >= 1e3)  return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(2);
}

function padRight(s, n) {
  s = String(s ?? "");
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

function padLeft(s, n) {
  s = String(s ?? "");
  if (s.length >= n) return s.slice(0, n);
  return " ".repeat(n - s.length) + s;
}

function clampLines(maxLines, actual) {
  if (!maxLines || maxLines <= 0) return actual;
  return Math.min(maxLines, actual);
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
gang-review.js
Description:
  Prints a one-shot "at a glance" gang snapshot:
  - Gang header: type, faction, territory, power, wanted penalty, and rates
  - Task distribution
  - Equipment coverage (combat-stat gear) summary + per-member counts
  - Other gangs: power/territory + clash win chances (best/median/worst)
  - Member table (compact or full)
  - Ascension suggestions by best combat multiplier gain

Usage:
  run gang-review.js [options]

Options:
  --tail
    Open a tail window for easier reading (still one-shot output)

  --sort name|task|respect|min|power|str|def|dex|agi|hack|cha
    Sort member table by the chosen key (default: power)

  --order asc|desc
    Sort direction (default: desc)

  --compact
    Use compact member rows (default: false)

  --showEquip true|false
    Show equipment coverage summary (default: true)

  --showEquipLists
    Print per-member equipment name lists (long) (default: false)

  --showOtherGangs true|false
    Show other gangs + clash chance table (default: true)

  --showTasks true|false
    Show task distribution summary (default: true)

  --showAsc true|false
    Show ascension suggestions (default: true)

  --ascMin 1.55
    Ascension suggestion threshold for best combat multiplier (default: 1.55)

  --trainMin 0
    If >0, mark members whose min(str/def/dex/agi) is below this with '!' (default: 0/off)

  --lines 40
    Clamp long sections to N lines (0 disables clamping)

Notes:
  - Read-only: makes no gang changes.
  - Equipment coverage counts only items that provide STR/DEF/DEX/AGI bonuses.
  - Clash chance stats (best/median/worst) are computed from getChanceToWinClash() across other gangs.
`);
}
