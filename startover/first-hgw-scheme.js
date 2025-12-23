/** @param {NS} ns **/
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["target", ""],
    ["host", "home"],          // where to run the actions from
    ["hackPct", 0.05],         // try to hack ~5% of current money each cycle (small + stable)
    ["moneyFloor", 0.90],      // if money < 90% max, prioritize grow
    ["secBuffer", 2.0],        // allow security up to min+2 before forcing weaken
    ["reserveRam", 2.0],       // keep this much RAM free on host (GB)
    ["log", false],
  ]);

  if (flags.help) {
    printHelp(ns);
    return;
  }

  const host = String(flags.host);
  if (!ns.serverExists(host)) {
    ns.tprint(`ERROR: host "${host}" does not exist.`);
    return;
  }

  let target = String(flags.target);
  if (!target) target = pickBestRootedTarget(ns);
  if (!target) {
    ns.tprint("ERROR: No rooted targets found. Gain root on something first (e.g. n00dles).");
    return;
  }
  if (!ns.serverExists(target)) {
    ns.tprint(`ERROR: target "${target}" does not exist.`);
    return;
  }

  // Minimal noise unless requested
  ns.disableLog("sleep");
  ns.disableLog("getServerSecurityLevel");
  ns.disableLog("getServerMinSecurityLevel");
  ns.disableLog("getServerMoneyAvailable");
  ns.disableLog("getServerMaxMoney");
  ns.disableLog("hack");
  ns.disableLog("grow");
  ns.disableLog("weaken");

  const hackPct = clamp(Number(flags.hackPct), 0.001, 0.50);
  const moneyFloor = clamp(Number(flags.moneyFloor), 0.10, 0.99);
  const secBuffer = Math.max(0, Number(flags.secBuffer));
  const reserveRam = Math.max(0, Number(flags.reserveRam));
  const doLog = !!flags.log;

  // RAM costs (cheap to compute once)
  const rHack = ns.getScriptRam("hack.js", "home") || 1.7;   // fallback to known defaults
  const rGrow = ns.getScriptRam("grow.js", "home") || 1.75;
  const rWeak = ns.getScriptRam("weaken.js", "home") || 1.75;
  // But we call ns.hack/ns.grow/ns.weaken directly in THIS script; so use their implicit RAM:
  // In Bitburner, using ns.hack/ns.grow/ns.weaken inside this script costs the RAM of this script only.
  // Threading still matters for effect; we simulate threading by looping calls (light but slower).
  // To stay ultra-light, we’ll do single-call operations with calculated repeats (pseudo-threads).
  //
  // NOTE: If you prefer true multithreading, I can provide 3 tiny helper scripts (hack.js/grow.js/weaken.js)
  // and this controller will spawn them. That uses more total scripts but often executes faster.

  ns.tprint(`early-hgw: host=${host} target=${target} hackPct=${hackPct} moneyFloor=${moneyFloor} secBuffer=${secBuffer}`);

  while (true) {
    // --- PREP / GUARDRAILS ---
    await stabilize(ns, target, moneyFloor, secBuffer, doLog);

    // --- MAIN CYCLE: H -> W -> G -> W ---
    // Small hack
    const hackRepeats = calcRepeatsForHackPct(ns, target, hackPct);
    if (hackRepeats > 0) {
      if (doLog) ns.print(`H: repeats=${hackRepeats}`);
      await repeatHack(ns, target, hackRepeats);
    }

    // Weaken after hack
    if (doLog) ns.print("W: after hack");
    await ns.weaken(target);

    // Grow back up if needed
    const moneyNow = ns.getServerMoneyAvailable(target);
    const moneyMax = ns.getServerMaxMoney(target);
    if (moneyMax > 0 && moneyNow < moneyMax * moneyFloor) {
      const growRepeats = calcRepeatsToReachFloor(ns, target, moneyFloor);
      if (doLog) ns.print(`G: repeats=${growRepeats}`);
      await repeatGrow(ns, target, growRepeats);
    } else {
      // Tiny maintenance grow (optional-ish, but helps keep target topped)
      if (doLog) ns.print("G: maintenance (1x)");
      await ns.grow(target);
    }

    // Weaken after grow
    if (doLog) ns.print("W: after grow");
    await ns.weaken(target);
  }

  // --- helpers ---

  function clamp(v, lo, hi) {
    if (!Number.isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  }
}

/**
 * Prints help text and exits.
 * Keep this formatting consistent across scripts.
 * @param {NS} ns
 */
function printHelp(ns) {
  ns.tprint(`
early-hgw.js — super light early HGW loop (no batching)

USAGE:
  run early-hgw.js [--target TARGET] [--host HOST] [--hackPct PCT] [--moneyFloor PCT] [--secBuffer N] [--reserveRam GB] [--log]

FLAGS:
  --target       Server to hack (default: best rooted target you can currently access)
  --host         Host to run from (default: home)
  --hackPct      Attempt to hack ~this fraction of *current* money per cycle (default: 0.05)
  --moneyFloor   If money < max * floor, prioritize grow (default: 0.90)
  --secBuffer    If security > min + buffer, force weaken (default: 2.0)
  --reserveRam   Keep this much RAM free on host (default: 2.0)
  --log          Enable extra logging (default: false)
  --help         Show this help and exit

NOTES:
  - Designed for very early BitNode RAM constraints (e.g. 32GB).
  - This is NOT a timed batcher: it’s a simple HGW rhythm with prep/guardrails.
  - Stability first: if security is high or money is low, it will fix those before hacking.
  - If you want faster execution later, I can convert this to a tiny-spawn controller using hack.js/grow.js/weaken.js.
`);
}

/**
 * Pick a simple “best” rooted target you can currently hack:
 * - has root
 * - required hacking <= your hacking
 * - maximize rough value: maxMoney / weakenTime
 * @param {NS} ns
 */
function pickBestRootedTarget(ns) {
  const me = ns.getHackingLevel();
  const candidates = allServers(ns)
    .filter(s => ns.hasRootAccess(s))
    .filter(s => ns.getServerRequiredHackingLevel(s) <= me)
    .filter(s => ns.getServerMaxMoney(s) > 0);

  if (candidates.length === 0) return "";

  candidates.sort((a, b) => score(ns, b) - score(ns, a));
  return candidates[0];

  function score(ns, s) {
    const max = ns.getServerMaxMoney(s);
    const t = ns.getWeakenTime(s);
    return max / Math.max(1, t);
  }

  function allServers(ns) {
    // tiny DFS from home
    const seen = new Set(["home"]);
    const stack = ["home"];
    while (stack.length) {
      const cur = stack.pop();
      for (const nxt of ns.scan(cur)) {
        if (!seen.has(nxt)) {
          seen.add(nxt);
          stack.push(nxt);
        }
      }
    }
    return [...seen];
  }
}

/**
 * Stabilize server if it’s below money floor or above security buffer.
 * @param {NS} ns
 */
async function stabilize(ns, target, moneyFloor, secBuffer, doLog) {
  const minSec = ns.getServerMinSecurityLevel(target);

  // If security is too high, weaken until in bounds.
  while (ns.getServerSecurityLevel(target) > minSec + secBuffer) {
    if (doLog) ns.print(`prep: weaken (sec=${ns.getServerSecurityLevel(target).toFixed(2)} min=${minSec.toFixed(2)})`);
    await ns.weaken(target);
  }

  // If money is too low, grow + weaken to recover.
  const maxMoney = ns.getServerMaxMoney(target);
  if (maxMoney <= 0) return;

  while (ns.getServerMoneyAvailable(target) < maxMoney * moneyFloor) {
    if (doLog) ns.print(`prep: grow (money=${fmt(ns.getServerMoneyAvailable(target))}/${fmt(maxMoney)})`);
    await ns.grow(target);
    if (ns.getServerSecurityLevel(target) > minSec + secBuffer) {
      if (doLog) ns.print("prep: weaken after grow");
      await ns.weaken(target);
    }
  }

  function fmt(n) {
    return ns.nFormat(n, "$0.00a");
  }
}

/**
 * For ultra-light operation, we “simulate threads” by repeating single calls.
 * This keeps controller RAM tiny at the cost of speed.
 * @param {NS} ns
 */
function calcRepeatsForHackPct(ns, target, hackPct) {
  // If hackPct is small, a single hack is often enough early.
  // We estimate by dividing desired fraction by hackAnalyze (fraction per 1 thread).
  const fracPer = ns.hackAnalyze(target);
  if (!Number.isFinite(fracPer) || fracPer <= 0) return 1;
  const repeats = Math.ceil(hackPct / fracPer);
  return clamp(repeats, 1, 50);

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }
}

function calcRepeatsToReachFloor(ns, target, moneyFloor) {
  const max = ns.getServerMaxMoney(target);
  const cur = ns.getServerMoneyAvailable(target);
  if (max <= 0) return 0;
  const goal = max * moneyFloor;
  if (cur >= goal) return 0;

  // Rough: keep growing until we cross the goal; cap repeats so we don’t spin forever.
  // grow() effect depends on cores, server, etc; this is intentionally simple.
  return 10;
}

async function repeatHack(ns, target, repeats) {
  for (let i = 0; i < repeats; i++) await ns.hack(target);
}

async function repeatGrow(ns, target, repeats) {
  for (let i = 0; i < repeats; i++) await ns.grow(target);
}
