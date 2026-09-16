"use strict";

const { allRotations } = require("./necklace-subsets");

// Hamming distance between two equal-length bit arrays.
function hammingDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) d += 1;
  }
  return d;
}

// Two cyclic k-subsets (given as their canonical representatives) are
// "transposition-adjacent" iff some rotation of one differs from some
// rotation of the other in exactly two positions. Since both have the
// same number of 1s (both are k-subsets), a Hamming distance of exactly 2
// automatically means one position flipped 1->0 and another flipped 0->1
// — i.e. exactly the effect of swapping the contents of two bead
// positions (a transposition) on some rotation of one candidate to reach
// some rotation of the other.
//
// By cyclic symmetry it's enough to fix `repA` and compare it against all
// n rotations of `repB` (rotating both by the same extra amount would be
// redundant).
function areTranspositionAdjacent(repA, repB) {
  const rotationsB = allRotations(repB);
  for (let i = 0; i < rotationsB.length; i += 1) {
    if (hammingDistance(repA, rotationsB[i]) === 2) return true;
  }
  return false;
}

// Builds an adjacency-list graph over `classes` (array of canonical bit
// arrays). Returns { size, adjacency }, where adjacency[i] is a sorted
// array of neighbour indices of node i.
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

module.exports = {
  hammingDistance,
  areTranspositionAdjacent,
  buildTranspositionGraph
};
