/**
 * /bin/ui/timed-net-batcher-ui.js
 *
 * Always-on dashboard for your timed HWGW batcher ecosystem.
 * Read-only. Does not change anything.
 *
 * Shows:
 *  - Target health (money %, sec delta) + PREP/MONEY classification
 *  - Fleet summary (home reserve, pserv RAM, free RAM)
 *  - What is running where (batch-hack/grow/weaken threads by host)
 *  - Active targets seen in worker args
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["interval", 2000],
    ["target", ""], // optional: pin to a target (otherwise picks most common active target)
  ]);

  ns.disableLog("ALL");
  ns.ui.openTail();

  const interval = Math.max(250, Number(flags.interval) || 2000);

  // Worker script names (match your batcher)
  const hackScript = "workers/hwgw/batch-hack.js";
  const growScript = "workers/hwgw/batch-grow.js";
  const weakScript = "workers/hwgw/batch-weaken.js";

  // Copy of your defaults (for display + â€œPREP vs MONEYâ€ logic)
  const MONEY_THRESHOLD = 0.90;
  const SEC_TOLERANCE = 0.90;
  const LOWRAM_MONEY_THRESHOLD = 0.90;
  const LOWRAM_SEC_TOLERANCE = 1.50;

  const PSERV_MIN_TOTAL_RAM = 64;

  while (true) {
    const snap = getSnapshot(ns, {
      pinnedTarget: String(flags.target || "").trim(),
      hackScript,
      growScript,
      weakScript,
      MONEY_THRESHOLD,
      SEC_TOLERANCE,
      LOWRAM_MONEY_THRESHOLD,
      LOWRAM_SEC_TOLERANCE,
      PSERV_MIN_TOTAL_RAM,
    });

    render(ns, snap);
    await ns.sleep(interval);
  }
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

function getSnapshot(ns, cfg) {
  const purchased = ns.getPurchasedServers();
  const hosts = ["home", ...purchased];

  const homeReserve = getHomeReserve(ns);

  let totalPservRam = 0;
  for (const h of purchased) totalPservRam += ns.getServerMaxRam(h);

  const desiredMode = totalPservRam >= cfg.PSERV_MIN_TOTAL_RAM ? "HYBRID" : "HOME";

  // Per-host RAM + batch threads summary
  const hostRows = [];
  const running = []; // {host, filename, threads, args}

  for (const host of hosts) {
    const max = ns.getServerMaxRam(host);
    const used = ns.getServerUsedRam(host);
    const freeRaw = Math.max(0, max - used);
    const free = host === "home" ? Math.max(0, max - used - homeReserve) : freeRaw;

    const procs = ns.ps(host) || [];
    let hThreads = 0, gThreads = 0, wThreads = 0;

    for (const p of procs) {
      if (p.filename === cfg.hackScript) hThreads += p.threads;
      else if (p.filename === cfg.growScript) gThreads += p.threads;
      else if (p.filename === cfg.weakScript) wThreads += p.threads;

      if (
        p.filename === cfg.hackScript ||
        p.filename === cfg.growScript ||
        p.filename === cfg.weakScript
      ) {
        running.push({ host, filename: p.filename, threads: p.threads, args: p.args || [] });
      }
    }

    hostRows.push({
      host,
      max,
      used,
      free,
      hThreads,
      gThreads,
      wThreads,
      anyBatch: (hThreads + gThreads + wThreads) > 0,
    });
  }

  // Aggregate running threads
  const totals = { H: 0, G: 0, W: 0, procs: running.length };
  for (const r of running) {
    if (r.filename === cfg.hackScript) totals.H += r.threads;
    else if (r.filename === cfg.growScript) totals.G += r.threads;
    else if (r.filename === cfg.weakScript) totals.W += r.threads;
  }

  // Detect â€œactive targetsâ€ from worker args: [target, delay, ...]
  const targetsCount = new Map();
  for (const r of running) {
    const t = String(r.args?.[0] ?? "").trim();
    if (!t) continue;
    targetsCount.set(t, (targetsCount.get(t) || 0) + r.threads);
  }

  const activeTargets = [...targetsCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([target, threads]) => ({ target, threads }));

  // Decide which target to display stats for
  const target =
    cfg.pinnedTarget ||
    (activeTargets[0]?.target ?? "");

  const targetStats = target ? getTargetStats(ns, target) : null;

  // Guess lowram-ish state: if there are basically no pservs or below threshold
  // (Your controller does hysteresis; UI just shows the â€œlikely modeâ€.)
  const lowramLikely = desiredMode === "HOME";

  // Thresholds used for PREP/MONEY classification
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

  // Sort hosts: show batch-active hosts first, then by free desc
  hostRows.sort((a, b) =>
    (Number(b.anyBatch) - Number(a.anyBatch)) ||
    (b.free - a.free) ||
    a.host.localeCompare(b.host)
  );

  return {
    now: Date.now(),
    mode: desiredMode,
    homeReserve,
    purchasedCount: purchased.length,
    totalPservRam,
    totals,
    hostRows,
    activeTargets,
    target,
    targetStats,
    prepState,
    usingFormulas: hasFormulas(ns),
  };
}

function getTargetStats(ns, target) {
  const money = ns.getServerMoneyAvailable(target);
  const max = ns.getServerMaxMoney(target);
  const sec = ns.getServerSecurityLevel(target);
  const minSec = ns.getServerMinSecurityLevel(target);

  const moneyRatio = max > 0 ? money / max : 0;
  const secDelta = sec - minSec;

  return {
    money,
    max,
    moneyRatio,
    sec,
    minSec,
    secDelta,
  };
}

// Same helper you use
function getHomeReserve(ns) {
  const max = ns.getServerMaxRam("home");
  return Math.min(128, Math.max(8, Math.floor(max * 0.10)));
}

function hasFormulas(ns) {
  try {
    return (
      ns.fileExists("Formulas.exe", "home") &&
      ns.formulas &&
      ns.formulas.hacking &&
      typeof ns.formulas.hacking.hackTime === "function"
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Render (asset-ui vibe)
// ---------------------------------------------------------------------------

function render(ns, s) {
  ns.clearLog();

  ns.print("============================================================");
  ns.print("TIMED NET BATCHER DASHBOARD (AUTOMATIC)");
  ns.print("============================================================");

  ns.print(
    `Mode (likely): ${s.mode} | Formulas.exe: ${s.usingFormulas ? "YES" : "NO"}`
  );
  ns.print(
    `Pservs: ${s.purchasedCount} | Total pserv RAM: ${fmtRam(s.totalPservRam)} | Home reserve: ${fmtRam(s.homeReserve)}`
  );

  const freeTotal = s.hostRows.reduce((acc, r) => acc + r.free, 0);
  ns.print(`Fleet free RAM (usable): ${fmtRam(freeTotal)}`);

  ns.print("------------------------------------------------------------");
  ns.print(
    `Running workers: procs=${s.totals.procs} | H=${s.totals.H} G=${s.totals.G} W=${s.totals.W}`
  );

  ns.print("============================================================");
  ns.print("");

  // Active targets
  ns.print("Active Targets (from worker args)");
  ns.print("------------------------------------------------------------");
  if (!s.activeTargets.length) {
    ns.print("(No batch workers detected.)");
  } else {
    const line = s.activeTargets
      .slice(0, 6)
      .map((x) => `${x.target}:${x.threads}`)
      .join(" | ");
    ns.print(line);
  }

  ns.print("");

  // Target status
  ns.print("Target Status");
  ns.print("------------------------------------------------------------");
  if (!s.target) {
    ns.print("(No target detected. Start your batcher, or pass --target n00dles.)");
  } else {
    ns.print(`Target: ${s.target}`);
    if (s.targetStats) {
      ns.print(
        `Money: ${fmtMoney(ns, s.targetStats.money)} / ${fmtMoney(ns, s.targetStats.max)} ` +
        `(${(s.targetStats.moneyRatio * 100).toFixed(2)}%)`
      );
      ns.print(
        `Security: ${s.targetStats.sec.toFixed(2)} (min ${s.targetStats.minSec.toFixed(2)}) ` +
        `delta=${s.targetStats.secDelta.toFixed(2)}`
      );

      if (s.prepState) {
        ns.print("------------------------------------------------------------");
        ns.print(
          `Classification: ${s.prepState.prepping ? "PREP" : "MONEY"} ` +
          `| thresholds: money>=${(s.prepState.moneyThresh * 100).toFixed(0)}% ` +
          `secDelta<=${s.prepState.secThresh.toFixed(2)} ` +
          `| ok: money=${s.prepState.moneyOk ? "Y" : "N"} sec=${s.prepState.secOk ? "Y" : "N"}`
        );
      }
    }
  }

  ns.print("");
  ns.print("Workers by Host");
  ns.print("------------------------------------------------------------");
  ns.print(
    `${padRight("host", 14)} ${padLeft("free", 8)} ${padLeft("used", 8)} ` +
    `${padLeft("H", 6)} ${padLeft("G", 6)} ${padLeft("W", 6)}`
  );

  for (const r of s.hostRows) {
    const mark = r.anyBatch ? "*" : " ";
    ns.print(
      `${mark}${padRight(r.host, 13)} ${padLeft(fmtRam(r.free), 8)} ${padLeft(fmtRam(r.used), 8)} ` +
      `${padLeft(String(r.hThreads), 6)} ${padLeft(String(r.gThreads), 6)} ${padLeft(String(r.wThreads), 6)}`
    );
  }

  ns.print("");
  ns.print("* = host currently running batch workers");
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtMoney(ns, v) {
  if (!Number.isFinite(v)) return "n/a";
  if (typeof ns.formatMoney === "function") return ns.formatMoney(v);
  return "$" + ns.formatNumber(v);
}

function fmtRam(gb) {
  if (!Number.isFinite(gb)) return "n/a";
  if (gb >= 1024) return (gb / 1024).toFixed(1) + "t";
  return gb.toFixed(1) + "g";
}

function padRight(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function padLeft(s, n) {
  s = String(s);
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}
