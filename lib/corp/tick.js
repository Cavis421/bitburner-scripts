export function runCorpTick(ns, corp, cfg, state, log) {
  // 1) Maintenance
  runMaintenance(ns, corp, cfg, log);

  // 2) Exports
  maybeApplyExports(ns, corp, cfg, state, log);

  // 3) Capex
  if (cfg.capex?.enabled) {
    const intents = getBootstrapIntents(ns, corp, cfg, log);
    const max = Number(cfg.capex.maxActionsPerTick || 0);

    let actions = 0;
    for (const intent of intents) {
      if (actions >= max) break;
      if (tryExecuteIntent(ns, corp, state, cfg.capex, log, intent).did) {
        actions++;
      }
    }
  }
}
