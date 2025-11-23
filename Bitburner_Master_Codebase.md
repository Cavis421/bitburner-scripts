# Bitburner Master Codebase

> This file holds the full Bitburner script toolkit for my runs.  
> Each script is stored in its own section, with the exact filename  
> as used in-game. ChatGPT should treat these as the source of truth.

---

## Table of Contents

Startup & Orchestration  
- [deploy-net.js](#deploy-netjs)
- [early-backdoor-helper.js](#early-backdoor-helperjs)
- [early-batcher.js](#early-batcherjs)
- [net-hwgw-batcher.js](#net-hwgw-batcherjs)
- [root-all.js](#root-alljs)
- [root-and-deploy.js](#root-and-deployjs) — Root everything + initial deploy  
- [startup.txt](#startuptxt)
- [startup-home.txt](#startup-hometxt)
- [startup-home-advanced.js](#startup-home-advancedjs) — Main home bootstrap  
- [timed-net-batcher.js](#timed-net-batcherjs)
- [timed-net-batcher2.js](#timed-net-batcher2js) — Hybrid HWGW batcher (v2)

Batch Workers  
- [batch-grow.js](#batch-growjs) — Timed grow worker  
- [batch-hack.js](#batch-hackjs) — Timed hack worker  
- [batch-weaken.js](#batch-weakenjs) — Timed weaken worker  
- [grow-worker.js](#grow-workerjs)
- [hack-worker.js](#hack-workerjs)
- [weaken-worker.js](#weaken-workerjs)

Botnet / HGW  
- [auto-hgw.js](#auto-hgwjs) — Simple autonomous single-target HGW loop  
- [botnet-hgw-status.js](#botnet-hgw-statusjs) — Status of HGW swarm  
- [botnet-hgw-sync.js](#botnet-hgw-syncjs) — Maintains HGW deployments  
- [clean-npcs.js](#clean-npcsjs)
- [deploy-hgw-swarm.js](#deploy-hgw-swarmjs)
- [home-hgw-manager.js](#home-hgw-managerjs)
- [pserv-hgw-sync.js](#pserv-hgw-syncjs)
- [remote-hgw.js](#remote-hgwjs) — Simple remote HGW worker (optional)
- [xp-all.js](#xp-alljs) — Hard-switch full botnet into XP grind  
- [xp-home-burner.js](#xp-home-burnerjs)

Fleet & Hacknet  
- [clean-pservs.js](#clean-pservsjs)
- [hacknet-manager.js](#hacknet-managerjs)
- [hacknet-smart.js](#hacknet-smartjs) — Smart Hacknet upgrade logic  
- [hacknet-status.js](#hacknet-statusjs) — Snapshot of Hacknet production
- [list-pservs.js](#list-pservsjs)
- [pserv-manager.js](#pserv-managerjs) — Purchase/upgrade server fleet  
- [pserv-process-report.js](#pserv-process-reportjs)
- [pserv-status.js](#pserv-statusjs)
- [purchase_server_8gb.js](#purchase-server-8gbjs)

UI / Monitoring  
- [ops-dashboard.js](#ops-dashboardjs) — One-shot full operational dashboard  
- [process-monitor.js](#process-monitorjs) — Live RAM/thread/PID monitor
- [xp-throughput-monitor.js](#xp-throughput-monitorjs)

Utilities / Info  
- [find-juicy-advanced.js](#find-juicy-advancedjs)
- [find-juicy-target.js](#find-juicy-targetjs)
- [formulas-helper.js](#formulas-helperjs)
- [hacktemplate.txt](#hacktemplatetxt)
- [karma-watch.js](#karma-watchjs) — (Optional) logs karma in real-time
- [prep-target.js](#prep-targetjs)
- [whats-my-bitnode.js](#whats-my-bitnodejs) — Prints current BitNode number  
- [xp-throughput.txt](#xp-throughputtxt)
- [xp-to-next-level.js](#xp-to-next-leveljs) — XP needed to next hacking level  

---

## auto-hgw.js
> Simple standalone HGW script: auto-selects a good target and maintains it at high money / low security

```js
/** @param {NS} ns */
export async function main(ns) {
    const target = findBestTarget(ns);

    if (!target) {
        ns.tprint("❌ No suitable target found.");
        return;
    }

    // Make sure we have root on the target
    if (!ns.hasRootAccess(target)) {
        openPortsAndNuke(ns, target);
    }

    if (!ns.hasRootAccess(target)) {
        ns.tprint(`❌ Still no root on ${target}. Need more port crackers or hacking level.`);
        return;
    }

    ns.tprint(`🎯 Best target: ${target}`);

    const maxMoney = ns.getServerMaxMoney(target);
    const minSec   = ns.getServerMinSecurityLevel(target);

    // With your stats, we can be a little more aggressive
    const moneyThresh    = maxMoney * 0.95;       // 95% of max
    const securityThresh = minSec + 1;            // keep it close to min

    ns.tprint(`💰 Max: ${ns.nFormat(maxMoney, "$0.00a")} | Thresh: ${ns.nFormat(moneyThresh, "$0.00a")}`);
    ns.tprint(`🛡 MinSec: ${minSec.toFixed(2)} | Thresh: ${securityThresh.toFixed(2)}`);

    while (true) {
        const curSec   = ns.getServerSecurityLevel(target);
        const curMoney = ns.getServerMoneyAvailable(target);

        if (curSec > securityThresh) {
            await ns.weaken(target);
        } else if (curMoney < moneyThresh) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}

/** Find all servers reachable from 'home' */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);
        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/** Count how many port crackers we have */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}

/** Try to open ports and nuke target */
function openPortsAndNuke(ns, target) {
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(target);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(target);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(target);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(target);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(target);
    try {
        ns.nuke(target);
    } catch {
        // hasRootAccess will tell us if it worked
    }
}

/** Pick the “best” target: money × growth / security, with some filters */
function findBestTarget(ns) {
    const servers       = getAllServers(ns);
    const hackingLevel  = ns.getHackingLevel();
    const portCrackers  = countPortCrackers(ns);

    let bestTarget = null;
    let bestScore  = 0;

    for (const server of servers) {
        if (server === "home") continue;

        const maxMoney   = ns.getServerMaxMoney(server);
        const minSec     = ns.getServerMinSecurityLevel(server);
        const growth     = ns.getServerGrowth(server);
        const reqHack    = ns.getServerRequiredHackingLevel(server);
        const reqPorts   = ns.getServerNumPortsRequired(server);

        // Skip junk servers
        if (maxMoney <= 250_000) continue;   // ignore tiny ones
        if (growth < 10) continue;           // ignore low-growth
        if (reqHack > hackingLevel) continue;
        if (reqPorts > portCrackers) continue;

        const score = (maxMoney * growth) / minSec;

        if (score > bestScore) {
            bestScore  = score;
            bestTarget = server;
        }
    }

    return bestTarget;
}
```

---


---
## batch-grow.js
>Worker script for timed grow operations
```js
/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const startDelay = Number(ns.args[1] ?? 0);
    const expectedTime = Number(ns.args[2] ?? 0); // grow time

    if (!target) return;

    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.grow(target);
    const end = performance.now();

    const drift = expectedTime - (end - start);
    if (drift > 1) await ns.sleep(drift);
}

```

---


---
## batch-hack.js
> Worker script for timed hack operations
```js
/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const startDelay = Number(ns.args[1] ?? 0);
    const expectedTime = Number(ns.args[2] ?? 0);  // MUST be hack time

    if (!target) return;

    // Delay until batch start
    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.hack(target);
    const end = performance.now();

    const actual = end - start;
    const drift = expectedTime - actual;

    if (drift > 1) await ns.sleep(drift);
}
```

---


---
## batch-weaken.js
> Worker script for timed weaken operations
```js
/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const startDelay = Number(ns.args[1] ?? 0);
    const expectedTime = Number(ns.args[2] ?? 0); // weaken time

    if (!target) return;

    if (startDelay > 0) await ns.sleep(startDelay);

    const start = performance.now();
    await ns.weaken(target);
    const end = performance.now();

    const drift = expectedTime - (end - start);
    if (drift > 1) await ns.sleep(drift);
}
```

--- 

---
## botnet-hgw-status.js
> Shows all HGW workers and targets running on pservs
```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const workerScript = "remote-hgw.js";

    // --- Discover ALL servers ---
    const allServers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());

    ns.tprint("🛰  FULL BOTNET HGW STATUS");
    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("Server               Type     RAM(GB)   Threads   Target");
    ns.tprint("────────────────────────────────────────────────────────────");

    // Collect info entries
    const entries = [];

    for (const host of allServers) {
        if (!ns.hasRootAccess(host)) continue; // skip unrooted

        const ram = ns.getServerMaxRam(host);
        if (ram < 2) continue; // too small to matter

        const procs = ns.ps(host);
        const hgwProcs = procs.filter(p => p.filename === workerScript);

        let threads = 0;
        let target = "-";

        if (hgwProcs.length > 0) {
            threads = hgwProcs.reduce((sum, p) => sum + p.threads, 0);
            target = hgwProcs[0].args[0] ?? "-";
        }

        const type =
            host === "home" ? "HOME" :
            pservs.has(host) ? "PSERV" :
            "NPC";

        entries.push({ host, type, ram, threads, target });
    }

    // Sort: by type group first (HOME / PSERV / NPC), then by RAM desc
    const typeOrder = { "HOME":0, "PSERV":1, "NPC":2 };
    entries.sort((a, b) => {
        if (typeOrder[a.type] !== typeOrder[b.type])
            return typeOrder[a.type] - typeOrder[b.type];
        return b.ram - a.ram; // RAM desc
    });

    // Print nicely
    for (const e of entries) {
        const hostPad = e.host.padEnd(18, " ");
        const typePad = e.type.padEnd(7, " ");
        const ramPad  = String(e.ram).padStart(7, " ");
        const thrPad  = String(e.threads).padStart(8, " ");

        ns.tprint(`${hostPad} ${typePad} ${ramPad}   ${thrPad}   ${e.target}`);
    }

    ns.tprint("────────────────────────────────────────────────────────────");
}


// --- Breadth-first server discovery ---
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

```

---


---
## botnet-hgw-sync.js
> deploys/refreshes HGW workers across purchased servers
```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = ns.args[0] || "omega-net";
    const mode = String(ns.args[1] || "xp").toLowerCase();
    const workerScript = "remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`❌ ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`🔄 Botnet HGW sync started. Target: ${target} | Mode: ${mode.toUpperCase()}`);

    const lastRam = {};
    const pservs = new Set(ns.getPurchasedServers());

    while (true) {
        const allServers = getAllServers(ns);

        for (const host of allServers) {
            // We let home + pservs be handled by the batcher.
            if (host === "home") continue;
            if (pservs.has(host)) continue;

            if (!ns.hasRootAccess(host)) continue;

            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < 2) {
                ns.print(`💤 Skipping ${host}: only ${maxRam}GB RAM`);
                continue;
            }

            const running = ns.isRunning(workerScript, host, target, mode);
            const previousRam = lastRam[host] ?? 0;

            const needsDeploy =
                !running ||
                maxRam > previousRam ||
                !ns.fileExists(workerScript, host);

            if (!needsDeploy) continue;

            ns.tprint(`🚀 (re)deploying HGW on ${host}: RAM ${previousRam}GB → ${maxRam}GB`);

            ns.killall(host);

            const ok = await ns.scp(workerScript, host);
            if (!ok) {
                ns.tprint(`⚠️ Failed to SCP ${workerScript} to ${host}`);
                continue;
            }

            const scriptRam = ns.getScriptRam(workerScript);
            const threads = Math.floor(maxRam / scriptRam);

            if (threads < 1) {
                ns.tprint(`⚠️ ${host}: not enough RAM for even 1 thread.`);
                continue;
            }

            const pid = ns.exec(workerScript, host, threads, target, mode);
            if (pid === 0) {
                ns.tprint(`❌ Failed to start ${workerScript} on ${host}`);
                continue;
            }

            lastRam[host] = maxRam;
            ns.print(`✅ ${host}: running ${workerScript} x${threads} vs ${target} [${mode}]`);
        }

        await ns.sleep(10_000); // every 10s, resync
    }
}

/** Breadth-first search of the network */
function getAllServers(ns) {
    const visited = new Set();
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) queue.push(neighbor);
        }
    }

    return Array.from(visited);
}

```

--- 


---
## clean-npcs.js
> Imported from loose script on 2025-11-22

```js
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

```

---

---
## clean-pservs.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns **/
export async function main(ns) {
    const pservs = ns.getPurchasedServers();
    for (const host of pservs) {
        ns.tprint(`🔪 Killing all scripts on ${host}...`);
        ns.killall(host);
    }
    ns.tprint("✅ All pservs cleaned.");
}
```

---

---
## deploy-hgw-swarm.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("getServerMaxRam");
    ns.disableLog("getServerUsedRam");
    ns.disableLog("scan");
    ns.disableLog("sleep");

    const target = ns.args[0] || "n00dles";
    const workerScript = "remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`❌ Cannot deploy – ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`🚚 Deploying HGW swarm (${workerScript}) vs ${target}...`);

    const servers = getAllServers(ns);
    let totalThreads = 0;

    for (const host of servers) {
        if (host === "home") continue;
        if (!ns.hasRootAccess(host)) continue;

        const maxRam = ns.getServerMaxRam(host);
        if (maxRam < 2) {
            ns.print(`💤 Skipping ${host}: too little RAM (${maxRam} GB)`);
            continue;
        }

        const usableRam = maxRam * 0.95;
        const scriptRam = ns.getScriptRam(workerScript, "home");
        const threads = Math.floor(usableRam / scriptRam);
        if (threads < 1) {
            ns.print(`⚠️ ${host}: not enough RAM for even 1 thread.`);
            continue;
        }

        ns.killall(host);
        await ns.scp(workerScript, host);

        const pid = ns.exec(workerScript, host, threads, target);
        if (pid === 0) {
            ns.print(`❌ Failed to start ${workerScript} on ${host}`);
            continue;
        }

        totalThreads += threads;
        ns.tprint(`🚀 ${host}: running ${workerScript} x${threads} vs ${target}`);
        await ns.sleep(5);
    }

    ns.tprint("========== 📊 HGW Swarm Deployment ==========");
    ns.tprint(`🎯 Target: ${target}`);
    ns.tprint(`🧠 Total threads running: ${totalThreads}`);
    ns.tprint("=============================================");
}

function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) stack.push(neighbor);
        }
    }

    return Array.from(visited);
}

```

---

---
## deploy-net.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const manualTarget = ns.args[0] || null;
    const target = manualTarget || findBestTarget(ns);

    if (!target) {
        ns.tprint("❌ No suitable target found.");
        return;
    }

    ns.tprint(`🎯 Deploying farm against: ${target}`);

    const servers = getAllServers(ns);
    const portCrackers = countPortCrackers(ns);

    for (const host of servers) {
        if (host === "home") continue; // handle home separately if you want

        // Try to gain root if we don't have it yet
        if (!ns.hasRootAccess(host)) {
            tryRoot(ns, host, portCrackers);
        }

        if (!ns.hasRootAccess(host)) {
            ns.print(`🔒 Skipping ${host} (no root)`);
            continue;
        }

        const maxRam = ns.getServerMaxRam(host);
        if (maxRam < 2) {
            ns.print(`💤 Skipping ${host} (too little RAM)`);
            continue;
        }

        // Clear the box
        ns.killall(host);

        // Copy worker script
        const script = "remote-hgw.js";
        await ns.scp(script, host);

        const scriptRam = ns.getScriptRam(script);
        const usableRam = maxRam * 0.95; // leave 5% breathing room
        const threads = Math.floor(usableRam / scriptRam);

        if (threads < 1) {
            ns.print(`⚠️ Not enough RAM on ${host} for even 1 thread.`);
            continue;
        }

        const pid = ns.exec(script, host, threads, target);
        if (pid === 0) {
            ns.print(`❌ Failed to exec ${script} on ${host}`);
        } else {
            ns.print(`🚀 ${host}: running ${script} x${threads} vs ${target}`);
        }
    }

    // Optionally, also use some RAM on home itself
    await deployToHome(ns, target);

    ns.tprint("✅ Deployment complete.");
}

/** Use some of home’s RAM as well */
async function deployToHome(ns, target) {
    const host = "home";
    const script = "remote-hgw.js";

    const maxRam  = ns.getServerMaxRam(host);
    const usedRam = ns.getServerUsedRam(host);

    // Leave 32 GB free on home for you / misc scripts
    const reserved = 32;
    const usableRam = Math.max(0, maxRam - usedRam - reserved);

    if (usableRam < 2) {
        ns.print("🏠 Not enough free RAM on home to deploy.");
        return;
    }

    await ns.scp(script, host);

    const scriptRam = ns.getScriptRam(script);
    const threads = Math.floor(usableRam / scriptRam);

    if (threads < 1) {
        ns.print("🏠 Not enough RAM on home for even 1 thread.");
        return;
    }

    ns.print(`🏠 home: running ${script} x${threads} vs ${target}`);
    ns.exec(script, host, threads, target);
}

/** DFS search to get all servers from 'home' */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/** Count how many port crackers we have */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}

/** Try to open ports + nuke if we have enough tools */
function tryRoot(ns, host, portCrackers) {
    const requiredPorts = ns.getServerNumPortsRequired(host);
    if (requiredPorts > portCrackers) return;

    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);

    try {
        ns.nuke(host);
    } catch {
        // if it fails, hasRootAccess will catch that
    }
}

/** “Best” target: maxMoney * growth / security with filters */
function findBestTarget(ns) {
    const servers      = getAllServers(ns);
    const hackingLevel = ns.getHackingLevel();
    const portCrackers = countPortCrackers(ns);

    let bestTarget = null;
    let bestScore  = 0;

    for (const server of servers) {
        if (server === "home") continue;

        const maxMoney = ns.getServerMaxMoney(server);
        const minSec   = ns.getServerMinSecurityLevel(server);
        const growth   = ns.getServerGrowth(server);
        const reqHack  = ns.getServerRequiredHackingLevel(server);
        const reqPorts = ns.getServerNumPortsRequired(server);

        // Filters to avoid junk
        if (maxMoney <= 250_000) continue;
        if (growth < 10) continue;
        if (reqHack > hackingLevel) continue;
        if (reqPorts > portCrackers) continue;

        const score = (maxMoney * growth) / minSec;
        if (score > bestScore) {
            bestScore  = score;
            bestTarget = server;
        }
    }

    return bestTarget;
}

```



---
## early-backdoor-helper.js
> Imported from loose script on 2025-11-22

```js
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

```

---

---
## early-batcher.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const argTarget = ns.args[0]; // optional manual override
    const target = argTarget || findBestTarget(ns);

    if (!target) {
        ns.tprint("❌ No suitable target found.");
        return;
    }

    ns.tprint(`🎯 Batching against: ${target}`);

    // Ensure root
    if (!ns.hasRootAccess(target)) {
        openPortsAndNuke(ns, target);
    }
    if (!ns.hasRootAccess(target)) {
        ns.tprint(`❌ Still no root on ${target}. Need more port crackers or hacking level.`);
        return;
    }

    const hackScript   = "hack-worker.js";
    const growScript   = "grow-worker.js";
    const weakenScript = "weaken-worker.js";

    while (true) {
        const maxRam  = ns.getServerMaxRam("home");
        const usedRam = ns.getServerUsedRam("home");

        // Use up to 90% of home RAM in total
        const targetUsage = maxRam * 0.9;
        const freeForBatch = targetUsage - usedRam;
        if (freeForBatch <= 0) {
            ns.print("🕒 No room for more batches, waiting...");
            await ns.sleep(2000);
            continue;
        }

        const hackRam   = ns.getScriptRam(hackScript);
        const growRam   = ns.getScriptRam(growScript);
        const weakenRam = ns.getScriptRam(weakenScript);

        const perBatchRam = hackRam + growRam + weakenRam;
        let maxThreads = Math.floor(freeForBatch / perBatchRam);

        if (maxThreads < 3) { // need at least 1 of each
            await ns.sleep(2000);
            continue;
        }

        // With lots of RAM, cap the size a bit to avoid massive overkill
        maxThreads = Math.min(maxThreads, 2000);

        // Simple ratio: 20% hack, 40% grow, 40% weaken
        let hThreads = Math.max(1, Math.floor(maxThreads * 0.2));
        let gThreads = Math.max(1, Math.floor(maxThreads * 0.4));
        let wThreads = Math.max(1, maxThreads - hThreads - gThreads);

        ns.print(`🚀 Batch: H=${hThreads}, G=${gThreads}, W=${wThreads}`);

        ns.exec(weakenScript, "home", wThreads, target);
        ns.exec(growScript, "home", gThreads, target);
        ns.exec(hackScript, "home", hThreads, target);

        const weakenTime = ns.getWeakenTime(target);
        await ns.sleep(weakenTime + 200);
    }
}

/** Helpers – same idea as auto-hgw.js */

function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);
        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}

function openPortsAndNuke(ns, target) {
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(target);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(target);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(target);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(target);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(target);
    try {
        ns.nuke(target);
    } catch { }
}

function findBestTarget(ns) {
    const servers       = getAllServers(ns);
    const hackingLevel  = ns.getHackingLevel();
    const portCrackers  = countPortCrackers(ns);

    let bestTarget = null;
    let bestScore  = 0;

    for (const server of servers) {
        if (server === "home") continue;

        const maxMoney = ns.getServerMaxMoney(server);
        const minSec   = ns.getServerMinSecurityLevel(server);
        const growth   = ns.getServerGrowth(server);
        const reqHack  = ns.getServerRequiredHackingLevel(server);
        const reqPorts = ns.getServerNumPortsRequired(server);

        if (maxMoney <= 250_000) continue;
        if (growth < 10) continue;
        if (reqHack > hackingLevel) continue;
        if (reqPorts > portCrackers) continue;

        const score = (maxMoney * growth) / minSec;

        if (score > bestScore) {
            bestScore  = score;
            bestTarget = server;
        }
    }

    return bestTarget;
}

```

---

---
## find-juicy-advanced.js
> Imported from loose script on 2025-11-22

```js
/** find-juicy-advanced.js
 * Advanced juicy target finder:
 *
 * - Filters out trash / too-easy / too-hard / low-money servers.
 * - Considers only rooted, hackable servers within a band of your current level.
 * - Scores by money/sec and security, using Formulas.exe when available.
 * - Falls back to vanilla ns.getHackTime / ns.hackAnalyze* when Formulas.exe is missing.
 *
 * @param {NS} ns
 **/
export async function main(ns) {
    ns.disableLog("ALL");

    // Tunable knobs
    const MIN_MONEY_ABS  = 2_500_000; // skip anything poorer than this
    const MIN_HACK_RATIO = 0.25;      // reqHack must be at least 25% of your level
    const EXCLUDED_SERVERS = new Set([
        "home",
        "n00dles",
        "foodnstuff",
        "sigma-cosmetics",
        "joesguns",
        "harakiri-sushi",
        "hong-fang-tea",
    ]);

    const hackingLevel = ns.getHackingLevel();
    const servers      = getAllServers(ns);

    let best      = null;
    let bestScore = 0;
    const scored  = [];

    for (const host of servers) {
        if (EXCLUDED_SERVERS.has(host)) continue;

        const s = ns.getServer(host);

        // Must be rooted and hackable
        if (!s.hasAdminRights) continue;
        if (s.requiredHackingSkill > hackingLevel) continue;

        // Skip stuff that is *too* easy
        if (s.requiredHackingSkill < hackingLevel * MIN_HACK_RATIO) continue;

        // Must have decent money
        if (s.moneyMax < MIN_MONEY_ABS) continue;

        const {
            maxMoney,
            minSec,
            tHack,
            chance,
            moneyPerSec,
            score,
        } = getAdvancedHackMetrics(ns, host, s);

        scored.push({
            host,
            maxMoney,
            minSec,
            tHack,
            chance,
            moneyPerSec,
            score,
            reqHack: s.requiredHackingSkill,
        });

        if (score > bestScore) {
            bestScore = score;
            best      = scored[scored.length - 1];
        }
    }

    if (!best) {
        ns.tprint("❌ No juicy advanced target found with current filters.");
        ns.tprint("   (Either you need to root more servers, or we’re still early-game.)");
        return;
    }

    const usingFormulas = hasFormulas(ns);

    ns.tprint("=======================================");
    ns.tprint("   🧃 Juiciest Advanced Target");
    ns.tprint("=======================================");
    ns.tprint(`🎯 Host:        ${best.host}`);
    ns.tprint(`💰 Max Money:   ${ns.nFormat(best.maxMoney, "$0.00a")}`);
    ns.tprint(`🧠 Req Hack:    ${best.reqHack} (you: ${ns.getHackingLevel()})`);
    ns.tprint(`🛡 MinSec:      ${best.minSec.toFixed(2)}`);
    ns.tprint(`⏱ Hack Time:   ${(best.tHack / 1000).toFixed(1)}s`);
    ns.tprint(`🎯 Chance:      ${(best.chance * 100).toFixed(1)}%`);
    ns.tprint(`💸 Money/sec:   ${ns.nFormat(best.moneyPerSec * 1000, "$0.00a")}`);
    ns.tprint(`📈 Score:       ${best.score.toExponential(3)} (${usingFormulas ? "🧮 Formulas" : "vanilla"})`);

    // Optional: quick top 5
    scored.sort((a, b) => b.score - a.score);
    const topN = Math.min(5, scored.length);
    ns.tprint("=======================================");
    ns.tprint("   🏆 Top Juicy Candidates");
    ns.tprint("=======================================");
    for (let i = 0; i < topN; i++) {
        const h = scored[i];
        ns.tprint(
            `${i + 1}. ${h.host} | ` +
            `Score=${h.score.toExponential(2)} | ` +
            `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
            `ReqHack=${h.reqHack} | ` +
            `Chance=${(h.chance * 100).toFixed(1)}% | ` +
            `Sec=${h.minSec.toFixed(1)} | ` +
            `T=${(h.tHack / 1000).toFixed(1)}s | ` +
            `$/sec=${ns.nFormat(h.moneyPerSec * 1000, "$0.00a")}`
        );
    }
}

/**
 * Compute metrics for scoring a target.
 *
 * - With Formulas.exe:
 *     - Use ns.formulas.hacking.hackTime / hackChance / hackPercent
 *     - Assume prepped (min difficulty, max money)
 *     - Score is (moneyPerSec / minSec)
 *
 * - Without Formulas.exe:
 *     - Use ns.getHackTime / ns.hackAnalyze / ns.hackAnalyzeChance
 *     - Score is the original: maxMoney / hackTime / minSec
 *
 * This keeps behavior similar pre-Formulas, but upgrades nicely once unlocked.
 *
 * @param {NS} ns
 * @param {string} host
 * @param {Server} s
 */
function getAdvancedHackMetrics(ns, host, s) {
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    // Defensive defaults
    let tHack  = 1;
    let chance = 1;
    let moneyPerSec;
    let score;

    if (hasFormulas(ns)) {
        const player = ns.getPlayer();

        // Assume prepped for scoring
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        try {
            tHack  = ns.formulas.hacking.hackTime(s, player) || 1;
            chance = ns.formulas.hacking.hackChance(s, player) || 1;
            const percent      = ns.formulas.hacking.hackPercent(s, player) || 0;
            const moneyPerHack = maxMoney * percent;
            moneyPerSec        = (moneyPerHack * chance) / tHack;
            score              = moneyPerSec / minSec;
        } catch (_e) {
            // If anything weird happens, fall back to vanilla behavior
            tHack       = ns.getHackTime(host) || 1;
            chance      = ns.hackAnalyzeChance(host) ?? 1;
            moneyPerSec = maxMoney / tHack;
            score       = maxMoney / tHack / minSec;
        }
    } else {
        // Vanilla case: preserve your original-ish scoring style
        tHack       = ns.getHackTime(host) || 1;
        chance      = ns.hackAnalyzeChance(host) ?? 1;
        moneyPerSec = maxMoney / tHack;
        score       = maxMoney / tHack / minSec;
    }

    return { maxMoney, minSec, tHack, chance, moneyPerSec, score };
}

/** Safe check for formulas availability.
 *  Only touch ns.formulas if Formulas.exe exists to avoid early-game errors.
 * @param {NS} ns
 */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking
        );
    } catch (_e) {
        return false;
    }
}

/** DFS all servers reachable from home */
function getAllServers(ns) {
    const visited = new Set();
    const stack   = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/** Count how many port crackers we have on home */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}

```

---

---
## find-juicy-target.js
> Imported from loose script on 2025-11-22

```js
/** find-juicy-target.js
 * Scan all reachable servers and pick a "juicy" target:
 * - Good max money
 * - Solid growth
 * - Not too high security
 * - Reasonable hack time (Formulas-aware when available)
 *
 * Prints the best target and a small leaderboard of top candidates.
 *
 * @param {NS} ns
 **/
export async function main(ns) {
    ns.disableLog("ALL");

    const servers      = getAllServers(ns);
    const hackingLevel = ns.getHackingLevel();
    const portCrackers = countPortCrackers(ns);

    let bestHost  = null;
    let bestScore = 0;
    const scored  = [];

    for (const host of servers) {
        if (host === "home") continue;

        const s = ns.getServer(host);
        const maxMoney = s.moneyMax;
        const minSec   = s.minDifficulty || 1;
        const growth   = s.serverGrowth;
        const reqHack  = s.requiredHackingSkill;
        const reqPorts = s.numOpenPortsRequired; // pre-root is fine here

        // Skip servers that are obviously trash or out of reach
        if (maxMoney <= 0) continue;
        if (maxMoney < 250_000) continue;       // ignore tiny money servers
        if (growth < 10) continue;              // low growth = meh
        if (reqHack > hackingLevel) continue;   // too hard for us
        if (reqPorts > portCrackers) continue;  // need more port crackers

        // Formulas-aware hack time when available, vanilla fallback otherwise
        const hackTime = getJuicyHackTime(ns, host) || 1;

        // Higher money, growth, and lower sec/time → better
        const score = (maxMoney * growth) / (minSec * hackTime);

        scored.push({ host, maxMoney, growth, minSec, hackTime, score });

        if (score > bestScore) {
            bestScore = score;
            bestHost  = host;
        }
    }

    if (!bestHost) {
        ns.tprint("❌ No juicy target found. (Probably need more hacking level or port crackers.)");
        return;
    }

    // Sort for a little leaderboard
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    ns.tprint("=======================================");
    ns.tprint("   🧃 Juiciest Target Found");
    ns.tprint("=======================================");
    ns.tprint(`🎯 Host: ${best.host}`);
    ns.tprint(`💰 Max Money: ${ns.nFormat(best.maxMoney, "$0.00a")}`);
    ns.tprint(`🌱 Growth: ${best.growth.toFixed(1)}`);
    ns.tprint(`🛡 Min Security: ${best.minSec.toFixed(2)}`);
    ns.tprint(`⏱ Hack Time: ${(best.hackTime / 1000).toFixed(1)}s`);
    ns.tprint(`📈 Score: ${best.score.toExponential(3)}  (${hasFormulas(ns) ? "🧮 Formulas" : "vanilla"})`);

    // Print top 5 for context
    ns.tprint("=======================================");
    ns.tprint("   🏆 Top 5 Juicy Targets");
    ns.tprint("=======================================");
    const topN = Math.min(5, scored.length);
    for (let i = 0; i < topN; i++) {
        const h = scored[i];
        ns.tprint(
            `${i + 1}. ${h.host} | ` +
            `Score=${h.score.toExponential(2)} | ` +
            `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
            `Grow=${h.growth.toFixed(1)} | ` +
            `Sec=${h.minSec.toFixed(1)} | ` +
            `T=${(h.hackTime / 1000).toFixed(1)}s`
        );
    }
}

/**
 * Formulas-aware hack time helper:
 * - If Formulas.exe is present, use ns.formulas.hacking.hackTime()
 *   assuming prepped-ish (min security, max money).
 * - Otherwise, fall back to ns.getHackTime(host).
 *
 * @param {NS} ns
 * @param {string} host
 */
function getJuicyHackTime(ns, host) {
    if (!hasFormulas(ns)) {
        return ns.getHackTime(host);
    }

    const player = ns.getPlayer();
    const s = ns.getServer(host);

    // Assume prepped for speed estimation
    if (typeof s.minDifficulty === "number") {
        s.hackDifficulty = s.minDifficulty;
    }
    if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
        s.moneyAvailable = s.moneyMax;
    }

    try {
        return ns.formulas.hacking.hackTime(s, player);
    } catch (_e) {
        // Extremely defensive: if anything goes wrong, fall back
        return ns.getHackTime(host);
    }
}

/** Safe check for formulas availability.
 *  This matches the pattern in other scripts: only touch ns.formulas
 *  if Formulas.exe exists to avoid early-game errors.
 * @param {NS} ns
 */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking &&
            typeof ns.formulas.hacking.hackTime === "function"
        );
    } catch (_e) {
        return false;
    }
}

/** DFS all servers reachable from home */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/** Count how many port crackers we have on home */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}

```

---

---
## formulas-helper.js
> Imported from loose script on 2025-11-22

```js
// formulas-helper.js (or at top of your script)
/** @param {NS} ns */
export function hasFormulas(ns) {
    // Safe: ns.formulas is only usable when Formulas.exe exists
    return ns.fileExists("Formulas.exe", "home");
}

/** @param {NS} ns */
export function getHackTimes(ns, target) {
    if (hasFormulas(ns)) {
        const player = ns.getPlayer();
        const server = ns.getServer(target);
        return {
            hack:   ns.formulas.hacking.hackTime(server, player),
            grow:   ns.formulas.hacking.growTime(server, player),
            weaken: ns.formulas.hacking.weakenTime(server, player),
        };
    } else {
        return {
            hack:   ns.getHackTime(target),
            grow:   ns.getGrowTime(target),
            weaken: ns.getWeakenTime(target),
        };
    }
}

/** @param {NS} ns */
export function getHackStats(ns, target) {
    if (hasFormulas(ns)) {
        const player = ns.getPlayer();
        const server = ns.getServer(target);
        return {
            chance:  ns.formulas.hacking.hackChance(server, player),
            percent: ns.formulas.hacking.hackPercent(server, player),
            exp:     ns.formulas.hacking.hackExp(server, player),
        };
    } else {
        return {
            chance:  ns.hackAnalyzeChance(target),
            percent: ns.hackAnalyze(target),
            // exp isn’t exposed without formulas; just return null
            exp:     null,
        };
    }
}

```

---

---
## grow-worker.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0];
    if (!target) return;
    await ns.grow(target);
}

```

---

---
## hacknet-manager.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Max fraction of your current money this script is allowed to spend per cycle
    const spendFraction = 0.10;  // 10%

    ns.tprint("⚙️ hacknet-manager started (spend up to 10% of money per cycle).");

    while (true) {
        const money  = ns.getServerMoneyAvailable("home");
        const budget = money * spendFraction;

        // If you're broke, chill a bit
        if (budget < 1e5) { // < 100k
            await ns.sleep(5000);
            continue;
        }

        const numNodes = ns.hacknet.numNodes();

        // Track best upgrade
        let best = {
            type: null,   // "node" | "level" | "ram" | "core"
            index: -1,    // which node (for upgrades)
            cost: Infinity
        };

        // Option 1: buy a new node
        const newNodeCost = ns.hacknet.getPurchaseNodeCost();
        if (newNodeCost < best.cost) {
            best = { type: "node", index: -1, cost: newNodeCost };
        }

        // Option 2–4: upgrade existing nodes
        for (let i = 0; i < numNodes; i++) {
            const costLevel = ns.hacknet.getLevelUpgradeCost(i, 1);
            const costRam   = ns.hacknet.getRamUpgradeCost(i, 1);
            const costCore  = ns.hacknet.getCoreUpgradeCost(i, 1);

            if (costLevel < best.cost) best = { type: "level", index: i, cost: costLevel };
            if (costRam   < best.cost) best = { type: "ram",   index: i, cost: costRam   };
            if (costCore  < best.cost) best = { type: "core",  index: i, cost: costCore  };
        }

        // If even the cheapest option is outside our budget, wait and try again
        if (best.cost > budget || !isFinite(best.cost)) {
            // ns.print(`No affordable Hacknet upgrade yet (cheapest=${ns.nFormat(best.cost, "0.00a")}, budget=${ns.nFormat(budget, "0.00a")})`);
            await ns.sleep(5000);
            continue;
        }

        // Perform the chosen upgrade
        switch (best.type) {
            case "node":
                const nodeIdx = ns.hacknet.purchaseNode();
                if (nodeIdx !== -1) {
                    ns.print(`🆕 Bought Hacknet node #${nodeIdx} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;

            case "level":
                if (ns.hacknet.upgradeLevel(best.index, 1)) {
                    ns.print(`⬆️ Level +1 on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;

            case "ram":
                if (ns.hacknet.upgradeRam(best.index, 1)) {
                    ns.print(`🧠 RAM +1 step on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;

            case "core":
                if (ns.hacknet.upgradeCore(best.index, 1)) {
                    ns.print(`🧪 Core +1 on node ${best.index} for ${ns.nFormat(best.cost, "0.00a")}`);
                }
                break;
        }

        // Short sleep so we don't spam upgrades too fast
        await ns.sleep(1000);
    }
}

```

---

---
## hacknet-smart.js
> Smart Hacknet logic: buys and upgrades nodes that maximize gain
```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Max RAM you ultimately want per server (default 2048 GB)
    const maxDesiredRam = Number(ns.args[0] ?? 8192); // pass 2048 if you want larger cap

    // How aggressively to spend money:
    // 0.5 = use up to 50% of current money on a single purchase/upgrade
    const spendFraction = 0.5;

    const minRam = 8; // minimum pserv size in GB (Bitburner default)

    ns.tprint(`🧠 pserv-manager started. Target max RAM: ${maxDesiredRam}GB`);

    while (true) {
        const limit = ns.getPurchasedServerLimit();
        let servers = ns.getPurchasedServers();
        const money = ns.getServerMoneyAvailable("home");

        // Build list of {name, ram}
        const info = servers.map(name => ({
            name,
            ram: ns.getServerMaxRam(name)
        })).sort((a, b) => a.ram - b.ram);

        // If we have no servers yet, we treat smallestRam as 0
        const smallestRam = info.length > 0 ? info[0].ram : 0;

        // If all servers already at or above desired max, chill
        if (info.length === limit && smallestRam >= maxDesiredRam) {
            ns.print("✅ All purchased servers at or above target RAM. Sleeping longer.");
            await ns.sleep(60000);
            continue;
        }

        // Decide best RAM we can afford right now
        const budget = money * spendFraction;
        let bestAffordableRam = 0;

        for (let ram = minRam; ram <= maxDesiredRam; ram *= 2) {
            const cost = ns.getPurchasedServerCost(ram);
            if (cost <= budget) {
                bestAffordableRam = ram;
            } else {
                break; // costs only go up from here
            }
        }

        if (bestAffordableRam === 0) {
            ns.print("💸 Not enough money to afford even the smallest upgrade. Waiting...");
            await ns.sleep(10000);
            continue;
        }

        // If we have fewer than the max number of servers: buy a new one
        if (servers.length < limit) {
            const ram = bestAffordableRam;
            const cost = ns.getPurchasedServerCost(ram);

            if (cost > money) {
                ns.print("💸 Not enough money to buy new server with chosen RAM. Waiting...");
                await ns.sleep(10000);
                continue;
            }

            const newName = nextServerName(ns);
            const result = ns.purchaseServer(newName, ram);

            if (result) {
                ns.tprint(`🆕 Purchased ${newName} with ${ram}GB for \$${ns.nFormat(cost, "0.00a")}`);
            } else {
                ns.print("❌ purchaseServer failed unexpectedly.");
            }

            await ns.sleep(500); // small delay
            continue;
        }

        // Else: we are at server limit → upgrade the weakest server if possible
        const weakest = info[0]; // sorted ascending by RAM

        // If the best we can afford is not better than what weakest already has, wait
        if (bestAffordableRam <= weakest.ram) {
            ns.print(`😴 Best affordable RAM (${bestAffordableRam}GB) <= weakest server (${weakest.name}: ${weakest.ram}GB). Waiting...`);
            await ns.sleep(15000);
            continue;
        }

        const upgradeRam = bestAffordableRam;
        const upgradeCost = ns.getPurchasedServerCost(upgradeRam);

        if (upgradeCost > money) {
            ns.print("💸 Not enough money to perform upgrade. Waiting...");
            await ns.sleep(10000);
            continue;
        }

        // Upgrade weakest server by deleting & repurchasing with same name
        ns.tprint(`⬆️ Upgrading ${weakest.name} from ${weakest.ram}GB → ${upgradeRam}GB for \$${ns.nFormat(upgradeCost, "0.00a")}`);

        // Kill scripts and delete
        ns.killall(weakest.name);
        const deleted = ns.deleteServer(weakest.name);
        if (!deleted) {
            ns.tprint(`❌ Failed to delete ${weakest.name}. Maybe scripts still running?`);
            await ns.sleep(5000);
            continue;
        }

        const newServer = ns.purchaseServer(weakest.name, upgradeRam);
        if (!newServer) {
            ns.tprint(`❌ Failed to repurchase ${weakest.name} with ${upgradeRam}GB.`);
        } else {
            ns.tprint(`✅ ${weakest.name} now has ${upgradeRam}GB RAM.`);
        }

        await ns.sleep(1000);
    }
}

/**
 * Generate a new server name if we are below the server limit.
 * Tries pserv-0, pserv-1, ... until it finds a free name.
 */
function nextServerName(ns) {
    const existing = new Set(ns.getPurchasedServers());
    let i = 0;
    while (true) {
        const name = `pserv-${i}`;
        if (!existing.has(name)) return name;
        i++;
    }
}

```


--- 


---
## hacknet-status.js
> Snapshot of Hacknet node levels, RAM, cores, and total production.
```js
/** @param {NS} ns */
function fmt(ns, val, decimals = 3) {
    // Universal formatter using nFormat as fallback
    return ns.nFormat(val, `0.${"0".repeat(decimals)}a`);
}

export async function main(ns) {
    ns.disableLog("ALL");

    const count = ns.hacknet.numNodes();
    if (count === 0) {
        ns.tprint("❌ You don't own any Hacknet nodes yet.");
        return;
    }

    ns.tprint("💻 HACKNET STATUS");
    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("Idx  Level   RAM   Cores   Prod/sec        Lifetime");
    ns.tprint("────────────────────────────────────────────────────────────");

    let totalProd = 0;
    let totalLife = 0;
    let totalLevels = 0;
    let totalRam = 0;
    let totalCores = 0;

    for (let i = 0; i < count; i++) {
        const s = ns.hacknet.getNodeStats(i);

        totalProd  += s.production;
        totalLife  += s.totalProduction;
        totalLevels += s.level;
        totalRam    += s.ram;
        totalCores  += s.cores;

        const idxStr  = String(i).padStart(2, " ");
        const lvlStr  = String(s.level).padStart(5, " ");
        const ramStr  = String(s.ram).padStart(5, " ");
        const coreStr = String(s.cores).padStart(6, " ");

        const prodStr = fmt(ns, s.production, 3).padStart(10, " ");
        const lifeStr = fmt(ns, s.totalProduction, 3).padStart(12, " ");

        ns.tprint(`${idxStr}  ${lvlStr}  ${ramStr}  ${coreStr}   ${prodStr}   ${lifeStr}`);
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint(`Nodes:      ${count}`);
    ns.tprint(`Avg Level:  ${(totalLevels / count).toFixed(1)}`);
    ns.tprint(`Avg RAM:    ${(totalRam / count).toFixed(1)} GB`);
    ns.tprint(`Avg Cores:  ${(totalCores / count).toFixed(1)}`);
    ns.tprint(`Total Prod: ${fmt(ns, totalProd, 3)} / sec`);
    ns.tprint(`Lifetime:   $${fmt(ns, totalLife, 3)}`);
    ns.tprint("────────────────────────────────────────────────────────────");
}

```

---


---
## hacktemplate.txt
> Imported from loose script on 2025-11-22

```txt
/** @param {NS} ns */
export async function main(ns) {
    // Define CLI flags (with a default target)
    const flags = ns.flags([
        ['target', 'joesguns'], // default value
    ]);

    const target = flags.target;

    // Basic safety check
    if (!target) {
        ns.tprint("ERROR: No target provided. Usage: run hack.js --target n00dles");
        return;
    }

    const moneyThresh = ns.getServerMaxMoney(target);
    const securityThresh = ns.getServerMinSecurityLevel(target);

    if (ns.fileExists("BruteSSH.exe", "home")) {
        ns.brutessh(target);
    }

    ns.nuke(target);

    while (true) {
        if (ns.getServerSecurityLevel(target) > securityThresh) {
            await ns.weaken(target);
        } else if (ns.getServerMoneyAvailable(target) < moneyThresh) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}

```

---

---
## hack-worker.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0];
    if (!target) return;
    await ns.hack(target);
}

```

---

---
## home-hgw-manager.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0] || "rho-construction"; // or fallback default
    const workerScript = "remote-hgw.js";

    const HOME_RESERVE = 256; // GB to always keep free on home (tweak this)

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`❌ ${workerScript} not found on home; aborting home HGW manager.`);
        return;
    }

    ns.tprint(`🏠 home-hgw-manager: managing HGW threads on home vs ${target}`);

    while (true) {
        const maxRam = ns.getServerMaxRam("home");
        const usedRam = ns.getServerUsedRam("home");
        const freeRam = maxRam - usedRam - HOME_RESERVE;

        if (freeRam <= 0) {
            await ns.sleep(5000);
            continue;
        }

        const scriptRam = ns.getScriptRam(workerScript, "home");
        if (scriptRam <= 0) {
            ns.tprint(`❌ Could not read RAM usage for ${workerScript}`);
            return;
        }

        const desiredThreads = Math.floor(freeRam / scriptRam);

        // How many threads are already running on home for this target?
        const running = ns.ps("home").filter(
            p => p.filename === workerScript && p.args[0] === target
        );
        const currentThreads = running.reduce((sum, p) => sum + p.threads, 0);

        const toLaunch = desiredThreads - currentThreads;

        if (toLaunch > 0) {
            const pid = ns.exec(workerScript, "home", toLaunch, target);
            if (pid !== 0) {
                ns.tprint(`🚀 home: started ${workerScript} x${toLaunch} vs ${target}`);
            } else {
                ns.print(`⚠️ home-hgw-manager: exec failed; maybe race on RAM.`);
            }
        }

        await ns.sleep(10_000); // adjust every 10s; no need to spam
    }
}

```

---

---
## karma-watch.js
> Logs real-time karma changes using both heart.break and player stats
```js
/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.tail(); // open a small log window

    while (true) {
        ns.clearLog();

        // "Secret" karma function (now semi-documented)
        const karma = ns.heart.break();

        // On newer versions, it's also on getPlayer().karma
        const p = ns.getPlayer();

        ns.print(`Karma (heart.break): ${karma}`);
        if (p.karma !== undefined) {
            ns.print(`Karma (getPlayer):  ${p.karma}`);
        }

        await ns.sleep(1000);
    }
}

```
---

---
## list-pservs.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    const servers = ns.getPurchasedServers();
    ns.tprint("Purchased Servers:");
    for (const s of servers) ns.tprint(" - " + s);
}

```

---

---
## net-hwgw-batcher.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Optional: override target with arg, else auto-pick
    const manualTarget = ns.args[0] || null;
    const target = manualTarget || findBestTarget(ns);

    if (!target) {
        ns.tprint("❌ No suitable target found.");
        return;
    }

    ns.tprint(`🎯 Network HWGW batcher targeting: ${target}`);

    // Pre-root as much of the network as we can
    const allServers = getAllServers(ns);
    const portCrackers = countPortCrackers(ns);

    for (const host of allServers) {
        if (host === "home") continue;
        if (!ns.hasRootAccess(host)) {
            tryRoot(ns, host, portCrackers);
        }
    }

    if (!ns.hasRootAccess(target)) {
        ns.tprint(`❌ No root access on target ${target}. Get more programs / levels.`);
        return;
    }

    const hackScript   = "batch-hack.js";
    const growScript   = "batch-grow.js";
    const weakenScript = "batch-weaken.js";

    // Main batch loop
    while (true) {
        // Recalculate per-batch threads in case your stats changed
        const batchPlan = calcBatchThreads(ns, target, hackScript, growScript, weakenScript);
        if (!batchPlan) {
            ns.tprint("❌ Failed to calculate batch threads (maybe target has no money?).");
            return;
        }

        let { hackThreads, growThreads, weak1Threads, weak2Threads, ramPerBatch } = batchPlan;

        // Get current free RAM across the whole network
        const hosts = getUsableHosts(ns); // includes home with reserve
        const totalFreeRam = hosts.reduce((sum, h) => sum + h.freeRam, 0);

        if (totalFreeRam < ramPerBatch) {
            ns.tprint("⚠️ Not enough total RAM for even one full batch; scaling down.");
        }

        // Scale down threads if needed to fit available RAM
        const totalRamNeededFull =
            (hackThreads * ns.getScriptRam(hackScript)) +
            (growThreads * ns.getScriptRam(growScript)) +
            ((weak1Threads + weak2Threads) * ns.getScriptRam(weakenScript));

        let scale = 1;
        if (totalRamNeededFull > totalFreeRam) {
            scale = totalFreeRam / totalRamNeededFull;
        }

        hackThreads   = Math.max(1, Math.floor(hackThreads * scale));
        growThreads   = Math.max(1, Math.floor(growThreads * scale));
        weak1Threads  = Math.max(1, Math.floor(weak1Threads * scale));
        weak2Threads  = Math.max(1, Math.floor(weak2Threads * scale));

        ns.print(`Batch threads (scaled x${scale.toFixed(2)}): H=${hackThreads}, G=${growThreads}, W1=${weak1Threads}, W2=${weak2Threads}`);

        // Refresh RAM info for allocation
        refreshHostRam(ns, hosts);

        // Allocate threads for each job type across the network
        allocThreads(ns, hosts, weakenScript, target, weak1Threads);
        allocThreads(ns, hosts, hackScript,   target, hackThreads);
        allocThreads(ns, hosts, growScript,   target, growThreads);
        allocThreads(ns, hosts, weakenScript, target, weak2Threads);

        const tHack   = ns.getHackTime(target);
        const tGrow   = ns.getGrowTime(target);
        const tWeaken = ns.getWeakenTime(target);

        const cycleTime = Math.max(tHack, tGrow, tWeaken) + 2000; // little safety buffer

        ns.print(`⏱ Waiting ${ns.tFormat(cycleTime)} for batch to settle...`);
        await ns.sleep(cycleTime);
    }
}

/**
 * Calculate threads for a single HWGW batch targeting ~5% of money.
 */
function calcBatchThreads(ns, target, hackScript, growScript, weakenScript) {
    const maxMoney = ns.getServerMaxMoney(target);
    if (maxMoney <= 0) return null;

    const hackPercent = 0.05; // target 5% of max money per batch
    const hackAnalyzeValue = ns.hackAnalyze(target);

    if (hackAnalyzeValue <= 0) return null;

    let hackThreads = Math.floor(hackPercent / hackAnalyzeValue);
    if (hackThreads < 1) hackThreads = 1;

    // Money after hack: maxMoney * (1 - hackPercent)
    const growMultiplier = 1 / (1 - hackPercent);
    let growThreads = Math.ceil(ns.growthAnalyze(target, growMultiplier));
    if (growThreads < 1) growThreads = 1;

    const secIncreaseHack = ns.hackAnalyzeSecurity(hackThreads);
    const secIncreaseGrow = ns.growthAnalyzeSecurity(growThreads);
    const totalSecIncrease = secIncreaseHack + secIncreaseGrow;

    const weakenPower = ns.weakenAnalyze(1);
    if (weakenPower <= 0) return null;

    const totalWeakenThreads = Math.ceil(totalSecIncrease / weakenPower) || 1;

    // Split weaken threads into two waves
    const weak1Threads = Math.ceil(totalWeakenThreads / 2);
    const weak2Threads = totalWeakenThreads - weak1Threads;

    const hackRam   = ns.getScriptRam(hackScript);
    const growRam   = ns.getScriptRam(growScript);
    const weakenRam = ns.getScriptRam(weakenScript);

    const ramPerBatch =
        (hackThreads * hackRam) +
        (growThreads * growRam) +
        ((weak1Threads + weak2Threads) * weakenRam);

    return {
        hackThreads,
        growThreads,
        weak1Threads,
        weak2Threads,
        ramPerBatch
    };
}

/**
 * Get all reachable servers.
 */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) {
                stack.push(neighbor);
            }
        }
    }

    return Array.from(visited);
}

/**
 * Count port crackers we own.
 */
function countPortCrackers(ns) {
    const programs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return programs.filter(p => ns.fileExists(p, "home")).length;
}

/**
 * Try to root server if we have enough tools.
 */
function tryRoot(ns, host, portCrackers) {
    const reqPorts = ns.getServerNumPortsRequired(host);
    if (reqPorts > portCrackers) return;

    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);

    try {
        ns.nuke(host);
    } catch {
        // ignore; hasRootAccess will tell the truth
    }
}

/**
 * Get list of hosts with free RAM we can use.
 * Home gets special treatment: we keep some RAM free for you.
 */
function getUsableHosts(ns) {
    const hosts = [];
    const allServers = getAllServers(ns);

    for (const host of allServers) {
        if (!ns.hasRootAccess(host)) continue;

        const maxRam = ns.getServerMaxRam(host);
        if (maxRam < 2) continue;

        let usedRam = ns.getServerUsedRam(host);
        let freeRam = maxRam - usedRam;

        if (host === "home") {
            const reserve = 32; // keep 32GB free for other stuff
            freeRam = Math.max(0, maxRam - usedRam - reserve);
        }

        if (freeRam < 1) continue;

        hosts.push({ host, freeRam });
    }

    return hosts;
}

/**
 * Refresh freeRam snapshot for existing host list.
 */
function refreshHostRam(ns, hosts) {
    for (const h of hosts) {
        const maxRam = ns.getServerMaxRam(h.host);
        let usedRam  = ns.getServerUsedRam(h.host);
        let freeRam  = maxRam - usedRam;

        if (h.host === "home") {
            const reserve = 32;
            freeRam = Math.max(0, maxRam - usedRam - reserve);
        }
        h.freeRam = Math.max(0, freeRam);
    }
}

/**
 * Allocate threads for a job type across all hosts.
 */
function allocThreads(ns, hosts, script, target, threadsNeeded) {
    if (threadsNeeded <= 0) return;
    const ramPerThread = ns.getScriptRam(script);

    for (const h of hosts) {
        if (threadsNeeded <= 0) break;
        if (h.freeRam < ramPerThread) continue;

        const maxThreadsHere = Math.floor(h.freeRam / ramPerThread);
        const threadsHere = Math.min(threadsNeeded, maxThreadsHere);
        if (threadsHere <= 0) continue;

        const pid = ns.exec(script, h.host, threadsHere, target);
        if (pid !== 0) {
            h.freeRam -= threadsHere * ramPerThread;
            threadsNeeded -= threadsHere;
        }
    }

    if (threadsNeeded > 0) {
        ns.print(`⚠️ Could not allocate ${threadsNeeded} threads for ${script}; RAM exhausted.`);
    }
}

/**
 * Auto-pick a "good" money target: maxMoney * growth / minSec with reasonable filters.
 */
function findBestTarget(ns) {
    const servers      = getAllServers(ns);
    const hackingLevel = ns.getHackingLevel();
    const portCrackers = countPortCrackers(ns);

    let bestTarget = null;
    let bestScore  = 0;

    for (const server of servers) {
        if (server === "home") continue;

        const maxMoney = ns.getServerMaxMoney(server);
        const minSec   = ns.getServerMinSecurityLevel(server);
        const growth   = ns.getServerGrowth(server);
        const reqHack  = ns.getServerRequiredHackingLevel(server);
        const reqPorts = ns.getServerNumPortsRequired(server);

        if (maxMoney <= 250_000) continue;
        if (growth < 10) continue;
        if (reqHack > hackingLevel) continue;
        if (reqPorts > portCrackers) continue;

        const score = (maxMoney * growth) / minSec;
        if (score > bestScore) {
            bestScore  = score;
            bestTarget = server;
        }
    }

    return bestTarget;
}

```

---

---
## ops-dashboard.js
> One-shot operational snapshot: stats, targets, pservs, Hacknet, botnet
```js
/** Combined operational dashboard for Bitburner
 *  Shows: player/home, target snapshot, botnet, pservs, Hacknet
 *  Usage: run ops-dashboard.js [optional-target-override]
 */

/** Simple number formatter using nFormat (works on all versions) */
/** @param {NS} ns */
function fmt(ns, val, decimals = 3) {
    return ns.nFormat(val, `0.${"0".repeat(decimals)}a`);
}

/** Formulas.exe detection */
function hasFormulas(ns) {
    return (
        typeof ns.formulas !== "undefined" &&
        ns.formulas &&
        typeof ns.formulas.hacking !== "undefined"
    );
}

/**
 * Get hack/grow/weaken times (ms) + chance for a target.
 * Uses Formulas.exe when available, falls back to vanilla timing otherwise.
 */
function getHackGrowWeakenTimes(ns, target) {
    const player = ns.getPlayer();

    if (hasFormulas(ns)) {
        const s = ns.getServer(target);

        // Normalize to "ideal" batch conditions
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        const tHack  = ns.formulas.hacking.hackTime(s, player);
        const tGrow  = ns.formulas.hacking.growTime(s, player);
        const tWeaken = ns.formulas.hacking.weakenTime(s, player);
        const chance = ns.formulas.hacking.hackChance(s, player);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: true };
    } else {
        const tHack  = ns.getHackTime(target);
        const tGrow  = ns.getGrowTime(target);
        const tWeaken = ns.getWeakenTime(target);
        const chance = ns.hackAnalyzeChance(target);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: false };
    }
}

/**
 * Pretty-print a target snapshot (timings, chance, money/sec cap).
 */
function printTargetTiming(ns, target) {
    if (!target || target === "unknown") {
        ns.tprint("📊 Target snapshot: (no active target detected)");
        return;
    }

    const maxMoney = ns.getServerMaxMoney(target);
    const minSec   = ns.getServerMinSecurityLevel(target);

    const { tHack, tGrow, tWeaken, chance, usingFormulas } =
        getHackGrowWeakenTimes(ns, target);

    const moneyPerSecCap =
        maxMoney > 0 && tHack > 0 ? (maxMoney / tHack) * 1000 : 0;

    ns.tprint("📊 TARGET SNAPSHOT");
    ns.tprint(`   Host: ${target}`);
    ns.tprint(
        "   ⏱ Times: " +
        `H=${(tHack / 1000).toFixed(1)}s, ` +
        `G=${(tGrow / 1000).toFixed(1)}s, ` +
        `W=${(tWeaken / 1000).toFixed(1)}s`
    );
    ns.tprint(
        `   🎯 Chance: ${(chance * 100).toFixed(1)}% | ` +
        `MinSec=${minSec.toFixed(2)}`
    );

    if (maxMoney > 0) {
        ns.tprint(
            "   💸 Theo cap: " +
            `Max=${ns.nFormat(maxMoney, "$0.00a")} | ` +
            `~${ns.nFormat(moneyPerSecCap, "$0.00a")}/sec (if perfectly farmed)`
        );
    }

    ns.tprint(
        usingFormulas
            ? "   🧮 Timing model: Formulas.exe"
            : "   🧮 Timing model: vanilla API (no Formulas.exe detected)"
    );
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const targetOverride = ns.args[0];

    // 1) PLAYER / HOME SUMMARY
    const player = ns.getPlayer();

    // Name may not exist in your version; fall back to a generic label
    const playerName =
        player && typeof player.name === "string" && player.name.length > 0
            ? player.name
            : "Player";

    // Hacking level is always safe via ns.getHackingLevel()
    const hackingLevel = ns.getHackingLevel();

    const money    = ns.getServerMoneyAvailable("home");
    const homeMax  = ns.getServerMaxRam("home");
    const homeUsed = ns.getServerUsedRam("home");
    const homeFree = homeMax - homeUsed;

    const guessedTarget = targetOverride || guessMainTarget(ns) || "unknown";

    ns.tprint("🧠 OPS DASHBOARD");
    ns.tprint("=================================================================");
    ns.tprint(`Player: ${playerName}   |   Hacking: ${hackingLevel}`);
    ns.tprint(`Money:  $${fmt(ns, money, 3)}`);
    ns.tprint(`Home RAM: ${homeUsed.toFixed(1)} / ${homeMax.toFixed(1)} GB (free ${homeFree.toFixed(1)} GB)`);
    ns.tprint(`Main target (guessed): ${guessedTarget}`);
    ns.tprint("=================================================================\n");

    // 1b) TARGET SNAPSHOT (formulas-aware when available)
    printTargetTiming(ns, guessedTarget);
    ns.tprint("");

    // 2) BOTNET STATUS (HOME + PSERV + NPC, HGW + BATCH)
    printBotnetStatus(ns, guessedTarget);

    // 3) PSERV FLEET DETAILS
    ns.tprint("");
    printPservStatus(ns);

    // 4) HACKNET SUMMARY
    ns.tprint("");
    printHacknetStatus(ns);

    ns.tprint("\n✅ Dashboard snapshot complete.");
}


/* ---------------- BOTNET STATUS ---------------- */

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

function guessMainTarget(ns) {
    const hosts = getAllServers(ns);
    const candidates = ["timed-net-batcher2.js", "remote-hgw.js"];

    for (const host of hosts) {
        const procs = ns.ps(host);
        for (const p of procs) {
            if (candidates.includes(p.filename) && p.args.length > 0) {
                return p.args[0];
            }
        }
    }
    return null;
}

function printBotnetStatus(ns, guessedTarget) {
    const allServers = getAllServers(ns);
    const pservsSet = new Set(ns.getPurchasedServers());

    const workerScript = "remote-hgw.js";
    const batchScripts = new Set(["batch-hack.js", "batch-grow.js", "batch-weaken.js"]);

    let totalRooted = 0;
    let totalHGWThreads = 0;
    let totalBatchThreads = 0;

    let homeHGW = 0, homeBatch = 0;
    let pservHGW = 0, pservBatch = 0;
    let npcHGW = 0, npcBatch = 0;

    for (const host of allServers) {
        if (!ns.hasRootAccess(host)) continue;
        totalRooted++;

        const procs = ns.ps(host);
        const maxRam = ns.getServerMaxRam(host);

        let hgwThreads = 0;
        let batchThreads = 0;

        for (const p of procs) {
            if (p.filename === workerScript) {
                hgwThreads += p.threads;
            } else if (batchScripts.has(p.filename)) {
                batchThreads += p.threads;
            }
        }

        totalHGWThreads += hgwThreads;
        totalBatchThreads += batchThreads;

        const type =
            host === "home" ? "HOME" :
            pservsSet.has(host) ? "PSERV" :
            "NPC";

        if (type === "HOME") {
            homeHGW += hgwThreads;
            homeBatch += batchThreads;
        } else if (type === "PSERV") {
            pservHGW += hgwThreads;
            pservBatch += batchThreads;
        } else {
            npcHGW += hgwThreads;
            npcBatch += batchThreads;
        }
    }

    ns.tprint("🛰  BOTNET STATUS (HGW + BATCH)");
    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint(`Rooted servers:       ${totalRooted}`);
    ns.tprint("");
    ns.tprint("                 HGW Threads   Batch Threads");
    ns.tprint("                 -----------   -------------");
    ns.tprint(`Home:            ${String(homeHGW).padStart(11)}   ${String(homeBatch).padStart(13)}`);
    ns.tprint(`Purchased (pserv)${String(pservHGW).padStart(11)}   ${String(pservBatch).padStart(13)}`);
    ns.tprint(`NPC Servers:      ${String(npcHGW).padStart(11)}   ${String(npcBatch).padStart(13)}`);
    ns.tprint("                 -----------   -------------");
    ns.tprint(`TOTAL:           ${String(totalHGWThreads).padStart(11)}   ${String(totalBatchThreads).padStart(13)}`);
    ns.tprint("────────────────────────────────────────────────────────────");
}


/* ---------------- PSERV STATUS ---------------- */

function printPservStatus(ns) {
    const pservs = ns.getPurchasedServers();
    const workerScript = "remote-hgw.js";

    ns.tprint("🖥️  PURCHASed SERVER FLEET");
    if (pservs.length === 0) {
        ns.tprint("────────────────────────────────────────────────────────────");
        ns.tprint("You don't own any purchased servers yet.");
        return;
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("Server          RAM(GB)   HGW Threads   Target");
    ns.tprint("────────────────────────────────────────────────────────────");

    let totalRam = 0;
    let totalThreads = 0;

    for (const host of pservs) {
        const ram = ns.getServerMaxRam(host);
        totalRam += ram;

        const procs = ns.ps(host);
        const hgwProcs = procs.filter(p => p.filename === workerScript);

        let threads = 0;
        let target = "-";

        if (hgwProcs.length > 0) {
            threads = hgwProcs.reduce((sum, p) => sum + p.threads, 0);
            target = hgwProcs[0].args[0] ?? "-";
        }

        totalThreads += threads;

        const namePad = host.padEnd(14, " ");
        const ramPad  = String(ram).padStart(7, " ");
        const thrPad  = String(threads).padStart(11, " ");

        ns.tprint(`${namePad}  ${ramPad}   ${thrPad}   ${target}`);
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint(`Total pservs:   ${pservs.length}`);
    ns.tprint(`Total RAM:      ${totalRam.toFixed(1)} GB`);
    ns.tprint(`Total HGW threads: ${totalThreads}`);
    ns.tprint("────────────────────────────────────────────────────────────");
}


/* ---------------- HACKNET STATUS ---------------- */

function printHacknetStatus(ns) {
    const count = ns.hacknet.numNodes();
    ns.tprint("💻 HACKNET STATUS");
    ns.tprint("────────────────────────────────────────────────────────────");

    if (count === 0) {
        ns.tprint("You don't own any Hacknet nodes yet.");
        return;
    }

    ns.tprint("Idx  Level   RAM   Cores   Prod/sec        Lifetime");
    ns.tprint("────────────────────────────────────────────────────────────");

    let totalProd = 0;
    let totalLife = 0;
    let totalLevels = 0;
    let totalRam = 0;
    let totalCores = 0;

    for (let i = 0; i < count; i++) {
        const s = ns.hacknet.getNodeStats(i);

        totalProd   += s.production;
        totalLife   += s.totalProduction;
        totalLevels += s.level;
        totalRam    += s.ram;
        totalCores  += s.cores;

        const idxStr  = String(i).padStart(2, " ");
        const lvlStr  = String(s.level).padStart(5, " ");
        const ramStr  = String(s.ram).padStart(5, " ");
        const coreStr = String(s.cores).padStart(6, " ");

        const prodStr = fmt(ns, s.production, 3).padStart(10, " ");
        const lifeStr = fmt(ns, s.totalProduction, 3).padStart(12, " ");

        ns.tprint(`${idxStr}  ${lvlStr}  ${ramStr}  ${coreStr}   ${prodStr}   ${lifeStr}`);
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint(`Nodes:      ${count}`);
    ns.tprint(`Avg Level:  ${(totalLevels / count).toFixed(1)}`);
    ns.tprint(`Avg RAM:    ${(totalRam / count).toFixed(1)} GB`);
    ns.tprint(`Avg Cores:  ${(totalCores / count).toFixed(1)}`);
    ns.tprint(`Total Prod: ${fmt(ns, totalProd, 3)} / sec`);
    ns.tprint(`Lifetime:   $${fmt(ns, totalLife, 3)}`);
    ns.tprint("────────────────────────────────────────────────────────────");
}

```

---


---
## prep-target.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0];
    if (!target) {
        ns.tprint("Usage: run prep-target.js [server]");
        return;
    }

    ns.tprint(`🌱 PREPPING ${target}...`);

    while (true) {
        const sec = ns.getServerSecurityLevel(target);
        const minSec = ns.getServerMinSecurityLevel(target);
        const money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);

        if (sec > minSec + 0.5) {
            await ns.weaken(target);
        } 
        else if (money < maxMoney * 0.99) {
            await ns.grow(target);
        }
        else {
            ns.tprint(`✨ ${target} fully prepped!`);
            return;
        }
    }
}

```

---

---
## process-monitor.js
> Live process monitor: RAM usage, threads, PIDs, hosts. 
```js 
/** process-monitor.js
 * Live-ish snapshot of running processes across the network.
 * Highlights critical scripts and shows formulas-aware batch $/sec.
 *
 * Usage: run process-monitor.js
 */

/** @param {NS} ns */
function fmt(ns, val, decimals = 2) {
    return ns.nFormat(val, `0.${"0".repeat(decimals)}a`);
}

/** @param {NS} ns */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking &&
            typeof ns.formulas.hacking.hackTime === "function"
        );
    } catch (_e) {
        return false;
    }
}

/**
 * Get hack/grow/weaken times (ms) + chance for a target.
 * Uses ns.formulas.hacking when available, falls back otherwise.
 * @param {NS} ns
 */
function getHackGrowWeakenTimes(ns, target) {
    const player = ns.getPlayer();

    if (hasFormulas(ns)) {
        const s = ns.getServer(target);

        // Assume prepped-ish for planning
        if (typeof s.minDifficulty === "number") {
            s.hackDifficulty = s.minDifficulty;
        }
        if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
            s.moneyAvailable = s.moneyMax;
        }

        const tHack   = ns.formulas.hacking.hackTime(s, player);
        const tGrow   = ns.formulas.hacking.growTime(s, player);
        const tWeaken = ns.formulas.hacking.weakenTime(s, player);
        const chance  = ns.formulas.hacking.hackChance(s, player);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: true };
    } else {
        const tHack   = ns.getHackTime(target);
        const tGrow   = ns.getGrowTime(target);
        const tWeaken = ns.getWeakenTime(target);
        const chance  = ns.hackAnalyzeChance(target);

        return { tHack, tGrow, tWeaken, chance, usingFormulas: false };
    }
}

/** @param {NS} ns */
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

/** @param {NS} ns */
function findBatchTarget(ns) {
    const servers = getAllServers(ns);
    const batchController = "timed-net-batcher2.js";

    for (const host of servers) {
        for (const p of ns.ps(host)) {
            if (p.filename === batchController && p.args.length > 0) {
                return p.args[0];
            }
        }
    }
    return null;
}

/**
 * Estimate current batch money/sec based on:
 * - total batch-hack threads
 * - hackAnalyze
 * - formulas-based (or vanilla) timing
 *
 * @param {NS} ns
 */
function printBatchOverview(ns) {
    const target = findBatchTarget(ns);

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("💰 BATCH OVERVIEW (timed-net-batcher2.js)");
    if (!target) {
        ns.tprint("No active timed-net-batcher2.js controller found.");
        return;
    }

    const servers = getAllServers(ns);

    let totalHackThreads = 0;
    for (const host of servers) {
        for (const p of ns.ps(host)) {
            if (p.filename === "batch-hack.js") {
                totalHackThreads += p.threads;
            }
        }
    }

    if (totalHackThreads === 0) {
        ns.tprint(`Controller target: ${target} (no batch-hack.js threads detected)`);
        return;
    }

    const maxMoney   = ns.getServerMaxMoney(target);
    const hackPerThr = ns.hackAnalyze(target);
    const rawFrac    = hackPerThr * totalHackThreads;
    const MAX_HACK_FRACTION = 0.9;
    const hackFrac   = Math.min(MAX_HACK_FRACTION, rawFrac);

    const { tHack, tGrow, tWeaken, usingFormulas } = getHackGrowWeakenTimes(ns, target);

    const GAP = 200; // ms – same shape as timed-net-batcher2
    const cycleTime = tWeaken + 4 * GAP;
    const estBatchMoney = maxMoney * hackFrac;
    const estMoneyPerSec = cycleTime > 0 ? estBatchMoney / (cycleTime / 1000) : 0;

    ns.tprint(`Target: ${target}`);
    ns.tprint(
        `Threads (hack): ${totalHackThreads}  |  ` +
        `HackFrac≈${(hackFrac * 100).toFixed(1)}% (capped at ${(MAX_HACK_FRACTION * 100).toFixed(0)}%)`
    );
    ns.tprint(
        `Times: H=${(tHack/1000).toFixed(1)}s, ` +
        `G=${(tGrow/1000).toFixed(1)}s, ` +
        `W=${(tWeaken/1000).toFixed(1)}s  |  cycle≈${ns.tFormat(cycleTime)}`
    );
    ns.tprint(
        `Est batch: ${ns.nFormat(estBatchMoney, "$0.00a")}  |  ` +
        `Est ~${ns.nFormat(estMoneyPerSec, "$0.00a")}/sec`
    );
    ns.tprint(
        usingFormulas
            ? "Timing model: Formulas.exe (ns.formulas.hacking)"
            : "Timing model: vanilla API (no Formulas.exe detected)"
    );
}

/** @param {NS} ns */
function printCriticalProcesses(ns) {
    const CRITICAL = new Set([
        "startup-home-advanced.js",
        "timed-net-batcher2.js",
        "pserv-manager.js",
        "root-and-deploy.js",
        "botnet-hgw-sync.js",
        "remote-hgw.js",
        "hacknet-smart.js",
        "ops-dashboard.js",
        "process-monitor.js",
    ]);

    const servers = getAllServers(ns);
    const rows = [];

    for (const host of servers) {
        const procs = ns.ps(host);
        const maxRam = ns.getServerMaxRam(host);

        for (const p of procs) {
            if (!CRITICAL.has(p.filename)) continue;

            const ramPerThread = ns.getScriptRam(p.filename, host) || 0;
            const ramUsage = ramPerThread * p.threads;

            rows.push({
                host,
                script: p.filename,
                threads: p.threads,
                ram: ramUsage,
                maxRam,
            });
        }
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("🚨 CRITICAL PROCESS WATCH");
    if (rows.length === 0) {
        ns.tprint("No critical scripts currently running.");
        return;
    }

    rows.sort((a, b) => b.ram - a.ram);

    ns.tprint("Host           Script                        Thr   RAM(GB)");
    ns.tprint("────────────────────────────────────────────────────────────");
    for (const r of rows) {
        const hostStr   = r.host.padEnd(13, " ");
        const scriptStr = r.script.padEnd(28, " ");
        const thrStr    = String(r.threads).padStart(3, " ");
        const ramStr    = r.ram.toFixed(1).padStart(7, " ");

        ns.tprint(`${hostStr}  ${scriptStr}  ${thrStr}  ${ramStr}`);
    }
}

/** @param {NS} ns */
function printRamSummary(ns) {
    const servers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());

    let homeUsed = 0, homeMax = 0;
    let pservUsed = 0, pservMax = 0;
    let npcUsed = 0, npcMax = 0;

    for (const host of servers) {
        const maxRam  = ns.getServerMaxRam(host);
        const usedRam = ns.getServerUsedRam(host);

        if (host === "home") {
            homeUsed += usedRam;
            homeMax  += maxRam;
        } else if (pservs.has(host)) {
            pservUsed += usedRam;
            pservMax  += maxRam;
        } else {
            npcUsed += usedRam;
            npcMax  += maxRam;
        }
    }

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("💾 RAM SUMMARY");
    ns.tprint(
        `Home:   ${homeUsed.toFixed(1)} / ${homeMax.toFixed(1)} GB` +
        (homeMax > 0 ? ` (${(homeUsed/homeMax*100).toFixed(1)}%)` : "")
    );
    ns.tprint(
        `Pserv:  ${pservUsed.toFixed(1)} / ${pservMax.toFixed(1)} GB` +
        (pservMax > 0 ? ` (${(pservUsed/pservMax*100).toFixed(1)}%)` : "")
    );
    ns.tprint(
        `NPC:    ${npcUsed.toFixed(1)} / ${npcMax.toFixed(1)} GB` +
        (npcMax > 0 ? ` (${(npcUsed/npcMax*100).toFixed(1)}%)` : "")
    );
}

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    ns.tprint("🧩 PROCESS MONITOR");
    printRamSummary(ns);
    printCriticalProcesses(ns);
    printBatchOverview(ns);

    ns.tprint("────────────────────────────────────────────────────────────");
    ns.tprint("Snapshot complete.");
}

```

---


---
## pserv-hgw-sync.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Target server to farm; override with arg if you want
    const target = ns.args[0] || "omega-net";
    const workerScript = "remote-hgw.js";

    if (!ns.fileExists(workerScript, "home")) {
        ns.tprint(`❌ ${workerScript} not found on home.`);
        return;
    }

    ns.tprint(`🔄 pserv HGW sync started. Target: ${target}`);

    // Remember last known RAM per pserv so we can detect upgrades
    const lastRam = {};

    while (true) {
        const pservs = ns.getPurchasedServers();

        if (pservs.length === 0) {
            ns.print("ℹ️ No purchased servers yet. Sleeping...");
            await ns.sleep(5000);
            continue;
        }

        for (const host of pservs) {
            const maxRam = ns.getServerMaxRam(host);
            if (maxRam < 2) {
                ns.print(`💤 Skipping ${host}: only ${maxRam}GB RAM`);
                continue;
            }

            // Check if remote-hgw is already running for this target
            const running = ns.isRunning(workerScript, host, target);
            const previousRam = lastRam[host] ?? 0;

            // Conditions to redeploy:
            //  - server is new (no lastRam entry)
            //  - RAM increased (upgraded server)
            //  - worker script not running
            const needsDeploy =
                !running ||
                maxRam > previousRam ||
                !ns.fileExists(workerScript, host);

            if (!needsDeploy) {
                continue; // nothing to do for this host this cycle
            }

            // Redeploy on this pserv
            ns.tprint(`🚀 (re)deploying HGW on ${host}: RAM ${previousRam}GB → ${maxRam}GB`);

            ns.killall(host);

            // Copy worker script from home to pserv
            const ok = await ns.scp(workerScript, host);
            if (!ok) {
                ns.tprint(`⚠️ Failed to SCP ${workerScript} to ${host}`);
                continue;
            }

            const scriptRam = ns.getScriptRam(workerScript);
            const threads = Math.floor(maxRam / scriptRam);

            if (threads < 1) {
                ns.tprint(`⚠️ ${host}: not enough RAM for even 1 thread.`);
                continue;
            }

            const pid = ns.exec(workerScript, host, threads, target);
            if (pid === 0) {
                ns.tprint(`❌ Failed to start ${workerScript} on ${host}`);
                continue;
            }

            lastRam[host] = maxRam;
            ns.print(`✅ ${host}: running ${workerScript} x${threads} vs ${target}`);
        }

        // Check again every 10 seconds (tweak if you want faster/slower reaction)
        await ns.sleep(10000);
    }
}

```

---

---
## pserv-manager.js
> Purchases and upgrades servers toward target RAM; prints progress
```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Max RAM you ultimately want per server (default 2048 GB)
    const maxDesiredRam = Number(ns.args[0] ?? 8192); // pass 2048 if you want larger cap

    // How aggressively to spend money:
    // 0.5 = use up to 50% of current money on a single purchase/upgrade
    const spendFraction = 0.5;

    const minRam = 8; // minimum pserv size in GB (Bitburner default)

    ns.tprint(`🧠 pserv-manager started. Target max RAM: ${maxDesiredRam}GB`);

    while (true) {
        const limit = ns.getPurchasedServerLimit();
        let servers = ns.getPurchasedServers();
        const money = ns.getServerMoneyAvailable("home");

        // Build list of {name, ram}
        const info = servers.map(name => ({
            name,
            ram: ns.getServerMaxRam(name)
        })).sort((a, b) => a.ram - b.ram);

        // If we have no servers yet, we treat smallestRam as 0
        const smallestRam = info.length > 0 ? info[0].ram : 0;

        // If all servers already at or above desired max, chill
        if (info.length === limit && smallestRam >= maxDesiredRam) {
            ns.print("✅ All purchased servers at or above target RAM. Sleeping longer.");
            await ns.sleep(60000);
            continue;
        }

        // Decide best RAM we can afford right now
        const budget = money * spendFraction;
        let bestAffordableRam = 0;

        for (let ram = minRam; ram <= maxDesiredRam; ram *= 2) {
            const cost = ns.getPurchasedServerCost(ram);
            if (cost <= budget) {
                bestAffordableRam = ram;
            } else {
                break; // costs only go up from here
            }
        }

        if (bestAffordableRam === 0) {
            ns.print("💸 Not enough money to afford even the smallest upgrade. Waiting...");
            await ns.sleep(10000);
            continue;
        }

        // If we have fewer than the max number of servers: buy a new one
        if (servers.length < limit) {
            const ram = bestAffordableRam;
            const cost = ns.getPurchasedServerCost(ram);

            if (cost > money) {
                ns.print("💸 Not enough money to buy new server with chosen RAM. Waiting...");
                await ns.sleep(10000);
                continue;
            }

            const newName = nextServerName(ns);
            const result = ns.purchaseServer(newName, ram);

            if (result) {
                ns.tprint(`🆕 Purchased ${newName} with ${ram}GB for \$${ns.nFormat(cost, "0.00a")}`);
            } else {
                ns.print("❌ purchaseServer failed unexpectedly.");
            }

            await ns.sleep(500); // small delay
            continue;
        }

        // Else: we are at server limit → upgrade the weakest server if possible
        const weakest = info[0]; // sorted ascending by RAM

        // If the best we can afford is not better than what weakest already has, wait
        if (bestAffordableRam <= weakest.ram) {
            ns.print(`😴 Best affordable RAM (${bestAffordableRam}GB) <= weakest server (${weakest.name}: ${weakest.ram}GB). Waiting...`);
            await ns.sleep(15000);
            continue;
        }

        const upgradeRam = bestAffordableRam;
        const upgradeCost = ns.getPurchasedServerCost(upgradeRam);

        if (upgradeCost > money) {
            ns.print("💸 Not enough money to perform upgrade. Waiting...");
            await ns.sleep(10000);
            continue;
        }

        // Upgrade weakest server by deleting & repurchasing with same name
        ns.tprint(`⬆️ Upgrading ${weakest.name} from ${weakest.ram}GB → ${upgradeRam}GB for \$${ns.nFormat(upgradeCost, "0.00a")}`);

        // Kill scripts and delete
        ns.killall(weakest.name);
        const deleted = ns.deleteServer(weakest.name);
        if (!deleted) {
            ns.tprint(`❌ Failed to delete ${weakest.name}. Maybe scripts still running?`);
            await ns.sleep(5000);
            continue;
        }

        const newServer = ns.purchaseServer(weakest.name, upgradeRam);
        if (!newServer) {
            ns.tprint(`❌ Failed to repurchase ${weakest.name} with ${upgradeRam}GB.`);
        } else {
            ns.tprint(`✅ ${weakest.name} now has ${upgradeRam}GB RAM.`);
        }

        await ns.sleep(1000);
    }
}

/**
 * Generate a new server name if we are below the server limit.
 * Tries pserv-0, pserv-1, ... until it finds a free name.
 */
function nextServerName(ns) {
    const existing = new Set(ns.getPurchasedServers());
    let i = 0;
    while (true) {
        const name = `pserv-${i}`;
        if (!existing.has(name)) return name;
        i++;
    }
}

```

--- 


---
## pserv-process-report.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const pservs = ns.getPurchasedServers();
    if (pservs.length === 0) {
        ns.tprint("❌ No purchased servers found.");
        return;
    }

    ns.tprint("🛰️  PSERV PROCESS REPORT");
    ns.tprint("──────────────────────────────────────────");

    for (const host of pservs) {
        const procs = ns.ps(host);

        if (procs.length === 0) {
            ns.tprint(`\n${host} (RAM: ${ns.getServerMaxRam(host)}GB)`);
            ns.tprint("  • No processes running");
            continue;
        }

        ns.tprint(`\n${host} (RAM: ${ns.getServerMaxRam(host)}GB)`);

        for (const p of procs) {
            const ram = ns.getScriptRam(p.filename);
            const ramUsed = ram * p.threads;

            ns.tprint(
                `  • ${p.filename.padEnd(18)}  ` +
                `PID=${p.pid.toString().padEnd(6)}  ` +
                `Threads=${p.threads.toString().padEnd(5)}  ` +
                `RAM=${ramUsed.toFixed(1)}GB`
            );
        }
    }

    ns.tprint("\n──────────────────────────────────────────");
    ns.tprint("📄 End of report.");
}

```

---

---
## pserv-status.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = Number(ns.args[0] ?? 2048); // optional: target RAM for % completion

    const servers = ns.getPurchasedServers();
    if (servers.length === 0) {
        ns.tprint("❌ You have no purchased servers.");
        return;
    }

    let totalRam = 0;
    let minRam = Infinity;
    let maxRam = 0;

    ns.tprint("🖥️ Purchased Server Fleet Status");
    ns.tprint("──────────────────────────────────");

    for (const host of servers) {
        const ram = ns.getServerMaxRam(host);
        totalRam += ram;
        if (ram < minRam) minRam = ram;
        if (ram > maxRam) maxRam = ram;

        ns.tprint(`• ${host} — ${ram} GB`);
    }

    const avgRam = totalRam / servers.length;
    const completion = Math.min(100, (minRam / target) * 100).toFixed(1);

    ns.tprint("──────────────────────────────────");
    ns.tprint(`📊 Total Servers: ${servers.length}`);
    ns.tprint(`📈 Total Fleet RAM: ${ns.nFormat(totalRam * 1e9, "0.00b")}`);
    ns.tprint(`🔻 Weakest Server: ${minRam} GB`);
    ns.tprint(`🔺 Strongest Server: ${maxRam} GB`);
    ns.tprint(`📉 Average RAM: ${avgRam.toFixed(1)} GB`);
    ns.tprint(`🎯 Progress to target (${target}GB min): ${completion}%`);
    ns.tprint("──────────────────────────────────");
}

```

---

---
## purchase_server_8gb.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    // How much RAM each purchased server will have. In this case, it'll
    // be 8GB.
    const ram = 8;

    // Iterator we'll use for our loop
    let i = 0;

    // Continuously try to purchase servers until we've reached the maximum
    // amount of servers
    while (i < ns.getPurchasedServerLimit()) {
        // Check if we have enough money to purchase a server
        if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(ram)) {
            // If we have enough money, then:
            //  1. Purchase the server
            //  2. Copy our hacking script onto the newly-purchased server
            //  3. Run our hacking script on the newly-purchased server with 3 threads
            //  4. Increment our iterator to indicate that we've bought a new server
            let hostname = ns.purchaseServer("pserv-" + i, ram);
            ns.scp("early-hack-template.js", hostname);
            ns.exec("early-hack-template.js", hostname, 3);
            ++i;
        }
        //Make the script wait for a second before looping again.
        //Removing this line will cause an infinite loop and crash the game.
        await ns.sleep(1000);
    }
}
```

---

---
## root-all.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("scan");
    ns.disableLog("sleep");
    ns.disableLog("getServerNumPortsRequired");
    ns.disableLog("getServerRequiredHackingLevel");

    const hackingLevel = ns.getHackingLevel();
    const portCrackers = getPortCrackerCount(ns);

    ns.tprint(`🔍 Starting network scan from 'home'...`);
    ns.tprint(`📈 Hacking level: ${hackingLevel}`);
    ns.tprint(`🛠 Port crackers available: ${portCrackers}`);

    const servers = getAllServers(ns);
    ns.tprint(`🌐 Found ${servers.length} servers (including home).`);

    let rooted = 0;
    let skippedAlreadyRoot = 0;
    let skippedNotEnoughTools = 0;
    let skippedTooHighHack = 0;

    for (const host of servers) {
        if (host === "home") continue; // don't root home

        const hasRoot = ns.hasRootAccess(host);
        const reqHack = ns.getServerRequiredHackingLevel(host);
        const reqPorts = ns.getServerNumPortsRequired(host);

        if (hasRoot) {
            skippedAlreadyRoot++;
            ns.print(`✅ Already rooted: ${host}`);
            continue;
        }

        // Hacking level check
        if (reqHack > hackingLevel) {
            skippedTooHighHack++;
            ns.print(`⛔ Skipping ${host} (required hacking ${reqHack} > ${hackingLevel})`);
            continue;
        }

        // Port tools check
        if (reqPorts > portCrackers) {
            skippedNotEnoughTools++;
            ns.print(`🔒 Skipping ${host} (needs ${reqPorts} ports, only ${portCrackers} tools)`);
            continue;
        }

        // Try to open ports and nuke
        tryOpenPorts(ns, host);
        try {
            ns.nuke(host);
        } catch (e) {
            ns.print(`❌ Failed to nuke ${host}: ${String(e)}`);
            continue;
        }

        if (ns.hasRootAccess(host)) {
            rooted++;
            ns.tprint(`🚀 Rooted: ${host} (ports=${reqPorts}, reqHack=${reqHack})`);
        } else {
            ns.print(`❌ Something went wrong, still no root on ${host}`);
        }

        await ns.sleep(10); // tiny yield to avoid lag
    }

    ns.tprint("========== 🧮 Rooting Summary ==========");
    ns.tprint(`✅ Newly rooted:       ${rooted}`);
    ns.tprint(`ℹ️ Already rooted:    ${skippedAlreadyRoot}`);
    ns.tprint(`🔒 Not enough tools:  ${skippedNotEnoughTools}`);
    ns.tprint(`📈 Hack level too low:${skippedTooHighHack}`);
    ns.tprint("========================================");
}

/**
 * DFS to find all servers reachable from 'home'
 */
function getAllServers(ns) {
    const visited = new Set();
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop();
        if (visited.has(host)) continue;
        visited.add(host);

        const neighbors = ns.scan(host);
        for (const n of neighbors) {
            if (!visited.has(n)) {
                stack.push(n);
            }
        }
    }

    return Array.from(visited);
}

/**
 * Count how many port crackers we own.
 */
function getPortCrackerCount(ns) {
    const tools = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ];
    return tools.filter(t => ns.fileExists(t, "home")).length;
}

/**
 * Open all ports we can on a host.
 */
function tryOpenPorts(ns, host) {
    if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
    if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
    if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
    if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
    if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);
}

```

---

---
## root-and-deploy.js
> Roots all reachable servers; deploys initial scripts where needed
```js
/** @param {NS} ns */

// ────────────────────────────────────────────────
// Network helpers
// ────────────────────────────────────────────────

function getAllServers(ns) {
  const visited = new Set();
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return Array.from(visited);
}

function countPortCrackers(ns) {
  const programs = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
  ];
  return programs.filter(p => ns.fileExists(p, "home")).length;
}

function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

// ────────────────────────────────────────────────
// Formulas.exe helpers (auto-detect + safe fallback)
// ────────────────────────────────────────────────

function hasFormulas(ns) {
  try {
    return (
      ns.fileExists("Formulas.exe", "home") &&
      ns.formulas &&
      ns.formulas.hacking &&
      typeof ns.formulas.hacking.hackTime === "function"
    );
  } catch (_e) {
    return false;
  }
}

/**
 * Return { tHack, chance, usingFormulas } for a given host.
 * Uses ns.formulas.hacking.* if Formulas.exe is available, otherwise
 * falls back to ns.getHackTime / ns.hackAnalyzeChance.
 */
function getHackTimeAndChance(ns, host) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(host),
      chance: ns.hackAnalyzeChance(host),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(host);

  // For scoring we assume a "prepped" target: min sec, max money.
  s.hackDifficulty = s.minDifficulty;
  s.moneyAvailable = Math.max(1, s.moneyMax || 0);

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    chance: ns.formulas.hacking.hackChance(s, player),
    usingFormulas: true,
  };
}

// ────────────────────────────────────────────────
// MONEY/sec SCORING (for main batch target)
// ────────────────────────────────────────────────

function getScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // Basic filters
  const MIN_MONEY_ABS = 1_000_000; // ignore truly trash servers
  const MIN_HACK_RATIO = 0.02;     // at least 2% of your level
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    // ultra-early game stuff we never want to main-target late:
    "n00dles",
    "foodnstuff",
    "sigma-cosmetics",
    "joesguns",
    "harakiri-sushi",
    "hong-fang-tea",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue; // never target purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    // Capability checks
    if (reqHack > hackingLevel) continue;                // can't hack yet
    if (reqPorts > portCrackers) continue;               // can't root yet
    if (!maxMoney || maxMoney < MIN_MONEY_ABS) continue; // too poor

    // Avoid *super* trivial stuff relative to current level
    const hackRatio = reqHack / Math.max(1, hackingLevel);
    if (hackRatio < MIN_HACK_RATIO) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const moneyPerSec = maxMoney / tHack;

    // Slight penalties / modifiers
    const secPenalty = 1 + (minSec - 1) / 100; // very gentle

    // Hack level band preference: targets ~20–80% of your level are "ideal"
    let bandBonus;
    if (hackRatio < 0.2)      bandBonus = 0.7;  // too easy: slight penalty
    else if (hackRatio <= 0.8) bandBonus = 1.0; // sweet spot
    else                       bandBonus = 0.85; // slightly above level: small penalty

    // Chance modifier: 0.5–1.0 range
    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1);

    const score = (moneyPerSec * bandBonus * chanceModifier) / secPenalty;

    scored.push({
      host,
      maxMoney,
      minSec,
      tHack,
      score,
      reqHack,
      chance,
      moneyPerSec,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function choosePrimaryTarget(ns) {
  const scored = getScoredServers(ns);

  if (scored.length === 0) {
    ns.tprint("❌ No juicy advanced target found with current filters.");
    ns.tprint("   Falling back to n00dles.");
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧃 Juiciest Advanced Target (v4: tuned money/sec)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`💰 Max Money:  ${ns.nFormat(best.maxMoney, "$0.00a")}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`🛡 MinSec:     ${best.minSec.toFixed(2)}`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`💸 Money/sec:  ${ns.nFormat(best.moneyPerSec * 1000, "$0.00a")}`);
  ns.tprint(`📈 Score:      ${best.score.toExponential(3)}`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   🏆 Top Candidates (by money/sec)");
  ns.tprint("=======================================");
  for (let i = 0; i < topN; i++) {
    const h = scored[i];
    ns.tprint(
      `${i + 1}. ${h.host} | ` +
      `Score=${h.score.toExponential(2)} | ` +
      `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `Sec=${h.minSec.toFixed(1)} | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}% | ` +
      `$/sec=${ns.nFormat(h.moneyPerSec * 1000, "$0.00a")}`
    );
  }

  return { target: best.host, scored };
}

// ────────────────────────────────────────────────
// XP SCORING (for HGW farm target - tweaked)
// ────────────────────────────────────────────────

function getXpScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // XP farming cares less about money; we just want good hack-time & reqHack.
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue; // never farm purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

    // Capability checks – must be hackable/rootable
    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);

    // XP sweet spot:
    //  - below ~40% of your level = too easy → penalty
    //  - ~40%–120% of your level = sweet band
    //  - way above = small penalty (still sometimes okay)
    let bandBonus;
    if (hackRatio < 0.4)       bandBonus = 0.5;  // way too easy
    else if (hackRatio <= 1.2) bandBonus = 1.1;  // prime XP band
    else if (hackRatio <= 1.6) bandBonus = 1.0;  // a bit above you
    else                       bandBonus = 0.7;  // too hard / slow

    // XP per second is roughly "difficulty-ish" * success rate / time.
    // Approximate difficulty with reqHack, and reward fast hack times by / tHack^1.2
    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1); // 0.5–1.0
    const baseXpScore    = (reqHack * chanceModifier) / Math.pow(tHack, 1.2);

    const score = baseXpScore * bandBonus;

    scored.push({
      host,
      score,
      reqHack,
      chance,
      tHack,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function chooseXpTarget(ns, primary) {
  // Explicitly exclude the main batch target to avoid conflict
  const scored = getXpScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("⚠️ No distinct XP-optimized HGW target found.");
    ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    return "n00dles";
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧠 XP-Optimized HGW Target (tweaked)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`📈 XP Score:   ${best.score.toExponential(3)}`);
  ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   🏆 Top XP Candidates");
  ns.tprint("=======================================");
  for (let i = 0; i < topN; i++) {
    const h = scored[i];
    ns.tprint(
      `${i + 1}. ${h.host} | ` +
      `XPScore=${h.score.toExponential(2)} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}%`
    );
  }

  return best.host;
}

// (Optional: keep the old money-based secondary in case you use it elsewhere)
function chooseSecondaryTarget(ns, primary) {
  const scored = getScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("ℹ️ No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  ns.tprint(`🎯 Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────

export async function main(ns) {
  ns.disableLog("ALL");

  const formulasAvailable = hasFormulas(ns);
  ns.tprint(
    formulasAvailable
      ? "🧮 Formulas.exe detected — using formulas-based times/chance where possible."
      : "ℹ️ Formulas.exe not detected — using built-in timing/scoring APIs."
  );

  // Parse flags *inside* main
  const flags = ns.flags([
    ["hgw", "xp"],   // xp | money
  ]);

  const hgwMode = String(flags.hgw ?? "xp").toLowerCase();

  const HOME_RAM_RESERVE = 32;   // Leave a bit free for ad-hoc scripts
  const PSERV_TARGET_RAM = 2048; // GB per purchased server (tweak as you upgrade)

  // flags._ contains positional args after flags
  const override = flags._[0] || null;

  let batchTarget;
  let hgwTarget;

  if (override) {
    batchTarget = override;
    ns.tprint(`🎯 STARTUP-HOME: Manual override batch target: ${batchTarget}`);
  } else {
    const { target: autoTarget } = choosePrimaryTarget(ns);
    batchTarget = autoTarget || "n00dles";
    ns.tprint(`🎯 STARTUP-HOME: Auto-selected batch target: ${batchTarget}`);
  }

  // Pick HGW target based on flag
  if (hgwMode === "money") {
    ns.tprint("💰 HGW Mode: MONEY");
    hgwTarget = chooseSecondaryTarget(ns, batchTarget);
  } else {
    ns.tprint("🧠 HGW Mode: XP");
    hgwTarget = chooseXpTarget(ns, batchTarget);
  }

  ns.tprint(`🎯 BATCH TARGET (money):      ${batchTarget}`);
  ns.tprint(`🎯 HGW TARGET (${hgwMode.toUpperCase()}): ${hgwTarget}`);

  ns.tprint("🏠 STARTUP-HOME: Killing all processes on home...");

  const myPid = ns.pid;
  const processes = ns.ps("home");

  for (const p of processes) {
    if (p.pid === myPid) continue;
    ns.kill(p.pid);
  }

  await ns.sleep(200); // allow cleanup

  ns.tprint("✔️ Home is clean. Relaunching core automation...");

  function safeExec(script, threads = 1, ...args) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`⚠️ Missing script: ${script}`);
      return;
    }

    const ramCost = ns.getScriptRam(script, "home") * threads;
    const used    = ns.getServerUsedRam("home");
    const max     = ns.getServerMaxRam("home");
    const free    = max - used - HOME_RAM_RESERVE;

    if (ramCost > free) {
      ns.tprint(`❌ Not enough RAM to start ${script} (${threads} threads)`);
      return;
    }

    const pid = ns.exec(script, "home", threads, ...args);
    if (pid === 0) {
      ns.tprint(`❌ Failed to launch ${script}`);
    } else {
      const argInfo = args.length ? ` ${JSON.stringify(args)}` : "";
      ns.tprint(`▶️ Started ${script} (pid ${pid})${argInfo}`);
    }
  }

  // Core stack
  safeExec("pserv-manager.js",       1, PSERV_TARGET_RAM);
  safeExec("timed-net-batcher2.js",  1, batchTarget); // money target
  safeExec("root-and-deploy.js",     1, batchTarget);
  safeExec("botnet-hgw-sync.js",     1, hgwTarget, hgwMode);   // XP or money target
  // safeExec("hacknet-smart.js",    1);
  await ns.sleep(3000);
  // Status / visibility
  safeExec("botnet-hgw-status.js",   1);
  safeExec("hacknet-status.js",      1);
  // safeExec("ops-dashboard.js",    1, batchTarget); // optional one-shot

  ns.tprint("🎉 STARTUP-HOME COMPLETE — full automation online.");
}

```

--- 


---
## startup.txt
> Imported from loose script on 2025-11-22

```txt
/** @param {NS} ns */
export async function main(ns) {
    // Array of all servers that don't need any ports opened
    // to gain root access. These have 16 GB of RAM
    const servers0Port = ["sigma-cosmetics",
                        "joesguns",
                        "nectar-net",
                        "hong-fang-tea",
                        "harakiri-sushi"];

    // Array of all servers that only need 1 port opened
    // to gain root access. These have 32 GB of RAM
    const servers1Port = ["neo-net",
                        "zer0",
                        "max-hardware",
                        "iron-gym"];

    // Copy our scripts onto each server that requires 0 ports
    // to gain root access. Then use nuke() to gain admin access and
    // run the scripts.
    for (let i = 0; i < servers0Port.length; ++i) {
        const serv = servers0Port[i];

        ns.scp("early_hack_template.js", serv);
        ns.nuke(serv);
        ns.exec("early_hack_template.js", serv, 6);
    }

    // Wait until we acquire the "BruteSSH.exe" program
    while (!ns.fileExists("BruteSSH.exe")) {
        await ns.sleep(60000);
    }

    // Copy our scripts onto each server that requires 1 port
    // to gain root access. Then use brutessh() and nuke()
    // to gain admin access and run the scripts.
    for (let i = 0; i < servers1Port.length; ++i) {
        const serv = servers1Port[i];

        ns.scp("early_hack_template.js", serv);
        ns.brutessh(serv);
        ns.nuke(serv);
        ns.exec("early_hack_template.js", serv, 12);
    }
}
```

---

---
## startup-home.txt
> Imported from loose script on 2025-11-22

```txt
/** @param {NS} ns */

// Scan the whole network starting from "home"
function getAllServers(ns) {
    const visited = new Set();
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) queue.push(neighbor);
        }
    }

    return Array.from(visited);
}

// Choose the best hack target among rooted, hackable servers
function chooseBestTarget(ns) {
    const playerHack = ns.getHackingLevel();
    const allServers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());

    let bestHost = "n00dles";
    let bestScore = 0;

    for (const host of allServers) {
        if (host === "home") continue;       // don't hack home
        if (pservs.has(host)) continue;      // don't target purchased servers

        const s = ns.getServer(host);

        if (!s.hasAdminRights) continue;             // need root access
        if (s.moneyMax <= 0) continue;               // must have money
        if (s.requiredHackingSkill > playerHack) continue; // must be hackable

        const maxMoney = s.moneyMax;
        const minSec = s.minDifficulty || s.hackDifficulty || 1;
        const hackTime = ns.getHackTime(host) || 1;

        // Simple heuristic: higher money and shorter time and lower sec is better
        const score = maxMoney / hackTime / minSec;

        if (score > bestScore) {
            bestScore = score;
            bestHost = host;
        }
    }

    return bestHost;
}

export async function main(ns) {
    ns.disableLog("ALL");

    const HOME_RAM_RESERVE = 32; // Leave some RAM free on home

    // Auto-detect best target
    const TARGET = chooseBestTarget(ns);
    ns.tprint(`🎯 STARTUP-HOME: Selected target: ${TARGET}`);

    ns.tprint("🏠 STARTUP-HOME: Killing all processes on home...");

    const myPid = ns.pid;
    const processes = ns.ps("home");

    // Kill everything except this script
    for (const p of processes) {
        if (p.pid === myPid) continue;
        ns.kill(p.pid);
    }

    await ns.sleep(200); // allow cleanup

    ns.tprint("✔️ Home is clean. Relaunching core automation...");

    // Helper to start scripts safely
    function safeExec(script, threads = 1, ...args) {
        if (!ns.fileExists(script, "home")) {
            ns.tprint(`⚠️ Missing script: ${script}`);
            return;
        }

        const ramCost = ns.getScriptRam(script) * threads;
        const used    = ns.getServerUsedRam("home");
        const max     = ns.getServerMaxRam("home");
        const free    = max - used - HOME_RAM_RESERVE;

        if (ramCost > free) {
            ns.tprint(`❌ Not enough RAM to start ${script} (${threads} threads)`);
            return;
        }

        const pid = ns.exec(script, "home", threads, ...args);
        if (pid === 0) {
            ns.tprint(`❌ Failed to launch ${script}`);
        } else {
            ns.tprint(`▶️ Started ${script} (pid ${pid})`);
        }
    }

    // ────────────────────────────────────────────────
    // LAUNCH STACK (PSERV-MANAGER INCLUDED)
    // ────────────────────────────────────────────────

    const PSERV_TARGET_RAM = 2048; // GB per purchased server (tweak as you upgrade)

    // Upgrade purchased servers toward PSERV_TARGET_RAM
    safeExec("pserv-manager.js", 1, PSERV_TARGET_RAM);

    // Keep pservs synced with HGW workers (if you're still using remote-hgw)
    safeExec("pserv-hgw-sync.js", 1, TARGET);

    // Main batcher on home
    safeExec("timed-net-batcher.js", 1, TARGET);

    // Root + deploy HGW to NPCs/pservs
    safeExec("root-and-deploy-net.js", 1, TARGET);

    // Quiet Hacknet automation
    ////safeExec("hacknet-smart.js", 1);

    // Status/monitor scripts
    safeExec("botnet-hgw-status.js", 1);
    safeExec("pserv-hgw-status.js", 1);   // or pserv-status.js
    safeExec("hacknet-status.js", 1);     // Hacknet snapshot on startup
    // Optional: one-shot dashboard
    // safeExec("ops-dashboard.js", 1, TARGET);

    ns.tprint("🎉 STARTUP-HOME COMPLETE — full automation online.");
}

```

---

---
## startup-home-advanced.js
> Main bootstrap: selects targets, kills old processes, launches managers + batchers.
```js
/** @param {NS} ns */

// ────────────────────────────────────────────────
// Network helpers
// ────────────────────────────────────────────────

function getAllServers(ns) {
  const visited = new Set();
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return Array.from(visited);
}

function countPortCrackers(ns) {
  const programs = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
  ];
  return programs.filter(p => ns.fileExists(p, "home")).length;
}

function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

// ────────────────────────────────────────────────
// Formulas.exe helpers (auto-detect + safe fallback)
// ────────────────────────────────────────────────

function hasFormulas(ns) {
  try {
    return (
      ns.fileExists("Formulas.exe", "home") &&
      ns.formulas &&
      ns.formulas.hacking &&
      typeof ns.formulas.hacking.hackTime === "function"
    );
  } catch (_e) {
    return false;
  }
}

/**
 * Return { tHack, chance, usingFormulas } for a given host.
 * Uses ns.formulas.hacking.* if Formulas.exe is available, otherwise
 * falls back to ns.getHackTime / ns.hackAnalyzeChance.
 */
function getHackTimeAndChance(ns, host) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(host),
      chance: ns.hackAnalyzeChance(host),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(host);

  // For scoring we assume a "prepped" target: min sec, max money.
  s.hackDifficulty = s.minDifficulty;
  s.moneyAvailable = Math.max(1, s.moneyMax || 0);

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    chance: ns.formulas.hacking.hackChance(s, player),
    usingFormulas: true,
  };
}

// ────────────────────────────────────────────────
// MONEY/sec SCORING (for main batch target)
// ────────────────────────────────────────────────

function getScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // Basic filters
  const MIN_MONEY_ABS = 1_000_000; // ignore truly trash servers
  const MIN_HACK_RATIO = 0.02;     // at least 2% of your level
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    // ultra-early game stuff we never want to main-target late:
    "n00dles",
    "foodnstuff",
    "sigma-cosmetics",
    "joesguns",
    "harakiri-sushi",
    "hong-fang-tea",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue; // never target purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    // Capability checks
    if (reqHack > hackingLevel) continue;                // can't hack yet
    if (reqPorts > portCrackers) continue;               // can't root yet
    if (!maxMoney || maxMoney < MIN_MONEY_ABS) continue; // too poor

    // Avoid *super* trivial stuff relative to current level
    const hackRatio = reqHack / Math.max(1, hackingLevel);
    if (hackRatio < MIN_HACK_RATIO) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const moneyPerSec = maxMoney / tHack;

    // Slight penalties / modifiers
    const secPenalty = 1 + (minSec - 1) / 100; // very gentle

    // Hack level band preference: targets ~20–80% of your level are "ideal"
    let bandBonus;
    if (hackRatio < 0.2)      bandBonus = 0.7;  // too easy: slight penalty
    else if (hackRatio <= 0.8) bandBonus = 1.0; // sweet spot
    else                       bandBonus = 0.85; // slightly above level: small penalty

    // Chance modifier: 0.5–1.0 range
    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1);

    const score = (moneyPerSec * bandBonus * chanceModifier) / secPenalty;

    scored.push({
      host,
      maxMoney,
      minSec,
      tHack,
      score,
      reqHack,
      chance,
      moneyPerSec,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function choosePrimaryTarget(ns) {
  const scored = getScoredServers(ns);

  if (scored.length === 0) {
    ns.tprint("❌ No juicy advanced target found with current filters.");
    ns.tprint("   Falling back to n00dles.");
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧃 Juiciest Advanced Target (v4: tuned money/sec)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`💰 Max Money:  ${ns.nFormat(best.maxMoney, "$0.00a")}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`🛡 MinSec:     ${best.minSec.toFixed(2)}`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`💸 Money/sec:  ${ns.nFormat(best.moneyPerSec * 1000, "$0.00a")}`);
  ns.tprint(`📈 Score:      ${best.score.toExponential(3)}`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   🏆 Top Candidates (by money/sec)");
  ns.tprint("=======================================");
  for (let i = 0; i < topN; i++) {
    const h = scored[i];
    ns.tprint(
      `${i + 1}. ${h.host} | ` +
      `Score=${h.score.toExponential(2)} | ` +
      `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `Sec=${h.minSec.toFixed(1)} | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}% | ` +
      `$/sec=${ns.nFormat(h.moneyPerSec * 1000, "$0.00a")}`
    );
  }

  return { target: best.host, scored };
}

// ────────────────────────────────────────────────
// XP SCORING (for HGW farm target - tweaked)
// ────────────────────────────────────────────────

function getXpScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // XP farming cares less about money; we just want good hack-time & reqHack.
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue; // never farm purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

    // Capability checks – must be hackable/rootable
    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);

    // XP sweet spot:
    //  - below ~40% of your level = too easy → penalty
    //  - ~40%–120% of your level = sweet band
    //  - way above = small penalty (still sometimes okay)
    let bandBonus;
    if (hackRatio < 0.4)       bandBonus = 0.5;  // way too easy
    else if (hackRatio <= 1.2) bandBonus = 1.1;  // prime XP band
    else if (hackRatio <= 1.6) bandBonus = 1.0;  // a bit above you
    else                       bandBonus = 0.7;  // too hard / slow

    // XP per second is roughly "difficulty-ish" * success rate / time.
    // Approximate difficulty with reqHack, and reward fast hack times by / tHack^1.2
    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1); // 0.5–1.0
    const baseXpScore    = (reqHack * chanceModifier) / Math.pow(tHack, 1.2);

    const score = baseXpScore * bandBonus;

    scored.push({
      host,
      score,
      reqHack,
      chance,
      tHack,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function chooseXpTarget(ns, primary) {
  // Explicitly exclude the main batch target to avoid conflict
  const scored = getXpScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("⚠️ No distinct XP-optimized HGW target found.");
    ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    return "n00dles";
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧠 XP-Optimized HGW Target (tweaked)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`📈 XP Score:   ${best.score.toExponential(3)}`);
  ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   🏆 Top XP Candidates");
  ns.tprint("=======================================");
  for (let i = 0; i < topN; i++) {
    const h = scored[i];
    ns.tprint(
      `${i + 1}. ${h.host} | ` +
      `XPScore=${h.score.toExponential(2)} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}%`
    );
  }

  return best.host;
}

// (Optional: keep the old money-based secondary in case you use it elsewhere)
function chooseSecondaryTarget(ns, primary) {
  const scored = getScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("ℹ️ No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  ns.tprint(`🎯 Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────

export async function main(ns) {
  ns.disableLog("ALL");

  const formulasAvailable = hasFormulas(ns);
  ns.tprint(
    formulasAvailable
      ? "🧮 Formulas.exe detected — using formulas-based times/chance where possible."
      : "ℹ️ Formulas.exe not detected — using built-in timing/scoring APIs."
  );

  // Parse flags *inside* main
  const flags = ns.flags([
    ["hgw", "xp"],   // xp | money
  ]);

  const hgwMode = String(flags.hgw ?? "xp").toLowerCase();

  const HOME_RAM_RESERVE = 32;   // Leave a bit free for ad-hoc scripts
  const PSERV_TARGET_RAM = 2048; // GB per purchased server (tweak as you upgrade)

  // flags._ contains positional args after flags
  const override = flags._[0] || null;

  let batchTarget;
  let hgwTarget;

  if (override) {
    batchTarget = override;
    ns.tprint(`🎯 STARTUP-HOME: Manual override batch target: ${batchTarget}`);
  } else {
    const { target: autoTarget } = choosePrimaryTarget(ns);
    batchTarget = autoTarget || "n00dles";
    ns.tprint(`🎯 STARTUP-HOME: Auto-selected batch target: ${batchTarget}`);
  }

  // Pick HGW target based on flag
  if (hgwMode === "money") {
    ns.tprint("💰 HGW Mode: MONEY");
    hgwTarget = chooseSecondaryTarget(ns, batchTarget);
  } else {
    ns.tprint("🧠 HGW Mode: XP");
    hgwTarget = chooseXpTarget(ns, batchTarget);
  }

  ns.tprint(`🎯 BATCH TARGET (money):      ${batchTarget}`);
  ns.tprint(`🎯 HGW TARGET (${hgwMode.toUpperCase()}): ${hgwTarget}`);

  ns.tprint("🏠 STARTUP-HOME: Killing all processes on home...");

  const myPid = ns.pid;
  const processes = ns.ps("home");

  for (const p of processes) {
    if (p.pid === myPid) continue;
    ns.kill(p.pid);
  }

  await ns.sleep(200); // allow cleanup

  ns.tprint("✔️ Home is clean. Relaunching core automation...");

  function safeExec(script, threads = 1, ...args) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`⚠️ Missing script: ${script}`);
      return;
    }

    const ramCost = ns.getScriptRam(script, "home") * threads;
    const used    = ns.getServerUsedRam("home");
    const max     = ns.getServerMaxRam("home");
    const free    = max - used - HOME_RAM_RESERVE;

    if (ramCost > free) {
      ns.tprint(`❌ Not enough RAM to start ${script} (${threads} threads)`);
      return;
    }

    const pid = ns.exec(script, "home", threads, ...args);
    if (pid === 0) {
      ns.tprint(`❌ Failed to launch ${script}`);
    } else {
      const argInfo = args.length ? ` ${JSON.stringify(args)}` : "";
      ns.tprint(`▶️ Started ${script} (pid ${pid})${argInfo}`);
    }
  }

  // Core stack
  safeExec("pserv-manager.js",       1, PSERV_TARGET_RAM);
  safeExec("timed-net-batcher2.js",  1, batchTarget); // money target
  safeExec("root-and-deploy.js",     1, batchTarget);
  safeExec("botnet-hgw-sync.js",     1, hgwTarget, hgwMode);   // XP or money target
  // safeExec("hacknet-smart.js",    1);
  await ns.sleep(3000);
  // Status / visibility
  safeExec("botnet-hgw-status.js",   1);
  safeExec("hacknet-status.js",      1);
  // safeExec("ops-dashboard.js",    1, batchTarget); // optional one-shot

  ns.tprint("🎉 STARTUP-HOME COMPLETE — full automation online.");
}

```

---


---
## timed-net-batcher.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */

export async function main(ns) {
    ns.disableLog("ALL");

    const target = ns.args[0];
    if (!target) {
        ns.tprint("❌ No batch target provided! (timed-net-batcher.js needs one)");
        ns.tprint("   Example: run timed-net-batcher.js n00dles");
        return;
    }

    const hackScript   = "batch-hack.js";
    const growScript   = "batch-grow.js";
    const weakenScript = "batch-weaken.js";

    for (const s of [hackScript, growScript, weakenScript]) {
        if (!ns.fileExists(s, "home")) {
            ns.tprint(`❌ Missing script on home: ${s}`);
            return;
        }
    }

    const purchased = ns.getPurchasedServers();
    const hasPservs = purchased.length > 0;

    if (!hasPservs) {
        ns.tprint("⚠️ No purchased servers found. Using HOME for full HWGW batches.");
        await runAllOnHome(ns, target, hackScript, growScript, weakenScript);
        return;
    }

    for (const host of purchased) {
        await ns.scp([hackScript, growScript, weakenScript], host);
    }

    ns.tprint(`🎯 Multi-batch HYBRID batcher targeting: ${target}`);
    ns.tprint(`🏠 HOME: hack only  |  🛰 PSERVs: grow + weaken`);

    // ── Timing setup ─────────────────────────────────────
    const tHack   = ns.getHackTime(target);
    const tGrow   = ns.getGrowTime(target);
    const tWeaken = ns.getWeakenTime(target);

    const GAP = 200; // ms
    const T   = tWeaken + 4 * GAP;

    const delayHack   = Math.max(0, T - 3 * GAP - tHack);
    const delayGrow   = Math.max(0, T - 2 * GAP - tGrow);
    const delayWeak1  = Math.max(0, T - 1 * GAP - tWeaken);
    const delayWeak2  = Math.max(0, T          - tWeaken);

    const cycleTime = T + GAP;
    const DESIRED_CONCURRENCY = 8;
    const batchInterval = Math.max(GAP, Math.floor(cycleTime / DESIRED_CONCURRENCY));

    ns.tprint(`⏱ Times (sec): H=${(tHack/1000).toFixed(1)}, G=${(tGrow/1000).toFixed(1)}, W=${(tWeaken/1000).toFixed(1)}`);
    ns.tprint(`⏱ Delays (sec): H=${(delayHack/1000).toFixed(1)}, G=${(delayGrow/1000).toFixed(1)}, W1=${(delayWeak1/1000).toFixed(1)}, W2=${(delayWeak2/1000).toFixed(1)}`);
    ns.tprint(`🔁 Base cycleTime: ${ns.tFormat(cycleTime)} (aiming for ${DESIRED_CONCURRENCY} overlapping batches)`);
    ns.tprint(`📡 Launch interval: ${ns.tFormat(batchInterval)} per batch`);

    const basePlan = calcBaseThreads(ns, target);
    if (!basePlan) {
        ns.tprint("❌ Failed to compute base batch plan.");
        return;
    }

    const hackRam   = ns.getScriptRam(hackScript);
    const growRam   = ns.getScriptRam(growScript);
    const weakenRam = ns.getScriptRam(weakenScript);

    const HOME_RAM_RESERVE = 256;     // GB kept free on home
    const MAX_HACK_FRACTION = 0.90;   // <= 90% of money in one wave
    const STATUS_INTERVAL = 10 * 60 * 1000; // 10 minutes

    let lastStatusPrint = 0;

    while (true) {
        const now = Date.now();

        // ── Periodic target status (logs only) ─────────────
        if (now - lastStatusPrint >= STATUS_INTERVAL) {
            printTargetStatus(ns, target);
            lastStatusPrint = now;
        }

        // ── RAM snapshot ───────────────────────────────────
        const homeMax  = ns.getServerMaxRam("home");
        const homeUsed = ns.getServerUsedRam("home");
        let homeFree   = homeMax - homeUsed - HOME_RAM_RESERVE;
        if (homeFree < 0) homeFree = 0;

        const pservHosts = [];
        let totalPservFree = 0;
        for (const h of purchased) {
            const maxRam  = ns.getServerMaxRam(h);
            const usedRam = ns.getServerUsedRam(h);
            const freeRam = Math.max(0, maxRam - usedRam);
            if (freeRam > 0) {
                pservHosts.push({ host: h, freeRam });
                totalPservFree += freeRam;
            }
        }

        if (homeFree < hackRam || totalPservFree < (growRam + 2 * weakenRam)) {
            ns.print("⚠️ Not enough RAM (home or pservs) for even a minimal hybrid batch. Retrying...");
            await ns.sleep(batchInterval);
            continue;
        }

        // ── Scale threads with hybrid constraints ─────────
        const {
            hackThreads,
            growThreads,
            weaken1Threads,
            weaken2Threads
        } = scaleHybridBatch(
            ns,
            target,
            basePlan,
            homeFree,
            totalPservFree,
            hackRam,
            growRam,
            weakenRam,
            MAX_HACK_FRACTION
        );

        const ramHackHome =
            hackThreads * hackRam;
        const ramGWOnPservs =
            growThreads * growRam +
            (weaken1Threads + weaken2Threads) * weakenRam;

        ns.print(
            `🚀 Hybrid batch: ` +
            `H=${hackThreads} (home ${ramHackHome.toFixed(1)}GB), ` +
            `G=${growThreads}, W1=${weaken1Threads}, W2=${weaken2Threads} ` +
            `(pserv RAM=${ramGWOnPservs.toFixed(1)}GB)`
        );

        // Rebuild host objects using fresh RAM before allocation
        const homeHost = {
            host: "home",
            freeRam: Math.max(0, ns.getServerMaxRam("home") - ns.getServerUsedRam("home") - HOME_RAM_RESERVE)
        };

        // Shuffle pservs so usage spreads more evenly over time
        const pservHostObjs = shuffleArray(ns, pservHosts.map(h => ({
            host: h.host,
            freeRam: Math.max(0, ns.getServerMaxRam(h.host) - ns.getServerUsedRam(h.host))
        })).filter(h => h.freeRam > 0));

        // Landing order: W1 → H → G → W2
        allocToHosts(ns, pservHostObjs, weakenScript, target, weaken1Threads, delayWeak1);
        allocToHosts(ns, [homeHost],    hackScript,   target, hackThreads,    delayHack, tHack);
        allocToHosts(ns, pservHostObjs, growScript,   target, growThreads,    delayGrow);
        allocToHosts(ns, pservHostObjs, weakenScript, target, weaken2Threads, delayWeak2);

        await ns.sleep(batchInterval);
    }
}

// ────────────────────────────────────────────────
// BASE BATCH CALCULATION (per "unit" batch)
// ────────────────────────────────────────────────

function calcBaseThreads(ns, target) {
    const hackPercentTarget    = 0.05; // 5% per "unit" batch (scaled later)
    const hackPercentPerThread = ns.hackAnalyze(target);
    if (hackPercentPerThread <= 0) return null;

    let hackThreads = Math.floor(hackPercentTarget / hackPercentPerThread);
    if (hackThreads < 1) hackThreads = 1;

    const growMultiplier = 1 / (1 - hackPercentTarget);
    let growThreads = Math.ceil(ns.growthAnalyze(target, growMultiplier));
    if (growThreads < 1) growThreads = 1;

    const secFromHack = ns.hackAnalyzeSecurity(hackThreads);
    const secFromGrow = ns.growthAnalyzeSecurity(growThreads);
    const secTotal    = secFromHack + secFromGrow;

    const weakenPerThread = ns.weakenAnalyze(1);
    if (weakenPerThread <= 0) return null;

    let weakenThreads = Math.ceil(secTotal / weakenPerThread);

    return {
        baseHack: hackThreads,
        baseGrow: growThreads,
        baseWeak: weakenThreads,
    };
}

// ────────────────────────────────────────────────
// HYBRID SCALING: home = hack, pservs = grow+weaken
// ────────────────────────────────────────────────

function scaleHybridBatch(
    ns,
    target,
    base,
    homeFreeRam,
    totalPservFreeRam,
    hackRam,
    growRam,
    weakenRam,
    MAX_HACK_FRACTION
) {
    const { baseHack, baseGrow, baseWeak } = base;

    const ramHackUnit = baseHack * hackRam;
    const ramGWUnit =
        baseGrow * growRam +
        (2 * baseWeak) * weakenRam;

    let multHome  = Math.floor(homeFreeRam       / ramHackUnit);
    let multPserv = Math.floor(totalPservFreeRam / ramGWUnit);

    if (multHome < 1)  multHome  = 1;
    if (multPserv < 1) multPserv = 1;

    // Hack safety: never steal more than MAX_HACK_FRACTION per wave
    const pctPerHackThread = ns.hackAnalyze(target);
    const basePct          = baseHack * pctPerHackThread;

    let safeMult = multHome;
    if (basePct > 0) {
        const m = Math.floor(MAX_HACK_FRACTION / basePct);
        if (m > 0) safeMult = Math.min(safeMult, m);
    }

    const mult = Math.max(1, Math.min(multHome, multPserv, safeMult));

    const hackThreads    = Math.max(1, baseHack * mult);
    const growThreads    = Math.max(1, baseGrow * mult);
    const weaken1Threads = Math.max(1, baseWeak * mult);
    const weaken2Threads = Math.max(1, baseWeak * mult);

    return { hackThreads, growThreads, weaken1Threads, weaken2Threads };
}

// ────────────────────────────────────────────────
// GENERIC ALLOCATION ACROSS HOSTS
// ────────────────────────────────────────────────

function allocToHosts(ns, hosts, script, target, threadsNeeded, delay, extraArg = null) {
    if (threadsNeeded <= 0) return;
    if (!hosts || hosts.length === 0) return;

    const ramPerThread = ns.getScriptRam(script);

    for (const h of hosts) {
        if (threadsNeeded <= 0) break;

        const maxThreadsHere = Math.floor(h.freeRam / ramPerThread);
        if (maxThreadsHere <= 0) continue;

        const allocate = Math.min(maxThreadsHere, threadsNeeded);

        const pid = extraArg == null
            ? ns.exec(script, h.host, allocate, target, delay)
            : ns.exec(script, h.host, allocate, target, delay, extraArg);

        if (pid !== 0) {
            h.freeRam -= allocate * ramPerThread;
            threadsNeeded -= allocate;
        }
    }
}

// ────────────────────────────────────────────────
// STATUS & HELPERS
// ────────────────────────────────────────────────

function printTargetStatus(ns, target) {
    const money   = ns.getServerMoneyAvailable(target);
    const max     = ns.getServerMaxMoney(target);
    const sec     = ns.getServerSecurityLevel(target);
    const minSec  = ns.getServerMinSecurityLevel(target);

    const moneyPct = max > 0 ? (money / max) * 100 : 0;
    const secDelta = sec - minSec;

    const now = new Date();
    const ts = now.toLocaleTimeString();

    ns.print("──────────────────────────────────────");
    ns.print(`📊 TARGET STATUS — ${target} @ ${ts}`);
    ns.print(`💰 Money:       ${ns.nFormat(money, "$0.00a")} / ${ns.nFormat(max, "$0.00a")} (${moneyPct.toFixed(2)}%)`);
    ns.print(`🛡 Security:     ${sec.toFixed(2)} (min ${minSec.toFixed(2)})  Δ=${secDelta.toFixed(2)}`);
    ns.print("──────────────────────────────────────");
}

function shuffleArray(ns, arr) {
    // Simple Fisher–Yates; ns used just to avoid unused param warnings if you like
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

// ────────────────────────────────────────────────
// FALLBACK: classic full HWGW on home only
// ────────────────────────────────────────────────

async function runAllOnHome(ns, target, hackScript, growScript, weakenScript) {
    const tHack   = ns.getHackTime(target);
    const tGrow   = ns.getGrowTime(target);
    const tWeaken = ns.getWeakenTime(target);

    const GAP = 200; // ms
    const T = tWeaken + 4 * GAP;

    const delayHack   = Math.max(0, T - 3 * GAP - tHack);
    const delayGrow   = Math.max(0, T - 2 * GAP - tGrow);
    const delayWeak1  = Math.max(0, T - 1 * GAP - tWeaken);
    const delayWeak2  = Math.max(0, T          - tWeaken);

    const cycleTime = T + GAP;
    const DESIRED_CONCURRENCY = 8;
    const batchInterval = Math.max(GAP, Math.floor(cycleTime / DESIRED_CONCURRENCY));

    ns.tprint(`⏱ Times (sec): H=${(tHack/1000).toFixed(1)}, G=${(tGrow/1000).toFixed(1)}, W=${(tWeaken/1000).toFixed(1)}`);
    ns.tprint(`⏱ Delays (sec): H=${(delayHack/1000).toFixed(1)}, G=${(delayGrow/1000).toFixed(1)}, W1=${(delayWeak1/1000).toFixed(1)}, W2=${(delayWeak2/1000).toFixed(1)}`);
    ns.tprint(`🔁 Base cycleTime: ${ns.tFormat(cycleTime)} (aiming for ${DESIRED_CONCURRENCY} overlapping batches)`);
    ns.tprint(`📡 Launch interval: ${ns.tFormat(batchInterval)} per batch`);
    ns.tprint("🏠 Single-host mode: HOME running full HWGW.");

    const basePlan = calcBaseThreads(ns, target);
    if (!basePlan) {
        ns.tprint("❌ Failed to compute base batch plan.");
        return;
    }

    const hackRam   = ns.getScriptRam(hackScript);
    const growRam   = ns.getScriptRam(growScript);
    const weakenRam = ns.getScriptRam(weakenScript);

    const minRamNeeded =
        hackRam + growRam + (2 * weakenRam);

    const HOME_RAM_RESERVE = 256;
    const MAX_HACK_FRACTION = 0.90;

    while (true) {
        const maxRam  = ns.getServerMaxRam("home");
        const usedRam = ns.getServerUsedRam("home");
        let freeRam   = maxRam - usedRam - HOME_RAM_RESERVE;
        if (freeRam < 0) freeRam = 0;

        if (freeRam < minRamNeeded) {
            ns.print("⚠️ Insufficient RAM on home for even 1 minimal batch. Retrying...");
            await ns.sleep(batchInterval);
            continue;
        }

        const { baseHack, baseGrow, baseWeak } = basePlan;

        const ramBase =
            baseHack * hackRam +
            baseGrow * growRam +
            (2 * baseWeak) * weakenRam;

        let mult = Math.floor(freeRam / ramBase);
        if (mult < 1) mult = 1;

        const pctPerHackThread = ns.hackAnalyze(target);
        const basePct          = baseHack * pctPerHackThread;

        if (basePct > 0) {
            const safeMult = Math.floor(MAX_HACK_FRACTION / basePct);
            if (safeMult > 0 && safeMult < mult) mult = safeMult;
        }

        const hackThreads    = Math.max(1, baseHack * mult);
        const growThreads    = Math.max(1, baseGrow * mult);
        const weaken1Threads = Math.max(1, baseWeak * mult);
        const weaken2Threads = Math.max(1, baseWeak * mult);

        const ramUsed =
            hackThreads * hackRam +
            growThreads * growRam +
            (weaken1Threads + weaken2Threads) * weakenRam;

        ns.print(
            `🚀 Home batch: ` +
            `H=${hackThreads}, G=${growThreads}, ` +
            `W1=${weaken1Threads}, W2=${weaken2Threads} ` +
            `(RAM=${ramUsed.toFixed(1)}GB)`
        );

        const host = { host: "home", freeRam };

        allocToHosts(ns, [host], weakenScript, target, weaken1Threads, delayWeak1);
        allocToHosts(ns, [host], hackScript,   target, hackThreads,    delayHack, tHack);
        allocToHosts(ns, [host], growScript,   target, growThreads,    delayGrow);
        allocToHosts(ns, [host], weakenScript, target, weaken2Threads, delayWeak2);

        await ns.sleep(batchInterval);
    }
}

```

---

---
## timed-net-batcher2.js
> Hybrid HWGW batcher: HOME = hack, pservs = grow/weaken with timing alignment
```js
/** @param {NS} ns */

// ────────────────────────────────────────────────
// Network helpers
// ────────────────────────────────────────────────

function getAllServers(ns) {
  const visited = new Set();
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return Array.from(visited);
}

function countPortCrackers(ns) {
  const programs = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
  ];
  return programs.filter(p => ns.fileExists(p, "home")).length;
}

function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

// ────────────────────────────────────────────────
// Formulas.exe helpers (auto-detect + safe fallback)
// ────────────────────────────────────────────────

function hasFormulas(ns) {
  try {
    return (
      ns.fileExists("Formulas.exe", "home") &&
      ns.formulas &&
      ns.formulas.hacking &&
      typeof ns.formulas.hacking.hackTime === "function"
    );
  } catch (_e) {
    return false;
  }
}

/**
 * Return { tHack, chance, usingFormulas } for a given host.
 * Uses ns.formulas.hacking.* if Formulas.exe is available, otherwise
 * falls back to ns.getHackTime / ns.hackAnalyzeChance.
 */
function getHackTimeAndChance(ns, host) {
  if (!hasFormulas(ns)) {
    return {
      tHack: ns.getHackTime(host),
      chance: ns.hackAnalyzeChance(host),
      usingFormulas: false,
    };
  }

  const player = ns.getPlayer();
  const s = ns.getServer(host);

  // For scoring we assume a "prepped" target: min sec, max money.
  s.hackDifficulty = s.minDifficulty;
  s.moneyAvailable = Math.max(1, s.moneyMax || 0);

  return {
    tHack: ns.formulas.hacking.hackTime(s, player),
    chance: ns.formulas.hacking.hackChance(s, player),
    usingFormulas: true,
  };
}

// ────────────────────────────────────────────────
// MONEY/sec SCORING (for main batch target)
// ────────────────────────────────────────────────

function getScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // Basic filters
  const MIN_MONEY_ABS = 1_000_000; // ignore truly trash servers
  const MIN_HACK_RATIO = 0.02;     // at least 2% of your level
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    // ultra-early game stuff we never want to main-target late:
    "n00dles",
    "foodnstuff",
    "sigma-cosmetics",
    "joesguns",
    "harakiri-sushi",
    "hong-fang-tea",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue; // never target purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);
    const maxMoney = s.moneyMax;
    const minSec   = s.minDifficulty || 1;

    // Capability checks
    if (reqHack > hackingLevel) continue;                // can't hack yet
    if (reqPorts > portCrackers) continue;               // can't root yet
    if (!maxMoney || maxMoney < MIN_MONEY_ABS) continue; // too poor

    // Avoid *super* trivial stuff relative to current level
    const hackRatio = reqHack / Math.max(1, hackingLevel);
    if (hackRatio < MIN_HACK_RATIO) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const moneyPerSec = maxMoney / tHack;

    // Slight penalties / modifiers
    const secPenalty = 1 + (minSec - 1) / 100; // very gentle

    // Hack level band preference: targets ~20–80% of your level are "ideal"
    let bandBonus;
    if (hackRatio < 0.2)      bandBonus = 0.7;  // too easy: slight penalty
    else if (hackRatio <= 0.8) bandBonus = 1.0; // sweet spot
    else                       bandBonus = 0.85; // slightly above level: small penalty

    // Chance modifier: 0.5–1.0 range
    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1);

    const score = (moneyPerSec * bandBonus * chanceModifier) / secPenalty;

    scored.push({
      host,
      maxMoney,
      minSec,
      tHack,
      score,
      reqHack,
      chance,
      moneyPerSec,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function choosePrimaryTarget(ns) {
  const scored = getScoredServers(ns);

  if (scored.length === 0) {
    ns.tprint("❌ No juicy advanced target found with current filters.");
    ns.tprint("   Falling back to n00dles.");
    return { target: "n00dles", scored: [] };
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧃 Juiciest Advanced Target (v4: tuned money/sec)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`💰 Max Money:  ${ns.nFormat(best.maxMoney, "$0.00a")}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`🛡 MinSec:     ${best.minSec.toFixed(2)}`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`💸 Money/sec:  ${ns.nFormat(best.moneyPerSec * 1000, "$0.00a")}`);
  ns.tprint(`📈 Score:      ${best.score.toExponential(3)}`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   🏆 Top Candidates (by money/sec)");
  ns.tprint("=======================================");
  for (let i = 0; i < topN; i++) {
    const h = scored[i];
    ns.tprint(
      `${i + 1}. ${h.host} | ` +
      `Score=${h.score.toExponential(2)} | ` +
      `Money=${ns.nFormat(h.maxMoney, "$0.00a")} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `Sec=${h.minSec.toFixed(1)} | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}% | ` +
      `$/sec=${ns.nFormat(h.moneyPerSec * 1000, "$0.00a")}`
    );
  }

  return { target: best.host, scored };
}

// ────────────────────────────────────────────────
// XP SCORING (for HGW farm target - tweaked)
// ────────────────────────────────────────────────

function getXpScoredServers(ns, extraExcluded = []) {
  const hackingLevel = ns.getHackingLevel();
  const servers = getAllServers(ns);
  const pservs = new Set(ns.getPurchasedServers());
  const portCrackers = countPortCrackers(ns);

  // XP farming cares less about money; we just want good hack-time & reqHack.
  const EXCLUDED = new Set([
    "home",
    "darkweb",
    ...extraExcluded,
  ]);

  const scored = [];

  for (const host of servers) {
    if (EXCLUDED.has(host)) continue;
    if (pservs.has(host)) continue; // never farm purchased servers

    const s = ns.getServer(host);

    const reqHack  = s.requiredHackingSkill;
    const reqPorts = s.numOpenPortsRequired ?? ns.getServerNumPortsRequired(host);

    // Capability checks – must be hackable/rootable
    if (reqHack > hackingLevel) continue;
    if (reqPorts > portCrackers) continue;

    const { tHack, chance } = getHackTimeAndChance(ns, host);
    if (!tHack || !isFinite(tHack)) continue;

    const hackRatio = reqHack / Math.max(1, hackingLevel);

    // XP sweet spot:
    //  - below ~40% of your level = too easy → penalty
    //  - ~40%–120% of your level = sweet band
    //  - way above = small penalty (still sometimes okay)
    let bandBonus;
    if (hackRatio < 0.4)       bandBonus = 0.5;  // way too easy
    else if (hackRatio <= 1.2) bandBonus = 1.1;  // prime XP band
    else if (hackRatio <= 1.6) bandBonus = 1.0;  // a bit above you
    else                       bandBonus = 0.7;  // too hard / slow

    // XP per second is roughly "difficulty-ish" * success rate / time.
    // Approximate difficulty with reqHack, and reward fast hack times by / tHack^1.2
    const chanceModifier = 0.5 + 0.5 * clamp(chance, 0, 1); // 0.5–1.0
    const baseXpScore    = (reqHack * chanceModifier) / Math.pow(tHack, 1.2);

    const score = baseXpScore * bandBonus;

    scored.push({
      host,
      score,
      reqHack,
      chance,
      tHack,
      hackRatio,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function chooseXpTarget(ns, primary) {
  // Explicitly exclude the main batch target to avoid conflict
  const scored = getXpScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("⚠️ No distinct XP-optimized HGW target found.");
    ns.tprint("   Falling back to 'n00dles' as a safe XP farm.");
    return "n00dles";
  }

  const best = scored[0];

  ns.tprint("=======================================");
  ns.tprint("   🧠 XP-Optimized HGW Target (tweaked)");
  ns.tprint("=======================================");
  ns.tprint(`🎯 Host:       ${best.host}`);
  ns.tprint(`🧠 Req Hack:   ${best.reqHack} (you: ${ns.getHackingLevel()})`);
  ns.tprint(`🎯 Chance:     ${(best.chance * 100).toFixed(1)}%`);
  ns.tprint(`⏱ Hack Time:  ${(best.tHack / 1000).toFixed(1)}s`);
  ns.tprint(`📈 XP Score:   ${best.score.toExponential(3)}`);
  ns.tprint(`hackRatio:     ${(best.hackRatio * 100).toFixed(0)}%`);

  const topN = Math.min(5, scored.length);
  ns.tprint("=======================================");
  ns.tprint("   🏆 Top XP Candidates");
  ns.tprint("=======================================");
  for (let i = 0; i < topN; i++) {
    const h = scored[i];
    ns.tprint(
      `${i + 1}. ${h.host} | ` +
      `XPScore=${h.score.toExponential(2)} | ` +
      `ReqHack=${h.reqHack} | ` +
      `Chance=${(h.chance * 100).toFixed(1)}% | ` +
      `T=${(h.tHack / 1000).toFixed(1)}s | ` +
      `hackRatio=${(h.hackRatio * 100).toFixed(0)}%`
    );
  }

  return best.host;
}

// (Optional: keep the old money-based secondary in case you use it elsewhere)
function chooseSecondaryTarget(ns, primary) {
  const scored = getScoredServers(ns, [primary]);

  if (scored.length === 0) {
    ns.tprint("ℹ️ No distinct secondary target found for HGW; reusing primary.");
    return primary;
  }

  const best = scored[0];
  ns.tprint(`🎯 Secondary money target (unused by default): ${best.host}`);
  return best.host;
}

// ────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────

export async function main(ns) {
  ns.disableLog("ALL");

  const formulasAvailable = hasFormulas(ns);
  ns.tprint(
    formulasAvailable
      ? "🧮 Formulas.exe detected — using formulas-based times/chance where possible."
      : "ℹ️ Formulas.exe not detected — using built-in timing/scoring APIs."
  );

  // Parse flags *inside* main
  const flags = ns.flags([
    ["hgw", "xp"],   // xp | money
  ]);

  const hgwMode = String(flags.hgw ?? "xp").toLowerCase();

  const HOME_RAM_RESERVE = 32;   // Leave a bit free for ad-hoc scripts
  const PSERV_TARGET_RAM = 2048; // GB per purchased server (tweak as you upgrade)

  // flags._ contains positional args after flags
  const override = flags._[0] || null;

  let batchTarget;
  let hgwTarget;

  if (override) {
    batchTarget = override;
    ns.tprint(`🎯 STARTUP-HOME: Manual override batch target: ${batchTarget}`);
  } else {
    const { target: autoTarget } = choosePrimaryTarget(ns);
    batchTarget = autoTarget || "n00dles";
    ns.tprint(`🎯 STARTUP-HOME: Auto-selected batch target: ${batchTarget}`);
  }

  // Pick HGW target based on flag
  if (hgwMode === "money") {
    ns.tprint("💰 HGW Mode: MONEY");
    hgwTarget = chooseSecondaryTarget(ns, batchTarget);
  } else {
    ns.tprint("🧠 HGW Mode: XP");
    hgwTarget = chooseXpTarget(ns, batchTarget);
  }

  ns.tprint(`🎯 BATCH TARGET (money):      ${batchTarget}`);
  ns.tprint(`🎯 HGW TARGET (${hgwMode.toUpperCase()}): ${hgwTarget}`);

  ns.tprint("🏠 STARTUP-HOME: Killing all processes on home...");

  const myPid = ns.pid;
  const processes = ns.ps("home");

  for (const p of processes) {
    if (p.pid === myPid) continue;
    ns.kill(p.pid);
  }

  await ns.sleep(200); // allow cleanup

  ns.tprint("✔️ Home is clean. Relaunching core automation...");

  function safeExec(script, threads = 1, ...args) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`⚠️ Missing script: ${script}`);
      return;
    }

    const ramCost = ns.getScriptRam(script, "home") * threads;
    const used    = ns.getServerUsedRam("home");
    const max     = ns.getServerMaxRam("home");
    const free    = max - used - HOME_RAM_RESERVE;

    if (ramCost > free) {
      ns.tprint(`❌ Not enough RAM to start ${script} (${threads} threads)`);
      return;
    }

    const pid = ns.exec(script, "home", threads, ...args);
    if (pid === 0) {
      ns.tprint(`❌ Failed to launch ${script}`);
    } else {
      const argInfo = args.length ? ` ${JSON.stringify(args)}` : "";
      ns.tprint(`▶️ Started ${script} (pid ${pid})${argInfo}`);
    }
  }

  // Core stack
  safeExec("pserv-manager.js",       1, PSERV_TARGET_RAM);
  safeExec("timed-net-batcher2.js",  1, batchTarget); // money target
  safeExec("root-and-deploy.js",     1, batchTarget);
  safeExec("botnet-hgw-sync.js",     1, hgwTarget, hgwMode);   // XP or money target
  // safeExec("hacknet-smart.js",    1);
  await ns.sleep(3000);
  // Status / visibility
  safeExec("botnet-hgw-status.js",   1);
  safeExec("hacknet-status.js",      1);
  // safeExec("ops-dashboard.js",    1, batchTarget); // optional one-shot

  ns.tprint("🎉 STARTUP-HOME COMPLETE — full automation online.");
}

```

---


---
## weaken-worker.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    const target = ns.args[0];
    if (!target) return;
    await ns.weaken(target);
}

```

---

---
## whats-my-bitNode.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns **/
export async function main(ns) {
    const node = ns.getPlayer().bitNodeN;
    ns.tprint(`🌐 You are in BitNode-${node}`);
}

```

---

---
## xp-all.js
> Imported from loose script on 2025-11-22

```js
/** xp-all.js
 * Hard-switch the entire botnet (home + pservs + NPC) into XP mode.
 *
 * - Kills ALL other scripts on every rooted server (except this script).
 * - Chooses an XP target automatically if not provided (Formulas-aware when available).
 * - Deploys remote-hgw.js in "xp" mode with as many threads as possible.
 *
 * Usage:
 *   run xp-all.js             // auto-pick XP target
 *   run xp-all.js joesguns    // force a specific XP target
 *
 * @param {NS} ns
 */
export async function main(ns) {
    ns.disableLog("ALL");

    const argTarget = ns.args[0];
    const xpTarget = argTarget || chooseXpTarget(ns);

    if (!ns.fileExists("remote-hgw.js", "home")) {
        ns.tprint("❌ remote-hgw.js not found on home. Aborting XP-all.");
        return;
    }

    ns.tprint("===============================================");
    ns.tprint("🧠 XP-ALL MODE: FULL BOTNET XP GRIND");
    ns.tprint("===============================================");
    ns.tprint(`🎯 XP target: ${xpTarget}`);

    if (argTarget) {
        ns.tprint("ℹ️ Using manually provided XP target.");
    } else if (hasFormulas(ns)) {
        ns.tprint("ℹ️ XP target chosen automatically (🧮 Formulas.exe).");
    } else {
        ns.tprint("ℹ️ XP target chosen automatically (vanilla heuristic).");
    }

    const allServers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());
    const myPid = ns.pid;

    // 1) Clean HOME (but keep this script running)
    ns.tprint("🧹 Cleaning home (killing all other scripts)...");
    for (const p of ns.ps("home")) {
        if (p.pid === myPid) continue;
        ns.kill(p.pid);
    }

    // 2) Deploy XP workers to HOME
    await ns.sleep(200); // let things die
    deployXpWorker(ns, "home", xpTarget, "xp", true);

    // 3) Clean and deploy on all rooted servers (pserv + NPC)
    ns.tprint("🧹 Cleaning & deploying XP workers to all rooted servers...");
    for (const host of allServers) {
        if (host === "home") continue;
        if (host === "darkweb") continue;
        if (!ns.hasRootAccess(host)) continue;

        // Kill everything on this host
        ns.killall(host);

        // Deploy XP worker
        deployXpWorker(ns, host, xpTarget, "xp", pservs.has(host));
    }

    ns.tprint("✅ XP-ALL deployment complete. All rooted servers now grinding XP.");
    ns.tprint("   Re-run your normal startup script when you're ready to return to money mode.");
}

/** @param {NS} ns */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking
        );
    } catch (_e) {
        return false;
    }
}

/**
 * Deploy remote-hgw.js in XP mode on a single host.
 * @param {NS} ns
 * @param {string} host
 * @param {string} target
 * @param {string} mode  "xp" or "money" (we use "xp" here)
 * @param {boolean} isPserv
 */
function deployXpWorker(ns, host, target, mode, isPserv = false) {
    const maxRam = ns.getServerMaxRam(host);
    if (maxRam < 2) {
        ns.print(`💤 Skipping ${host}: only ${maxRam}GB RAM`);
        return;
    }

    // Make sure script is present
    if (host !== "home") {
        const ok = ns.scp("remote-hgw.js", host, "home");
        if (!ok) {
            ns.tprint(`⚠️ Failed to SCP remote-hgw.js to ${host}`);
            return;
        }
    }

    const scriptRam = ns.getScriptRam("remote-hgw.js", host);
    if (scriptRam === 0) {
        ns.tprint(`⚠️ remote-hgw.js has 0 RAM cost on ${host} (missing or miscompiled?).`);
        return;
    }

    // Allow for this controller script on home
    let usableRam = maxRam;
    if (host === "home") {
        const used = ns.getServerUsedRam("home");
        usableRam = maxRam - used;
    }

    const threads = Math.floor(usableRam / scriptRam);
    if (threads < 1) {
        ns.print(`⚠️ ${host}: not enough free RAM for even 1 XP thread.`);
        return;
    }

    const pid = ns.exec("remote-hgw.js", host, threads, target, mode);
    if (pid === 0) {
        ns.tprint(`❌ Failed to start remote-hgw.js on ${host}`);
        return;
    }

    const label =
        host === "home"
            ? "HOME"
            : isPserv
            ? "PSERV"
            : "NPC";

    ns.tprint(
        `🚀 ${label.padEnd(5)} ${host}: remote-hgw.js x${threads} → ` +
        `${target} [${mode.toUpperCase()}]`
    );
}

/**
 * Heuristic + Formulas-aware XP target picker:
 * - Only consider rooted, hackable, non-home, non-darkweb servers with money.
 * - If Formulas.exe is present, prefer highest XP/sec approx: reqHack / weakenTime.
 * - Otherwise, prefer highest required hacking level we can handle.
 * @param {NS} ns
 */
function chooseXpTarget(ns) {
    const playerHack = ns.getHackingLevel();
    const servers = getAllServers(ns);

    let best = "n00dles";
    let bestReqHack = 0;

    const useFormulas = hasFormulas(ns);
    let bestScore = -1;

    const player = useFormulas ? ns.getPlayer() : null;

    for (const host of servers) {
        if (host === "home" || host === "darkweb") continue;
        if (!ns.hasRootAccess(host)) continue;

        const reqHack = ns.getServerRequiredHackingLevel(host);
        const maxMoney = ns.getServerMaxMoney(host);

        if (maxMoney <= 0) continue;
        if (reqHack > playerHack) continue;

        if (useFormulas) {
            let s = ns.getServer(host);
            if (typeof s.minDifficulty === "number") {
                s.hackDifficulty = s.minDifficulty;
            }
            if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
                s.moneyAvailable = s.moneyMax;
            }

            const tWeaken = ns.formulas.hacking.weakenTime(s, player);
            if (tWeaken <= 0) continue;

            // Approximate XP/sec score: higher reqHack and shorter weaken time is better.
            const score = reqHack / tWeaken;

            if (score > bestScore) {
                bestScore = score;
                best = host;
                bestReqHack = reqHack;
            }
        } else {
            // Vanilla heuristic: prefer highest required hacking level we can handle
            if (reqHack > bestReqHack) {
                bestReqHack = reqHack;
                best = host;
            }
        }
    }

    return best;
}

/**
 * Simple BFS over the network.
 * @param {NS} ns
 */
function getAllServers(ns) {
    const visited = new Set();
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) queue.push(neighbor);
        }
    }

    return Array.from(visited);
}

```

---

---
## xp-all.js
> Hard-switches the entire botnet (home + pservs + NPC) into XP grind mode using remote-hgw.js

```js
/** xp-all.js
 * Hard-switch the entire botnet (home + pservs + NPC) into XP mode.
 *
 * - Kills ALL other scripts on every rooted server (except this script).
 * - Chooses an XP target automatically if not provided (Formulas-aware when available).
 * - Deploys remote-hgw.js in "xp" mode with as many threads as possible.
 *
 * Usage:
 *   run xp-all.js             // auto-pick XP target
 *   run xp-all.js joesguns    // force a specific XP target
 *
 * @param {NS} ns
 */
export async function main(ns) {
    ns.disableLog("ALL");

    const argTarget = ns.args[0];
    const xpTarget = argTarget || chooseXpTarget(ns);

    if (!ns.fileExists("remote-hgw.js", "home")) {
        ns.tprint("❌ remote-hgw.js not found on home. Aborting XP-all.");
        return;
    }

    ns.tprint("===============================================");
    ns.tprint("🧠 XP-ALL MODE: FULL BOTNET XP GRIND");
    ns.tprint("===============================================");
    ns.tprint(`🎯 XP target: ${xpTarget}`);

    if (argTarget) {
        ns.tprint("ℹ️ Using manually provided XP target.");
    } else if (hasFormulas(ns)) {
        ns.tprint("ℹ️ XP target chosen automatically (🧮 Formulas.exe).");
    } else {
        ns.tprint("ℹ️ XP target chosen automatically (vanilla heuristic).");
    }

    const allServers = getAllServers(ns);
    const pservs = new Set(ns.getPurchasedServers());
    const myPid = ns.pid;

    // 1) Clean HOME (but keep this script running)
    ns.tprint("🧹 Cleaning home (killing all other scripts)...");
    for (const p of ns.ps("home")) {
        if (p.pid === myPid) continue;
        ns.kill(p.pid);
    }

    // 2) Deploy XP workers to HOME
    await ns.sleep(200); // let things die
    deployXpWorker(ns, "home", xpTarget, "xp", true);

    // 3) Clean and deploy on all rooted servers (pserv + NPC)
    ns.tprint("🧹 Cleaning & deploying XP workers to all rooted servers...");
    for (const host of allServers) {
        if (host === "home") continue;
        if (host === "darkweb") continue;
        if (!ns.hasRootAccess(host)) continue;

        // Kill everything on this host
        ns.killall(host);

        // Deploy XP worker
        deployXpWorker(ns, host, xpTarget, "xp", pservs.has(host));
    }

    ns.tprint("✅ XP-ALL deployment complete. All rooted servers now grinding XP.");
    ns.tprint("   Re-run your normal startup script when you're ready to return to money mode.");
}

/** @param {NS} ns */
function hasFormulas(ns) {
    try {
        return (
            ns.fileExists("Formulas.exe", "home") &&
            ns.formulas &&
            ns.formulas.hacking
        );
    } catch (_e) {
        return false;
    }
}

/**
 * Deploy remote-hgw.js in XP mode on a single host.
 * @param {NS} ns
 * @param {string} host
 * @param {string} target
 * @param {string} mode  "xp" or "money" (we use "xp" here)
 * @param {boolean} isPserv
 */
function deployXpWorker(ns, host, target, mode, isPserv = false) {
    const maxRam = ns.getServerMaxRam(host);
    if (maxRam < 2) {
        ns.print(`💤 Skipping ${host}: only ${maxRam}GB RAM`);
        return;
    }

    // Make sure script is present
    if (host !== "home") {
        const ok = ns.scp("remote-hgw.js", host, "home");
        if (!ok) {
            ns.tprint(`⚠️ Failed to SCP remote-hgw.js to ${host}`);
            return;
        }
    }

    const scriptRam = ns.getScriptRam("remote-hgw.js", host);
    if (scriptRam === 0) {
        ns.tprint(`⚠️ remote-hgw.js has 0 RAM cost on ${host} (missing or miscompiled?).`);
        return;
    }

    // Allow for this controller script on home
    let usableRam = maxRam;
    if (host === "home") {
        const used = ns.getServerUsedRam("home");
        usableRam = maxRam - used;
    }

    const threads = Math.floor(usableRam / scriptRam);
    if (threads < 1) {
        ns.print(`⚠️ ${host}: not enough free RAM for even 1 XP thread.`);
        return;
    }

    const pid = ns.exec("remote-hgw.js", host, threads, target, mode);
    if (pid === 0) {
        ns.tprint(`❌ Failed to start remote-hgw.js on ${host}`);
        return;
    }

    const label =
        host === "home"
            ? "HOME"
            : isPserv
            ? "PSERV"
            : "NPC";

    ns.tprint(
        `🚀 ${label.padEnd(5)} ${host}: remote-hgw.js x${threads} → ` +
        `${target} [${mode.toUpperCase()}]`
    );
}

/**
 * Heuristic + Formulas-aware XP target picker:
 * - Only consider rooted, hackable, non-home, non-darkweb servers with money.
 * - If Formulas.exe is present, prefer highest XP/sec approx: reqHack / weakenTime.
 * - Otherwise, prefer highest required hacking level we can handle.
 * @param {NS} ns
 */
function chooseXpTarget(ns) {
    const playerHack = ns.getHackingLevel();
    const servers = getAllServers(ns);

    let best = "n00dles";
    let bestReqHack = 0;

    const useFormulas = hasFormulas(ns);
    let bestScore = -1;

    const player = useFormulas ? ns.getPlayer() : null;

    for (const host of servers) {
        if (host === "home" || host === "darkweb") continue;
        if (!ns.hasRootAccess(host)) continue;

        const reqHack = ns.getServerRequiredHackingLevel(host);
        const maxMoney = ns.getServerMaxMoney(host);

        if (maxMoney <= 0) continue;
        if (reqHack > playerHack) continue;

        if (useFormulas) {
            let s = ns.getServer(host);
            if (typeof s.minDifficulty === "number") {
                s.hackDifficulty = s.minDifficulty;
            }
            if (typeof s.moneyMax === "number" && s.moneyMax > 0) {
                s.moneyAvailable = s.moneyMax;
            }

            const tWeaken = ns.formulas.hacking.weakenTime(s, player);
            if (tWeaken <= 0) continue;

            // Approximate XP/sec score: higher reqHack and shorter weaken time is better.
            const score = reqHack / tWeaken;

            if (score > bestScore) {
                bestScore = score;
                best = host;
                bestReqHack = reqHack;
            }
        } else {
            // Vanilla heuristic: prefer highest required hacking level we can handle
            if (reqHack > bestReqHack) {
                bestReqHack = reqHack;
                best = host;
            }
        }
    }

    return best;
}

/**
 * Simple BFS over the network.
 * @param {NS} ns
 */
function getAllServers(ns) {
    const visited = new Set();
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift();
        if (visited.has(host)) continue;
        visited.add(host);

        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) queue.push(neighbor);
        }
    }

    return Array.from(visited);
}

---

---
## xp-home-burner.js
> Imported from loose script on 2025-11-22

```js
/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    // Manager mode:
    //   run xp-home-burner.js --auto [target] [reserveRam]
    //
    // Worker mode:
    //   run xp-home-burner.js [target]  (with N threads)
    //
    if (ns.args[0] === "--auto") {
        const target = ns.args[1] || "run4theh111z";  // good XP target for you
        const reserveRam = ns.args[2] !== undefined ? Number(ns.args[2]) : 64; // GB to keep free on home

        const scriptName = ns.getScriptName();
        const scriptRam  = ns.getScriptRam(scriptName);
        const maxRam     = ns.getServerMaxRam("home");
        const usedRam    = ns.getServerUsedRam("home");

        const freeRam = maxRam - usedRam - reserveRam;
        const threads = Math.floor(freeRam / scriptRam);

        if (threads < 1) {
            ns.tprint(`⚠️ xp-home-burner: Not enough free RAM on home after reserving ${reserveRam}GB.`);
            ns.tprint(`   Free: ${freeRam.toFixed(1)}GB, Script RAM: ${scriptRam.toFixed(2)}GB`);
            return;
        }

        ns.tprint(`🧠 xp-home-burner: Spawning ${threads} XP threads vs ${target} on home (reserve ${reserveRam}GB).`);
        ns.run(scriptName, threads, target);
        return;
    }

    // Worker mode: this instance just spams hack() forever with its threads
    const target = ns.args[0] || "run4theh111z";

    ns.print(`🧠 xp-home-burner worker: Hacking ${target} for XP...`);
    while (true) {
        await ns.hack(target);
    }
}

```

---

---
## xp-throughput.txt
> Imported from loose script on 2025-11-22

```txt
{"ts":1763851790354,"windowSeconds":180.002,"gained":911.3473802804947,"xpPerSec":5.062984746172235}
```

---

---
## xp-throughput-monitor.js
> Imported from loose script on 2025-11-22

```js
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

```

---
