// Fireball (PF2e, rank 3).
//
// The spell's rules are untouched; this is its animation, played by the
// module rather than Automated Animations so that it can grow with the rank
// the spell is cast at. A bead of fire flies from the caster to the centre of
// the burst and explodes there.
//
// Placing the burst template only marks where. The fireball goes off when its
// damage is rolled, once Dice So Nice's dice have landed, so the table sees
// the dice, then the blast, then rolls its saves. The template itself may be
// long gone by then — the target helper removes it once targets are picked —
// so where it lay is remembered when it is placed.
//
// Template and damage are tied together by the spell's chat card: a roll sets
// off only the template placed from its own card, and only once, so a reroll
// does not explode again and two casts never swap places. PF2e marks the
// template with its card but not the damage roll, so the module marks the
// roll itself, on the client of whoever presses the card's damage button. A
// template or a roll without a card — placed or rolled from anywhere else —
// sets nothing off.
//
// Every rank from 3 to 10 is a step up from the one before: the fire runs
// from orange to a blinding white ball of plasma edged in violet, and grows
// in size, length, loudness, glow, shake and the flash of light it throws
// over the scene; from rank 5 on it leaves its mark — glowing cracks, then a
// shockwave, then the fireball blazing on, then red-hot ground. Everyone's
// view shakes, except users marked noShake.
//
// The spell itself needs no edit: PF2e already puts a template button on its
// chat card. Any Automated Animations autorec entry for Fireball has to go,
// or both animations play.

import { ASSETS } from "../assets.js";
import { MOD } from "../const.js";
import { addSound, dazzle, shakeUsers } from "../lib/effects.js";

const SLUG = "origin:item:slug:fireball";
const BASE_RANK = 3;

// Dice So Nice says, for each roll message, whether this client will animate
// its dice, and later when they have landed. Should neither ever come, the
// fireball goes off after this long anyway.
const DSN = "dice-so-nice";
const DICE_WAIT_MS = 15000;

// A damage button is any button on a chat card whose action names damage —
// PF2e's spell card has "spell-damage". Pressing one is held for the roll it
// starts for this long, which leaves time for PF2e's damage dialog; a press
// that led to no roll is forgotten after it.
const DAMAGE_BUTTON = '[data-action*="damage"]';
const PRESS_HELD_MS = 120000;

// Used only if the template's own radius cannot be read.
const BURST_RADIUS_FEET = 20;

// How a JB2A beam file is laid out, in the file's own pixels — nothing here
// refers to the scene's grid. gridSize is how many file pixels make one
// square: Sequencer divides the scene's square by it to scale the file, so
// the beam is two squares thick on any scene. startPoint and endPoint are the
// run-up before the path begins and after it ends; without them the whole
// file, padding included, would be stretched between the two points and the
// bead would start short of the caster and land short of the centre.
const BEAM_TEMPLATE = { gridSize: 200, startPoint: 200, endPoint: 200 };

// When, from the start of a beam file, the bead strikes. A beam file runs
// 4 s, but the flight is only a moment of it: the bead grows at the caster's
// hand for two seconds, crosses as a streak within a frame or two, flashes at
// the target and fades. Measured frame by frame on the 5-foot and 90-foot
// files: their first two seconds match frame for frame, and the streak
// reaches the target at 2.08 s and 2.125 s. The lengths between are taken to
// fall inside that one frame. Stretching a file to another distance changes
// its size, not its timing.
const BEAM_IMPACT_MS = 2100;

// The explosion file, measured frame by frame (24 fps, 4 s): a spark at the
// centre for two frames, then the fireball bursts out at 0.08 s and fills its
// frame by 0.2 s. It burns white to about 1 s, cools to embers by 2 s, and
// the smoke left behind is gone by 3.1 s; the rest of the file is empty.
//
// The burst-out is what has to land on the bang, so the explosion starts
// that much ahead of it — its opening spark then shows as the bead arrives.
// What the fire leaves behind comes in as it cools, before it is gone, so
// the fire never goes out and lights again.
const EXPLOSION_POP_MS = 80;
const EXPLOSION_COOLING_MS = 1500;
const EXPLOSION_GONE_MS = 3100;

// The fireball itself fills only this much of its frame across; the rest is
// glow, sparks and transparent margin. Sizes are worked out from the fire,
// not the frame, so that "covers the burst" means the flames reach its edge.
// The blazing ball left behind at the top ranks measures the same, and is
// drawn at the same size.
const EXPLOSION_DISC = 0.75;

// A blast cut short fades out over this long instead of vanishing.
const BLAST_FADE_MS = 400;

// The shockwave file (30 fps, 2.4 s): a bright point at the centre whose ring
// sweeps out to 95% of the frame by 0.75 s and is gone by 1.1 s. It starts
// with the bang.
const RING_REACH = 0.95;

// The ground files are loops with no start or end of their own, so they fade
// in and out: in as the fire above them starts to cool, out a while after it
// is gone. reach is how much of its frame each picture spans, measured on the
// files. They keep the colours they are drawn in: the ground burns cooler
// than the fireball, whatever colour that is.
const GROUND = {
  cracksCompact: { src: ASSETS.fireball.cracksCompact, reach: 0.6 },
  cracksWide: { src: ASSETS.fireball.cracksWide, reach: 0.76 },
  cracksDense: { src: ASSETS.fireball.cracksDense, reach: 0.9 },
  scorched: { src: ASSETS.fireball.scorched, reach: 0.97 }
};
const GROUND_FADE_IN_MS = 800;
const GROUND_FADE_OUT_MS = 1500;

// The flash is a real light, placed by the active GM and taken away again, so
// that the scene itself lights up around the blast — in a dark scene it shows
// whatever it lights, and what it shows is explored. A new light takes a trip
// to the server to appear, so it is put up a moment ahead of the strike. It
// dies away in steps, each a fraction of its radius at a fraction of its
// time: every step is an update all clients apply, and a few are enough for
// a flash. Lights left behind by a flash that never finished — the GM gone
// in the middle of it — are swept away when the GM next loads the scene.
const FLASH_LEAD_MS = 100;
const FLASH_FADE = [
  { at: 0.3, scale: 0.75 },
  { at: 0.6, scale: 0.5 },
  { at: 0.85, scale: 0.25 }
];

// Each sound file holds two events: the launch, a whoosh that swells from
// launchMs, and the bang, whose attack begins at bangMs and peaks within
// 30 ms. Measured on the source; the heavy and huge versions are the source
// slowed to 0.88 and 0.78 of its speed, which moves both events later by the
// same proportion. A sound is played as one piece, started a few milliseconds
// ahead of the whoosh so its attack is not clipped. Cast from off the map
// there is nothing to launch, and it starts just ahead of the bang instead.
//
// lengthMs is where the rumble has died away, inside the file, so a cut is
// never asked to run past its end, which would make Sequencer loop it. A rank
// that cuts the rumble short fades it over at most SOUND_FADE_MS.
//
// All three are mastered to about the same loudness, as loud as the source
// goes without distortion, so the ranks' volumes compare across them.
const SOUNDS = {
  normal: { src: ASSETS.fireball.sound, launchMs: 120, bangMs: 1140, lengthMs: 8000 },
  heavy: { src: ASSETS.fireball.soundHeavy, launchMs: 136, bangMs: 1295, lengthMs: 8900 },
  huge: { src: ASSETS.fireball.soundHuge, launchMs: 154, bangMs: 1462, lengthMs: 10400 }
};
const SOUND_PREROLL_MS = 10;
const SOUND_FADE_MS = 1500;

// The sound sets the pace. Started with the sequence, it reaches the bang
// this long after, and that is when the bead must strike: the blast, the bang
// and the shake all begin there. The beam file is started far enough in for
// its bead to strike at that moment, which drops the first half of the bead
// growing at the hand — two seconds of it would leave the table waiting, and
// the whoosh would be over long before anything flew.
function strikeAfterLaunch(sound) {
  return sound.bangMs - (sound.launchMs - SOUND_PREROLL_MS);
}

// One step per rank, 3 to 10. Chosen at the table from rendered previews of
// the files.
//
// colour: the files are orange; the bead, the blast and the blazing ball are
// recoloured to the rank. tint multiplies every pixel, which is
// what colours the white-hot core at the lower ranks; hue, saturate and
// brightness then go to a ColorMatrix filter, with PIXI's meaning — hue in
// degrees, saturate from -1 (grey) through 0 (unchanged), brightness as a
// multiplier. The top ranks turn the hue around instead of tinting, which
// keeps the core blinding white and moves only the edges and the cooling
// fire, to blue and then violet. glow goes to Sequencer's Glow filter.
//
// blast: cover is how far across the burst the fire reaches, 1 being exactly
// to its edge — short of it at rank 3, past it at the top. rate is playback
// speed: the low ranks rush through the file, the top ones linger. ms cuts
// the blast short with a fade; 0 plays it out.
//
// sound: which file, how loud, and how long the bang runs on before it is
// faded out; rumbleMs 0 lets it run its course. The volumes climb evenly from
// a fifth at rank 3 to full at rank 10. The files are already as loud as they
// go without distortion, so rank 10 is made to stand out by keeping the ranks
// below it quieter rather than by playing it louder.
//
// shake: how hard and for how long, or null for none.
//
// ring: the shockwave. cover is how far across the burst it sweeps, opacity
// how strongly it shows. Its file is blue, and a tint would only darken it,
// so its colour is a hue turn of its own, matched by eye to the rank's fire.
//
// ground: which ground file glows under the fire, how far across the burst
// it reaches, and how long it lingers once the fire above it is out.
//
// afterglowMs: how long the fireball keeps blazing after the blast cools.
//
// flash: a real light at the strike, in the colour of the rank's glow. feet
// is how far past the edge of the burst its bright light reaches; its dim
// light reaches as far again. luminosity and alpha (the light's colour
// intensity) are Foundry's own; ms is how long it takes to die away.
//
// dazzle: every screen overexposed at the strike, rising evenly from none at
// rank 3 to the whole screen plain white at rank 10. brightness multiplies
// the whole picture; contrast lifts the darks for it, so that black, which
// no brightness can lighten, goes too — step by step, until at rank 10
// nothing is left of the picture at all. saturate washes the colour out,
// holdMs is how long it stays blinding and fadeMs how long the eyes take to
// recover.
const RANKS = [
  { // 3: orange, cut short.
    colour: { tint: 0xff7e34, hue: -3, saturate: 0.1, brightness: 1.0 },
    blast: { cover: 0.6, rate: 1.3, ms: 1700 },
    sound: { file: "normal", volume: 0.2, rumbleMs: 1500 },
    shake: null,
    ring: null,
    ground: null,
    afterglowMs: 0,
    flash: null,
    dazzle: null
  },
  { // 4: light orange; the first shake and the first dazzle.
    colour: { tint: 0xff9a42, hue: -1, saturate: 0.1, brightness: 1.03 },
    blast: { cover: 0.69, rate: 1.2, ms: 2100 },
    sound: { file: "normal", volume: 0.31, rumbleMs: 2200 },
    shake: { strength: 3, duration: 300 },
    ring: null,
    ground: null,
    afterglowMs: 0,
    flash: null,
    dazzle: { brightness: 1.3, holdMs: 60, fadeMs: 400 }
  },
  { // 5: amber; a first glow and flash, and the ground cracks.
    colour: { tint: 0xffb450, saturate: 0.1, brightness: 1.07, glow: { color: 0xffa040, distance: 8, outerStrength: 1.5 } },
    blast: { cover: 0.78, rate: 1.1, ms: 2600 },
    sound: { file: "normal", volume: 0.43, rumbleMs: 3000 },
    shake: { strength: 5, duration: 400 },
    ring: null,
    ground: { file: "cracksCompact", cover: 0.6, lingerMs: 3000 },
    afterglowMs: 0,
    flash: { feet: 10, luminosity: 0.6, alpha: 0.5, ms: 600 },
    dazzle: { brightness: 1.7, saturate: 0.9, holdMs: 70, fadeMs: 600 }
  },
  { // 6: gold, played out in full; a shockwave.
    colour: { tint: 0xffcc62, hue: 2, saturate: 0.05, brightness: 1.12, glow: { color: 0xffc040, distance: 10, outerStrength: 2 } },
    blast: { cover: 0.88, rate: 1.0, ms: 0 },
    sound: { file: "normal", volume: 0.54, rumbleMs: 4000 },
    shake: { strength: 7, duration: 500 },
    ring: { cover: 0.85, opacity: 0.5, colour: { hue: 183, saturate: 0.2, brightness: 1.12 } },
    ground: { file: "cracksWide", cover: 0.8, lingerMs: 3500 },
    afterglowMs: 0,
    flash: { feet: 20, luminosity: 0.65, alpha: 0.55, ms: 800 },
    dazzle: { brightness: 2.2, contrast: 0.95, saturate: 0.85, holdMs: 80, fadeMs: 800 }
  },
  { // 7: pale yellow, and a heavier sound; the fire and the shockwave reach
    // the edge of the burst.
    colour: { tint: 0xffe48c, hue: 4, saturate: -0.1, brightness: 1.2, glow: { color: 0xffe080, distance: 12, outerStrength: 3 } },
    blast: { cover: 0.97, rate: 0.95, ms: 0 },
    sound: { file: "heavy", volume: 0.66, rumbleMs: 5500 },
    shake: { strength: 9, duration: 700 },
    ring: { cover: 1.0, opacity: 0.7, colour: { hue: 188, saturate: -0.3, brightness: 1.2 } },
    ground: { file: "cracksDense", cover: 0.9, lingerMs: 4000 },
    afterglowMs: 0,
    flash: { feet: 30, luminosity: 0.7, alpha: 0.6, ms: 1000 },
    dazzle: { brightness: 2.8, contrast: 0.9, saturate: 0.8, holdMs: 100, fadeMs: 1000 }
  },
  { // 8: white-hot, and still blazing after.
    colour: { saturate: -0.7, brightness: 1.3, glow: { color: 0xffffff, distance: 15, outerStrength: 4 } },
    blast: { cover: 1.06, rate: 0.9, ms: 0 },
    sound: { file: "heavy", volume: 0.77, rumbleMs: 0 },
    shake: { strength: 12, duration: 900 },
    ring: { cover: 1.1, opacity: 0.85, colour: { saturate: -0.7, brightness: 1.3 } },
    ground: { file: "cracksDense", cover: 1.0, lingerMs: 5000 },
    afterglowMs: 1500,
    flash: { feet: 45, luminosity: 0.8, alpha: 0.6, ms: 1300 },
    dazzle: { brightness: 3.5, contrast: 0.83, saturate: 0.7, holdMs: 120, fadeMs: 1300 }
  },
  { // 9: white, edged in blue, with the deepest sound; the ground under it
    // red-hot.
    colour: { tint: 0xffe4c8, hue: 185, saturate: -0.2, brightness: 1.45, glow: { color: 0x9fd8ff, distance: 20, outerStrength: 5 } },
    blast: { cover: 1.16, rate: 0.85, ms: 0 },
    sound: { file: "huge", volume: 0.89, rumbleMs: 7000 },
    shake: { strength: 15, duration: 1200 },
    ring: { cover: 1.3, opacity: 1, colour: { hue: 5, saturate: -0.2, brightness: 1.45 } },
    ground: { file: "scorched", cover: 1.0, lingerMs: 6000 },
    afterglowMs: 2500,
    flash: { feet: 70, luminosity: 0.9, alpha: 0.65, ms: 1600 },
    dazzle: { brightness: 4.5, contrast: 0.73, saturate: 0.6, holdMs: 160, fadeMs: 1700 }
  },
  { // 10: blinding white plasma edged in blue-violet, well past the burst,
    // lighting up most of the map. No blazing ball: over the red-hot ground
    // it reads as a second explosion.
    colour: { hue: 235, saturate: 0.3, brightness: 1.55, glow: { color: 0x8a78ff, distance: 30, outerStrength: 7 } },
    blast: { cover: 1.25, rate: 0.8, ms: 0 },
    sound: { file: "huge", volume: 1.0, rumbleMs: 0 },
    shake: { strength: 20, duration: 1600 },
    ring: { cover: 1.5, opacity: 1, colour: { hue: 30, saturate: 0.3, brightness: 1.55 } },
    ground: { file: "scorched", cover: 1.0, lingerMs: 7000 },
    afterglowMs: 0,
    flash: { feet: 100, luminosity: 1.0, alpha: 0.7, ms: 2000 },
    dazzle: { brightness: 6, contrast: 0, saturate: 0, holdMs: 300, fadeMs: 2500 }
  }
];

// Fireballs placed and not yet rolled for, by chat card. Every GM keeps them,
// so that whichever GM is active when the damage is rolled has them; only
// that one plays the fireball.
const placed = new Map();

// The chat card whose damage button this client pressed last, and when.
let pressed = null;

// Damage rolls whose dice are still rolling, by message id.
const rolling = new Map();

// What Dice So Nice decided about a fireball's damage message, when it
// decided before this module heard of the message.
const diceDecided = new Map();

export function registerFireball() {
  // Capturing, so the press is seen before PF2e acts on it.
  document.addEventListener("click", onButtonPressed, true);
  Hooks.on("preCreateChatMessage", markDamageCard);
  Hooks.on("createRegion", onFireballPlaced);
  Hooks.on("createChatMessage", onDamageRolled);
  Hooks.on("diceSoNiceMessageProcessed", onDiceProcessed);
  Hooks.on("diceSoNiceRollComplete", release);
  Hooks.on("canvasReady", sweepFlashes);
  return { play: playFireball };
}

function stepFor(rank) {
  const index = Math.min(Math.max(rank - BASE_RANK, 0), RANKS.length - 1);
  return RANKS[index];
}

// The centre of the burst and its radius in pixels. A burst is a circle,
// positioned by its centre.
function burstOf(region) {
  const grid = region.parent.grid;
  const shape = region.shapes[0];
  const radius = shape.radius ?? (BURST_RADIUS_FEET / grid.distance) * grid.size;
  return { centre: { x: shape.x, y: shape.y }, radius };
}

// Everything a fireball needs to go off, taken from its template while there
// is one.
function shotOf(region) {
  const { centre, radius } = burstOf(region);
  const origin = region.flags.pf2e.origin;
  return { scene: region.parent, centre, radius, rank: origin.castRank ?? BASE_RANK, actor: origin.actor };
}

// The caster's token on the scene the fireball is on. The damage roll names
// the token it was rolled from; failing that, an unlinked caster's actor
// lives inside its token, and a linked one is found by its id. No token there
// — cast from off the map — means no bead, only the blast.
async function casterToken({ scene, actor: uuid, tokenId }) {
  const named = tokenId && scene.tokens.get(tokenId);
  if (named) return named;

  const actor = uuid ? await fromUuid(uuid) : null;
  if (!actor) return null;
  if (actor.isToken) return actor.token?.parent === scene ? actor.token : null;
  return scene.tokens.find((t) => t.actorId === actor.id) ?? null;
}

// The beam file whose length is nearest the distance by ratio rather than by
// difference: stretching 30 feet to 40 and squeezing 60 to 40 are judged by
// how far each is pulled out of shape, not by the raw number of feet.
function beamFor(feet) {
  const off = (b) => Math.abs(Math.log(b.feet / Math.max(feet, 1)));
  return ASSETS.fireball.beams.reduce((best, b) => (off(b) < off(best) ? b : best)).src;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The rank's flash: a light put up at the strike, shrunk step by step and
// taken away. Gives up quietly if someone deletes it first.
async function flashLight({ scene, centre, radius }, step, strikeMs) {
  const { flash } = step;
  const bright = radius / scene.grid.size * scene.grid.distance + flash.feet;
  const dim = bright + flash.feet;
  const colour = step.colour.glow?.color ?? 0xffffff;

  await wait(Math.max(strikeMs - FLASH_LEAD_MS, 0));
  const [light] = await scene.createEmbeddedDocuments("AmbientLight", [{
    x: centre.x,
    y: centre.y,
    config: {
      bright,
      dim,
      color: `#${colour.toString(16).padStart(6, "0")}`,
      alpha: flash.alpha,
      luminosity: flash.luminosity
    },
    flags: { [MOD]: { flash: true } }
  }]);

  let elapsed = 0;
  for (const { at, scale } of FLASH_FADE) {
    await wait(flash.ms * at - elapsed);
    elapsed = flash.ms * at;
    if (!scene.lights.has(light.id)) return;
    await light.update({ "config.bright": bright * scale, "config.dim": dim * scale });
  }
  await wait(flash.ms - elapsed);
  if (scene.lights.has(light.id)) await light.delete();
}

// Flash lights left on the scene the active GM has just loaded.
function sweepFlashes() {
  if (game.user !== game.users.activeGM || !canvas.scene) return;
  const stray = canvas.scene.lights.filter((l) => l.getFlag(MOD, "flash")).map((l) => l.id);
  if (stray.length) canvas.scene.deleteEmbeddedDocuments("AmbientLight", stray).catch(report);
}

// Gives an effect a colour. The bead, the blast and the blazing ball all get
// the rank's, so they read as one fire. Keys left out are left out of the
// filter, and change nothing.
function paint(effect, { tint, hue, saturate, brightness, glow }) {
  if (tint !== undefined) effect.tint(tint);
  effect.filter("ColorMatrix", { hue, saturate, brightness });
  if (glow) effect.filter("Glow", glow);
  return effect;
}

function isFireballDamage(message) {
  const pf2e = message?.flags?.pf2e;
  return pf2e?.context?.type === "damage-roll" && (pf2e.origin?.rollOptions ?? []).includes(SLUG);
}

// On the client of whoever presses a damage button on a chat card.
function onButtonPressed(event) {
  const card = event.target.closest?.(DAMAGE_BUTTON)?.closest("[data-message-id]");
  if (card) pressed = { card: card.dataset.messageId, at: Date.now() };
}

// Still on that client, as the roll it started becomes a message: the card
// is written into it, for the active GM to read.
function markDamageCard(message) {
  if (!pressed || !isFireballDamage(message)) return;
  if (Date.now() - pressed.at <= PRESS_HELD_MS) {
    message.updateSource({ [`flags.${MOD}.card`]: pressed.card });
  }
  pressed = null;
}

// Placing the template and rolling the damage are things every client hears
// about. The GMs keep track of them; only the active GM plays the fireball,
// and Sequencer shows it to everyone. A template placed again from the same
// card replaces the one before.
function onFireballPlaced(region) {
  if (!game.user.isGM) return;
  const card = region.flags?.pf2e?.messageId;
  if (!(region.flags?.pf2e?.origin?.rollOptions ?? []).includes(SLUG) || !card) return;
  placed.set(card, shotOf(region));
}

// The damage of a placed fireball has been rolled. Without Dice So Nice, or
// when it has already said it will not animate these dice, the fireball goes
// off at once; otherwise once the dice land.
function onDamageRolled(message) {
  if (!game.user.isGM) return;
  if (!isFireballDamage(message)) return;
  const decided = diceDecided.get(message.id);
  diceDecided.delete(message.id);

  const card = message.flags[MOD]?.card;
  const shot = card && placed.get(card);
  if (!shot) return;
  placed.delete(card);
  if (game.user !== game.users.activeGM) return;

  const { origin, context } = message.flags.pf2e;
  shot.rank = origin.castRank ?? shot.rank;
  shot.tokenId = context.token;

  if (!game.modules.get(DSN)?.active || decided === false) {
    fire(shot);
    return;
  }
  rolling.set(message.id, { shot, timer: setTimeout(() => release(message.id), DICE_WAIT_MS) });
}

// Dice So Nice has decided whether this client animates a message's dice. It
// may decide before or after this module hears of the message.
function onDiceProcessed(messageId, interception) {
  if (game.user !== game.users.activeGM) return;
  if (rolling.has(messageId)) {
    if (!interception.willTrigger3DRoll) release(messageId);
    return;
  }
  if (isFireballDamage(game.messages.get(messageId))) {
    diceDecided.set(messageId, interception.willTrigger3DRoll);
  }
}

// The dice of a damage roll have landed, or will not be shown, or were
// waited for long enough.
function release(messageId) {
  const waiting = rolling.get(messageId);
  if (!waiting) return;
  rolling.delete(messageId);
  clearTimeout(waiting.timer);
  fire(waiting.shot);
}

function fire(shot) {
  playFireball(shot).catch(report);
}

async function playFireball(shot) {
  const grid = shot.scene.grid;
  const { centre, radius } = shot;
  const diameterSquares = (2 * radius) / grid.size;
  const step = stepFor(shot.rank);
  const caster = await casterToken(shot);
  const size = diameterSquares * step.blast.cover / EXPLOSION_DISC;

  const seq = new Sequence();

  // Everything is added without waiting, so it all starts together, and each
  // part is held back to its own moment. strikeMs is the bang: the bead
  // reaches the centre, the fireball bursts out and the view shakes. The
  // explosion's speed changes with the rank, and its burst-out with it. The
  // beam file plays on past the strike — its own flash and fading trail run
  // under the blast. Cast from off the map there is no flight, and the strike
  // comes as soon as the explosion can reach it.
  const sound = SOUNDS[step.sound.file];
  const rate = step.blast.rate;
  const popMs = EXPLOSION_POP_MS / rate;
  const strikeMs = caster ? strikeAfterLaunch(sound) : popMs;
  const blastMs = strikeMs - popMs;
  const coolMs = blastMs + EXPLOSION_COOLING_MS / rate;
  const blastEndMs = blastMs + (step.blast.ms || EXPLOSION_GONE_MS / rate);
  const afterglowEndMs = step.afterglowMs ? coolMs + step.afterglowMs : 0;

  if (caster) {
    const from = caster.getCenterPoint();
    const feet = Math.hypot(centre.x - from.x, centre.y - from.y) / grid.size * grid.distance;

    paint(seq.effect(), step.colour)
      .file(beamFor(feet))
      .startTime(BEAM_IMPACT_MS - strikeMs)
      .atLocation(from)
      .stretchTo(centre)
      .template(BEAM_TEMPLATE);
  }

  // Held back so that the bang in it falls on the strike — no wait at all
  // when it starts with the whoosh.
  const soundFrom = (caster ? sound.launchMs : sound.bangMs) - SOUND_PREROLL_MS;
  const playable = sound.lengthMs - sound.bangMs;
  const rumbleMs = step.sound.rumbleMs ? Math.min(step.sound.rumbleMs, playable) : playable;
  addSound(seq, sound.src, {
    volume: step.sound.volume,
    startMs: soundFrom,
    durationMs: sound.bangMs - soundFrom + rumbleMs,
    fadeOutMs: rumbleMs < playable ? Math.min(SOUND_FADE_MS, rumbleMs / 2) : 0,
    delayMs: strikeMs - (sound.bangMs - soundFrom)
  });

  const users = shakeUsers();
  if (step.shake && users.length) {
    seq.canvasPan()
      .delay(strikeMs)
      .shake({ ...step.shake, fadeOutDuration: step.shake.duration / 2, rotation: false })
      .forUsers(users);
  }

  if (step.ring) {
    paint(seq.effect(), step.ring.colour)
      .file(ASSETS.fireball.shockwave)
      .delay(strikeMs)
      .atLocation(centre)
      .size(diameterSquares * step.ring.cover / RING_REACH, { gridUnits: true })
      .opacity(step.ring.opacity)
      .zIndex(0);
  }

  const blast = paint(seq.effect(), step.colour)
    .file(ASSETS.fireball.explosion)
    .delay(blastMs)
    .atLocation(centre)
    .size(size, { gridUnits: true })
    .playbackRate(rate)
    .randomRotation()
    .zIndex(1);
  if (step.blast.ms) blast.duration(step.blast.ms).fadeOut(BLAST_FADE_MS);

  if (step.afterglowMs) {
    paint(seq.effect(), step.colour)
      .file(ASSETS.fireball.afterglow)
      .delay(coolMs)
      .atLocation(centre)
      .size(size, { gridUnits: true })
      .duration(step.afterglowMs)
      .fadeIn(600)
      .fadeOut(800)
      .belowTokens()
      .zIndex(1);
  }

  // The ground glows from when the fire above it starts to cool until a while
  // after it is out.
  if (step.ground) {
    const ground = GROUND[step.ground.file];
    const fireOutMs = Math.max(blastEndMs, afterglowEndMs);
    seq.effect()
      .file(ground.src)
      .delay(coolMs)
      .atLocation(centre)
      .size(diameterSquares * step.ground.cover / ground.reach, { gridUnits: true })
      .duration(fireOutMs + step.ground.lingerMs - coolMs)
      .fadeIn(GROUND_FADE_IN_MS)
      .fadeOut(GROUND_FADE_OUT_MS)
      .randomRotation()
      .belowTokens()
      .zIndex(0);
  }

  if (step.flash) flashLight(shot, step, strikeMs).catch(report);
  if (step.dazzle) dazzle({ ...step.dazzle, delayMs: strikeMs });
  await seq.play();
}

function report(err) {
  console.error(`${MOD} | fireball`, err);
  ui.notifications.error(`Fireball: ${err.message}`);
}
