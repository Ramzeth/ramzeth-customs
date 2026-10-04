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
// from a red pop to a blinding white ball of plasma edged in violet, and grows
// in size, length, loudness, glow and shake; from rank 4 on it leaves fire
// behind — burning patches, then glowing cracks and a shockwave, then the
// fireball blazing on over red-hot ground. Everyone's view shakes, except
// users marked noShake.
//
// The spell itself needs no edit: PF2e already puts a template button on its
// chat card. Any Automated Animations autorec entry for Fireball has to go,
// or both animations play.

import { ASSETS } from "../assets.js";
import { MOD } from "../const.js";
import { addSound, shakeUsers } from "../lib/effects.js";

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
// in and out. reach is how much of its frame each picture spans, measured on
// the files. They keep the colours they are drawn in: the ground burns cooler
// than the fireball, whatever colour that is.
const GROUND = {
  cracksCompact: { src: ASSETS.fireball.cracksCompact, reach: 0.6 },
  cracksWide: { src: ASSETS.fireball.cracksWide, reach: 0.76 },
  cracksDense: { src: ASSETS.fireball.cracksDense, reach: 0.9 },
  scorched: { src: ASSETS.fireball.scorched, reach: 0.97 }
};
const GROUND_FADE_IN_MS = 800;
const GROUND_FADE_OUT_MS = 1500;

// The flame file is a loop one square of fire across, spanning 48% of its
// frame. Each patch is drawn a little wider than its square so neighbours
// meet, nudged off the square's centre so they do not line up, and started
// and ended a little apart from the others so the fire dies down patch by
// patch. The flames are the last of the fire: they come up as everything
// above them goes out, and the ground smoulders under them until the last
// one is gone.
const FLAME_REACH = 0.48;
const FLAME_SQUARES = 1.2;
const FLAME_JITTER_SQUARES = 0.15;
const FLAME_LEAD_MS = 500;
const FLAME_STAGGER_MS = 800;
const FLAME_SPREAD = 0.2;
const FLAME_FADE_IN_MS = 500;
const FLAME_FADE_OUT_MS = 1200;

// The sound file holds two events, measured on it: the launch, a whoosh that
// swells from 0.12 s, and the bang, whose attack begins at 1.14 s and peaks
// within 30 ms. It is played as one piece, started a few milliseconds ahead
// of the whoosh so its attack is not clipped. Cast from off the map there is
// nothing to launch, and it starts just ahead of the bang instead.
//
// The audible sound ends near 7.4 s; the file runs on in silence to about
// 8.7 s. SOUND_LENGTH_MS stays inside the file, so a cut is never asked to
// run past its end, which would make Sequencer loop it. A rank that cuts the
// rumble short fades it over at most SOUND_FADE_MS.
const SOUND_LENGTH_MS = 8000;
const SOUND_LAUNCH_MS = 120;
const SOUND_BANG_MS = 1140;
const SOUND_PREROLL_MS = 10;
const SOUND_FADE_MS = 1500;

// The sound sets the pace. Started with the sequence, it reaches the bang
// STRIKE_MS later, and that is when the bead must strike: the blast, the bang
// and the shake all begin there. The beam file is started far enough in for
// its bead to strike at that moment, which drops the first half of the bead
// growing at the hand — two seconds of it would leave the table waiting, and
// the whoosh would be over long before anything flew.
const STRIKE_MS = SOUND_BANG_MS - (SOUND_LAUNCH_MS - SOUND_PREROLL_MS);
const BEAM_SKIP_MS = BEAM_IMPACT_MS - STRIKE_MS;

// One step per rank, 3 to 10. Chosen at the table from rendered previews of
// the files.
//
// colour: the files are orange; the bead, the blast, the blazing ball and the
// flames are recoloured to the rank. tint multiplies every pixel, which is
// what colours the white-hot core at the lower ranks; hue, saturate and
// brightness then go to a ColorMatrix filter, with PIXI's meaning — hue in
// degrees, saturate from -1 (grey) through 0 (unchanged), brightness as a
// multiplier. The top ranks turn the hue around instead of tinting, which
// keeps the core blinding white and moves only the edges and the cooling
// fire, to blue and then violet. glow goes to Sequencer's Glow filter; the
// flames go without it, there being too many of them to filter twice.
//
// blast: cover is how far across the burst the fire reaches, 1 being exactly
// to its edge — short of it at rank 3, past it at the top. rate is playback
// speed: the low ranks rush through the file, the top ones linger. ms cuts
// the blast short with a fade; 0 plays it out.
//
// sound: rumbleMs is how long the bang runs on before it is faded out; 0
// lets it run to the end of the file.
//
// shake: how hard and for how long, or null for none.
//
// ring: the shockwave. cover is how far across the burst it sweeps, opacity
// how strongly it shows. Its file is blue, and a tint would only darken it,
// so its colour is a hue turn of its own, matched by eye to the rank's fire.
//
// ground: which ground file glows under the fire, and how far across the
// burst it reaches.
//
// afterglowMs: how long the fireball keeps blazing after the blast cools.
//
// flames: how many patches of fire are left burning and for how long. The
// first is at the centre; the rest fall on squares of the burst at random,
// and a count beyond the burst's squares means every square.
const RANKS = [
  { // 3: a red pop, over in a second.
    colour: { tint: 0xd8401f, hue: -8, saturate: 0.2, brightness: 0.9 },
    blast: { cover: 0.6, rate: 1.5, ms: 1000 },
    sound: { volume: 0.3, rumbleMs: 600 },
    shake: null,
    ring: null,
    ground: null,
    afterglowMs: 0,
    flames: null
  },
  { // 4: red-orange; a patch of fire left at the centre.
    colour: { tint: 0xec5a24, hue: -6, saturate: 0.15, brightness: 0.95 },
    blast: { cover: 0.69, rate: 1.4, ms: 1300 },
    sound: { volume: 0.4, rumbleMs: 1000 },
    shake: { strength: 3, duration: 300 },
    ring: null,
    ground: null,
    afterglowMs: 0,
    flames: { count: 1, ms: 2000 }
  },
  { // 5: orange; a first glow, and the ground cracks.
    colour: { tint: 0xff7e34, hue: -3, saturate: 0.1, brightness: 1.0, glow: { color: 0xff6a28, distance: 8, outerStrength: 1.5 } },
    blast: { cover: 0.78, rate: 1.3, ms: 1700 },
    sound: { volume: 0.5, rumbleMs: 1500 },
    shake: { strength: 5, duration: 400 },
    ring: null,
    ground: { file: "cracksCompact", cover: 0.6 },
    afterglowMs: 0,
    flames: { count: 2, ms: 2500 }
  },
  { // 6: amber; a shockwave.
    colour: { tint: 0xffa448, saturate: 0.1, brightness: 1.05, glow: { color: 0xff8a30, distance: 10, outerStrength: 2 } },
    blast: { cover: 0.88, rate: 1.2, ms: 2100 },
    sound: { volume: 0.6, rumbleMs: 2200 },
    shake: { strength: 7, duration: 500 },
    ring: { cover: 0.85, opacity: 0.5, colour: { hue: 180, saturate: 0.1, brightness: 1.05 } },
    ground: { file: "cracksWide", cover: 0.8 },
    afterglowMs: 0,
    flames: { count: 4, ms: 3000 }
  },
  { // 7: yellow; the fire and the shockwave reach the edge of the burst.
    colour: { tint: 0xffd670, hue: 4, brightness: 1.2, glow: { color: 0xffc840, distance: 12, outerStrength: 3 } },
    blast: { cover: 0.97, rate: 1.1, ms: 2600 },
    sound: { volume: 0.7, rumbleMs: 3000 },
    shake: { strength: 9, duration: 700 },
    ring: { cover: 1.0, opacity: 0.7, colour: { hue: 195, saturate: 0.2, brightness: 1.2 } },
    ground: { file: "cracksDense", cover: 0.9 },
    afterglowMs: 0,
    flames: { count: 8, ms: 3500 }
  },
  { // 8: white-hot, played out in full, and still blazing after.
    colour: { saturate: -0.7, brightness: 1.3, glow: { color: 0xffffff, distance: 15, outerStrength: 4 } },
    blast: { cover: 1.06, rate: 1.0, ms: 0 },
    sound: { volume: 0.8, rumbleMs: 4000 },
    shake: { strength: 12, duration: 900 },
    ring: { cover: 1.1, opacity: 0.85, colour: { saturate: -0.7, brightness: 1.3 } },
    ground: { file: "cracksDense", cover: 1.0 },
    afterglowMs: 1500,
    flames: { count: 14, ms: 4000 }
  },
  { // 9: white, edged in blue; the ground under it red-hot.
    colour: { tint: 0xffe4c8, hue: 185, saturate: -0.2, brightness: 1.45, glow: { color: 0x9fd8ff, distance: 20, outerStrength: 5 } },
    blast: { cover: 1.16, rate: 0.95, ms: 0 },
    sound: { volume: 0.9, rumbleMs: 5000 },
    shake: { strength: 15, duration: 1200 },
    ring: { cover: 1.3, opacity: 1, colour: { hue: 5, saturate: -0.2, brightness: 1.45 } },
    ground: { file: "scorched", cover: 1.0 },
    afterglowMs: 2500,
    flames: { count: 26, ms: 5000 }
  },
  { // 10: blinding white plasma edged in blue-violet, well past the burst,
    // and every square of it left burning.
    colour: { hue: 235, saturate: 0.3, brightness: 1.55, glow: { color: 0x8a78ff, distance: 30, outerStrength: 7 } },
    blast: { cover: 1.25, rate: 0.9, ms: 0 },
    sound: { volume: 1.0, rumbleMs: 0 },
    shake: { strength: 20, duration: 1600 },
    ring: { cover: 1.5, opacity: 1, colour: { hue: 30, saturate: 0.3, brightness: 1.55 } },
    ground: { file: "scorched", cover: 1.0 },
    afterglowMs: 4000,
    flames: { count: Infinity, ms: 6000 }
  }
];

// Fireballs placed and not yet rolled for, by chat card. Kept on the active
// GM's client only, which is where they are played from.
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

// The centres of the squares whose centres lie inside the burst.
function squaresIn(grid, centre, radius) {
  const reach = Math.ceil(radius / grid.size) + 1;
  const { i, j } = grid.getOffset(centre);
  const squares = [];
  for (let di = -reach; di <= reach; di++) {
    for (let dj = -reach; dj <= reach; dj++) {
      const point = grid.getCenterPoint({ i: i + di, j: j + dj });
      if (Math.hypot(point.x - centre.x, point.y - centre.y) <= radius) squares.push(point);
    }
  }
  return squares;
}

// Where the patches of fire go: the centre first, then squares at random,
// or every square when there are not enough of them to choose from.
function flameSpots(grid, centre, radius, count) {
  const squares = squaresIn(grid, centre, radius);
  if (count >= squares.length) return squares;
  for (let k = squares.length - 1; k > 0; k--) {
    const r = Math.floor(Math.random() * (k + 1));
    [squares[k], squares[r]] = [squares[r], squares[k]];
  }
  return [centre, ...squares.slice(0, count - 1)];
}

// A random number between -1 and 1.
function wobble() {
  return Math.random() * 2 - 1;
}

// Gives an effect a colour. The bead, the blast, the blazing ball and the
// flames all get the rank's, so they read as one fire. Keys left out are
// left out of the filter, and change nothing.
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
// about; only the active GM acts on them, and Sequencer shows the fireball to
// everyone. A template placed again from the same card replaces the one
// before.
function onFireballPlaced(region) {
  if (game.user !== game.users.activeGM) return;
  const card = region.flags?.pf2e?.messageId;
  if (!(region.flags?.pf2e?.origin?.rollOptions ?? []).includes(SLUG) || !card) return;
  placed.set(card, shotOf(region));
}

// The damage of a placed fireball has been rolled. Without Dice So Nice, or
// when it has already said it will not animate these dice, the fireball goes
// off at once; otherwise once the dice land.
function onDamageRolled(message) {
  if (game.user !== game.users.activeGM) return;
  if (!isFireballDamage(message)) return;
  const decided = diceDecided.get(message.id);
  diceDecided.delete(message.id);

  const card = message.flags[MOD]?.card;
  const shot = card && placed.get(card);
  if (!shot) return;
  placed.delete(card);

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
  const rate = step.blast.rate;
  const popMs = EXPLOSION_POP_MS / rate;
  const strikeMs = caster ? STRIKE_MS : popMs;
  const blastMs = strikeMs - popMs;
  const coolMs = blastMs + EXPLOSION_COOLING_MS / rate;
  const blastEndMs = blastMs + (step.blast.ms || EXPLOSION_GONE_MS / rate);
  const afterglowEndMs = step.afterglowMs ? coolMs + step.afterglowMs : 0;

  if (caster) {
    const from = caster.getCenterPoint();
    const feet = Math.hypot(centre.x - from.x, centre.y - from.y) / grid.size * grid.distance;

    paint(seq.effect(), step.colour)
      .file(beamFor(feet))
      .startTime(BEAM_SKIP_MS)
      .atLocation(from)
      .stretchTo(centre)
      .template(BEAM_TEMPLATE);
  }

  // Held back so that the bang in it falls on the strike — no wait at all
  // when it starts with the whoosh.
  const soundFrom = (caster ? SOUND_LAUNCH_MS : SOUND_BANG_MS) - SOUND_PREROLL_MS;
  const playable = SOUND_LENGTH_MS - SOUND_BANG_MS;
  const rumbleMs = step.sound.rumbleMs ? Math.min(step.sound.rumbleMs, playable) : playable;
  addSound(seq, ASSETS.fireball.sound, {
    volume: step.sound.volume,
    startMs: soundFrom,
    durationMs: SOUND_BANG_MS - soundFrom + rumbleMs,
    fadeOutMs: rumbleMs < playable ? Math.min(SOUND_FADE_MS, rumbleMs / 2) : 0,
    delayMs: strikeMs - (SOUND_BANG_MS - soundFrom)
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

  // The flames come up as the fire above them goes out.
  let fireOutMs = blastEndMs;
  if (step.flames) {
    const flameColour = { ...step.colour, glow: null };
    const flamesMs = Math.max(blastEndMs, afterglowEndMs) - FLAME_LEAD_MS;
    const jitter = FLAME_JITTER_SQUARES * grid.size;

    for (const spot of flameSpots(grid, centre, radius, step.flames.count)) {
      const startMs = flamesMs + Math.random() * FLAME_STAGGER_MS;
      const lifeMs = step.flames.ms * (1 + wobble() * FLAME_SPREAD);
      fireOutMs = Math.max(fireOutMs, startMs + lifeMs);

      paint(seq.effect(), flameColour)
        .file(ASSETS.fireball.flame)
        .delay(startMs)
        .atLocation({ x: spot.x + wobble() * jitter, y: spot.y + wobble() * jitter })
        .size(FLAME_SQUARES / FLAME_REACH, { gridUnits: true })
        .duration(lifeMs)
        .fadeIn(FLAME_FADE_IN_MS)
        .fadeOut(FLAME_FADE_OUT_MS)
        .belowTokens()
        .zIndex(2);
    }
  }

  // The ground glows from when the fire starts to cool until the last flame
  // is out.
  if (step.ground) {
    const ground = GROUND[step.ground.file];
    seq.effect()
      .file(ground.src)
      .delay(coolMs)
      .atLocation(centre)
      .size(diameterSquares * step.ground.cover / ground.reach, { gridUnits: true })
      .duration(fireOutMs + GROUND_FADE_OUT_MS / 2 - coolMs)
      .fadeIn(GROUND_FADE_IN_MS)
      .fadeOut(GROUND_FADE_OUT_MS)
      .randomRotation()
      .belowTokens()
      .zIndex(0);
  }

  await seq.play();
}

function report(err) {
  console.error(`${MOD} | fireball`, err);
  ui.notifications.error(`Fireball: ${err.message}`);
}
