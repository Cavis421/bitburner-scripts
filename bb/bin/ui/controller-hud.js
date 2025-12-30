/** @param {NS} ns */
/*
 * /bin/ui/controller-hud.js
 *
 * Description
 *  Unified controller HUD (Tail dashboard) rendered as ONE continuous report:
 *   1) UI ops dashboard (report header: player/money/RAM + trends)
 *   2) timed-net-batcher-ui summary (active targets + target status + classification)
 *   3) WSE asset-dashboard summary
 *   4) gang summary (or Karma-Watch fallback)
 *   5) hacknet summary
 *   6) bbOS services summary (ASCII-only; no mojibake; oneshots show IDLE)
 *
 * Notes
 *  - Read-only: does not start/stop services.
 *  - Trend fix: primary "Income" uses ns.getTotalScriptIncome() (not distorted by spending).
 *    Optional CashΔ and NetWorthΔ are rolling-window slopes to diagnose spending / net worth changes.
 *
 * Syntax
 *  run /bin/ui/controller-hud.js
 *  run /bin/ui/controller-hud.js --interval 1000
 *  run /bin/ui/controller-hud.js --help
 */

import { getServiceRegistry } from "/lib/os/service-registry.js";
import {
    DEFAULT_SERVICE_CONFIG_PATH,
    normalizeDataPath,
    loadServiceConfig,
    getEffectiveEnabledMap,
} from "/lib/os/service-config.js";

const FLAGS = [
    ["help", false],

    // UI
    ["interval", 1500],
    ["popout", true],
    ["once", false],

    // Batcher section
    ["batchTarget", ""],        // optional: pin a target (otherwise: most common active target)
    ["maxActiveTargets", 3],    // keep it readable
    ["workerScripts", "workers/hwgw/batch-hack.js,workers/hwgw/batch-grow.js,workers/hwgw/batch-weaken.js"],

    // Service status scope
    ["host", "home"],
    ["allHosts", false],

    // Trend sampling
    ["trendWindowSec", 120],
    ["maxSamples", 240],
    ["showCashDelta", true],      // show cash slope (useful but not "income")
    ["showNetWorthDelta", true],  // uses WSE net liquidation if available

    // Services rendering
    ["oneshotKeys", "backdoorJob,contractsJob"], // treat as oneshot jobs -> IDLE when not running
];

export async function main(ns) {
    const flags = ns.flags(FLAGS);
    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");
    ns.clearLog();

    if (flags.popout) {
        if (ns.ui?.openTail) ns.ui.openTail();
        else ns.tail();
    }

    const interval = Math.max(250, Number(flags.interval) || 1500);

    const cashTrend = makeTrend(ns, flags, {
        file: "data/hud-cash-trend.txt",
        sampleFn: () => ns.getServerMoneyAvailable("home"),
    });

    const netWorthTrend = makeTrend(ns, flags, {
        file: "data/hud-networth-trend.txt",
        sampleFn: () => computeNetLiquidation(ns), // may return null if no stock API
        allowNull: true,
    });

    while (true) {
        ns.clearLog();

        cashTrend.sample();
        netWorthTrend.sample();

        // Safety net: one bad section shouldn't kill the whole HUD
        try {
            renderReport(ns, flags, cashTrend, netWorthTrend);
        } catch (e) {
            ns.print("=================================================================");
            ns.print(`[controller-hud] WARN render error: ${String(e)}`);
            ns.print("=================================================================");
        }

        if (flags.once) return;
        await ns.sleep(interval);
    }
}

function renderReport(ns, flags, cashTrend, netWorthTrend) {
    const now = new Date();
    const player = ns.getPlayer();

    // -------------------------------
    // REPORT HEADER (Ops dashboard)
    // -------------------------------
    const money = player.money ?? ns.getServerMoneyAvailable("home");
    const hackLvl = player.skills?.hacking ?? player.hacking ?? ns.getHackingLevel();

    const homeMax = ns.getServerMaxRam("home");
    const homeUsed = ns.getServerUsedRam("home");
    const homeFree = Math.max(0, homeMax - homeUsed);

    // Trend fix: use script income rate (not distorted by spending)
    const [scriptMoneyPerSec] = safeArr(() => ns.getTotalScriptIncome(), [NaN]);

    const xpRate = readXpThroughput(ns, "data/xp-throughput.txt");

    const cashDeltaPerSec = cashTrend.ratePerSec();
    const netWorthDeltaPerSec = netWorthTrend.ratePerSec(); // may be NaN if not available

    ns.print("=================================================================");
    ns.print(`bbOS Controller Report | ${now.toLocaleTimeString()}`);
    ns.print("-----------------------------------------------------------------");
    ns.print(`Player: ${player.name ?? "Player"}   |   Hacking: ${hackLvl}`);
    ns.print(`Money:  ${fmtMoney(ns, money)}`);
    ns.print(`Home RAM: ${fmtRam(homeUsed)} / ${fmtRam(homeMax)} GB (free ${fmtRam(homeFree)} GB)`);

    const incomeStr = Number.isFinite(scriptMoneyPerSec) ? `${fmtMoney(ns, scriptMoneyPerSec)}/s` : "n/a";

    let trendLine = `Income: ${padLeftShort(incomeStr, 14)}`;

    if (flags.showNetWorthDelta) {
        const nwStr = Number.isFinite(netWorthDeltaPerSec) ? `${fmtMoney(ns, netWorthDeltaPerSec)}/s` : "n/a";
        trendLine += ` | NetWorthΔ: ${padLeftShort(nwStr, 14)}`;
    }
    if (flags.showCashDelta) {
        const cashStr = Number.isFinite(cashDeltaPerSec) ? `${fmtMoney(ns, cashDeltaPerSec)}/s` : "n/a";
        trendLine += ` | CashΔ: ${padLeftShort(cashStr, 14)}`;
    }
    if (xpRate) {
        trendLine += ` | XP: ${xpRate.xpPerSec.toFixed(2)} XP/s`;
    }
    ns.print(trendLine);

    ns.print("=================================================================");
    ns.print("");

    // Order you requested, but rendered as one “fluid report”
    renderBatcherSection(ns, flags);
    ns.print("");
    renderWseAssetsSection(ns);
    ns.print("");
    renderGangOrKarmaSection(ns);
    ns.print("");
    renderHacknetSection(ns);
    ns.print("");
    renderBladeburnerSection(ns);
    ns.print("");
    renderServicesSection(ns, flags);
    ns.print("");
}

// -----------------------------------------------------------------------------
// 2) timed-net-batcher-ui summary (readable / compact)
// -----------------------------------------------------------------------------
function renderBatcherSection(ns, flags) {
    const workerScripts = String(flags.workerScripts || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const hackScript = workerScripts[0] || "workers/hwgw/batch-hack.js";
    const growScript = workerScripts[1] || "workers/hwgw/batch-grow.js";
    const weakScript = workerScripts[2] || "workers/hwgw/batch-weaken.js";

    // thresholds (match your earlier UI behavior)
    const MONEY_THRESHOLD = 0.90;
    const SEC_TOLERANCE = 0.90;
    const LOWRAM_MONEY_THRESHOLD = 0.90;
    const LOWRAM_SEC_TOLERANCE = 1.50;
    const PSERV_MIN_TOTAL_RAM = 64;

    const snap = getTimedBatcherSnapshot(ns, {
        pinnedTarget: String(flags.batchTarget || "").trim(),
        hackScript,
        growScript,
        weakScript,
        MONEY_THRESHOLD,
        SEC_TOLERANCE,
        LOWRAM_MONEY_THRESHOLD,
        LOWRAM_SEC_TOLERANCE,
        PSERV_MIN_TOTAL_RAM,
    });

    ns.print("== Targets ==");
    if (!snap.activeTargets.length) {
        ns.print("  Active: (no batch workers detected)");
        ns.print("  Tip: start batcher, or pass --batchTarget <host>");
        return;
    }

    const maxActive = Math.max(1, Number(flags.maxActiveTargets) || 3);
    const activeLine = snap.activeTargets
        .slice(0, maxActive)
        .map((x) => `${x.target}:${x.threads}`)
        .join(" | ");

    ns.print(`  Active: ${activeLine}`);

    if (!snap.target) {
        ns.print("  Target: (unknown)");
        return;
    }

    ns.print(`  Target: ${snap.target}`);

    if (snap.targetStats) {
        const ts = snap.targetStats;
        ns.print(
            `  Money:  ${fmtMoney(ns, ts.money)} / ${fmtMoney(ns, ts.max)} (${(ts.moneyRatio * 100).toFixed(2)}%)`
        );
        ns.print(
            `  Sec:    ${ts.sec.toFixed(2)} (min ${ts.minSec.toFixed(2)})  Δ=${ts.secDelta.toFixed(2)}`
        );
    }

    if (snap.prepState) {
        const ps = snap.prepState;
        ns.print(
            `  Mode:   ${ps.prepping ? "PREP" : "MONEY"}  (money>=${(ps.moneyThresh * 100).toFixed(0)}%  secΔ<=${ps.secThresh.toFixed(2)})`
        );
    }
}

function getTimedBatcherSnapshot(ns, cfg) {
    const purchased = ns.getPurchasedServers();
    const hosts = ["home", ...purchased];

    let totalPservRam = 0;
    for (const h of purchased) totalPservRam += ns.getServerMaxRam(h);

    const desiredMode = totalPservRam >= cfg.PSERV_MIN_TOTAL_RAM ? "HYBRID" : "HOME";
    const lowramLikely = desiredMode === "HOME";

    const active = new Map(); // target -> threads

    for (const host of hosts) {
        const procs = safeArr(() => ns.ps(host), []);
        for (const p of procs) {
            if (p.filename !== cfg.hackScript && p.filename !== cfg.growScript && p.filename !== cfg.weakScript) continue;
            const target = String(p.args?.[0] ?? "").trim();
            if (!target) continue;
            active.set(target, (active.get(target) || 0) + (p.threads || 0));
        }
    }

    const activeTargets = Array.from(active.entries())
        .map(([target, threads]) => ({ target, threads }))
        .sort((a, b) => b.threads - a.threads || a.target.localeCompare(b.target));

    const pinned = String(cfg.pinnedTarget || "");
    const target = pinned || (activeTargets[0]?.target ?? "");

    const targetStats = target ? getTargetStats(ns, target) : null;

    const moneyThresh = lowramLikely ? cfg.LOWRAM_MONEY_THRESHOLD : cfg.MONEY_THRESHOLD;
    const secThresh = lowramLikely ? cfg.LOWRAM_SEC_TOLERANCE : cfg.SEC_TOLERANCE;

    let prepState = null;
    if (targetStats) {
        const moneyOk = targetStats.moneyRatio >= moneyThresh;
        const secOk = targetStats.secDelta <= secThresh;
        prepState = {
            lowramLikely,
            moneyThresh,
            secThresh,
            moneyOk,
            secOk,
            prepping: !(moneyOk && secOk),
        };
    }

    return { activeTargets, target, targetStats, prepState };
}

function getTargetStats(ns, target) {
    const money = ns.getServerMoneyAvailable(target);
    const max = ns.getServerMaxMoney(target);
    const sec = ns.getServerSecurityLevel(target);
    const minSec = ns.getServerMinSecurityLevel(target);

    const moneyRatio = max > 0 ? money / max : 0;
    const secDelta = sec - minSec;

    return { money, max, moneyRatio, sec, minSec, secDelta };
}

// -----------------------------------------------------------------------------
// 3) WSE assets (compact)  [FIXED: WSE gating + safe calls]
// -----------------------------------------------------------------------------
function renderWseAssetsSection(ns) {
    ns.print("== WSE Assets ==");

    if (!ns.stock) {
        ns.print("  Status: (Stock API not available)");
        return;
    }

    // Real gate: WSE account. Without it, many ns.stock calls throw.
    if (!hasWseAccount(ns)) {
        ns.print("  Status: locked (no WSE account)");
        return;
    }

    const cash = ns.getServerMoneyAvailable("home");
    const symbols = safeStock(() => ns.stock.getSymbols(), []);

    if (!symbols.length) {
        ns.print(`  Cash:        ${fmtMoney(ns, cash)}`);
        ns.print("  Status:      (no symbols / unable to read portfolio)");
        return;
    }

    const bidFn = ns.stock.getBidPrice ?? ns.stock.getStockBidPrice;
    const askFn = ns.stock.getAskPrice ?? ns.stock.getStockAskPrice;

    let longMarket = 0;
    let longLiquidation = 0;
    let shortCloseCost = 0;

    for (const sym of symbols) {
        const price = safeStock(() => ns.stock.getPrice(sym), NaN);
        if (!Number.isFinite(price)) continue;

        const bid = typeof bidFn === "function" ? safeStock(() => bidFn(sym), null) : null;
        const ask = typeof askFn === "function" ? safeStock(() => askFn(sym), null) : null;

        const pos = safeStock(() => ns.stock.getPosition(sym), null);
        const longShares = Number(pos?.[0] ?? 0);
        const shortShares = Number(pos?.[2] ?? 0);

        if (longShares > 0) {
            longMarket += longShares * price;
            longLiquidation += longShares * (bid ?? price);
        }
        if (shortShares > 0) {
            shortCloseCost += shortShares * (ask ?? price);
        }
    }

    const netLiquidation = cash + longLiquidation - shortCloseCost;

    ns.print(`  Cash:        ${fmtMoney(ns, cash)}`);
    ns.print(`  Long (mkt):   ${fmtMoney(ns, longMarket)}`);
    ns.print(`  Long (liq):   ${fmtMoney(ns, longLiquidation)}`);
    ns.print(`  Short close: -${fmtMoney(ns, shortCloseCost)}`);
    ns.print(`  Net liq:      ${fmtMoney(ns, netLiquidation)}`);
}

// -----------------------------------------------------------------------------
// 4) Gang (or Karma) - compact
// -----------------------------------------------------------------------------
function renderGangOrKarmaSection(ns) {
    ns.print("== Gang ==");
    const hasGangApi = !!ns.gang;
    const inGang = hasGangApi && safeBool(() => ns.gang.inGang(), false);

    if (!hasGangApi || !inGang) {
        const karma = safeNum(() => ns.heart.break(), NaN);
        ns.print(`  Status: (no gang)`);
        ns.print(`  Karma:  ${Number.isFinite(karma) ? karma.toFixed(2) : "n/a"}`);
        return;
    }

    const g = safeObj(() => ns.gang.getGangInformation(), null);
    if (!g) {
        ns.print("  Status: (gang info unavailable)");
        return;
    }

    const type = g.isHacking ? "HACKING" : "COMBAT";

    const members = safeArr(() => ns.gang.getMemberNames(), []);
    const tasks = new Map();
    for (const m of members) {
        const mi = safeObj(() => ns.gang.getMemberInformation(m), null);
        if (!mi) continue;
        const t = String(mi.task || "Unassigned");
        tasks.set(t, (tasks.get(t) || 0) + 1);
    }
    const topTasks = Array.from(tasks.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([t, c]) => `${t}:${c}`)
        .join("  ");

    ns.print(`  Type:      ${type} | Faction: ${g.faction}`);
    ns.print(
        `  Territory: ${(g.territory * 100).toFixed(1)}% | Power: ${ns.formatNumber(g.power, 2)} | Warfare: ${g.territoryWarfareEngaged ? "ON" : "OFF"}`
    );
    ns.print(
        `  Wanted:    ${(g.wantedPenalty * 100).toFixed(1)}% pen | ${ns.formatNumber(g.wantedLevel, 2)} lvl | ${ns.formatNumber(g.respect, 2)} resp`
    );
    ns.print(`  Tasks:     ${topTasks || "n/a"}`);
}

// -----------------------------------------------------------------------------
// 5) Hacknet - compact
// -----------------------------------------------------------------------------
function renderHacknetSection(ns) {
    ns.print("== Hacknet ==");
    if (!ns.hacknet) {
        ns.print("  Status: (Hacknet API not available)");
        return;
    }

    const nodes = safeNum(() => ns.hacknet.numNodes(), 0);

    let total = 0;
    let min = Infinity;
    let max = 0;

    for (let i = 0; i < nodes; i++) {
        const st = ns.hacknet.getNodeStats(i);
        const p = Number(st.production || 0);
        total += p;
        min = Math.min(min, p);
        max = Math.max(max, p);
    }
    if (!Number.isFinite(min)) min = 0;

    ns.print(`  Nodes: ${nodes}`);
    ns.print(`  Prod:  ${fmtMoney(ns, total)}/s  (min ${fmtMoney(ns, min)}/s  max ${fmtMoney(ns, max)}/s)`);
}

// -----------------------------------------------------------------------------
// 6) Bladeburner - compact (BN6 / SF7+)
// -----------------------------------------------------------------------------
function renderBladeburnerSection(ns) {
    ns.print("== Bladeburner ==");

    // API gate (SF7+ or BN6)
    if (!ns.bladeburner || typeof ns.bladeburner.inBladeburner !== "function") {
        ns.print("  Status: (Bladeburner API not available)");
        return;
    }

    const inBB = safeBool(() => ns.bladeburner.inBladeburner(), false);
    if (!inBB) {
        ns.print("  Status: (not in Bladeburners)");
        return;
    }

    const rank = safeNum(() => ns.bladeburner.getRank(), NaN);
    const sp = safeNum(() => ns.bladeburner.getSkillPoints(), NaN);

    const stamina = safeArr(() => ns.bladeburner.getStamina(), [NaN, NaN]);
    const sta = Number(stamina?.[0] ?? NaN);
    const staMax = Number(stamina?.[1] ?? NaN);
    const staPct = (Number.isFinite(sta) && Number.isFinite(staMax) && staMax > 0)
        ? (sta / staMax) * 100
        : NaN;

    const city = safeStr(() => ns.bladeburner.getCity(), "n/a");
    const chaos = safeNum(() => ns.bladeburner.getCityChaos(city), NaN);

    const cur = safeObj(() => ns.bladeburner.getCurrentAction(), null);
    const curType = String(cur?.type ?? "n/a");
    const curName = String(cur?.name ?? "n/a");

    // Next BlackOp (best-effort; safe if API differs)
    const blackOps = safeArr(() => ns.bladeburner.getBlackOpNames(), []);
    let nextBlackOp = null;
    for (const name of blackOps) {
        const remaining = safeNum(() => ns.bladeburner.getActionCountRemaining("BlackOp", name), 0);
        if (remaining > 0) {
            nextBlackOp = name;
            break;
        }
    }

    const nextReq = nextBlackOp ? safeNum(() => ns.bladeburner.getBlackOpRank(nextBlackOp), NaN) : NaN;
    const nextChancePair = nextBlackOp
        ? safeArr(() => ns.bladeburner.getActionEstimatedSuccessChance("BlackOp", nextBlackOp), [NaN, NaN])
        : [NaN, NaN];

    const cLo = Number(nextChancePair?.[0] ?? NaN);
    const cHi = Number(nextChancePair?.[1] ?? NaN);

    ns.print(`  Rank:     ${Number.isFinite(rank) ? ns.formatNumber(rank, 2) : "n/a"} | SP: ${Number.isFinite(sp) ? ns.formatNumber(sp, 0) : "n/a"}`);
    ns.print(`  Stamina:  ${Number.isFinite(sta) ? ns.formatNumber(sta, 1) : "n/a"} / ${Number.isFinite(staMax) ? ns.formatNumber(staMax, 1) : "n/a"} (${Number.isFinite(staPct) ? staPct.toFixed(1) + "%" : "n/a"})`);
    ns.print(`  City:     ${city} | Chaos: ${Number.isFinite(chaos) ? chaos.toFixed(1) : "n/a"}`);
    ns.print(`  Action:   ${curType}:${curName}`);

    if (nextBlackOp) {
        const reqStr = Number.isFinite(nextReq) ? ns.formatNumber(nextReq, 0) : "n/a";
        const chStr = (Number.isFinite(cLo) && Number.isFinite(cHi))
            ? `${(cLo * 100).toFixed(1)}–${(cHi * 100).toFixed(1)}%`
            : "n/a";
        ns.print(`  Next BO:  ${nextBlackOp} | ReqRank: ${reqStr} | Chance: ${chStr}`);
    } else {
        ns.print("  Next BO:  (none available / all complete)");
    }
}


// -----------------------------------------------------------------------------
// 7) bbOS Services (ASCII-only; oneshots show IDLE)
// -----------------------------------------------------------------------------
function renderServicesSection(ns, flags) {
    ns.print("== bbOS Services ==");

    const oneshotKeys = new Set(
        String(flags.oneshotKeys || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    );

    const registry = safeArr(() => getServiceRegistry(), []);
    const conf = safeObj(() => loadServiceConfig(ns, normalizeDataPath(DEFAULT_SERVICE_CONFIG_PATH)), {});
    const effective = safeObj(() => getEffectiveEnabledMap(registry, conf), {});
    const running = getRunningScriptSet(ns, flags);

    // Compute max key length for alignment
    let keyPad = 10;
    for (const svc of registry) {
        if (!svc.managed) continue;
        keyPad = Math.max(keyPad, String(svc.key).length);
    }

    for (const svc of registry) {
        if (!svc.managed) continue;

        const key = String(svc.key);
        const script = String(svc.script || "").replace(/^\/+/, "");
        const enabled = !!effective[key];
        const isRunning = running.has(script);
        const isOneshot = oneshotKeys.has(key);

        const tag = !enabled
            ? "[DIS]"
            : isRunning
                ? "[RUN]"
                : isOneshot
                    ? "[IDLE]"
                    : "[DOWN]";

        ns.print(`  ${tag} ${padRight(key, keyPad)}  ${script}`);
    }
}

function getRunningScriptSet(ns, flags) {
    const set = new Set();
    const host = String(flags.host || "home");

    if (flags.allHosts) {
        for (const h of discoverHosts(ns)) {
            for (const p of safeArr(() => ns.ps(h), [])) {
                set.add(String(p.filename || "").replace(/^\/+/, ""));
            }
        }
        return set;
    }

    for (const p of safeArr(() => ns.ps(host), [])) {
        set.add(String(p.filename || "").replace(/^\/+/, ""));
    }
    return set;
}

function discoverHosts(ns) {
    const out = [];
    const seen = new Set(["home"]);
    const q = ["home"];
    while (q.length) {
        const cur = q.shift();
        out.push(cur);
        for (const n of safeArr(() => ns.scan(cur), [])) {
            if (!seen.has(n)) {
                seen.add(n);
                q.push(n);
            }
        }
    }
    return out;
}

// -----------------------------------------------------------------------------
// Trend sampling (generic) + xp-throughput file read
// -----------------------------------------------------------------------------
function makeTrend(ns, flags, cfg) {
    const windowSec = Math.max(10, Number(flags.trendWindowSec) || 120);
    const maxSamples = Math.max(10, Number(flags.maxSamples) || 240);
    const file = String(cfg.file || "data/hud-trend.txt");
    const allowNull = !!cfg.allowNull;
    const sampleFn = cfg.sampleFn;

    /** @type {{ts:number, value:number}[]} */
    let samples = [];

    try {
        const raw = ns.read(file);
        if (raw) {
            const parsed = JSON.parse(String(raw));
            if (Array.isArray(parsed)) {
                samples = parsed.filter((x) => x && Number.isFinite(x.ts) && Number.isFinite(x.value));
            }
        }
    } catch { /* ignore */ }

    function sample() {
        const ts = Date.now();
        let value;
        try {
            value = sampleFn();
        } catch {
            value = null;
        }

        if (value === null || value === undefined) {
            if (!allowNull) return;
            // don't add a sample if unavailable (prevents bogus slopes)
            return;
        }
        if (!Number.isFinite(value)) return;

        samples.push({ ts, value });

        const cutoff = ts - windowSec * 1000;
        while (samples.length && samples[0].ts < cutoff) samples.shift();
        if (samples.length > maxSamples) samples = samples.slice(samples.length - maxSamples);

        try { ns.write(file, JSON.stringify(samples), "w"); } catch { /* ignore */ }
    }

    function ratePerSec() {
        if (samples.length < 2) return NaN;
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = (last.ts - first.ts) / 1000;
        if (dt <= 0) return NaN;
        return (last.value - first.value) / dt;
    }

    return { sample, ratePerSec };
}

function readXpThroughput(ns, file) {
    try {
        const raw = ns.read(file);
        if (!raw) return null;
        const p = JSON.parse(String(raw));
        if (!p || !Number.isFinite(p.xpPerSec)) return null;

        const ageSec = (Date.now() - Number(p.ts || 0)) / 1000;
        if (!Number.isFinite(ageSec) || ageSec > 15 * 60) return null;

        return { xpPerSec: Number(p.xpPerSec), ts: Number(p.ts || 0) };
    } catch {
        return null;
    }
}

// Compute net liquidation value (cash + long liquidation - short close)
// Returns null if Stock API is not available / accessible.
// [FIXED: WSE gating + safe calls]
function computeNetLiquidation(ns) {
    if (!ns.stock) return null;
    if (!hasWseAccount(ns)) return null;

    const cash = ns.getServerMoneyAvailable("home");
    const symbols = safeStock(() => ns.stock.getSymbols(), []);
    if (!symbols.length) return cash;

    const bidFn = ns.stock.getBidPrice ?? ns.stock.getStockBidPrice;
    const askFn = ns.stock.getAskPrice ?? ns.stock.getStockAskPrice;

    let longLiquidation = 0;
    let shortCloseCost = 0;

    for (const sym of symbols) {
        const price = safeStock(() => ns.stock.getPrice(sym), NaN);
        if (!Number.isFinite(price)) continue;

        const bid = typeof bidFn === "function" ? safeStock(() => bidFn(sym), null) : null;
        const ask = typeof askFn === "function" ? safeStock(() => askFn(sym), null) : null;

        const pos = safeStock(() => ns.stock.getPosition(sym), null);
        const longShares = Number(pos?.[0] ?? 0);
        const shortShares = Number(pos?.[2] ?? 0);

        if (longShares > 0) {
            longLiquidation += longShares * (bid ?? price);
        }
        if (shortShares > 0) {
            shortCloseCost += shortShares * (ask ?? price);
        }
    }

    return cash + longLiquidation - shortCloseCost;
}

// -----------------------------------------------------------------------------
// Formatting / utils
// -----------------------------------------------------------------------------
function fmtMoney(ns, v) {
    if (!Number.isFinite(v)) return "n/a";
    if (typeof ns.formatMoney === "function") return ns.formatMoney(v);
    return "$" + ns.formatNumber(v, 2);
}

function fmtRam(gb) {
    if (!Number.isFinite(gb)) return "n/a";
    return Number(gb).toFixed(1);
}

function padRight(s, n) {
    s = String(s);
    return s.length >= n ? s : s + " ".repeat(n - s.length);
}

// Keeps header line from jumping around when values change length
function padLeftShort(s, n) {
    s = String(s);
    return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function safeArr(fn, fallback) {
    try {
        const v = fn();
        return Array.isArray(v) ? v : fallback;
    } catch { return fallback; }
}
function safeObj(fn, fallback) {
    try {
        const v = fn();
        return v && typeof v === "object" ? v : fallback;
    } catch { return fallback; }
}
function safeNum(fn, fallback) {
    try {
        const v = fn();
        return Number.isFinite(v) ? v : fallback;
    } catch { return fallback; }
}
function safeBool(fn, fallback) {
    try {
        const v = fn();
        return typeof v === "boolean" ? v : fallback;
    } catch { return fallback; }
}

function safeStr(fn, fallback) {
    try {
        const v = fn();
        return (v === null || v === undefined) ? fallback : String(v);
    } catch { return fallback; }
}

// -------------------------------
// Stock access helpers (WSE gating)
// -------------------------------
function hasWseAccount(ns) {
    if (!ns.stock) return false;
    return safeBool(() => typeof ns.stock.hasWSEAccount === "function" && ns.stock.hasWSEAccount(), false);
}
function safeStock(fn, fallback = null) {
    try { return fn(); } catch { return fallback; }
}


/** @param {NS} ns */
function printHelp(ns) {
    ns.tprint("/bin/ui/controller-hud.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  Unified controller HUD rendered as one continuous report.");
    ns.tprint("  Trend fix: Income uses ns.getTotalScriptIncome() (not cash delta).");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run /bin/ui/controller-hud.js");
    ns.tprint("  run /bin/ui/controller-hud.js --interval 1000");
    ns.tprint("  run /bin/ui/controller-hud.js --batchTarget phantasy");
    ns.tprint("  run /bin/ui/controller-hud.js --allHosts true");
    ns.tprint("  run /bin/ui/controller-hud.js --help");
    ns.tprint("");
    ns.tprint("Flags");
    ns.tprint("  --interval <ms>           Refresh cadence (default 1500)");
    ns.tprint("  --popout true|false       Open Tail window (default true)");
    ns.tprint("  --once true|false         Render once and exit (default false)");
    ns.tprint("  --batchTarget <host>      Pin target for Target Status (default auto)");
    ns.tprint("  --maxActiveTargets <n>    Show top N active targets (default 3)");
    ns.tprint("  --host <name>             Process scan host when allHosts=false (default home)");
    ns.tprint("  --allHosts true|false     Scan all discovered hosts for running services (default false)");
    ns.tprint("  --trendWindowSec <sec>    Rolling window for CashΔ / NetWorthΔ (default 120)");
    ns.tprint("  --showCashDelta t|f       Show cash slope line (default true)");
    ns.tprint("  --showNetWorthDelta t|f   Show net worth slope line (default true)");
    ns.tprint("  --oneshotKeys <csv>       Service keys treated as oneshots (default backdoorJob,contractsJob)");
}
