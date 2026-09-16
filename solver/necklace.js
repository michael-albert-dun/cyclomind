"use strict";

// --- Pure, headless reimplementation of the necklace/scoring rules from
// src/game.js, written fresh (not required-in) because game.js does
// top-level DOM lookups (document.querySelector etc.) that throw outside a
// browser. Kept in careful lockstep with the app's actual logic:
//
//   - scoreGuess() in src/game.js tries every rotation of the *guess*
//     against the fixed secret and keeps whichever rotation gives the most
//     exact (right colour, right position) matches. bestExact() below is a
//     literal port of that loop (rotateClockwise + countExactMatches).
//   - isDegenerateNecklace() in src/game.js excludes "every bead the same
//     colour" and "all beads but one the same colour" from ever being
//     generated as a secret. Mirrored here as isDegenerateSequence().

// --- Enumerating necklaces (rotation-equivalence classes) for a fixed
// colour multiset --------------------------------------------------------

// counts: array of per-colour counts, e.g. [3, 2, 1] means 3 of colour 0,
// 2 of colour 1, 1 of colour 2, summing to n = BEAD_COUNT.
//
// Returns { n, classes }, where classes is an array of representative
// sequences (each an array of colour indices, length n), one per distinct
// necklace (rotation-equivalence class) of that multiset. The
// representative chosen for each class is its lexicographically smallest
// rotation, which also happens to be a convenient canonical key for
// deduplication.
function enumerateNecklaceClasses(counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  const remaining = [...counts];
  const sequences = [];
  const current = [];

  // Standard "distinct permutations of a multiset" backtracking: at each
  // position, try each colour that still has remaining count, so no
  // duplicate raw sequence is ever generated (unlike permuting a flat
  // array and deduping afterwards, which is wasteful once counts repeat).
  function backtrack() {
    if (current.length === n) {
      sequences.push([...current]);
      return;
    }

    for (let color = 0; color < remaining.length; color += 1) {
      if (remaining[color] === 0) continue;

      remaining[color] -= 1;
      current.push(color);
      backtrack();
      current.pop();
      remaining[color] += 1;
    }
  }

  backtrack();

  const seen = new Set();
  const classes = [];

  sequences.forEach((seq) => {
    const canonical = minimalRotation(seq);
    const key = canonical.join(",");

    if (!seen.has(key)) {
      seen.add(key);
      classes.push(canonical);
    }
  });

  return { n, classes };
}

// The lexicographically smallest rotation of seq, used as a canonical
// per-class key/representative.
function minimalRotation(seq) {
  const n = seq.length;
  let best = seq;

  for (let r = 1; r < n; r += 1) {
    const candidate = rotateClockwise(seq, r);

    if (compareSeq(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best;
}

function compareSeq(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// --- Scoring, ported literally from src/game.js's scoreGuess() ----------
//
// rotateClockwise(beads, steps)[i] = beads[(i - steps + n) % n], exactly as
// in game.js. bestExact tries every rotation step of `guess` against
// `secret` and returns the max exact-match count — the only information a
// real guess reveals (near is always n - exact, see README "Scoring").
function rotateClockwise(beads, steps) {
  const n = beads.length;

  return Array.from({ length: n }, (_, i) => beads[(i - steps + n) % n]);
}

function countExactMatches(secret, guess) {
  let count = 0;

  for (let i = 0; i < secret.length; i += 1) {
    if (secret[i] === guess[i]) count += 1;
  }

  return count;
}

function bestExact(secret, guess) {
  const n = secret.length;
  let best = -1;

  for (let rotation = 0; rotation < n; rotation += 1) {
    const exact = countExactMatches(secret, rotateClockwise(guess, rotation));

    if (exact > best) best = exact;
  }

  return best;
}

// True for "every bead the same colour" or "all beads but one the same",
// mirroring isDegenerateNecklace() in src/game.js exactly.
function isDegenerateSequence(beads) {
  const counts = new Map();

  beads.forEach((bead) => counts.set(bead, (counts.get(bead) || 0) + 1));

  return Math.max(...counts.values()) >= beads.length - 1;
}

// Builds the full symmetric score matrix over a list of representative
// sequences (one entry per necklace class): matrix[i][j] = bestExact
// between class i and class j. Proven order-independent (invariant to
// rotating either input) in the accompanying report; spot-checked here by
// also computing matrix[j][i] and asserting equality.
function buildScoreMatrix(classes) {
  const size = classes.length;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(-1));

  for (let i = 0; i < size; i += 1) {
    for (let j = i; j < size; j += 1) {
      const score = bestExact(classes[i], classes[j]);
      const scoreRev = bestExact(classes[j], classes[i]);

      if (score !== scoreRev) {
        throw new Error(
          `Asymmetric score detected between classes ${i} and ${j}: ${score} vs ${scoreRev}`
        );
      }

      matrix[i][j] = score;
      matrix[j][i] = score;
    }
  }

  return matrix;
}

module.exports = {
  enumerateNecklaceClasses,
  minimalRotation,
  rotateClockwise,
  countExactMatches,
  bestExact,
  isDegenerateSequence,
  buildScoreMatrix
};
