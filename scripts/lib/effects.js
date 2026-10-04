// One-shot effects heard and seen by everyone at the table.
//
// The spells resolve their events — a section collapsing, a block being
// destroyed, a fireball landing — on the active GM's client, so an effect has
// to reach the other clients rather than play locally. Sequencer does the
// playing and the broadcasting; it is a required dependency of the module.
//
// Sounds are not placed on the map. Foundry plays a placed sound only for a
// user with a token of their own selected near it, so it went silent while a
// template was being placed — no token is selected then — and never reached
// a display user with no tokens at all. At a table with one set of speakers,
// placement added nothing to make up for that.
//
// A spell this module animates must have no Automated Animations autorec
// entry, or both play. Spells the module leaves alone can stay with AA.

import { MOD } from "../const.js";

// Users whose view is never shaken. Meant for a TV laid flat as a play mat:
// the map moving under physical miniatures leaves them off their squares, and
// Lock View fights every pan. Set once per world, on the user itself:
//
//   game.users.getName("TV").setFlag("ramzeth-customs", "noShake", true)
//
// A flag on the user rather than a name in the code, so it travels with the
// world and works whatever that user is called.
export function shakeUsers() {
  return game.users
    .filter((u) => u.active && !u.getFlag(MOD, "noShake"))
    .map((u) => u.id);
}

// Adds a sound to a sequence that is being built, so a spell can time it
// against its own animations.
//
// startMs and endMs pick a stretch of the file by position in it, so one file
// can be played in pieces. durationMs cuts it short instead — never longer
// than what is left of the file, or Sequencer loops it. fadeOutMs lets either
// cut fade instead of stopping dead. delayMs holds the sound back from the
// point in the sequence where it was added, to land on a moment inside an
// animation started alongside it.
export function addSound(seq, src, {
  volume = 0.8, startMs = 0, endMs = 0, durationMs = 0, fadeOutMs = 0, delayMs = 0
} = {}) {
  if (!src) return seq;
  const sound = seq.sound()
    .file(src)
    .volume(volume);
  if (delayMs) sound.delay(delayMs);
  if (startMs) sound.startTime(startMs);
  if (endMs) sound.endTime(endMs);
  if (durationMs) sound.duration(durationMs);
  if (fadeOutMs) sound.fadeOutAudio(fadeOutMs);
  return seq;
}

// A sound on its own, played at once.
export function playSound(src, options) {
  if (!src) return;
  addSound(new Sequence(), src, options).play();
}

// Every screen at the table overexposed for a moment, as by a light too
// bright to look at: the whole canvas is pushed brightness times brighter,
// held for holdMs, and eased back over fadeMs. Brightness multiplies, so
// black stays black however far it goes; contrast below 1, applied first,
// pulls the darks up towards grey for brightness to carry, and at 0 the
// whole picture is one grey that brightness 2 or more turns plain white.
// saturate below 1 washes the colour out. Neither Foundry nor Sequencer
// has this, and a light in the scene can only light what it reaches, so it
// is done in each browser on the canvas element itself. Nothing is saved;
// the module's socket carries the call to the other clients, and each counts
// delayMs from when it hears of it, as Sequencer does with its delays, so the
// flash lands with the sequence it was sent alongside.
const SOCKET = `module.${MOD}`;

export function registerEffects() {
  game.socket.on(SOCKET, (message) => {
    if (message?.action === "dazzle") dazzleHere(message);
  });
}

export function dazzle({ brightness, contrast = 1, saturate = 1, holdMs, fadeMs, delayMs = 0 }) {
  const flash = { brightness, contrast, saturate, holdMs, fadeMs, delayMs };
  game.socket.emit(SOCKET, { action: "dazzle", ...flash });
  dazzleHere(flash);
}

// A new flash takes over from one still fading.
let dazzleTimer = null;

function dazzleHere({ brightness, contrast = 1, saturate = 1, holdMs, fadeMs, delayMs }) {
  clearTimeout(dazzleTimer);
  dazzleTimer = setTimeout(() => {
    const board = document.getElementById("board");
    if (!board) return;
    board.style.transition = "none";
    board.style.filter = `contrast(${contrast}) brightness(${brightness}) saturate(${saturate})`;
    dazzleTimer = setTimeout(() => {
      board.style.transition = `filter ${fadeMs}ms ease-out`;
      board.style.filter = "";
      dazzleTimer = setTimeout(() => { board.style.transition = ""; }, fadeMs);
    }, holdMs);
  }, delayMs);
}
