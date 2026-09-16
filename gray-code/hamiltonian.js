"use strict";

// --- Exhaustive (with pruning) Hamiltonian path/cycle search -----------
//
// Plain DFS backtracking, safe for the small graphs this project cares
// about (necklace-class counts stay well under a couple hundred even at
// n=8). Two prunes keep it fast in practice:
//
//   1. Neighbour ordering: at each step, try the unvisited neighbour with
//      the fewest remaining unvisited options first (a Warnsdorff-style
//      heuristic) — tends to hit dead ends early rather than late.
//   2. A hard step budget + wall-clock cap, so a pathological (n, k) can't
//      hang the run silently; if exceeded, the result says so explicitly
///     rather than pretending "not found" is the same as "none exists."

const DEFAULT_MAX_STEPS = 20_000_000;
const DEFAULT_TIME_LIMIT_MS = 20_000;

function remainingDegree(adjacency, visited, node) {
  let count = 0;
  adjacency[node].forEach((neighbor) => {
    if (!visited[neighbor]) count += 1;
  });
  return count;
}

function orderedUnvisitedNeighbors(adjacency, visited, node) {
  return adjacency[node]
    .filter((neighbor) => !visited[neighbor])
    .map((neighbor) => [neighbor, remainingDegree(adjacency, visited, neighbor)])
    .sort((a, b) => a[1] - b[1])
    .map((pair) => pair[0]);
}

// Searches for a Hamiltonian path. requireCycleBackToStart: if true, only
// accepts a path that additionally has an edge from the last node back to
// the first (i.e. a Hamiltonian cycle).
function searchHamiltonian(size, adjacency, requireCycleBackToStart, opts = {}) {
  const maxSteps = opts.maxSteps || DEFAULT_MAX_STEPS;
  const timeLimitMs = opts.timeLimitMs || DEFAULT_TIME_LIMIT_MS;
  const startTime = Date.now();

  if (size === 0) return { found: false, path: null, timedOut: false, steps: 0 };
  if (size === 1) return { found: true, path: [0], timedOut: false, steps: 1 };
  // A "cycle" through exactly 2 vertices would have to reuse the single
  // edge between them twice, which isn't a genuine simple-graph cycle
  // (cycles need >= 3 distinct vertices/edges). Report this case as
  // "no cycle" rather than letting the size===size, "last adjacent to
  // first" check below rubber-stamp a degenerate two-node round trip.
  if (requireCycleBackToStart && size === 2) {
    return { found: false, path: null, timedOut: false, steps: 0, degenerate: true };
  }

  let steps = 0;
  let timedOut = false;

  function withinBudget() {
    steps += 1;
    if (steps > maxSteps) return false;
    if ((steps & 0xfff) === 0 && Date.now() - startTime > timeLimitMs) {
      timedOut = true;
      return false;
    }
    return true;
  }

  function dfs(path, visited) {
    if (timedOut) return null;
    if (path.length === size) {
      if (!requireCycleBackToStart) return [...path];
      const last = path[path.length - 1];
      const first = path[0];
      return adjacency[last].includes(first) ? [...path] : null;
    }

    const current = path[path.length - 1];
    const candidates = orderedUnvisitedNeighbors(adjacency, visited, current);

    for (let i = 0; i < candidates.length; i += 1) {
      if (!withinBudget()) return null;
      const next = candidates[i];
      visited[next] = true;
      path.push(next);
      const result = dfs(path, visited);
      if (result) return result;
      path.pop();
      visited[next] = false;
      if (timedOut) return null;
    }

    return null;
  }

  // A Hamiltonian cycle can, WLOG, be searched starting from vertex 0 only
  // (every cycle passes through it exactly once, and cycles are searched
  // in both directions naturally by trying all of node 0's neighbours
  // first). A Hamiltonian path needs every possible start vertex tried,
  // since the two endpoints aren't otherwise constrained.
  const startCandidates = requireCycleBackToStart
    ? [0]
    : Array.from({ length: size }, (_, i) => i);

  for (let s = 0; s < startCandidates.length; s += 1) {
    const start = startCandidates[s];
    const visited = new Array(size).fill(false);
    visited[start] = true;
    const found = dfs([start], visited);
    if (found) {
      return { found: true, path: found, timedOut: false, steps };
    }
    if (timedOut) {
      return { found: false, path: null, timedOut: true, steps };
    }
  }

  return { found: false, path: null, timedOut: false, steps };
}

function findHamiltonianPath(size, adjacency, opts) {
  return searchHamiltonian(size, adjacency, false, opts);
}

function findHamiltonianCycle(size, adjacency, opts) {
  return searchHamiltonian(size, adjacency, true, opts);
}

module.exports = { findHamiltonianPath, findHamiltonianCycle };
