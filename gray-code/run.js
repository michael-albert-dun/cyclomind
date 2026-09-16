"use strict";

const { enumerateCyclicKSubsets, bitsToString } = require("./necklace-subsets");
const { buildTranspositionGraph } = require("./graph");
const { findHamiltonianPath, findHamiltonianCycle } = require("./hamiltonian");

function formatOrdering(classes, path) {
  return path.map((idx) => bitsToString(classes[idx])).join(" -> ");
}

function run() {
  const rows = [];

  for (let n = 4; n <= 8; n += 1) {
    for (let k = 2; k <= n - 2; k += 1) {
      // Scope note: 1 < k < n-1, i.e. k from 2 through n-2 inclusive.
      const { classes } = enumerateCyclicKSubsets(n, k);
      const { size, adjacency } = buildTranspositionGraph(classes);

      const t0 = Date.now();
      const cycleResult = findHamiltonianCycle(size, adjacency);
      const cycleMs = Date.now() - t0;

      let pathResult;
      let pathMs;
      if (cycleResult.found) {
        // A Hamiltonian cycle trivially yields a Hamiltonian path (drop
        // the closing edge), no need to search again.
        pathResult = { found: true, path: cycleResult.path, timedOut: false, steps: 0 };
        pathMs = 0;
      } else {
        const t1 = Date.now();
        pathResult = findHamiltonianPath(size, adjacency);
        pathMs = Date.now() - t1;
      }

      const minDegree = Math.min(...adjacency.map((a) => a.length));
      const maxDegree = Math.max(...adjacency.map((a) => a.length));

      rows.push({
        n,
        k,
        classCount: size,
        minDegree,
        maxDegree,
        cycleResult,
        cycleMs,
        pathResult,
        pathMs,
        classes
      });

      console.log(
        `n=${n} k=${k}: ${size} cyclic k-subsets, degree range [${minDegree}, ${maxDegree}]`
      );
      const cycleLabel = cycleResult.found
        ? "FOUND"
        : cycleResult.degenerate
        ? "N/A (only 2 classes; a 2-node 'cycle' would reuse the single edge)"
        : cycleResult.timedOut
        ? "TIMED OUT"
        : "NONE (exhaustive)";
      console.log(
        `  Hamiltonian cycle: ${cycleLabel} (${cycleResult.steps} steps, ${cycleMs}ms)`
      );
      console.log(
        `  Hamiltonian path:  ${pathResult.found ? "FOUND" : pathResult.timedOut ? "TIMED OUT" : "NONE (exhaustive)"}` +
          ` (${pathResult.steps} steps, ${pathMs}ms)`
      );
      if (pathResult.found) {
        console.log(`    example: ${formatOrdering(classes, pathResult.path)}`);
      }
      console.log("");
    }
  }

  const summary = rows.map((r) => ({
    n: r.n,
    k: r.k,
    classes: r.classCount,
    cycle: r.cycleResult.found
      ? "yes"
      : r.cycleResult.degenerate
      ? "n/a (2 nodes)"
      : r.cycleResult.timedOut
      ? "TIMEOUT"
      : "no",
    path: r.pathResult.found ? "yes" : r.pathResult.timedOut ? "TIMEOUT" : "no"
  }));
  console.log("Summary:");
  console.table ? console.table(summary) : console.log(JSON.stringify(summary, null, 2));

  const anomalies = rows.filter(
    (r) => !r.pathResult.found || (!r.cycleResult.found && !r.cycleResult.degenerate)
  );
  if (anomalies.length > 0) {
    console.log("\nCases without a found cycle and/or path (see detail above):");
    anomalies.forEach((r) =>
      console.log(
        `  n=${r.n} k=${r.k}: cycle=${r.cycleResult.found}${r.cycleResult.timedOut ? "(timeout)" : ""} path=${r.pathResult.found}${r.pathResult.timedOut ? "(timeout)" : ""}`
      )
    );
  } else {
    console.log(
      "\nEvery (n, k) in scope has a Hamiltonian path, and a Hamiltonian cycle" +
        " wherever more than 2 classes exist (the only structurally degenerate case)."
    );
  }
}

run();
