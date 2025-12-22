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
    ["equipBudget", 0.03],  // fraction of available money allowed per tick (NORMAL mode)
    ["equipMinCash", 1e9],  // don't buy unless player has at least this much cash (NORMAL mode)

    // Debug
    ["equipDebug", false],
  ]);

  if (flags.help) return printHelp(ns);
  if (flags.tail) ns.tail();

  // QoL: reduce tail spam
  ns.disableLog("sleep");
  ns.disableLog("getServerMoneyAvailable");
  ns.disableLog("gang.setMemberTask");
  ns.disableLog("gang.setTerritoryWarfare");

  if (!ns.gang.inGang()) {
    ns.tprint("ERROR: You are not in a gang.");
    return;
  }

  // --- INTERNAL POLICY (minimal flags) ---
  const cfg = {
    tick: Number(flags.tick),

    // Wanted control
    targetPenalty: 0.995,     // 99.5%
    penaltyBuffer: 0.0004,    // exit recovery at target + buffer

    // Training hysteresis (base; will scale dynamically)
    minTrainBase: 200,
    minTrainCap: 5000,
    trainHysteresis: 50,

    // Tasks
    moneyTask: "Human Trafficking",
    trainTask: "Train Combat",
    vigilanteTask: "Vigilante Justice",
    territoryTask: "Territory Warfare",

    // Respect task tiers (auto-upgrade by stats)
    // NOTE: We will also CAP these tiers based on wanted headroom.
    respectTiers: [
      { min: 0,    task: "Mug People" },
      { min: 200,  task: "Deal Drugs" },
      { min: 400,  task: "Strongarm Civilians" },
      { min: 600,  task: "Run a Con" },
      { min: 900,  task: "Armed Robbery" },
      { min: 1200, task: "Traffick Illegal Arms" },
      { min: 1600, task: "Threaten & Blackmail" },
      { min: 2200, task: "Human Trafficking" },
      { min: 3500, task: "Terrorism" },
    ],

    // Wanted-headroom caps for respect tiers
    respectCapsByPenalty: [
      { minPenalty: 0.9970, capTask: "Traffick Illegal Arms" },
      { minPenalty: 0.9985, capTask: "Threaten & Blackmail" },
      { minPenalty: 0.9990, capTask: "Human Trafficking" },
      { minPenalty: 0.9996, capTask: "Terrorism" },
    ],

    // Recovery controller
    vigiMinFrac: 0.10,
    vigiMaxFrac: 0.85,
    vigiK: 45,

    // NORMAL: be money-forward unless close to the line
    normalRespectMin: 0.06,
    normalRespectMax: 0.40,
    normalHeadroomHi: 0.0020,
    normalHeadroomLo: 0.0003,

    // Recovery: respect-heavy while recovering
    recoveryRespectShare: 0.55,

    // Territory / warfare control (AGGRESSIVE-ish)
    engageMedianMin: 0.55,
    disengageMedianMin: 0.47, // hysteresis
    engageAtLeastN: 3,
    engageNChanceMin: 0.62,

    // Territory assignment fractions (more aggressive)
    territoryMinFrac: 0.70,
    territoryMaxFrac: 0.95,
    territoryFracRampAt: 0.75,

    // Endgame: stop warfare and monetize
    territoryStopAt: 0.99,

    // Ascension rules
    ascendMult: 1.55,
    blockAscendWhenEngaged: true,

    // Naming
    recruitPrefix: "g",

    // Logging
    logMode: String(flags.logMode),
    showRoster: Boolean(flags.showRoster),

    // Equipment (baseline)
    buyEquip: Boolean(flags.buyEquip),
    equipBudget: Number(flags.equipBudget),
    equipMinCash: Number(flags.equipMinCash),
    equipMaxPurchasesPerTick: 3,
    equipMaxSpendPerMin: 1e9,

    // --- Equipment catch-up mode ---
    equipCatchup: true,

    // Enter catch-up if territory squad is under-geared OR anyone is under-geared
    equipCatchupTerritoryMinPct: 0.90,
    equipCatchupAnyMinPct: 0.50,

    // Catch-up overrides (temporary)
    equipCatchupMaxPurchasesPerTick: 5,
    equipCatchupMaxSpendPerMin: 10_000e6, // $10b/min during catch-up
    equipCatchupMinCash: 20e6,

    // Exit catch-up (hysteresis)
    equipCatchupExitTerritoryMinPct: 0.97,
    equipCatchupExitAnyMinPct: 0.80,

    // --- Cash farming mode (NEW) ---
    // If in catch-up and we can't afford the next missing combat item while keeping a reserve,
    // pause Territory Warfare tasks to rebuild cash.
    cashFarm: true,

    // Always keep this much cash (prevents feeling broke / starving other scripts)
    cashFarmReserve: 8e9,

    // Hysteresis around affordability to avoid flapping
    cashFarmEnterBuffer: 0.0,
    cashFarmExitBuffer: 2e9,

    // While cash-farming:
    cashFarmTerritoryFrac: 0.0,   // assign zero TW tasks
    cashFarmRespectShare: 0.02,   // minimize respect tasks, maximize money

    // Also force "clashes engaged" off while cash-farming (safer)
    cashFarmDisableClashes: true,

    // Debug
    equipDebug: Boolean(flags.equipDebug),
  };

  /** @type {Map<string, {task: string, tier: string}>} */
  const lastMemberState = new Map();
  let lastSummary = "";

  // Latches
  let recovery = false;
  let engaged = false;

  // Equipment catch-up latch
  let equipCatchup = false;

  // Cash farming latch
  let cashFarm = false;

  // Equipment state
  let equipState = {
    cursor: 0,
    spendWindowStart: 0,
    spentThisWindow: 0,
  };

  while (true) {
    try {
      const g = ns.gang.getGangInformation();

      // Recruit
      const recruited = recruitAll(ns, cfg.recruitPrefix);
      for (const name of recruited) log(ns, cfg, `[gang] recruited ${name}`);

      const names = ns.gang.getMemberNames();

      // Compute dynamic training target based on your gang’s current strength
      const dyn = computeDynamicTrainingTarget(ns, cfg, names);

      // Clash chance stats (median, count above threshold)
      const clash = getClashStats(ns, cfg);

      // Recovery latch
      if (!recovery) {
        if (g.wantedPenalty < cfg.targetPenalty) recovery = true;
      } else {
        if (g.wantedPenalty >= (cfg.targetPenalty + cfg.penaltyBuffer)) recovery = false;
      }

      // Endgame: once you basically own territory, stop warfare permanently
      const inEndgame = g.territory >= cfg.territoryStopAt;

      const penaltyGap = Math.max(0, cfg.targetPenalty - g.wantedPenalty);
      const headroom = Math.max(0, g.wantedPenalty - cfg.targetPenalty);

      // Vigilante fraction during recovery
      let vigiFrac = 0;
      if (recovery) {
        vigiFrac = clamp(cfg.vigiMinFrac, cfg.vigiMinFrac + penaltyGap * cfg.vigiK, cfg.vigiMaxFrac);
      }

      // Respect share (base)
      let respectShare = cfg.normalRespectMin;
      if (recovery) {
        respectShare = cfg.recoveryRespectShare;
      } else {
        const denom = (cfg.normalHeadroomHi - cfg.normalHeadroomLo);
        const t = denom <= 0 ? 0 : clamp01((cfg.normalHeadroomHi - headroom) / denom);
        respectShare = lerp(cfg.normalRespectMin, cfg.normalRespectMax, t);
      }

      // Territory fraction (base): ramp based on median chance
      const territoryFracBase = (inEndgame || recovery)
        ? 0
        : ramp(
            clash.median,
            cfg.engageMedianMin,
            cfg.territoryFracRampAt,
            cfg.territoryMinFrac,
            cfg.territoryMaxFrac
          );

      // --- PRELIM decision (used to evaluate gear + next-cost) ---
      const prelimDecision = assignCombatTasksAndTiers(ns, names, cfg, {
        recovery,
        vigiFrac,
        respectShare,
        territoryFrac: territoryFracBase,
        minTrain: dyn.minTrain,
        wantedPenalty: g.wantedPenalty,
      });

      // --- Equipment catch-up mode ---
      const catchupInfo = computeEquipCatchup(ns, prelimDecision, cfg);
      equipCatchup = updateCatchupLatch(equipCatchup, catchupInfo, cfg);

      // --- Cash farming mode (NEW) ---
      const cash = ns.getServerMoneyAvailable("home");
      const nextTerrCost = getNextMissingCombatEquipCost(ns, prelimDecision.roster.TERRITORY);
      const nextAnyCost = getNextMissingCombatEquipCost(ns, ns.gang.getMemberNames());
      const nextCost = Math.min(nextTerrCost, nextAnyCost);

      if (!cfg.cashFarm || recovery || inEndgame) {
        cashFarm = false;
      } else if (!cashFarm) {
        // ENTER: in catch-up + can't afford next item while maintaining reserve
        const need = cfg.cashFarmReserve + nextCost + (cfg.cashFarmEnterBuffer || 0);
        if (equipCatchup && Number.isFinite(nextCost) && cash < need) cashFarm = true;
      } else {
        // EXIT: require extra headroom
        const need = cfg.cashFarmReserve + nextCost + (cfg.cashFarmExitBuffer || 0);
        if (!equipCatchup || !Number.isFinite(nextCost) || cash >= need) cashFarm = false;
      }

      // Apply overrides when cash-farming
      const finalRespectShare = cashFarm ? cfg.cashFarmRespectShare : respectShare;
      const finalTerritoryFrac = cashFarm ? cfg.cashFarmTerritoryFrac : territoryFracBase;

      // --- FINAL decision (after cashFarm overrides) ---
      const decision = assignCombatTasksAndTiers(ns, names, cfg, {
        recovery,
        vigiFrac,
        respectShare: finalRespectShare,
        territoryFrac: finalTerritoryFrac,
        minTrain: dyn.minTrain,
        wantedPenalty: g.wantedPenalty,
      });

      // Engage/disengage logic (more aggressive than "worst chance")
      // ALSO: never engage while inEndgame, recovery, or cashFarm (if configured).
      if (inEndgame || recovery || (cashFarm && cfg.cashFarmDisableClashes)) {
        engaged = false;
      } else {
        const engageOK =
          (clash.median >= cfg.engageMedianMin) ||
          (clash.countGteNChanceMin >= cfg.engageAtLeastN);

        const disengageBad = (clash.median < cfg.disengageMedianMin);

        if (!engaged && engageOK) engaged = true;
        if (engaged && disengageBad) engaged = false;
      }

      if (g.territoryWarfareEngaged !== engaged) {
        ns.gang.setTerritoryWarfare(engaged);
        log(
          ns,
          cfg,
          `[gang] warfare ${engaged ? "ENABLED" : "disabled"} ` +
          `(median=${(clash.median * 100).toFixed(1)}%, gte${Math.round(cfg.engageNChanceMin * 100)}=${clash.countGteNChanceMin})`
        );
      }

      // Ascension (block while engaged if configured)
      if (!(cfg.blockAscendWhenEngaged && engaged)) {
        const ascended = maybeAscendCombat(ns, names, cfg.ascendMult);
        for (const { name, best } of ascended) {
          log(ns, cfg, `[gang] ascended ${name} (best mult gain ~${best.toFixed(2)})`);
        }
      }

      // Equipment buying (catch-up overrides)
      equipState = buyEquipmentForGangRoundRobin(ns, decision, cfg, equipState, equipCatchup);

      // Log member changes
      const changes = diffMemberState(decision.memberStates, lastMemberState);
      for (const line of changes) log(ns, cfg, line);

      // Summary
      const g2 = ns.gang.getGangInformation();
      const summary =
        `[gang] mode=${decision.mode}${cashFarm ? "+CASH" : ""} ` +
        `TRAINEE=${decision.counts.TRAINEE} ` +
        `TERRITORY=${decision.counts.TERRITORY} ` +
        `EARNER=${decision.counts.EARNER} ` +
        `VIGILANTE=${decision.counts.VIGILANTE} ` +
        `| medianClash=${(clash.median * 100).toFixed(1)}% gte${Math.round(cfg.engageNChanceMin * 100)}=${clash.countGteNChanceMin} engaged=${engaged ? "Y" : "N"} ` +
        `| wantedPenalty=${(g2.wantedPenalty * 100).toFixed(2)}% wanted=${g2.wantedLevel.toFixed(0)} ` +
        `| minTrain=${dyn.minTrain} ` +
        `| equipCatchup=${equipCatchup ? "Y" : "N"} terrMin=${(catchupInfo.terrMinPct * 100).toFixed(1)}% anyMin=${(catchupInfo.anyMinPct * 100).toFixed(1)}% ` +
        `| cash=$${(cash / 1e9).toFixed(2)}b next=$${Number.isFinite(nextCost) ? (nextCost / 1e9).toFixed(2) : "n/a"}b reserve=$${(cfg.cashFarmReserve / 1e9).toFixed(1)}b ` +
        `| power=${g2.power.toFixed(2)} territory=${(g2.territory * 100).toFixed(2)}%` +
        (inEndgame ? " [ENDGAME]" : "");

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
 * Dynamic training target: keep recruits "catching up" as your gang grows.
 * Uses median of members' minCombat and takes ~35% of that, bounded.
 */
function computeDynamicTrainingTarget(ns, cfg, names) {
  if (!names.length) return { minTrain: cfg.minTrainBase };

  const mins = names.map(n => {
    const m = ns.gang.getMemberInformation(n);
    return Math.min(m.str, m.def, m.dex, m.agi);
  }).sort((a, b) => a - b);

  const med = mins[Math.floor(mins.length / 2)] ?? 0;
  const scaled = Math.floor(med * 0.35);
  const minTrain = clamp(cfg.minTrainBase, scaled, cfg.minTrainCap);
  return { minTrain };
}

/**
 * Respect picker with wantedPenalty caps:
 * - Choose highest tier by minCombat
 * - Then cap to an allowed maximum tier based on current wantedPenalty
 */
function pickRespectTaskCapped(cfg, minCombat, wantedPenalty) {
  const tiers = cfg.respectTiers || [];
  let chosen = tiers.length ? tiers[0].task : "Mug People";

  for (const t of tiers) {
    if (minCombat >= t.min) chosen = t.task;
    else break;
  }

  // Determine capTask based on wantedPenalty (pick the highest cap we qualify for)
  let capTask = tiers.length ? tiers[0].task : "Mug People";
  const caps = cfg.respectCapsByPenalty || [];
  for (const c of caps) {
    if (wantedPenalty >= c.minPenalty) capTask = c.capTask;
  }

  // Enforce cap by tier order
  const order = new Map(tiers.map((t, i) => [t.task, i]));
  const chosenIdx = order.get(chosen) ?? 0;
  const capIdx = order.get(capTask) ?? 0;
  const finalIdx = Math.min(chosenIdx, capIdx);
  return tiers[finalIdx]?.task ?? chosen;
}

/**
 * Adaptive assignment:
 * - trainees train (hysteresis; dynamic minTrain)
 * - if recovery: assign some vigilantes (WEAKEST first)
 * - territory: strongest slice -> Territory Warfare (aggressive ramp)
 * - earners: remaining -> money, and weakest subset -> respect (auto-tiered + wanted-capped)
 */
function assignCombatTasksAndTiers(ns, names, cfg, control) {
  const members = names.map((name) => {
    const m = ns.gang.getMemberInformation(name);
    const minCombat = Math.min(m.str, m.def, m.dex, m.agi);
    const power = m.str + m.def + m.dex + m.agi;
    return { name, minCombat, power };
  });

  const minCombatByName = new Map(members.map(m => [m.name, m.minCombat]));
  const strongestFirst = [...members].sort((a, b) => b.power - a.power);
  const weakestFirst = [...members].sort((a, b) => a.power - b.power);

  /** @type {Map<string, {task: string, tier: string}>} */
  const memberStates = new Map();
  const counts = { TRAINEE: 0, TERRITORY: 0, EARNER: 0, VIGILANTE: 0 };
  const roster = { TRAINEE: [], TERRITORY: [], EARNER: [], VIGILANTE: [] };

  // Training hysteresis thresholds
  const trainOn = control.minTrain;
  const trainOff = control.minTrain + cfg.trainHysteresis;

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

  // Vigilantes from WEAKEST of pool
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

  const afterVigi = pool.filter(x => !vigilantes.has(x.name)); // strongest-first

  // Territory assignment: strongest slice
  const territoryCount = Math.max(0, Math.floor(afterVigi.length * (control.territoryFrac ?? 0)));
  const territorySet = new Set(afterVigi.slice(0, territoryCount).map(x => x.name));

  for (const { name } of afterVigi) {
    if (territorySet.has(name)) {
      setTask(ns, name, cfg.territoryTask);
      memberStates.set(name, { task: cfg.territoryTask, tier: "TERRITORY" });
      counts.TERRITORY++;
      roster.TERRITORY.push(name);
    }
  }

  const earners = afterVigi.filter(x => !territorySet.has(x.name));

  const respectCount = Math.max(0, Math.floor(earners.length * control.respectShare));
  const earnersWeakestFirst = [...earners].sort((a, b) => a.power - b.power);
  const respectSet = new Set(earnersWeakestFirst.slice(0, respectCount).map(x => x.name));

  for (const { name } of earners) {
    let task = cfg.moneyTask;

    if (respectSet.has(name)) {
      const minCombat = minCombatByName.get(name) ?? 0;
      task = pickRespectTaskCapped(cfg, minCombat, control.wantedPenalty ?? 1);
    }

    setTask(ns, name, task);
    memberStates.set(name, { task, tier: "EARNER" });
    counts.EARNER++;
    roster.EARNER.push(name);
  }

  roster.TRAINEE.sort((a, b) => a.localeCompare(b));
  roster.TERRITORY.sort((a, b) => a.localeCompare(b));
  roster.EARNER.sort((a, b) => a.localeCompare(b));
  roster.VIGILANTE.sort((a, b) => a.localeCompare(b));

  const mode = control.recovery
    ? `RECOVERY(v=${counts.VIGILANTE},rs=${control.respectShare.toFixed(2)})`
    : `NORMAL(tw=${counts.TERRITORY},rs=${control.respectShare.toFixed(2)})`;

  return { memberStates, counts, roster, mode };
}

function setTask(ns, memberName, taskName) {
  const m = ns.gang.getMemberInformation(memberName);
  if (m.task === taskName) return;
  ns.gang.setMemberTask(memberName, taskName);
}

/**
 * Returns clash stats across gangs:
 * - median chance
 * - count of gangs >= cfg.engageNChanceMin
 */
function getClashStats(ns, cfg) {
  const others = ns.gang.getOtherGangInformation();
  const chances = [];

  for (const name of Object.keys(others)) {
    const c = ns.gang.getChanceToWinClash(name);
    if (Number.isFinite(c)) chances.push(c);
  }

  chances.sort((a, b) => a - b);

  const median = chances.length
    ? chances[Math.floor(chances.length / 2)]
    : 0;

  const countGteNChanceMin = chances.filter(c => c >= cfg.engageNChanceMin).length;

  return { median, countGteNChanceMin, n: chances.length };
}

/**
 * Compute per-member combat-gear coverage for:
 * - TERRITORY members (min coverage)
 * - all members (min coverage)
 *
 * Coverage is based on items that provide STR/DEF/DEX/AGI stats.
 */
function computeEquipCatchup(ns, decision, cfg) {
  if (!cfg.buyEquip || !cfg.equipCatchup) {
    return { terrMinPct: 1, anyMinPct: 1, totalCombatEquip: 0 };
  }

  const equip = ns.gang.getEquipmentNames()
    .map(name => ({
      name,
      stats: ns.gang.getEquipmentStats(name) || {},
    }))
    .filter(e =>
      (e.stats.str || 0) > 0 ||
      (e.stats.def || 0) > 0 ||
      (e.stats.dex || 0) > 0 ||
      (e.stats.agi || 0) > 0
    );

  const total = equip.length;
  if (total <= 0) return { terrMinPct: 1, anyMinPct: 1, totalCombatEquip: 0 };

  const pctFor = (member) => {
    const info = ns.gang.getMemberInformation(member);
    const owned = new Set([...(info.upgrades || []), ...(info.augmentations || [])]);
    let have = 0;
    for (const e of equip) if (owned.has(e.name)) have++;
    return have / total;
  };

  const allNames = ns.gang.getMemberNames();
  const terrNames = decision?.roster?.TERRITORY || [];

  let anyMin = 1;
  for (const n of allNames) anyMin = Math.min(anyMin, pctFor(n));

  let terrMin = 1;
  if (terrNames.length > 0) {
    for (const n of terrNames) terrMin = Math.min(terrMin, pctFor(n));
  }

  return { terrMinPct: terrMin, anyMinPct: anyMin, totalCombatEquip: total };
}

/**
 * Latch for catch-up mode:
 * - Enter if under thresholds
 * - Exit only after higher exit thresholds to avoid flapping
 */
function updateCatchupLatch(current, info, cfg) {
  if (!cfg.equipCatchup) return false;

  if (!current) {
    const enter =
      info.terrMinPct < cfg.equipCatchupTerritoryMinPct ||
      info.anyMinPct < cfg.equipCatchupAnyMinPct;
    return enter;
  } else {
    const exit =
      info.terrMinPct >= cfg.equipCatchupExitTerritoryMinPct &&
      info.anyMinPct >= cfg.equipCatchupExitAnyMinPct;
    return !exit;
  }
}

/**
 * Returns the cheapest missing combat-stat equipment cost for a given list of members.
 * If everyone in the list is fully covered, returns Infinity.
 */
function getNextMissingCombatEquipCost(ns, members) {
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
    .sort((a, b) => a.cost - b.cost); // cheapest-first

  if (!equip.length || !members.length) return Infinity;

  let best = Infinity;

  for (const member of members) {
    const info = ns.gang.getMemberInformation(member);
    const owned = new Set([...(info.upgrades || []), ...(info.augmentations || [])]);

    const next = equip.find(e => !owned.has(e.name));
    if (next) best = Math.min(best, next.cost);
  }

  return best;
}

/**
 * Equipment buying: fair + paced (round-robin across members) + spend-per-minute governor.
 * Catch-up mode temporarily increases buying speed and relaxes minCash.
 * Returns updated state object.
 */
function buyEquipmentForGangRoundRobin(ns, decision, cfg, state, catchupMode) {
  if (!cfg.buyEquip) return state;

  // Apply catch-up overrides (temporary, auto-managed)
  const maxPurchasesPerTick = catchupMode ? cfg.equipCatchupMaxPurchasesPerTick : cfg.equipMaxPurchasesPerTick;
  const maxSpendPerMin = catchupMode ? cfg.equipCatchupMaxSpendPerMin : cfg.equipMaxSpendPerMin;
  const minCash = catchupMode ? cfg.equipCatchupMinCash : cfg.equipMinCash;

  const now = Date.now();
  if (state.spendWindowStart === 0) state.spendWindowStart = now;

  // reset spend window every 60s
  if (now - state.spendWindowStart >= 60_000) {
    state.spendWindowStart = now;
    state.spentThisWindow = 0;
  }

  const cash = ns.getServerMoneyAvailable("home");
  if (cash < minCash) return state;

  // Catch-up should never stall on expensive augs; spend-per-minute is the real brake.
  const budgetTick = catchupMode ? cash : (cash * cfg.equipBudget);

  // remaining budget in the spend window
  const budgetWindow = Math.max(0, maxSpendPerMin - state.spentThisWindow);
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
    // SIMPLE: cheapest-first
    .sort((a, b) => a.cost - b.cost);

  // Prioritize TERRITORY first, then VIGILANTE/EARNER
  const targets = [
    ...decision.roster.TERRITORY,
    ...decision.roster.VIGILANTE,
    ...decision.roster.EARNER,
  ];
  if (!targets.length || !equip.length) return state;

  // Optional debug: show what the cursor member is missing and whether budget can cover it
  let debugNext = null;
  if (cfg.equipDebug && catchupMode) {
    const debugMember = targets[state.cursor % targets.length];
    const debugInfo = ns.gang.getMemberInformation(debugMember);
    const debugOwned = new Set([...(debugInfo.upgrades || []), ...(debugInfo.augmentations || [])]);
    debugNext = equip.find(e => !debugOwned.has(e.name)) || null;
  }

  let spent = 0;
  let buys = 0;

  for (let tries = 0; tries < targets.length && buys < maxPurchasesPerTick; tries++) {
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
        ns.print(`[equip] ${catchupMode ? "CATCHUP " : ""}${member} <- ${e.name} ($${Math.round(e.cost).toLocaleString()})`);
      }
      break; // max one buy per member per tick
    }
  }

  if (cfg.equipDebug && catchupMode && buys === 0 && debugNext) {
    ns.print(
      `[equip-debug] cash=$${Math.round(cash).toLocaleString()} ` +
      `budget=$${Math.round(budget).toLocaleString()} ` +
      `next=${debugNext.name} cost=$${Math.round(debugNext.cost).toLocaleString()}`
    );
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
  ns.print(fmtTier("TERRITORY"));
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

/**
 * Linearly ramps from outMin..outMax as x moves from inMin..inMax, clamped.
 */
function ramp(x, inMin, inMax, outMin, outMax) {
  if (inMax <= inMin) return outMin;
  const t = clamp01((x - inMin) / (inMax - inMin));
  return lerp(outMin, outMax, t);
}

/** @param {NS} ns */
function printHelp(ns) {
  ns.tprint(`
gang-manager.js
Description:
  Adaptive COMBAT gang automation (slightly aggressive).
  - Maintains wantedPenalty >= 99.5% (recovery latch + proportional vigilantes).
  - Dynamic training threshold so recruits keep up as gang strength grows.
  - Territory Warfare assignment ramped by MEDIAN clash chance.
  - Auto-engages clashes when median chance is decent OR at least N gangs are beatable.
  - Auto-upgrades respect tasks by stats, but caps max tier based on wantedPenalty to prevent thrashing.
  - Endgame: once territory >= 99%, disables warfare and stops territory tasks to monetize.
  - Buys combat equipment with round-robin fairness + spend governor.
  - Automatic equipment CATCH-UP mode increases purchases/spend when under-equipped.
  - NEW: Cash-farming mode pauses TW tasks during catch-up when you can't afford the next big item.

Usage:
  run gang-manager.js [--help] [--tail]
    [--tick 2000]
    [--logMode changes|always|silent]
    [--showRoster true|false]
    [--buyEquip true|false]
    [--equipBudget 0.03]
    [--equipMinCash 1e9]
    [--equipDebug true|false]

Notes:
  - Catch-up and cash-farming are automatic; watch mode tags in the summary: "+CASH".
  - Use --equipDebug to print why purchases are blocked (budget vs next item cost).
`);
}
