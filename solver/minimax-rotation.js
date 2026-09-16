"use strict";

// --- Minimax search under the *rotation-aware* feedback model -----------
//
// Structurally identical to minimax.js (same bitmask-memoized game tree,
// same branch-and-bound pruning), but built on necklace.js's
// buildRichScoreMatrix() instead of buildScoreMatrix(): each cell is a
// {rotation, exact} pair rather than a bare integer, and the partition key
// used to group candidates by a guess's outcome is the composite
// `${exact}:${rotation}` rather than just `exact` — richer information can
// only ever split a bucket further, never merge two that the hard model
// kept apart, which is what should make every result here <= the
// corresponding hard-model (minimax.js) result for the same configuration.
//
// Because the rotation component is not rotation-invariant (see
// necklace.js's comment on enumerateLiteralSequences), the state space here
// is literal bead sequences, not necklace classes — every distinct raw
// arrangement of the multiset is a separate "candidate secret" and a
// separate possible guess, since two rotations of the same necklace class
// can now be told apart by which rotation a guess needs to align with them.
//
// A guess still "solves" a candidate iff exact === n (any tied winning
// rotation ends the game the same way — scoreGuess() doesn't care which
// one), independent of the rotation component, exactly as in the hard
// model.

const { popcount, indicesOf, maskOf } = require("./minimax");

function bucketKey(entry) {
  return `${entry.exact}:${entry.rotation}`;
}

function makeRotationSolver(richMatrix, n) {
  const size = richMatrix.length;
  const allIndices = Array.from({ length: size }, (_, i) => i);
  const fullMask = maskOf(allIndices);
  const memo = { candidates: new Map(), all: new Map() };

  // Partitions `mask`'s candidates by the (rotation, exact) feedback they'd
  // produce against guessing sequence `guessIdx`. Returns a
  // Map(bucketKey -> submask); candidates landing at exact === n are
  // solved outright and never enter a keyed bucket (handled directly in
  // solve(), same as minimax.js's score === n check).
  function partition(mask, guessIdx) {
    const buckets = new Map();
    let solvedMask = 0n;

    indicesOf(mask, size).forEach((secretIdx) => {
      const entry = richMatrix[secretIdx][guessIdx];
      const bit = 1n << BigInt(secretIdx);

      if (entry.exact === n) {
        solvedMask |= bit;
        return;
      }

      const key = bucketKey(entry);
      buckets.set(key, (buckets.get(key) || 0n) | bit);
    });

    return { buckets, solvedMask };
  }

  function solve(mask, pool) {
    const table = memo[pool];
    const key = mask.toString();

    if (table.has(key)) return table.get(key);

    const count = popcount(mask);

    if (count === 1) {
      const result = { cost: 1, guess: indicesOf(mask, size)[0], buckets: new Map(), solvedMask: 1n << BigInt(indicesOf(mask, size)[0]) };
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
      const { buckets, solvedMask } = partition(mask, guessIdx);
      const entries = [...buckets].sort((a, b) => popcount(b[1]) - popcount(a[1]));

      let worst = 0;
      let useless = false;
      let pruned = false;

      for (const [, submask] of entries) {
        if (submask === mask) {
          // Zero progress: every live candidate landed in one bucket
          // (possible for a poorly-chosen probe against this mask) —
          // would recurse forever, and can never be optimal.
          useless = true;
          break;
        }

        if (best !== null && worst >= best.cost - 1) {
          pruned = true;
          break;
        }

        const sub = solve(submask, pool);
        if (sub.cost > worst) worst = sub.cost;
      }

      if (useless || pruned) continue;

      const cost = 1 + worst;

      if (best === null || cost < best.cost) {
        best = { cost, guess: guessIdx, buckets, solvedMask };
      }
    }

    if (best === null) {
      throw new Error(`No informative guess found for mask=${key} pool=${pool}`);
    }

    table.set(key, best);
    return best;
  }

  return {
    size,
    fullMask,
    allIndices,
    solve: (pool) => solve(fullMask, pool),
    solveMask: (mask, pool) => solve(mask, pool),
    partition
  };
}

module.exports = { makeRotationSolver, bucketKey };
