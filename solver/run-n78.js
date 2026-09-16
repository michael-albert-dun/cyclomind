"use strict";

// Extension of run.js's exhaustive minimax analysis to BEAD_COUNT n = 7 and
// 8, restricted to exactly-three-colour splits (all partitions of n into
// exactly 3 positive parts). Same methodology, same score-matrix/solver
// code (necklace.js, minimax.js) — only the configs and, for the largest
// one (n=8, split 3/3/2, 70 necklace classes), the runtime are different
// enough to be worth calling out explicitly.
//
// Kept as a separate script from run.js (rather than folding these configs
// into CONFIGS there) because a full run here takes minutes, not seconds —
// no reason to pay that cost every time someone just wants the fast n<=6
// table.

const {
  enumerateNecklaceClasses,
  isDegenerateSequence,
  buildScoreMatrix
} = require("./necklace");
const { makeSolver, popcount, indicesOf } = require("./minimax");

// All partitions of n into exactly 3 positive parts, per the task.
const CONFIGS = [
  { n: 7, counts: [5, 1, 1], label: "n=7, split 5/1/1" },
  { n: 7, counts: [4, 2, 1], label: "n=7, split 4/2/1" },
  { n: 7, counts: [3, 3, 1], label: "n=7, split 3/3/1" },
  { n: 7, counts: [3, 2, 2], label: "n=7, split 3/2/2" },

  { n: 8, counts: [6, 1, 1], label: "n=8, split 6/1/1" },
  { n: 8, counts: [5, 2, 1], label: "n=8, split 5/2/1" },
  { n: 8, counts: [4, 3, 1], label: "n=8, split 4/3/1" },
  { n: 8, counts: [4, 2, 2], label: "n=8, split 4/2/2" },
  { n: 8, counts: [3, 3, 2], label: "n=8, split 3/3/2" }
];

// n=8 5/2/1 is the one case in this whole study (n<=8) where an
// arbitrary-probe guess actually beats every candidate-only guess — print
// its tree to show why. n=8 3/3/2 is the largest search here (70 classes)
// — print its top level too, just to show the scale of branching at that
// size (full depth-capped tree would be enormous, so this one is capped
// shallower).
const TREE_CONFIGS = [
  { label: "n=8, split 5/2/1", depthLimit: 3 },
  { label: "n=8, split 3/3/2", depthLimit: 1 }
];

function fmtSeq(seq) {
  return `[${seq.join(",")}]`;
}

function printTree(solver, classes, mask, pool, depth, depthLimit, prefix) {
  if (depth > depthLimit) {
    console.log(`${prefix}... (truncated, ${popcount(mask)} candidates remain)`);
    return;
  }

  const result = solver.solveMask(mask, pool);
  const count = popcount(mask);

  if (count === 1) {
    const only = indicesOf(mask, solver.size)[0];
    console.log(`${prefix}candidate confirmed: ${fmtSeq(classes[only])} -> guess it (1 guess)`);
    return;
  }

  console.log(
    `${prefix}guess ${fmtSeq(classes[result.guess])} (${count} candidates live, worst-case ${result.cost} more guess${result.cost === 1 ? "" : "es"})`
  );

  const scores = [...result.buckets.keys()].sort((a, b) => a - b);

  scores.forEach((score) => {
    const submask = result.buckets.get(score);
    const subCount = popcount(submask);

    if (score === solver.__n) {
      console.log(`${prefix}  score ${score} (exact match) -> solved`);
      return;
    }

    console.log(`${prefix}  score ${score} -> ${subCount} candidate${subCount === 1 ? "" : "s"} remain`);
    printTree(solver, classes, submask, pool, depth + 1, depthLimit, `${prefix}    `);
  });
}

// Independent cross-check: walk the *actual derived strategy* for every
// possible secret (not the recursion's own bookkeeping) and confirm the
// worst simulated guess count matches the reported minimax exactly.
function simulateWorstCase(solver, scoreMatrix, n, pool) {
  const size = scoreMatrix.length;
  let worst = 0;

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

    if (guesses > worst) worst = guesses;
  }

  return worst;
}

function run() {
  const summary = [];

  CONFIGS.forEach((config) => {
    const { n, counts, label } = config;
    const t0 = Date.now();
    const { classes } = enumerateNecklaceClasses(counts);
    const degenerateCount = classes.filter(isDegenerateSequence).length;
    const scoreMatrix = buildScoreMatrix(classes);
    const solver = makeSolver(scoreMatrix, n);
    solver.__n = n;

    const resultAll = solver.solve("all");
    const tAll = Date.now();
    const resultCandidates = solver.solve("candidates");
    const tCand = Date.now();

    const simAll = simulateWorstCase(solver, scoreMatrix, n, "all");
    const simCandidates = simulateWorstCase(solver, scoreMatrix, n, "candidates");

    console.log("=".repeat(78));
    console.log(`${label}  (colour counts ${JSON.stringify(counts)})`);
    console.log(`  necklace classes (possible secrets): ${classes.length}`);
    if (degenerateCount > 0) {
      console.log(`  WARNING: ${degenerateCount} classes are degenerate and should have been excluded!`);
    }
    console.log(
      `  minimax guesses — candidate-only pool: ${resultCandidates.cost}, arbitrary-probe pool: ${resultAll.cost}`
    );
    console.log(
      `  simulated worst case (independent cross-check) — candidate-only: ${simCandidates}, arbitrary-probe: ${simAll}` +
        (simAll === resultAll.cost && simCandidates === resultCandidates.cost ? "  [MATCH]" : "  [MISMATCH]")
    );
    console.log(`  optimal first guess (arbitrary pool): ${fmtSeq(classes[resultAll.guess])}`);
    console.log(`  optimal first guess (candidate-only pool): ${fmtSeq(classes[resultCandidates.guess])}`);
    console.log(`  search time — arbitrary-probe pool: ${tAll - t0}ms, candidate-only pool: ${tCand - tAll}ms`);

    if (resultAll.cost !== resultCandidates.cost) {
      console.log(
        `  NOTE: arbitrary-probe guessing strictly beats candidate-only guessing here ` +
          `(${resultAll.cost} vs ${resultCandidates.cost}) — the only config in this whole n<=8 study where that happens.`
      );
    }

    const treeConfig = TREE_CONFIGS.find((t) => t.label === label);
    if (treeConfig) {
      console.log(`  --- strategy tree (arbitrary-probe pool, depth-capped at ${treeConfig.depthLimit}) ---`);
      printTree(solver, classes, solver.fullMask, "all", 1, treeConfig.depthLimit, "  ");
    }

    summary.push({
      label,
      classes: classes.length,
      candidatesOnly: resultCandidates.cost,
      arbitraryProbe: resultAll.cost,
      searchMs: tCand - t0
    });
  });

  console.log("=".repeat(78));
  console.log("SUMMARY (n=7/8, exactly-three-colour splits)");
  console.log("=".repeat(78));
  summary.forEach((row) => {
    console.log(
      `${row.label.padEnd(20)} classes=${String(row.classes).padStart(3)}  ` +
        `candidate-only=${row.candidatesOnly}  arbitrary-probe=${row.arbitraryProbe}  ` +
        `(searched in ${row.searchMs}ms)`
    );
  });
}

run();
