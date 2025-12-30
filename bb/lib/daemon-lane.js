// lib/daemon-lane.js

import { ensureDaemon, killScripts } from "lib/orchestrator.js";
import { hasTixAnd4S } from "lib/singularity.js";
import { inGang } from "lib/gang.js";

/** @param {NS} ns */
export function runDaemonLane(ns, cfg, targets, msgs) {
  // Enabled-map support (optional)
  // Controller can pass cfg.servicesEnabled = { batcher:true/false, ... }
  const enabled = (cfg && cfg.servicesEnabled && typeof cfg.servicesEnabled === "object")
    ? cfg.servicesEnabled
    : null;

  const pservScript = normScript(cfg.pserv);
  const batcherScript = normScript(cfg.batcher);
  const botnetScript = normScript(cfg.botnet);
  const traderScript = normScript(cfg.trader);
  const gangScript = normScript(cfg.gangManager);
  const bladeburnerScript = normScript(cfg.bladeburnerManager);

  const pservArgs = normArgs(cfg.pservArgs || []);

  // Helper: decide if a key is enabled (default true if no map present)
  const isEnabled = (key) => {
    if (!enabled) return true;
    if (!Object.prototype.hasOwnProperty.call(enabled, key)) return true;
    return !!enabled[key];
  };

  // Optional: once-per-boot disable log suppression
  // (controller can pass cfg._servicesDisableLogSet; otherwise we'll create one)
  if (!cfg._servicesDisableLogSet) cfg._servicesDisableLogSet = new Set();

  const noteDisabledOnce = (key, script) => {
    if (!msgs) return;
    const tag = `${key}:${script}`;
    if (cfg._servicesDisableLogSet.has(tag)) return;
    cfg._servicesDisableLogSet.add(tag);
    msgs.push(`[os] disabled ${key} (${script})`);
  };

  // ------------------------------------------------------------
  // pserv-manager: enforce args (maxRam cap policy)
  // ------------------------------------------------------------
  if (isEnabled("pserv")) {
    let pservRes = ensureDaemon(ns, pservScript, {
      host: "home",
      threads: 1,
      args: pservArgs,
      reserveRam: cfg.reserveRam,
      requireArgsMatch: true,
    });

    if (pservRes?.action === "skipped" && pservRes?.reason === "args-mismatch") {
      const killed = killScripts(ns, "home", new Set([pservScript]));
      pservRes = ensureDaemon(ns, pservScript, {
        host: "home",
        threads: 1,
        args: pservArgs,
        reserveRam: cfg.reserveRam,
        requireArgsMatch: true,
      });
      if (killed?.attempted > 0) msgs.push(`[restart] ${pservScript} (args changed)`);
    }
    msgs.push(...fmtEnsure(pservRes, pservScript, pservArgs));
  } else {
    noteDisabledOnce("pserv", pservScript);
  }

  // ------------------------------------------------------------
  // batcher: enforce args (target)
  // ------------------------------------------------------------
  if (isEnabled("batcher")) {
    const batchArgs = normArgs([targets.primary]);
    const batchRes = ensureWithArgsPolicy(ns, batcherScript, batchArgs, cfg, msgs);
    msgs.push(...fmtEnsure(batchRes, batcherScript, batchArgs));
  } else {
    noteDisabledOnce("batcher", batcherScript);
  }

  // ------------------------------------------------------------
  // botnet: enforce args (hgw target + mode)
  // ------------------------------------------------------------
  if (isEnabled("botnet")) {
    const botArgs = normArgs([targets.hgw, cfg.hgwMode]);
    const botRes = ensureWithArgsPolicy(ns, botnetScript, botArgs, cfg, msgs);
    msgs.push(...fmtEnsure(botRes, botnetScript, botArgs));
  } else {
    noteDisabledOnce("botnet", botnetScript);
  }

  // ------------------------------------------------------------
  // trader (only if stock APIs present)
  // ------------------------------------------------------------
  if (isEnabled("trader")) {
    if (hasTixAnd4S(ns)) {
      msgs.push(
        ...fmtEnsure(
          ensureDaemon(ns, traderScript, { host: "home", threads: 1, reserveRam: cfg.reserveRam }),
          traderScript
        )
      );
    }
  } else {
    noteDisabledOnce("trader", traderScript);
  }

  // ------------------------------------------------------------
  // gang manager
  // ------------------------------------------------------------
  if (isEnabled("gangManager")) {
    if (inGang(ns)) {
      msgs.push(
        ...fmtEnsure(
          ensureDaemon(ns, gangScript, { host: "home", threads: 1, reserveRam: cfg.reserveRam }),
          gangScript
        )
      );
    }
  } else {
    noteDisabledOnce("gangManager", gangScript);
  }

  // ------------------------------------------------------------
  // intelligence trainer
  // ------------------------------------------------------------
  // PERMANENT: intelligence training is governed by lib/player-policy.js.
  // Controller/daemon-lane MUST NOT spawn bin/intelligence-trainer.js.


  // ------------------------------------------------------------
  // Bladeburner manager (BN6 / SF7+)
  // ------------------------------------------------------------
  if (isEnabled("bladeburnerManager")) {
    const bbRes = ensureDaemon(ns, bladeburnerScript, {
      host: "home",
      threads: 1,
      args: [], // keep daemon args inside the script for now
      reserveRam: cfg.reserveRam,
    });

    if (bbRes?.action && msgs) msgs.push(`[svc] bladeburner: ${bbRes.action}`);
  } else {
    noteDisabledOnce("bladeburnerManager", bladeburnerScript);
  }
}


function ensureWithArgsPolicy(ns, script, args, cfg, msgs) {
  let res = ensureDaemon(ns, script, {
    host: "home",
    threads: 1,
    args,
    reserveRam: cfg.reserveRam,
    requireArgsMatch: true,
  });

  if (res?.action === "skipped" && res?.reason === "args-mismatch") {
    const killed = killScripts(ns, "home", new Set([script]));
    res = ensureDaemon(ns, script, {
      host: "home",
      threads: 1,
      args,
      reserveRam: cfg.reserveRam,
      requireArgsMatch: true,
    });
    if (killed?.attempted > 0) msgs.push(`[restart] ${script} (args changed)`);
  }

  return res;
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
      out.push(`[args] mismatch ${script}${args ? " want " + JSON.stringify(args) : ""}`);
    }
  }
  return out;
}

// ------------------------------------------------------------
// Normalization helpers
// ------------------------------------------------------------

function normScript(p) {
  return String(p || "").replace(/^\/+/, "");
}

function normArgs(args) {
  return (args || []).map((a) => String(a));
}
