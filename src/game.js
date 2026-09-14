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
const CLOCK_LABELS = ["12", "2", "4", "6", "8", "10"];

const state = {
  secret: [],
  guess: [],
  selectedBead: 0,
  history: [],
  solved: false
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
  render();
}

function makeRandomNecklace() {
  return Array.from({ length: BEAD_COUNT }, () => randomColorIndex());
}

function randomColorIndex() {
  return Math.floor(Math.random() * COLORS.length);
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
  const face = document.createElementNS(SVG_NS, "circle");

  group.setAttribute("class", [
    "bead-cell",
    colorIndex === null ? null : "is-filled",
    index === state.selectedBead && !state.solved ? "is-selected" : null
  ].filter(Boolean).join(" "));
  group.setAttribute("role", "button");
  group.setAttribute("tabindex", state.solved ? "-1" : "0");
  group.setAttribute("aria-label", beadLabel(index, colorIndex));
  group.addEventListener("click", () => {
    if (state.solved) {
      return;
    }

    state.selectedBead = index;
    render();
  });

  face.setAttribute("class", "bead-face");
  face.setAttribute("cx", String(x));
  face.setAttribute("cy", String(y));
  face.setAttribute("r", String(RING.beadRadius));
  if (colorIndex !== null) {
    face.style.fill = COLORS[colorIndex].value;
  }

  group.append(face);
  return group;
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
    button.style.background = color.value;
    button.disabled = state.solved;
    button.setAttribute("aria-label", color.label);
    button.addEventListener("click", () => {
      setBeadColor(state.selectedBead, index, { advanceSelection: true });
    });
    elements.palette.append(button);
  });
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

  if (state.solved) {
    return;
  }

  state.guess[index] = colorIndex;

  if (advanceSelection) {
    state.selectedBead = nextOpenBeadIndexAfter(index);
  }

  render();
}

function nextOpenBeadIndexAfter(index) {
  for (let offset = 1; offset < BEAD_COUNT; offset += 1) {
    const nextIndex = wrapBeadIndex(index + offset);

    if (state.guess[nextIndex] === null) {
      return nextIndex;
    }
  }

  return index;
}

function submitGuess() {
  if (state.solved || state.guess.some((colorIndex) => colorIndex === null)) {
    return;
  }

  const guess = [...state.guess];
  const { exact, near, rotatedGuess } = scoreGuess(guess);

  state.history.push({ guess: rotatedGuess, score: { exact, near } });
  state.solved = exact === BEAD_COUNT;

  // On a win, leave the main board showing the winning guess as placed
  // instead of clearing it for another attempt.
  if (!state.solved) {
    state.guess = Array.from({ length: BEAD_COUNT }, () => null);
    state.selectedBead = 0;
  }

  render();
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
  if (event.metaKey || event.ctrlKey || event.altKey || state.solved) {
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
  if (state.solved) {
    return;
  }

  state.guess[state.selectedBead] = null;
  render();
}

function wrapBeadIndex(index) {
  return ((index % BEAD_COUNT) + BEAD_COUNT) % BEAD_COUNT;
}
