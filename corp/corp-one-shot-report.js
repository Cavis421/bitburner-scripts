/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    if (!ns.corporation) {
        ns.tprint("ERROR: Corporation API not unlocked (need BN3 or corp unlocked).");
        return;
    }

    const corpApi = ns.corporation;
    const corp = corpApi.getCorporation();
    const cconst = corpApi.getConstants();

    ns.tprint("============================================================");
    ns.tprint("                CORPORATION — FULL SNAPSHOT REPORT          ");
    ns.tprint("============================================================");
    ns.tprint(`Name:        ${corp.name}`);
    ns.tprint(`Funds:       ${ns.formatNumber(corp.funds)}`);
    ns.tprint(`Revenue:     ${ns.formatNumber(corp.revenue)}`);
    ns.tprint(`Expenses:    ${ns.formatNumber(corp.expenses)}`);

    const dividendRate = corp.dividendRate ?? 0; // 0–1
    const dividendPct = (dividendRate * 100).toFixed(2);
    ns.tprint(`Dividend %:  ${dividendPct} %`);
    ns.tprint("");

    // -------------------------
    // GLOBAL RESEARCH
    // -------------------------
    ns.tprint("=== GLOBAL RESEARCH & UPGRADES ===");

    try {
        const divisions = corp.divisions || [];
        const allResearchNames = [
            ...(cconst.researchNamesBase || []),
            ...(cconst.researchNamesProductOnly || []),
        ];

        for (const divName of divisions) {
            const dv = corpApi.getDivision(divName);
            ns.tprint(`Division: ${divName} | Type: ${dv.type}`);
            ns.tprint(`Research Points: ${ns.formatNumber(dv.researchPoints)}`);

            // Build list of researched items using hasResearched()
            const unlocked = [];
            for (const r of allResearchNames) {
                try {
                    if (corpApi.hasResearched(divName, r)) unlocked.push(r);
                } catch {
                    // Some research may not be valid for this industry; ignore
                }
            }
            ns.tprint(`Unlocked Research: ${unlocked.join(", ") || "(none)"}`);
            ns.tprint("");
        }
    } catch (err) {
        ns.tprint("Research read error: " + String(err));
    }

    ns.tprint("");
    ns.tprint("=== CORPORATION UPGRADES ===");
    try {
        const upgrades = cconst.upgradeNames || [];
        for (const up of upgrades) {
            const level = corpApi.getUpgradeLevel(up);
            const cost = corpApi.getUpgradeLevelCost(up);
            ns.tprint(
                `${up.padEnd(25)}  ` +
                `Level: ${String(level).padStart(3)}  ` +
                `Next Cost: ${ns.formatNumber(cost)}`
            );
        }
    } catch (err) {
        ns.tprint("Upgrade read error: " + String(err));
    }

    ns.tprint("");
    ns.tprint("============================================================");
    ns.tprint("                     DIVISIONS & CITIES                     ");
    ns.tprint("============================================================");

    const divisions = corp.divisions || [];
    for (const divName of divisions) {
        const d = corpApi.getDivision(divName);
        ns.tprint("");
        ns.tprint(`---------------------------`);
        ns.tprint(`DIVISION: ${divName} (${d.type})`);
        ns.tprint(
            `Awareness: ${ns.formatNumber(d.awareness)} | ` +
            `Popularity: ${ns.formatNumber(d.popularity)}`
        );
        ns.tprint(`Products: ${d.products.join(", ") || "(none)"}`);
        ns.tprint("---------------------------");

        for (const city of d.cities) {
            ns.tprint(`\nCity: ${city}`);

            // ------- Office Info -------
            try {
                const off = corpApi.getOffice(divName, city);
                ns.tprint(` Employees: ${off.numEmployees}`);
                ns.tprint(
                    `   Morale/Happiness/Energy: ` +
                    `${off.avgMorale.toFixed(1)} / ` +
                    `${off.avgHappiness.toFixed(1)} / ` +
                    `${off.avgEnergy.toFixed(1)}`
                );
                ns.tprint(`   Prod Mult: ${off.productionMult.toFixed(2)}`);
                ns.tprint(
                    `   Employee Breakdown: ${JSON.stringify(off.employeeJobs)}`
                );
            } catch {
                ns.tprint("   No office.");
            }

            // ------- Warehouse Info -------
            try {
                const wh = corpApi.getWarehouse(divName, city);
                ns.tprint(
                    ` Warehouse: ${wh.sizeUsed.toFixed(2)} / ${wh.size}`
                );

                const materials = Object.keys(wh.materials || {});
                for (const m of materials) {
                    const mat = wh.materials[m];
                    ns.tprint(
                        `   ${m.padEnd(12)} ` +
                        `Qty=${mat.qty.toFixed(2)}, ` +
                        `Prod=${mat.prod.toFixed(2)}, ` +
                        `Sell=${mat.sell.toFixed(2)}`
                    );
                }
            } catch {
                ns.tprint("   No warehouse.");
            }
        }

        // -------- PRODUCTS (Division-wide) --------
        if (d.products.length > 0) {
            ns.tprint("\nProducts:");
            for (const p of d.products) {
                try {
                    const prod = corpApi.getProduct(divName, p);
                    ns.tprint(
                        ` ${p.padEnd(18)}  ` +
                        `Rating=${prod.effectiveRating.toFixed(2)}, ` +
                        `Demand=${prod.demand.toFixed(2)}, ` +
                        `Competition=${prod.competition.toFixed(2)}`
                    );
                } catch {
                    ns.tprint(` Error getting product ${p}`);
                }
            }
        }
    }

    ns.tprint("\n============================================================");
    ns.tprint(" END OF CORP SNAPSHOT REPORT");
    ns.tprint("============================================================");
}
