/*
 * lib/corp/log.js
 *
 * Lightweight structured logger.
 */

export function makeLogger(ns, cfg, msgs) {
  const debugEnabled = Boolean(cfg?.logging?.debug);

  function push(line) {
    if (msgs) msgs.push(line);
    else ns.print(line);
  }

  return {
    info: (tag, msg) =>
      push(`[corp/${tag}] ${msg}`),

    warn: (tag, msg) =>
      push(`[corp/${tag}] WARN ${msg}`),

    error: (tag, msg) =>
      push(`[corp/${tag}] ERROR ${msg}`),

    debug: (tag, msg) => {
      if (debugEnabled) push(`[corp/${tag}] ${msg}`);
    },
  };
}
