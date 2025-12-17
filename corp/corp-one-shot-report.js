/** @param {NS} ns **/
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
        ["materials", true],     // show material lines (filtered)
        ["minQty", 1],           // material qty threshold to print
        ["minFlow", 0.01],       // print if prod/sell/buy >= this
        ["products", true],
        ["upgrades", true],
        ["research", true],
        ["action", true],        // show Action Items summary
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.disableLog("ALL");

    if (!ns.corporation) {
        ns.tprint("ERROR: Corporation API not unlocked (need BN3 or corp unlocked).");
        return;
    }

    const corpApi = ns.corporation;
    const c = corpApi.getCorporation();
    const k = corpApi.getConstants();

    const fmt = (n) => ns.formatNumber(n, 2, 1e3);
    const fmt0 = (n) => ns.formatNumber(n, 0, 1e3);

    const profit = (c.revenue ?? 0) - (c.expenses ?? 0);

    ns.tprint("============================================================");
    ns.tprint("                 CORPORATION — ONE-SHOT REPORT               ");
    ns.tprint("============================================================");
    ns.tprint(`Name:        ${c.name}`);
    ns.tprint(`Funds:       ${fmt(c.funds)}`);
    ns.tprint(`Revenue:     ${fmt(c.revenue)} /s`);
    ns.tprint(`Expenses:    ${fmt(c.expenses)} /s`);
    ns.tprint(`Profit:      ${fmt(profit)} /s`);

    const dividendRate = c.dividendRate ?? 0;
    ns.tprint(`Dividend:    ${(dividendRate * 100).toFixed(2)}%`);

    // Share / investment info (guarded, depends on corp state / API availability)
    try {
        if (c.public) {
            ns.tprint(`Public:      YES  | SharePrice=${fmt(c.sharePrice)}  | Shares=${fmt0(c.numShares)}  | Issued=${fmt0(c.issuedShares)}`);
        } else {
            ns.tprint("Public:      NO");
            // Investment offer often exists while private
            try {
                const offer = corpApi.getInvestmentOffer();
                ns.tprint(`Investment:  Round ${offer.round}  | Funds=${fmt(offer.funds)}  | Shares=${fmt0(offer.shares)}  | Valuation=${fmt(offer.valuation)}`);
            } catch {
                // ignore
            }
        }
    } catch {
        // ignore
    }

    ns.tprint("");

    // ------------------------------------------------------------
    // UPGRADES
    // ------------------------------------------------------------
    if (flags.upgrades) {
        ns.tprint("=== CORPORATION UPGRADES ===");
        try {
            const upgrades = k.upgradeNames || [];
            for (const up of upgrades) {
                const level = corpApi.getUpgradeLevel(up);
                const cost = corpApi.getUpgradeLevelCost(up);
                ns.tprint(
                    `${up.padEnd(26)} ` +
                    `Lvl ${String(level).padStart(3)}  ` +
                    `Next ${fmt(cost)}`
                );
            }
        } catch (err) {
            ns.tprint("Upgrade read error: " + String(err));
        }
        ns.tprint("");
    }

    // ------------------------------------------------------------
    // DIVISIONS
    // ------------------------------------------------------------
    const actions = [];
    const divisions = c.divisions || [];

    ns.tprint("============================================================");
    ns.tprint("                     DIVISIONS / CITIES                      ");
    ns.tprint("============================================================");

    for (const divName of divisions) {
        const d = corpApi.getDivision(divName);

        ns.tprint("");
        ns.tprint("------------------------------------------------------------");
        ns.tprint(`DIVISION: ${divName} (${d.type})`);
        ns.tprint(`Awareness: ${fmt(d.awareness)} | Popularity: ${fmt(d.popularity)} | RP: ${fmt(d.researchPoints)}`);
        ns.tprint(`Cities:    ${d.cities.join(", ")}`);
        ns.tprint(`Products:  ${d.products?.length ? d.products.join(", ") : "(none)"}`);

        // Research quick flags (actionable)
        if (flags.research) {
            const want = [
                "Hi-Tech R&D Laboratory",
                "Market-TA.I",
                "Market-TA.II",
                "AutoBrew",
                "AutoPartyManager",
                "Drones",
                "Drones - Assembly",
                "Drones - Transport",
                "Overclock",
                "Self-Correcting Assemblers",
                "uPgrade: Capacity.I",
                "uPgrade: Capacity.II",
            ];

            const unlocked = [];
            for (const r of want) {
                try {
                    if (corpApi.hasResearched(divName, r)) unlocked.push(r);
                } catch { /* not valid for some industries */ }
            }

            ns.tprint(`Key Research: ${unlocked.length ? unlocked.join(" | ") : "(none detected)"}`);

            // Missing key research callouts
            const hasTA2 = safeHasResearch(corpApi, divName, "Market-TA.II");
            const hasLab = safeHasResearch(corpApi, divName, "Hi-Tech R&D Laboratory");
            if (!hasLab) actions.push(`[${divName}] Missing "Hi-Tech R&D Laboratory" (slows product/RP scaling).`);
            if (!hasTA2) actions.push(`[${divName}] Missing "Market-TA.II" (pricing/auto-sell optimization).`);
        }

        // Division finances (if present in your BN/API version)
        if (typeof d.lastCycleRevenue === "number" || typeof d.lastCycleExpenses === "number") {
            const lr = d.lastCycleRevenue ?? 0;
            const le = d.lastCycleExpenses ?? 0;
            ns.tprint(`Last Cycle: Rev=${fmt(lr)}  Exp=${fmt(le)}  Profit=${fmt(lr - le)}`);
        }

        // --------------------------------------------------------
        // CITIES: Office + Warehouse + Materials
        // --------------------------------------------------------
        for (const city of d.cities) {
            ns.tprint("");
            ns.tprint(`City: ${city}`);

            // Office
            try {
                const off = corpApi.getOffice(divName, city);
                ns.tprint(`  Office: size=${off.size}  employees=${off.numEmployees}`);
                ns.tprint(`  Stats:  Morale/Happy/Energy = ${off.avgMorale.toFixed(1)} / ${off.avgHappiness.toFixed(1)} / ${off.avgEnergy.toFixed(1)}  | ProdMult=${off.productionMult.toFixed(2)}`);
                ns.tprint(`  Jobs:   ${formatJobs(off.employeeJobs)}`);

                if (off.avgEnergy < 95 || off.avgMorale < 95 || off.avgHappiness < 95) {
                    actions.push(`[${divName}/${city}] Office stats low (morale/happy/energy < 95). Consider AutoParty/AutoBrew or manual boosts.`);
                }
            } catch {
                ns.tprint("  Office: (none)");
            }

            // Warehouse
            let wh = null;
            try {
                wh = corpApi.getWarehouse(divName, city);
                const usedPct = wh.size > 0 ? (wh.sizeUsed / wh.size) * 100 : 0;
                ns.tprint(`  Warehouse: ${wh.sizeUsed.toFixed(2)} / ${wh.size.toFixed(2)} (${usedPct.toFixed(1)}%)  | SmartSupply=${wh.smartSupplyEnabled ? "ON" : "OFF"}`);

                if (usedPct >= 95) actions.push(`[${divName}/${city}] Warehouse nearly full (${usedPct.toFixed(1)}%). Upgrade warehouse or fix buy/sell.`);
                if (!wh.smartSupplyEnabled) actions.push(`[${divName}/${city}] Smart Supply is OFF. Enable if you rely on automation.`);
            } catch {
                ns.tprint("  Warehouse: (none)");
            }

            // Materials (filtered, only non-trivial)
            if (flags.materials && wh) {
                const minQty = Math.max(0, Number(flags.minQty) || 0);
                const minFlow = Math.max(0, Number(flags.minFlow) || 0);

                // Try constants list first; fallback to common list
                const mats = (k.materialNames && k.materialNames.length)
                    ? k.materialNames
                    : ["Water","Energy","Food","Plants","Hardware","Robots","AI Cores","Real Estate","Metal","Ore","Chemicals","Drugs","Minerals"];

                let printedAny = false;

                for (const m of mats) {
                    let mat;
                    try {
                        mat = corpApi.getMaterial(divName, city, m);
                    } catch {
                        continue;
                    }
                    if (!mat) continue;

                    const qty = mat.qty ?? 0;
                    const prod = mat.prod ?? 0;
                    const sell = mat.sell ?? 0;
                    const buy = mat.buy ?? 0;

                    const worthPrinting =
                        Math.abs(qty) >= minQty ||
                        Math.abs(prod) >= minFlow ||
                        Math.abs(sell) >= minFlow ||
                        Math.abs(buy) >= minFlow;

                    if (!worthPrinting) continue;

                    if (!printedAny) {
                        ns.tprint("  Materials (filtered):");
                        printedAny = true;
                    }

                    ns.tprint(
                        `    ${m.padEnd(14)} ` +
                        `qty=${padNum(qty, 10)} ` +
                        `prod=${padNum(prod, 8)} ` +
                        `sell=${padNum(sell, 8)} ` +
                        `buy=${padNum(buy, 8)}`
                    );
                }
            }
        }

        // --------------------------------------------------------
        // PRODUCTS
        // --------------------------------------------------------
        if (flags.products && d.products && d.products.length > 0) {
            ns.tprint("");
            ns.tprint("Products:");
            for (const p of d.products) {
                try {
                    const prod = corpApi.getProduct(divName, p);

                    // Dev progress can be named differently across versions; handle both
                    const dev = (typeof prod.developmentProgress === "number")
                        ? prod.developmentProgress
                        : (typeof prod.devProgress === "number" ? prod.devProgress : null);

                    const devStr = dev == null ? "N/A" : `${dev.toFixed(1)}%`;

                    ns.tprint(
                        `  ${p.padEnd(18)} ` +
                        `Dev=${devStr.padEnd(7)} ` +
                        `Rating=${prod.effectiveRating?.toFixed(2) ?? "?"} ` +
                        `Demand=${prod.demand?.toFixed(2) ?? "?"} ` +
                        `Comp=${prod.competition?.toFixed(2) ?? "?"}`
                    );

                    if (dev != null && dev < 100) {
                        actions.push(`[${divName}] Product "${p}" still developing (${dev.toFixed(1)}%). Consider more R&D spend or office/product staffing.`);
                    }
                } catch {
                    ns.tprint(`  ${p} (error reading product)`);
                }
            }
        }
    }

    // ------------------------------------------------------------
    // ACTION ITEMS
    // ------------------------------------------------------------
    if (flags.action) {
        ns.tprint("");
        ns.tprint("============================================================");
        ns.tprint("                        ACTION ITEMS                         ");
        ns.tprint("============================================================");
        if (!actions.length) {
            ns.tprint("No obvious red flags detected by the report filters.");
        } else {
            // de-dupe
            const uniq = Array.from(new Set(actions));
            for (const a of uniq) ns.tprint("• " + a);
        }
    }

    ns.tprint("");
    ns.tprint("============================================================");
    ns.tprint(" END OF CORP ONE-SHOT REPORT");
    ns.tprint("============================================================");
}

/* ======================= helpers ======================= */

function safeHasResearch(corpApi, divName, r) {
    try { return corpApi.hasResearched(divName, r); } catch { return false; }
}

function formatJobs(jobsObj) {
    try {
        const keys = Object.keys(jobsObj || {});
        keys.sort();
        return keys.map(k => `${k}:${jobsObj[k]}`).join("  ");
    } catch {
        return "(unavailable)";
    }
}

function padNum(n, width) {
    const s = (Number(n) || 0).toFixed(2);
    return s.length >= width ? s : (" ".repeat(width - s.length) + s);
}

function printHelp(ns) {
    ns.tprint("corp/corp-one-shot-report.js");
    ns.tprint("");
    ns.tprint("Description");
    ns.tprint("  One-shot corporation status report printed to the terminal.");
    ns.tprint("  Includes corp overview, upgrades, divisions/cities, offices, warehouses, filtered materials, products, and action items.");
    ns.tprint("");
    ns.tprint("Syntax");
    ns.tprint("  run corp/corp-one-shot-report.js");
    ns.tprint("  run corp/corp-one-shot-report.js --minQty 10 --minFlow 0.1");
    ns.tprint("  run corp/corp-one-shot-report.js --materials false");
    ns.tprint("");
    ns.tprint("Options");
    ns.tprint("  --materials <bool>   Show material lines (default true; filtered).");
    ns.tprint("  --minQty <n>         Print materials with qty >= n (default 1).");
    ns.tprint("  --minFlow <n>        Print materials with prod/sell/buy >= n (default 0.01).");
    ns.tprint("  --products <bool>    Show product section (default true).");
    ns.tprint("  --upgrades <bool>    Show upgrade section (default true).");
    ns.tprint("  --research <bool>    Show key research flags (default true).");
    ns.tprint("  --action <bool>      Show Action Items section (default true).");
}
