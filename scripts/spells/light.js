// Light (PF2e cantrip, Player Core).
//
// The caster creates an orb of light, in a colour of their choosing, that
// sheds bright light in 20 feet and dim light 20 feet further — 60 and 60
// from rank 4 — until their next daily preparations. Sustaining the spell
// moves the orb, and no caster keeps more than four.
//
// The player chooses the colour and places the orb from the @Template link
// added to the spell's description, a single square, and that square becomes
// the orb straight away:
//
// - A new actor for each cast (lib/spell-actors.js keeps it in its folder and
//   deletes it once its token is gone).
// - A token that is the orb, named "Light 1" to "Light 4": a small bright
//   sphere in a soft glow and a slowly shimmering halo in the chosen colour
//   (ORB_SHADER below, put on the token by lib/token-shader.js on every
//   client), giving off the spell's light in that colour, softly pulsing. Its
//   owner moves it by dragging; that is the Sustain.
// - An effect on the caster for the day, numbered as its orb, which is how
//   the player dismisses that orb: players cannot delete tokens, but can
//   delete their own effects. When the effect ends the orb goes; when the orb
//   is deleted, the effect goes with it.
// - A fifth orb puts out the caster's oldest.
//
// Attaching the light to a creature is left to the system's own Spell Effect:
// Light, linked from the description.
//
// The caster's effect runs on a PF2e timer and is removed by PF2e when it runs
// out, never by the module: both would delete it, and the second deletion
// fails.
//
// All of it runs on the active GM's client, but the choice of colour, made by
// whoever places the orb.

import { MOD } from "../const.js";
import { handlePlacement, placedCell, squarePlacement, squareTemplate } from "../lib/region-placement.js";
import { spellActorFolder, spellActorOwnership } from "../lib/spell-actors.js";
import { registerTokenShader } from "../lib/token-shader.js";

const SLUG = "origin:item:slug:light";
const NAME = "Light";
const ICON = "systems/pf2e/icons/spells/light.webp";
const MAX_LIGHTS = 4;

// The orb is half a square across, token and placed square alike: it takes
// up little of the map, and centred in its cell it still sits on the grid.
const ORB_SIZE = 0.5;

// The system's own Light effect is this cold white.
const DEFAULT_COLOR = "#e7f3f1";

// Deleting the orb or the caster's effect because the other has gone; the
// hooks that tie the two together leave such deletions alone.
const ENDING = `${MOD}LightEnding`;

// The light the orb gives: how strongly it is coloured, and its pulse — the
// system's own Light effect pulses the same.
const LIGHT = {
  alpha: 0.3,
  animation: { type: "pulse", speed: 2, intensity: 1 }
};

// Bright and dim radius in feet; Foundry's dim radius is the whole of it.
function lightRadii(rank) {
  return rank >= 4 ? { bright: 60, dim: 120 } : { bright: 20, dim: 40 };
}

// What the orb looks like, drawn whole by the shader rather than from the
// token's picture, which only shows should the shader not: a small sphere,
// white-hot within and soft at its edge; a glow about it; and a wider halo
// that shimmers — swirls drifting through it and faint rays slowly turning —
// all breathing gently brighter and dimmer. The glow and the halo are in the
// chosen colour.
//
// Lengths are in token widths, so the look is the same at any zoom. The halo
// reaches past the token, into the frame lib/token-shader.js pads around it
// (PADDING), and fades out before that frame's edge.
const ORB_SHADER = `
precision highp float;
varying vec2 vTextureCoord;
uniform vec4 inputSize;
uniform vec4 outputFrame;
uniform float time;
uniform vec2 center;
uniform vec2 tokenSize;
uniform vec3 color;
uniform float coreRadius, coreSoft, coreWhite;
uniform float glowRadius, glowStrength;
uniform float haloRadius, haloStrength, haloScale, haloSpeed;
uniform float rayCount, raySpeed, rayStrength;
uniform float breathAmp, breathSpeed;
uniform float reach;

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
vec2 turn(vec2 p, float a) { float s = sin(a), c = cos(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

void main() {
  vec2 px = vTextureCoord * inputSize.xy + outputFrame.xy;
  vec2 p = (px - center) / tokenSize.x;
  float r = length(p);
  float breath = 1.0 + breathAmp * sin(time * breathSpeed);

  // the sphere at the heart
  float core = 1.0 - smoothstep(coreRadius * (1.0 - coreSoft), coreRadius, r);

  // the glow about it
  float glow = exp(-(r * r) / (glowRadius * glowRadius)) * glowStrength * breath;

  // the halo, shimmering: swirls drifting through it as it slowly turns
  vec2 q = turn(p, time * haloSpeed * 0.3) * haloScale;
  float swirl = fbm(q + vec2(time * haloSpeed, -time * haloSpeed * 0.7));
  float flow = fbm(vec2(r * haloScale * 2.0 - time * haloSpeed, 0.0) + q * 0.5);
  float halo = exp(-r / haloRadius) * haloStrength * mix(0.4, 1.3, swirl * flow * 2.0) * breath;

  // faint rays, slowly turning
  float a = atan(p.y, p.x);
  float ray = pow(0.5 + 0.5 * sin(a * rayCount + time * raySpeed + 2.0 * fbm(p * 3.0)), 4.0);
  float rays = ray * rayStrength * exp(-r / (haloRadius * 1.5)) * smoothstep(coreRadius * 0.5, coreRadius * 2.0, r);

  float edge = 1.0 - smoothstep(reach * 0.8, reach, r);
  float light = (glow + halo + rays) * edge;
  vec3 rgb = color * light + mix(color, vec3(1.0), coreWhite) * core;
  float alpha = clamp(max(core, light), 0.0, 1.0);
  gl_FragColor = vec4(min(rgb, vec3(1.0)), alpha);
}`;

// core…: the sphere's radius, how much of it is soft edge, how white-hot it
// is. glow…: the glow's radius and strength. halo…: how far the halo reaches,
// how strong it is, how fine its swirls, how fast they drift. ray…: how many
// rays, how fast they turn, how strong they are. breath…: how far and how
// fast it all breathes. reach: where the halo has faded to nothing, short of
// the edge of the padded frame. Chosen from rendered previews: the rays kept
// faint, so the orb reads as a soft light rather than a star. The token being
// half a square, a token width here is half a square: the sphere is a third
// of a square across, and the glow and halo spread over a square and more.
const ORB_LOOK = {
  coreRadius: 0.32, coreSoft: 0.7, coreWhite: 0.9,
  glowRadius: 0.88, glowStrength: 0.85,
  haloRadius: 1.12, haloStrength: 0.5, haloScale: 1, haloSpeed: 0.35,
  rayCount: 5, raySpeed: 0.2, rayStrength: 0.08,
  breathAmp: 0.12, breathSpeed: 1.6,
  reach: 4.2
};

// How far beyond the token the shader may draw, in token widths: the frame
// then reaches 4.3 widths from the centre, past where the halo fades out.
const PADDING = 3.8;

export function registerLight() {
  registerTokenShader({
    test: isOrb,
    fragment: ORB_SHADER,
    uniforms: { ...ORB_LOOK, color: [1, 1, 1] },
    uniformsFor: (token) => ({ color: foundry.utils.Color.from(token.getFlag(MOD, "color") ?? DEFAULT_COLOR).rgb }),
    padding: PADDING
  });
  handlePlacement(SLUG, {
    prepare: chooseColor,
    shape: (data) => {
      const shaped = squareTemplate(data, { color: data.flags?.[MOD]?.lightColor ?? DEFAULT_COLOR, share: ORB_SIZE });
      foundry.utils.setProperty(shaped, `flags.${MOD}.lightSummon`, true);
      return shaped;
    },
    limit: (data) => (orbsOf(data.flags?.pf2e?.messageId).length ? 0 : 1),
    options: squarePlacement,
    done: (placed, limit) => {
      if (!limit) ui.notifications.warn("Light: this cast's light is already on the map.");
    }
  });
  Hooks.on("createRegion", onOrbPlaced);
  Hooks.on("deleteToken", onOrbDeleted);
  Hooks.on("deleteItem", onSpellEffectDeleted);
  return { orbsOf, lightsOf };
}

function isOrb(token) {
  return !!token.getFlag(MOD, "lightOrb");
}

function allOrbs() {
  return game.scenes.contents.flatMap((s) => s.tokens.filter(isOrb));
}

// The orb of one cast, on every scene.
function orbsOf(castId) {
  if (!castId) return [];
  return allOrbs().filter((t) => t.getFlag(MOD, "castId") === castId);
}

// A caster's orbs, oldest first.
function lightsOf(casterUuid) {
  if (!casterUuid) return [];
  return allOrbs()
    .filter((t) => t.getFlag(MOD, "caster") === casterUuid)
    .sort((a, b) => (a.getFlag(MOD, "castAt") ?? 0) - (b.getFlag(MOD, "castAt") ?? 0));
}

function spellEffect(actor, castId) {
  return actor?.items.find((i) => i.getFlag(MOD, "lightCast") === castId) ?? null;
}

function report(err) {
  console.error(`${MOD} | light`, err);
  ui.notifications.error(`Light: ${err.message}`);
}

/* -------------------------------------------- */
/*  Choosing and placing                        */
/* -------------------------------------------- */

// On the client of whoever places the orb: the colour, offered as the one
// they chose last time. Closing the dialog places nothing.
async function chooseColor(data) {
  const last = game.user.getFlag(MOD, "lightColor") ?? DEFAULT_COLOR;
  const chosen = await foundry.applications.api.DialogV2.input({
    window: { title: NAME, icon: "fa-solid fa-lightbulb" },
    content:
      '<div class="form-group"><label>Colour</label>' +
      `<div class="form-fields"><color-picker name="color" value="${last}"></color-picker></div></div>`,
    ok: { label: "Place", icon: "fa-solid fa-location-dot" }
  });
  const color = chosen?.color || null;
  if (!color) return null;
  if (color !== last) game.user.setFlag(MOD, "lightColor", color).catch(report);
  const prepared = foundry.utils.deepClone(data);
  foundry.utils.setProperty(prepared, `flags.${MOD}.lightColor`, color);
  return prepared;
}

// The square is only a request; it is removed whatever happens.
async function onOrbPlaced(region) {
  if (game.user !== game.users.activeGM) return;
  if (!region.getFlag(MOD, "lightSummon")) return;
  const origin = region.flags?.pf2e?.origin;
  if (!(origin?.rollOptions ?? []).includes(SLUG)) return;

  const scene = region.parent;
  const castId = region.flags.pf2e.messageId ?? foundry.utils.randomID();
  const color = region.getFlag(MOD, "lightColor") ?? DEFAULT_COLOR;
  try {
    if (orbsOf(castId).length) {
      ui.notifications.warn("Light: this cast's light is already on the map.");
      return;
    }
    await createOrb(scene, castId, placedCell(region), origin, color);
  } catch (err) {
    report(err);
  } finally {
    await scene.deleteEmbeddedDocuments("Region", [region.id]).catch(report);
  }
}

async function createOrb(scene, castId, cell, origin, color) {
  const caster = origin.actor ? await fromUuid(origin.actor) : null;
  const rank = origin.castRank ?? 1;

  // Four at most: the oldest goes out first, its effect with it.
  const lit = lightsOf(origin.actor);
  for (const old of lit.slice(0, Math.max(lit.length - (MAX_LIGHTS - 1), 0))) {
    await old.delete();
  }

  // Each of a caster's orbs has its own number, the lowest free, shared by its
  // token and its effect: the player sees which effect to delete for which
  // orb, and the token shows its name on hover.
  const taken = new Set(lightsOf(origin.actor).map((t) => t.getFlag(MOD, "number")));
  const number = Array.from({ length: MAX_LIGHTS }, (_, i) => i + 1).find((n) => !taken.has(n)) ?? MAX_LIGHTS;
  const name = `${NAME} ${number}`;

  // PF2e sizes a token by its actor and scales its picture to it unless told
  // not to; the orb keeps the size set here, its picture filling it.
  const sizing = { pf2e: { linkToActorSize: false, autoscale: false } };

  const actor = await CONFIG.Actor.documentClass.create({
    name: caster ? `${name} (${caster.name})` : name,
    type: "hazard",
    img: ICON,
    folder: (await spellActorFolder())?.id ?? null,
    ownership: spellActorOwnership(caster),
    system: { traits: { size: { value: "tiny" } } },
    prototypeToken: { name, actorLink: true, width: ORB_SIZE, height: ORB_SIZE, flags: sizing },
    flags: { [MOD]: { castId, lightOrb: true } }
  });

  // Centred in the cell chosen.
  const across = scene.grid.size * ORB_SIZE;
  await scene.createEmbeddedDocuments("Token", [{
    name,
    actorId: actor.id,
    actorLink: true,
    x: cell.x - across / 2,
    y: cell.y - across / 2,
    width: ORB_SIZE,
    height: ORB_SIZE,
    texture: { src: ICON },
    ring: { enabled: false },
    lockRotation: true,
    disposition: casterDisposition(castId, caster),
    displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
    displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
    sight: { enabled: false },
    light: { ...LIGHT, ...lightRadii(rank), color },
    flags: {
      ...sizing,
      [MOD]: { castId, lightOrb: true, caster: origin.actor ?? null, color, number, castAt: Date.now() }
    }
  }]);

  if (caster && !spellEffect(caster, castId)) {
    await caster.createEmbeddedDocuments("Item", [{
      type: "effect",
      name: `Spell Effect: ${name}`,
      img: ICON,
      system: {
        slug: "spell-effect-light-orb",
        level: { value: rank },
        duration: { value: 1, unit: "days", expiry: "turn-start", sustained: false },
        tokenIcon: { show: false }
      },
      flags: { [MOD]: { lightCast: castId } }
    }]);
  }
}

// The side of the caster's token the spell was cast from, or of their
// prototype token.
function casterDisposition(castId, caster) {
  const speaker = game.messages.get(castId)?.speaker;
  const token = speaker?.token && game.scenes.get(speaker.scene)?.tokens.get(speaker.token);
  return token?.disposition ?? caster?.prototypeToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY;
}

/* -------------------------------------------- */
/*  The spell's end                             */
/* -------------------------------------------- */

// The orb is gone — dismissed, put out by a fifth, or deleted by hand: its
// effect goes.
function onOrbDeleted(token, options) {
  if (options?.[ENDING] || game.user !== game.users.activeGM) return;
  if (!isOrb(token)) return;
  const caster = token.getFlag(MOD, "caster");
  spellEffect(caster ? fromUuidSync(caster) : null, token.getFlag(MOD, "castId"))
    ?.delete({ [ENDING]: true }).catch(report);
}

// The caster's effect is gone — the day over, or deleted to dismiss the
// spell: the orb goes.
function onSpellEffectDeleted(item, options) {
  if (options?.[ENDING] || game.user !== game.users.activeGM) return;
  const castId = item.getFlag(MOD, "lightCast");
  if (!castId) return;
  for (const [scene, list] of Map.groupBy(orbsOf(castId), (t) => t.parent)) {
    scene.deleteEmbeddedDocuments("Token", list.map((t) => t.id), { [ENDING]: true }).catch(report);
  }
}
