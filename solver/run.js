"use strict";

const {
  enumerateNecklaceClasses,
  isDegenerateSequence,
  buildScoreMatrix
} = require("./necklace");
const { makeSolver, popcount, indicesOf } = require("./minimax");

// Representative spread of (n, colour-count-multiset) configurations for
// n = 4, 5, 6, per the task's scope. Multisets that would be degenerate on
// their own (mono-colour, or "all but one") are not included here — none of
// these are, but we assert it at runtime anyway (see checkNoDegenerate)
// rather than just trusting the arithmetic.
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

// Configs to print a full/partial strategy tree for, to show branching
// structure in the report without dumping every tree.
const TREE_CONFIG_LABELS = new Set(["n=6, split 4/2", "n=6, split 3/2/1"]);
const TREE_DEPTH_LIMIT = 3;

function checkNoDegenerate(classes) {
  const degenerate = classes.filter(isDegenerateSequence);
  return degenerate.length;
}

function fmtSeq(seq) {
  return `[${seq.join(",")}]`;
}

function printTree(solver, classes, mask, pool, depth, prefix) {
  if (depth > TREE_DEPTH_LIMIT) {
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
    printTree(solver, classes, submask, pool, depth + 1, `${prefix}    `);
  });
}

function run() {
  const summary = [];

  CONFIGS.forEach((config) => {
    const { n, counts, label } = config;
    const { classes } = enumerateNecklaceClasses(counts);
    const degenerateCount = checkNoDegenerate(classes);
    const scoreMatrix = buildScoreMatrix(classes);
    const solver = makeSolver(scoreMatrix, n);
    solver.__n = n;

    const resultAll = solver.solve("all");
    const resultCandidates = solver.solve("candidates");

    console.log("=".repeat(78));
    console.log(`${label}  (colour counts ${JSON.stringify(counts)})`);
    console.log(`  necklace classes (possible secrets): ${classes.length}`);
    if (degenerateCount > 0) {
      console.log(`  WARNING: ${degenerateCount} classes are degenerate and should have been excluded!`);
    }
    console.log(
      `  minimax guesses — candidate-only pool: ${resultCandidates.cost}, arbitrary-probe pool: ${resultAll.cost}`
    );
    console.log(`  optimal first guess (arbitrary pool): ${fmtSeq(classes[resultAll.guess])}`);
    console.log(`  optimal first guess (candidate-only pool): ${fmtSeq(classes[resultCandidates.guess])}`);

    if (TREE_CONFIG_LABELS.has(label)) {
      console.log(`  --- strategy tree (arbitrary-probe pool, depth-capped at ${TREE_DEPTH_LIMIT}) ---`);
      printTree(solver, classes, solver.fullMask, "all", 1, "  ");
    }

    summary.push({
      label,
      n,
      counts,
      classes: classes.length,
      candidatesOnly: resultCandidates.cost,
      arbitraryProbe: resultAll.cost,
      firstGuessAll: classes[resultAll.guess],
      firstGuessCandidates: classes[resultCandidates.guess]
    });
  });

  console.log("=".repeat(78));
  console.log("SUMMARY");
  console.log("=".repeat(78));
  summary.forEach((row) => {
    console.log(
      `${row.label.padEnd(24)} classes=${String(row.classes).padStart(3)}  ` +
        `candidate-only=${row.candidatesOnly}  arbitrary-probe=${row.arbitraryProbe}`
    );
  });
}

run();
