/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    const target = ns.args[0];
    if (!target) {
        ns.tprint("Usage: run utils/target-status.js <target>");
        return;
    }

    const money   = ns.getServerMoneyAvailable(target);
    const max     = ns.getServerMaxMoney(target);
    const sec     = ns.getServerSecurityLevel(target);
    const minSec  = ns.getServerMinSecurityLevel(target);

    const moneyPct = max > 0 ? (money / max) * 100 : 0;
    const secDelta = sec - minSec;

    const pctPerThread = ns.hackAnalyze(target);

    let tHack = ns.getHackTime(target);
    let tGrow = ns.getGrowTime(target);
    let tWeak = ns.getWeakenTime(target);

    ns.tprint("--------------------------------------------------");
    ns.tprint(`🎯 TARGET STATUS — ${target}`);
    ns.tprint("--------------------------------------------------");
    ns.tprint(`💰 Money:      ${ns.formatNumber(money, 2, 1e3)} / ${ns.formatNumber(max, 2, 1e3)}  (${moneyPct.toFixed(2)}%)`);
    ns.tprint(`🛡 Security:   ${sec.toFixed(2)} (min: ${minSec.toFixed(2)})   Δ=${secDelta.toFixed(2)}`);
    ns.tprint("--------------------------------------------------");
    ns.tprint(`🕒 Times:`);
    ns.tprint(`   Hack:   ${(tHack/1000).toFixed(2)}s`);
    ns.tprint(`   Grow:   ${(tGrow/1000).toFixed(2)}s`);
    ns.tprint(`   Weaken: ${(tWeak/1000).toFixed(2)}s`);
    ns.tprint("--------------------------------------------------");
    ns.tprint(`🔢 Hack % per thread: ${(pctPerThread * 100).toFixed(4)}%`);
    ns.tprint("--------------------------------------------------");
    ns.tprint(`📈 Growth rate: x${ns.getServerGrowth(target)}`);
    ns.tprint("--------------------------------------------------");
    ns.tprint(`Tip: If money < 90% or sec > min+1.0, server is NOT prepped.`);
    ns.tprint("--------------------------------------------------");
}
