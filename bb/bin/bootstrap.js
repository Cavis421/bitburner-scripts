/**
 * /bin/bootstrap.js
 *
 * Description
 *  Staged bootstrap workflow (HOME MAX RAM milestones):
 *    1) Stage A: run early-money while home MAX RAM < 64GB
 *    2) Stage B: run startup-home-advanced ONCE while 64GB <= home MAX RAM < 1024GB
 *    3) Stage C: start controller when home MAX RAM >= 1024GB (and it fits in FREE RAM)
 *
 *  On ANY stage switch, bootstrap kills "all workers" by killing all scripts on home
 *  except an allowlist (bootstrap itself only).
 *
 *  NEW (Player bootstrap safety):
 *   - Periodically enforces a free Rothman CS class while hacking < threshold
 *   - Once hacking >= threshold, kicks you out of class by starting a crime (crime-first)
 *
 * Notes
 *  - Avoids imports to keep RAM cost tiny.
 *  - Stage1 is treated like a daemon (kept running).
 *  - Stage2 is a one-shot launcher (run once per entry into Stage2).
 *  - Controller launch requires the script RAM cost to fit in FREE RAM at the moment of launch.
 *
 * Syntax
 *  run /bin/bootstrap.js
 *  run /bin/bootstrap.js --poll 2000
 *  run /bin/bootstrap.js --help
 */

/** @param {NS} ns */
const FLAGS = [
  ["help", false],

  // Stage thresholds (HOME MAX RAM, in GB)
  ["stage1Ram", 64],
  ["stage2Ram", 1024],

  // Stage scripts
  ["stage1", "bin/early-money.js"],
  ["stage2", "bin/startup-home-advanced.js"],

  // Controller
  ["controller", "bin/controller.js"],
  ["controllerThreads", 1],

  // Behavior
  ["killWorkersOnSwitch", true],
  // IMPORTANT: keep bootstrap alive so it can enforce player bootstrap policy.
  // You can flip this back to true if you don’t want this behavior.
  ["exitAfterControllerStart", false],
  ["poll", 5000],

  // ------------------------------------------------------------
  // Player bootstrap enforcement (Singularity)
  // ------------------------------------------------------------
  ["playerBootstrap", true],
  ["bootstrapHackThreshold", 30],
  ["bootstrapCity", "Sector-12"],
  ["bootstrapUniversity", "Rothman University"],
  ["bootstrapCourse", "Computer Science"],
  ["bootstrapCrime", "homicide"],

  // Only interfere with CLASS when we are specifically in the bootstrap course/location.
  ["strictBootstrapClassMatch", true],
];

export async function main(ns) {
  const flags = ns.flags(FLAGS);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  const poll = Math.max(1000, Number(flags.poll) || 5000);

  const stage1Ram = Math.max(1, Number(flags.stage1Ram) || 64);
  const stage2Ram = Math.max(stage1Ram, Number(flags.stage2Ram) || 1024);

  const stage1Script = normPath(String(flags.stage1 || "").trim());
  const stage2Script = normPath(String(flags.stage2 || "").trim());

  const controllerScript = normPath(String(flags.controller || "bin/controller.js").trim());
  const controllerThreads = Math.max(1, Math.floor(Number(flags.controllerThreads) || 1));

  const killWorkersOnSwitch = !!flags.killWorkersOnSwitch;
  const exitAfterControllerStart = !!flags.exitAfterControllerStart;

  // Player bootstrap cfg
  const playerBootstrap = !!flags.playerBootstrap;
  const bootHack = Math.max(1, Math.floor(Number(flags.bootstrapHackThreshold) || 30));
  const bootCity = String(flags.bootstrapCity || "Sector-12");
  const bootUni = String(flags.bootstrapUniversity || "Rothman University");
  const bootCourse = String(flags.bootstrapCourse || "Computer Science");
  const bootCrime = String(flags.bootstrapCrime || "homicide");
  const strictClassMatch = !!flags.strictBootstrapClassMatch;

  // Args after `--` are forwarded to stage scripts (optional)
  const passthroughArgs = flags._.slice(0);

  /** @type {"stage1"|"stage2"|"controller"|null} */
  let lastMode = null;

  // Stage2 must only be started once per entry into stage2
  let stage2Started = false;

  while (true) {
    const homeMax = ns.getServerMaxRam("home");

    const mode =
      homeMax < stage1Ram ? "stage1"
        : homeMax < stage2Ram ? "stage2"
          : "controller";

    // ------------------------------------------------------------
    // Stage transition: cleanup + latches
    // ------------------------------------------------------------
    if (mode !== lastMode) {
      if (killWorkersOnSwitch) {
        const allow = buildAllowList();
        const killed = killAllExcept(ns, "home", allow);
        ns.tprint(lastMode
          ? `[bootstrap] switch ${lastMode} -> ${mode} | killed=${killed}`
          : `[bootstrap] start in ${mode} | killed=${killed}`
        );
      } else if (lastMode === null) {
        ns.tprint(`[bootstrap] start in ${mode}`);
      }

      // Reset stage2 latch when entering stage2
      if (mode === "stage2") stage2Started = false;

      // Give RAM accounting a moment to settle
      await ns.sleep(50);
      lastMode = mode;
    }

    // ------------------------------------------------------------
    // Stage 1: early-money (daemon style)
    // ------------------------------------------------------------
    if (mode === "stage1") {
      // Extra safety: don't allow stage2/controller overlap
      tryStop(ns, stage2Script, "home");
      tryStop(ns, controllerScript, "home");

      ensureDaemonBestEffort(ns, stage1Script, 1, passthroughArgs);
      await ns.sleep(poll);
      continue;
    }

    // ------------------------------------------------------------
    // Stage 2: startup-home-advanced (ONE-SHOT)
    // ------------------------------------------------------------
    if (mode === "stage2") {
      // Extra safety: don't allow stage1/controller overlap
      tryStop(ns, stage1Script, "home");
      tryStop(ns, controllerScript, "home");

      if (!stage2Started) {
        const started = ensureDaemonBestEffort(ns, stage2Script, 1, passthroughArgs);
        if (started) {
          ns.tprint(`[bootstrap] stage2 started one-shot: ${stage2Script}`);
          stage2Started = true;
        }
      }

      await ns.sleep(poll);
      continue;
    }

    // ------------------------------------------------------------
    // Stage 3: controller
    // ------------------------------------------------------------
    // Hard guarantee: no overlap with stage scripts
    tryStop(ns, stage1Script, "home");
    tryStop(ns, stage2Script, "home");
    await ns.sleep(50);

    if (!controllerScript || !ns.fileExists(controllerScript, "home")) {
      ns.tprint(`[bootstrap] ERROR: controller missing on home: ${controllerScript || "(empty)"}`);
      return;
    }

    // If controller isn't running, start it when affordable
    if (!isRunning(ns, controllerScript, "home")) {
      const cost = ns.getScriptRam(controllerScript, "home") * controllerThreads;
      if (!Number.isFinite(cost) || cost <= 0) {
        ns.tprint(`[bootstrap] ERROR: controller RAM cost invalid: ${controllerScript}`);
        return;
      }

      const free = getFreeRam(ns);
      if (free >= cost) {
        const pid = ns.run(controllerScript, controllerThreads);
        if (pid && pid > 0) {
          ns.tprint(
            `[bootstrap] started ${controllerScript} (pid=${pid}) ` +
            `homeMax=${homeMax}GB free=${getFreeRam(ns).toFixed(1)}GB cost=${cost.toFixed(1)}GB`
          );
        } else {
          ns.tprint(`[bootstrap] WARN: failed to start ${controllerScript} (ns.run returned ${pid})`);
        }
      }
    }

    // NEW: Periodic player bootstrap enforcement while we remain alive
    if (playerBootstrap) {
      enforcePlayerBootstrap(ns, {
        hackThreshold: bootHack,
        city: bootCity,
        university: bootUni,
        course: bootCourse,
        crime: bootCrime,
        strictClassMatch: strictClassMatch ?? true,
      });
    }

    if (exitAfterControllerStart && isRunning(ns, controllerScript, "home")) return;

    await ns.sleep(poll);
  }
}

// ------------------------------------------------------------
// Player bootstrap enforcement (no imports; tiny; defensive)
// ------------------------------------------------------------
function enforcePlayerBootstrap(ns, cfg) {
  try {
    if (!ns.singularity) return;
    if (typeof ns.singularity.getCurrentWork !== "function") return;

    // Default strict matching ON unless explicitly set to false
    const strict = cfg.strictClassMatch !== false;

    const p = ns.getPlayer();
    const hacking = ns.getHackingLevel(); // bulletproof vs any getPlayer weirdness

    const w = ns.singularity.getCurrentWork?.() || null;
    const wType = w?.type || "";

    // While hacking < threshold: ensure we are taking the free CS course (Rothman, Sector-12).
    if (hacking < cfg.hackThreshold) {
      // If already in CLASS, only treat it as "ok" if it's the exact bootstrap class (when strict).
      if (wType === "CLASS") {
        if (strict) {
          const loc = String(w?.location || "");
          const cls = String(w?.classType || "");
          if (loc === cfg.university && cls === cfg.course) return;
          // otherwise override to bootstrap course below
        } else {
          // legacy behavior: any class counts, avoid thrash
          return;
        }
      }

      // Travel to city (optional; safe)
      if (typeof ns.singularity.travelToCity === "function" && p.city !== cfg.city) {
        try { ns.singularity.travelToCity(cfg.city); } catch { /* ignore */ }
      }

      // Start the bootstrap course
      if (typeof ns.singularity.universityCourse === "function") {
        const ok = ns.singularity.universityCourse(cfg.university, cfg.course, false);
        if (ok) ns.print(
          `[bootstrap-player] study: ${cfg.course} @ ${cfg.university} (hacking=${hacking} < ${cfg.hackThreshold})`
        );
      }
      return;
    }

    // Once hacking >= threshold: bootstrap enforcement is DONE.
    // Controller/player-policy owns what happens next (prevents CLASS <-> CRIME ping-pong).
    return;
  } catch {
    // No terminal spam; bootstrap stays resilient.
  }
}


// ------------------------------------------------------------
// Helpers (keep tiny; no imports)
// ------------------------------------------------------------
function normPath(p) {
  // Your repo uses "bin/..." paths; strip leading "/" if present.
  return String(p || "").trim().replace(/^\/+/, "");
}

function getFreeRam(ns) {
  const max = ns.getServerMaxRam("home");
  const used = ns.getServerUsedRam("home");
  return Math.max(0, max - used);
}

function isRunning(ns, script, host) {
  try { return ns.isRunning(String(script || ""), host); } catch { return false; }
}

function tryStop(ns, script, host) {
  try {
    if (script && isRunning(ns, script, host)) ns.scriptKill(script, host);
  } catch { /* ignore */ }
}

function ensureDaemonBestEffort(ns, script, threads, args) {
  if (!script) return false;
  if (!ns.fileExists(script, "home")) return false;
  if (isRunning(ns, script, "home")) return false;

  const t = Math.max(1, Math.floor(Number(threads) || 1));
  const cost = ns.getScriptRam(script, "home") * t;
  const free = getFreeRam(ns);

  if (!Number.isFinite(cost) || cost <= 0) return false;
  if (cost > free) return false;

  try {
    const pid = ns.run(script, t, ...(args || []));
    return pid > 0;
  } catch {
    return false;
  }
}

/**
 * Allowlist for stage switching.
 * For your stated goal ("kill all workers"), we only preserve bootstrap itself.
 */
function buildAllowList() {
  return new Set(["bin/bootstrap.js"]);
}

/**
 * Kill everything on host except allowlisted script filenames.
 * Returns number of script filenames it attempted to kill.
 */
function killAllExcept(ns, host, allowSet) {
  let killed = 0;
  const procs = safeArr(() => ns.ps(host), []);
  for (const p of procs) {
    const file = String(p.filename || "");
    if (allowSet.has(file)) continue;

    try {
      // Kill by filename (kills all instances). Matches your "kill all workers" intent.
      ns.scriptKill(file, host);
      killed++;
    } catch { /* ignore */ }
  }
  return killed;
}

function safeArr(fn, fallback) {
  try {
    const v = fn();
    return Array.isArray(v) ? v : fallback;
  } catch { return fallback; }
}

// ------------------------------------------------------------
// Help
// ------------------------------------------------------------
function printHelp(ns) {
  ns.tprint("/bin/bootstrap.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Staged bootstrap workflow:");
  ns.tprint("    1) early-money while home MAX RAM < 64GB");
  ns.tprint("    2) startup-home-advanced ONE-SHOT while home MAX RAM < 1024GB");
  ns.tprint("    3) start controller when home MAX RAM >= 1024GB and controller fits in FREE RAM");
  ns.tprint("  On any stage switch, kills all non-allowlisted scripts on home (\"kill all workers\").");
  ns.tprint("");
  ns.tprint("NEW: Player bootstrap");
  ns.tprint("  While hacking < threshold, enforce FREE Computer Science at Rothman University (Sector-12).");
  ns.tprint("  Once hacking >= threshold, if still in that class, switch to crime.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/bootstrap.js");
  ns.tprint("  run /bin/bootstrap.js --poll 2000");
  ns.tprint("  run /bin/bootstrap.js --playerBootstrap false");
  ns.tprint("  run /bin/bootstrap.js --exitAfterControllerStart true");
  ns.tprint("  run /bin/bootstrap.js --help");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --stage1 <path>               Stage1 script (default bin/early-money.js)");
  ns.tprint("  --stage1Ram <gb>              Stage1 cutoff home MAX RAM (default 64)");
  ns.tprint("  --stage2 <path>               Stage2 script (default bin/startup-home-advanced.js)");
  ns.tprint("  --stage2Ram <gb>              Stage2 cutoff home MAX RAM (default 1024)");
  ns.tprint("  --controller <path>           Controller script (default bin/controller.js)");
  ns.tprint("  --controllerThreads <n>       Controller threads (default 1)");
  ns.tprint("  --killWorkersOnSwitch t|f      Kill all scripts on home except bootstrap (default true)");
  ns.tprint("  --exitAfterControllerStart t|f Exit after starting controller (default false)");
  ns.tprint("  --poll <ms>                    Poll interval (default 5000)");
  ns.tprint("");
  ns.tprint("Player bootstrap flags");
  ns.tprint("  --playerBootstrap t|f          Enable hack<30 study enforcement (default true)");
  ns.tprint("  --bootstrapHackThreshold <n>   Threshold (default 30)");
  ns.tprint("  --bootstrapCity <name>         City to study in (default Sector-12)");
  ns.tprint("  --bootstrapUniversity <name>   University (default Rothman University)");
  ns.tprint("  --bootstrapCourse <name>       Course (default Computer Science)");
  ns.tprint("  --bootstrapCrime <name>        Crime to switch to after threshold (default homicide)");
  ns.tprint("  --strictBootstrapClassMatch t|f Only switch away if class matches exactly (default true)");
  ns.tprint("");
  ns.tprint("Notes");
  ns.tprint("  Args after `--` are forwarded to stage scripts.");
}
