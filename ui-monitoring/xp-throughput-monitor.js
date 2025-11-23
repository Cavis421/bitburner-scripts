/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    // Flags:
    // --minutes X   → sample interval in minutes (default 3)
    // --once        → take a single sample then exit
    // --quiet       → log to ns.print (tail window) instead of ns.tprint
    const flags = ns.flags([
        ["minutes", 3],
        ["once", false],
        ["quiet", false],
    ]);

    const minutes   = Number(flags.minutes);
    const INTERVAL  = Math.max(5_000, minutes * 60 * 1000); // min 5s to avoid spam
    const METRIC_FILE = "xp-throughput.txt";

    // Choose logging sink
    const useQuiet = !!flags.quiet;
    const log = (...args) => {
        if (useQuiet) {
            ns.print(...args);
        } else {
            ns.tprint(...args);
        }
    };

    if (useQuiet) {
        // Give you a live panel if you want to keep it running in the background
        ns.tail();
        ns.clearLog();
    }

    log(
        `🧠 XP Throughput Monitor started — interval: ${minutes} min ` +
        `(${(INTERVAL / 1000).toFixed(0)}s)`
    );

    let lastPlayer = ns.getPlayer();
    let lastXp = lastPlayer.exp.hacking;
    let lastTs = Date.now();

    while (true) {
        await ns.sleep(INTERVAL);

        const nowTs = Date.now();
        const nowPlayer = ns.getPlayer();
        const nowXp = nowPlayer.exp.hacking;

        let gained = nowXp - lastXp;
        let seconds = (nowTs - lastTs) / 1000;

        // Guard against weird timing / reset cases
        if (seconds <= 0) {
            seconds = 1;
        }

        // If XP dropped (e.g. reset), treat as fresh window from 0
        if (gained < 0) {
            gained = nowXp;
            // pretend previous timestamp was one interval ago for a reasonable rate
            seconds = Math.max(1, INTERVAL / 1000);
        }

        const xpPerSec = gained / seconds;

        log(
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

        if (flags.once) {
            // Single-shot mode: useful for dashboards or scripted sampling
            break;
        }

        lastXp = nowXp;
        lastTs = nowTs;
        lastPlayer = nowPlayer;
    }
}
