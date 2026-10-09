// Ember Doppelgänger (PF2e, rank 5, Impossible Magic).
//
// The caster summons a duplicate of their own form made of ash and glowing
// embers, wrapped in smoke — the Ember Hussar — which Strides and hurls a
// burst of fire each time the spell is cast or sustained.
//
// The player places the Hussar from the @Template link added to the spell's
// description, a single square, and that square becomes the Hussar straight
// away:
//
// - A new actor for each cast (lib/spell-actors.js keeps it in its folder and
//   deletes it once its token is gone), with the duplicate's statistics.
// - A token named only "Ember Hussar", wearing the caster's own token picture,
//   size and side, drawn as ash and smouldering embers in a haze of smoke
//   (EMBER_SHADER below, put on the token by lib/token-shader.js on every
//   client), and giving off a little flickering firelight.
// - The spell's effect on the caster for its minute. When the effect ends —
//   run out, or removed by hand — the Hussar goes; when the Hussar is
//   destroyed or its token deleted, the effect goes with it.
//
// The spell's burst stays PF2e's own template. When its damage is rolled from
// the spell's card, the Hussar hurls a fireball at it: Fireball's own
// animation, sound, light, shake and dazzle (spells/fireball.js), set off the
// same way (lib/damage-burst.js), drawn to the 10-foot burst instead of the
// 20-foot one, and looking like the fireball of the same damage.
//
// Sustaining the spell goes through PF2e Auto Action Tracker (lib/sustain.js).
// Choosing Sustain posts the spell's own card again, at the rank it was cast
// and as the user who cast it, for the Hussar's next blast: its burst to
// place and its damage to roll, with targets and saves as on any spell card.
// The card is tied to the cast it sustains, so its square summons no second
// Hussar and its fireball is hurled by the cast's Hussar. Letting the spell
// lapse deletes the caster's effect, and the Hussar goes with it.
//
// The caster's effect runs on a PF2e timer and is removed by PF2e when it runs
// out, never by the module, for the same reason as Stagnate Time's: both
// would delete it at the turn change, and the second deletion fails.
//
// All of it runs on the active GM's client: a player can place a template,
// but cannot create actors or tokens.

import { MOD } from "../const.js";
import { registerDamageBurst } from "../lib/damage-burst.js";
import { handlePlacement, placedCell, squareTemplate } from "../lib/region-placement.js";
import { spellActorFolder, spellActorOwnership } from "../lib/spell-actors.js";
import { onSustain, postSpellCard } from "../lib/sustain.js";
import { registerTokenShader } from "../lib/token-shader.js";
import { playFireball, preloadFireball, rankForDamage } from "./fireball.js";

const SPELL_SLUG = "ember-doppelgänger";
const SLUG = `origin:item:slug:${SPELL_SLUG}`;
const NAME = "Ember Hussar";
const SPELL_NAME = "Ember Doppelgänger";
const ICON = "icons/magic/fire/elemental-fire-humanoid.webp";
const SUMMON_COLOR = "#ff6a1a";

// Deleting the Hussar or the caster's effect because the other has gone; the
// hooks that tie the two together leave such deletions alone.
const ENDING = `${MOD}EmberEnding`;

// AC 10 and 50 Hit Points, 10 more for every rank above 5; it Strides 30 feet.
const BASE_RANK = 5;
const BASE_HP = 50;
const HP_PER_RANK = 10;
const AC = 10;
const SPEED = 30;
const IMMUNITIES = ["critical-hits", "precision", "immobilized", "prone", "restrained"];
const WEAKNESSES = [{ type: "cold", value: 10 }, { type: "water", value: 10 }];

// The duplicate fails every skill check and saving throw it attempts, and
// neither gives nor gets flanking. That checks against it automatically
// succeed has no rule element to say it; the note on its sheet does.
const DUPLICATE_RULES = [
  { key: "AdjustDegreeOfSuccess", selector: "saving-throw", adjustment: { all: "to-failure" } },
  { key: "AdjustDegreeOfSuccess", selector: "skill-check", adjustment: { all: "to-failure" } },
  { key: "ActiveEffectLike", mode: "override", path: "system.attributes.flanking.canFlank", value: false }
];
const DUPLICATE_NOTES =
  "<p>Doesn't provide or benefit from flanking. Automatically fails all skill " +
  "checks and saving throws; all skill checks attempted against it " +
  "automatically succeed.</p>";

// A little firelight about it, flickering.
const LIGHT = {
  bright: 0,
  dim: 10,
  color: "#ff7a2a",
  alpha: 0.35,
  animation: { type: "flame", speed: 3, intensity: 4 }
};

// What the Hussar looks like: the caster's picture burnt to ash — greyed and
// darkened — with seams of embers glowing through it, drifting slowly upward
// and breathing brighter and dimmer; its outline smoulders, and a thin smoke
// hangs about it, wisping upward, with the odd spark rising through it.
//
// Lengths are in token widths, so the look is the same at any zoom and for
// any size of token. The haze is drawn outside the picture, into the frame
// lib/token-shader.js pads around the token (PADDING).
const EMBER_SHADER = `
precision highp float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputSize;
uniform vec4 outputFrame;
uniform vec4 inputClamp;
uniform float time;
uniform vec2 center;
uniform vec2 tokenSize;
uniform float ash, darken;
uniform float veinScale, veinWidth, veinSpeed, emberGlow;
uniform vec3 emberColor, emberHot;
uniform float rimWidth, rimGlow;
uniform float hazeReach, hazeAlpha, hazeScale, hazeSpeed;
uniform vec3 hazeColor;
uniform float sparkScale, sparkAmount, sparkSpeed;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

// the picture's opacity at a point, in token widths from the centre
float alphaAt(vec2 p) {
  vec2 uv = (center + p * tokenSize.x - outputFrame.xy) * inputSize.zw;
  if (any(lessThan(uv, inputClamp.xy)) || any(greaterThan(uv, inputClamp.zw))) return 0.0;
  return texture2D(uSampler, uv).a;
}

// sparks: now and then one in a cell, rising with the cells and blinking
float sparks(vec2 p) {
  vec2 s = p * sparkScale + vec2(0.0, time * sparkSpeed);
  vec2 cell = floor(s);
  float h = hash(cell);
  if (h > sparkAmount) return 0.0;
  vec2 spot = (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
  float blink = 0.5 + 0.5 * sin(time * 4.0 + h * 40.0);
  return (1.0 - smoothstep(0.03, 0.12, length(fract(s) - 0.5 - spot))) * blink;
}

void main() {
  vec4 src = texture2D(uSampler, vTextureCoord);
  vec2 px = vTextureCoord * inputSize.xy + outputFrame.xy;
  vec2 p = (px - center) / tokenSize.x;
  float a = src.a;
  vec3 rgb = a > 0.0 ? src.rgb / a : vec3(0.0);

  // ash
  float grey = dot(rgb, vec3(0.299, 0.587, 0.114));
  vec3 body = mix(rgb, vec3(grey * darken), ash);

  // seams of embers, drifting up and breathing
  vec2 q = p * veinScale + vec2(0.0, time * veinSpeed);
  float seam = 1.0 - smoothstep(0.0, veinWidth, abs(fbm(q) - 0.5));
  float heat = seam * (0.55 + 0.45 * noise(q * 0.5 + time * veinSpeed * 2.0));
  body += mix(emberColor, emberHot, heat * heat) * heat * emberGlow;

  // the outline smouldering
  float inner = min(min(alphaAt(p + vec2(rimWidth, 0.0)), alphaAt(p - vec2(rimWidth, 0.0))),
                    min(alphaAt(p + vec2(0.0, rimWidth)), alphaAt(p - vec2(0.0, rimWidth))));
  float rim = clamp(a - inner, 0.0, 1.0);
  body += emberColor * rim * rimGlow * (0.7 + 0.3 * sin(time * 3.0 + (p.x + p.y) * 20.0));

  // the haze: thickest by the outline, wisping upward
  vec2 w = p * hazeScale + vec2(0.0, time * hazeSpeed);
  vec2 warp = (vec2(fbm(w), fbm(w + 5.2)) - 0.5) * hazeReach;
  float near = 0.0;
  for (int i = 0; i < 8; i++) {
    float t = float(i) * 0.7853982;
    vec2 dir = vec2(cos(t), sin(t));
    near += alphaAt(p + warp + dir * hazeReach * 0.5) + alphaAt(p + warp + dir * hazeReach);
  }
  near /= 16.0;
  float smoke = hazeAlpha * smoothstep(0.0, 0.5, near) * smoothstep(0.2, 0.7, fbm(w * 1.5 + 9.0));

  float spark = sparks(p) * smoothstep(0.0, 0.3, near) * (1.0 - a);

  // the figure over its smoke, with sparks of light on top
  vec3 col = body * a + hazeColor * smoke * (1.0 - a) + emberHot * spark;
  float alpha = max(a + smoke * (1.0 - a), spark);
  gl_FragColor = vec4(col, alpha);
}`;

// ash and darken: how far the picture is greyed, and how dark the ash is.
// vein…: the ember seams — how many across the token, how wide, how fast they
// drift, how brightly they glow, from emberColor to emberHot at their hottest.
// rim…: the smouldering outline, its width and glow. haze…: how far the smoke
// reaches beyond the outline, how thick it is, how fine its wisps, how fast
// they rise, its colour. spark…: how fine the grid of sparks, what share of
// its cells has one, how fast they rise.
const EMBER_LOOK = {
  ash: 0.85, darken: 0.45,
  veinScale: 5, veinWidth: 0.06, veinSpeed: 0.3, emberGlow: 1.4,
  emberColor: [1.0, 0.35, 0.05], emberHot: [1.0, 0.8, 0.45],
  rimWidth: 0.02, rimGlow: 0.9,
  hazeReach: 0.12, hazeAlpha: 0.5, hazeScale: 4, hazeSpeed: 0.25,
  hazeColor: [0.2, 0.18, 0.17],
  sparkScale: 9, sparkAmount: 0.12, sparkSpeed: 0.6
};

// How far beyond the token the shader may draw, in token widths: the haze's
// reach, and its warp on top of it.
const PADDING = 0.2;

export function registerEmberDoppelganger() {
  registerTokenShader({ test: isHussar, fragment: EMBER_SHADER, uniforms: EMBER_LOOK, padding: PADDING });
  handlePlacement(SLUG, {
    // The burst carries the same roll option and is PF2e's: a circle, where
    // the summoning link's line has no radius.
    accepts: (data) => !data.shapes[0].radius,
    shape: (data) => {
      const shaped = squareTemplate(data, { color: SUMMON_COLOR });
      foundry.utils.setProperty(shaped, `flags.${MOD}.emberSummon`, true);
      return shaped;
    },
    limit: (data) => (hussarsOf(castOf(data.flags?.pf2e?.messageId)).length ? 0 : 1),
    options: (options) => ({ ...options, allowRotation: false }),
    done: (placed, limit) => {
      if (!limit) ui.notifications.warn(`${SPELL_NAME}: this cast's ${NAME} is already on the map.`);
    }
  });
  registerDamageBurst(SLUG, { onPlaced: preloadFireball, fire: (shot) => blast(shot).catch(report) });
  onSustain(SPELL_SLUG, sustained);
  Hooks.on("createRegion", onSummonPlaced);
  Hooks.on("updateActor", onHussarDamaged);
  Hooks.on("deleteToken", onHussarDeleted);
  Hooks.on("deleteItem", onSpellEffectDeleted);
  return { hussarsOf, endSpell };
}

function isHussar(token) {
  return !!token.getFlag(MOD, "emberHussar");
}

// The Hussar of one cast, on every scene.
function hussarsOf(castId) {
  if (!castId) return [];
  return game.scenes.contents.flatMap((s) =>
    s.tokens.filter((t) => isHussar(t) && t.getFlag(MOD, "castId") === castId));
}

// The cast a chat card belongs to: the card of the cast itself, or a card
// posted again for sustaining it, which names the cast.
function castOf(card) {
  if (!card) return null;
  return game.messages.get(card)?.getFlag(MOD, "emberCast") ?? card;
}

function spellEffect(actor, castId) {
  return actor?.items.find((i) => i.getFlag(MOD, "emberCast") === castId) ?? null;
}

function report(err) {
  console.error(`${MOD} | ember doppelganger`, err);
  ui.notifications.error(`${SPELL_NAME}: ${err.message}`);
}

/* -------------------------------------------- */
/*  Summoning                                   */
/* -------------------------------------------- */

// The square is only a request; it is removed whatever happens.
async function onSummonPlaced(region) {
  if (game.user !== game.users.activeGM) return;
  if (!region.getFlag(MOD, "emberSummon")) return;
  const origin = region.flags?.pf2e?.origin;
  if (!(origin?.rollOptions ?? []).includes(SLUG)) return;

  const scene = region.parent;
  const castId = castOf(region.flags.pf2e.messageId) ?? foundry.utils.randomID();
  try {
    if (hussarsOf(castId).length) {
      ui.notifications.warn(`${SPELL_NAME}: this cast's ${NAME} is already on the map.`);
      return;
    }
    await summon(scene, castId, placedCell(region), origin);
  } catch (err) {
    report(err);
  } finally {
    await scene.deleteEmbeddedDocuments("Region", [region.id]).catch(report);
  }
}

async function summon(scene, castId, cell, origin) {
  const caster = origin.actor ? await fromUuid(origin.actor) : null;
  const rank = origin.castRank ?? BASE_RANK;
  const look = casterLook(scene, castId, caster);
  const actor = await createHussarActor(castId, rank, caster);

  const size = scene.grid.size;
  await scene.createEmbeddedDocuments("Token", [{
    name: NAME,
    actorId: actor.id,
    actorLink: true,
    x: cell.x - size / 2,
    y: cell.y - size / 2,
    width: look.width ?? 1,
    height: look.height ?? 1,
    texture: look.texture ?? { src: ICON },
    ...(look.ring ? { ring: look.ring } : {}),
    disposition: look.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY,
    displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
    displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER,
    light: LIGHT,
    flags: { [MOD]: { castId, emberHussar: true, caster: origin.actor ?? null } }
  }]);

  // The spell's origin on the effect is what PF2e Auto Action Tracker looks
  // for when the spell is let lapse: it deletes the effect, and the Hussar
  // goes with it.
  if (caster && !spellEffect(caster, castId)) {
    await caster.createEmbeddedDocuments("Item", [{
      type: "effect",
      name: `Spell Effect: ${SPELL_NAME}`,
      img: ICON,
      system: {
        slug: "spell-effect-ember-doppelganger",
        level: { value: rank },
        duration: { value: 1, unit: "minutes", expiry: "turn-start", sustained: false },
        tokenIcon: { show: true }
      },
      flags: {
        [MOD]: { emberCast: castId },
        ...(origin.uuid ? { pf2e: { origin: { uuid: origin.uuid } } } : {})
      }
    }]);
  }
}

// The caster's token the spell was cast from — the one speaking on the card —
// or failing that any of theirs on the scene, or their prototype token.
function casterLook(scene, castId, caster) {
  const speaker = game.messages.get(castId)?.speaker;
  const token = (speaker?.token && game.scenes.get(speaker.scene)?.tokens.get(speaker.token))
    ?? caster?.getActiveTokens(false, true).find((t) => t.parent === scene)
    ?? null;
  const source = token?.toObject() ?? caster?.prototypeToken?.toObject() ?? {};
  return {
    width: source.width,
    height: source.height,
    texture: source.texture,
    ring: source.ring,
    disposition: source.disposition
  };
}

// The duplicate's statistics. Its own actor, linked to its single token, so
// its damage is on the actor itself.
async function createHussarActor(castId, rank, caster) {
  const hp = BASE_HP + HP_PER_RANK * Math.max(rank - BASE_RANK, 0);
  return CONFIG.Actor.documentClass.create({
    name: caster ? `${NAME} (${caster.name})` : NAME,
    type: "npc",
    img: ICON,
    folder: (await spellActorFolder())?.id ?? null,
    ownership: spellActorOwnership(caster),
    system: {
      attributes: {
        ac: { value: AC },
        hp: { value: hp, max: hp },
        speed: { value: SPEED },
        immunities: IMMUNITIES.map((type) => ({ type })),
        weaknesses: WEAKNESSES
      },
      traits: { size: { value: caster?.system?.traits?.size?.value ?? "med" } },
      details: { publicNotes: DUPLICATE_NOTES }
    },
    items: [{
      type: "effect",
      name: SPELL_NAME,
      img: ICON,
      system: {
        slug: "ember-doppelganger-duplicate",
        duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
        tokenIcon: { show: false },
        rules: DUPLICATE_RULES
      }
    }],
    prototypeToken: { name: NAME, actorLink: true },
    flags: { [MOD]: { castId, emberHussar: true } }
  });
}

/* -------------------------------------------- */
/*  The blast                                   */
/* -------------------------------------------- */

// 6d6 at rank 5 and 1d6 more for each rank above.
function averageDamage(rank) {
  return 3.5 * (6 + rank - BASE_RANK);
}

// The fireball is launched from the Hussar of the cast the damage was rolled
// for — from its own card or one posted to sustain it; failing that, from the
// caster's Hussar on the scene, or else from the caster.
function blast(shot) {
  const damage = Number.isFinite(shot.damage) ? shot.damage : averageDamage(shot.rank ?? BASE_RANK);
  const castId = castOf(shot.card);
  const from = shot.scene.tokens.find((t) => isHussar(t) && t.getFlag(MOD, "castId") === castId)
    ?? shot.scene.tokens.find((t) => isHussar(t) && shot.actor && t.getFlag(MOD, "caster") === shot.actor)
    ?? null;
  return playFireball({ ...shot, rank: rankForDamage(damage), from });
}

/* -------------------------------------------- */
/*  Sustaining                                  */
/* -------------------------------------------- */

// The caster sustains the spell: its card is posted again for the Hussar's
// next blast. The cast sustained is the caster's whose Hussar is still on the
// map; with none left there is nothing to sustain.
async function sustained({ actor, spell }) {
  const effect = actor.items.find((i) => {
    const castId = i.getFlag(MOD, "emberCast");
    return castId && hussarsOf(castId).length;
  });
  if (!effect) {
    ui.notifications.warn(`${SPELL_NAME}: ${actor.name} has no ${NAME} to sustain.`);
    return;
  }
  const castId = effect.getFlag(MOD, "emberCast");
  const cast = game.messages.get(castId);
  await postSpellCard(spell, {
    castRank: cast?.flags?.pf2e?.origin?.castRank ?? effect.system.level?.value ?? spell.rank,
    author: cast?.author?.id,
    flags: { [MOD]: { emberCast: castId } }
  });
}

/* -------------------------------------------- */
/*  The spell's end                             */
/* -------------------------------------------- */

// The Hussar and the caster's effect of one cast, whichever is left.
async function endSpell(castId) {
  const tokens = hussarsOf(castId);
  const casterUuid = tokens[0]?.getFlag(MOD, "caster");
  await removeHussars(tokens);
  const effect = spellEffect(casterUuid ? fromUuidSync(casterUuid) : null, castId);
  if (effect) await effect.delete({ [ENDING]: true });
}

async function removeHussars(tokens, options = { [ENDING]: true }) {
  for (const [scene, list] of Map.groupBy(tokens, (t) => t.parent)) {
    await scene.deleteEmbeddedDocuments("Token", list.map((t) => t.id), options);
  }
}

// The Hussar at 0 Hit Points is destroyed, and its token deleted as if by
// hand, so that the spell ends with it.
function onHussarDamaged(actor, changes) {
  if (game.user !== game.users.activeGM) return;
  if (!actor.getFlag(MOD, "emberHussar")) return;
  if (foundry.utils.getProperty(changes, "system.attributes.hp") === undefined) return;
  if ((actor.system?.attributes?.hp?.value ?? 1) > 0) return;
  removeHussars(hussarsOf(actor.getFlag(MOD, "castId")), {}).catch(report);
}

// The Hussar is gone — destroyed, or deleted by hand: the spell is over.
function onHussarDeleted(token, options) {
  if (options?.[ENDING] || game.user !== game.users.activeGM) return;
  if (!isHussar(token)) return;
  const caster = token.getFlag(MOD, "caster");
  spellEffect(caster ? fromUuidSync(caster) : null, token.getFlag(MOD, "castId"))
    ?.delete({ [ENDING]: true }).catch(report);
}

// The caster's effect is gone — run out and removed by PF2e, or deleted by
// hand: the Hussar goes.
function onSpellEffectDeleted(item, options) {
  if (options?.[ENDING] || game.user !== game.users.activeGM) return;
  const castId = item.getFlag(MOD, "emberCast");
  if (castId) removeHussars(hussarsOf(castId)).catch(report);
}
