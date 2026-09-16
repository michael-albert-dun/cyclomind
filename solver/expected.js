"use strict";

// --- Average-case (expected value) optimal guessing strategy ------------
//
// Same state space and machinery as minimax.js (candidate sets as BigInt
// bitmasks over necklace classes, memoized on the set), but instead of
// minimizing the *worst-case* number of additional guesses, this minimizes
// the *expected* number of additional guesses, assuming the true secret is
// uniformly distributed over the live candidate set at every point (i.e.
// assuming a uniformly-random secret overall, which is what the real game
// does per README.md's "Uniform secret generation" section).
//
// Recursively, for a live candidate set S (|S| = k) and a candidate guess
// g: partition S by the score g would produce against each member. Every
// member landing in the score === n bucket is solved outright by this
// guess (cost 1). Every other bucket B needs 1 + f(B) more guesses on
// average, where f(B) is this same optimum applied to that smaller set.
// f(S) is the minimum, over allowed guesses g, of the resulting average.
//
// Unlike minimax, there's no simple "if the worst branch alone already
// beats the best found so far, stop" short-circuit, because every branch
// contributes to the sum regardless of the others. What *does* work is
// literal branch-and-bound on the running (unnormalized) sum: since every
// remaining bucket can only add a non-negative amount, once the partial
// sum for a guess already reaches or exceeds the best total sum found so
// far, that guess cannot win and the rest of its buckets can be skipped.
// This is exact pruning (never changes the answer), not a heuristic bound.

const { popcount, indicesOf, maskOf } = require("./minimax");

function makeExpectedSolver(scoreMatrix, n) {
  const size = scoreMatrix.length;
  const allIndices = Array.from({ length: size }, (_, i) => i);
  const fullMask = maskOf(allIndices);
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

  function solve(mask, pool) {
    const table = memo[pool];
    const key = mask.toString();

    if (table.has(key)) return table.get(key);

    const count = popcount(mask);

    if (count === 1) {
      const result = { avg: 1, sum: 1, guess: indicesOf(mask, size)[0], buckets: new Map() };
      table.set(key, result);
      return result;
    }

    const inMask = indicesOf(mask, size);
    let guessCandidates;

    if (pool === "all") {
      const inMaskSet = new Set(inMask);
      guessCandidates = [...inMask, ...allIndices.filter((i) => !inMaskSet.has(i))];
    } else {
      guessCandidates = inMask;
    }

    let best = null;

    for (const guessIdx of guessCandidates) {
      const buckets = partition(mask, guessIdx);
      const entries = [...buckets].sort((a, b) => {
        const sizeDiff = popcount(b[1]) - popcount(a[1]);
        return sizeDiff !== 0 ? sizeDiff : a[0] - b[0];
      });

      let runningSum = 0;
      let useless = false;
      let pruned = false;

      for (const [score, submask] of entries) {
        const bucketSize = popcount(submask);

        if (score === n) {
          // Solved outright for every secret in this bucket (bucketSize is
          // always 0 or 1: only one necklace class can score a perfect n
          // against a given guess).
          runningSum += bucketSize * 1;
          continue;
        }

        if (submask === mask) {
          useless = true; // zero-progress guess, would recurse forever
          break;
        }

        const sub = solve(submask, pool);
        runningSum += bucketSize * (1 + sub.avg);

        if (best !== null && runningSum >= best.sum) {
          pruned = true; // can't possibly beat the current best any more
          break;
        }
      }

      if (useless || pruned) continue;

      if (best === null || runningSum < best.sum) {
        best = { sum: runningSum, guess: guessIdx, buckets };
      }
    }

    if (best === null) {
      throw new Error(`No informative guess found for mask=${key} pool=${pool}`);
    }

    const result = { avg: best.sum / count, sum: best.sum, guess: best.guess, buckets: best.buckets };
    table.set(key, result);
    return result;
  }

  return {
    size,
    fullMask,
    allIndices,
    solve: (pool) => solve(fullMask, pool),
    solveMask: (mask, pool) => solve(mask, pool)
  };
}

module.exports = { makeExpectedSolver };
