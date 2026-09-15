# Cyclomind

A Mastermind variant played on a necklace of coloured beads instead of a row of pegs.

The secret and each guess are a cyclic sequence of six bead colours (four colours to choose
from). A guess is scored by trying every rotation of the guess against the secret and keeping
whichever rotation gives the most exact matches (right colour, right position).

## Current Shape

Placing beads, submitting a guess, and scoring against the hidden necklace all work end to end.
See `scoreGuess()` in [src/game.js](src/game.js): it rotates the guess against the fixed secret
and keeps whichever rotation gives the most exact matches. The total number of matched pegs
(exact + colour-only) is invariant under rotation, so ties on exact matches are also ties on
colour-only matches &mdash; no separate tiebreak is needed, and the smallest clockwise rotation
among the tied ones is the one reported. Past guesses are shown in that winning rotation, scored
in a fixed 2x3 grid of pegs (filled top-left first, along each row): black for exact matches,
white for right colour in the wrong position, and the rest left empty. History tiles lay out in
a fixed 3-wide grid, and the upcoming tile stays empty until a full guess is submitted &mdash; it
doesn't preview beads as you place them. Scoring all six exact locks the board: further input is
disabled and the winning guess stays in place.

On the main board and in the palette, each of the four colours has its own wavy outline
(bulging in and out 3&ndash;6 times) and its own count of short highlight marks (also 3&ndash;6),
both randomised once per puzzle in `makeBeadStyles()` and held fixed for its duration &mdash; see
`wavyCirclePath()` and `appendBeadMarks()`. The small rings in the scoring history stay as plain
flat circles.

Submitting a guess doesn't clear the board: the ring spins clockwise (`animateRotation()` in
src/game.js) through the exact number of positions the winning rotation needed, at a constant
angular rate (`ROTATION_STEP_MS` per position, so a bigger rotation takes proportionally longer
rather than being squeezed into one fixed-length animation). The board is left showing that same
rotated arrangement &mdash; matching the new history tile &mdash; ready to tweak (or resubmit
as-is) for the next guess. Input is disabled for the duration of the spin.

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

- Click a bead position to select it, or use the Left / Right arrow keys to move the
  selection around the ring.
- Click a colour in the palette, or press 1-4, to fill the selected bead.
- Delete clears the selected bead.
- Enter (or the Enter button) submits a complete guess.
