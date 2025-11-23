/** @param {NS} ns **/
export async function main(ns) {
    const servers = getAllServers(ns);
    const todo = [];

    for (const host of servers) {
        if (host === "home") continue;
        if (host.startsWith("pserv")) continue;   // 🚫 EXCLUDE pserv-* servers

        const s = ns.getServer(host);

        if (s.hasAdminRights && !s.backdoorInstalled) {
            todo.push({
                host,
                reqHack: s.requiredHackingSkill,
            });
        }
    }

    if (todo.length === 0) {
        ns.tprint("✅ All rooted non-pserv servers are already backdoored.");
        return;
    }

    todo.sort((a, b) => a.reqHack - b.reqHack);

    ns.tprint("========================================");
    ns.tprint(" Servers that still need backdoors ");
    ns.tprint("========================================");
    for (const s of todo) {
        ns.tprint(`🔌 ${s.host} (req hack: ${s.reqHack})`);
    }
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

    return [...visited];
}
