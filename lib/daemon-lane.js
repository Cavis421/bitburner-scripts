import { ensureDaemon, killScripts } from "lib/orchestrator.js";
import { hasTixAnd4S } from "lib/singularity.js";
import { inGang } from "lib/gang.js";

export function runDaemonLane(ns, cfg, targets, msgs) {
  // ------------------------------------------------------------
  // pserv-manager: enforce args (maxRam cap policy)
  // ------------------------------------------------------------
  const pservArgs = cfg.pservArgs || [];

  // First try: require exact args match.
  let pservRes = ensureDaemon(ns, cfg.pserv, {
    host: "home",
    threads: 1,
    args: pservArgs,
    reserveRam: cfg.reserveRam,
    requireArgsMatch: true,
  });

  // If it's running but args mismatch, kill + restart with desired args.
  if (pservRes.action === "skipped" && pservRes.reason === "args-mismatch") {
    const killed = killScripts(ns, "home", new Set([cfg.pserv]));
    // Re-ensure (now it should start with correct args)
    pservRes = ensureDaemon(ns, cfg.pserv, {
      host: "home",
      threads: 1,
      args: pservArgs,
      reserveRam: cfg.reserveRam,
      requireArgsMatch: true,
    });

    // Optional: log the forced correction once (only if we actually killed something)
    if (killed.attempted > 0) {
      msgs.push(`[restart] ${cfg.pserv} (args changed)`);
    }
  }

  msgs.push(...fmtEnsure(pservRes, cfg.pserv, pservArgs));

  // ------------------------------------------------------------
  // batcher
  // ------------------------------------------------------------
  msgs.push(...fmtEnsure(
    ensureDaemon(ns, cfg.batcher, {
      host: "home",
      threads: 1,
      args: [targets.primary],
      reserveRam: cfg.reserveRam,
    }),
    cfg.batcher,
    [targets.primary]
  ));

  // ------------------------------------------------------------
  // botnet
  // ------------------------------------------------------------
  msgs.push(...fmtEnsure(
    ensureDaemon(ns, cfg.botnet, {
      host: "home",
      threads: 1,
      args: [targets.hgw, cfg.hgwMode],
      reserveRam: cfg.reserveRam,
    }),
    cfg.botnet,
    [targets.hgw, cfg.hgwMode]
  ));

  // ------------------------------------------------------------
  // trader (only if stock APIs present)
  // ------------------------------------------------------------
  if (hasTixAnd4S(ns)) {
    msgs.push(...fmtEnsure(
      ensureDaemon(ns, cfg.trader, { host: "home", threads: 1, reserveRam: cfg.reserveRam }),
      cfg.trader
    ));
  }

  // ------------------------------------------------------------
  // gang manager
  // ------------------------------------------------------------
  if (inGang(ns)) {
    msgs.push(...fmtEnsure(
      ensureDaemon(ns, cfg.gangManager, { host: "home", threads: 1, reserveRam: cfg.reserveRam }),
      cfg.gangManager
    ));
  }
}

function fmtEnsure(res, script, args = null) {
  const out = [];
  if (!res) return out;

  if (res.action === "started") {
    out.push(`[start] ${script}${args ? " " + JSON.stringify(args) : ""}`);
  } else if (res.action === "skipped") {
    if (res.reason === "insufficient-ram") {
      out.push(`[ram] skip ${script}`);
    } else if (res.reason === "missing-file") {
      out.push(`[missing] ${script}`);
    } else if (res.reason === "args-mismatch") {
      // We usually fix this by restart above, but if restart couldn't happen (RAM, etc)
      out.push(`[args] mismatch ${script}${args ? " want " + JSON.stringify(args) : ""}`);
    }
  }
  return out;
}
