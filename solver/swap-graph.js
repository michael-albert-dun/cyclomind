"use strict";

// --- The transposition (single-swap) adjacency graph over necklace classes
//
// For the restricted-move-set variant: consecutive guesses must differ by
// exactly one bead swap (transposition of two positions), instead of being
// able to rearrange freely. This module builds the graph that constraint
// induces over necklace classes, following the same technique the sibling
// `gray-code/graph.js` uses for 2-colour k-subsets (Hamming-distance-2
// after rotating one side through all its rotations), generalized here to
// arbitrary colour multisets and built independently (not depending on
// gray-code/, per instructions to keep the two self-contained).
//
// Why Hamming distance 2 is still exactly the right test for a general
// multiset, not just the binary (k-subset) case gray-code/graph.js was
// built for: if two sequences A, B share the same colour multiset and
// differ at exactly two positions i, j (agreeing everywhere else), then
// the multiset {A[i], A[j]} must equal the multiset {B[i], B[j]} (removing
// the — identical — rest of each sequence from each side's total multiset
// leaves the same two-element multiset behind). Since A[i] != B[i], that
// forces A[i] = B[j] and A[j] = B[i]: B is exactly A with positions i, j
// swapped. So "Hamming distance exactly 2" and "reachable by one
// transposition" coincide for any shared multiset, not just 0/1 vectors.

const { rotateClockwise, minimalRotation } = require("./necklace");

function hammingDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) d += 1;
  }
  return d;
}

function allRotations(seq) {
  const n = seq.length;
  const rotations = [];
  for (let r = 0; r < n; r += 1) rotations.push(rotateClockwise(seq, r));
  return rotations;
}

// Two necklace classes (canonical representatives) are transposition-
// adjacent iff some rotation of one is Hamming-distance-2 from the other.
// Fixing repA and rotating repB through all its rotations is enough by
// cyclic symmetry (rotating both by the same extra amount is redundant).
function areTranspositionAdjacent(repA, repB) {
  const rotationsB = allRotations(repB);
  for (let i = 0; i < rotationsB.length; i += 1) {
    if (hammingDistance(repA, rotationsB[i]) === 2) return true;
  }
  return false;
}

// Builds an adjacency-list graph over `classes` (canonical representative
// sequences, e.g. from enumerateNecklaceClasses()). Returns
// { size, adjacency }, adjacency[i] a sorted array of neighbour indices.
function buildTranspositionGraph(classes) {
  const size = classes.length;
  const adjacency = Array.from({ length: size }, () => []);

  for (let i = 0; i < size; i += 1) {
    for (let j = i + 1; j < size; j += 1) {
      if (areTranspositionAdjacent(classes[i], classes[j])) {
        adjacency[i].push(j);
        adjacency[j].push(i);
      }
    }
  }

  return { size, adjacency };
}

// Every single transposition (swap of positions i,j, i<j) applied directly
// to a literal sequence, mapped to the necklace class (canonical
// representative) it lands in. Same-colour swaps are no-ops and skipped
// (they never change the class, so they're not graph edges).
function literalNeighborClasses(seq) {
  const n = seq.length;
  const results = [];

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (seq[i] === seq[j]) continue;
      const copy = [...seq];
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
      results.push(minimalRotation(copy).join(","));
    }
  }

  return new Set(results);
}

// The coordinator's claim, checked computationally rather than assumed:
// the set of classes reachable via one transposition from a class C is the
// same no matter *which literal rotation of C* you're actually standing on
// when you make the swap. For every class, this computes the reachable-
// class-set starting from each of its n literal rotations independently
// and confirms they're all identical to each other and to the
// canonical-representative-based adjacency list built above. Returns
// { ok: boolean, mismatches: [...] } — mismatches is empty iff the claim
// held for every class and every rotation, across this whole multiset.
function verifyRotationInvariantAdjacency(classes) {
  const classKeyToIndex = new Map(classes.map((c, i) => [c.join(","), i]));
  const mismatches = [];

  classes.forEach((rep, classIdx) => {
    const canonicalNeighbors = literalNeighborClasses(rep);
    const canonicalNeighborIndices = new Set(
      [...canonicalNeighbors].map((key) => classKeyToIndex.get(key))
    );

    allRotations(rep).forEach((rotatedRep, rotationIdx) => {
      const neighbors = literalNeighborClasses(rotatedRep);
      const neighborIndices = new Set([...neighbors].map((key) => classKeyToIndex.get(key)));

      const same =
        neighborIndices.size === canonicalNeighborIndices.size &&
        [...neighborIndices].every((idx) => canonicalNeighborIndices.has(idx));

      if (!same) {
        mismatches.push({ classIdx, rotationIdx });
      }
    });
  });

  return { ok: mismatches.length === 0, mismatches };
}

// All-pairs shortest-path distances (unweighted BFS from every node) —
// needed because once only one candidate remains, reaching it to submit
// the confirming guess may take more than one step if it isn't a direct
// neighbour of the current position.
function allPairsShortestPaths(size, adjacency) {
  const dist = Array.from({ length: size }, () => new Array(size).fill(Infinity));

  for (let source = 0; source < size; source += 1) {
    dist[source][source] = 0;
    const queue = [source];
    let head = 0;

    while (head < queue.length) {
      const node = queue[head];
      head += 1;

      adjacency[node].forEach((next) => {
        if (dist[source][next] === Infinity) {
          dist[source][next] = dist[source][node] + 1;
          queue.push(next);
        }
      });
    }
  }

  return dist;
}

// --- Reposition-aware shortest path, for one fixed candidate mask -------
//
// Under the move restriction, a guess that provides *no* new information
// about the current candidate set (every live candidate scores the same
// against it, i.e. it doesn't split the mask at all) is not automatically
// useless the way it was in the unrestricted-move solvers — it may still
// be *necessary* as a stepping stone to reach a position from which some
// other guess finally is informative. (This was caught by the required
// "restricted can never do better than unrestricted" cross-check: an
// earlier version of this solver treated every non-splitting guess as
// strictly dominated — correct for free movement, where a better guess is
// always one move away regardless of where you're standing, but wrong
// here, where "no split" from *this* position may be the only way to
// reach a position where a split *is* available.)
//
// So solving "the best number of additional guesses from every possible
// current position, for one fixed live-candidate mask" is a shortest-path
// problem, not a simple per-position recursion: each class X has a
// `diValues[X]` — the cost if you guess X right now, informative or not
// applicable (Infinity) — and every legal move to a *non*-informative
// neighbour is a weight-1 "repositioning" step toward somewhere that does
// have one. This Dijkstra runs once per mask and yields the optimal cost
// (and, by tracing which edge achieved it, the optimal move) from *every*
// starting position simultaneously, by computing shortest distance to a
// virtual "solved" sink over the reversed graph.
//
// neighborsFor(p): pool-and-mask-filtered legal next classes from
// position p. diValues[X]: for each class X, the cost of guessing X right
// now if that's informative (see the two swap solvers for how this is
// computed — it differs between minimax and average-case), else Infinity.
// Returns { g, choice }: g[p] is the optimal cost from position p;
// choice[p] is the class to guess next from p to achieve it (or null if
// p has no legal move at all).
function repositionDijkstra(size, neighborsFor, diValues) {
  const DONE = size;
  const reversedAdjacency = Array.from({ length: size + 1 }, () => []);

  for (let p = 0; p < size; p += 1) {
    neighborsFor(p).forEach((x) => {
      if (Number.isFinite(diValues[x])) {
        reversedAdjacency[DONE].push({ to: p, weight: diValues[x], via: x, direct: true });
      } else {
        reversedAdjacency[x].push({ to: p, weight: 1, via: x, direct: false });
      }
    });
  }

  const dist = new Array(size + 1).fill(Infinity);
  const via = new Array(size + 1).fill(null);
  const viaIsDirect = new Array(size + 1).fill(false);
  const visited = new Array(size + 1).fill(false);
  dist[DONE] = 0;

  for (let iter = 0; iter <= size; iter += 1) {
    let u = -1;
    let best = Infinity;

    for (let i = 0; i <= size; i += 1) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }

    if (u === -1) break;
    visited[u] = true;

    reversedAdjacency[u].forEach((edge) => {
      const candidate = dist[u] + edge.weight;

      if (candidate < dist[edge.to]) {
        dist[edge.to] = candidate;
        via[edge.to] = edge.via;
        viaIsDirect[edge.to] = edge.direct;
      }
    });
  }

  const choice = new Array(size);
  for (let p = 0; p < size; p += 1) {
    choice[p] = via[p] === null ? null : { guess: via[p], informative: viaIsDirect[p] };
  }

  return { g: dist.slice(0, size), choice };
}

module.exports = {
  hammingDistance,
  areTranspositionAdjacent,
  buildTranspositionGraph,
  literalNeighborClasses,
  verifyRotationInvariantAdjacency,
  allPairsShortestPaths,
  repositionDijkstra
};
