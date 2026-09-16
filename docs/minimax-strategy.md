# Minimax-Optimal Guessing Strategies

An investigation into how few guesses Cyclomind can be *guaranteed* to be
solved in, for small board sizes, and what that reveals about how much
information the game's scoring rule actually carries.

## The question

Cyclomind tells you the exact colour multiset on the necklace before you
guess anything &mdash; you can see at a glance that it's "6 beads, 4 of one
colour and 2 of another," say. What you don't know is which specific
arrangement (up to rotation) is the secret. Each guess gets scored by the
best-matching rotation, collapsing to a single number: how many beads
matched at the best rotation.

Given that, what's the best possible strategy? Not "a good heuristic," but
literally the smallest number of guesses that *guarantees* a solve no
matter how adversarially the secret is chosen &mdash; the same kind of
question Donald Knuth answered for classic Mastermind with his five-guess
algorithm, adapted here to a rotation-invariant scoring rule and a fixed,
known colour multiset instead of free choice over an unlimited palette.

The code for all of this lives in [`solver/`](../solver/): `necklace.js`
(enumerating necklaces and scoring, ported from `scoreGuess()` in
`src/game.js`), `minimax.js` (the search itself), and `run.js` (drives a
set of representative configurations and prints the results below).

## Method, in brief

For a fixed colour multiset, the set of secrets the game could possibly
choose is exactly the set of necklace equivalence classes for that
multiset &mdash; distinct arrangements up to rotation, minus the two
"degenerate" cases the app itself refuses to generate (mono-colour, and
all-but-one-bead-the-same), since those are described precisely and
excluded by `isDegenerateNecklace()` in `src/game.js`.

Because scoring only cares about the best-matching rotation, and every
guess the player can physically submit is some arrangement of the same
known multiset, the space of distinct *guess behaviours* is identical to
the space of possible secrets. That means there's no larger "probe" space
to reach for beyond the candidate secrets themselves &mdash; a fact the
solver verifies rather than assumes, by separately searching with guesses
restricted to live candidates and with guesses drawn from the full class
list (including already-ruled-out ones), and comparing the two.

The search itself is a standard minimax game tree: at each node, the "live"
set is every secret still consistent with all feedback received so far.
For each possible next guess, partition the live set by the score it would
produce against each remaining candidate, and take the worst (largest)
resulting bucket. The guess minimizing that worst-case bucket size is
optimal at that node; recurse until every candidate is uniquely identified.
States are memoized on (guess pool, live-candidate set), since the future
cost only depends on which candidates remain, not on the path taken to get
there.

Every result below is **exhaustive and proven optimal** &mdash; not a
heuristic, not a bound. That's checked two ways: the search itself proves
it by construction (it tries every guess at every node), and separately,
for every configuration, every candidate secret was simulated all the way
through the derived strategy tree using the score matrix directly (not the
search's own bookkeeping), confirming the worst simulated guess count
matches the reported number exactly, in all cases.

## Results

Scope for this pass: board sizes 4 through 6 (Cyclomind supports up to 8;
larger boards are a natural follow-up, discussed below).

| n | colour split | possible secrets | minimax guesses |
|---|---|---:|---:|
| 4 | 2/2 | 2 | 2 |
| 4 | 2/1/1 | 3 | 3 |
| 4 | 1/1/1/1 | 6 | 6 |
| 5 | 3/2 | 2 | 2 |
| 5 | 2/2/1 | 6 | 5 |
| 5 | 2/1/1/1 | 12 | 6 |
| 6 | 4/2 | 3 | 3 |
| 6 | 3/3 | 4 | 4 |
| 6 | 3/2/1 | 10 | 6 |
| 6 | 2/2/2 | 16 | 5 |
| 6 | 2/2/1/1 | 30 | 5 |

(Allowing "arbitrary probe" guesses outside the live candidate set never
did better than candidate-only guessing in any of these 11 configurations
&mdash; consistent with the argument above that there's no larger guess
space to draw from in the first place.)

## The interesting part: two colours means no strategy at all

Every 2-colour split tested &mdash; 2/2, 3/2, 4/2, 3/3 &mdash; needs
exactly as many guesses as there are possible secrets. No cleverness helps.

The reason falls out of the score matrix: for a 2-colour multiset, *any*
two distinct necklaces score identically against each other. Checking the
matrix directly confirms it &mdash; for the n=6, split 4/2 case, every
off-diagonal entry is 4; for 3/3, every off-diagonal entry is also a single
fixed value. With only one possible non-solving score, a guess's feedback
degrades to a single bit: "is this it, yes or no." Guessing candidates one
at a time is not just a reasonable strategy under those conditions, it's
the *only* one available, so the minimax count is forced to equal the
candidate count exactly.

Introduce a third colour and this collapses immediately: the score
distribution widens to two or three distinct off-diagonal values, and
guess counts drop well below candidate counts. The starkest example is
n=6, split 2/2/1/1: 30 possible secrets, solved in the worst case in just
5 guesses. A smaller but telling case is n=5, split 2/2/1: the score matrix
is mostly a single repeated value (3), except for one specific pair of
necklaces that happens to score 2 against each other &mdash; that single
irregularity alone is enough to shave a guess off what would otherwise be
naive 6-guess elimination.

### A worked example (n=6, split 4/2, 3 candidates)

```
guess [0,0,0,0,1,1]  (3 candidates live, worst case 3 guesses)
  score 6 (exact match) -> solved
  score 4 -> 2 candidates remain
    guess [0,0,0,1,0,1]  (2 candidates live, worst case 2 guesses)
      score 6 (exact match) -> solved
      score 4 -> 1 candidate remains -> guess it (forced final confirmation)
```

Even in this simplest non-trivial case, the "confirm the last candidate"
guess is unavoidable: once only one candidate remains consistent with all
feedback, it still has to be submitted to actually win the game. That's
why the guess count is 3, not 2, even though only 3 secrets are possible.

The n=6, split 3/2/1 tree (10 candidates, worst case 6 guesses) branches
much more richly &mdash; the first guess immediately isolates one
candidate outright, while the other 8 keep subdividing across several more
rounds. Full output, including that tree, is reproduced by running
`node solver/run.js`.

## An important caveat: this understates what a real player can see

This whole analysis treats a guess's feedback as a single number: the best
achievable exact-match count. That's a deliberate simplification, and it's
worth being explicit that it's not the full picture of what Cyclomind
actually shows you.

In the real app, submitting a guess doesn't just report a match count
&mdash; the necklace visibly spins to the *specific* rotation that achieved
the best score (see `animateRotation()` and the "Submitting" section of
the main [README](../README.md)), and ties are broken deterministically by
picking the smallest clockwise rotation among those tied for the best
score. A player watching that spin learns the winning rotation offset, not
just the match count &mdash; strictly more information than this analysis
assumes. Two guesses that happen to tie on match count against the same
secret can still be distinguished by which rotation each one needed.

That means every number in this report is a valid, exhaustively-proven
**upper bound** on the guesses a real optimal player would need, using
only part of the information actually available to them. The true minimax
count, accounting for rotation-offset feedback too, could be equal or
lower in some configurations. This is a natural, well-defined follow-up.

## Extending to n = 7/8

The search here is unpruned brute force (no alpha-beta, no symmetry
reduction beyond the (pool, candidate-set) memoization already in place)
&mdash; it's fast enough as-is because class counts stay at or below 30 and
search depth stays at or below 6 throughout this range. Two things would
matter more at n=7/8:

- **Candidate-set canonicalization under colour-relabelling symmetry.**
  Multisets with repeated counts (like 2/2/1/1) have residual symmetry
  &mdash; swapping the two "2" colours, or the two "1" colours, doesn't
  change the abstract structure of the problem. Collapsing
  symmetry-equivalent search states before hitting the memo table wasn't
  necessary here, but would likely matter once class counts grow further.
- **Skipping 2-colour splits entirely.** The "any 2-colour split collapses
  to binary feedback" result above looks like a general fact about cyclic
  autocorrelation of 2-symbol sequences, not a coincidence of small n. If
  that holds at n=7/8 too (worth confirming directly, but plausible), those
  configurations need no search at all &mdash; just the class-count formula
  &mdash; freeing up compute for the richer multi-colour splits, which are
  exactly the ones where search cost actually grows with n.
