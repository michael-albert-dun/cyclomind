"use strict";

// Independent sanity check for run.js's output: re-derives each reported
// Hamiltonian path/cycle from scratch and confirms (a) every class appears
// exactly once, (b) every consecutive pair really is transposition-
// adjacent per the areTranspositionAdjacent() definition, checked by
// brute-force rotation search rather than trusting the adjacency-list
// bookkeeping, and (c) for cycles, the closing edge holds too.

const { enumerateCyclicKSubsets, bitsToString } = require("./necklace-subsets");
const { buildTranspositionGraph, areTranspositionAdjacent } = require("./graph");
const { findHamiltonianPath, findHamiltonianCycle } = require("./hamiltonian");

let failures = 0;
let checked = 0;

for (let n = 4; n <= 8; n += 1) {
  for (let k = 2; k <= n - 2; k += 1) {
    const { classes } = enumerateCyclicKSubsets(n, k);
    const { size, adjacency } = buildTranspositionGraph(classes);

    const pathResult = findHamiltonianPath(size, adjacency);
    checked += 1;

    if (!pathResult.found) {
      console.log(`FAIL n=${n} k=${k}: no path found (unexpected)`);
      failures += 1;
      continue;
    }

    const path = pathResult.path;
    const seen = new Set(path);
    if (seen.size !== size || path.length !== size) {
      console.log(`FAIL n=${n} k=${k}: path doesn't visit all ${size} classes exactly once`);
      failures += 1;
      continue;
    }

    let ok = true;
    for (let i = 0; i + 1 < path.length; i += 1) {
      const a = classes[path[i]];
      const b = classes[path[i + 1]];
      if (!areTranspositionAdjacent(a, b)) {
        console.log(
          `FAIL n=${n} k=${k}: step ${i} (${bitsToString(a)} -> ${bitsToString(b)}) is not transposition-adjacent`
        );
        ok = false;
      }
    }
    if (!ok) {
      failures += 1;
      continue;
    }

    if (size > 2) {
      const cycleResult = findHamiltonianCycle(size, adjacency);
      if (cycleResult.found) {
        const cpath = cycleResult.path;
        const closingA = classes[cpath[cpath.length - 1]];
        const closingB = classes[cpath[0]];
        if (!areTranspositionAdjacent(closingA, closingB)) {
          console.log(
            `FAIL n=${n} k=${k}: cycle closing edge (${bitsToString(closingA)} -> ${bitsToString(closingB)}) is not transposition-adjacent`
          );
          failures += 1;
          continue;
        }
        for (let i = 0; i + 1 < cpath.length; i += 1) {
          const a = classes[cpath[i]];
          const b = classes[cpath[i + 1]];
          if (!areTranspositionAdjacent(a, b)) {
            console.log(`FAIL n=${n} k=${k}: cycle step ${i} not transposition-adjacent`);
            failures += 1;
          }
        }
      } else {
        console.log(`FAIL n=${n} k=${k}: expected a cycle (>2 classes) but none found`);
        failures += 1;
      }
    }

    console.log(`OK   n=${n} k=${k}: ${size} classes, path and (if applicable) cycle verified`);
  }
}

console.log(`\n${checked} (n, k) pairs checked, ${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);
