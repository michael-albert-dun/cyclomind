# Cyclomind

A Mastermind variant played on a necklace of coloured beads instead of a row of pegs.

The secret is a cyclic sequence of bead colours (5 positions and up to 4 colours by default; both
configurable &mdash; see Settings below). Unlike classic Mastermind, you aren't choosing freely
from an unlimited palette: the necklace starts already full, holding the secret's own beads in
some scrambled (not correct) order. The puzzle is entirely about position, since the multiset of
colours is known and fixed from the start &mdash; every move just rearranges the same beads.

A guess is scored by trying every rotation of the guess against the secret and keeping whichever
rotation gives the most exact matches (right colour, right position).

> **Variant note:** this branch/version replaces the earlier "unlimited four-colour palette"
> version of Cyclomind, which is preserved as-is on the `classic-necklace` branch (and at that
> point in `main`'s history) in case it's worth wiring back in as a selectable mode later. An
> intermediate "bead box" version (drag beads in from a separate supply tray) also existed briefly
> before this pairwise-swap version replaced it.

## Current Shape

**Settings.** The gear button (top-left) opens a panel for **Positions** (4-8) and **Colours**
(2-6, a *maximum* &mdash; each position still rolls independently among the available colours, so
a given secret may end up using fewer than the maximum). Applying starts a fresh game at the new
size. A **Show colour numbers** checkbox overlays each colour's 1-based number in small type at
the centre of its beads (`makeColorNumberLabel()`, with automatic light/dark text for contrast) as
a colour-blind-friendly aid; it takes effect immediately, without starting a new game. `ALL_COLORS`
in [src/game.js](src/game.js) holds 6 colours chosen for reasonable hue separation at every prefix
length (`COLORS.slice(0, n)`), not just the full set &mdash; each is the one that maximises its hue
distance from the colours before it. Bead radius is computed from the current position count
(`beadRadiusFor()`, driven by `BEAD_GAP_FRACTION`) rather than fixed, so beads stay sensibly sized
&mdash; filling the ring without touching &mdash; whether there are 4 positions or 8.

**Shareable URL.** The position count, colour count, and secret are encoded into the query string
(`n`, `c`, `s`) on every new game, so a puzzle can be bookmarked or shared as a link that reproduces
it exactly. The secret is a byte-XOR-obfuscated, base64url-encoded digit string (`encodeSolution()`
/ `decodeSolution()`, mask from `solutionMaskByte()`) &mdash; compact and not casually readable at a
glance, but deliberately not real security. Loading a URL with an `s` param starts that exact
puzzle instead of a random one; back/forward navigation (`popstate`) restores whichever puzzle was
current at that point in history.

**Starting state.** `startGame()` generates the secret, then builds a starting guess by shuffling
a copy of it (`makeStartingGuess()`, retrying if the shuffle happens to already solve it) and
scoring that immediately as **Guess 0** &mdash; a free look at how close a random arrangement gets,
before the player does anything. The board shows it already in its scoring position (the winning
rotation), same as any submitted guess &mdash; matching the Guess 0 history tile exactly, since the
raw unrotated shuffle is never actually shown. The necklace is never empty: every position always
holds one of the secret's own beads, and every move is a swap between two necklace positions.

**Uniform secret generation.** `makeRandomNecklace()` samples uniformly over necklaces (rotation-
equivalence classes), not over raw colour strings — those aren't the same thing, since a necklace's
number of representative strings equals its minimal period, so naive per-position random sampling
drastically under-samples high-symmetry necklaces (a mono-colour necklace has exactly 1
representative out of `colourCount^n`, instead of its fair share). It builds this up from small
cached tables of colour-agnostic "shapes" (restricted growth strings) per length, rather than
re-deriving counts via Möbius arithmetic or rejection-sampling a candidate every time a game starts
&mdash; see the large comment above `makeRandomNecklace()` for the full derivation, including the
subtlety that a rotation can coincide with a colour relabelling for symmetric shapes (e.g. "every
bead a different colour") without needing any special-case handling. This also gives a clean way to
just never generate the "degenerate" necklaces that would make Guess 0 an unavoidable instant solve
(mono-colour, or all-but-one beads the same colour, each having exactly one possible arrangement)
&mdash; the length-1 shape (mono-colour) is skipped outright, and the length-n two-symbol shapes
with a lone odd-one-out are filtered specifically at full length (a smaller *repeated* block with
that same shape is fine, since tiling multiplies both colour counts, so the minority colour never
ends up appearing only once). Verified empirically (200k+ trials at a couple of settings) against
directly-enumerated ground truth: exactly the expected number of necklace classes shows up, in
close-to-uniform proportions, with zero degenerate secrets generated.

- **Number keys** (1 up to the current position count) swap the currently selected necklace spot
  with that position, then advance the selection one step clockwise.
- **Click or tap** a bead to arm it (shown with a gold ring), then click/tap a *different* bead to
  swap it with the armed one — the two beads slide to each other's spot (`animateBeadSwap()`) and
  nothing is left armed afterwards, so every swap is its own fresh pick of two beads. Click/tap the
  armed bead again to release it without swapping, e.g. to back out and arm a different starting
  bead instead (`handleBeadClick()`, `state.armed`). This is the only swap affordance for beads —
  native HTML5 drag-and-drop was tried and retired, since it never worked on touch input and its
  unstyled default drag image looked wrong even on desktop.
- **Left / Right arrow keys** move the selection around the ring; **Enter** (or the **Guess**
  button) submits the current arrangement as the next guess.

**Scoring.** See `scoreGuess()`: it rotates the guess against the fixed secret and keeps whichever
rotation gives the most exact matches. Past guesses are shown in that winning rotation, labelled
with just the exact-match count (`makeScoreCount()`) &mdash; no separate colour-only count is
shown, because in this variant it isn't real information: every guess is a rearrangement of the
secret's own beads, so the guess and secret always share the exact same multiset of colours, and
the colour-only count is therefore always exactly `BEAD_COUNT - exact`. (This is also why ties on
exact matches never need a separate tiebreak: the total matched-colour count is invariant under
rotation, so it's the same for every tied rotation — the smallest clockwise rotation among them is
the one reported.) The tile that actually solves it is highlighted green. History tiles lay out in
a fixed 3-wide grid, numbered from 0 (Guess 0 is the free starting look, not a player move —
"Solved in N guesses" doesn't count it). There's no placeholder tile for the guess in progress
&mdash; the status line's "Guess N" is the only cue for that; history only ever shows guesses that
have actually been scored.

**Submitting.** The ring spins clockwise (`animateRotation()`) through the exact number of
positions the winning rotation needed, at a constant angular rate (`ROTATION_STEP_MS` per
position, so a bigger rotation takes proportionally longer rather than being squeezed into one
fixed-length animation). The board is left showing that rotated arrangement &mdash; matching the
new history tile &mdash; ready to keep swapping for the next guess. Input is disabled for the
duration of the spin. Scoring all positions exact locks the board: further input is disabled and
the winning guess stays in place.

**Bead styling.** Each colour has its own wavy outline (bulging in and out 3&ndash;6 times) and its
own count of short highlight marks (also 3&ndash;6), both randomised once per puzzle in
`makeBeadStyles()` and held fixed for its duration &mdash; see `wavyCirclePath()` and
`appendBeadMarks()`. The small rings in the scoring history stay as plain flat circles.

**Instructions text.** The info panel's bullet list is loaded at runtime from
[HOW-TO-PLAY.md](HOW-TO-PLAY.md) (`loadHowToPlay()` in src/game.js) &mdash; a plain bullet list,
one `- ` line each, with `**bold**` supported &mdash; so it can be edited directly without
touching markup. Requires running via a local server (see below); opened as a bare `file://` page
the fetch silently no-ops and the panel is just empty.

## Run Locally

From this directory:

```sh
python3 -m http.server 4175 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4175/
```

The app is plain HTML, CSS, and JavaScript. There is no build step.

## Controls

- Click or tap a bead to arm it, then click/tap a different bead to swap them (tap the armed bead
  again to release it without swapping); or use the Left / Right arrow keys to move the selection
  around the ring.
- Press a number key to swap two necklace positions.
- Enter (or the Guess button) submits the current arrangement as a guess.
- The gear button opens Settings (positions, max colours); the + button starts a new game;
  the i button shows how to play.
