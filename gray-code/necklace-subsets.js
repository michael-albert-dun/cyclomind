"use strict";

// --- Cyclic k-subsets of an n-set (binary necklaces of fixed density) ---
//
// A cyclic k-subset of {0, ..., n-1} is represented here as a binary array
// of length n, 1 meaning "this position is in the subset" (the minority
// colour, in Cyclomind terms), 0 meaning "not in the subset". Two such
// arrays denote the same cyclic k-subset iff one is a rotation of the
// other. This file enumerates one canonical representative per rotation
// class — the lexicographically smallest rotation, same convention as
// solver/necklace.js's minimalRotation() uses for the general multiset
// case (this is a fresh, independent implementation for the 2-colour,
// fixed-k case only; nothing here is required from solver/).

function rotate(bits, steps) {
  const n = bits.length;
  // rotate(bits, s)[i] = bits[(i + s) mod n]  (a left/cyclic shift by s).
  // The exact rotation convention doesn't matter for anything in this
  // module as long as it's applied consistently, since we only ever care
  // about the *set* of all n rotations of a given array.
  return Array.from({ length: n }, (_, i) => bits[(i + steps) % n]);
}

function compareBits(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function minimalRotation(bits) {
  const n = bits.length;
  let best = bits;
  for (let s = 1; s < n; s += 1) {
    const candidate = rotate(bits, s);
    if (compareBits(candidate, best) < 0) best = candidate;
  }
  return best;
}

// All n rotations of `bits`, in shift order (index = shift amount). May
// contain duplicates if `bits` has rotational symmetry (a nontrivial
// period dividing n); that's fine, callers just want "the set of strings
// reachable by rotating this necklace."
function allRotations(bits) {
  const n = bits.length;
  const out = [];
  for (let s = 0; s < n; s += 1) out.push(rotate(bits, s));
  return out;
}

// Enumerate all size-k subsets of {0, ..., n-1} as sorted arrays of
// positions, via standard combinatorial backtracking.
function enumerateSubsetsAsPositions(n, k) {
  const results = [];
  const current = [];

  function backtrack(start) {
    if (current.length === k) {
      results.push([...current]);
      return;
    }
    // Prune: not enough remaining positions to reach size k.
    for (let p = start; p <= n - (k - current.length); p += 1) {
      current.push(p);
      backtrack(p + 1);
      current.pop();
    }
  }

  backtrack(0);
  return results;
}

function positionsToBits(n, positions) {
  const bits = new Array(n).fill(0);
  positions.forEach((p) => {
    bits[p] = 1;
  });
  return bits;
}

// Returns { n, k, classes }, where classes is an array of canonical
// (lexicographically-smallest-rotation) bit arrays, one per distinct
// cyclic k-subset of an n-set.
function enumerateCyclicKSubsets(n, k) {
  const seen = new Set();
  const classes = [];

  enumerateSubsetsAsPositions(n, k).forEach((positions) => {
    const bits = positionsToBits(n, positions);
    const canonical = minimalRotation(bits);
    const key = canonical.join("");
    if (!seen.has(key)) {
      seen.add(key);
      classes.push(canonical);
    }
  });

  return { n, k, classes };
}

function bitsToString(bits) {
  return bits.join("");
}

module.exports = {
  rotate,
  minimalRotation,
  allRotations,
  enumerateCyclicKSubsets,
  bitsToString
};
