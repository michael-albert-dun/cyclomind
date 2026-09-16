"use strict";

// --- Average-case (expected value) search under the rotation-aware model.
//
// Same relationship to expected.js as minimax-rotation.js has to
// minimax.js: identical recursion (minimize the size-weighted average of
// `1 + f(bucket)` over a guess's non-solved buckets), but the state space
// is literal bead sequences (not necklace classes) and the bucket key is
// the composite `${exact}:${rotation}` from necklace.js's
// buildRichScoreMatrix(), not a bare exact count. See minimax-rotation.js
// for why literal sequences are the right unit here (rotation feedback
// isn't rotation-invariant, so two rotations of the same necklace class
// are genuinely distinguishable states under this feedback model).

const { popcount, indicesOf, maskOf } = require("./minimax");

function bucketKey(entry) {
  return `${entry.exact}:${entry.rotation}`;
}

function makeExpectedRotationSolver(richMatrix, n) {
  const size = richMatrix.length;
  const allIndices = Array.from({ length: size }, (_, i) => i);
  const fullMask = maskOf(allIndices);
  const memo = { candidates: new Map(), all: new Map() };

  function partition(mask, guessIdx) {
    const buckets = new Map();
    let solvedCount = 0;

    indicesOf(mask, size).forEach((secretIdx) => {
      const entry = richMatrix[secretIdx][guessIdx];
      const bit = 1n << BigInt(secretIdx);

      if (entry.exact === n) {
        solvedCount += 1;
        return;
      }

      const key = bucketKey(entry);
      buckets.set(key, (buckets.get(key) || 0n) | bit);
    });

    return { buckets, solvedCount };
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
      const { buckets, solvedCount } = partition(mask, guessIdx);
      const entries = [...buckets].sort((a, b) => popcount(b[1]) - popcount(a[1]));

      let runningSum = solvedCount * 1; // each solved candidate costs exactly 1 guess
      let useless = false;
      let pruned = false;

      for (const [, submask] of entries) {
        const bucketSize = popcount(submask);

        if (submask === mask) {
          useless = true; // zero progress (nothing solved, one giant bucket)
          break;
        }

        const sub = solve(submask, pool);
        runningSum += bucketSize * (1 + sub.avg);

        if (best !== null && runningSum >= best.sum) {
          pruned = true;
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

module.exports = { makeExpectedRotationSolver, bucketKey };
