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
// Standard "distinct permutations of a multiset" backtracking: at each
// position, try each colour that still has remaining count, so no
// duplicate raw sequence is ever generated (unlike permuting a flat array
// and deduping afterwards, which is wasteful once counts repeat). Shared by
// enumerateNecklaceClasses() (which further dedups by rotation) and
// enumerateLiteralSequences() (which doesn't — see that function).
function generateDistinctPermutations(counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  const remaining = [...counts];
  const sequences = [];
  const current = [];

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
  return sequences;
}

// Returns { n, classes }, where classes is an array of representative
// sequences (each an array of colour indices, length n), one per distinct
// necklace (rotation-equivalence class) of that multiset. The
// representative chosen for each class is its lexicographically smallest
// rotation, which also happens to be a convenient canonical key for
// deduplication.
//
// Used throughout the match-count-only ("hard model") analysis, where a
// necklace class is the right unit: scoring only depends on the class, not
// on which literal rotation happens to represent it (see bestExact below).
// Not the right unit for the rotation-aware analysis — see
// enumerateLiteralSequences().
function enumerateNecklaceClasses(counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  const sequences = generateDistinctPermutations(counts);
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

// Returns { n, sequences }: every distinct raw (literal) permutation of the
// multiset, *not* deduplicated by rotation — i.e. one entry per literal
// bead arrangement, exactly the space `state.secret` and a submitted guess
// actually live in in src/game.js.
//
// This is the right unit for the rotation-aware analysis
// (minimax-rotation.js / expected-rotation.js), because — unlike the exact
// -match count — the *winning rotation* scoreGuess() reports is not
// rotation-invariant: it depends on the literal phase of both the secret
// and the guess, not just which necklace classes they belong to (rotating
// either one by a constant shifts which rotation index wins). So two
// literal secrets in the same necklace class are only equivalent for the
// match-count-only model; under the richer (rotation, exact) feedback they
// are genuinely distinguishable states, and have to be enumerated
// separately for the search to be faithful to what the real app reveals.
function enumerateLiteralSequences(counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  const sequences = generateDistinctPermutations(counts);

  return { n, sequences };
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

// The full feedback pair a real submitted guess reveals — not just the
// exact-match count, but *which* rotation achieved it — literally
// reproducing scoreGuess()'s loop and tie-break in src/game.js: rotations
// are tried in increasing order (0, 1, 2, ...) and only a *strictly*
// greater exact count replaces the current best, so on a tie the smallest
// rotation found first is kept. That tie-break is exactly the "smallest
// clockwise rotation among those tied for best" rule described in
// README.md's "Scoring" section, confirmed against `scoreGuess()` itself
// rather than assumed. bestExact(secret, guess) above always equals
// bestRotationAndExact(secret, guess).exact — sanity-checked in
// buildRichScoreMatrix() below.
function bestRotationAndExact(secret, guess) {
  const n = secret.length;
  let bestExactCount = -1;
  let bestRotation = 0;

  for (let rotation = 0; rotation < n; rotation += 1) {
    const exact = countExactMatches(secret, rotateClockwise(guess, rotation));

    if (exact > bestExactCount) {
      bestExactCount = exact;
      bestRotation = rotation;
    }
  }

  return { rotation: bestRotation, exact: bestExactCount };
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

// Builds the full (rotation, exact) feedback matrix over a list of literal
// sequences (see enumerateLiteralSequences — this is *not* meant to be
// called with necklace classes, unlike buildScoreMatrix, precisely because
// the rotation component isn't rotation-invariant). matrix[i][j] is the
// feedback guessing sequence j would produce if sequence i were the secret
// — deliberately *not* assumed symmetric (and not checked for symmetry the
// way buildScoreMatrix checks its exact-only value): swapping which
// sequence is "secret" and which is "guess" generally changes the winning
// rotation, only the exact count is provably symmetric (asserted below,
// against bestExact, as the one invariant that must hold regardless of
// order).
function buildRichScoreMatrix(sequences) {
  const size = sequences.length;
  const matrix = Array.from({ length: size }, () => new Array(size));

  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      const result = bestRotationAndExact(sequences[i], sequences[j]);
      const exactCheck = bestExact(sequences[i], sequences[j]);

      if (result.exact !== exactCheck) {
        throw new Error(`bestRotationAndExact/bestExact disagree at (${i},${j})`);
      }

      matrix[i][j] = result;
    }
  }

  return matrix;
}

module.exports = {
  enumerateNecklaceClasses,
  enumerateLiteralSequences,
  minimalRotation,
  rotateClockwise,
  countExactMatches,
  bestExact,
  bestRotationAndExact,
  isDegenerateSequence,
  buildScoreMatrix,
  buildRichScoreMatrix
};
