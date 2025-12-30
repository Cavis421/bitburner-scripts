import { solvers } from "lib/solvers.js";
const disabledTypes = new Set();

/**
 * bin/find-and-solve.js
 *
 * Finds coding contracts across all discovered hosts and attempts to solve them
 * using the solver library in lib/sovlers.js.
 *
 * DROP-IN UPDATE:
 *  - Does NOT scan purchased servers (pserv-*) to avoid delete/rebuy race crashes.
 *  - Does NOT scan "darkweb".
 *  - Adds safe guards around host existence + ls() to prevent "Invalid hostname" runtime errors.
 */

export function printHelp(ns) {
    ns.tprint(
        [
            "bin/find-and-solve.js",
            "Description:",
            "  Scans the network for .cct files and attempts to solve them using lib/sovlers.js.",
            "",
            "Usage:",
            "  run bin/find-and-solve.js [--once] [--interval ms] [--timeout ms] [--no-worker]",
            "                                [--dry-run] [--host <name>] [--type <substring>]",
            "",
            "Options:",
            "  --help         Show this help and exit.",
            "  --once         Run one pass and exit (default: loop forever).",
            "  --interval     Sleep time between passes in ms (default: 60000).",
            "  --timeout      Max milliseconds per solver when using Worker (default: 5000).",
            "  --no-worker    Run solvers directly (more compatible, no timeout protection).",
            "  --dry-run      Print what would be attempted, but don't call attempt().",
            "  --host         Only check contracts on this host (exact match).",
            "  --type         Only attempt contracts whose type includes this substring (case-insensitive).",
            "  --quiet        Reduce printing (still prints rewards/errors to terminal).",
            "",
            "Notes:",
            "  - If a solver times out in Worker mode, try increasing --timeout or using --no-worker.",
            "  - If a solver returns the wrong answer once, this script disables that solver type for the run.",
            "  - This script skips purchased servers (pserv-*) and 'darkweb' to avoid hostname race errors.",
        ].join("\n")
    );
}

export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
        ["once", false],
        ["interval", 60_000],
        ["timeout", 5_000],
        ["no-worker", false],
        ["dry-run", false],
        ["host", ""],
        ["type", ""],
        ["quiet", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("scan");
    ns.disableLog("sleep");

    const interval = Math.max(250, Number(flags.interval) || 60_000);
    while (true) {
        await attemptAllContracts(ns, flags);

        if (flags.once) return;
        await ns.sleep(interval);
    }
}

export async function attemptAllContracts(ns, flags) {
    const contracts = getContracts(ns, flags);
    if (!flags.quiet) ns.print(`Found ${contracts.length} contracts.`);

    for (const contract of contracts) {
        await attemptContract(ns, contract, flags);
    }
}

export function getContracts(ns, flags) {
    const contracts = [];
    const hostFilter = (flags.host || "").trim();
    const typeFilter = (flags.type || "").trim().toLowerCase();

    for (const host of getAllHosts(ns)) {
        if (hostFilter && host !== hostFilter) continue;

        // Extra safety: host might disappear (pserv upgrade window, etc.)
        if (!ns.serverExists(host)) continue;

        for (const file of safeLs(ns, host, ".cct")) {
            let type = "";
            try {
                type = ns.codingcontract.getContractType(file, host);
            } catch (_e) {
                continue; // skip unreadable / race
            }

            if (typeFilter && !type.toLowerCase().includes(typeFilter)) continue;

            let triesRemaining = 0;
            try {
                triesRemaining = ns.codingcontract.getNumTriesRemaining(file, host);
            } catch (_e) {
                triesRemaining = 0;
            }

            contracts.push({
                host,
                file,
                type,
                triesRemaining,
            });
        }
    }
    return contracts;
}

export async function attemptContract(ns, contract, flags) {
    if (disabledTypes.has(contract.type)) {
        if (!flags.quiet)
            ns.print(
                `SKIP: Solver disabled for "${contract.type}" (previous failure this run).`
            );
        return;
    }

    const solver = solvers[contract.type];
    if (!solver) {
        if (!flags.quiet)
            ns.print(
                `WARNING: No solver for "${contract.type}" on ${contract.host}`
            );
        return;
    }

    if (!flags.quiet) ns.print("Attempting " + JSON.stringify(contract, null, 2));

    let data;
    try {
        data = ns.codingcontract.getData(contract.file, contract.host);
    } catch (e) {
        ns.print(
            `ERROR reading data for "${contract.type}" on ${contract.host}: ${String(
                e
            )}`
        );
        return;
    }

    try {
        const solution = flags["no-worker"]
            ? solver(data)
            : await runInWebWorker(solver, [data], Number(flags.timeout) || 5_000);

        // Guard: verify Compression III output before burning a contract try
        if (contract.type === "Compression III: LZ Compression") {
            const dec = solvers["Compression II: LZ Decompression"];
            if (
                typeof solution !== "string" ||
                !dec ||
                dec(solution) !== String(data)
            ) {
                throw new Error(
                    "Compression III produced invalid encoding (self-check failed). Skipping attempt."
                );
            }
        }

        if (flags["dry-run"]) {
            ns.tprint(
                `[DRY-RUN] Would attempt "${contract.type}" on ${contract.host}:${contract.file} with solution: ${formatSolution(
                    solution
                )}`
            );
            return;
        }

        const reward = ns.codingcontract.attempt(
            solution,
            contract.file,
            contract.host,
            { returnReward: true }
        );

        if (reward) {
            ns.tprint(
                `${reward} for solving "${contract.type}" on ${contract.host}`
            );
            ns.print(`${reward} for solving "${contract.type}" on ${contract.host}`);
        } else {
            ns.tprint(
                `ERROR: Failed to solve "${contract.type}" on ${contract.host} (${contract.file})`
            );
            // Disable this solver type for this run (prevents burning tries on the same wrong solver)
            disabledTypes.add(contract.type);
        }
    } catch (error) {
        ns.print(
            `ERROR solving "${contract.type}" on ${contract.host}: ${String(error)}`
        );
        ns.tprint(
            `ERROR solving "${contract.type}" on ${contract.host}: ${String(error)}`
        );
    }
}

function formatSolution(solution) {
    if (typeof solution === "string") return solution;
    try {
        return JSON.stringify(solution);
    } catch {
        return String(solution);
    }
}

/**
 * Safe ls wrapper:
 * - avoids crashes if host vanishes mid-loop (pserv delete/rebuy window)
 */
function safeLs(ns, host, pattern) {
    try {
        if (!ns.serverExists(host)) return [];
        return ns.ls(host, pattern);
    } catch (_e) {
        return [];
    }
}

/**
 * BFS scan of the network, cached for script lifetime.
 *
 * DROP-IN UPDATE:
 *  - Excludes purchased servers (ns.getPurchasedServers + "pserv-" prefix)
 *  - Excludes "darkweb"
 */
function getAllHosts(ns) {
    // Cache for script lifetime (same as original intent)
    getAllHosts.cache ||= null;
    if (getAllHosts.cache) return getAllHosts.cache;

    const scanned = new Set();
    const toScan = ["home"];

    // Purchased servers can appear/disappear during upgrades. Exclude them.
    const pservs = new Set(ns.getPurchasedServers());

    while (toScan.length > 0) {
        const host = toScan.shift();
        if (scanned.has(host)) continue;

        // Race-safe: host might not exist (during pserv upgrade churn)
        if (!ns.serverExists(host)) continue;

        // Exclusions
        if (host === "darkweb") continue;
        if (pservs.has(host)) continue;
        if (host.startsWith("pserv-")) continue;

        scanned.add(host);

        for (const nextHost of ns.scan(host)) {
            if (!scanned.has(nextHost)) toScan.push(nextHost);
        }
    }

    getAllHosts.cache = Array.from(scanned);
    return getAllHosts.cache;
}

/**
 * Run a function in a WebWorker with a timeout guard.
 * This protects you from accidental infinite loops / very slow solvers.
 */
async function runInWebWorker(fn, args, maxMs = 5000) {
    return new Promise((resolve, reject) => {
        let finished = false;

        let worker;
        try {
            worker = makeWorker(fn, (result) => {
                finished = true;
                resolve(result);
            });
        } catch (e) {
            reject(`Worker creation failed: ${String(e)}`);
            return;
        }

        const timer = setTimeout(() => {
            if (!finished) reject(`${maxMs} ms elapsed.`);
            try {
                worker.terminate();
            } catch {
                /* noop */
            }
        }, maxMs);

        worker.onmessageerror = (e) => {
            clearTimeout(timer);
            try {
                worker.terminate();
            } catch {
                /* noop */
            }
            reject(`Worker message error: ${String(e)}`);
        };

        worker.onerror = (e) => {
            clearTimeout(timer);
            try {
                worker.terminate();
            } catch {
                /* noop */
            }
            reject(`Worker error: ${e?.message || String(e)}`);
        };

        worker.postMessage(args);
    });
}

function makeWorker(workerFunction, cb) {
    // Wrap function safely so syntax issues surface clearly.
    const workerSrc = `
        "use strict";
        const handler = (${workerFunction});
        onmessage = (e) => {
            const result = handler.apply(null, e.data);
            postMessage(result);
        };
    `;

    const workerBlob = new Blob([workerSrc], {
        type: "application/javascript; charset=utf-8",
    });
    const workerBlobURL = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerBlobURL);

    worker.onmessage = (e) => cb(e.data);
    return worker;
}
