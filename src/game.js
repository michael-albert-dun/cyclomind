const SVG_NS = "http://www.w3.org/2000/svg";

const MIN_BEAD_COUNT = 4;
const MAX_BEAD_COUNT = 8;
const DEFAULT_BEAD_COUNT = 6;

const MIN_COLOR_COUNT = 2;
const MAX_COLOR_COUNT = 6;
const DEFAULT_COLOR_COUNT = 4;

// Ordered so that COLORS.slice(0, n) stays reasonably well hue-spread for
// every supported colour count, not just the full set of 6: each colour is
// the one that maximises its distance from the ones before it in hue.
const ALL_COLORS = [
  { key: "orange", label: "Orange", value: "#d84b2a" },
  { key: "sky", label: "Sky", value: "#0072b2" },
  { key: "green", label: "Green", value: "#2f9e44" },
  { key: "purple", label: "Purple", value: "#b12cdd" },
  { key: "yellow", label: "Yellow", value: "#f0d84a" },
  { key: "pink", label: "Pink", value: "#d1479c" }
];

let BEAD_COUNT = DEFAULT_BEAD_COUNT;
let COLORS = ALL_COLORS.slice(0, DEFAULT_COLOR_COUNT);
// A colour-blind-friendly aid: each bead's colour number, in small type in
// its middle. Toggling this doesn't affect the puzzle, so it takes effect
// immediately rather than needing a new game.
let SHOW_COLOR_NUMBERS = false;

// Cache of generated "shapes" for makeRandomNecklace() (see below), keyed by
// length. Declared up here, ahead of the top-level startGame() call further
// down, since a `const` isn't usable until its own declaration line runs.
const SHAPE_CACHE = new Map();

const RING = { center: 110, radius: 66, cordWidth: 3.5, cordDash: 2.6 };
const MINI_RING = { center: 21, radius: 13 };
// Fraction of the gap between adjacent bead centres left as visible space
// between their edges — the rest is bead. Beads are sized from this (rather
// than a fixed radius) so they scale sensibly across the whole supported
// position-count range without ever touching, however crowded (8) or spread
// out (4) the ring is.
const BEAD_GAP_FRACTION = 0.24;

// Per-colour decorative range: each colour's wavy-outline bump count and
// highlight-mark count are randomised once per puzzle from this range.
const BEAD_STYLE_RANGE = { min: 3, max: 6 };
const BEAD_WAVE_AMPLITUDE_RATIO = 0.16;
const BEAD_MARK_INNER_RATIO = 0.32;
const BEAD_MARK_OUTER_RATIO = 0.6;

// Constant angular rate for the submit-rotation animation: total duration
// scales with the number of steps, rather than the whole spin being squeezed
// into a fixed time.
const ROTATION_STEP_MS = 400;

const state = {
  secret: [],
  guess: [],
  selectedBead: 0,
  // Whether selectedBead is "picked up" and ready to swap with the next
  // different bead tapped/clicked, as opposed to just being the keyboard
  // focus. Tapping the armed bead again releases it (armed: false) without
  // swapping, so a pointer user can back out and pick a different starting
  // bead instead of being stuck swapping against whatever was selected.
  armed: true,
  history: [],
  solved: false,
  animating: false,
  beadStyles: []
};

// Tracks an in-progress HTML5 drag: the necklace index being dragged.
let dragSource = null;

const elements = {
  board: document.querySelector("#board"),
  history: document.querySelector("#history"),
  status: document.querySelector("#status"),
  submitButton: document.querySelector("#submit-button"),
  newButton: document.querySelector("#new-button"),
  infoButton: document.querySelector("#info-button"),
  infoPanel: document.querySelector("#info-panel"),
  howToPlayList: document.querySelector("#how-to-play-list"),
  settingsButton: document.querySelector("#settings-button"),
  settingsPanel: document.querySelector("#settings-panel"),
  settingsForm: document.querySelector("#settings-form"),
  positionCountSelect: document.querySelector("#position-count-select"),
  colorCountSelect: document.querySelector("#color-count-select"),
  showNumbersCheckbox: document.querySelector("#show-numbers-checkbox")
};

elements.submitButton.addEventListener("click", submitGuess);
elements.newButton.addEventListener("click", () => startGame());
elements.infoButton.addEventListener("click", toggleInfoPanel);
elements.settingsButton.addEventListener("click", toggleSettingsPanel);
elements.settingsForm.addEventListener("submit", applySettings);
elements.showNumbersCheckbox.addEventListener("change", () => {
  SHOW_COLOR_NUMBERS = elements.showNumbersCheckbox.checked;
  render();
});
document.addEventListener("click", closePanelsFromOutside);
document.addEventListener("keydown", handleKeyDown);
window.addEventListener("popstate", () => {
  applyUrlSettings();
  startGame({ useUrlSolution: true, updateUrl: false });
});

applyUrlSettings();
startGame({ useUrlSolution: true, updateUrl: !hasUrlSolution() });
loadHowToPlay();

// The instructions live in HOW-TO-PLAY.md (plain bullet list, "- " per
// line, with **bold** support) so they're easy to edit without touching
// markup — fetched once and rendered into the info panel.
async function loadHowToPlay() {
  try {
    const response = await fetch("HOW-TO-PLAY.md");

    if (!response.ok) {
      return;
    }

    const text = await response.text();
    const items = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim());

    elements.howToPlayList.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");

      li.innerHTML = item.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      elements.howToPlayList.append(li);
    });
  } catch {
    // No local server (e.g. opened as a file:// page) — the panel just
    // stays empty; the rest of the app is unaffected.
  }
}

function startGame(options = {}) {
  const { useUrlSolution = false, updateUrl = true } = options;
  const urlSecret = useUrlSolution ? secretFromUrl() : null;

  state.secret = urlSecret || makeRandomNecklace();
  state.beadStyles = makeBeadStyles();
  state.selectedBead = 0;
  state.armed = true;
  state.solved = false;
  state.animating = false;
  dragSource = null;

  // The necklace starts full, already showing some scrambled (not correct)
  // arrangement of the secret's own beads, scored up front as "Guess 0" —
  // the player's job is to rearrange it, not build it up from nothing. It's
  // shown in its scoring position (the winning rotation) from the start,
  // same as any submitted guess — the raw, unrotated arrangement is never
  // actually seen, so there's nothing gained by not already showing it there.
  const { exact, near, rotatedGuess } = scoreGuess(makeStartingGuess());

  state.guess = [...rotatedGuess];
  state.history = [{ guess: rotatedGuess, score: { exact, near } }];
  state.solved = exact === BEAD_COUNT;

  if (updateUrl) {
    updateGameUrl();
  }

  render();
}

// --- Uniform random necklace generation -----------------------------------
//
// Sampling each position independently (uniform over the available colours)
// is *not* uniform over necklaces (rotation-equivalence classes): a
// necklace's number of representative raw strings equals its minimal
// period, so high-symmetry necklaces are drastically under-sampled relative
// to generic ones — e.g. "every bead the same colour" has exactly 1
// representative out of colourCount^n, instead of its fair share.
//
// True uniform sampling, done from small cached tables instead of Möbius
// arithmetic or rejection-sampling a candidate each time a game starts:
// for each divisor d of n, a "shape" of length d is a restricted growth
// string (RGS) — position 0 is always symbol 0, and each later position
// either repeats an earlier symbol or introduces the next unused one. This
// canonicalises away *which* colour is which (colour-relabelling) while
// keeping position structure, so it enumerates exactly the colour-agnostic
// patterns a d-bead block can have, independent of how many real colours
// are in play. Restricting to *aperiodic* shapes (minimal period exactly d,
// filtered out here) means a shape's number of raw colour-blocks, once
// tiled to fill the necklace, is genuinely rotation-generic within its own
// length. For a shape using m distinct symbols, the number of actual raw
// blocks it instantiates (given k real colours to choose from) is the
// falling factorial (k)_m = k·(k-1)···(k-m+1) — one per injective colour
// assignment. Weighting each shape by (k)_m / d and picking one at random,
// then filling in a random injective colour assignment, produces a
// uniformly random raw block of length d among ALL of them — which, since
// every such block has exactly d rotations, is exactly the same as
// uniformly sampling a necklace of period d. (A shape like "every symbol
// distinct" has fewer than d canonical rotations, because some rotation of
// it is indistinguishable from a colour relabelling — but (k)_m / d handles
// this automatically: it's a statement about how many raw blocks the whole
// shape stands for, not about any single one of its rotations, so no
// special-casing is needed for the symmetric cases.)
//
// This also gives us a clean way to just never generate the "degenerate"
// necklaces that make Guess 0 an unavoidable instant solve (every bead the
// same colour, or all-but-one): "every bead the same" is exactly the d=1
// shape, which is skipped outright below; "all but one" only arises from a
// length-n shape using 2 symbols where one appears just once, filtered out
// specifically at d = n (a smaller, *repeated* block with that same 2-symbol
// shape is fine — tiling multiplies both counts, so the minority colour
// never ends up appearing only once unless there's no repetition at all).
function makeRandomNecklace() {
  const candidates = [];

  divisorsOf(BEAD_COUNT).forEach((length) => {
    if (length === 1) {
      return;
    }

    shapesOfLength(length).forEach((shape) => {
      const symbolCount = 1 + Math.max(...shape);

      if (symbolCount > COLORS.length) {
        return;
      }

      if (length === BEAD_COUNT && isAllButOneShape(shape)) {
        return;
      }

      candidates.push({
        shape,
        length,
        weight: fallingFactorial(COLORS.length, symbolCount) / length
      });
    });
  });

  const chosen = pickWeighted(candidates);
  const symbolCount = 1 + Math.max(...chosen.shape);
  const colorAssignment = shuffledCopy(Array.from({ length: COLORS.length }, (_, i) => i))
    .slice(0, symbolCount);
  const block = chosen.shape.map((symbol) => colorAssignment[symbol]);

  return Array.from({ length: BEAD_COUNT }, (_, index) => block[index % chosen.length]);
}

function divisorsOf(n) {
  const divisors = [];

  for (let d = 1; d <= n; d += 1) {
    if (n % d === 0) {
      divisors.push(d);
    }
  }

  return divisors;
}

// All canonical (colour-relabelling-agnostic) aperiodic shapes of a given
// length, generated once and cached — trivial at our sizes (length ≤ 8).
function shapesOfLength(length) {
  if (SHAPE_CACHE.has(length)) {
    return SHAPE_CACHE.get(length);
  }

  const shapes = [];
  const current = new Array(length);

  const build = (position, maxUsed) => {
    if (position === length) {
      if (isAperiodicShape(current, length)) {
        shapes.push([...current]);
      }
      return;
    }

    for (let symbol = 0; symbol <= maxUsed + 1; symbol += 1) {
      current[position] = symbol;
      build(position + 1, Math.max(maxUsed, symbol));
    }
  };

  build(0, -1);
  SHAPE_CACHE.set(length, shapes);
  return shapes;
}

function isAperiodicShape(shape, length) {
  for (let period = 1; period < length; period += 1) {
    if (length % period !== 0) {
      continue;
    }

    let periodic = true;

    for (let i = period; i < length; i += 1) {
      if (shape[i] !== shape[i - period]) {
        periodic = false;
        break;
      }
    }

    if (periodic) {
      return false;
    }
  }

  return true;
}

// True for a length-n shape that uses exactly 2 symbols where one of them
// appears only once (i.e. "all beads but one the same colour").
function isAllButOneShape(shape) {
  if (1 + Math.max(...shape) !== 2) {
    return false;
  }

  const symbol1Count = shape.filter((symbol) => symbol === 1).length;

  return symbol1Count === 1 || symbol1Count === shape.length - 1;
}

function fallingFactorial(k, m) {
  let result = 1;

  for (let i = 0; i < m; i += 1) {
    result *= k - i;
  }

  return result;
}

function pickWeighted(candidates) {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = Math.random() * total;

  for (const candidate of candidates) {
    roll -= candidate.weight;

    if (roll <= 0) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

// A random permutation of the secret's own beads that isn't (under any
// rotation) already the answer. Retries a bounded number of times — with a
// very repetitive secret (e.g. most beads the same colour) every shuffle
// might coincidentally solve it, so this can't be guaranteed, only made rare.
function makeStartingGuess() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = shuffledCopy(state.secret);

    if (scoreGuess(candidate).exact < BEAD_COUNT) {
      return candidate;
    }
  }

  return shuffledCopy(state.secret);
}

function shuffledCopy(beads) {
  const copy = [...beads];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);

    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

// Each colour gets its own wavy-outline bump count and highlight-mark count,
// randomised once when the puzzle is built and held fixed for its duration.
function makeBeadStyles() {
  return COLORS.map(() => ({
    waveCount: randomInt(BEAD_STYLE_RANGE.min, BEAD_STYLE_RANGE.max),
    markCount: randomInt(BEAD_STYLE_RANGE.min, BEAD_STYLE_RANGE.max)
  }));
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// --- Settings panel -------------------------------------------------------

function toggleSettingsPanel(event) {
  event.stopPropagation();

  const isOpen = !elements.settingsPanel.hidden;

  closeInfoPanel();

  if (!isOpen) {
    syncSettingsControls();
  }

  elements.settingsPanel.hidden = isOpen;
  elements.settingsButton.setAttribute("aria-expanded", String(!isOpen));
}

function syncSettingsControls() {
  elements.positionCountSelect.value = String(BEAD_COUNT);
  elements.colorCountSelect.value = String(COLORS.length);
  elements.showNumbersCheckbox.checked = SHOW_COLOR_NUMBERS;
}

function applySettings(event) {
  event.preventDefault();

  BEAD_COUNT = parseBeadCount(elements.positionCountSelect.value);
  COLORS = ALL_COLORS.slice(0, parseColorCount(elements.colorCountSelect.value));
  closeSettingsPanel();
  startGame();
}

function closeSettingsPanel() {
  elements.settingsPanel.hidden = true;
  elements.settingsButton.setAttribute("aria-expanded", "false");
}

// --- Info panel -------------------------------------------------------

function toggleInfoPanel(event) {
  event.stopPropagation();

  const isOpen = !elements.infoPanel.hidden;

  closeSettingsPanel();

  elements.infoPanel.hidden = isOpen;
  elements.infoButton.setAttribute("aria-expanded", String(!isOpen));
}

function closeInfoPanel() {
  elements.infoPanel.hidden = true;
  elements.infoButton.setAttribute("aria-expanded", "false");
}

function closePanelsFromOutside(event) {
  if (
    !elements.infoPanel.hidden &&
    !elements.infoPanel.contains(event.target) &&
    !elements.infoButton.contains(event.target)
  ) {
    closeInfoPanel();
  }

  if (
    !elements.settingsPanel.hidden &&
    !elements.settingsPanel.contains(event.target) &&
    !elements.settingsButton.contains(event.target)
  ) {
    closeSettingsPanel();
  }
}

// --- URL configuration + solution -----------------------------------------
//
// The puzzle's position count, colour count, and secret are encoded into the
// URL query string so a puzzle can be shared/bookmarked: `n` and `c` are
// plain numbers, `s` is the secret as a digit string, byte-XORed against a
// PRNG-ish mask (seeded from n/c/index) and base64url-encoded — compact, and
// enough to keep it from being trivially readable at a glance, but this is
// deliberately lightweight obfuscation, not security.

function applyUrlSettings() {
  const params = new URLSearchParams(window.location.search);

  BEAD_COUNT = parseBeadCount(params.get("n"));
  COLORS = ALL_COLORS.slice(0, parseColorCount(params.get("c")));
}

function parseBeadCount(value) {
  const count = Number(value);

  if (Number.isInteger(count) && count >= MIN_BEAD_COUNT && count <= MAX_BEAD_COUNT) {
    return count;
  }

  return DEFAULT_BEAD_COUNT;
}

function parseColorCount(value) {
  const count = Number(value);

  if (Number.isInteger(count) && count >= MIN_COLOR_COUNT && count <= MAX_COLOR_COUNT) {
    return count;
  }

  return DEFAULT_COLOR_COUNT;
}

function hasUrlSolution() {
  return new URLSearchParams(window.location.search).has("s");
}

function secretFromUrl() {
  const encoded = new URLSearchParams(window.location.search).get("s");
  const secret = decodeSolution(encoded);

  if (secret && secret.length === BEAD_COUNT && secret.every((colorIndex) => colorIndex < COLORS.length)) {
    return secret;
  }

  return null;
}

function updateGameUrl() {
  const params = new URLSearchParams(window.location.search);

  params.set("n", String(BEAD_COUNT));
  params.set("c", String(COLORS.length));
  params.set("s", encodeSolution(state.secret));
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

function encodeSolution(secret) {
  const digits = secret.join("");
  const bytes = Array.from(digits, (digit, index) =>
    digit.charCodeAt(0) ^ solutionMaskByte(index)
  );

  return binaryToBase64Url(String.fromCharCode(...bytes));
}

function decodeSolution(encoded) {
  if (!encoded) {
    return null;
  }

  try {
    const binary = base64UrlToBinary(encoded);
    const digits = Array.from(binary, (char, index) =>
      String.fromCharCode(char.charCodeAt(0) ^ solutionMaskByte(index))
    ).join("");

    if (!/^\d+$/.test(digits)) {
      return null;
    }

    return Array.from(digits, Number);
  } catch {
    return null;
  }
}

function solutionMaskByte(index) {
  let value = (BEAD_COUNT * 73) ^ (COLORS.length * 151) ^ (index * 37) ^ 0x5a;

  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value & 0xff;
}

function binaryToBase64Url(binary) {
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBinary(encoded) {
  const base64 = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");

  return atob(base64);
}

// --- Rendering --------------------------------------------------------

function render() {
  renderBoard();
  renderHistory();
  renderStatus();
}

function renderBoard() {
  elements.board.classList.toggle("is-solved", state.solved);
  elements.board.innerHTML = "";
  elements.board.append(makeCordTrack(RING, "ring-track"));

  for (let index = 0; index < BEAD_COUNT; index += 1) {
    elements.board.append(makeBeadCell(index));
  }
}

function makeRingTrack(ring, className) {
  const circle = document.createElementNS(SVG_NS, "circle");

  circle.setAttribute("class", className);
  circle.setAttribute("cx", String(ring.center));
  circle.setAttribute("cy", String(ring.center));
  circle.setAttribute("r", String(ring.radius));
  return circle;
}

// A two-strand "twisted twine" look for the necklace's cord: two circles in
// different warm cord tones, with complementary dash patterns (one strand's
// gaps line up with the other's dashes), so it reads as a twisted string
// rather than a plain dashed line. Drawn (and appended) before the beads, so
// it's still fully hidden behind them.
function makeCordTrack(ring, className) {
  const group = document.createElementNS(SVG_NS, "g");
  const strandA = document.createElementNS(SVG_NS, "circle");
  const strandB = document.createElementNS(SVG_NS, "circle");

  [strandA, strandB].forEach((strand) => {
    strand.setAttribute("class", "ring-cord");
    strand.setAttribute("cx", String(ring.center));
    strand.setAttribute("cy", String(ring.center));
    strand.setAttribute("r", String(ring.radius));
    strand.setAttribute("stroke-width", String(ring.cordWidth));
    strand.setAttribute("stroke-dasharray", `${ring.cordDash} ${ring.cordDash}`);
  });

  strandA.classList.add("ring-cord-a");
  strandB.classList.add("ring-cord-b");
  strandB.setAttribute("stroke-dashoffset", String(ring.cordDash));

  group.setAttribute("class", className);
  group.append(strandA, strandB);
  return group;
}

function beadPosition(index, ring) {
  const angle = (index * 360) / BEAD_COUNT - 90;
  const radians = (angle * Math.PI) / 180;

  return {
    x: ring.center + ring.radius * Math.cos(radians),
    y: ring.center + ring.radius * Math.sin(radians)
  };
}

// Sized from the current bead count so neighbouring beads keep a consistent
// proportional gap whether the ring holds 4 beads or 8 — see
// BEAD_GAP_FRACTION.
function beadRadiusFor(ring) {
  const chord = 2 * ring.radius * Math.sin(Math.PI / BEAD_COUNT);

  return (chord * (1 - BEAD_GAP_FRACTION)) / 2;
}

// The necklace is always fully populated (there's no "empty" bead state any
// more — every spot always holds one of the secret's own beads).
function makeBeadCell(index) {
  const { x, y } = beadPosition(index, RING);
  const radius = beadRadiusFor(RING);
  const colorIndex = state.guess[index];
  const style = state.beadStyles[colorIndex];
  const group = document.createElementNS(SVG_NS, "g");
  const face = document.createElementNS(SVG_NS, "path");
  const canInteract = !state.solved && !state.animating;

  group.setAttribute("class", [
    "bead-cell",
    index === state.selectedBead && state.armed && !state.solved ? "is-selected" : null
  ].filter(Boolean).join(" "));
  group.setAttribute("role", "button");
  group.setAttribute("tabindex", state.solved ? "-1" : "0");
  group.setAttribute("aria-label", beadLabel(index, colorIndex));
  group.setAttribute("draggable", String(canInteract));

  group.addEventListener("click", () => handleBeadClick(index, canInteract));
  group.addEventListener("dragstart", (event) => handleNecklaceDragStart(event, index));
  group.addEventListener("dragend", handleDragEnd);
  group.addEventListener("dragover", handleDragOver);
  group.addEventListener("dragenter", () => group.classList.add("is-drag-over"));
  group.addEventListener("dragleave", () => group.classList.remove("is-drag-over"));
  group.addEventListener("drop", (event) => {
    group.classList.remove("is-drag-over");
    handleNecklaceDrop(event, index);
  });

  face.setAttribute("class", "bead-face");
  face.setAttribute(
    "d",
    wavyCirclePath(x, y, radius, style.waveCount, radius * BEAD_WAVE_AMPLITUDE_RATIO)
  );
  face.style.fill = COLORS[colorIndex].value;
  group.append(face);
  appendBeadMarks(group, x, y, radius, style.markCount);

  if (SHOW_COLOR_NUMBERS) {
    group.append(makeColorNumberLabel(x, y, radius, colorIndex));
  }

  return group;
}

// A colour-blind-friendly aid: the colour's 1-based number, small, centred
// in the bead — sized and positioned to clear the decorative marks (which
// only start at BEAD_MARK_INNER_RATIO out from the centre).
function makeColorNumberLabel(cx, cy, radius, colorIndex) {
  const text = document.createElementNS(SVG_NS, "text");

  text.setAttribute("class", "bead-number");
  text.setAttribute("x", String(cx));
  text.setAttribute("y", String(cy));
  text.setAttribute("font-size", String(radius * 0.55));
  text.style.fill = isDarkColor(COLORS[colorIndex].value) ? "rgba(255, 255, 255, 0.92)" : "rgba(20, 18, 15, 0.85)";
  text.textContent = String(colorIndex + 1);
  return text;
}

function isDarkColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance < 0.6;
}

// A smooth closed outline whose radius oscillates `waveCount` times around
// the circle (so it bulges out and dips in that many times), built by
// sampling the perturbed radius and smoothing the sampled points into a
// quadratic-bezier loop (each point is a bend; curve passes through the
// midpoints between consecutive points).
function wavyCirclePath(cx, cy, radius, waveCount, amplitude) {
  const steps = Math.max(48, waveCount * 16);
  const points = [];

  for (let i = 0; i < steps; i += 1) {
    const theta = (i / steps) * Math.PI * 2;
    const sampleRadius = radius + amplitude * Math.sin(waveCount * theta);

    points.push([
      cx + sampleRadius * Math.cos(theta - Math.PI / 2),
      cy + sampleRadius * Math.sin(theta - Math.PI / 2)
    ]);
  }

  return smoothClosedPath(points);
}

function smoothClosedPath(points) {
  const count = points.length;
  const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = midpoint(points[count - 1], points[0]);
  let d = `M ${start[0]},${start[1]} `;

  for (let i = 0; i < count; i += 1) {
    const point = points[i];
    const next = points[(i + 1) % count];
    const through = midpoint(point, next);

    d += `Q ${point[0]},${point[1]} ${through[0]},${through[1]} `;
  }

  return `${d}Z`;
}

// A ring of short highlight marks evenly spaced inside the bead — its count
// is the colour's other randomised parameter.
function appendBeadMarks(group, cx, cy, radius, markCount) {
  const inner = radius * BEAD_MARK_INNER_RATIO;
  const outer = radius * BEAD_MARK_OUTER_RATIO;

  for (let i = 0; i < markCount; i += 1) {
    const theta = (i / markCount) * Math.PI * 2 - Math.PI / 2;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const mark = document.createElementNS(SVG_NS, "line");

    mark.setAttribute("class", "bead-mark");
    mark.setAttribute("x1", String(cx + inner * cosTheta));
    mark.setAttribute("y1", String(cy + inner * sinTheta));
    mark.setAttribute("x2", String(cx + outer * cosTheta));
    mark.setAttribute("y2", String(cy + outer * sinTheta));
    group.append(mark);
  }
}

function beadLabel(index, colorIndex) {
  return `${COLORS[colorIndex].label} bead, position ${index + 1} of ${BEAD_COUNT}`;
}

function renderHistory() {
  elements.history.innerHTML = "";

  state.history.forEach((entry, index) => {
    elements.history.append(makeSelectionRow(entry, index));
  });
}

function makeSelectionRow(entry, guessNumber) {
  const row = document.createElement("div");
  const number = document.createElement("span");
  const isWinning = entry.score.exact === BEAD_COUNT;

  row.className = isWinning ? "selection-row is-solved" : "selection-row";
  row.setAttribute("aria-label", `Guess ${guessNumber}${isWinning ? ", solved" : ""}`);

  number.className = "move-number";
  number.textContent = String(guessNumber);

  row.append(number, makeHistoryRing(entry.guess), makeScoreCount(entry.score));

  return row;
}

function makeHistoryRing(guess) {
  const svg = document.createElementNS(SVG_NS, "svg");
  const radius = beadRadiusFor(MINI_RING);

  svg.setAttribute("class", "history-ring");
  svg.setAttribute("viewBox", "0 0 42 42");
  svg.append(makeRingTrack(MINI_RING, "mini-ring-track"));

  for (let index = 0; index < BEAD_COUNT; index += 1) {
    svg.append(makeMiniBead(index, guess[index], radius));
  }

  return svg;
}

function makeMiniBead(index, colorIndex, radius) {
  const { x, y } = beadPosition(index, MINI_RING);
  const circle = document.createElementNS(SVG_NS, "circle");

  circle.setAttribute("class", "mini-bead");
  circle.setAttribute("cx", String(x));
  circle.setAttribute("cy", String(y));
  circle.setAttribute("r", String(radius));
  circle.style.fill = COLORS[colorIndex].value;

  return circle;
}

// Just the exact-match count. Colour-only matches aren't shown here: since
// every guess is a rearrangement of the secret's own beads, the guess and
// secret always share the exact same multiset of colours, so the total
// matched count is always all BEAD_COUNT — meaning colour-only is always
// exactly `BEAD_COUNT - exact`, not partial information the player doesn't
// already have.
function makeScoreCount(score) {
  const badge = document.createElement("span");

  badge.className = "score-count";
  badge.textContent = String(score.exact);
  badge.setAttribute("aria-label", `${score.exact} exact`);

  return badge;
}

function renderStatus() {
  if (state.solved) {
    // Guess 0 is a free starting look, not something the player guessed.
    const guessCount = state.history.length - 1;

    elements.status.textContent = `Solved in ${guessCount} guess${guessCount === 1 ? "" : "es"}.`;
  } else {
    elements.status.textContent = `Guess ${state.history.length}`;
  }

  elements.submitButton.disabled = state.solved || state.animating;
}

function swapNecklaceBeads(indexA, indexB) {
  if (indexA === indexB) {
    return;
  }

  const temp = state.guess[indexA];

  state.guess[indexA] = state.guess[indexB];
  state.guess[indexB] = temp;
}

// Number-key path: swap the selected spot with the given one, then advance
// the selection one step clockwise.
function swapAtSelected(targetIndex) {
  if (state.solved || state.animating) {
    return;
  }

  swapNecklaceBeads(state.selectedBead, targetIndex);
  state.selectedBead = wrapBeadIndex(state.selectedBead + 1);
  state.armed = true;
  render();
}

// Click/tap path (mouse and touch alike, since both fire "click"): the
// selected bead being "armed" or not disambiguates a tap from a swap.
// - Nothing armed: arm the tapped bead as the swap source, don't swap yet.
// - Tap the armed bead again: release it, back to a neutral, nothing-armed
//   state — lets a pointer user back out when the armed bead isn't one of
//   the two they actually want to swap.
// - Tap a different bead while armed: swap it with the armed bead, then
//   stay armed on the newly-tapped bead so multiple swaps can be chained.
function handleBeadClick(index, canInteract) {
  if (!canInteract) {
    return;
  }

  if (!state.armed) {
    state.selectedBead = index;
    state.armed = true;
  } else if (index === state.selectedBead) {
    state.armed = false;
  } else {
    swapNecklaceBeads(state.selectedBead, index);
    state.selectedBead = index;
  }

  render();
}

function handleNecklaceDragStart(event, index) {
  if (state.solved || state.animating) {
    event.preventDefault();
    return;
  }

  dragSource = index;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "");
}

function handleDragOver(event) {
  event.preventDefault();
}

function handleDragEnd() {
  dragSource = null;
}

function handleNecklaceDrop(event, index) {
  event.preventDefault();

  const sourceIndex = dragSource;

  dragSource = null;

  if (sourceIndex === null || state.solved || state.animating) {
    return;
  }

  swapNecklaceBeads(sourceIndex, index);
  state.selectedBead = index;
  state.armed = true;
  render();
}

function submitGuess() {
  if (state.solved || state.animating) {
    return;
  }

  const guess = [...state.guess];
  const { exact, near, rotation, rotatedGuess } = scoreGuess(guess);

  if (rotation === 0) {
    finishSubmit(rotatedGuess, exact, near);
    return;
  }

  animateRotation(rotation, () => finishSubmit(rotatedGuess, exact, near));
}

function finishSubmit(rotatedGuess, exact, near) {
  state.history.push({ guess: rotatedGuess, score: { exact, near } });
  state.solved = exact === BEAD_COUNT;

  // Leave the board showing the rotated arrangement — the same orientation
  // just spun to and recorded in history — rather than resetting it. Clone
  // it so later edits to the board don't also mutate the stored entry.
  state.guess = [...rotatedGuess];
  state.selectedBead = 0;
  state.armed = true;

  render();
}

// Spins the whole board clockwise by `steps` ring positions at a constant
// angular rate (ROTATION_STEP_MS per step, so the animation takes longer for
// a bigger rotation rather than a fixed duration always being stretched or
// squeezed to fit), landing the guess in the same rotation that will be
// scored and shown in the history tile. Everything is a plain CSS transform
// transition on the <svg> itself — no per-frame JS needed.
function animateRotation(steps, onComplete) {
  state.animating = true;
  elements.submitButton.disabled = true;

  const degrees = steps * (360 / BEAD_COUNT);
  const duration = steps * ROTATION_STEP_MS;

  elements.board.style.transition = "none";
  elements.board.style.transform = "rotate(0deg)";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      elements.board.style.transition = `transform ${duration}ms linear`;
      elements.board.style.transform = `rotate(${degrees}deg)`;
    });
  });

  const handleTransitionEnd = (event) => {
    if (event.target !== elements.board || event.propertyName !== "transform") {
      return;
    }

    elements.board.removeEventListener("transitionend", handleTransitionEnd);
    elements.board.style.transition = "";
    elements.board.style.transform = "";
    state.animating = false;
    onComplete();
  };

  elements.board.addEventListener("transitionend", handleTransitionEnd);
}

// Score by rotating the guess (rather than the secret) against the fixed
// secret. This is functionally the same comparison, just inverted, and lets
// us report which rotation of the guess actually won.
//
// The total number of matched pegs (exact + near, i.e. colour overlap
// ignoring position) is invariant under rotation — rotating never changes
// either sequence's multiset of colours. So once the rotation with the most
// exact matches is found, its near count is `total - exact`; there's no need
// to break ties on near separately, since every tied rotation has the same
// near count too. Among rotations tied for the most exact matches, the first
// one found (smallest clockwise rotation, since we search rotations in
// increasing order) is the one reported.
function scoreGuess(guess) {
  const total = totalColorOverlap(state.secret, guess);
  let bestExact = -1;
  let bestRotation = 0;

  for (let rotation = 0; rotation < BEAD_COUNT; rotation += 1) {
    const exact = countExactMatches(state.secret, rotateClockwise(guess, rotation));

    if (exact > bestExact) {
      bestExact = exact;
      bestRotation = rotation;
    }
  }

  return {
    exact: bestExact,
    near: total - bestExact,
    rotation: bestRotation,
    rotatedGuess: rotateClockwise(guess, bestRotation)
  };
}

// Rotates `beads` clockwise by `steps` positions around the ring, i.e. the
// bead that was at position i moves to position (i + steps) mod N.
function rotateClockwise(beads, steps) {
  return Array.from(
    { length: BEAD_COUNT },
    (_, index) => beads[(index - steps + BEAD_COUNT) % BEAD_COUNT]
  );
}

function countExactMatches(secretLine, guessLine) {
  return secretLine.reduce(
    (count, secretColor, index) => count + (secretColor === guessLine[index] ? 1 : 0),
    0
  );
}

function totalColorOverlap(secretLine, guessLine) {
  const secretRemainder = [...secretLine];
  let total = 0;

  guessLine.forEach((guessColor) => {
    const matchIndex = secretRemainder.indexOf(guessColor);

    if (matchIndex === -1) {
      return;
    }

    total += 1;
    secretRemainder.splice(matchIndex, 1);
  });

  return total;
}

function handleKeyDown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey || state.solved || state.animating) {
    return;
  }

  if (/^[1-9]$/.test(event.key) && Number(event.key) <= BEAD_COUNT) {
    event.preventDefault();
    swapAtSelected(Number(event.key) - 1);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    submitGuess();
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    state.selectedBead = wrapBeadIndex(state.selectedBead - 1);
    state.armed = true;
    render();
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    state.selectedBead = wrapBeadIndex(state.selectedBead + 1);
    state.armed = true;
    render();
  }
}

function wrapBeadIndex(index) {
  return ((index % BEAD_COUNT) + BEAD_COUNT) % BEAD_COUNT;
}
