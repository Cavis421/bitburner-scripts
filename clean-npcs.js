/** @param {NS} ns **/
export async function main(ns) {
    const pservs = new Set(ns.getPurchasedServers());
    const servers = getAllServers(ns);

    for (const host of servers) {
        if (host === "home") continue;
        if (pservs.has(host)) continue;      // don't touch pservs here

        if (!ns.hasRootAccess(host)) continue;

        ns.tprint(`🔪 Killing all scripts on ${host}...`);
        ns.killall(host);
    }
    ns.tprint("✅ All NPC servers cleaned.");
}

function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];
    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const n of ns.scan(host)) {
            if (!visited.has(n)) stack.push(n);
        }
    }
    return Array.from(visited);
}
