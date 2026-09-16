"use strict";

// Average-case (expected number of guesses) optimal strategy, for the same
// n<=6 configurations already covered by run.js's minimax analysis —
// except the four 2-colour splits (n=4 2/2, n=5 3/2, n=6 4/2, n=6 3/3),
// which are skipped deliberately: for those, every guess's score matrix
// has exactly one off-diagonal value (see docs/minimax-strategy.md), so a
// wrong guess only ever eliminates the one candidate just guessed — no
// strategy can do anything but eliminate one at a time, and the expected
// number of guesses over a uniformly-random secret among m candidates is
// forced to the closed form (m+1)/2, independent of guessing order. That's
// confirmed against the actual solver below (see CLOSED_FORM_CHECKS) rather
// than just asserted, but it costs single-digit milliseconds, not a real
// search.

const {
  enumerateNecklaceClasses,
  isDegenerateSequence,
  buildScoreMatrix
} = require("./necklace");
const { makeExpectedSolver } = require("./expected");
const { makeSolver, popcount } = require("./minimax");

const CONFIGS = [
  { n: 4, counts: [2, 1, 1], label: "n=4, split 2/1/1" },
  { n: 4, counts: [1, 1, 1, 1], label: "n=4, split 1/1/1/1" },

  { n: 5, counts: [2, 2, 1], label: "n=5, split 2/2/1" },
  { n: 5, counts: [2, 1, 1, 1], label: "n=5, split 2/1/1/1" },

  { n: 6, counts: [3, 2, 1], label: "n=6, split 3/2/1" },
  { n: 6, counts: [2, 2, 2], label: "n=6, split 2/2/2" },
  { n: 6, counts: [2, 2, 1, 1], label: "n=6, split 2/2/1/1" }
];

// Cheap sanity check of the (m+1)/2 closed form for the skipped 2-colour
// splits — run through the real solver (not just the formula) since it's
// nearly free at these sizes.
const CLOSED_FORM_CHECKS = [
  { n: 4, counts: [2, 2], label: "n=4, split 2/2" },
  { n: 5, counts: [3, 2], label: "n=5, split 3/2" },
  { n: 6, counts: [4, 2], label: "n=6, split 4/2" },
  { n: 6, counts: [3, 3], label: "n=6, split 3/3" }
];

// Independent cross-check: walk the actual derived strategy for every
// possible secret (not the recursion's own bookkeeping), sum the guesses
// each one actually took, and confirm the resulting average matches the
// reported f(S_full) exactly.
function simulateAverage(solver, scoreMatrix, n, pool) {
  const size = scoreMatrix.length;
  let total = 0;

  for (let secret = 0; secret < size; secret += 1) {
    let mask = solver.fullMask;
    let guesses = 0;

    for (;;) {
      const result = solver.solveMask(mask, pool);
      guesses += 1;

      const score = scoreMatrix[secret][result.guess];
      if (score === n) break;

      const sub = result.buckets.get(score);
      if (sub === undefined) {
        throw new Error(`Simulation desynced: no bucket for score ${score} (secret ${secret}, pool ${pool})`);
      }
      mask = sub;
    }

    total += guesses;
  }

  return total / size;
}

function run() {
  console.log("--- closed-form sanity check: 2-colour splits, avg = (m+1)/2 ---");
  CLOSED_FORM_CHECKS.forEach(({ n, counts, label }) => {
    const { classes } = enumerateNecklaceClasses(counts);
    const scoreMatrix = buildScoreMatrix(classes);
    const solver = makeExpectedSolver(scoreMatrix, n);
    const result = solver.solve("all");
    const closedForm = (classes.length + 1) / 2;
    const match = Math.abs(result.avg - closedForm) < 1e-9;

    console.log(
      `  ${label}: classes=${classes.length}  solver avg=${result.avg}  (m+1)/2=${closedForm}  ` +
        (match ? "[MATCH]" : "[MISMATCH]")
    );
  });

  console.log("=".repeat(78));

  const summary = [];

  CONFIGS.forEach((config) => {
    const { n, counts, label } = config;
    const t0 = Date.now();
    const { classes } = enumerateNecklaceClasses(counts);
    const degenerateCount = classes.filter(isDegenerateSequence).length;
    const scoreMatrix = buildScoreMatrix(classes);

    const eSolver = makeExpectedSolver(scoreMatrix, n);
    const avgAll = eSolver.solve("all");
    const tAll = Date.now();
    const avgCandidates = eSolver.solve("candidates");
    const tCand = Date.now();

    const mSolver = makeSolver(scoreMatrix, n);
    const minimaxAll = mSolver.solve("all").cost;

    const simAll = simulateAverage(eSolver, scoreMatrix, n, "all");
    const simCandidates = simulateAverage(eSolver, scoreMatrix, n, "candidates");

    console.log(`${label}  (colour counts ${JSON.stringify(counts)})`);
    console.log(`  necklace classes (possible secrets): ${classes.length}`);
    if (degenerateCount > 0) {
      console.log(`  WARNING: ${degenerateCount} classes are degenerate and should have been excluded!`);
    }
    console.log(
      `  average guesses — candidate-only pool: ${avgCandidates.avg.toFixed(4)}, arbitrary-probe pool: ${avgAll.avg.toFixed(4)}`
    );
    console.log(
      `  simulated average (independent cross-check) — candidate-only: ${simCandidates.toFixed(4)}, arbitrary-probe: ${simAll.toFixed(4)}` +
        (Math.abs(simAll - avgAll.avg) < 1e-9 && Math.abs(simCandidates - avgCandidates.avg) < 1e-9
          ? "  [MATCH]"
          : "  [MISMATCH]")
    );
    console.log(`  minimax (worst-case) guesses for comparison: ${minimaxAll}`);
    if (avgAll.avg > minimaxAll + 1e-9) {
      console.log(`  BUG: average (${avgAll.avg}) exceeds minimax (${minimaxAll}) — should be impossible!`);
    }
    console.log(`  search time: ${tCand - t0}ms`);
    console.log("-".repeat(78));

    summary.push({
      label,
      classes: classes.length,
      avgAll: avgAll.avg,
      avgCandidates: avgCandidates.avg,
      minimax: minimaxAll
    });
  });

  console.log("=".repeat(78));
  console.log("SUMMARY (average-case, n<=6, excluding 2-colour splits)");
  console.log("=".repeat(78));
  summary.forEach((row) => {
    console.log(
      `${row.label.padEnd(24)} classes=${String(row.classes).padStart(3)}  ` +
        `avg(candidate-only)=${row.avgCandidates.toFixed(4)}  avg(arbitrary-probe)=${row.avgAll.toFixed(4)}  ` +
        `minimax=${row.minimax}`
    );
  });
}

run();
