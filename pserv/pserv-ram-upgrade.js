/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // ------------------------------------------------------------
    // HELP FLAG
    // ------------------------------------------------------------
    if (ns.args.includes("--help")) {
        printHelp(ns);
        return;
    }

    // ------------------------------------------------------------
    // Config: tiers from 8GB up to 2048GB (2TB)
    // ------------------------------------------------------------
    const tiers = [];
    for (let ram = 8; ram <= 2048; ram *= 2) {
        tiers.push(ram);
    }

    // ------------------------------------------------------------
    // 1) Show RAM tiers and prices
    // ------------------------------------------------------------
    ns.tprint("==================================================");
    ns.tprint("  PURCHASED SERVER RAM TIERS (up to 2TB)");
    ns.tprint("==================================================");
    ns.tprint(" RAM (GB)\tCost ($)");

    for (const ram of tiers) {
        const cost = ns.getPurchasedServerCost(ram);
        ns.tprint(`${ram.toString().padStart(4)} GB\t${cost.toLocaleString()}`);
    }

    // ------------------------------------------------------------
    // 2) Show current purchased servers and their next tier
    // ------------------------------------------------------------
    const pservs = ns.getPurchasedServers();
    if (pservs.length === 0) {
        ns.tprint("");
        ns.tprint("You don't own any purchased servers yet.");
        return;
    }

    ns.tprint("");
    ns.tprint("==================================================");
    ns.tprint("  CURRENT PURCHASED SERVERS");
    ns.tprint("==================================================");
    ns.tprint("Index  Hostname        RAM     Next Tier / Cost");

    const serverInfo = [];

    const tiersCopy = [...tiers];

    for (let i = 0; i < pservs.length; i++) {
        const host = pservs[i];
        const curRam = ns.getServerMaxRam(host);
        const nextTier = tiersCopy.find(r => r > curRam);

        let nextDesc;
        let nextRam = null;
        let upgradeCost = null;

        if (!nextTier) {
            nextDesc = "MAXED (>= 2TB or above tier list)";
        } else {
            nextRam = nextTier;
            if (typeof ns.getPurchasedServerUpgradeCost === "function") {
                upgradeCost = ns.getPurchasedServerUpgradeCost(host, nextRam);
            } else {
                upgradeCost = ns.getPurchasedServerCost(nextRam);
            }
            nextDesc = `${nextRam} GB for $${upgradeCost.toLocaleString()}`;
        }

        serverInfo.push({
            index: i,
            host,
            curRam,
            nextRam,
            upgradeCost
        });

        const hostLabel = host.padEnd(14);
        const curLabel = `${curRam} GB`.padEnd(8);
        ns.tprint(`[${i.toString().padStart(2)}]  ${hostLabel}  ${curLabel}  ${nextDesc}`);
    }

    // ------------------------------------------------------------
    // 3) Prompt for which pserv to upgrade
    // ------------------------------------------------------------
    ns.tprint("");
    ns.tprint("Enter the index of the pserv you want to upgrade.");
    const input = await ns.prompt("Index of pserv to upgrade:", { type: "text" });

    if (input === null || input === undefined || input === "") {
        ns.tprint("No selection made. Exiting.");
        return;
    }

    const idx = Number(input);
    if (!Number.isInteger(idx) || idx < 0 || idx >= serverInfo.length) {
        ns.tprint(`Invalid index: "${input}". Exiting.`);
        return;
    }

    const selected = serverInfo[idx];

    if (!selected.nextRam) {
        ns.tprint(`Server ${selected.host} is already at or above the highest configured tier.`);
        return;
    }

    if (typeof ns.upgradePurchasedServer !== "function") {
        ns.tprint("Your Bitburner version does not support ns.upgradePurchasedServer.");
        return;
    }

    const money = ns.getServerMoneyAvailable("home");
    const cost = selected.upgradeCost;

    if (money < cost) {
        ns.tprint(
            `Insufficient funds. Need $${cost.toLocaleString()}, but only have $${money.toLocaleString()}.`
        );
        return;
    }

    ns.tprint(
        `Upgrading ${selected.host} from ${selected.curRam} GB to ${selected.nextRam} GB for $${cost.toLocaleString()}...`
    );

    const success = ns.upgradePurchasedServer(selected.host, selected.nextRam);
    if (!success) ns.tprint("Upgrade failed.");
    else ns.tprint("Upgrade successful.");
}

// ------------------------------------------------------------
// HELP TEXT
// ------------------------------------------------------------
function printHelp(ns) {
    const script = "pserv/pserv-ram-upgrade.js";

    ns.tprint("==================================================");
    ns.tprint(`HELP — ${script}`);
    ns.tprint("==================================================");
    ns.tprint("");

    ns.tprint("DESCRIPTION");
    ns.tprint("  One-shot interactive script for upgrading a purchased");
    ns.tprint("  server to its next RAM tier. Displays:");
    ns.tprint("    - All RAM tiers up to 2TB with prices");
    ns.tprint("    - Current purchased servers and their next tier");
    ns.tprint("    - Upgrade cost for each server");
    ns.tprint("  Prompts the user to choose which server to upgrade.");
    ns.tprint("");

    ns.tprint("NOTES");
    ns.tprint("  This script does not loop. It performs a single action.");
    ns.tprint("  Uses ns.prompt(), so it must be run from the terminal.");
    ns.tprint("  Requires a Bitburner version that supports");
    ns.tprint("  ns.upgradePurchasedServer().");
    ns.tprint("");

    ns.tprint("SYNTAX");
    ns.tprint(`  run ${script}`);
    ns.tprint(`  run ${script} --help`);
}
