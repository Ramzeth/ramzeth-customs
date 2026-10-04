// Fireball (PF2e, rank 3).
//
// The spell's rules are untouched; this is its animation, played by the
// module rather than Automated Animations so that it can grow with the rank
// the spell is cast at. Placing the burst template is the trigger: a bead of
// fire flies from the caster to the centre of the burst, explodes to fill it,
// and at higher ranks bursts again, burns hotter and leaves flames behind.
// Everyone's view shakes, except users marked noShake.
//
// The spell itself needs no edit: PF2e already puts a template button on its
// chat card. Any Automated Animations autorec entry for Fireball has to go,
// or both animations play.

import { ASSETS } from "../assets.js";
import { MOD } from "../const.js";
import { addSound, shakeUsers } from "../lib/effects.js";

const SLUG = "origin:item:slug:fireball";
const BASE_RANK = 3;

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
// The flames left behind at higher ranks fade in as the fireball cools,
// before it is gone, so the fire never goes out and lights again.
const EXPLOSION_POP_MS = 80;
const EXPLOSION_COOLING_MS = 1500;

// How much of the burst the explosion frame covers. 1 means the frame matches
// the burst exactly; the flames themselves stop a little short of its edge.
const EXPLOSION_FILL = 1.0;

const GLOW_COLOR = 0xff7a1a;
const SHAKE_MS = 500;

// The sound file holds two events, measured on it: the launch, a whoosh that
// swells from 0.12 s, and the bang, whose attack begins at 1.14 s and peaks
// within 30 ms.
//
// It is played through without a gap, but as two pieces so each comes from
// where it happens: the launch from the caster, the bang from the centre. The
// first piece starts a few milliseconds ahead of the whoosh so its attack is
// not clipped, and the second takes over where the first stops.
//
// The audible sound ends near 7.4 s; the file runs on in silence to about
// 8.7 s. SOUND_LENGTH_MS stays inside the file, so a cut is never asked to
// run past its end, which would make Sequencer loop it. Lower ranks cut the
// bang short with a fade, since their blast is over in a couple of seconds
// and a long rumble over an empty map sounds detached from it.
const SOUND_LENGTH_MS = 8000;
const SOUND_LAUNCH_MS = 120;
const SOUND_BANG_MS = 1140;
const SOUND_PREROLL_MS = 10;
const SOUND_FADE_MS = 1500;

// Where the launch piece hands over to the bang: just ahead of the bang's
// attack, in the lull where the file is near silent. The launch piece fades
// into it so the cut does not click.
const SOUND_HANDOVER_MS = SOUND_BANG_MS - SOUND_PREROLL_MS;
const SOUND_LAUNCH_FADE_MS = 150;

// The sound sets the pace. With the launch piece starting the sequence, the
// bang lands STRIKE_MS later, and that is when the bead must strike: the
// blast, the bang and the shake all begin there. The beam file is started
// far enough in for its bead to strike at that moment, which drops the first
// half of the bead growing at the hand — two seconds of it would leave the
// table waiting, and the whoosh would be over long before anything flew.
const STRIKE_MS = SOUND_BANG_MS - (SOUND_LAUNCH_MS - SOUND_PREROLL_MS);
const BEAM_SKIP_MS = BEAM_IMPACT_MS - STRIKE_MS;

// A fireball is loud: heard well beyond its own burst.
const SOUND_RADIUS_SQUARES = 30;

// What each rank looks like and sounds like. The size never changes — a
// fireball is a 20-foot burst at every rank, and a bigger blast would read at
// the table as a bigger area. Rank shows instead in speed, glow, repeated
// blasts, lingering flames, how hard the view shakes and how long and loud
// the sound runs.
const TIERS = [
  { upTo: 4,  rate: 1.0,  glow: false, bursts: 1, afterglowMs: 0,    shake: 6,  volume: 0.7, soundMs: 3000 },
  { upTo: 6,  rate: 1.1,  glow: true,  bursts: 1, afterglowMs: 0,    shake: 9,  volume: 0.8, soundMs: 4000 },
  { upTo: 8,  rate: 1.15, glow: true,  bursts: 2, afterglowMs: 1500, shake: 12, volume: 0.9, soundMs: 5000 },
  { upTo: 10, rate: 1.25, glow: true,  bursts: 3, afterglowMs: 3000, shake: 15, volume: 1.0, soundMs: 6000 }
];

export function registerFireball() {
  Hooks.on("createRegion", onFireballPlaced);
  return { play: playFireball };
}

function tierFor(rank) {
  return TIERS.find((t) => rank <= t.upTo) ?? TIERS.at(-1);
}

// The centre of the burst and its width in squares of the scene it is on.
// A burst is a circle, positioned by its centre.
function burstOf(region) {
  const grid = region.parent.grid;
  const shape = region.shapes[0];
  const radius = shape.radius ?? (BURST_RADIUS_FEET / grid.distance) * grid.size;
  return {
    centre: { x: shape.x, y: shape.y },
    diameterSquares: (2 * radius) / grid.size
  };
}

// The caster's token on the scene the template was placed on. An unlinked
// caster's actor lives inside its token; a linked one is found by its id.
// No token there — cast from off the map — means no bead, only the blast.
async function casterToken(region) {
  const uuid = region.flags?.pf2e?.origin?.actor;
  const actor = uuid ? await fromUuid(uuid) : null;
  if (!actor) return null;

  if (actor.isToken) return actor.token?.parent === region.parent ? actor.token : null;
  return region.parent.tokens.find((t) => t.actorId === actor.id) ?? null;
}

// The beam file whose length is nearest the distance by ratio rather than by
// difference: stretching 30 feet to 40 and squeezing 60 to 40 are judged by
// how far each is pulled out of shape, not by the raw number of feet.
function beamFor(feet) {
  const off = (b) => Math.abs(Math.log(b.feet / Math.max(feet, 1)));
  return ASSETS.fireball.beams.reduce((best, b) => (off(b) < off(best) ? b : best)).src;
}

// Placing the template is something every client hears about; only the
// active GM plays the animation, and Sequencer shows it to everyone.
function onFireballPlaced(region) {
  if (game.user !== game.users.activeGM) return;
  if (!(region.flags?.pf2e?.origin?.rollOptions ?? []).includes(SLUG)) return;
  playFireball(region).catch(report);
}

async function playFireball(region) {
  const grid = region.parent.grid;
  const { centre, diameterSquares } = burstOf(region);
  const tier = tierFor(region.flags?.pf2e?.origin?.castRank ?? BASE_RANK);
  const caster = await casterToken(region);
  const size = diameterSquares * EXPLOSION_FILL;

  const seq = new Sequence();

  // Everything is added without waiting, so it all starts together, and each
  // part is held back to its own moment. strikeMs is the bang: the bead
  // reaches the centre, the fireball bursts out and the view shakes. The
  // explosion is played faster at higher ranks, so its burst-out comes
  // sooner after it starts. The beam file plays on past the strike — its own
  // flash and fading trail run under the blast. Cast from off the map there
  // is no flight, and the strike comes as soon as the explosion can reach it.
  const popMs = EXPLOSION_POP_MS / tier.rate;
  const strikeMs = caster ? STRIKE_MS : popMs;
  const blastMs = strikeMs - popMs;

  if (caster) {
    const from = caster.getCenterPoint();
    const feet = Math.hypot(centre.x - from.x, centre.y - from.y) / grid.size * grid.distance;

    addSound(seq, ASSETS.fireball.sound, from, {
      volume: tier.volume,
      radiusSquares: SOUND_RADIUS_SQUARES,
      startMs: SOUND_LAUNCH_MS - SOUND_PREROLL_MS,
      endMs: SOUND_HANDOVER_MS,
      fadeOutMs: SOUND_LAUNCH_FADE_MS
    });

    seq.effect()
      .file(beamFor(feet))
      .startTime(BEAM_SKIP_MS)
      .atLocation(from)
      .stretchTo(centre)
      .template(BEAM_TEMPLATE);
  }

  const playable = SOUND_LENGTH_MS - SOUND_HANDOVER_MS;
  addSound(seq, ASSETS.fireball.sound, centre, {
    volume: tier.volume,
    radiusSquares: SOUND_RADIUS_SQUARES,
    startMs: SOUND_HANDOVER_MS,
    durationMs: Math.min(tier.soundMs, playable),
    fadeOutMs: tier.soundMs < playable ? SOUND_FADE_MS : 0,
    delayMs: strikeMs - SOUND_PREROLL_MS
  });

  const users = shakeUsers();
  if (users.length) {
    seq.canvasPan()
      .delay(strikeMs)
      .shake({ strength: tier.shake, duration: SHAKE_MS, rotation: false })
      .forUsers(users);
  }

  const blast = seq.effect()
    .file(ASSETS.fireball.explosion)
    .delay(blastMs)
    .atLocation(centre)
    .size(size, { gridUnits: true })
    .playbackRate(tier.rate)
    .randomRotation()
    .repeats(tier.bursts, 150, 350);
  if (tier.glow) blast.filter("Glow", { color: GLOW_COLOR });

  if (tier.afterglowMs) {
    seq.effect()
      .file(ASSETS.fireball.afterglow)
      .delay(blastMs + EXPLOSION_COOLING_MS / tier.rate)
      .atLocation(centre)
      .size(size, { gridUnits: true })
      .duration(tier.afterglowMs)
      .fadeIn(600)
      .fadeOut(800)
      .belowTokens();
  }

  await seq.play();
}

function report(err) {
  console.error(`${MOD} | fireball`, err);
  ui.notifications.error(`Fireball: ${err.message}`);
}
