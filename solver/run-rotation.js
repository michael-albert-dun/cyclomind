"use strict";

// Rotation-aware re-run of the full n<=6 sweep (now including the four
// 2-colour splits, deliberately skipped or degenerate-collapsed in earlier
// passes) under the *real* feedback model: a submitted guess reveals not
// just the best-rotation exact-match count, but which specific rotation
// achieved it (see README.md's "Submitting" section and scoreGuess() /
// animateRotation() in src/game.js). Every result here is compared
// side-by-side against the match-count-only ("hard model") figures already
// in docs/minimax-strategy.md, recomputed live in this same run (not
// retyped from the doc) so there's no risk of a transcription mismatch.

const {
  enumerateNecklaceClasses,
  enumerateLiteralSequences,
  isDegenerateSequence,
  buildScoreMatrix,
  buildRichScoreMatrix
} = require("./necklace");
const { makeSolver, popcount, indicesOf } = require("./minimax");
const { makeExpectedSolver } = require("./expected");
const { makeRotationSolver } = require("./minimax-rotation");
const { makeExpectedRotationSolver } = require("./expected-rotation");

const CONFIGS = [
  { n: 4, counts: [2, 2], label: "n=4, split 2/2" },
  { n: 4, counts: [2, 1, 1], label: "n=4, split 2/1/1" },
  { n: 4, counts: [1, 1, 1, 1], label: "n=4, split 1/1/1/1" },

  { n: 5, counts: [3, 2], label: "n=5, split 3/2" },
  { n: 5, counts: [2, 2, 1], label: "n=5, split 2/2/1" },
  { n: 5, counts: [2, 1, 1, 1], label: "n=5, split 2/1/1/1" },

  { n: 6, counts: [4, 2], label: "n=6, split 4/2" },
  { n: 6, counts: [3, 3], label: "n=6, split 3/3" },
  { n: 6, counts: [3, 2, 1], label: "n=6, split 3/2/1" },
  { n: 6, counts: [2, 2, 2], label: "n=6, split 2/2/2" },
  { n: 6, counts: [2, 2, 1, 1], label: "n=6, split 2/2/1/1" }
];

function bucketKeyOf(entry, n) {
  return entry.exact === n ? "WIN" : `${entry.exact}:${entry.rotation}`;
}

// Independent cross-check: walk the actual derived rotation-aware strategy
// for every literal candidate secret (using richMatrix directly, not the
// solver's own bookkeeping), and return both the worst-case and the
// average number of guesses actually taken.
function simulateRotation(solver, richMatrix, n, pool) {
  const size = richMatrix.length;
  let worst = 0;
  let total = 0;

  for (let secret = 0; secret < size; secret += 1) {
    let mask = solver.fullMask;
    let guesses = 0;

    for (;;) {
      const result = solver.solveMask(mask, pool);
      guesses += 1;

      const entry = richMatrix[secret][result.guess];
      if (entry.exact === n) break;

      const key = bucketKeyOf(entry, n);
      const sub = result.buckets.get(key);
      if (sub === undefined) {
        throw new Error(`Simulation desynced: no bucket for key ${key} (secret ${secret}, pool ${pool})`);
      }
      mask = sub;
    }

    total += guesses;
    if (guesses > worst) worst = guesses;
  }

  return { worst, avg: total / size };
}

function fmtSeq(seq) {
  return `[${seq.join(",")}]`;
}

function printRotationTree(solver, sequences, n, mask, pool, depth, depthLimit, prefix) {
  if (depth > depthLimit) {
    console.log(`${prefix}... (truncated, ${popcount(mask)} candidates remain)`);
    return;
  }

  const result = solver.solveMask(mask, pool);
  const count = popcount(mask);

  if (count === 1) {
    const only = indicesOf(mask, solver.size)[0];
    console.log(`${prefix}candidate confirmed: ${fmtSeq(sequences[only])} -> guess it (1 guess)`);
    return;
  }

  console.log(
    `${prefix}guess ${fmtSeq(sequences[result.guess])} (${count} candidates live, worst-case ${result.cost} more guess${result.cost === 1 ? "" : "es"})`
  );

  const keys = [...result.buckets.keys()].sort();

  keys.forEach((key) => {
    const submask = result.buckets.get(key);
    const subCount = popcount(submask);

    console.log(`${prefix}  feedback (exact:rotation)=${key} -> ${subCount} candidate${subCount === 1 ? "" : "s"} remain`);
    printRotationTree(solver, sequences, n, submask, pool, depth + 1, depthLimit, `${prefix}    `);
  });

  const solvedCount = count - [...result.buckets.values()].reduce((a, m) => a + popcount(m), 0);
  if (solvedCount > 0) {
    console.log(`${prefix}  exact match (any rotation) -> solved (${solvedCount} candidate${solvedCount === 1 ? "" : "s"})`);
  }
}

function run() {
  const summary = [];

  CONFIGS.forEach((config) => {
    const { n, counts, label } = config;

    // --- hard model (recomputed live, not retyped from the doc) ---
    const { classes } = enumerateNecklaceClasses(counts);
    const scoreMatrix = buildScoreMatrix(classes);
    const hardMinimax = makeSolver(scoreMatrix, n);
    const hardExpected = makeExpectedSolver(scoreMatrix, n);
    const hardMinimaxAll = hardMinimax.solve("all").cost;
    const hardMinimaxCand = hardMinimax.solve("candidates").cost;
    const hardAvgAll = hardExpected.solve("all").avg;
    const hardAvgCand = hardExpected.solve("candidates").avg;

    // --- rotation-aware model ---
    const t0 = Date.now();
    const { sequences } = enumerateLiteralSequences(counts);
    const degenerateCount = sequences.filter(isDegenerateSequence).length;
    const richMatrix = buildRichScoreMatrix(sequences);
    const t1 = Date.now();

    const rotMinimax = makeRotationSolver(richMatrix, n);
    const rotMinimaxAll = rotMinimax.solve("all");
    const t2 = Date.now();
    const rotMinimaxCand = rotMinimax.solve("candidates");
    const t3 = Date.now();

    const rotExpected = makeExpectedRotationSolver(richMatrix, n);
    const rotAvgAll = rotExpected.solve("all");
    const t4 = Date.now();
    const rotAvgCand = rotExpected.solve("candidates");
    const t5 = Date.now();

    const simMinimaxAll = simulateRotation(rotMinimax, richMatrix, n, "all");
    const simMinimaxCand = simulateRotation(rotMinimax, richMatrix, n, "candidates");
    const simAvgAll = simulateRotation(rotExpected, richMatrix, n, "all");
    const simAvgCand = simulateRotation(rotExpected, richMatrix, n, "candidates");

    console.log("=".repeat(90));
    console.log(`${label}  (colour counts ${JSON.stringify(counts)})`);
    console.log(`  necklace classes: ${classes.length}   literal sequences (rotation-aware candidates): ${sequences.length}`);
    if (degenerateCount > 0) {
      console.log(`  WARNING: ${degenerateCount} literal sequences are degenerate and should have been excluded!`);
    }
    console.log(`  HARD MODEL   minimax: candidate-only=${hardMinimaxCand}  arbitrary-probe=${hardMinimaxAll}`);
    console.log(`               average: candidate-only=${hardAvgCand.toFixed(4)}  arbitrary-probe=${hardAvgAll.toFixed(4)}`);
    console.log(`  ROTATION     minimax: candidate-only=${rotMinimaxCand.cost}  arbitrary-probe=${rotMinimaxAll.cost}`);
    console.log(`               average: candidate-only=${rotAvgCand.avg.toFixed(4)}  arbitrary-probe=${rotAvgAll.avg.toFixed(4)}`);
    console.log(
      `  simulated cross-check — minimax worst: cand=${simMinimaxCand.worst} all=${simMinimaxAll.worst}` +
        (simMinimaxCand.worst === rotMinimaxCand.cost && simMinimaxAll.worst === rotMinimaxAll.cost ? "  [MATCH]" : "  [MISMATCH]")
    );
    console.log(
      `  simulated cross-check — average: cand=${simAvgCand.avg.toFixed(4)} all=${simAvgAll.avg.toFixed(4)}` +
        (Math.abs(simAvgCand.avg - rotAvgCand.avg) < 1e-9 && Math.abs(simAvgAll.avg - rotAvgAll.avg) < 1e-9 ? "  [MATCH]" : "  [MISMATCH]")
    );

    const violations = [];
    if (rotMinimaxAll.cost > hardMinimaxAll) violations.push("rotation minimax(all) > hard minimax(all)");
    if (rotMinimaxCand.cost > hardMinimaxCand) violations.push("rotation minimax(cand) > hard minimax(cand)");
    if (rotAvgAll.avg > hardAvgAll + 1e-9) violations.push("rotation avg(all) > hard avg(all)");
    if (rotAvgCand.avg > hardAvgCand + 1e-9) violations.push("rotation avg(cand) > hard avg(cand)");
    if (violations.length > 0) {
      console.log(`  BUG: invariant violated — ${violations.join("; ")}`);
    } else {
      console.log(`  invariant OK: rotation-aware figures <= hard-model figures in all four comparisons`);
    }

    if (rotMinimaxAll.cost !== rotMinimaxCand.cost) {
      console.log(`  NOTE: arbitrary-probe strictly beats candidate-only for MINIMAX here (${rotMinimaxAll.cost} vs ${rotMinimaxCand.cost})`);
    }
    if (Math.abs(rotAvgAll.avg - rotAvgCand.avg) > 1e-9) {
      console.log(`  NOTE: arbitrary-probe strictly beats candidate-only for AVERAGE here (${rotAvgAll.avg.toFixed(4)} vs ${rotAvgCand.avg.toFixed(4)})`);
    }

    console.log(`  search time — matrix build: ${t1 - t0}ms, minimax(all): ${t2 - t1}ms, minimax(cand): ${t3 - t2}ms, avg(all): ${t4 - t3}ms, avg(cand): ${t5 - t4}ms`);

    summary.push({
      label,
      classes: classes.length,
      sequences: sequences.length,
      hardMinimaxAll,
      hardMinimaxCand,
      hardAvgAll,
      hardAvgCand,
      rotMinimaxAll: rotMinimaxAll.cost,
      rotMinimaxCand: rotMinimaxCand.cost,
      rotAvgAll: rotAvgAll.avg,
      rotAvgCand: rotAvgCand.avg
    });
  });

  console.log("=".repeat(90));
  console.log("HEADLINE EXAMPLE TREES");
  console.log("=".repeat(90));

  // n=4, split 2/2: the headline "does 2-colour stop being hopeless" case.
  {
    const { sequences } = enumerateLiteralSequences([2, 2]);
    const richMatrix = buildRichScoreMatrix(sequences);
    const solver = makeRotationSolver(richMatrix, 4);
    console.log("--- n=4, split 2/2 (arbitrary-probe pool) ---");
    printRotationTree(solver, sequences, 4, solver.fullMask, "all", 1, 3, "  ");
  }

  // n=6, split 3/3: the case where arbitrary-probe beats candidate-only.
  {
    const { sequences } = enumerateLiteralSequences([3, 3]);
    const richMatrix = buildRichScoreMatrix(sequences);
    const solver = makeRotationSolver(richMatrix, 6);
    console.log("--- n=6, split 3/3 (arbitrary-probe pool) ---");
    printRotationTree(solver, sequences, 6, solver.fullMask, "all", 1, 3, "  ");
  }

  console.log("=".repeat(90));
  console.log("SUMMARY (rotation-aware vs. hard model, n<=6, all colour splits)");
  console.log("=".repeat(90));
  summary.forEach((row) => {
    console.log(
      `${row.label.padEnd(24)} classes=${String(row.classes).padStart(3)} seqs=${String(row.sequences).padStart(4)}  ` +
        `minimax hard(cand/all)=${row.hardMinimaxCand}/${row.hardMinimaxAll}  rot(cand/all)=${row.rotMinimaxCand}/${row.rotMinimaxAll}  ` +
        `avg hard(cand/all)=${row.hardAvgCand.toFixed(2)}/${row.hardAvgAll.toFixed(2)}  rot(cand/all)=${row.rotAvgCand.toFixed(2)}/${row.rotAvgAll.toFixed(2)}`
    );
  });
}

run();
