/** @param {NS} ns */


/*


 * /bin/corp-daemon.js


 *


 * Description


 *  Corporation automation daemon (fresh architecture).


 *  Persists state across ticks and auto-resets on corp recreation.


 *


 * Usage


 *  run /bin/corp-daemon.js


 *  run /bin/corp-daemon.js --tickMs 5000 --debug


 *  run /bin/corp-daemon.js --resetState


 *


 * Notes


 *  - State persists in globalThis while this script is running.


 *  - If you "sell CEO position" and create a new corp, the daemon detects


 *    the new corporation name and resets its internal phase/state.


 *  - All logic lives in /lib/corp/orchestrator.js.


 */





import { CORP_CONFIG } from "/config/corp-config.js";


import { runCorpTick } from "/lib/corp/orchestrator.js";





function printHelp(ns) {


  ns.tprint(`


/bin/corp-daemon.js





Description


  Corporation automation daemon (new architecture).


  Persists state across ticks and auto-resets when corporation is recreated.





Usage


  run /bin/corp-daemon.js [--tickMs <ms>] [--debug] [--resetState] [--once]





Flags


  --help         Show this help.


  --tickMs       Override cfg.tickMs (ms).


  --debug        Enable debug logging (cfg.logging.debug = true).


  --resetState   Clear daemon state (also happens automatically on new corp).


  --once         Run a single tick and exit (useful for testing).





Notes


  - If you "sell CEO position" and create a new corp, the daemon resets state


    when corporation name changes.


  - Configure behavior in /config/corp-config.js (we'll expand config soon).


`);


}





export async function main(ns) {


  const flags = ns.flags([


    ["help", false],


    ["tickMs", null],


    ["debug", false],


    ["resetState", false],


    ["once", false],


  ]);





  if (flags.help) {


    printHelp(ns);


    return;


  }





  ns.disableLog("ALL");





  // Clone config so flags can override without mutating import singleton.


  const cfg = structuredCloneSafe(CORP_CONFIG);





  if (Number.isFinite(Number(flags.tickMs))) cfg.tickMs = Number(flags.tickMs);


  if (flags.debug) {


    if (!cfg.logging) cfg.logging = {};


    cfg.logging.debug = true;


  }





  const state = getDaemonStateRoot();


  if (flags.resetState) resetDaemonState(state);





  const tickMs = Math.max(50, Math.floor(Number(cfg?.tickMs ?? 5000)));


  const log = makeLogger(ns, cfg);





  while (true) {


    if (!cfg.enabled) {


      log.debug("daemon", "cfg.enabled=false; idling");


      if (flags.once) return;


      await ns.sleep(1000);


      continue;


    }





    const corp = ns.corporation;


    if (!corp || typeof corp.hasCorporation !== "function") {


      log.debug("daemon", "Corporation API not available; idling");


      if (flags.once) return;


      await ns.sleep(1000);


      continue;


    }





    const hasCorp = safeBool(() => corp.hasCorporation(), false);


    if (!hasCorp) {


      state.meta.lastSeenHasCorp = false;


      log.debug("daemon", "No corporation detected; idling");


      if (flags.once) return;


      await ns.sleep(1000);


      continue;


    }





    const corpInfo = safeObj(() => corp.getCorporation(), null);


    if (!corpInfo) {


      log.warn("daemon", "corp.getCorporation() failed; idling");


      if (flags.once) return;


      await ns.sleep(1000);


      continue;


    }





    const corpName = String(corpInfo.name || "");


    if (state.meta.corpName && state.meta.corpName !== corpName) {


      ns.tprint(`[corp-daemon] Detected new corp "${corpName}" (was "${state.meta.corpName}"); resetting daemon state.`);


      resetDaemonState(state);


    }


    state.meta.corpName = corpName;


    state.meta.lastSeenHasCorp = true;





    // Tick gating


    const now = Date.now();


    if (now - Number(state.meta.lastTickAt || 0) < tickMs) {


      if (flags.once) return;


      await ns.sleep(50);


      continue;


    }


    state.meta.lastTickAt = now;





    try {


      runCorpTick(ns, corp, cfg, state, log);


    } catch (e) {


      ns.tprint(`[corp-daemon] EXCEPTION: ${String(e)}`);


      try { ns.tprint(String(e?.stack || "")); } catch {}


    }





    if (flags.once) return;


    await ns.sleep(50);


  }


}





// ------------------------


// daemon-local logger


// ------------------------





function makeLogger(ns, cfg) {


  const debugEnabled = Boolean(cfg?.logging?.debug);


  const push = (line) => ns.print(line);





  return {


    info: (tag, msg) => push(`[corp/${tag}] ${msg}`),


    warn: (tag, msg) => push(`[corp/${tag}] WARN ${msg}`),


    error: (tag, msg) => push(`[corp/${tag}] ERROR ${msg}`),


    debug: (tag, msg) => { if (debugEnabled) push(`[corp/${tag}] ${msg}`); },


  };


}





// ------------------------


// state + helpers


// ------------------------





function getDaemonStateRoot() {


  const g = globalThis;


  if (!g.__bb_state) g.__bb_state = {};


  if (!g.__bb_state.corpDaemonNew) g.__bb_state.corpDaemonNew = {};


  const s = g.__bb_state.corpDaemonNew;





  if (!s.meta) s.meta = {};


  if (!("corpName" in s.meta)) s.meta.corpName = "";


  if (!("lastTickAt" in s.meta)) s.meta.lastTickAt = 0;


  if (!("lastSeenHasCorp" in s.meta)) s.meta.lastSeenHasCorp = false;





  return s;


}





function resetDaemonState(state) {


  // Keep meta container; reset orchestration state.


  if (!state.meta) state.meta = {};


  state.meta.lastTickAt = 0;





  // Orchestrator state lives under state.corp (namespaced)


  state.corp = null;


}





function structuredCloneSafe(x) {


  try { return structuredClone(x); } catch { return JSON.parse(JSON.stringify(x ?? {})); }


}





function safeObj(fn, fallback) {


  try { return fn(); } catch { return fallback; }


}


function safeBool(fn, fallback) {


  try { return Boolean(fn()); } catch { return fallback; }


}


