/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
    ]);

    if (flags.help || flags._.length === 0) {
        printHelp(ns);
        return;
    }

    const target = flags._[0];

    if (!ns.serverExists(target)) {
        ns.tprint(`ERROR: Server "${target}" does not exist.`);
        return;
    }

    const path = findPath(ns, "home", target);

    if (!path) {
        ns.tprint(`ERROR: No path found to "${target}".`);
        return;
    }

    // Skip "home" and print connect commands
    for (let i = 1; i < path.length; i++) {
        ns.tprint(`connect ${path[i]}`);
    }
}

/**
 * Breadth-first search to find a path between servers
 */
function findPath(ns, start, target) {
    const queue = [[start]];
    const visited = new Set([start]);

    while (queue.length > 0) {
        const path = queue.shift();
        const node = path[path.length - 1];

        if (node === target) {
            return path;
        }

        for (const neighbor of ns.scan(node)) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([...path, neighbor]);
            }
        }
    }

    return null;
}

/**
 * Prints script help text
 */
function printHelp(ns) {
    ns.tprint(`
connect-path.js

DESCRIPTION
  Finds and prints the connection path from home to a target server.

USAGE
  run connect-path.js <server>
  run connect-path.js --help

EXAMPLE
  run connect-path.js nectar-net

OUTPUT
  connect joesguns
  connect nectar-net

NOTES
  - Uses breadth-first search for shortest path
  - Output is formatted for easy copy/paste
  - Does not automatically execute connect commands
`);
}
