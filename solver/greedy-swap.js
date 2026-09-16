"use strict";

// --- A simple 1-ply "tactical" heuristic for the restricted-move variant,
// for comparison against the true minimax/average-case optimal in
// minimax-swap.js / expected-swap.js.
//
// At each step, among the legal next guesses (neighbours of the current
// position, optionally restricted to still-live candidates), pick the one
// that looks best *immediately* — smallest worst-case remaining bucket
// (mode 'minimax') or smallest expected remaining bucket (mode 'average')
// — with no recursion/lookahead beyond that single guess. A guess that
// doesn't split the mask at all (pure repositioning) is scored as if it
// left the full mask remaining, i.e. exactly as bad as no progress, so
// it's only chosen when literally every legal neighbour is equally
// uninformative — this is the heuristic's one structural weakness (see
// run-swap.js's report: how often it "wanders" is itself a finding).
//
// Actually plays the game to completion for a specific (start, secret)
// pair — not a formula, a real simulation — so its output is directly
// comparable (same units: guesses actually taken) to the true optimal.

const { popcount, indicesOf, maskOf } = require("./minimax");

function partition(scoreMatrix, size, mask, guessIdx) {
  const buckets = new Map();

  indicesOf(mask, size).forEach((secretIdx) => {
    const score = scoreMatrix[secretIdx][guessIdx];
    const bit = 1n << BigInt(secretIdx);

    buckets.set(score, (buckets.get(score) || 0n) | bit);
  });

  return buckets;
}

function stepToward(adjacency, distances, from, target) {
  const d = distances[from][target];
  return adjacency[from].find((nb) => distances[nb][target] === d - 1);
}

// Plays one full game with the greedy rule, from `startClass` against
// `secretIdx`, and returns the number of guesses taken.
function simulateGreedyGame(config, startClass, secretIdx, mode, pool) {
  const { scoreMatrix, adjacency, distances, n, size } = config;
  const fullMask = maskOf(Array.from({ length: size }, (_, i) => i));

  let position = startClass;
  let mask = fullMask;
  let guesses = 0;
  const maxGuesses = size * 4 + 20; // generous safety cap; a real infinite loop would be a bug, not a slow case

  while (guesses < maxGuesses) {
    const count = popcount(mask);

    if (count === 1) {
      const target = indicesOf(mask, size)[0];
      if (target === position) return guesses; // already standing on the (only possible) secret

      const next = stepToward(adjacency, distances, position, target);
      guesses += 1;
      position = next;
      if (position === target) return guesses; // walking there IS guessing it
      continue;
    }

    const inMaskSet = new Set(indicesOf(mask, size));
    const legal = pool === "all" ? adjacency[position] : adjacency[position].filter((x) => inMaskSet.has(x));

    if (legal.length === 0) return Infinity; // genuinely stuck (candidates-only pool can do this)

    let best = null;
    let bestMetric = Infinity;

    legal.forEach((x) => {
      const buckets = partition(scoreMatrix, size, mask, x);
      const nonSolved = [...buckets].filter(([score]) => score !== n);

      let metric;
      if (nonSolved.length === 1 && nonSolved[0][1] === mask) {
        metric = count; // pure repositioning: as bad as making no progress at all
      } else if (mode === "minimax") {
        metric = Math.max(0, ...nonSolved.map(([, submask]) => popcount(submask)));
      } else {
        const total = nonSolved.reduce((acc, [, submask]) => acc + popcount(submask), 0);
        metric = total / count; // smaller expected remainder is better; solved candidates contribute 0
      }

      if (metric < bestMetric || (metric === bestMetric && (best === null || x < best))) {
        bestMetric = metric;
        best = x;
      }
    });

    guesses += 1;
    position = best;

    const actualScore = scoreMatrix[secretIdx][position];
    if (actualScore === n) return guesses;

    const buckets = partition(scoreMatrix, size, mask, position);
    mask = buckets.get(actualScore);
  }

  return Infinity; // hit the safety cap — treat as a bug signal, not a real result
}

// Runs the greedy heuristic for every (start, secret) pair and returns
// aggregate stats, both overall and per-start, for the given mode/pool.
function evaluateGreedy(config, mode, pool) {
  const { size } = config;
  const perStart = [];
  let worstOverall = 0;
  let sumOverall = 0;
  let pairCount = 0;
  let stuckCount = 0;

  for (let start = 0; start < size; start += 1) {
    let worst = 0;
    let sum = 0;

    for (let secret = 0; secret < size; secret += 1) {
      const guesses = simulateGreedyGame(config, start, secret, mode, pool);
      if (guesses === Infinity) {
        stuckCount += 1;
        continue;
      }
      if (guesses > worst) worst = guesses;
      sum += guesses;
      sumOverall += guesses;
      pairCount += 1;
    }

    if (worst > worstOverall) worstOverall = worst;
    perStart.push({ start, worst, avg: sum / size });
  }

  return {
    worstOverall,
    avgOverall: pairCount > 0 ? sumOverall / pairCount : Infinity,
    stuckCount,
    perStart
  };
}

module.exports = { simulateGreedyGame, evaluateGreedy };
