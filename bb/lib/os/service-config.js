/* == FILE: lib/os/service-config.js == */
/** @param {NS} ns */
/*
 * /lib/os/service-config.js
 *
 * Description
 *  Shared config helpers for bbOS service enable/disable state.
 *
 * Notes
 *  - Uses ns.read/ns.write so it works in Bitburner and persists on home.
 *  - Stores only overrides; effective enablement is computed from registry defaults.
 *  - Path normalization:
 *      Scripts often use leading "/" (e.g., /bin/controller.js),
 *      but ns.read/ns.write behave best with NO leading "/" (e.g., data/os-services.json).
 *    This module accepts either style and normalizes safely.
 *  - Robust write detection:
 *      Some environments return unexpected values from ns.write().
 *      We treat write as successful if we can read back the expected JSON.
 */

export const DEFAULT_SERVICE_CONFIG_PATH = "data/os-services.json";

/**
 * Normalize a data/config filename for ns.read/ns.write.
 * - Converts "\": to "/"
 * - Trims leading "./"
 * - Removes ONE leading "/" if present
 * @param {string} path
 * @returns {string}
 */
export function normalizeDataPath(path) {
  const p0 = String(path || "").trim();
  if (!p0) return DEFAULT_SERVICE_CONFIG_PATH;

  let p = p0.replaceAll("\\", "/");
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) p = p.slice(1); // important for ns.write/ns.read
  return p;
}

/**
 * Load persisted config (overrides).
 * @param {NS} ns
 * @param {string} path
 * @returns {{enabled?: Record<string, boolean>, updatedAt?: number}}
 */
export function loadServiceConfig(ns, path = DEFAULT_SERVICE_CONFIG_PATH) {
  const file = normalizeDataPath(path);

  const raw = safeStr(() => ns.read(file), "");
  if (!raw) return { enabled: {}, updatedAt: 0 };

  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return { enabled: {}, updatedAt: 0 };
    if (!obj.enabled || typeof obj.enabled !== "object") obj.enabled = {};
    return obj;
  } catch {
    return { enabled: {}, updatedAt: 0 };
  }
}

/**
 * Save persisted config (overrides).
 * Returns true if write succeeds (robust across ns.write return shapes).
 * @param {NS} ns
 * @param {string} path
 * @param {{enabled?: Record<string, boolean>}} config
 * @returns {boolean}
 */
export function saveServiceConfig(ns, path, config) {
  const file = normalizeDataPath(path);

  const out = {
    enabled: config?.enabled || {},
    updatedAt: Date.now(),
  };

  const payload = JSON.stringify(out, null, 2);

  // Attempt write
  let writeResult;
  try {
    writeResult = ns.write(file, payload, "w");
  } catch {
    writeResult = undefined;
  }

  // Interpret return value *if* useful:
  // - number: bytes written
  // - boolean: explicit success/fail (some implementations)
  // - undefined/other: fall back to readback verification
  if (typeof writeResult === "number" && writeResult > 0) return true;
  if (typeof writeResult === "boolean") return writeResult;

  // Readback verification (authoritative)
  const readBack = safeStr(() => ns.read(file), "");
  if (!readBack) return false;

  // If we can parse and the updatedAt matches, we’re good
  try {
    const obj = JSON.parse(readBack);
    return !!obj && typeof obj === "object" && obj.updatedAt === out.updatedAt;
  } catch {
    // If parsing fails but content matches prefix, still likely written
    return readBack.trim().startsWith("{");
  }
}

/**
 * Compute effective enablement from registry + overrides.
 * Rules:
 *  - If override exists for key, use it.
 *  - Else default: managed services => enabled, non-managed => disabled (conservative).
 * @param {Array<{key:string, managed:boolean}>} registry
 * @param {{enabled?: Record<string, boolean>}} config
 * @returns {Record<string, boolean>}
 */
export function getEffectiveEnabledMap(registry, config) {
  const overrides = config?.enabled || {};
  /** @type {Record<string, boolean>} */
  const effective = {};

  for (const svc of registry) {
    if (Object.prototype.hasOwnProperty.call(overrides, svc.key)) {
      effective[svc.key] = !!overrides[svc.key];
    } else {
      effective[svc.key] = !!svc.managed;
    }
  }
  return effective;
}

function safeStr(fn, fallback) {
  try {
    return String(fn());
  } catch {
    return fallback;
  }
}
