// One-shot effects heard and seen by everyone at the table.
//
// The spells resolve their events — a section collapsing, a block being
// destroyed, a fireball landing — on the active GM's client, so an effect has
// to reach the other clients rather than play locally. Sequencer does the
// playing and the broadcasting of animations and the view's shake; it is a
// required dependency of the module. Sounds, the dazzle and a light fading
// smoothly go over the module's own socket instead, each client playing them
// for itself. A call carries delayMs, which each client counts from when it
// hears of it, as Sequencer does with its delays, so what is sent alongside
// a sequence lands with it.
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

const SOCKET = `module.${MOD}`;

export function registerEffects() {
  game.socket.on(SOCKET, (message) => {
    if (message?.action === "sound") soundHere(message).catch(report);
    if (message?.action === "dazzle") dazzleHere(message);
    if (message?.action === "fadeLight") fadeLightHere(message);
  });
}

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

// A sound for everyone, played by Foundry's own audio on the interface
// channel, so the interface volume applies to it as it does to the dice.
//
// startMs is where in the file to begin. durationMs cuts it short — the file
// may also simply end first — and fadeOutMs lets the cut fade, from the
// volume it is playing at, instead of stopping dead. delayMs holds it back to
// land on a moment inside an animation started alongside it; the file is
// loaded while it waits.
//
// Not through Sequencer: Sequencer fades an unplaced sound out from full
// volume whatever volume it was playing at (seen on 4.2.3), so a quiet sound
// cut short leapt to full just before it ended.
export function playSound(src, {
  volume = 0.8, startMs = 0, durationMs = 0, fadeOutMs = 0, delayMs = 0
} = {}) {
  if (!src) return;
  const sound = { src, volume, startMs, durationMs, fadeOutMs, delayMs };
  game.socket.emit(SOCKET, { action: "sound", ...sound });
  soundHere(sound).catch(report);
}

async function soundHere({ src, volume, startMs, durationMs, fadeOutMs, delayMs }) {
  const due = Date.now() + delayMs;
  const sound = game.audio.create({ src, context: game.audio.interface, singleton: false });
  await sound.load();
  await wait(due - Date.now());
  await sound.play({ volume, offset: startMs / 1000 });
  if (!durationMs) return;
  await wait(durationMs - fadeOutMs);
  await sound.stop({ fade: fadeOutMs });
}

// Loads sounds on this client ahead of time, so the first play of each starts
// on cue rather than after its download.
export function preloadSounds(srcs) {
  for (const src of srcs) {
    foundry.audio.AudioHelper.preloadSound(src).catch(report);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
}

function report(err) {
  console.error(`${MOD} | effects`, err);
}

// Every screen at the table overexposed for a moment, as by a light too
// bright to look at: the whole canvas is pushed brightness times brighter,
// held for holdMs, and eased back over fadeMs. Brightness multiplies, so
// black stays black however far it goes; contrast below 1, applied first,
// pulls the darks up towards grey for brightness to carry, and at 0 the
// whole picture is one grey that brightness 2 or more turns plain white.
// saturate below 1 washes the colour out. Neither Foundry nor Sequencer
// has this, and a light in the scene can only light what it reaches, so it
// is done in each browser on the canvas element itself. Nothing is saved.
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

// A light in the scene changed smoothly over time on every client, without a
// save to the server at each step. keyframes are moments counted from now,
// each with the light's bright and dim radius, colour (a number) and
// luminosity; between them every value moves in a straight line. The light
// as saved stays as it was: only each client's own copy changes, redrawn
// about fifteen times a second. Whoever made the light still owns its end
// and deletes it.
//
// This leans on Foundry's own way of redrawing a light from its data, which
// is not part of its public API. Should that ever be gone, the light simply
// stays as it was until it is deleted.
const LIGHT_FRAME_MS = 66;

export function fadeLight(light, keyframes) {
  const fade = { sceneId: light.parent.id, lightId: light.id, keyframes };
  game.socket.emit(SOCKET, { action: "fadeLight", ...fade });
  fadeLightHere(fade);
}

function fadeLightHere({ sceneId, lightId, keyframes }) {
  const start = Date.now();
  const endMs = keyframes.at(-1).atMs;
  const frame = () => {
    const now = Date.now() - start;
    const light = game.scenes.get(sceneId)?.lights.get(lightId);
    if (light?.object && !redraw(light, lightAt(keyframes, Math.min(now, endMs)))) return;
    if (now < endMs) setTimeout(frame, LIGHT_FRAME_MS);
  };
  frame();
}

function lightAt(keyframes, ms) {
  const next = keyframes.findIndex((k) => k.atMs >= ms);
  if (next === -1) return keyframes.at(-1);
  if (next === 0) return keyframes[0];
  const a = keyframes[next - 1], b = keyframes[next];
  const f = (ms - a.atMs) / Math.max(b.atMs - a.atMs, 1);
  const mix = (x, y) => x + (y - x) * f;
  const channel = (c, shift) => (c >> shift) & 255;
  const color = [16, 8, 0].reduce(
    (sum, shift) => sum + (Math.round(mix(channel(a.color, shift), channel(b.color, shift))) << shift), 0);
  return { bright: mix(a.bright, b.bright), dim: mix(a.dim, b.dim), luminosity: mix(a.luminosity, b.luminosity), color };
}

// False when the light cannot be redrawn this way, which ends the fade.
function redraw(light, { bright, dim, color, luminosity }) {
  if (typeof light.object.initializeLightSource !== "function") return false;
  light.updateSource({ config: { bright, dim, luminosity, color: `#${color.toString(16).padStart(6, "0")}` } });
  light.object.initializeLightSource();
  canvas.perception.update({ refreshLighting: true, refreshVision: true });
  return true;
}
