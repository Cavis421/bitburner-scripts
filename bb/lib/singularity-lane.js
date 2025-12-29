/** @param {NS} ns */
/*
 * lib/singularity-lane.js
 *
 * Description
 *  Controller lane wrapper for Singularity automation.
 *  Keeps /bin/controller.js clean while preserving â€œquiet terminal / rich logâ€ style.
 *
 * Notes
 *  - Calls into lib/singularity.js which provides probe-safe primitives.
 *  - This module is import-only; not intended to be run directly.
 *
 * Syntax
 *  Imported module (not meant to be run directly)
 */

import {
  maybeBuyTor,
  ensureDarkwebBuyerScript,
  maybeBuyWseBundle,
  acceptFactionInvites,
} from "lib/singularity.js";

export function runSingularityTick(ns, cfg, msgs) {
  if (cfg.autoTor) {
    const r = maybeBuyTor(ns);
    if (r.changed) msgs.push("[darkweb] Purchased TOR");
  }

  if (cfg.autoDarkweb) {
    const r = ensureDarkwebBuyerScript(ns, cfg.darkwebBuyer);
    if (r.changed && r.reason === "started") {
      msgs.push(`[darkweb] started ${cfg.darkwebBuyer}`);
    }
  }

  if (cfg.autoWse) {
    const r = maybeBuyWseBundle(ns);
    if (r.purchased?.length) msgs.push(`[wse] purchased: ${r.purchased.join(", ")}`);
  }

  if (cfg.autoInvites) {
    const r = acceptFactionInvites(ns);
    if (r.joined?.length) msgs.push(`[faction] joined: ${r.joined.join(", ")}`);
  }
}
