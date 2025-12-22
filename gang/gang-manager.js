/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["tail", false],
    ["tick", 2000],

    // Logging
    ["logMode", "changes"], // changes | always | silent
    ["showRoster", true],

    // Equipment buying
    ["buyEquip", true],
    ["equipBudget", 0.03],  // fraction of available money allowed per tick
    ["equipMinCash", 1e9],  // don't buy unless player has at least this much cash
  ]);

  if (flags.help) return printHelp(ns);
  if (flags.tail) ns.tail();

  // QoL: reduce tail spam
  ns.disableLog("sleep");
  ns.disableLog("getServerMoneyAvailable");
  ns.disableLog("gang.setMemberTask");

  if (!ns.gang.inGang()) {
    ns.tprint("ERROR: You are not in a gang.");
    return;
  }

  // --- INTERNAL POLICY (minimal flags) ---
  const cfg = {
    tick: Number(flags.tick),

    // Your requirement
    targetPenalty: 0.995,     // 99.5%
    penaltyBuffer: 0.0004,    // exit recovery at target + buffer to avoid flapping

    // Training hysteresis
    minTrain: 200,
    trainHysteresis: 50,

    // Tasks
    moneyTask: "Human Trafficking",
    respectTask: "Mug People",
    trainTask: "Train Combat",
    vigilanteTask: "Vigilante Justice",

    // Recovery controller (internal)
    vigiMinFrac: 0.10,
    vigiMaxFrac: 0.80,
    vigiK: 40,

    // NORMAL: be money-forward unless REALLY close to the line
    normalRespectMin: 0.08,
    normalRespectMax: 0.45,

    // If headroom >= 0.20% (0.0020), go low-respect.
    normalHeadroomHi: 0.0020,
    // If headroom <= 0.03% (0.0003), go high-respect.
    normalHeadroomLo: 0.0003,

    // Recovery: respect-heavy while recovering
    recoveryRespectShare: 0.65,

    // Safety
    disableWarfare: true,

    // Naming
    recruitPrefix: "g",

    // Logging
    logMode: String(flags.logMode),
    showRoster: Boolean(flags.showRoster),

    // Equipment
    buyEquip: Boolean(flags.buyEquip),
    equipBudget: Number(flags.equipBudget),
    equipMinCash: Number(flags.equipMinCash),

    // Pace equipment
    equipMaxPurchasesPerTick: 1,
    equipMaxSpendPerMin: 250e6, // $250m/min max (adaptive throttle)
  };

  /** @type {Map<string, {task: string, tier: string}>} */
  const lastMemberState = new Map();
  let lastSummary = "";

  // Latch so we don’t flap at exactly 99.50%
  let recovery = false;

  // Equipment state (round-robin + spend window)
  let equipState = {
    cursor: 0,
    spendWindowStart: 0,
    spentThisWindow: 0,
  };

  while (true) {
    try {
      const g = ns.gang.getGangInformation();

      // Always keep warfare off
      if (cfg.disableWarfare && g.territoryWarfareEngaged) {
        ns.gang.setTerritoryWarfare(false);
        log(ns, cfg, `[gang] warfare disabled`);
      }

      // Recruit
      const recruited = recruitAll(ns, cfg.recruitPrefix);
      for (const name of recruited) log(ns, cfg, `[gang] recruited ${name}`);

      const names = ns.gang.getMemberNames();

      // Simple ascension (kept internal)
      const ascended = maybeAscendCombat(ns, names, 1.55);
      for (const { name, best } of ascended) {
        log(ns, cfg, `[gang] ascended ${name} (best mult gain ~${best.toFixed(2)})`);
      }

      // Recovery latch
      if (!recovery) {
        if (g.wantedPenalty < cfg.targetPenalty) recovery = true;
      } else {
        if (g.wantedPenalty >= (cfg.targetPenalty + cfg.penaltyBuffer)) recovery = false;
      }

      const penaltyGap = Math.max(0, cfg.targetPenalty - g.wantedPenalty);
      const headroom = Math.max(0, g.wantedPenalty - cfg.targetPenalty);

      // How many vigilantes do we need? (only during recovery)
      let vigiFrac = 0;
      if (recovery) {
        vigiFrac = clamp(cfg.vigiMinFrac, cfg.vigiMinFrac + penaltyGap * cfg.vigiK, cfg.vigiMaxFrac);
      }

      // Adaptive respect share:
      // - recovery: fixed higher respect share
      // - normal: interpolate based on headroom (closer to threshold => more respect)
      let respectShare = cfg.normalRespectMin;
      if (recovery) {
        respectShare = cfg.recoveryRespectShare;
      } else {
        // map headroom in [Lo..Hi] to t in [1..0]
        const denom = (cfg.normalHeadroomHi - cfg.normalHeadroomLo);
        const t = denom <= 0 ? 0 : clamp01((cfg.normalHeadroomHi - headroom) / denom);
        respectShare = lerp(cfg.normalRespectMin, cfg.normalRespectMax, t);
      }

      const decision = assignCombatTasksAndTiers(ns, names, cfg, {
        recovery,
        vigiFrac,
        respectShare,
      });

      // Equipment buying (fair + paced + spend governor)
      equipState = buyEquipmentForGangRoundRobin(ns, decision, cfg, equipState);

      // Log member changes
      const changes = diffMemberState(decision.memberStates, lastMemberState);
      for (const line of changes) log(ns, cfg, line);

      // Summary
      const g2 = ns.gang.getGangInformation();
      const summary =
        `[gang] mode=${decision.mode} ` +
        `TRAINEE=${decision.counts.TRAINEE} ` +
        `EARNER=${decision.counts.EARNER} ` +
        `VIGILANTE=${decision.counts.VIGILANTE} ` +
        `| wantedPenalty=${(g2.wantedPenalty * 100).toFixed(2)}% ` +
        `wanted=${g2.wantedLevel.toFixed(0)} ` +
        `| territory=${(g2.territory * 100).toFixed(2)}%`;

      if (cfg.logMode === "always") {
        ns.print(summary);
      } else if (cfg.logMode === "changes") {
        if (summary !== lastSummary) ns.print(summary);
      }
      lastSummary = summary;

      if (cfg.showRoster && (cfg.logMode === "always" || changes.length > 0)) {
        printRoster(ns, decision);
      }
    } catch (err) {
      ns.print(`ERROR: ${String(err)}`);
    }

    await ns.sleep(cfg.tick);
  }
}

/** Recruit using prefix g01, g02... without touching existing names. Returns list of new names. */
function recruitAll(ns, prefix) {
  const recruited = [];
  const existing = new Set(ns.gang.getMemberNames());
  let i = 1;

  const nextName = () => {
    while (true) {
      const name = `${prefix}${String(i).padStart(2, "0")}`;
      i++;
      if (!existing.has(name)) return name;
    }
  };

  while (ns.gang.canRecruitMember()) {
    const name = nextName();
    if (!ns.gang.recruitMember(name)) break;
    existing.add(name);
    recruited.push(name);
  }
  return recruited;
}

/**
 * Ascend if *combat* multiplier gain is big enough.
 * Returns list of ascended {name, best}.
 */
function maybeAscendCombat(ns, names, ascendMult) {
  const ascended = [];
  for (const n of names) {
    const asc = ns.gang.getAscensionResult(n);
    if (!asc) continue;

    const best = Math.max(asc.str ?? 1, asc.def ?? 1, asc.dex ?? 1, asc.agi ?? 1);
    if (best >= ascendMult) {
      ns.gang.ascendMember(n);
      ascended.push({ name: n, best });
    }
  }
  return ascended;
}

/**
 * Adaptive assignment:
 * - trainees train (hysteresis)
 * - if recovery: assign some vigilantes (WEAKEST first so best earners keep earning)
 * - earners: strongest -> moneyTask, weakest subset -> respectTask (per respectShare)
 */
function assignCombatTasksAndTiers(ns, names, cfg, control) {
  const members = names.map((name) => {
    const m = ns.gang.getMemberInformation(name);
    const minCombat = Math.min(m.str, m.def, m.dex, m.agi);
    const power = m.str + m.def + m.dex + m.agi;
    return { name, minCombat, power };
  });

  const strongestFirst = [...members].sort((a, b) => b.power - a.power);
  const weakestFirst = [...members].sort((a, b) => a.power - b.power);

  /** @type {Map<string, {task: string, tier: string}>} */
  const memberStates = new Map();
  const counts = { TRAINEE: 0, EARNER: 0, VIGILANTE: 0 };
  const roster = { TRAINEE: [], EARNER: [], VIGILANTE: [] };

  // Training hysteresis thresholds
  const trainOn = cfg.minTrain;
  const trainOff = cfg.minTrain + cfg.trainHysteresis;

  const trainees = new Set();
  for (const { name, minCombat } of weakestFirst) {
    const currentTask = ns.gang.getMemberInformation(name).task;
    const isTrainingNow = currentTask === cfg.trainTask;
    const shouldTrain = isTrainingNow ? (minCombat < trainOff) : (minCombat < trainOn);
    if (shouldTrain) trainees.add(name);
  }

  for (const n of trainees) {
    setTask(ns, n, cfg.trainTask);
    memberStates.set(n, { task: cfg.trainTask, tier: "TRAINEE" });
    counts.TRAINEE++;
    roster.TRAINEE.push(n);
  }

  const pool = strongestFirst.filter(({ name }) => !trainees.has(name));

  // Vigilantes from WEAKEST of pool (so top earners keep earning)
  let vigiNeeded = 0;
  if (control.recovery) {
    vigiNeeded = Math.floor(pool.length * control.vigiFrac);
    vigiNeeded = Math.max(0, Math.min(pool.length, vigiNeeded));
  }

  const poolWeakestFirst = [...pool].sort((a, b) => a.power - b.power);
  const vigilantes = new Set(poolWeakestFirst.slice(0, vigiNeeded).map(x => x.name));

  for (const n of vigilantes) {
    setTask(ns, n, cfg.vigilanteTask);
    memberStates.set(n, { task: cfg.vigilanteTask, tier: "VIGILANTE" });
    counts.VIGILANTE++;
    roster.VIGILANTE.push(n);
  }

  const earners = pool.filter(x => !vigilantes.has(x.name)); // still strongest-first

  const respectCount = Math.max(0, Math.floor(earners.length * control.respectShare));

  // Put respect-task on the weakest subset among earners.
  const earnersWeakestFirst = [...earners].sort((a, b) => a.power - b.power);
  const respectSet = new Set(earnersWeakestFirst.slice(0, respectCount).map(x => x.name));

  for (const { name } of earners) {
    const task = respectSet.has(name) ? cfg.respectTask : cfg.moneyTask;
    setTask(ns, name, task);
    memberStates.set(name, { task, tier: "EARNER" });
    counts.EARNER++;
    roster.EARNER.push(name);
  }

  roster.TRAINEE.sort((a, b) => a.localeCompare(b));
  roster.EARNER.sort((a, b) => a.localeCompare(b));
  roster.VIGILANTE.sort((a, b) => a.localeCompare(b));

  const mode = control.recovery
    ? `RECOVERY(v=${counts.VIGILANTE},rs=${control.respectShare.toFixed(2)})`
    : `NORMAL(rs=${control.respectShare.toFixed(2)})`;

  return { memberStates, counts, roster, mode };
}

function setTask(ns, memberName, taskName) {
  const m = ns.gang.getMemberInformation(memberName);
  if (m.task === taskName) return;
  ns.gang.setMemberTask(memberName, taskName);
}

/**
 * Equipment buying: fair + paced (round-robin across members) + spend-per-minute governor.
 * Returns updated state object.
 */
function buyEquipmentForGangRoundRobin(ns, decision, cfg, state) {
  if (!cfg.buyEquip) return state;

  const now = Date.now();
  if (state.spendWindowStart === 0) state.spendWindowStart = now;

  // reset spend window every 60s
  if (now - state.spendWindowStart >= 60_000) {
    state.spendWindowStart = now;
    state.spentThisWindow = 0;
  }

  const cash = ns.getServerMoneyAvailable("home");
  if (cash < cfg.equipMinCash) return state;

  const budgetTick = cash * cfg.equipBudget;
  if (budgetTick <= 0) return state;

  // remaining budget in the spend window
  const budgetWindow = Math.max(0, cfg.equipMaxSpendPerMin - state.spentThisWindow);
  const budget = Math.min(budgetTick, budgetWindow);
  if (budget <= 0) return state;

  const equip = ns.gang.getEquipmentNames()
    .map(name => ({
      name,
      cost: ns.gang.getEquipmentCost(name),
      stats: ns.gang.getEquipmentStats(name) || {},
    }))
    .filter(e => e.cost > 0)
    .filter(e =>
      (e.stats.str || 0) > 0 ||
      (e.stats.def || 0) > 0 ||
      (e.stats.dex || 0) > 0 ||
      (e.stats.agi || 0) > 0
    )
    .sort((a, b) => a.cost - b.cost);

  const targets = [
    ...decision.roster.EARNER,
    ...decision.roster.VIGILANTE,
  ];
  if (!targets.length || !equip.length) return state;

  let spent = 0;
  let buys = 0;

  for (let tries = 0; tries < targets.length && buys < cfg.equipMaxPurchasesPerTick; tries++) {
    const idx = (state.cursor + tries) % targets.length;
    const member = targets[idx];

    const info = ns.gang.getMemberInformation(member);
    const owned = new Set([...(info.upgrades || []), ...(info.augmentations || [])]);

    for (const e of equip) {
      if (owned.has(e.name)) continue;
      if (spent + e.cost > budget) break;

      if (ns.gang.purchaseEquipment(member, e.name)) {
        spent += e.cost;
        buys += 1;
        ns.print(`[equip] ${member} <- ${e.name} ($${Math.round(e.cost).toLocaleString()})`);
      }
      break; // max one buy per member per tick
    }
  }

  state.spentThisWindow += spent;
  state.cursor = (state.cursor + 1) % targets.length;
  return state;
}

function diffMemberState(newStates, lastState) {
  const lines = [];
  for (const [name, now] of newStates.entries()) {
    const prev = lastState.get(name);
    if (!prev || prev.task !== now.task || prev.tier !== now.tier) {
      lines.push(`[gang] ${name} -> ${now.tier} (${now.task})`);
      lastState.set(name, { task: now.task, tier: now.tier });
    }
  }
  for (const name of [...lastState.keys()]) {
    if (!newStates.has(name)) {
      lines.push(`[gang] ${name} removed from roster`);
      lastState.delete(name);
    }
  }
  return lines;
}

function printRoster(ns, decision) {
  const maxPerLine = 6;
  const fmtTier = (tier) => {
    const names = decision.roster[tier] || [];
    if (!names.length) return `${tier}: (none)`;
    const chunks = [];
    for (let i = 0; i < names.length; i += maxPerLine) {
      chunks.push(names.slice(i, i + maxPerLine).join(", "));
    }
    return `${tier}: ${chunks.join(" | ")}`;
  };
  ns.print(fmtTier("TRAINEE"));
  ns.print(fmtTier("EARNER"));
  ns.print(fmtTier("VIGILANTE"));
}

function log(ns, cfg, line) {
  if (cfg.logMode === "silent") return;
  ns.print(line);
}

function clamp(min, x, max) {
  return Math.max(min, Math.min(max, x));
}

function clamp01(x) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
gang-manager.js
Description:
  Adaptive COMBAT gang automation with minimal flags.
  - Maintains wantedPenalty >= 99.5% automatically (recovery latch + proportional vigilantes).
  - Assigns vigilantes from the weakest members first so your strongest members keep earning.
  - Adaptive respectShare in NORMAL: as penalty approaches the threshold, it shifts some members to respectTask.
  - Buys combat equipment automatically with round-robin fairness + spend-per-minute governor.

Usage:
  run gang-manager.js [--tail]
    [--tick 2000]
    [--logMode changes|always|silent]
    [--showRoster true|false]
    [--buyEquip true|false]
    [--equipBudget 0.03]
    [--equipMinCash 1e9]
`);
}
