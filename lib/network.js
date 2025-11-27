/**
 * network.js
 *
 * Functions for scanning and mapping the server network.
 * 
*/

/**
 * Traverse the network graph starting at `start` and call `visit`
 * exactly once per discovered host.
 *
 * @param {NS} ns
 * @param {Object} options
 * @param {string} [options.start='home']
 * @param {(host: string, ctx: {depth: number, parent: string | null}) 
 *          => (void|boolean|Promise<void|boolean>)} options.visit
 *        If visit() returns true, traversal stops early.
 */
export async function explore(ns, { start = 'home', visit } = {}) {
    if (typeof visit !== 'function')
        throw new Error("explore: visit callback is required");

    const visited = new Set();
    const stack = [{ host: start, depth: 0, parent: null }];

    while (stack.length > 0) {
        const { host, depth, parent } = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        // Allow async visitor; visitor may early-return true
        const stop = await visit(host, { depth, parent });
        if (stop === true) return;

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push({ host: neighbor, depth: depth + 1, parent: host });
            }
        }
    }
}

/**
 * Build a map of the entire server network starting from `start`.
 *
 * @param {NS} ns
 * @param {string} [start='home']
 * @returns {Promise<Object<string, {
 *   name: string,
 *   depth: number,
 *   parent: string | null,
 *   backdoorInstalled: boolean,
 *   baseDifficulty: number,
 *   cpuCores: number,
 *   ftpPortOpen: boolean,
 *   hackDifficulty: number,
 *   hasAdminRights: boolean,
 *   hostname: string,
 *   httpPortOpen: boolean,
 *   ip: string,
 *   isConnectedTo: string[],
 *   maxRam: number,
 *   minDifficulty: number,
 *   moneyAvailable: number,
 *   moneyMax: number,
 *   numOpenPortsRequired: number,
 *   openPortCount: number,
 *   organizationName: string,
 *   purchasedByPlayer: boolean,
 *   ramUsed: number,
 *   requiredHackingSkill: number,
 *   serverGrowth: number,
 *   smtpPortOpen: boolean,
 *   sqlPortOpen: boolean,
 *   sshPortOpen: boolean
 * }>>}
 */
export async function buildNetworkMap(ns, start = 'home') {
    const network = {};

    await explore(ns, {
        start,
        visit: (host, { depth, parent }) => {
            const s = ns.getServer(host);
            network[host] = {
                name: host,
                depth,
                parent,
                backdoorInstalled: s.backdoorInstalled,
                baseDifficulty: s.baseDifficulty,
                cpuCores: s.cpuCores,
                ftpPortOpen: s.ftpPortOpen,
                hackDifficulty: s.hackDifficulty,
                hasAdminRights: s.hasAdminRights,
                hostname: s.hostname,
                httpPortOpen: s.httpPortOpen,
                ip: s.ip,
                isConnectedTo: s.isConnectedTo,
                maxRam: s.maxRam,
                minDifficulty: s.minDifficulty,
                moneyAvailable: s.moneyAvailable,
                moneyMax: s.moneyMax,
                numOpenPortsRequired: s.numOpenPortsRequired,
                openPortCount: s.openPortCount,
                organizationName: s.organizationName,
                purchasedByPlayer: s.purchasedByPlayer,
                ramUsed: s.ramUsed,
                requiredHackingSkill: s.requiredHackingSkill,
                serverGrowth: s.serverGrowth,
                smtpPortOpen: s.smtpPortOpen,
                sqlPortOpen: s.sqlPortOpen,
                sshPortOpen: s.sshPortOpen,
                hackTime: ns.getHackTime(host),
                growTime: ns.getGrowTime(host),
                weakenTime: ns.getWeakenTime(host)
            };
        }
    });

    return network;
}

/**
 * Find a path from `start` to `target` server.
 *
 * @param {NS} ns
 * @param {string} target
 * @param {string} [start='home']
 * @returns {Promise<string[] | null>} Array of hostnames from start to target,
 *          or null if target is not reachable.
 */
export async function findPath(ns, target, start = 'home') {
    const parent = {};
    let found = false;

    await explore(ns, {
        start,
        visit: (host, ctx) => {
            parent[host] = ctx.parent;
            if (host === target) {
                found = true;
                return true;    // stop traversal
            }
        }
    });

    if (!found) return null;

    const path = [];
    let h = target;
    while (h !== null) {
        path.push(h);
        h = parent[h];
    }
    return path.reverse();
}

/** 
 * Get all rooted servers.
 *
 * @param {NS} ns
 * @returns {string[]} Array of hostnames
 */
export async function getRootedServers(ns) {
    let results = [];
    await explore(ns, {
        start: "home",
        visit: (host) => {
            const s = ns.getServer(host);
            if (s.hasAdminRights && s.maxRam > 0) results.push(host);
        }
    });
    return results;
};