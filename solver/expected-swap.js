"use strict";

// --- Average-case search under the restricted move set variant, mirroring
// minimax-swap.js exactly (same state, same per-mask Dijkstra over
// positions via swap-graph.js's repositionDijkstra(), same forced-walk
// base case) but minimizing the size-weighted expected number of
// additional guesses instead of the worst case. See minimax-swap.js for
// the full rationale, including why a non-splitting guess can still be
// necessary here (unlike in the unrestricted-move average-case solver).

const { popcount, indicesOf } = require("./minimax");
const { repositionDijkstra } = require("./swap-graph");

function makeSwapExpectedSolver(scoreMatrix, adjacency, distances, n) {
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

    const diValues = new Array(size).fill(Infinity);
    const guessBuckets = new Map();

    for (let x = 0; x < size; x += 1) {
      const buckets = partition(mask, x);
      const nonSolved = [...buckets].filter(([score]) => score !== n);
      const solvedAny = [...buckets].some(([score]) => score === n);

      if (nonSolved.length === 1 && !solvedAny && nonSolved[0][1] === mask) {
        continue; // pure repositioning
      }

      let sum = 0;
      buckets.forEach((submask, score) => {
        const bucketSize = popcount(submask);

        if (score === n) {
          sum += bucketSize * 1;
          return;
        }

        const sub = solveMask(submask, pool);
        sum += bucketSize * (1 + sub.g[x]);
      });

      diValues[x] = sum / count;
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
    solveFrom(startClassIdx, mask, pool) {
      const r = solveMask(mask, pool);
      const c = r.choice[startClassIdx];
      return { avg: r.g[startClassIdx], guess: c ? c.guess : null, informative: c ? c.informative : null };
    },
    solveMask
  };
}

module.exports = { makeSwapExpectedSolver };
