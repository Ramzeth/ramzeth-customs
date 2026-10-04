// One-shot effects heard and seen by everyone at the table.
//
// The spells resolve their events — a section collapsing, a block being
// destroyed, a fireball landing — on the active GM's client, so an effect has
// to reach the other clients rather than play locally.
//
// Sequencer does the playing: it broadcasts, and it places the effect on the
// map so it comes from where things happened. It is a required dependency of
// the module, so there is no fallback — a flat, unplaced sound was the only
// alternative, and not one worth keeping.
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

// Adds a sound placed on the map to a sequence that is being built, so a
// spell can time it against its own animations.
//
// radiusSquares is passed to Sequencer as it is: its radius is measured in
// grid squares, not in feet.
//
// startMs and endMs pick a stretch of the file by position in it, so one file
// can be played in pieces. durationMs cuts it short instead — never longer
// than what is left of the file, or Sequencer loops it. fadeOutMs lets either
// cut fade instead of stopping dead. delayMs holds the sound back from the
// point in the sequence where it was added, to land on a moment inside an
// animation started alongside it.
export function addSound(seq, src, at, {
  volume = 0.8, radiusSquares = 12,
  startMs = 0, endMs = 0, durationMs = 0, fadeOutMs = 0, delayMs = 0
} = {}) {
  if (!src) return seq;
  const sound = seq.sound()
    .file(src)
    .volume(volume)
    .atLocation(at)
    .radius(radiusSquares);
  if (delayMs) sound.delay(delayMs);
  if (startMs) sound.startTime(startMs);
  if (endMs) sound.endTime(endMs);
  if (durationMs) sound.duration(durationMs);
  if (fadeOutMs) sound.fadeOutAudio(fadeOutMs);
  return seq;
}

// A sound on its own, played at once.
export function playSoundAt(src, at, options) {
  if (!src) return;
  addSound(new Sequence(), src, at, options).play();
}
