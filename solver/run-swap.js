"use strict";

// Restricted-move-set variant: back to the hard (match-count-only)
// feedback model, but consecutive guesses must differ by exactly one bead
// swap. State becomes (current position, live candidate set) instead of
// just the candidate set — see minimax-swap.js / expected-swap.js for the
// solver, and swap-graph.js for the transposition-adjacency graph the move
// restriction induces over necklace classes.
//
// Scope: n<=6, 3-or-more-colour splits only (2-colour splits excluded per
// the task, not for degeneracy reasons this time).

const {
  enumerateNecklaceClasses,
  buildScoreMatrix
} = require("./necklace");
const {
  buildTranspositionGraph,
  allPairsShortestPaths,
  verifyRotationInvariantAdjacency
} = require("./swap-graph");
const { makeSwapMinimaxSolver } = require("./minimax-swap");
const { makeSwapExpectedSolver } = require("./expected-swap");
const { makeSolver, popcount, indicesOf, maskOf } = require("./minimax");
const { makeExpectedSolver } = require("./expected");
const { evaluateGreedy } = require("./greedy-swap");

const CONFIGS = [
  { n: 4, counts: [2, 1, 1], label: "n=4, split 2/1/1" },
  { n: 4, counts: [1, 1, 1, 1], label: "n=4, split 1/1/1/1" },

  { n: 5, counts: [2, 2, 1], label: "n=5, split 2/2/1" },
  { n: 5, counts: [2, 1, 1, 1], label: "n=5, split 2/1/1/1" },

  { n: 6, counts: [3, 2, 1], label: "n=6, split 3/2/1" },
  { n: 6, counts: [2, 2, 2], label: "n=6, split 2/2/2" },
  { n: 6, counts: [2, 2, 1, 1], label: "n=6, split 2/2/1/1" }
];

const TREE_CONFIG_LABEL = "n=6, split 2/2/2";
const TREE_DEPTH_LIMIT = 4;

function fmtSeq(seq) {
  return `[${seq.join(",")}]`;
}

// Independent cross-check: walk the actual derived swap-restricted
// strategy for one (start, secret) pair, using the solver's own
// choice/guessBuckets — but computed fresh per step (mask-level solve is
// memoized, so this is cheap), not trusted from the top-level g() value.
function simulateSwap(solver, scoreMatrix, n, size, startClass, secretIdx, pool) {
  const fullMask = maskOf(Array.from({ length: size }, (_, i) => i));
  let position = startClass;
  let mask = fullMask;
  let guesses = 0;
  const cap = size * 6 + 30;

  while (guesses < cap) {
    const r = solver.solveMask(mask, pool);
    const c = r.choice[position];

    if (c === null) return guesses; // g[position] === 0: nothing left to do

    guesses += 1;
    position = c.guess;

    if (!c.informative) continue; // pure repositioning (or forced walk step): mask unchanged

    const actualScore = scoreMatrix[secretIdx][position];
    if (actualScore === n) return guesses;

    const buckets = r.guessBuckets.get(position);
    mask = buckets.get(actualScore);
  }

  return Infinity; // shouldn't happen — signals a bug, not a slow case
}

function printSwapTree(solver, classes, scoreMatrix, n, size, position, mask, pool, depth, prefix) {
  if (depth > TREE_DEPTH_LIMIT) {
    console.log(`${prefix}... (truncated, ${popcount(mask)} candidates remain, standing at ${fmtSeq(classes[position])})`);
    return;
  }

  const r = solver.solveMask(mask, pool);
  const c = r.choice[position];
  const cost = r.g[position];

  if (c === null) {
    console.log(`${prefix}already standing on the only remaining candidate ${fmtSeq(classes[position])} — done`);
    return;
  }

  if (!c.informative) {
    console.log(
      `${prefix}reposition: swap toward ${fmtSeq(classes[c.guess])} (no new info — current position isn't adjacent to any move that splits the ${popcount(mask)} remaining candidates; overall cost from here: ${cost})`
    );
    printSwapTree(solver, classes, scoreMatrix, n, size, c.guess, mask, pool, depth + 1, prefix);
    return;
  }

  console.log(
    `${prefix}guess ${fmtSeq(classes[c.guess])} (${popcount(mask)} candidates live, worst-case ${cost} more guess${cost === 1 ? "" : "es"})`
  );

  const buckets = r.guessBuckets.get(c.guess);
  const scores = [...buckets.keys()].sort((a, b) => a - b);

  scores.forEach((score) => {
    const submask = buckets.get(score);
    const subCount = popcount(submask);
    console.log(`${prefix}  score ${score} -> ${subCount} candidate${subCount === 1 ? "" : "s"} remain`);
    printSwapTree(solver, classes, scoreMatrix, n, size, c.guess, submask, pool, depth + 1, `${prefix}    `);
  });

  const solvedCount = popcount(mask) - [...buckets.values()].reduce((acc, m) => acc + popcount(m), 0);
  if (solvedCount > 0) {
    console.log(`${prefix}  exact match -> solved (${solvedCount} candidate${solvedCount === 1 ? "" : "s"})`);
  }
}

function run() {
  const summary = [];

  CONFIGS.forEach((config) => {
    const { n, counts, label } = config;
    const t0 = Date.now();

    const { classes } = enumerateNecklaceClasses(counts);
    const size = classes.length;
    const scoreMatrix = buildScoreMatrix(classes);
    const { adjacency } = buildTranspositionGraph(classes);
    const { ok: invarianceOk, mismatches } = verifyRotationInvariantAdjacency(classes);
    const distances = allPairsShortestPaths(size, adjacency);
    const fullMask = maskOf(Array.from({ length: size }, (_, i) => i));

    const hardMinimax = makeSolver(scoreMatrix, n).solve("all").cost;
    const hardAvg = makeExpectedSolver(scoreMatrix, n).solve("all").avg;

    const mSolver = makeSwapMinimaxSolver(scoreMatrix, adjacency, distances, n);
    const eSolver = makeSwapExpectedSolver(scoreMatrix, adjacency, distances, n);

    const perStartMinimax = [];
    const perStartAvg = [];
    const perStartMinimaxCand = [];
    const perStartAvgCand = [];

    for (let start = 0; start < size; start += 1) {
      perStartMinimax.push(mSolver.solveFrom(start, fullMask, "all").cost);
      perStartAvg.push(eSolver.solveFrom(start, fullMask, "all").avg);
      perStartMinimaxCand.push(mSolver.solveFrom(start, fullMask, "candidates").cost);
      perStartAvgCand.push(eSolver.solveFrom(start, fullMask, "candidates").avg);
    }

    const t1 = Date.now();

    const worstM = Math.max(...perStartMinimax);
    const bestM = Math.min(...perStartMinimax);
    const meanM = perStartMinimax.reduce((a, b) => a + b, 0) / size;
    const worstE = Math.max(...perStartAvg);
    const bestE = Math.min(...perStartAvg);
    const meanE = perStartAvg.reduce((a, b) => a + b, 0) / size;

    const candMinimaxFeasible = perStartMinimaxCand.filter((c) => c !== Infinity).length;
    const candAvgFeasible = perStartAvgCand.filter((c) => c !== Infinity).length;

    // Cross-check: simulate the actual derived strategy for every
    // (start, secret) pair and confirm worst-case / average match.
    let simWorstM = 0;
    let simSumM = 0;
    let simWorstE = 0;
    let simSumE = 0;
    const pairCount = size * size;

    for (let start = 0; start < size; start += 1) {
      for (let secret = 0; secret < size; secret += 1) {
        const gm = simulateSwap(mSolver, scoreMatrix, n, size, start, secret, "all");
        const ge = simulateSwap(eSolver, scoreMatrix, n, size, start, secret, "all");
        if (gm > simWorstM) simWorstM = gm;
        simSumM += gm;
        if (ge > simWorstE) simWorstE = ge;
        simSumE += ge;
      }
    }

    const simMeanM = simSumM / pairCount;
    const simMeanE = simSumE / pairCount;
    // Compare simulated worst-case (over BOTH start and secret) to worstM
    // (already the worst over start of the per-start worst-case) — same
    // quantity, two independent computations.
    const minimaxMatch = simWorstM === worstM;
    // Compare simulated grand-mean average to the mean-over-starts of the
    // per-start averages — same quantity two ways (average is linear).
    const avgMatch = Math.abs(simMeanE - meanE) < 1e-9;

    const t2 = Date.now();

    // Greedy heuristic, both modes, 'all' pool (the only pool with
    // guaranteed feasibility).
    const greedyMinimax = evaluateGreedy(
      { scoreMatrix, adjacency, distances, n, size },
      "minimax",
      "all"
    );
    const greedyAvg = evaluateGreedy(
      { scoreMatrix, adjacency, distances, n, size },
      "average",
      "all"
    );

    const t3 = Date.now();

    console.log("=".repeat(90));
    console.log(`${label}  (colour counts ${JSON.stringify(counts)})`);
    console.log(`  necklace classes: ${size}   rotation-invariance of adjacency: ${invarianceOk ? "VERIFIED" : `FAILED (${mismatches.length} mismatches)`}`);
    console.log(`  HARD MODEL (unrestricted movement): minimax=${hardMinimax}  average=${hardAvg.toFixed(4)}`);
    console.log(
      `  SWAP-RESTRICTED minimax (arbitrary-neighbour pool), over all ${size} starting positions:` +
        ` worst=${worstM}  best=${bestM}  mean=${meanM.toFixed(4)}`
    );
    console.log(
      `  SWAP-RESTRICTED average, over all ${size} starting positions:` +
        ` worst=${worstE.toFixed(4)}  best=${bestE.toFixed(4)}  mean=${meanE.toFixed(4)}`
    );
    console.log(
      `  candidate-only pool feasibility: minimax ${candMinimaxFeasible}/${size} starts feasible, average ${candAvgFeasible}/${size} starts feasible`
    );
    console.log(
      `  simulated cross-check — minimax worst (all starts x all secrets): ${simWorstM}` +
        (minimaxMatch ? "  [MATCH]" : `  [MISMATCH vs ${worstM}]`)
    );
    console.log(
      `  simulated cross-check — average mean (all starts x all secrets): ${simMeanE.toFixed(4)}` +
        (avgMatch ? "  [MATCH]" : `  [MISMATCH vs ${meanE.toFixed(4)}]`)
    );
    if (worstM < hardMinimax || meanE < hardAvg - 1e-9) {
      console.log(`  BUG: restricted-move figures beat the unrestricted hard-model figures — should be impossible!`);
    } else {
      console.log(`  invariant OK: restricted-move figures >= hard-model figures (worst minimax ${worstM} >= ${hardMinimax}, mean avg ${meanE.toFixed(4)} >= ${hardAvg.toFixed(4)})`);
    }
    console.log(
      `  GREEDY 1-ply heuristic (minimax-style rule): worst-case ${greedyMinimax.worstOverall} guesses` +
        (greedyMinimax.stuckCount > 0 ? `, stuck in ${greedyMinimax.stuckCount} pairs` : "") +
        ` — vs true optimal worst ${worstM} (gap: +${greedyMinimax.worstOverall - worstM})`
    );
    console.log(
      `  GREEDY 1-ply heuristic (average-style rule): mean ${greedyAvg.avgOverall.toFixed(4)} guesses` +
        (greedyAvg.stuckCount > 0 ? `, stuck in ${greedyAvg.stuckCount} pairs` : "") +
        ` — vs true optimal mean ${meanE.toFixed(4)} (gap: +${(greedyAvg.avgOverall - meanE).toFixed(4)})`
    );
    console.log(`  timings: solve-all-starts=${t1 - t0}ms, simulation cross-check=${t2 - t1}ms, greedy eval=${t3 - t2}ms`);

    if (label === TREE_CONFIG_LABEL) {
      const worstStart = perStartMinimax.indexOf(worstM);
      console.log(`  --- strategy tree from worst-case starting position ${fmtSeq(classes[worstStart])} (arbitrary-neighbour pool, depth-capped at ${TREE_DEPTH_LIMIT}) ---`);
      printSwapTree(mSolver, classes, scoreMatrix, n, size, worstStart, fullMask, "all", 1, "  ");
    }

    summary.push({
      label,
      classes: size,
      hardMinimax,
      hardAvg,
      worstM,
      bestM,
      meanM,
      worstE,
      bestE,
      meanE,
      greedyMinimaxWorst: greedyMinimax.worstOverall,
      greedyAvgMean: greedyAvg.avgOverall,
      candMinimaxFeasible,
      candAvgFeasible
    });
  });

  console.log("=".repeat(90));
  console.log("SUMMARY (restricted move set, n<=6, 3+ colour splits)");
  console.log("=".repeat(90));
  summary.forEach((row) => {
    console.log(
      `${row.label.padEnd(20)} classes=${String(row.classes).padStart(2)}  ` +
        `hard(minimax/avg)=${row.hardMinimax}/${row.hardAvg.toFixed(2)}  ` +
        `swap minimax(best/mean/worst)=${row.bestM}/${row.meanM.toFixed(2)}/${row.worstM}  ` +
        `swap avg(best/mean/worst)=${row.bestE.toFixed(2)}/${row.meanE.toFixed(2)}/${row.worstE.toFixed(2)}  ` +
        `greedy(minimax-worst/avg-mean)=${row.greedyMinimaxWorst}/${row.greedyAvgMean.toFixed(2)}  ` +
        `candFeasible(minimax/avg)=${row.candMinimaxFeasible}/${row.candAvgFeasible} of ${row.classes}`
    );
  });
}

run();
