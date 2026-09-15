const SVG_NS = "http://www.w3.org/2000/svg";

const BEAD_COUNT = 6;
const COLORS = [
  { key: "orange", label: "Orange", value: "#d84b2a" },
  { key: "sky", label: "Sky", value: "#0072b2" },
  { key: "green", label: "Green", value: "#009e73" },
  { key: "purple", label: "Purple", value: "#f0d84a" }
];

const RING = { center: 110, radius: 66, beadRadius: 17 };
const MINI_RING = { center: 21, radius: 13, beadRadius: 4.5 };
// Sized so its viewBox-to-pixel ratio matches the board's (viewBox 220,
// rendered up to 260px wide): 44 / 52 == 220 / 260, so a palette bead comes
// out the same displayed size as a board bead of the same radius.
const PALETTE_BEAD = { center: 22, radius: RING.beadRadius };
const PALETTE_BUTTON_SIZE = 52;
const CLOCK_LABELS = ["12", "2", "4", "6", "8", "10"];

// Per-colour decorative range: each colour's wavy-outline bump count and
// highlight-mark count are randomised once per puzzle from this range.
const BEAD_STYLE_RANGE = { min: 3, max: 6 };
const BEAD_WAVE_AMPLITUDE_RATIO = 0.16;
const BEAD_MARK_INNER_RATIO = 0.32;
const BEAD_MARK_OUTER_RATIO = 0.6;

// Constant angular rate for the submit-rotation animation: total duration
// scales with the number of steps, rather than the whole spin being squeezed
// into a fixed time.
const ROTATION_STEP_MS = 200;

const state = {
  secret: [],
  guess: [],
  selectedBead: 0,
  history: [],
  solved: false,
  animating: false,
  beadStyles: []
};

const elements = {
  board: document.querySelector("#board"),
  palette: document.querySelector("#palette"),
  history: document.querySelector("#history"),
  status: document.querySelector("#status"),
  submitButton: document.querySelector("#submit-button"),
  newButton: document.querySelector("#new-button"),
  infoButton: document.querySelector("#info-button"),
  infoPanel: document.querySelector("#info-panel")
};

elements.submitButton.addEventListener("click", submitGuess);
elements.newButton.addEventListener("click", startGame);
elements.infoButton.addEventListener("click", toggleInfoPanel);
document.addEventListener("click", closeInfoPanelFromOutside);
document.addEventListener("keydown", handleKeyDown);

startGame();

function startGame() {
  state.secret = makeRandomNecklace();
  state.guess = Array.from({ length: BEAD_COUNT }, () => null);
  state.selectedBead = 0;
  state.history = [];
  state.solved = false;
  state.animating = false;
  state.beadStyles = makeBeadStyles();
  render();
}

function makeRandomNecklace() {
  return Array.from({ length: BEAD_COUNT }, () => randomColorIndex());
}

function randomColorIndex() {
  return randomInt(0, COLORS.length - 1);
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

function toggleInfoPanel(event) {
  event.stopPropagation();

  const isOpen = !elements.infoPanel.hidden;

  elements.infoPanel.hidden = isOpen;
  elements.infoButton.setAttribute("aria-expanded", String(!isOpen));
}

function closeInfoPanelFromOutside(event) {
  if (
    !elements.infoPanel.hidden &&
    !elements.infoPanel.contains(event.target) &&
    !elements.infoButton.contains(event.target)
  ) {
    elements.infoPanel.hidden = true;
    elements.infoButton.setAttribute("aria-expanded", "false");
  }
}

function render() {
  renderBoard();
  renderPalette();
  renderHistory();
  renderStatus();
}

function renderBoard() {
  elements.board.classList.toggle("is-solved", state.solved);
  elements.board.innerHTML = "";
  elements.board.append(makeRingTrack(RING, "ring-track"));

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

function beadPosition(index, ring) {
  const angle = (index * 360) / BEAD_COUNT - 90;
  const radians = (angle * Math.PI) / 180;

  return {
    x: ring.center + ring.radius * Math.cos(radians),
    y: ring.center + ring.radius * Math.sin(radians)
  };
}

function makeBeadCell(index) {
  const { x, y } = beadPosition(index, RING);
  const colorIndex = state.guess[index];
  const group = document.createElementNS(SVG_NS, "g");

  group.setAttribute("class", [
    "bead-cell",
    colorIndex === null ? null : "is-filled",
    index === state.selectedBead && !state.solved ? "is-selected" : null
  ].filter(Boolean).join(" "));
  group.setAttribute("role", "button");
  group.setAttribute("tabindex", state.solved ? "-1" : "0");
  group.setAttribute("aria-label", beadLabel(index, colorIndex));
  group.addEventListener("click", () => {
    if (state.solved || state.animating) {
      return;
    }

    state.selectedBead = index;
    render();
  });

  if (colorIndex === null) {
    const face = document.createElementNS(SVG_NS, "circle");

    face.setAttribute("class", "bead-face");
    face.setAttribute("cx", String(x));
    face.setAttribute("cy", String(y));
    face.setAttribute("r", String(RING.beadRadius));
    group.append(face);
  } else {
    const style = state.beadStyles[colorIndex];
    const face = document.createElementNS(SVG_NS, "path");

    face.setAttribute("class", "bead-face");
    face.setAttribute(
      "d",
      wavyCirclePath(x, y, RING.beadRadius, style.waveCount, RING.beadRadius * BEAD_WAVE_AMPLITUDE_RATIO)
    );
    face.style.fill = COLORS[colorIndex].value;
    group.append(face);
    appendBeadMarks(group, x, y, RING.beadRadius, style.markCount);
  }

  return group;
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
  const clock = `${CLOCK_LABELS[index]} o'clock`;

  if (colorIndex === null) {
    return `Empty bead at ${clock}`;
  }

  return `${COLORS[colorIndex].label} bead at ${clock}`;
}

function renderPalette() {
  elements.palette.innerHTML = "";

  COLORS.forEach((color, index) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "palette-button";
    button.style.width = `${PALETTE_BUTTON_SIZE}px`;
    button.style.height = `${PALETTE_BUTTON_SIZE}px`;
    button.disabled = state.solved;
    button.setAttribute("aria-label", color.label);
    button.addEventListener("click", () => {
      setBeadColor(state.selectedBead, index, { advanceSelection: true });
    });
    button.append(makePaletteBead(color, state.beadStyles[index]));
    elements.palette.append(button);
  });
}

function makePaletteBead(color, style) {
  const svg = document.createElementNS(SVG_NS, "svg");
  const face = document.createElementNS(SVG_NS, "path");

  svg.setAttribute("class", "palette-bead");
  svg.setAttribute("viewBox", `0 0 ${PALETTE_BEAD.center * 2} ${PALETTE_BEAD.center * 2}`);

  face.setAttribute("class", "bead-face");
  face.setAttribute(
    "d",
    wavyCirclePath(
      PALETTE_BEAD.center,
      PALETTE_BEAD.center,
      PALETTE_BEAD.radius,
      style.waveCount,
      PALETTE_BEAD.radius * BEAD_WAVE_AMPLITUDE_RATIO
    )
  );
  face.style.fill = color.value;

  svg.append(face);
  appendBeadMarks(svg, PALETTE_BEAD.center, PALETTE_BEAD.center, PALETTE_BEAD.radius, style.markCount);
  return svg;
}

function renderHistory() {
  elements.history.innerHTML = "";

  state.history.forEach((entry, index) => {
    elements.history.append(makeSelectionRow(entry, index + 1, false));
  });

  // The upcoming tile stays empty — it doesn't mirror bead-by-bead progress
  // on the main board, only appearing filled once a full guess is submitted.
  if (!state.solved) {
    const emptyGuess = Array.from({ length: BEAD_COUNT }, () => null);

    elements.history.append(makeSelectionRow({ guess: emptyGuess, score: null }, state.history.length + 1, true));
  }
}

function makeSelectionRow(entry, guessNumber, isPending) {
  const row = document.createElement("div");
  const number = document.createElement("span");

  row.className = isPending ? "selection-row is-pending" : "selection-row";
  row.setAttribute("aria-label", isPending ? "Current unscored guess" : `Guess ${guessNumber}`);

  number.className = "move-number";
  number.textContent = String(guessNumber);

  row.append(number, makeHistoryRing(entry.guess));

  if (!isPending) {
    row.append(makeScoreDots(entry.score));
  }

  return row;
}

function makeHistoryRing(guess) {
  const svg = document.createElementNS(SVG_NS, "svg");

  svg.setAttribute("class", "history-ring");
  svg.setAttribute("viewBox", "0 0 42 42");
  svg.append(makeRingTrack(MINI_RING, "mini-ring-track"));

  for (let index = 0; index < BEAD_COUNT; index += 1) {
    svg.append(makeMiniBead(index, guess[index]));
  }

  return svg;
}

function makeMiniBead(index, colorIndex) {
  const { x, y } = beadPosition(index, MINI_RING);
  const circle = document.createElementNS(SVG_NS, "circle");

  circle.setAttribute("class", colorIndex === null ? "mini-bead is-empty" : "mini-bead");
  circle.setAttribute("cx", String(x));
  circle.setAttribute("cy", String(y));
  circle.setAttribute("r", String(MINI_RING.beadRadius));
  if (colorIndex !== null) {
    circle.style.fill = COLORS[colorIndex].value;
  }

  return circle;
}

// Fixed 2-row-by-3-column grid of BEAD_COUNT pegs so every score badge is the
// same size, regardless of how many pegs are actually filled. Slots fill in
// reading order (top-left first, along each row): exact (black) pegs first,
// then near (white) pegs, then empty slots.
function makeScoreDots(score) {
  const grid = document.createElement("div");

  grid.className = "score-dots";
  grid.setAttribute("aria-label", `${score.exact} exact, ${score.near} colour only`);

  for (let i = 0; i < BEAD_COUNT; i += 1) {
    const dot = document.createElement("span");
    const kind = i < score.exact ? "exact" : i < score.exact + score.near ? "near" : "empty";

    dot.className = `score-dot is-${kind}`;
    grid.append(dot);
  }

  return grid;
}

function renderStatus() {
  if (state.solved) {
    const guessCount = state.history.length;

    elements.status.textContent = `Solved in ${guessCount} guess${guessCount === 1 ? "" : "es"}.`;
  } else {
    elements.status.textContent = state.history.length === 0
      ? "Fill the ring, then press Enter."
      : `Guess ${state.history.length + 1}`;
  }

  elements.submitButton.disabled = state.solved || state.guess.some((colorIndex) => colorIndex === null);
}

function setBeadColor(index, colorIndex, options = {}) {
  const { advanceSelection = false } = options;

  if (state.solved || state.animating) {
    return;
  }

  state.guess[index] = colorIndex;

  if (advanceSelection) {
    state.selectedBead = wrapBeadIndex(index + 1);
  }

  render();
}

function submitGuess() {
  if (state.solved || state.animating || state.guess.some((colorIndex) => colorIndex === null)) {
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
  // just spun to and recorded in history — rather than clearing it. Clone it
  // so later edits to the board don't also mutate the stored history entry.
  state.guess = [...rotatedGuess];
  state.selectedBead = 0;

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
  elements.palette.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });

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

  if (/^[1-4]$/.test(event.key)) {
    event.preventDefault();
    setBeadColor(state.selectedBead, Number(event.key) - 1, { advanceSelection: true });
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    submitGuess();
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    clearSelectedBead();
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    state.selectedBead = wrapBeadIndex(state.selectedBead - 1);
    render();
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    state.selectedBead = wrapBeadIndex(state.selectedBead + 1);
    render();
  }
}

function clearSelectedBead() {
  if (state.solved || state.animating) {
    return;
  }

  state.guess[state.selectedBead] = null;
  render();
}

function wrapBeadIndex(index) {
  return ((index % BEAD_COUNT) + BEAD_COUNT) % BEAD_COUNT;
}
