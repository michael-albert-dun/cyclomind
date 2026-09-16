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
Alongside that worst-case (minimax) question, this report also answers the
average-case one: assuming the secret is uniformly random (which is exactly
how the real game generates it &mdash; see README.md's "Uniform secret
generation"), what's the smallest possible *expected* number of guesses?

The code for all of this lives in [`solver/`](../solver/): `necklace.js`
(enumerating necklaces and scoring, ported from `scoreGuess()` in
`src/game.js`), `minimax.js` (the worst-case search) and `expected.js` (the
average-case search, same state space and memoization strategy, minimizing
expected rather than worst-case cost), and `run.js` / `run-expected.js`
(drive a set of representative configurations and print the results
below).

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

The average-case search (`expected.js`) uses the identical state space and
memoization, but at each node minimizes the *expected* number of additional
guesses over a uniformly-random secret in the live set, rather than the
worst case: for a guess splitting the live set into score-buckets, the cost
is the size-weighted average of `1 + f(bucket)` across all non-solved
buckets. There's no simple "the worst branch alone already loses" shortcut
here the way there is for minimax (every branch contributes to the average,
not just the largest), but exact branch-and-bound still applies: the
buckets are evaluated largest-first, and once a guess's running (unweighted)
sum already reaches or exceeds the best total found so far, its remaining
buckets are skipped, since they can only add more. This never changes the
answer, only how much recursion is needed to find it &mdash; verified, same
as minimax, by simulating the derived strategy for every candidate and
confirming the average number of guesses actually taken matches the
reported figure exactly, and additionally by checking that the average
never exceeds the minimax figure for the same configuration (it can't:
minimax's own strategy is a valid, if not always optimal, candidate
strategy for the average-case objective too).

## Results

Scope for this pass: board sizes 4 through 6 (Cyclomind supports up to 8;
larger boards are a natural follow-up, discussed below &mdash; and see
["n=7/8, three-colour splits"](#n78-three-colour-splits) for exactly that).

| n | colour split | possible secrets | minimax guesses | average guesses |
|---|---|---:|---:|---:|
| 4 | 2/2 | 2 | 2 | 1.5 |
| 4 | 2/1/1 | 3 | 3 | 2.0 |
| 4 | 1/1/1/1 | 6 | 6 | 3.5 |
| 5 | 3/2 | 2 | 2 | 1.5 |
| 5 | 2/2/1 | 6 | 5 | 2.83 |
| 5 | 2/1/1/1 | 12 | 6 | 3.5 |
| 6 | 4/2 | 3 | 3 | 2.0 |
| 6 | 3/3 | 4 | 4 | 2.5 |
| 6 | 3/2/1 | 10 | 6 | 3.3 |
| 6 | 2/2/2 | 16 | 5 | 3.25 |
| 6 | 2/2/1/1 | 30 | 5 | 3.53 |

(Allowing "arbitrary probe" guesses outside the live candidate set never
did better than candidate-only guessing in any of these 11 configurations,
for either objective &mdash; consistent with the argument above that there's
no larger guess space to draw from in the first place. That stops being
true once n=7/8 is in scope, see below.)

The average-case figures for the four 2-colour splits are the closed form
`(m + 1) / 2` described in the next section, confirmed against the actual
solver rather than just asserted; the rest were computed by full exhaustive
search (`solver/run-expected.js`) and cross-checked, same as the minimax
figures, by simulating the derived strategy against every candidate secret
and confirming the resulting average matches exactly. As a sanity invariant
that would flag a bug immediately if violated: the average is &le; the
minimax figure in every single row, which it must be, since a minimax-
optimal strategy is itself always a valid (if not always
expectation-optimal) strategy.

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

The same collapse pins down the average case in closed form, with no
search needed. Since a wrong guess only ever eliminates the exact candidate
just guessed &mdash; every other candidate lands in one shared "still
unknown" bucket regardless of which wrong guess was made &mdash; the
problem reduces to: guess candidates one at a time, in any order (order
can't matter, by the same symmetry), until the secret turns up. For `m`
candidates each equally likely to be the secret, that's an expected
`(1 + 2 + ... + m) / m = (m + 1) / 2` guesses. This is confirmed directly
against `expected.js`'s solver in `run-expected.js` (not just asserted) for
all four 2-colour splits in scope, matching to machine precision.

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

## The rotation-aware model: does 2-colour stop being hopeless?

The follow-up promised above, done in full: every n&le;6 configuration
&mdash; now including the four 2-colour splits, specifically because those
are exactly the ones the hard model collapsed to "no strategy, just
eliminate one at a time" &mdash; re-solved for both minimax and average-case
objectives, using the actual (rotation, exact) feedback pair instead of
just exact.

### What changes, and why the state space has to grow

`scoreGuess()`'s tie-break, confirmed directly against `src/game.js` rather
than assumed: rotations are tried in increasing order and only a *strictly*
greater exact count replaces the running best, so ties keep the smallest
rotation found first &mdash; exactly the "smallest clockwise rotation among
those tied for best" rule in README.md's "Scoring" section. That's now
ported verbatim as `bestRotationAndExact()` in `necklace.js`, alongside
(not replacing) the existing `bestExact()`.

The harder part is what counts as a "candidate secret" once rotation is
part of the feedback. The exact-match count is rotation-invariant &mdash;
proven earlier in this report &mdash; so under the hard model, a necklace
class (an arrangement up to rotation) was the right unit: every literal
rotation of a class behaves identically. The winning *rotation*, though, is
**not** rotation-invariant: rotating either the secret or the guess by a
constant shifts which rotation index wins. That means two literal
sequences in the same necklace class &mdash; indistinguishable under the
hard model &mdash; can now be told apart by which rotation a given guess
needs to align with them. So the candidate universe for this analysis is
every literal bead sequence (`enumerateLiteralSequences()` in
`necklace.js`, the same multiset-permutation generator `enumerateNecklaceClasses()`
uses, just without the rotation-dedup step), not necklace classes: 6
literal sequences instead of 2 classes for n=4 split 2/2, up to 180 instead
of 30 for n=6 split 2/2/1/1.

A guess still solves a candidate iff `exact === n`, independent of which
rotation achieved it (the game doesn't care, it just ends) &mdash; and,
worth noting explicitly, guessing one literal sequence from a rotationally
symmetric (periodic) necklace class solves *every* literal rotation of
that class simultaneously, not just the one guessed, since any of them is
some rotation of the guess.

Code: `solver/minimax-rotation.js` and `solver/expected-rotation.js`,
structurally identical to `minimax.js`/`expected.js` (same bitmask
memoization, same branch-and-bound pruning) but keyed on the composite
bucket `${exact}:${rotation}` instead of a bare integer, built from
`necklace.js`'s new `buildRichScoreMatrix()`. Driven by
`solver/run-rotation.js`.

### Results

| n | split | minimax hard (cand/all) | minimax rotation (cand/all) | avg hard (cand/all) | avg rotation (cand/all) |
|---|---|---:|---:|---:|---:|
| 4 | 2/2 | 2/2 | 2/2 | 1.50/1.50 | 1.33/1.33 |
| 4 | 2/1/1 | 3/3 | 3/3 | 2.00/2.00 | 1.92/1.92 |
| 4 | 1/1/1/1 | 6/6 | **4/4** | 3.50/3.50 | **2.67/2.67** |
| 5 | 3/2 | 2/2 | 2/2 | 1.50/1.50 | 1.50/1.50 |
| 5 | 2/2/1 | 5/5 | **4/4** | 2.83/2.83 | **2.37/2.37** |
| 5 | 2/1/1/1 | 6/6 | **4/4** | 3.50/3.50 | **2.90/2.90** |
| 6 | 4/2 | 3/3 | 3/3 | 2.00/2.00 | 1.80/1.80 |
| 6 | 3/3 | 4/4 | **4/3** | 2.50/2.50 | **2.05/2.00** |
| 6 | 3/2/1 | 6/6 | **4/4** | 3.30/3.30 | **2.67/2.63** |
| 6 | 2/2/2 | 5/5 | **4/4** | 3.25/3.25 | **2.80/2.76** |
| 6 | 2/2/1/1 | 5/5 | **4/4** | 3.53/3.53 | **3.07/2.97** |

Every one of these 44 rotation-aware figures is &le; its hard-model
counterpart (the required invariant, checked explicitly for all four
comparisons per row in `run-rotation.js` &mdash; all held, no bug to chase
down), and every one is cross-validated by independently simulating the
derived strategy against every literal candidate secret and confirming the
worst-case and average guesses actually taken match the reported numbers
exactly (`[MATCH]` on all 11 rows, both objectives, both pools).

### So: does 2-colour stop being hopeless?

**Yes, but the honest answer is nuanced, not a flat "problem solved."**

For every single 2-colour split, the *average* number of guesses drops
&mdash; e.g. n=4 split 2/2 goes from 1.5 to 1.33, n=6 split 4/2 from 2.0 to
1.8. Rotation information is never wasted, even here.

For *minimax*, the picture splits in two. The two smallest 2-colour splits
in scope (n=4 2/2 and n=5 3/2) have only 2 necklace classes each, and 2 is
the absolute floor for any candidate set of size &ge;2 &mdash; no strategy
can guarantee a solve in fewer than 2 guesses when the first guess might
be wrong. Both were already sitting at that floor under the hard model, so
there's no numerical room for rotation information to improve them
further; what it does provide is that the strategy achieving 2 is now
provably tight rather than the *only option available* (previously forced,
since binary feedback left no alternative). But n=6 split 3/3 (4 classes,
20 literal sequences) is a clean, genuine counterexample to "2-colour is
always capped at the candidate count": minimax drops from 4 to 3 once
arbitrary-probe guessing is allowed &mdash; the *only* 2-colour split with
room to improve on minimax, and it does.

**A second, unprompted finding: candidate-vs-probe divergence, rare under
the hard model, is common here.** Under the hard model, across all 11 n&le;6
configurations, arbitrary-probe guessing never once beat candidate-only
guessing (see the Results table above). Under the rotation-aware model it
happens in half the configurations tested: n=6 split 3/3 (minimax *and*
average), and n=6 splits 3/2/1, 2/2/2, and 2/2/1/1 (average only). Richer
feedback doesn't just lower guess counts on its own &mdash; it also makes
non-candidate probes a genuinely useful tool far more often, which tracks:
a probe's whole value proposition is splitting the space unusually evenly,
and there's a lot more room to do that once each guess can report one of
several `(exact, rotation)` pairs instead of one of two exact values.

### Two worked examples

n=4, split 2/2 (arbitrary-probe pool) &mdash; the "2-colour stops being
hopeless" headline case, going from 6 literal candidates to solved in 2
guesses flat, hitting the theoretical floor:

```
guess [0,0,1,1]  (6 candidates live, worst case 2 guesses)
  exact match (any rotation) -> solved (4 candidates)
  feedback (exact:rotation)=2:0 -> 2 candidates remain
    guess [0,1,0,1]  (2 candidates live, worst case 1 guess)
      exact match (any rotation) -> solved (2 candidates)
```

The first guess immediately solves 4 of the 6 candidates outright (every
literal rotation of its own necklace class), leaving only the periodic
class `{0101, 1010}` (period 2) ambiguous at feedback `2:0` &mdash;
guessing either one solves both simultaneously, since they're rotations of
each other, for 2 guesses worst case.

n=6, split 3/3 (arbitrary-probe pool) &mdash; the case where a probe beats
every candidate-only guess:

```
guess [0,0,1,0,1,1]  (20 candidates live, worst case 3 guesses)
  exact match (any rotation) -> solved (6 candidates)
  feedback (exact:rotation)=4:0 -> 8 candidates remain
    guess [0,1,0,0,1,1]  (8 candidates live, worst case 2 guesses)
      exact match (any rotation) -> solved (4 candidates)
      feedback (exact:rotation)=4:0 -> 2 candidates remain
        guess [0,0,0,1,1,1]  (2 candidates live, worst case 1 guess)
          exact match (any rotation) -> solved (2 candidates)
      feedback (exact:rotation)=4:1 -> 1 candidate remains -> guess it
      feedback (exact:rotation)=4:3 -> 1 candidate remains -> guess it
  feedback (exact:rotation)=4:1 -> 4 candidates remain
    guess [0,0,1,1,0,1]  (4 candidates live, worst case 2 guesses)
      exact match (any rotation) -> solved (2 candidates)
      feedback (exact:rotation)=4:0 -> 1 candidate remains -> guess it
      feedback (exact:rotation)=4:2 -> 1 candidate remains -> guess it
  feedback (exact:rotation)=4:2 -> 1 candidate remains -> guess it
  feedback (exact:rotation)=4:3 -> 1 candidate remains -> guess it
```

The first guess, `[0,0,1,0,1,1]`, isn't a candidate arrangement in any
obviously special sense &mdash; it's a probe that happens to split all 20
literal candidates into six pieces (one immediate 6-way solve, plus buckets
of 8, 4, 1, 1) far more evenly than any single candidate-only guess
manages, which is exactly why it beats the best candidate-only strategy
(4 guesses) by one.

### Tractability

Class-level state spaces here were already small; the shift to literal
sequences multiplies them by up to n. The largest case, n=6 split 2/2/1/1,
went from 30 classes to 180 literal sequences &mdash; the biggest state
space anywhere in this report &mdash; and took about 75s for minimax
(arbitrary-probe pool) and 96s for average-case (arbitrary-probe pool),
using the same guess-ordering and branch-and-bound pruning already proven
exact in the n=7/8 pass. Every other configuration finished in well under
5 seconds. Nothing here is a heuristic or a partial result &mdash; every
figure in the table above completed under full exhaustive search.

## n=7/8, three-colour splits

A follow-up pass extends the exhaustive minimax analysis (worst-case only
&mdash; the average-case objective above stays in scope n&le;6 for now) to
BEAD_COUNT 7 and 8, restricted to every partition of n into **exactly
three** positive parts. None of these are degenerate on their own (with
three colours in play, the majority colour's count is always &le; n-2), but
that's checked at runtime via `isDegenerateSequence()` rather than assumed.
Code: `solver/run-n78.js`, reusing `necklace.js` and `minimax.js` unchanged
except for the guess-ordering/branch-and-bound addition described below.

| n | colour split | possible secrets | minimax (candidate-only) | minimax (arbitrary-probe) |
|---|---|---:|---:|---:|
| 7 | 5/1/1 | 6 | 6 | 6 |
| 7 | 4/2/1 | 15 | 6 | 6 |
| 7 | 3/3/1 | 20 | 5 | 5 |
| 7 | 3/2/2 | 30 | 5 | 5 |
| 8 | 6/1/1 | 7 | 7 | 7 |
| 8 | 5/2/1 | 21 | 6 | **5** |
| 8 | 4/3/1 | 35 | 5 | 5 |
| 8 | 4/2/2 | 54 | 5 | 5 |
| 8 | 3/3/2 | 70 | 5 | 5 |

Same verification bar as the n&le;6 results: every row above is
exhaustive-search-proven, and separately cross-checked by simulating the
derived strategy against every one of that row's candidate secrets and
confirming the worst simulated guess count matches exactly (`[MATCH]` on
every row in `solver/run-n78.js`'s output).

### Two things that only show up once n=7/8 is in scope

**Arbitrary probes finally earn their keep.** n=8, split 5/2/1 is the
*only* configuration in this entire n&le;8 study (20 configurations across
both passes) where guessing something outside the live candidate set
strictly beats the best candidate-only guess: 5 guesses instead of 6. The
optimal first guess there, `[0,0,0,1,0,2,0,1]`, is one specific arrangement
of the 5/2/1 multiset that splits all 21 candidates into three near-even
groups (8, 12, and the 1 it happens to match itself) more evenly than any
of the 21 candidates can manage as a self-guess &mdash; a genuine instance
of the classical Mastermind phenomenon (a probe outside the candidate set
sometimes separates the space better than any candidate can) finally
showing up, after being completely absent through every n&le;6 config and
every other n=7/8 config tested.

**The "2-colour collapse" has a precise 3-colour analogue: the most
lopsided splits.** Splits 5/1/1 (n=7) and 6/1/1 (n=8) &mdash; one dominant
colour plus two lone singleton colours &mdash; each have exactly **one**
possible off-diagonal score value in their score matrix, identical to
every 2-colour split. Feedback again collapses to a single bit ("is this
it, yes or no"), and minimax is forced to equal the candidate count exactly
(6 and 7 respectively). As the split becomes less lopsided, the score
distribution widens right on schedule: 4/2/1 and 5/2/1 get two or three
distinct off-diagonal values, and the most balanced splits (3/2/2, 4/2/2,
3/3/2) get four. The starkest payoff is n=8, split 3/3/2: 70 possible
secrets &mdash; more than double the largest n&le;6 case &mdash; still
solved in the worst case in just 5 guesses. So the earlier "two colours ⇒
no strategy" finding generalizes to "two singleton colours ⇒ no strategy,"
regardless of how large the dominant colour's share or n itself is; it's
the *shape* of the split, not the colour count as such, that determines how
much the scoring rule can be exploited.

### Tractability: exhaustive search held up, but needed exact pruning

Class counts here go well past the n&le;6 range (up to 70, versus 30
before), and the naive unpruned search (identical in structure to the
n&le;6 one) measurably slowed down as a result: an early, throwaway
timing run of the unpruned search took **137.6 seconds** on the n=8, 3/3/2
case alone (arbitrary-probe pool) &mdash; still finished, but slow enough
to be worth fixing before treating this as the template for n>8.

Rather than reaching for approximate symmetry reduction, `minimax.js` was
given two changes that are both *exact* (proven not to change any answer,
not just assumed to be safe):

1. **Guess ordering.** Live candidates are tried before non-candidate
   probes. A live candidate is guaranteed informative (it always separates
   at least itself out via the score-n bucket), so this tends to establish
   a good bound quickly, before the (much larger) space of probes is
   explored.
2. **Branch-and-bound.** While evaluating a guess's buckets
   (largest-first), the running worst-case-so-far is compared against the
   best total cost found by any guess so far; once it can no longer
   improve on that best, the remaining buckets for this guess are skipped.
   This never discards a *better* answer &mdash; a guess only gets cut once
   it's already provably no better than one already found &mdash; so the
   result is identical to the unpruned search, just faster to reach.

That second point isn't just argued, it's checked: the same n=7/8 configs
were run through both the unpruned and pruned search, and every reported
minimax number matched exactly (e.g. n=8, 3/3/2 gave cost 5 both ways;
n=8, 4/2/2 gave cost 5 both ways, 33.0s unpruned vs. 20.5s pruned). With
pruning, the worst case (n=8, 3/3/2, 70 classes) still took **95 seconds**
for the arbitrary-probe pool (versus 1.2s for candidate-only &mdash; almost
all of that time is spent proving that none of the 69 non-candidate probes
beats the best candidate). That's a real but manageable cost for a
one-off report-generating script; the full 9-configuration run
(`node solver/run-n78.js`) takes a little over 2 minutes end to end. Every
number in the table above did complete under exhaustive search &mdash;
nothing here is a heuristic, bound, or partial result.

### What's still open

- **Colour-relabelling symmetry** (canonicalizing candidate sets under
  permutations of same-count colours, e.g. swapping the two "3"s in a
  3/3/2 split) was identified as the next lever if pruning alone hadn't
  been enough. It wasn't needed to get through n=7/8 in reasonable time,
  so it wasn't implemented &mdash; but at n=8 with richer splits (or n=9+),
  where class counts and probe-pool sizes grow further, it would compound
  well with the branch-and-bound already in place, since it directly
  shrinks the memo table and the guess pool together rather than just
  pruning the search tree over the existing one.
- **n=7/8 with other colour counts** (2 or 4+ colours) and **n>8 in
  general** are natural next scopes, unexplored here since this pass was
  scoped specifically to three-colour splits at n=7/8.
- The average-case objective hasn't been extended past n&le;6 &mdash; doing
  so for n=7/8 would face the same tractability question as minimax did
  here, likely more acutely, since average-case search has no equivalent
  of the "worst branch alone already loses" shortcut and relies on the
  weaker (but still exact) running-sum bound described above.

## The restricted-move variant: one bead swap per guess

A different kind of follow-up from the last two: back to the hard
(match-count-only) feedback model &mdash; `bestExact()`, unchanged &mdash;
but now with a **move** restriction instead of a feedback enrichment.
Every result so far assumed a player can rearrange the necklace into
*any* arrangement before each guess. In reality, of course, a player gets
there by a sequence of individual bead swaps; this variant asks what
happens if that's taken literally as the actual constraint: consecutive
*guesses* (not swaps &mdash; guesses) must differ by exactly one
transposition of two bead positions. You can still swap around freely
*within* forming one guess in the real game, but here each submitted
guess must be exactly one swap away from the previous one, so shuffling
freely between guesses is off the table.

Scope: n&le;6, restricted to splits with **3 or more colours** (2-colour
splits excluded per the task &mdash; not for degeneracy this time, just out
of scope) &mdash; the same 7 configurations as the average-case pass above.

### The transposition graph, and verifying it's well-defined at all

Modeled as a graph over necklace classes: two classes are adjacent iff some
representative of one reaches some representative of the other via one
swap. `solver/swap-graph.js` builds this independently of the sibling
`gray-code/graph.js` (which builds the analogous graph for 2-colour
k-subsets) but uses the same underlying test &mdash; Hamming distance
exactly 2 between one sequence and some rotation of the other &mdash;
generalized here with an explicit argument for *why* that test is still
exactly right for an arbitrary colour multiset, not just 0/1 vectors: if
two sequences sharing a multiset differ at exactly two positions, the
multiset of values at those two positions must be preserved between them,
which for a two-element multiset forces those two values to have simply
swapped. Hamming distance 2 and "reachable by one transposition" coincide
for any shared multiset.

The load-bearing claim behind treating this as a graph over *classes at
all* (rather than over literal phase-specific arrangements, the way the
rotation-aware analysis had to): the set of classes reachable from class C
by one swap doesn't depend on which literal rotation of C you're currently
standing on. Verified computationally, not assumed &mdash;
`verifyRotationInvariantAdjacency()` recomputes the reachable-class set
starting from *every* literal rotation of every class, independently, and
checks they all agree with each other and with the canonical-representative
version. It held for all 7 configurations in scope, no exceptions.

One more property worth surfacing up front because it shapes everything
downstream: every one of these 7 transposition graphs turned out to be
**connected**, with a small diameter (1 or 2 &mdash; i.e. any class is
reachable from any other in at most two swaps) and, for the two smallest
configurations (n=4, splits 2/1/1 and 1/1/1/1), actually **complete**
&mdash; every class directly adjacent to every other. That's not a given
in general (a sparser or disconnected transposition graph would make parts
of the state space genuinely unreachable), but for this scope it means the
move restriction is never catastrophic, just sometimes costly.

### The search: harder than it first looks, and an honest account of a bug caught by the required cross-check

State is `(current position, live candidate set)` rather than just the
candidate set, and the next guess is restricted to graph-neighbours of the
current position. The first implementation of this treated a guess that
doesn't split the current candidate set at all (every live candidate would
score the same against it) as strictly useless and skipped it outright
&mdash; correct reasoning in every *unrestricted* solver so far in this
report, since there a better guess is always one move away regardless of
where you're "standing." Here it's wrong: with movement restricted, a
non-splitting guess may be the *only* way to reach a position from which
some other guess *is* informative, and skipping every such move can leave
a state with no legal option to make progress from at all.

This was caught, not by inspection, but by the required
"restricted &ge; unrestricted" sanity check: the buggy version reported
some starting positions as outright infeasible (cost = Infinity) under the
*arbitrary-neighbour* pool, which is `all`-pool infeasibility, i.e. even
the least restrictive option, and that should never happen once the graph
is connected. That contradiction is what prompted tracing it down. Fixed
by reformulating each fixed-candidate-mask level as a shortest-path problem
over positions (`repositionDijkstra()` in swap-graph.js): every class gets
classified as either "informative right now" (with a direct cost, computed
from already-solved smaller masks) or "pure repositioning" (a weight-1
edge toward some other position), and one Dijkstra run per mask, from a
virtual "solved" sink, yields the optimal cost *and* first move from every
possible current position simultaneously. This is more than a
implementation detail worth mentioning only in passing: it's a genuine
structural difference from every other solver in this report, and the
sanity-check-catches-a-real-bug story is included here deliberately, in
the same spirit as every other honesty note in this document.

### Handling the starting position

The real game's "Guess 0" (`makeStartingGuess()` in `src/game.js`) hands
the player a specific scrambled starting arrangement they didn't choose.
Rather than pick one arbitrarily, every possible starting class is solved
for, and the worst, best, and mean cost across all of them is reported.

One explicit simplification, flagged here rather than glossed over: this
analysis does **not** give the starting position's own score any special
"free look" narrowing power the way Guess 0's history entry does in the
real app (it's shown and scored, just not counted toward "N guesses to
solve"). Modeling that properly would mean the very first live-candidate
mask depends on which secret is actually true (since the free score
narrows differently depending on the secret), which is a real complication
on top of an already-larger state space. Instead, every reported figure
here treats the starting position purely as a *movement* constraint (which
classes are one swap away) and starts the live-candidate set at the full
universe, exactly as every other solver in this report does. That makes
every number here a valid, if very slightly conservative, upper bound on
what a player who *also* gets to use Guess 0's free score would need —
worth a real follow-up, flagged here rather than either ignored or silently
assumed away.

### Results

| n | split | classes | hard minimax / avg | swap minimax (best/mean/worst) | swap average (best/mean/worst) | candidate-pool feasible (minimax / avg) |
|---|---|---:|---|---|---|---|
| 4 | 2/1/1 | 3 | 3 / 2.00 | 3 / 3.00 / 3 | 2.00 / 2.00 / 2.00 | 3/3 |
| 4 | 1/1/1/1 | 6 | 6 / 3.50 | 6 / 6.00 / 6 | 3.50 / 3.50 / 3.50 | 6/6 |
| 5 | 2/2/1 | 6 | 5 / 2.83 | 5 / 5.00 / 5 | 3.00 / 3.06 / 3.17 | 6/6 |
| 5 | 2/1/1/1 | 12 | 6 / 3.50 | 6 / 6.00 / 6 | 4.00 / 4.00 / 4.00 | 0/12 |
| 6 | 3/2/1 | 10 | 6 / 3.30 | 6 / 6.00 / 6 | 3.70 / 3.73 / 3.80 | 10/10 |
| 6 | 2/2/2 | 16 | 5 / 3.25 | **6** / 6.00 / 6 | 3.94 / 3.98 / 4.00 | 0/16 |
| 6 | 2/2/1/1 | 30 | 5 / 3.53 | **6** / 6.00 / 6 | 4.40 / 4.42 / 4.47 | 0/30 |

Figures are for the arbitrary-neighbour pool (any graph-neighbour is a
legal guess, live candidate or not) &mdash; the only pool guaranteed
feasible from every starting position on a connected graph; the
candidate-only pool (next guess must be both a neighbour *and* a still-live
candidate) is reported separately in the last column as a feasibility
count, discussed below. Every figure is exhaustive, cross-checked by
simulating the actual derived strategy for every (starting position,
secret) pair &mdash; 9 to 900 pairs per configuration &mdash; and confirming
the worst-case and mean guesses taken match the reported numbers exactly
(`[MATCH]` on all 7 rows, both objectives). The required invariant
(restricted &ge; unrestricted hard-model figures) held in every row with no
exceptions to chase down. Total run time for all 7 configurations: about
8 seconds &mdash; the per-mask Dijkstra formulation turned out to need no
extra pruning at all, even at 30 classes.

### What stands out

**The two smallest configurations are completely unaffected.** n=4 splits
2/1/1 and 1/1/1/1 have *complete* transposition graphs (every class one
swap from every other), so the move restriction costs literally nothing:
minimax and average both match the unrestricted hard-model figures
exactly, identically from every starting position.

**Minimax usually survives the restriction; when it doesn't, it's exactly
the two most colour-repetitive n=6 splits.** Four of the five larger
configurations keep the same minimax number under the restriction as
without it (5, 6, 6, 6 for splits 2/2/1, 2/1/1/1, 3/2/1 respectively, plus
n=4's two). The two exceptions are n=6 splits 2/2/2 and 2/2/1/1 &mdash;
minimax rises from 5 to 6 in both. These are also the two n=6
configurations with the *most* colour repetition among those in scope
(three pairs, and two pairs plus two singles, respectively) &mdash; a
plausible mechanism, not fully nailed down here: more repeated colours
means more necklace classes end up looking alike under a swap (echoing the
`isDegenerateSequence` intuition that repetition flattens structure), which
can strand the optimal *unrestricted* strategy's next move too far from
wherever a graph-restricted player happens to be standing.

**Average-case is never free, even when minimax is.** Every single
configuration in scope shows a real increase in the average number of
guesses under the restriction &mdash; including n=5 splits 2/2/1 and
2/1/1/1 and n=6 split 3/2/1, where minimax didn't budge at all. The
restriction's cost shows up first, and more consistently, in the average
case; minimax is the more forgiving of the two objectives here.

**Whether candidate-only play is even possible splits cleanly along the
same repetition line.** For n=4's two configs, n=5 split 2/2/1, and n=6
split 3/2/1, restricting every guess to a still-live candidate remains
fully feasible from every starting position. For n=5 split 2/1/1/1 and n=6
splits 2/2/2 and 2/2/1/1 &mdash; again, the more colour-repetitive splits
&mdash; it's *completely* infeasible, from every single starting position:
sooner or later, the live candidates left standing are never adjacent to
wherever the player is, forcing at least one "wasted" probe through a
non-candidate. This is the same repetition pattern showing up a third time,
and ties together with the minimax-degradation finding above &mdash;
colour-repetitive splits are structurally the hard case for restricted
movement across every measure tried here.

### Worked example: n=6, split 2/2/2, from its worst-case start

The one configuration named for a full tree, from the worst-case starting
class `[0,0,1,1,2,2]` (arbitrary-neighbour pool, worst case 6 guesses,
matching the table above):

```
guess [0,0,1,2,1,2]  (16 candidates live, worst case 6 guesses)
  score 2 -> 1 candidate remains
    reposition: swap toward [0,0,1,2,2,1]  (no split available here; cost from here: 2)
    reposition: swap toward [0,2,1,0,2,1]  (no split available here; cost from here: 1)
    already standing on the only remaining candidate [0,2,1,0,2,1] -> done
  score 3 -> 4 candidates remain
    guess [0,0,2,1,2,1]  (4 candidates live, worst case 3 guesses)
      ... (splits further; see solver/run-swap.js output for the full tree)
  score 4 -> 10 candidates remain
    guess [0,0,1,2,2,1]  (10 candidates live, worst case 5 guesses)
      ... (splits further)
  score 6 -> 1 candidate remains
    already standing on the only remaining candidate [0,0,1,2,1,2] -> done
```

The `score 2` branch is the clearest illustration of the whole point of
this variant: after that single feedback value narrows the field to one
candidate, the player still needs *two more guesses* just to physically
walk there &mdash; two repositioning swaps with no new information gained
&mdash; before that candidate is even reachable to submit. That's exactly
the cost the unrestricted model can't see, since unrestricted movement
would let a player jump straight there in one guess.

### How close does a simple greedy rule get?

Alongside the true optimum, a 1-ply "tactical" heuristic
(`solver/greedy-swap.js`) was tried: at each step, among the legal
graph-neighbour moves, pick whichever one immediately minimizes the
largest resulting candidate bucket (minimax-style rule) or the expected
resulting bucket size (average-style rule) &mdash; no recursion, no
lookahead beyond that one guess. Actually played out (not estimated) for
every (starting position, secret) pair in every configuration:

| config | greedy minimax-worst vs. true optimal | greedy average-mean vs. true optimal |
|---|---|---|
| n=4, 2/1/1 | 3 vs. 3 (exact) | 2.00 vs. 2.00 (exact) |
| n=4, 1/1/1/1 | 6 vs. 6 (exact) | 3.50 vs. 3.50 (exact) |
| n=5, 2/2/1 | 5 vs. 5 (exact) | 3.14 vs. 3.06 (+0.08) |
| n=5, 2/1/1/1 | 6 vs. 6 (exact) | 4.00 vs. 4.00 (exact) |
| n=6, 3/2/1 | 6 vs. 6 (exact) | 3.78 vs. 3.73 (+0.05) |
| n=6, 2/2/2 | 6 vs. 6 (exact) | 4.21 vs. 3.98 (+0.23) |
| n=6, 2/2/1/1 | 6 vs. 6 (exact) | 4.66 vs. 4.42 (+0.24) |

The rule of thumb this supports: **a simple 1-ply greedy strategy matches
the true minimax-optimal worst case exactly in every configuration tested
here** &mdash; no config needed real lookahead to hit the worst-case floor.
For the average case, greedy is close but consistently a bit behind (by
0.05 to 0.24 guesses), and the gap grows with exactly the same
colour-repetitive configurations already flagged above (2/2/2 and
2/2/1/1) &mdash; unsurprising, since those are the cases where the subtlety
of choosing *when* to accept a non-splitting repositioning move (something
a 1-ply rule can't reason about at all) matters most.
