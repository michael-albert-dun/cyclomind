"use strict";

// --- Minimax search under the *restricted move set* variant --------------
//
// Back to the hard (match-count-only) feedback model — bestExact()/
// buildScoreMatrix() in necklace.js, unchanged — but now consecutive
// guesses must be adjacent in the transposition graph (swap-graph.js):
// you can't rearrange freely between guesses, only swap two beads. So the
// state is (current position, live candidate set), not just the candidate
// set, and legal next guesses are restricted to neighbours of the current
// position, not the whole universe.
//
// Solved per fixed candidate mask via `repositionDijkstra()` in
// swap-graph.js, for *every* starting position at once — not a plain
// per-position recursion. The reason: a guess that provides no new
// information about the current mask isn't automatically useless here the
// way it was when movement was free — it may be the only way to reach a
// position from which some other guess *is* informative (see swap-graph.js
// for the full explanation; this was caught by the required
// restricted->=unrestricted cross-check, not assumed up front).
//
// Two things that don't arise in the unrestricted model:
//   - Once only one candidate remains, submitting it isn't automatically
//     1 more guess — you may need several swaps to *walk* to it if it
//     isn't directly adjacent to where you're standing (all-pairs shortest
//     paths, from swap-graph.js).
//   - The 'candidates'-only pool (next guess must be both a graph-neighbour
//     *and* a still-live candidate) can be genuinely infeasible from some
//     starting positions — nothing forces a live candidate to be adjacent
//     to wherever you're standing, and unlike 'all', you're not allowed to
//     reposition through a non-candidate either. Reported as Infinity
//     (`repositionDijkstra` naturally leaves such a position unreached)
//     rather than papered over.

const { popcount, indicesOf } = require("./minimax");
const { repositionDijkstra } = require("./swap-graph");

function makeSwapMinimaxSolver(scoreMatrix, adjacency, distances, n) {
  const size = scoreMatrix.length;
  const memo = { candidates: new Map(), all: new Map() };

  function partition(mask, guessIdx) {
    const buckets = new Map();

    indicesOf(mask, size).forEach((secretIdx) => {
      const score = scoreMatrix[secretIdx][guessIdx];
      const bit = 1n << BigInt(secretIdx);

      buckets.set(score, (buckets.get(score) || 0n) | bit);
    });

    return buckets;
  }

  function stepToward(from, target) {
    const d = distances[from][target];
    return adjacency[from].find((nb) => distances[nb][target] === d - 1);
  }

  // Solves every starting position at once for one fixed candidate mask.
  function solveMask(mask, pool) {
    const table = memo[pool];
    const key = mask.toString();

    if (table.has(key)) return table.get(key);

    const count = popcount(mask);

    if (count === 1) {
      const target = indicesOf(mask, size)[0];
      const g = new Array(size);
      const choice = new Array(size);

      for (let p = 0; p < size; p += 1) {
        g[p] = distances[p][target];
        choice[p] = g[p] === 0 ? null : { guess: stepToward(p, target), informative: false };
      }

      const result = { g, choice, guessBuckets: new Map() };
      table.set(key, result);
      return result;
    }

    // Classify every class X as either "informative" (guessing it right
    // now actually splits or resolves something in the mask — cost
    // diValues[X]) or pure repositioning (Infinity — contributes only as
    // a weight-1 edge in the Dijkstra step below).
    const diValues = new Array(size).fill(Infinity);
    const guessBuckets = new Map();

    for (let x = 0; x < size; x += 1) {
      const buckets = partition(mask, x);
      const nonSolved = [...buckets].filter(([score]) => score !== n);
      const solvedAny = [...buckets].some(([score]) => score === n);

      if (nonSolved.length === 1 && !solvedAny && nonSolved[0][1] === mask) {
        continue; // pure repositioning: no new information from guessing x
      }

      let worst = 0;
      nonSolved.forEach(([, submask]) => {
        const sub = solveMask(submask, pool);
        const subCost = sub.g[x]; // after guessing x, the new position IS x
        if (subCost > worst) worst = subCost;
      });

      diValues[x] = 1 + worst;
      guessBuckets.set(x, buckets);
    }

    const inMaskSet = new Set(indicesOf(mask, size));
    const neighborsFor = (p) =>
      pool === "all" ? adjacency[p] : adjacency[p].filter((x) => inMaskSet.has(x));

    const { g, choice } = repositionDijkstra(size, neighborsFor, diValues);
    const result = { g, choice, guessBuckets };
    table.set(key, result);
    return result;
  }

  return {
    size,
    // Cost/first-move from a specific starting position for the full mask
    // (or any mask) — the usual entry point.
    solveFrom(startClassIdx, mask, pool) {
      const r = solveMask(mask, pool);
      const c = r.choice[startClassIdx];
      return { cost: r.g[startClassIdx], guess: c ? c.guess : null, informative: c ? c.informative : null };
    },
    // Raw access for tree printing / simulation, which need buckets too.
    solveMask
  };
}

module.exports = { makeSwapMinimaxSolver };
