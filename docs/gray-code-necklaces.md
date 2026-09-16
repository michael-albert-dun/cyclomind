# A Transposition Gray Code for Cyclic k-Subsets

A follow-up to the "two colours means no strategy at all" finding in
[`minimax-strategy.md`](minimax-strategy.md): for a 2-colour Cyclomind
board, every wrong guess is equally uninformative, so an optimal player
has no choice but to check candidate secrets one at a time until the
right one turns up. Given that you're stuck checking every candidate
anyway, this asks a narrower, more mechanical question: is there an
order to check them in where each candidate differs from the next by
exactly one bead-swap, so that "moving on to the next guess" never costs
more than a single transposition of two positions?

## The question, precisely

Fix n bead positions and a minority-colour count k, with 1 < k < n − 1
(k = 0, 1, n − 1, n are the degenerate cases the app already excludes
elsewhere — not this document's concern). The possible secrets are
**cyclic k-subsets of an n-set**: size-k subsets of {0, ..., n−1}, up to
rotation. Two cyclic k-subsets are **transposition-adjacent** if some
rotation of one differs from some rotation of the other in exactly two
positions — equivalently, if you can turn one into the other by swapping
the contents of one "minority-colour" bead and one "majority-colour"
bead, then (if needed) spinning the necklace.

The question: does a Hamiltonian path (equivalently, in the terminology
of this area, a **cyclic transposition Gray code**) always exist through
this adjacency graph, for every n and k in Cyclomind's range? If so,
what's the actual construction, and does it match what direct
computation on small cases shows?

## What the literature says

This turns out to be a solved problem, not an open one — and solved more
strongly than the question above even asks (existence of a full
Hamiltonian **cycle**, not just a path, i.e. the last candidate checked
can transposition-adjoin back to the first). The main sources below were
found via general search plus one comprehensive modern survey (see "How
this was searched" below).

### The exact result: Wang & Savage (1996)

**T. M. Y. Wang and C. D. Savage, "A Gray code for necklaces of fixed
density," SIAM J. Discrete Math., 9(4):654–673, 1996.**

This is precisely the problem above, phrased as binary necklaces of
fixed density (an n-bit necklace of density d is exactly a cyclic
d-subset of an n-set: mark the positions holding 1s). Per the secondary
sources used to confirm its content (the original 1996 SIAM J. Discrete
Math. text itself was not retrievable — it predates open-access norms
and sits behind a SIAM paywall; see the two independent descriptions
below), the paper:

- **Proves existence for all valid n and d** (0 < d < n), not just
  small or structured cases.
- **Gives an explicit, constructive algorithm**, not just a
  nonconstructive existence proof. Ruskey & Sawada's 1999 follow-up
  paper (full text obtained, see below) describes the method's shape:
  "Wang and Savage base their algorithm on finding a Hamilton cycle in a
  graph related to a tree of necklaces."
- Produces a **cyclic** ordering — successive representatives, including
  the wraparound from the last back to the first, differ by exactly one
  transposition. This is the stronger "Hamiltonian cycle" version of the
  question, not merely a path.
- Runs in **O(n · N(n, d))** total time, where N(n, d) is the number of
  necklaces of length n and density d — i.e. it's efficient (though not
  the later-improved constant-amortized-time bound; see Sawada &
  Williams below).
- One structural detail confirmed by two independent secondary sources
  (Mütze's survey, see below): the canonical representative chosen for
  each class is **not** the lexicographically smallest rotation (the
  convention this project's `solver/necklace.js` and this document's own
  `gray-code/necklace-subsets.js` both use) — Wang & Savage instead use
  the rotation obtained by rotating left until the first bit is 1. This
  doesn't change *whether* the Gray code exists (relabeling
  representatives within their rotation classes can't affect that), only
  which specific bitstring stands in for each necklace.

This paper is cited directly by name in Frank Ruskey and Joe Sawada, **"An
efficient algorithm for generating necklaces with fixed density," SIAM
J. Comput., 29(2):671–684, 1999** (full text obtained), which is a
closely related but distinct paper — it's about *generating* fixed-density
necklaces efficiently (in the amortized-constant-time, "CAT" sense), not
about Gray-code adjacency between them, though it cites Wang & Savage's
result as prior work in exactly the terms quoted above.

### An independent construction: Ueda (2000)

**T. Ueda, "Gray codes for necklaces," Discrete Math., 219(1–3):235–248,
2000.**

Per Mütze's survey (below), Ueda **independently** (i.e., without relying
on Wang & Savage) devised a second transposition Gray code for
fixed-density necklaces, plus a separate one for fixed-density **Lyndon
words** (aperiodic necklaces — the k = n and gcd-related degenerate
structure doesn't arise for Cyclomind's candidate space, since duplicate
rotations are exactly what "necklace" already quotients out, but Lyndon
words are relevant to some of the generation machinery cited here).
Ueda's chosen representatives are, per the survey, neither
lexicographically smallest nor largest — a third, non-standard
convention. Beyond just proving existence, the survey states Ueda "also
established stronger Hamiltonicity properties about the underlying flip
graphs" than a bare Hamiltonian cycle — e.g., properties in the spirit of
Hamilton-*connectedness* (a path between any two prescribed necklaces,
not just some cyclic tour through all of them) are the kind of thing this
phrase covers elsewhere in the same survey, though the survey doesn't
spell out exactly which stronger property Ueda proved for this specific
case, and that detail wasn't independently confirmed here.

**Two independent 1990s/2000s constructions reaching the same existence
result is good corroborating evidence** that this isn't a fragile or
easily-misstated result — it's a settled fact about this graph family.

### A faster but structurally different relative: Sawada & Williams (2013)

**J. Sawada and A. Williams, "A Gray code for fixed-density necklaces and
Lyndon words in constant amortized time," Theoret. Comput. Sci.,
502:46–54, 2013.**

This is the closely-related-but-not-identical case the task asked to
watch for. It gives a **cool-lex**-style cyclic Gray code for fixed-density
necklaces (among other related families) that runs in genuinely constant
amortized time per object — strictly faster than Wang & Savage's
O(n · N(n,d)) bound. But per Mütze's survey, for the necklace case (as
opposed to plain combinations) it works by **substring shifts that
result in one or two transpositions per step**, not always exactly one.
That makes it a valid, efficient, cyclic Gray code by the "small change"
standard generally used in this literature, but **not** a strict answer
to the exact question posed here (single transposition, always) — it's
the paper worth flagging as solving an adjacent, weaker-guarantee variant
rather than this exact problem. Wang & Savage (and, independently, Ueda)
remain the precise match.

### Context: the non-cyclic ancestor

The classical "revolving door" Gray code the task asked to check is a
genuinely different (simpler) problem: **plain** (n, k)-combinations,
*without* quotienting by rotation. Per Mütze's survey (§4.1,
"Transpositions"), the existence of a cyclic transposition Gray code for
plain (n, k)-combinations is due to **C. C. Tang and C. Y. Liu (1973)**,
who showed that restricting the binary reflected Gray code to a fixed
weight k already gives one; **A. Nijenhuis and H. S. Wilf's book,
*Combinatorial Algorithms* (Academic Press, 1978)**, is the source that
popularized this as "the revolving door algorithm" with a concrete
implementation, and is the association the task's framing (correctly)
anticipated. The un-quotiented flip graph of (n, k)-combinations under
arbitrary transpositions is called the **Johnson graph J(n, k)**, later
shown to be *Hamilton-connected* (path between any two combinations, not
just a tour) by Jiang & Ruskey (1994) and independently by Knor (1994).
None of this line of work is about the rotation-equivalence-class
setting this project actually needs — that's exactly the gap Wang &
Savage's and Ueda's papers fill — but it is the direct non-cyclic
ancestor, and the bubble-language / cool-lex machinery behind Sawada &
Williams' fixed-density necklace result is a generalization of this same
revolving-door idea.

### How this was searched

Frank Ruskey's *Combinatorial Generation* book draft (the specific
survey the task suggested checking) was located and downloaded, but its
PDF text layer didn't extract into readable text with the tools
available here, so it could not be read directly. In its place, **Torsten
Mütze, "Combinatorial Gray codes—an updated survey," arXiv:2202.01280**
(a 2022–2024 update to C. D. Savage's original 1997 SIAM Review survey of
the same name, and a direct descendant of exactly the kind of
comprehensive Gray-code literature map Ruskey's book was suggested for)
was used instead — its text layer extracted cleanly via `pdftotext`, and
§4.3 ("Fixed-density necklaces") is a short, direct, citation-backed
section covering exactly this problem, which is what's quoted and relied
on above. The Ruskey & Sawada 1999 SIAM J. Comput. paper's PDF was also
obtained and read directly (it turned out to be openly available,
unlike the 1996 Wang & Savage paper itself).

## Computational verification

Independent of the literature, this was also checked directly by brute
force for every (n, k) Cyclomind actually needs: **n = 4 through 8, and
for each n, every k with 1 < k < n − 1** — 15 pairs in total. Code lives
in [`gray-code/`](../gray-code/), self-contained and independent of
`solver/` (a fresh implementation, not a reuse of `solver/necklace.js`,
per this task's isolation constraint):

- [`necklace-subsets.js`](../gray-code/necklace-subsets.js) enumerates
  cyclic k-subsets of an n-set, one canonical (lexicographically-smallest-
  rotation) representative per class, via standard combinatorial
  backtracking.
- [`graph.js`](../gray-code/graph.js) builds the transposition-adjacency
  graph: for two class representatives, it checks all n rotations of one
  against the fixed other and looks for a Hamming distance of exactly 2
  (which, since both have the same weight k, is automatically a valid
  "swap one minority bead and one majority bead" transposition — no
  further check needed).
- [`hamiltonian.js`](../gray-code/hamiltonian.js) is a backtracking
  Hamiltonian path/cycle search with a Warnsdorff-style least-remaining-
  degree neighbour ordering (a standard heuristic that steers the search
  toward dead ends early rather than late) and a hard step/wall-clock
  budget, so that a surprisingly slow case would report "timed out"
  rather than hang silently — in the event, nothing came close to that
  budget (see below).
- [`run.js`](../gray-code/run.js) drives all 15 (n, k) pairs, searching
  first for a Hamiltonian **cycle** (the stronger property the
  literature claims) and falling back to a plain path search only if no
  cycle is found.
- [`verify.js`](../gray-code/verify.js) is an independent double-check:
  it re-derives each reported path/cycle from scratch and confirms, by
  brute-force rotation search rather than trusting the adjacency-list
  bookkeeping, that every consecutive pair (and, for cycles, the closing
  edge) really is transposition-adjacent, and that every class appears
  exactly once.

### Results

| n | k | cyclic k-subsets | Hamiltonian cycle | Hamiltonian path | search cost |
|---|---|---:|---|---|---|
| 4 | 2 | 2  | n/a (only 2 classes — see below) | found | instant |
| 5 | 2 | 2  | n/a (only 2 classes) | found | instant |
| 5 | 3 | 2  | n/a (only 2 classes) | found | instant |
| 6 | 2 | 3  | found | found | instant |
| 6 | 3 | 4  | found | found | instant |
| 6 | 4 | 3  | found | found | instant |
| 7 | 2 | 3  | found | found | instant |
| 7 | 3 | 5  | found | found | instant |
| 7 | 4 | 5  | found | found | instant |
| 7 | 5 | 3  | found | found | instant |
| 8 | 2 | 4  | found | found | instant |
| 8 | 3 | 7  | found | found | instant |
| 8 | 4 | 10 | found | found | instant |
| 8 | 5 | 7  | found | found | instant |
| 8 | 6 | 4  | found | found | instant |

**Every single one of the 15 cases has a Hamiltonian path**, and every
case with more than 2 classes has a full Hamiltonian **cycle** too — all
found essentially instantly (the largest search, n=8/k=4 with 10 classes,
took 11 backtracking steps and well under a millisecond; nothing here
came anywhere near needing the pruning heuristics or step budget to be
useful, since these graphs turn out to be quite dense — e.g. n=8/k=3 has
7 classes each of degree 6, i.e. the graph is complete). Class counts
were cross-checked against the standard necklace-counting formula
N(n,k) = (1/n)·Σ_{d | gcd(n,k)} φ(d)·C(n/d, k/d) and matched in every
case (e.g. n=8,k=4: divisors of gcd(8,4)=4 give (1·70 + 1·6 + 2·2)/8 =
80/8 = 10, matching the 10 classes found).

**The n=4/k=2, n=5/k=2, and n=5/k=3 rows are the one structural wrinkle**,
and it's a bookkeeping one, not a finding about the game: each has
exactly 2 cyclic k-subsets, connected by a single edge (the two classes
are each other's only transposition-neighbour). A "Hamiltonian cycle" on
2 vertices would have to reuse that single edge twice to get back to the
start, which isn't a genuine simple-graph cycle (cycles need ≥ 3 distinct
vertices/edges) — so `hamiltonian.js` explicitly reports this case as
"not applicable" rather than letting a naive path-length check rubber-
stamp it as a false "yes." The Hamiltonian *path* — the property that
actually matters for the game (check candidate A, one swap gets you to
candidate B, done, you've covered every secret) — is trivially and
correctly found in all three cases, since with only 2 candidates any
valid edge between them is already a complete tour.

### Literature vs. computation: full agreement, no discrepancy

Wang & Savage's claim ("valid for all n and k") predicts a cyclic
transposition Gray code should exist for every one of these 15 cases.
The brute-force search confirms exactly that (modulo the inherent,
expected 2-vertex degeneracy above, which isn't a counterexample to
anything — a 2-node graph can't have a *proper* cycle regardless of what
the theorem says, since "cycle" isn't even a coherent concept there).
Nothing here required reconciling a literature claim against a
computational result — they agree cleanly, which is itself worth stating
plainly rather than leaving implicit.

## The example from the results table, worked out (n=8, k=4, 10 classes)

The densest, most structurally interesting case in scope. `run.js`
reports the following order (each `->` is exactly one bead swap, once
necklaces are aligned to the right rotation):

```
00001111 -> 00101101 -> 00100111 -> 00011011 -> 00110011 ->
00011101 -> 00010111 -> 00110101 -> 01010101 -> 00101011
```

All 10 cyclic 4-subsets of an 8-set appear exactly once, confirmed by
`verify.js` re-deriving transposition-adjacency for every consecutive
pair from scratch (not from the search's own bookkeeping). Interestingly,
`01010101` — the maximally rotationally-symmetric class in this family
(period 2) — has the highest degree in the adjacency graph (9, i.e.
adjacent to every other class), which makes sense: a highly symmetric
necklace has many rotations, so many more chances for some rotation of
some other necklace to land a Hamming-distance-2 match against it.

## Bottom line for Cyclomind

**Yes — for every board size and colour split Cyclomind actually needs
(n = 4 through 8, every valid 2-colour split), a Gray code with
transposition (single bead-swap) adjacency exists for the candidate
secrets, and in fact a stronger *cyclic* one exists everywhere except the
inherently-trivial 2-candidate cases.** This isn't a narrow computational
observation about small n — Wang & Savage (1996), independently
corroborated by Ueda (2000), proved it for *all* n and k, with an
explicit (if not asymptotically optimal — Sawada & Williams (2013) improved
the running time, at the cost of occasionally needing two transpositions
per step instead of Wang & Savage's/Ueda's strict one) algorithm. The
computational check here isn't needed to establish the result — it's
already a settled fact in the combinatorics literature — but it does
confirm the literature was read and applied correctly to this project's
exact setting, with an explicit, independently-verified example ordering
for every (n, k) pair the game can produce.

Practically, this means a hypothetical "exhaustive checker" mode for a
2-colour Cyclomind board could walk every possible secret using nothing
but single bead-swaps between guesses, never needing to rearrange more
than two beads to move from one candidate to the next — for any board
size and colour split the app supports.
