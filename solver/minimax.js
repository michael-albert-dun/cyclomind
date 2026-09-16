"use strict";

// --- Minimax search over guessing strategies -----------------------------
//
// State = the set of necklace classes still consistent with every
// guess/score pair so far ("live candidates"). At each node we choose a
// guess (from some allowed pool — see below) and look at how it partitions
// the live candidates by the score they'd produce against that guess. We
// then recurse into each non-solved partition and take the worst case
// (max) over partitions, +1 for the guess just made. The winning guess
// (the one whose secret truly equals the guess) needs no further guesses:
// scoring `n` exact means the game is already won.
//
// Two guess pools are supported, per the task's request to consider both:
//   - 'candidates': the next guess must be one of the still-live candidates.
//   - 'all': the next guess may be *any* necklace class of the multiset
//     (including ones already ruled out), i.e. a free "probe" — mirroring
//     Knuth-style Mastermind solvers where a non-candidate guess can split
//     the remaining space more evenly than any candidate can.
// Since every arrangement the player can actually put on the board is some
// permutation of the fixed multiset, and scoring is rotation-invariant (see
// necklace.js), the full set of *distinct guess behaviours* is exactly the
// set of necklace classes for that multiset — so 'all' already covers every
// guess the player could physically submit; there is no larger space to
// consider.
//
// Candidate sets are represented as BigInt bitmasks (bit i set = class i is
// still live) so that memoization can key on the set itself: the optimal
// continuation cost of a given live-candidate set does not depend on how we
// got there, only on the set (and the guess pool mode), which is what makes
// this tractable rather than a raw game-tree blow-up.

function popcount(mask) {
  let count = 0;
  let m = mask;

  while (m > 0n) {
    m &= m - 1n;
    count += 1;
  }

  return count;
}

function indicesOf(mask, size) {
  const result = [];

  for (let i = 0; i < size; i += 1) {
    if ((mask >> BigInt(i)) & 1n) result.push(i);
  }

  return result;
}

function maskOf(indices) {
  let mask = 0n;

  indices.forEach((i) => {
    mask |= 1n << BigInt(i);
  });

  return mask;
}

// Builds a minimax solver bound to one score matrix (one multiset/board
// size). scoreMatrix[i][j] is the exact-match score class i would report
// against a guess of class j (symmetric, see necklace.js).
function makeSolver(scoreMatrix, n) {
  const size = scoreMatrix.length;
  const allIndices = Array.from({ length: size }, (_, i) => i);
  const fullMask = maskOf(allIndices);
  const memo = { candidates: new Map(), all: new Map() };

  // Partitions `mask`'s candidates by the score they'd produce against
  // guessing class `guessIdx`. Returns a Map(score -> submask). A bucket
  // with score === n means "guessIdx itself is the secret" — solved, no
  // further guesses needed for that branch.
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
      const result = { cost: 1, guess: indicesOf(mask, size)[0], buckets: new Map() };
      table.set(key, result);
      return result;
    }

    // Guess ordering matters only for how much branch-and-bound pruning
    // below gets to skip — it never changes which guess is reported as
    // optimal (that's still whichever legal guess achieves the lowest
    // exhaustively-verified cost). Live candidates tend to be decent
    // guesses (they're guaranteed to at least separate themselves out via
    // the score-n bucket), so trying them before non-candidate "probes"
    // establishes a tight bound early, letting most probes in a large
    // `pool === "all"` universe get abandoned after only their first
    // (largest) bucket.
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

      // Largest buckets first: a big remaining candidate set is likely (not
      // guaranteed, but a reliable heuristic) to need more guesses, so
      // checking it first tends to reach the pruning bound fastest.
      const entries = [...buckets].sort((a, b) => {
        const sizeDiff = popcount(b[1]) - popcount(a[1]);
        return sizeDiff !== 0 ? sizeDiff : a[0] - b[0];
      });

      let worst = 0;
      let useless = false;
      let pruned = false;

      for (const [score, submask] of entries) {
        if (score === n) continue; // solved immediately by this guess

        // A guess that leaves the *entire* live candidate set unchanged
        // (every candidate scores the same against it) makes zero
        // progress — recursing would just re-enter this same state.
        // Such a guess can never be optimal (its cost is unbounded), so
        // skip it outright rather than looping.
        if (submask === mask) {
          useless = true;
          break;
        }

        // Branch-and-bound: once this guess's worst-case-so-far already
        // matches or exceeds the best total cost found so far, it cannot
        // possibly improve on it (cost only grows or holds as more
        // buckets are folded in via max()), so stop evaluating its
        // remaining buckets. This never changes the final answer — it
        // only skips recursion whose outcome couldn't matter — and is
        // verified against the unpruned result on every config small
        // enough to run both ways (see run.js's cross-check).
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
        best = { cost, guess: guessIdx, buckets };
      }
    }

    // Only possible if every guess in the pool made zero progress, which
    // cannot happen for a well-posed pool (guessing a live candidate at
    // minimum separates itself out via the score-n bucket) — guard anyway
    // rather than returning a broken result silently.
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
    partition,
    popcount,
    indicesOf
  };
}

module.exports = { makeSolver, popcount, indicesOf, maskOf };
