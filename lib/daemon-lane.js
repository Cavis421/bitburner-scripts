// lib/daemon-lane.js
//
// NOTE: This file assumes your existing ensureDaemon/killScripts APIs from lib/orchestrator.js
//       and your existing helpers in lib/singularity.js + lib/gang.js.

import { ensureDaemon, killScripts } from "lib/orchestrator.js";
import { hasTixAnd4S } from "lib/singularity.js";
import { inGang } from "lib/gang.js";

/** @param {NS} ns */
export function runDaemonLane(ns, cfg, targets, msgs) {
  // Normalize script paths because ns.ps() typically reports filenames without leading "/"
  // e.g. you configure "/bin/foo.js" but ps shows "bin/foo.js".
  const pservScript = normScript(cfg.pserv);
  const batcherScript = normScript(cfg.batcher);
  const botnetScript = normScript(cfg.botnet);
  const traderScript = normScript(cfg.trader);
  const gangScript = normScript(cfg.gangManager);

  // ------------------------------------------------------------
  // pserv-manager: enforce args (maxRam cap policy)
  // ------------------------------------------------------------
  const pservArgs = normArgs(cfg.pservArgs || []);

  // First try: require exact args match.
  let pservRes = ensureDaemon(ns, pservScript, {
    host: "home",
    threads: 1,
    args: pservArgs,
    reserveRam: cfg.reserveRam,
    requireArgsMatch: true,
  });

  // If it's running but args mismatch, kill + restart with desired args.
  if (pservRes?.action === "skipped" && pservRes?.reason === "args-mismatch") {
    // IMPORTANT: killScripts must be given normalized filenames too.
    const killed = killScripts(ns, "home", new Set([pservScript]));

    // Re-ensure (now it should start with correct args)
    pservRes = ensureDaemon(ns, pservScript, {
      host: "home",
      threads: 1,
      args: pservArgs,
      reserveRam: cfg.reserveRam,
      requireArgsMatch: true,
    });

    // Optional: log the forced correction once (only if we actually killed something)
    if (killed?.attempted > 0) {
      msgs.push(`[restart] ${pservScript} (args changed)`);
    }
  }

  msgs.push(...fmtEnsure(pservRes, pservScript, pservArgs));

  // ------------------------------------------------------------
  // batcher
  // ------------------------------------------------------------
  const batchArgs = normArgs([targets.primary]);
  msgs.push(
    ...fmtEnsure(
      ensureDaemon(ns, batcherScript, {
        host: "home",
        threads: 1,
        args: batchArgs,
        reserveRam: cfg.reserveRam,
      }),
      batcherScript,
      batchArgs
    )
  );

  // ------------------------------------------------------------
  // botnet
  // ------------------------------------------------------------
  const botArgs = normArgs([targets.hgw, cfg.hgwMode]);
  msgs.push(
    ...fmtEnsure(
      ensureDaemon(ns, botnetScript, {
        host: "home",
        threads: 1,
        args: botArgs,
        reserveRam: cfg.reserveRam,
      }),
      botnetScript,
      botArgs
    )
  );

  // ------------------------------------------------------------
  // trader (only if stock APIs present)
  // ------------------------------------------------------------
  if (hasTixAnd4S(ns)) {
    msgs.push(
      ...fmtEnsure(
        ensureDaemon(ns, traderScript, { host: "home", threads: 1, reserveRam: cfg.reserveRam }),
        traderScript
      )
    );
  }

  // ------------------------------------------------------------
  // gang manager
  // ------------------------------------------------------------
  if (inGang(ns)) {
    msgs.push(
      ...fmtEnsure(
        ensureDaemon(ns, gangScript, { host: "home", threads: 1, reserveRam: cfg.reserveRam }),
        gangScript
      )
    );
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

// ------------------------------------------------------------
// Normalization helpers
// ------------------------------------------------------------

function normScript(p) {
  // Ensure the script path matches what ns.ps() reports (usually no leading "/")
  return String(p || "").replace(/^\/+/, "");
}

function normArgs(args) {
  // Bitburner process args are best compared as strings to avoid 2048 vs "2048" mismatches
  return (args || []).map((a) => String(a));
}
