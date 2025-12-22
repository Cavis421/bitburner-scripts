/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["tail", false],
    ["sort", "name"],      // name | respect | str | hack | task
    ["showEquip", false],
  ]);

  if (flags.help) return printHelp(ns);
  if (flags.tail) ns.tail();

  if (!ns.gang.inGang()) {
    ns.tprint("ERROR: You are not in a gang.");
    return;
  }

  const g = ns.gang.getGangInformation();
  const members = ns.gang.getMemberNames().map((name) => {
    const m = ns.gang.getMemberInformation(name);
    const asc = ns.gang.getAscensionResult(name);
    return { name, m, asc };
  });

  // Sort
  members.sort((a, b) => {
    switch (flags.sort) {
      case "respect": return b.m.earnedRespect - a.m.earnedRespect;
      case "str": return b.m.str - a.m.str;
      case "hack": return b.m.hack - a.m.hack;
      case "task": return (a.m.task || "").localeCompare(b.m.task || "");
      case "name":
      default: return a.name.localeCompare(b.name);
    }
  });

  // Header
  ns.tprint("=== GANG REVIEW ===");
  ns.tprint(`Type: ${g.isHacking ? "HACKING" : "COMBAT"}`);
  ns.tprint(`Faction: ${g.faction}`);
  ns.tprint(`Territory: ${(g.territory * 100).toFixed(2)}%  | Warfare: ${g.territoryWarfareEngaged ? "ON" : "OFF"}`);
  ns.tprint(`Respect: ${fmt(g.respect)} | Wanted: ${fmt(g.wantedLevel)} | Wanted Penalty: ${(g.wantedPenalty * 100).toFixed(2)}%`);
  ns.tprint(`Money Gain Rate: ${fmt(g.moneyGainRate)}/s | Respect Gain Rate: ${fmt(g.respectGainRate)}/s | Wanted Gain Rate: ${fmt(g.wantedGainRate)}/s`);
  ns.tprint("");

  // Members
  ns.tprint(`Members (${members.length}):`);
  for (const { name, m, asc } of members) {
    const ascTxt = asc
      ? `ASC (hack ${asc.hack?.toFixed(2) ?? "?"}, str ${asc.str?.toFixed(2) ?? "?"}, def ${asc.def?.toFixed(2) ?? "?"}, dex ${asc.dex?.toFixed(2) ?? "?"}, agi ${asc.agi?.toFixed(2) ?? "?"}, cha ${asc.cha?.toFixed(2) ?? "?"})`
      : "ASC (n/a)";
    ns.tprint(
      `- ${name} | task="${m.task}" | rep=${fmt(m.earnedRespect)} | str=${m.str} def=${m.def} dex=${m.dex} agi=${m.agi} hack=${m.hack} cha=${m.cha} | ${ascTxt}`
    );
  }

  // Equipment summary (optional)
  if (flags.showEquip) {
    ns.tprint("");
    ns.tprint("Equipment (per member):");
    for (const { name, m } of members) {
      ns.tprint(`- ${name}: ${m.upgrades?.length ?? 0} upgrades, ${m.augmentations?.length ?? 0} augs`);
      if ((m.upgrades?.length ?? 0) > 0) ns.tprint(`   upgrades: ${m.upgrades.join(", ")}`);
      if ((m.augmentations?.length ?? 0) > 0) ns.tprint(`   augs: ${m.augmentations.join(", ")}`);
    }
  }
}

function fmt(n) {
  if (n === undefined || n === null) return "n/a";
  if (n === Infinity) return "∞";
  if (typeof n !== "number") return String(n);

  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "t";
  if (abs >= 1e9)  return (n / 1e9).toFixed(2) + "b";
  if (abs >= 1e6)  return (n / 1e6).toFixed(2) + "m";
  if (abs >= 1e3)  return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(2);
}


/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
gang-review.js
Description:
  Prints a detailed snapshot of your current gang: type, wanted penalty, territory, and per-member stats/tasks.

Usage:
  run gang-review.js [--tail] [--sort name|respect|str|hack|task] [--showEquip]

Notes:
  - Use --tail to open a live window.
  - Use --showEquip to print each member's upgrades/augmentations.
  - No changes are made to your gang; this script is read-only.
`);
}
