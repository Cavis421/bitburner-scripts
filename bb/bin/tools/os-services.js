/* == FILE: bin/tools/os-services.js == */
/** @param {NS} ns */
/*
 * /bin/tools/os-services.js
 *
 * Description
 *  bbOS service enablement manager:
 *   - Persists enabled/disabled overrides to a JSON file (default: data/os-services.json)
 *   - Lists effective enablement state (registry defaults + overrides)
 *   - Enables/disables/toggles services by key
 *
 * Notes
 *  - This tool does NOT start/stop scripts. It only manages config/state.
 *  - Controller reads this file to decide what to run (when enabled).
 *
 * Syntax
 *  run /bin/tools/os-services.js --list
 *  run /bin/tools/os-services.js --enable batcher
 *  run /bin/tools/os-services.js --disable trader
 *  run /bin/tools/os-services.js --toggle gangManager
 *  run /bin/tools/os-services.js --reset
 *  run /bin/tools/os-services.js --help
 */

import { getServiceRegistry } from "/lib/os/service-registry.js";
import {
  DEFAULT_SERVICE_CONFIG_PATH,
  normalizeDataPath,
  loadServiceConfig,
  saveServiceConfig,
  getEffectiveEnabledMap,
} from "/lib/os/service-config.js";

const FLAGS = [
  ["help", false],

  // storage
  ["file", DEFAULT_SERVICE_CONFIG_PATH],

  // actions
  ["list", false],
  ["show", false],     // show raw config file
  ["enable", ""],      // service key or comma list
  ["disable", ""],     // service key or comma list
  ["toggle", ""],      // service key or comma list
  ["set", ""],         // format: key=true or key=false (comma list: a=true,b=false)
  ["reset", false],    // clears overrides (back to defaults)
];

export async function main(ns) {
  const flags = ns.flags(FLAGS);
  if (flags.help) {
    printHelp(ns);
    return;
  }

  ns.disableLog("ALL");

  const fileRaw = String(flags.file || DEFAULT_SERVICE_CONFIG_PATH).trim();
  const file = normalizeDataPath(fileRaw);

  const registry = getServiceRegistry();
  const knownKeys = new Set(registry.map((s) => s.key));

  const cfg = loadServiceConfig(ns, file);
  cfg.enabled = cfg.enabled || {};

  const didAction =
    flags.reset ||
    hasText(flags.enable) ||
    hasText(flags.disable) ||
    hasText(flags.toggle) ||
    hasText(flags.set) ||
    flags.show ||
    flags.list;

  if (!didAction) flags.list = true;

  let changed = false;

  if (flags.reset) {
    cfg.enabled = {};
    changed = true;
    ns.tprint(`[bbOS] os-services: reset overrides (defaults will apply).`);
  }

  if (hasText(flags.enable)) {
    const keys = parseKeyList(flags.enable);
    for (const k of keys) {
      assertKnownKey(k, knownKeys);
      cfg.enabled[k] = true;
      changed = true;
    }
    ns.tprint(`[bbOS] os-services: enabled: ${keys.join(", ")}`);
  }

  if (hasText(flags.disable)) {
    const keys = parseKeyList(flags.disable);
    for (const k of keys) {
      assertKnownKey(k, knownKeys);
      cfg.enabled[k] = false;
      changed = true;
    }
    ns.tprint(`[bbOS] os-services: disabled: ${keys.join(", ")}`);
  }

  if (hasText(flags.toggle)) {
    const keys = parseKeyList(flags.toggle);
    const effective = getEffectiveEnabledMap(registry, cfg);
    for (const k of keys) {
      assertKnownKey(k, knownKeys);
      cfg.enabled[k] = !effective[k];
      changed = true;
    }
    ns.tprint(`[bbOS] os-services: toggled: ${keys.join(", ")}`);
  }

  if (hasText(flags.set)) {
    const pairs = String(flags.set).split(",").map((s) => s.trim()).filter(Boolean);
    /** @type {string[]} */
    const touched = [];
    for (const p of pairs) {
      const m = /^([^=]+)=(true|false)$/i.exec(p);
      if (!m) throw new Error(`--set expects "key=true" or "key=false" (comma-separated). Got: ${p}`);
      const key = m[1].trim();
      const val = m[2].toLowerCase() === "true";
      assertKnownKey(key, knownKeys);
      cfg.enabled[key] = val;
      touched.push(`${key}=${val}`);
      changed = true;
    }
    ns.tprint(`[bbOS] os-services: set: ${touched.join(", ")}`);
  }

  if (changed) {
    const ok = saveServiceConfig(ns, file, cfg);
    if (!ok) {
      ns.tprint(`[bbOS] os-services: WARN: failed to write config: ${file}`);
    } else {
      ns.tprint(`[bbOS] os-services: wrote: ${file}`);
    }
  }

  if (flags.show) {
    ns.tprint("--------------------------------------------------------------");
    ns.tprint(`[bbOS] os-services raw config: ${file}`);
    ns.tprint(ns.read(file) || "(empty)");
    ns.tprint("--------------------------------------------------------------");
  }

  if (flags.list) {
    const effective = getEffectiveEnabledMap(registry, cfg);

    ns.tprint("==============================================================");
    ns.tprint("   bbOS SERVICES (enablement)");
    ns.tprint("==============================================================");
    ns.tprint(`Config: ${file}`);
    ns.tprint("");

    for (const s of registry) {
      const eff = !!effective[s.key];
      const hasOverride = Object.prototype.hasOwnProperty.call(cfg.enabled, s.key);
      const ov = hasOverride ? ` override=${cfg.enabled[s.key]}` : "";
      const def = s.managed ? "default=ENABLED" : "default=DISABLED";
      ns.tprint(`  - ${eff ? "[ON ]" : "[OFF]"} ${s.key} (${def}${ov}) -> ${s.script}`);
    }

    ns.tprint("");
    ns.tprint("Notes:");
    ns.tprint("  - This tool only manages config; it does not start/stop scripts.");
    ns.tprint("  - Controller reads this file to decide what to run (when enabled).");
    ns.tprint("==============================================================");
  }
}

function printHelp(ns) {
  ns.tprint("/bin/tools/os-services.js");
  ns.tprint("");
  ns.tprint("Description");
  ns.tprint("  Manage bbOS service enablement overrides (persisted to JSON).");
  ns.tprint("  Defaults: managed services enabled, non-managed disabled.");
  ns.tprint("");
  ns.tprint("Syntax");
  ns.tprint("  run /bin/tools/os-services.js --list");
  ns.tprint("  run /bin/tools/os-services.js --enable batcher");
  ns.tprint("  run /bin/tools/os-services.js --disable trader");
  ns.tprint("  run /bin/tools/os-services.js --toggle gangManager");
  ns.tprint('  run /bin/tools/os-services.js --set "batcher=true,trader=false"');
  ns.tprint("  run /bin/tools/os-services.js --reset");
  ns.tprint("  run /bin/tools/os-services.js --show");
  ns.tprint("  run /bin/tools/os-services.js --help");
  ns.tprint("");
  ns.tprint("Flags");
  ns.tprint("  --file <path>        Config file path (default data/os-services.json)");
  ns.tprint("  --list true|false    Show effective enablement (default true if no action)");
  ns.tprint("  --show true|false    Print raw config file");
  ns.tprint("  --enable <keys>      Enable key or comma-list (e.g. batcher,botnet)");
  ns.tprint("  --disable <keys>     Disable key or comma-list");
  ns.tprint("  --toggle <keys>      Toggle key or comma-list");
  ns.tprint('  --set "<pairs>"      Comma-list: key=true,key=false');
  ns.tprint("  --reset true|false   Clear overrides (back to defaults)");
}

function hasText(v) {
  return String(v || "").trim().length > 0;
}

function parseKeyList(v) {
  return String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function assertKnownKey(key, knownKeys) {
  if (knownKeys.has(key)) return;
  const known = Array.from(knownKeys.values()).sort().join(", ");
  throw new Error(`[bbOS] Unknown service key "${key}". Known keys: ${known}`);
}
