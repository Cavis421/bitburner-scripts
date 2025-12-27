/** contracts/solvers.js
 * Solver library for Coding Contracts.
 *
 * Notes:
 * - This file is primarily imported by other scripts.
 * - A small `main()` is included so `run contracts/solvers.js --help` works.
 */

export const solvers = {};

/** Print --help for this module (mainly for consistency / sanity checks). */
export function printHelp(ns) {
    ns.tprint([
        "contracts/solvers.js",
        "Description:",
        "  Library of Coding Contract solver functions keyed by contract type string.",
        "",
        "Usage:",
        "  run contracts/solvers.js --help",
        "",
        "Notes:",
        "  - This file is typically imported by another script (e.g. contracts/find-and-solve.js).",
        "  - The exported object is:  import { solvers } from \"contracts/solvers.js\";",
    ].join("\n"));
}

/** Optional entrypoint so this file supports --help. */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    ns.tprint("contracts/solvers.js is a library. Try: run contracts/find-and-solve.js --help");
}

// ---------------------------------------------------------------------------
// PATCH 1: Fix Algorithmic Stock Trader IV (the original references `ans`)
// ---------------------------------------------------------------------------

solvers["Algorithmic Stock Trader IV"] = (data) => {
    const k = data[0];
    const prices = data[1];

    const len = prices.length;
    if (len < 2 || k <= 0) return 0;

    // If k is large enough, it's equivalent to unlimited transactions.
    if (k >= Math.floor(len / 2)) {
        let res = 0;
        for (let i = 1; i < len; ++i) {
            res += Math.max(prices[i] - prices[i - 1], 0);
        }
        return res;
    }

    // DP: hold[j] = max profit after buying jth stock (j transactions used), rele[j] after selling jth
    const hold = Array(k + 1).fill(Number.NEGATIVE_INFINITY);
    const rele = Array(k + 1).fill(0);

    for (let i = 0; i < len; ++i) {
        const cur = prices[i];
        for (let j = k; j > 0; --j) {
            rele[j] = Math.max(rele[j], hold[j] + cur);
            hold[j] = Math.max(hold[j], rele[j - 1] - cur);
        }
    }
    return rele[k];
};

// ---------------------------------------------------------------------------
// PATCH 2: Replace broken HammingCodes solvers (your file has invalid `._data` tokens)
// ---------------------------------------------------------------------------

/**
 * Hamming(SECDED) encoding used by Bitburner coding contracts:
 * - We build Hamming parity bits at positions 1,2,4,8,... (1-indexed)
 * - Plus an overall parity bit at the very front (index 0 in the final string)
 *
 * Returns a string of bits.
 */
solvers["HammingCodes: Integer to encoded Binary"] = (value) => {
    const dataBits = value.toString(2).split(""); // e.g. "10101" -> ["1","0","1","0","1"]

    // Determine number of parity bits r such that: 2^r >= m + r + 1
    const m = dataBits.length;
    let r = 0;
    while ((1 << r) < (m + r + 1)) r++;

    // Build array with placeholders (1-indexed for hamming positions).
    // We'll later prepend overall parity at index 0.
    const h = ["_"]; // dummy so h[1] is position 1
    let dataIdx = 0;

    for (let pos = 1; pos <= (m + r); pos++) {
        if ((pos & (pos - 1)) === 0) {
            // power of two -> parity placeholder
            h[pos] = "0";
        } else {
            h[pos] = dataBits[dataIdx++];
        }
    }

    // Compute parity bits: parity bit at position p checks positions where (pos & p) != 0
    for (let i = 0; i < r; i++) {
        const p = 1 << i;
        let ones = 0;
        for (let pos = 1; pos < h.length; pos++) {
            if (pos & p) {
                if (h[pos] === "1") ones++;
            }
        }
        h[p] = (ones % 2).toString(); // even parity
    }

    // Overall parity across all bits (excluding the overall bit itself)
    let totalOnes = 0;
    for (let pos = 1; pos < h.length; pos++) {
        if (h[pos] === "1") totalOnes++;
    }
    const overall = (totalOnes % 2).toString();

    // Final string is overall parity + remaining positions 1..end
    return overall + h.slice(1).join("");
};

/**
 * Decodes Hamming(SECDED) produced above.
 * Returns the original integer.
 *
 * If there are uncorrectable errors (e.g. 2-bit), Bitburner contract expects 0.
 */
solvers["HammingCodes: Encoded Binary to Integer"] = (_data) => {
    if (!_data || _data.length < 2) return 0;

    const bits = _data.split("");
    const overall = bits.shift(); // first bit is overall parity
    const h = ["_"].concat(bits); // 1-indexed

    const n = h.length - 1;

    // Determine r from length (largest power of two <= n)
    let r = 0;
    while ((1 << r) <= n) r++;

    // Compute syndrome
    let syndrome = 0;
    for (let i = 0; i < r; i++) {
        const p = 1 << i;
        let ones = 0;
        for (let pos = 1; pos <= n; pos++) {
            if (pos & p) {
                if (h[pos] === "1") ones++;
            }
        }
        if (ones % 2 !== 0) syndrome |= p;
    }

    // Check overall parity
    let totalOnes = 0;
    for (let pos = 1; pos <= n; pos++) {
        if (h[pos] === "1") totalOnes++;
    }
    if (overall === "1") totalOnes++; // include overall bit
    const overallOk = (totalOnes % 2 === 0);

    if (syndrome === 0 && overallOk) {
        // no error
    } else if (syndrome !== 0 && !overallOk) {
        // single-bit error in positions 1..n -> correct it
        if (syndrome >= 1 && syndrome <= n) {
            h[syndrome] = (h[syndrome] === "1") ? "0" : "1";
        } else {
            return 0;
        }
    } else if (syndrome === 0 && !overallOk) {
        // error is in the overall parity bit only -> ignore (correctable)
    } else {
        // syndrome != 0 and overall parity ok -> implies 2-bit error (uncorrectable)
        return 0;
    }

    // Extract data bits (skip parity positions 1,2,4,8,...)
    const dataBits = [];
    for (let pos = 1; pos <= n; pos++) {
        if ((pos & (pos - 1)) !== 0) {
            dataBits.push(h[pos]);
        }
    }

    // Convert to int
    const bin = dataBits.join("");
    return bin.length ? parseInt(bin, 2) : 0;
};

// Largest prime factor of a (positive) integer.
// Contract type key MUST match exactly: "Find Largest Prime Factor"
solvers["Find Largest Prime Factor"] = (data) => {
    // Bitburner usually supplies a Number, but we'll compute with BigInt for safety.
    let n = (typeof data === "bigint") ? data : BigInt(data);

    if (n < 2n) return 0;

    let largest = 1n;

    // Remove factors of 2
    while (n % 2n === 0n) {
        largest = 2n;
        n /= 2n;
    }

    // Remove odd factors
    let f = 3n;
    while (f * f <= n) {
        while (n % f === 0n) {
            largest = f;
            n /= f;
        }
        f += 2n;
    }

    // Whatever remains > 1 is prime
    if (n > 1n) largest = n;

    // Return a normal Number when safe; otherwise return as string (Bitburner accepts it fine)
    return (largest <= BigInt(Number.MAX_SAFE_INTEGER)) ? Number(largest) : largest.toString();
};

// Unique Paths in a Grid II
// Data: 2D array grid of 0/1 where 1 = obstacle, 0 = open
// Return: number of unique paths from top-left to bottom-right moving only down/right
solvers["Unique Paths in a Grid II"] = (grid) => {
    const rows = grid.length;
    if (rows === 0) return 0;

    const cols = grid[0].length;
    if (cols === 0) return 0;

    // If start or end is blocked -> 0
    if (grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1) return 0;

    // DP with O(cols) memory:
    // dp[c] = # ways to reach cell in current row at column c
    const dp = Array(cols).fill(0);
    dp[0] = 1;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === 1) {
                dp[c] = 0; // cannot stand on obstacle
            } else if (c > 0) {
                dp[c] += dp[c - 1]; // ways from left + ways already in dp[c] (from above)
            }
        }
    }

    return dp[cols - 1];
};

// HammingCodes: Integer to Encoded Binary
solvers["HammingCodes: Integer to Encoded Binary"] = (value) => {
    const dataBits = value.toString(2).split("");
    const m = dataBits.length;

    // Find number of parity bits r such that 2^r >= m + r + 1
    let r = 0;
    while ((1 << r) < m + r + 1) r++;

    // Build Hamming array (1-indexed)
    const h = ["_"];
    let dataIdx = 0;

    for (let pos = 1; pos <= m + r; pos++) {
        if ((pos & (pos - 1)) === 0) {
            h[pos] = "0"; // parity placeholder
        } else {
            h[pos] = dataBits[dataIdx++];
        }
    }

    // Compute parity bits
    for (let i = 0; i < r; i++) {
        const p = 1 << i;
        let ones = 0;
        for (let pos = 1; pos < h.length; pos++) {
            if (pos & p && h[pos] === "1") ones++;
        }
        h[p] = (ones % 2).toString();
    }

    // Overall parity
    let totalOnes = 0;
    for (let pos = 1; pos < h.length; pos++) {
        if (h[pos] === "1") totalOnes++;
    }
    const overall = (totalOnes % 2).toString();

    return overall + h.slice(1).join("");
};


// Square Root
// Returns floor(sqrt(n)) as a Number when safe, otherwise as a decimal string.
// (Avoids scientific notation / float formatting issues.)
solvers["Square Root"] = (n) => {
    // Bitburner may provide n as a number or string; normalize to BigInt safely.
    // If it's already a BigInt, keep it.
    let x;
    if (typeof n === "bigint") x = n;
    else if (typeof n === "number") x = BigInt(Math.trunc(n)); // contract inputs are integers
    else x = BigInt(n); // string

    if (x < 0n) return 0;
    if (x < 2n) return x.toString();

    // Integer binary search for floor(sqrt(x))
    let lo = 1n;
    let hi = x;
    let ans = 1n;

    while (lo <= hi) {
        const mid = (lo + hi) >> 1n;
        const sq = mid * mid;
        if (sq <= x) {
            ans = mid;
            lo = mid + 1n;
        } else {
            hi = mid - 1n;
        }
    }

    // Return as Number only when it won't lose precision / format
    if (ans <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(ans);
    return ans.toString();
};


// Sanitize Parentheses in Expression
solvers["Sanitize Parentheses in Expression"] = (s) => {
    const res = [];
    const visited = new Set();
    const queue = [s];
    visited.add(s);

    let found = false;

    const isValid = (str) => {
        let bal = 0;
        for (const ch of str) {
            if (ch === "(") bal++;
            else if (ch === ")") {
                if (--bal < 0) return false;
            }
        }
        return bal === 0;
    };

    while (queue.length > 0) {
        const cur = queue.shift();

        if (isValid(cur)) {
            res.push(cur);
            found = true;
        }

        if (found) continue; // only minimal removals

        for (let i = 0; i < cur.length; i++) {
            if (cur[i] !== "(" && cur[i] !== ")") continue;

            const next = cur.slice(0, i) + cur.slice(i + 1);
            if (!visited.has(next)) {
                visited.add(next);
                queue.push(next);
            }
        }
    }

    return res;
};

// Minimum Path Sum in a Triangle
// Data: triangle as array of rows, e.g. [[2],[3,4],[6,5,7],[4,1,8,3]]
// Return: minimum possible sum from top to bottom, moving to adjacent numbers.
solvers["Minimum Path Sum in a Triangle"] = (triangle) => {
    const n = triangle.length;
    if (n === 0) return 0;

    // Bottom-up DP in-place over a copy of the last row
    // dp[j] = min path sum from row i at position j down to bottom
    const dp = triangle[n - 1].slice();

    for (let i = n - 2; i >= 0; i--) {
        for (let j = 0; j < triangle[i].length; j++) {
            dp[j] = triangle[i][j] + Math.min(dp[j], dp[j + 1]);
        }
    }

    return dp[0];
};

