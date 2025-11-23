/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    // Flags:
    // --minutes X   → sample interval in minutes (default 3)
    const flags = ns.flags([
        ["minutes", 3],
    ]);

    const minutes = Number(flags.minutes);
    const INTERVAL = Math.max(5_000, minutes * 60 * 1000); 
    // enforce a minimum 5s to avoid accidental spam

    const METRIC_FILE = "xp-throughput.txt";

    ns.tprint(
        `🧠 XP Throughput Monitor started — interval: ${minutes} min (${(INTERVAL/1000).toFixed(0)}s)`
    );

    let lastXp = ns.getPlayer().exp.hacking;
    let lastTs = Date.now();

    while (true) {
        await ns.sleep(INTERVAL);

        const nowXp = ns.getPlayer().exp.hacking;
        const nowTs = Date.now();

        const gained = nowXp - lastXp;
        const seconds = (nowTs - lastTs) / 1000;
        const xpPerSec = gained / seconds;

        ns.tprint(
            `📊 XP/sec avg over last ${seconds.toFixed(0)}s: ` +
            `${xpPerSec.toFixed(2)} XP/s ` +
            `(gained ${Math.floor(gained).toLocaleString()} XP)`
        );

        // Persist latest throughput sample for xp-to-next-level.js
        const payload = {
            ts: nowTs,
            windowSeconds: seconds,
            gained,
            xpPerSec,
        };
        ns.write(METRIC_FILE, JSON.stringify(payload), "w");

        lastXp = nowXp;
        lastTs = nowTs;
    }
}
