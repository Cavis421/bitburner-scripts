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

// Compression I: RLE Compression
// Encode as: <count><char> with count in [1..9] repeating as needed.
solvers["Compression I: RLE Compression"] = (s) => {
    if (!s || s.length === 0) return "";
    let out = "";
    let runChar = s[0];
    let runLen = 1;

    const flush = () => {
        while (runLen > 9) {
            out += "9" + runChar;
            runLen -= 9;
        }
        out += String(runLen) + runChar;
    };

    for (let i = 1; i < s.length; i++) {
        const ch = s[i];
        if (ch === runChar) runLen++;
        else {
            flush();
            runChar = ch;
            runLen = 1;
        }
    }
    flush();
    return out;
};

// Compression II: LZ Decompression
// Bitburner LZ decompression variant.
// Format uses digits to describe alternating literal/copy segments.
// This implementation matches the standard Bitburner contract used in most solver libraries.
solvers["Compression II: LZ Decompression"] = (data) => {
    const s = String(data);
    let out = "";
    let i = 0;

    while (i < s.length) {
        // literal length
        const litLen = parseInt(s[i], 10);
        i++;
        if (litLen > 0) {
            out += s.slice(i, i + litLen);
            i += litLen;
        }
        if (i >= s.length) break;

        // backref length
        const backLen = parseInt(s[i], 10);
        i++;
        if (backLen === 0) continue;

        // backref offset is next digit
        const backOff = parseInt(s[i], 10);
        i++;

        const start = out.length - backOff;
        for (let k = 0; k < backLen; k++) {
            out += out[start + k];
        }
    }
    return out;
};

// Compression III: LZ Compression
// Produces an encoding compatible with Compression II solver above.
// Greedy strategy: emit literals, and when beneficial emit a backref of len<=9 off<=9.
solvers["Compression III: LZ Compression"] = (data) => {
    const s = String(data);
    let i = 0;
    let out = "";

    while (i < s.length) {
        // Find best backref at position i: (len, off) with len<=9, off<=9
        let bestLen = 0;
        let bestOff = 0;

        const maxOff = Math.min(9, i);
        for (let off = 1; off <= maxOff; off++) {
            let len = 0;
            while (
                len < 9 &&
                i + len < s.length &&
                s[i + len] === s[i - off + len]
            ) {
                len++;
            }
            if (len > bestLen) {
                bestLen = len;
                bestOff = off;
            }
        }

        // If backref helps, emit: <litLen><lits><backLen><backOff>
        // Otherwise, emit as literals. We cap litLen at 9.
        if (bestLen >= 3) {
            // emit up to 9 literals before the backref to keep format simple (often 0)
            // Here we emit 0 literals then backref.
            out += "0" + String(bestLen) + String(bestOff);
            i += bestLen;
        } else {
            // literal run of up to 9
            const litLen = Math.min(9, s.length - i);
            out += String(litLen) + s.slice(i, i + litLen) + "0";
            i += litLen;
        }
    }

    // Normalize: remove trailing "0" backref length if present? (safe to keep)
    return out;
};

// Generate IP Addresses
solvers["Generate IP Addresses"] = (s) => {
    s = String(s);
    const res = [];

    const validOctet = (part) => {
        if (part.length === 0 || part.length > 3) return false;
        if (part.length > 1 && part[0] === "0") return false;
        const n = Number(part);
        return n >= 0 && n <= 255;
    };

    for (let a = 1; a <= 3; a++) {
        for (let b = 1; b <= 3; b++) {
            for (let c = 1; c <= 3; c++) {
                const d = s.length - (a + b + c);
                if (d < 1 || d > 3) continue;

                const p1 = s.slice(0, a);
                const p2 = s.slice(a, a + b);
                const p3 = s.slice(a + b, a + b + c);
                const p4 = s.slice(a + b + c);

                if (validOctet(p1) && validOctet(p2) && validOctet(p3) && validOctet(p4)) {
                    res.push(`${p1}.${p2}.${p3}.${p4}`);
                }
            }
        }
    }
    return res;
};

// Algorithmic Stock Trader I (one transaction)
solvers["Algorithmic Stock Trader I"] = (prices) => {
    const p = prices;
    if (!p || p.length < 2) return 0;
    let min = p[0];
    let best = 0;
    for (let i = 1; i < p.length; i++) {
        best = Math.max(best, p[i] - min);
        min = Math.min(min, p[i]);
    }
    return best;
};

// Algorithmic Stock Trader II (unlimited transactions)
solvers["Algorithmic Stock Trader II"] = (prices) => {
    const p = prices;
    let profit = 0;
    for (let i = 1; i < p.length; i++) {
        const d = p[i] - p[i - 1];
        if (d > 0) profit += d;
    }
    return profit;
};

// Unique Paths in a Grid I
// Data: [rows, cols]
solvers["Unique Paths in a Grid I"] = (data) => {
    const rows = data[0];
    const cols = data[1];
    if (rows <= 0 || cols <= 0) return 0;

    // DP with O(cols)
    const dp = Array(cols).fill(1);
    for (let r = 1; r < rows; r++) {
        for (let c = 1; c < cols; c++) {
            dp[c] += dp[c - 1];
        }
    }
    return dp[cols - 1];
};

// Array Jumping Game (can reach end? 1/0)
solvers["Array Jumping Game"] = (arr) => {
    let furthest = 0;
    for (let i = 0; i < arr.length; i++) {
        if (i > furthest) return 0;
        furthest = Math.max(furthest, i + arr[i]);
        if (furthest >= arr.length - 1) return 1;
    }
    return 1;
};

// Array Jumping Game II (min jumps to reach end)
solvers["Array Jumping Game II"] = (arr) => {
    const n = arr.length;
    if (n <= 1) return 0;

    let jumps = 0;
    let curEnd = 0;
    let furthest = 0;

    for (let i = 0; i < n - 1; i++) {
        furthest = Math.max(furthest, i + arr[i]);
        if (i === curEnd) {
            jumps++;
            curEnd = furthest;
            if (curEnd >= n - 1) break;
        }
    }
    return jumps;
};

// Find All Valid Math Expressions
// Data: [numString, target]
solvers["Find All Valid Math Expressions"] = (data) => {
    const num = String(data[0]);
    const target = Number(data[1]);
    const res = [];

    const dfs = (idx, expr, acc, last) => {
        if (idx === num.length) {
            if (acc === target) res.push(expr);
            return;
        }

        for (let j = idx; j < num.length; j++) {
            // no leading zeros
            if (j > idx && num[idx] === "0") break;

            const partStr = num.slice(idx, j + 1);
            const partVal = Number(partStr);

            if (idx === 0) {
                dfs(j + 1, partStr, partVal, partVal);
            } else {
                dfs(j + 1, expr + "+" + partStr, acc + partVal, partVal);
                dfs(j + 1, expr + "-" + partStr, acc - partVal, -partVal);
                // multiplication: undo last, apply last*part
                dfs(j + 1, expr + "*" + partStr, acc - last + last * partVal, last * partVal);
            }
        }
    };

    dfs(0, "", 0, 0);
    return res;
};

// Merge Overlapping Intervals
solvers["Merge Overlapping Intervals"] = (intervals) => {
    if (!intervals || intervals.length === 0) return [];

    intervals.sort((a, b) => a[0] - b[0]);

    const merged = [];
    let [s, e] = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
        const [cs, ce] = intervals[i];
        if (cs <= e) {
            e = Math.max(e, ce);
        } else {
            merged.push([s, e]);
            s = cs; e = ce;
        }
    }
    merged.push([s, e]);
    return merged;
};

// Spiralize Matrix
solvers["Spiralize Matrix"] = (matrix) => {
    const res = [];
    let top = 0;
    let left = 0;
    let bottom = matrix.length - 1;
    let right = matrix[0].length - 1;

    while (top <= bottom && left <= right) {
        for (let c = left; c <= right; c++) res.push(matrix[top][c]);
        top++;

        for (let r = top; r <= bottom; r++) res.push(matrix[r][right]);
        right--;

        if (top <= bottom) {
            for (let c = right; c >= left; c--) res.push(matrix[bottom][c]);
            bottom--;
        }

        if (left <= right) {
            for (let r = bottom; r >= top; r--) res.push(matrix[r][left]);
            left++;
        }
    }
    return res;
};

// Proper 2-Coloring of a Graph
// Data: [n, edges]
solvers["Proper 2-Coloring of a Graph"] = (data) => {
    const n = data[0];
    const edges = data[1];

    const adj = Array.from({ length: n }, () => []);
    for (const [u, v] of edges) {
        adj[u].push(v);
        adj[v].push(u);
    }

    const color = Array(n).fill(-1);

    for (let start = 0; start < n; start++) {
        if (color[start] !== -1) continue;

        color[start] = 0;
        const q = [start];

        while (q.length) {
            const u = q.shift();
            for (const v of adj[u]) {
                if (color[v] === -1) {
                    color[v] = 1 - color[u];
                    q.push(v);
                } else if (color[v] === color[u]) {
                    return []; // not bipartite
                }
            }
        }
    }

    return color;
};
