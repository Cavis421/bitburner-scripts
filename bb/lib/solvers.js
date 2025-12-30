/** lib/solvers.js
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
// Algorithmic Stock Trader IV
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
// HammingCodes (SECDED)
// Canonical key: "HammingCodes: Integer to Encoded Binary"
// ---------------------------------------------------------------------------

/**
 * Hamming(SECDED) encoding used by Bitburner coding contracts:
 * - Hamming parity bits at positions 1,2,4,8,... (1-indexed)
 * - Plus an overall parity bit at the very front (index 0 in the final string)
 *
 * Returns a string of bits.
 */
solvers["HammingCodes: Integer to Encoded Binary"] = (value) => {
    const dataBits = value.toString(2).split("");
    const m = dataBits.length;

    // Determine number of parity bits r such that: 2^r >= m + r + 1
    let r = 0;
    while ((1 << r) < (m + r + 1)) r++;

    // Build array with placeholders (1-indexed for hamming positions).
    const h = ["_"]; // dummy so h[1] is position 1
    let dataIdx = 0;

    for (let pos = 1; pos <= (m + r); pos++) {
        if ((pos & (pos - 1)) === 0) h[pos] = "0"; // parity placeholder
        else h[pos] = dataBits[dataIdx++];
    }

    // Compute parity bits (even parity)
    for (let i = 0; i < r; i++) {
        const p = 1 << i;
        let ones = 0;
        for (let pos = 1; pos < h.length; pos++) {
            if ((pos & p) && h[pos] === "1") ones++;
        }
        h[p] = (ones % 2).toString();
    }

    // Overall parity across all bits (excluding the overall bit itself)
    let totalOnes = 0;
    for (let pos = 1; pos < h.length; pos++) {
        if (h[pos] === "1") totalOnes++;
    }
    const overall = (totalOnes % 2).toString();

    return overall + h.slice(1).join("");
};

// Alias for mismatched casing you had earlier (prevents "No solver" surprises)
solvers["HammingCodes: Integer to encoded Binary"] = solvers["HammingCodes: Integer to Encoded Binary"];

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
            if ((pos & p) && h[pos] === "1") ones++;
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
        if ((pos & (pos - 1)) !== 0) dataBits.push(h[pos]);
    }

    const bin = dataBits.join("");
    return bin.length ? parseInt(bin, 2) : 0;
};

// ---------------------------------------------------------------------------
// Find Largest Prime Factor
// ---------------------------------------------------------------------------

solvers["Find Largest Prime Factor"] = (data) => {
    let n = (typeof data === "bigint") ? data : BigInt(data);
    if (n < 2n) return 0;

    let largest = 1n;

    while (n % 2n === 0n) {
        largest = 2n;
        n /= 2n;
    }

    let f = 3n;
    while (f * f <= n) {
        while (n % f === 0n) {
            largest = f;
            n /= f;
        }
        f += 2n;
    }

    if (n > 1n) largest = n;

    return (largest <= BigInt(Number.MAX_SAFE_INTEGER)) ? Number(largest) : largest.toString();
};

// ---------------------------------------------------------------------------
// Unique Paths in a Grid II
// ---------------------------------------------------------------------------

solvers["Unique Paths in a Grid II"] = (grid) => {
    const rows = grid.length;
    if (rows === 0) return 0;

    const cols = grid[0].length;
    if (cols === 0) return 0;

    if (grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1) return 0;

    const dp = Array(cols).fill(0);
    dp[0] = 1;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === 1) dp[c] = 0;
            else if (c > 0) dp[c] += dp[c - 1];
        }
    }

    return dp[cols - 1];
};

// ---------------------------------------------------------------------------
// Square Root (floor)
// ---------------------------------------------------------------------------

solvers["Square Root"] = (n) => {
    let x;
    if (typeof n === "bigint") x = n;
    else if (typeof n === "number") x = BigInt(Math.trunc(n));
    else x = BigInt(n);

    if (x < 0n) return 0;
    if (x < 2n) return x.toString();

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

    if (ans <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(ans);
    return ans.toString();
};

// ---------------------------------------------------------------------------
// Sanitize Parentheses in Expression
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Minimum Path Sum in a Triangle
// ---------------------------------------------------------------------------

solvers["Minimum Path Sum in a Triangle"] = (triangle) => {
    const n = triangle.length;
    if (n === 0) return 0;

    const dp = triangle[n - 1].slice();
    for (let i = n - 2; i >= 0; i--) {
        for (let j = 0; j < triangle[i].length; j++) {
            dp[j] = triangle[i][j] + Math.min(dp[j], dp[j + 1]);
        }
    }
    return dp[0];
};

// ---------------------------------------------------------------------------
// Compression I: RLE Compression
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Compression II: LZ Decompression (alternating-chunk spec)
// ---------------------------------------------------------------------------

solvers["Compression II: LZ Decompression"] = (data) => {
    const s = String(data);
    let out = "";
    let i = 0;
    let isLiteral = true; // start with literal chunk

    while (i < s.length) {
        const L = s.charCodeAt(i) - 48;
        i++;

        if (L === 0) {
            isLiteral = !isLiteral;
            continue;
        }

        if (isLiteral) {
            out += s.slice(i, i + L);
            i += L;
        } else {
            const X = s.charCodeAt(i) - 48;
            i++;
            const start = out.length - X;
            for (let k = 0; k < L; k++) out += out[start + k];
        }

        isLiteral = !isLiteral;
    }

    return out;
};

// ---------------------------------------------------------------------------
// Generate IP Addresses
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Algorithmic Stock Trader I / II
// ---------------------------------------------------------------------------

solvers["Algorithmic Stock Trader I"] = (prices) => {
    if (!prices || prices.length < 2) return 0;
    let min = prices[0];
    let best = 0;
    for (let i = 1; i < prices.length; i++) {
        best = Math.max(best, prices[i] - min);
        min = Math.min(min, prices[i]);
    }
    return best;
};

solvers["Algorithmic Stock Trader II"] = (prices) => {
    let profit = 0;
    for (let i = 1; i < prices.length; i++) {
        const d = prices[i] - prices[i - 1];
        if (d > 0) profit += d;
    }
    return profit;
};

// ---------------------------------------------------------------------------
// Unique Paths in a Grid I
// ---------------------------------------------------------------------------

solvers["Unique Paths in a Grid I"] = (data) => {
    const rows = data[0];
    const cols = data[1];
    if (rows <= 0 || cols <= 0) return 0;

    const dp = Array(cols).fill(1);
    for (let r = 1; r < rows; r++) {
        for (let c = 1; c < cols; c++) dp[c] += dp[c - 1];
    }
    return dp[cols - 1];
};

// ---------------------------------------------------------------------------
// Array Jumping Game I / II
// ---------------------------------------------------------------------------

solvers["Array Jumping Game"] = (arr) => {
    let furthest = 0;
    for (let i = 0; i < arr.length; i++) {
        if (i > furthest) return 0;
        furthest = Math.max(furthest, i + arr[i]);
        if (furthest >= arr.length - 1) return 1;
    }
    return 1;
};

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

// ---------------------------------------------------------------------------
// Find All Valid Math Expressions
// ---------------------------------------------------------------------------

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
            if (j > idx && num[idx] === "0") break;

            const partStr = num.slice(idx, j + 1);
            const partVal = Number(partStr);

            if (idx === 0) {
                dfs(j + 1, partStr, partVal, partVal);
            } else {
                dfs(j + 1, expr + "+" + partStr, acc + partVal, partVal);
                dfs(j + 1, expr + "-" + partStr, acc - partVal, -partVal);
                dfs(j + 1, expr + "*" + partStr, acc - last + last * partVal, last * partVal);
            }
        }
    };

    dfs(0, "", 0, 0);
    return res;
};

// ---------------------------------------------------------------------------
// Merge Overlapping Intervals
// ---------------------------------------------------------------------------

solvers["Merge Overlapping Intervals"] = (intervals) => {
    if (!intervals || intervals.length === 0) return [];

    intervals.sort((a, b) => a[0] - b[0]);

    const merged = [];
    let [s, e] = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
        const [cs, ce] = intervals[i];
        if (cs <= e) e = Math.max(e, ce);
        else {
            merged.push([s, e]);
            s = cs; e = ce;
        }
    }
    merged.push([s, e]);
    return merged;
};

// ---------------------------------------------------------------------------
// Spiralize Matrix
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Proper 2-Coloring of a Graph
// ---------------------------------------------------------------------------

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
                    return [];
                }
            }
        }
    }

    return color;
};

// ---------------------------------------------------------------------------
// Compression III: LZ Compression (alternating-chunk spec, minimum length DP)
// ---------------------------------------------------------------------------

solvers["Compression III: LZ Compression"] = (data) => {
    const s = String(data);
    const n = s.length;

    const digit = (x) => String.fromCharCode(48 + x);

    // match[pos][x] = max L (<=9) such that s[pos..pos+L) == s[pos-x..pos-x+L)
    const match = Array.from({ length: n + 1 }, () => Array(10).fill(0));
    for (let pos = 0; pos < n; pos++) {
        for (let x = 1; x <= 9; x++) {
            if (pos - x < 0) continue;
            const maxL = Math.min(9, n - pos);
            let L = 0;
            while (L < maxL && s[pos + L] === s[pos - x + L]) L++;
            match[pos][x] = L;
        }
    }

    // dpCost[pos][type], type 0 = literal next, type 1 = backref next
    const dpCost = Array.from({ length: n + 1 }, () => [Infinity, Infinity]);

    // choice[pos][type] = { kind:"lit", L } | { kind:"back", L, x } | { kind:"flip0" } | { kind:"end" }
    const choice = Array.from({ length: n + 1 }, () => [null, null]);

    dpCost[n][0] = 0; dpCost[n][1] = 0;
    choice[n][0] = { kind: "end" };
    choice[n][1] = { kind: "end" };

    for (let pos = n - 1; pos >= 0; pos--) {
        // ---- Best consume options (no flip0) ----
        // Literal consume: choose L=1..9
        let litBestCost = Infinity;
        let litBest = null;
        const maxLit = Math.min(9, n - pos);
        for (let L = 1; L <= maxLit; L++) {
            const cost = (1 + L) + dpCost[pos + L][1]; // 'L' + L chars, then next is backref
            if (cost < litBestCost) {
                litBestCost = cost;
                litBest = { kind: "lit", L };
            }
        }

        // Backref consume: choose x=1..9 and L=1..min(9, match)
        let backBestCost = Infinity;
        let backBest = null;
        for (let x = 1; x <= 9; x++) {
            const mL = match[pos][x];
            if (mL <= 0) continue;
            const maxBack = Math.min(9, mL);
            for (let L = 1; L <= maxBack; L++) {
                const cost = 2 + dpCost[pos + L][0]; // 'L' + 'x', then next is literal
                if (cost < backBestCost) {
                    backBestCost = cost;
                    backBest = { kind: "back", L, x };
                }
            }
        }

        // ---- Solve the coupled mins with quick relaxation ----
        // dp0 = min(litBestCost, 1 + dp1)
        // dp1 = min(backBestCost, 1 + dp0)
        //
        // Start with consume-only, then relax 2-3 times (converges fast due to +1 costs).
        let dp0 = litBestCost;
        let dp1 = backBestCost;

        // If backrefs impossible at this pos, dp1 starts Infinity, relaxation will use flip0.
        for (let it = 0; it < 4; it++) {
            dp0 = Math.min(litBestCost, 1 + dp1);
            dp1 = Math.min(backBestCost, 1 + dp0);
        }

        dpCost[pos][0] = dp0;
        dpCost[pos][1] = dp1;

        // ---- Record choices that reproduce dp0/dp1 ----
        // For type 0:
        if (dp0 === litBestCost) {
            choice[pos][0] = litBest; // literal consume
        } else {
            choice[pos][0] = { kind: "flip0" }; // 0-length chunk to flip to type 1
        }

        // For type 1:
        if (dp1 === backBestCost) {
            choice[pos][1] = backBest; // backref consume
        } else {
            choice[pos][1] = { kind: "flip0" }; // 0-length chunk to flip to type 0
        }
    }

    // ---- Reconstruct encoding from pos=0, type=0 (literal next) ----
    let pos = 0;
    let type = 0;
    const parts = [];

    while (pos < n) {
        const ch = choice[pos][type];
        if (!ch || ch.kind === "end") break;

        if (ch.kind === "flip0") {
            parts.push("0");
            type = 1 - type;
            continue;
        }

        if (type === 0 && ch.kind === "lit") {
            parts.push(digit(ch.L));
            parts.push(s.slice(pos, pos + ch.L));
            pos += ch.L;
            type = 1;
            continue;
        }

        if (type === 1 && ch.kind === "back") {
            parts.push(digit(ch.L));
            parts.push(digit(ch.x));
            pos += ch.L;
            type = 0;
            continue;
        }

        // Safety break (should never happen)
        break;
    }

    return parts.join("");


};

// ---------------------------------------------------------------------------
// Square Root (BigInt)
// ---------------------------------------------------------------------------
// Given ~200-digit BigInt N, return sqrt(N) rounded to the nearest integer (as a string, no trailing "n").
solvers["Square Root"] = (data) => {
    // Normalize input -> BigInt
    let n;
    if (typeof data === "bigint") {
        n = data;
    } else {
        const s = String(data).trim();
        n = BigInt(s.endsWith("n") ? s.slice(0, -1) : s);
    }

    if (n < 0n) return ""; // not expected, but safe
    if (n < 2n) return n.toString();

    // Integer sqrt floor via Newton's method
    let x = n;
    let y = (x + 1n) >> 1n;
    while (y < x) {
        x = y;
        y = (x + n / x) >> 1n;
    }
    const floor = x;

    // Round to nearest integer: compare distances to floor^2 and (floor+1)^2
    const up = floor + 1n;
    const floorSq = floor * floor;
    const upSq = up * up;

    const downDiff = n >= floorSq ? (n - floorSq) : (floorSq - n);
    const upDiff = upSq >= n ? (upSq - n) : (n - upSq);

    // If tie, choose floor (stable)
    return (upDiff < downDiff ? up : floor).toString();
};
