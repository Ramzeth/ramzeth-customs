// Stagnate Time (PF2e, rank 5).
//
// A 20-foot burst where time runs thick for a minute. Any creature that
// begins its turn in it attempts a Will save against the caster's spell DC:
// on a failure it is slowed 1 this turn, on a critical failure slowed 2.
//
// The spell is the system's own; it needs no edit. Its chat card carries
// PF2e's template button, and placing the template sets everything up:
//
// - The template is swapped for a field: a region of the same circle, hidden
//   from everyone, that the map visibly bends inside (FIELD_SHADER below,
//   drawn by lib/region-shader.js). The template is not kept, because a
//   target helper set to remove templates after picking targets would take
//   the spell down with it.
// - The caster gets the spell's effect for its minute. When the effect ends
//   — expired, or removed by hand — the field goes; when the field is
//   removed by hand, the effect goes with it.
// - In an encounter, a creature starting its turn in the field gets a chat
//   message, seen only by its owners and the GM, with a button that rolls its
//   Will save against the DC. A failure or critical failure slows it, as an
//   effect that runs out at the end of its turn.
//
// Effects with a timer — the caster's minute, the slow's turn — are removed
// by PF2e when they run out, and never by the module: both would delete the
// same effect at the turn change, and the second deletion fails with an
// error.
//
// All of it runs on the active GM's client, except the save itself, rolled
// by whoever presses the button for the creature they own.

import { MOD } from "../const.js";
import { registerRegionShader } from "../lib/region-shader.js";

const SLUG = "origin:item:slug:stagnate-time";
const ICON = "systems/pf2e/icons/spells/stagnate-time.webp";
const SLOWED = "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3";
const FIELD_NAME = "Stagnate Time";
const FIELD_COLOR = "#8fb8ff";

// Deleting a field or the caster's effect because the other has gone; the
// hooks that tie the two together leave such deletions alone.
const ENDING = `${MOD}StagnateEnding`;

// What the field looks like: the map inside it rocks in a slow swirl, faint
// rings creep out from the centre, its colour drains to a cold grey, and the
// edge refracts like the rim of a glass dome, splitting colours and blurring
// a little. Every pixel reads the map from a nearby point instead of its own,
// and that displacement is the whole effect.
const FIELD_SHADER = `
precision highp float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputSize;
uniform vec4 outputFrame;
uniform vec4 inputClamp;
uniform vec2 center;
uniform float radius;
uniform float time;
uniform float fade;
uniform float strength, speed;
uniform float desat; uniform vec3 tint;
uniform float waveAmp, waveCount, waveSpeed;
uniform float rimWidth, rimSharp, rimSoft, rimBlur, rimAmp, rimSplit, rimSpeed, rimGlow;

vec4 at(vec2 px) {
  vec2 uv = (px - outputFrame.xy) * inputSize.zw;
  return texture2D(uSampler, clamp(uv, inputClamp.xy, inputClamp.zw));
}
vec3 rgbAt(vec2 o, vec2 split) {
  return vec3(at(o + split).r, at(o).g, at(o - split).b);
}

void main() {
  vec2 px = vTextureCoord * inputSize.xy + outputFrame.xy;
  vec2 d = px - center;
  float r = length(d);
  if (r >= radius || fade <= 0.0) { gl_FragColor = texture2D(uSampler, vTextureCoord); return; }
  float q = r / radius;
  float k = 1.0 - q;
  vec2 dir = r > 0.0 ? d / r : vec2(0.0);

  // the swirl, rocking one way and back
  float a = fade * strength * sin(time * speed) * k * k;
  float s = sin(a), c = cos(a);
  vec2 p = vec2(c * d.x - s * d.y, s * d.x + c * d.y);

  // slow rings creeping out from the centre
  float wave = sin((q * waveCount - time * waveSpeed) * 6.2831853);
  p += dir * wave * waveAmp * radius * k * fade;

  // the rim: rising towards the edge and easing to nothing just short of it
  float e = clamp((q - (1.0 - rimWidth)) / rimWidth, 0.0, 1.0);
  float outer = rimSoft > 0.0 ? 1.0 - smoothstep(1.0 - rimSoft, 1.0, q) : 1.0;
  float band = pow(e, rimSharp) * outer * fade;
  float shimmer = 0.85 + 0.15 * sin(time * rimSpeed + atan(d.y, d.x) * 7.0);
  vec2 bend = -dir * rimAmp * radius * band * shimmer;
  vec2 split = dir * rimSplit * radius * band;
  vec2 o = center + p + bend;

  // blurred across the rim, as through frosted glass
  vec2 b = dir * rimBlur * radius * band;
  vec3 rgb = (rgbAt(o - 2.0 * b, split) + rgbAt(o - b, split) + rgbAt(o, split)
            + rgbAt(o + b, split) + rgbAt(o + 2.0 * b, split)) / 5.0;
  vec4 col = vec4(rgb, at(o).a);

  // colour drained to a cold grey, easing off towards the edge
  float grey = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  col.rgb = mix(col.rgb, grey * tint, desat * smoothstep(1.0, 0.6, q) * fade);
  col.rgb += rimGlow * band * tint * col.a;

  gl_FragColor = col;
}`;

// Chosen at the table by turning each one live. Lengths are shares of the
// radius, so the look holds at any zoom. strength and speed: how far the swirl
// rocks, in radians, and how fast. desat and tint: how much colour is drained,
// and to what. waveAmp, waveCount, waveSpeed: the rings' depth, how many
// across the radius, and how fast they creep out. rim…: the band at the edge —
// its width, how sharply it rises, how softly it ends, its blur, how far it
// bends the picture, how far it splits the colours, how fast it shimmers, and
// how bright its edge glows.
const FIELD_LOOK = {
  strength: 0.6, speed: 1,
  desat: 0.7, tint: [0.8, 0.9, 1.0],
  waveAmp: 0.1, waveCount: 4, waveSpeed: 0.15,
  rimWidth: 0.12, rimSharp: 3, rimSoft: 0.04, rimBlur: 0.01,
  rimAmp: 0.06, rimSplit: 0.02, rimSpeed: 0.6, rimGlow: 0.15
};

export function registerStagnateTime() {
  registerRegionShader({ test: isField, fragment: FIELD_SHADER, uniforms: FIELD_LOOK });
  Hooks.on("createRegion", onTemplatePlaced);
  Hooks.on("deleteRegion", onFieldDeleted);
  Hooks.on("deleteItem", onSpellEffectDeleted);
  Hooks.on("updateCombat", onCombatUpdated);
  document.addEventListener("click", onSaveButton);
  return { fields, endSpell };
}

function isField(region) {
  return !!region.getFlag(MOD, "stagnateTime");
}

function fields(scene = canvas.scene) {
  return scene?.regions.filter(isField) ?? [];
}

function report(err) {
  console.error(`${MOD} | stagnate time`, err);
  ui.notifications.error(`Stagnate Time: ${err.message}`);
}

/* -------------------------------------------- */
/*  Casting: template to field                  */
/* -------------------------------------------- */

// The caster's spell DC, from the spellcasting the spell was cast through;
// failing that, the actor's own spell DC.
function spellDC(spell, caster) {
  return spell?.spellcasting?.statistic?.dc?.value ?? caster?.system?.attributes?.spellDC?.value ?? null;
}

function onTemplatePlaced(region) {
  if (game.user !== game.users.activeGM) return;
  if (!(region.flags?.pf2e?.origin?.rollOptions ?? []).includes(SLUG)) return;
  castField(region).catch(report);
}

async function castField(template) {
  const scene = template.parent;
  const origin = template.flags.pf2e.origin;
  const castId = template.flags.pf2e.messageId ?? foundry.utils.randomID();
  const shape = template.shapes[0];

  const caster = origin.actor ? await fromUuid(origin.actor) : null;
  const spell = origin.uuid ? await fromUuid(origin.uuid) : null;
  const dc = spellDC(spell, caster);
  if (dc === null) ui.notifications.warn("Stagnate Time: could not find the caster's spell DC.");

  // A template placed again from the same card moves the field.
  const earlier = fields(scene).filter((f) => f.getFlag(MOD, "stagnateTime").castId === castId);
  if (earlier.length) await scene.deleteEmbeddedDocuments("Region", earlier.map((f) => f.id), { [ENDING]: true });

  await scene.createEmbeddedDocuments("Region", [{
    name: FIELD_NAME,
    color: FIELD_COLOR,
    shapes: [{ type: "circle", x: shape.x, y: shape.y, radius: shape.radius, hole: false }],
    visibility: CONST.REGION_VISIBILITY.LAYER,
    flags: { [MOD]: { stagnateTime: { castId, caster: origin.actor ?? null, spell: origin.uuid ?? null, dc } } }
  }]);
  await template.delete();

  if (caster && !spellEffect(caster, castId)) {
    await caster.createEmbeddedDocuments("Item", [{
      type: "effect",
      name: `Spell Effect: ${FIELD_NAME}`,
      img: ICON,
      system: {
        slug: "spell-effect-stagnate-time",
        duration: { value: 1, unit: "minutes", expiry: "turn-start", sustained: false },
        tokenIcon: { show: true }
      },
      flags: { [MOD]: { stagnateCast: castId } }
    }]);
  }
}

function spellEffect(actor, castId) {
  return actor?.items.find((i) => i.getFlag(MOD, "stagnateCast") === castId) ?? null;
}

/* -------------------------------------------- */
/*  The spell's end                             */
/* -------------------------------------------- */

// The field and the effect of one cast, whichever is left.
async function endSpell(castId, { scene = canvas.scene } = {}) {
  const gone = fields(scene).filter((f) => f.getFlag(MOD, "stagnateTime").castId === castId);
  const casterUuid = gone[0]?.getFlag(MOD, "stagnateTime").caster;
  if (gone.length) await scene.deleteEmbeddedDocuments("Region", gone.map((f) => f.id), { [ENDING]: true });
  const caster = casterUuid ? fromUuidSync(casterUuid) : null;
  const effect = spellEffect(caster, castId);
  if (effect) await effect.delete({ [ENDING]: true });
}

// The caster's effect is gone — expired and removed, or deleted by hand.
function onSpellEffectDeleted(item, options) {
  if (options?.[ENDING] || game.user !== game.users.activeGM) return;
  const castId = item.getFlag(MOD, "stagnateCast");
  if (!castId) return;
  for (const scene of game.scenes) {
    const gone = fields(scene).filter((f) => f.getFlag(MOD, "stagnateTime").castId === castId);
    if (gone.length) scene.deleteEmbeddedDocuments("Region", gone.map((f) => f.id), { [ENDING]: true }).catch(report);
  }
}

// The field is deleted by hand: the spell is over.
function onFieldDeleted(region, options) {
  if (options?.[ENDING] || game.user !== game.users.activeGM) return;
  const field = region.getFlag(MOD, "stagnateTime");
  if (!field) return;
  const caster = field.caster ? fromUuidSync(field.caster) : null;
  spellEffect(caster, field.castId)?.delete({ [ENDING]: true }).catch(report);
}

// A field whose caster's effect is missing is ended — the effect deleted
// while the GM was away, say. An effect running out on its timer is PF2e's to
// delete, never the module's: both deletions would go out at the turn change,
// and the second would be refused with an error. Its deletion then takes the
// field with it.
async function endLapsedFields(scene) {
  for (const field of fields(scene)) {
    const { castId, caster } = field.getFlag(MOD, "stagnateTime");
    if (!caster) continue;
    if (!spellEffect(fromUuidSync(caster), castId)) await endSpell(castId, { scene });
  }
}

/* -------------------------------------------- */
/*  Turns: the save and the slow                */
/* -------------------------------------------- */

// A new turn has begun — the first of the encounter included, which the
// encounter's own start hook announces before the encounter counts as
// started. Taken from the update itself, after it has gone through.
function onCombatUpdated(combat, changed) {
  if (!("turn" in changed) && !("round" in changed)) return;
  onTurnStart(combat);
}

// The start of a turn, on the active GM's client. The two steps stand on
// their own, so that ending a field can never keep the next creature from
// being asked for its save.
function onTurnStart(combat) {
  if (game.user !== game.users.activeGM || !combat?.started) return;
  const scene = combat.scene ?? canvas.scene;
  if (!scene) return;
  endLapsedFields(scene).catch(report);
  askTurnSave(scene, combat).catch(report);
}

async function askTurnSave(scene, combat) {
  const token = combat.combatant?.token;
  if (!token || token.parent !== scene || !token.actor) return;
  const holding = fields(scene).filter((f) => isInside(token, f));
  if (!holding.length) return;

  // Inside more than one field, the hardest save is the one that counts.
  const field = holding
    .map((f) => f.getFlag(MOD, "stagnateTime"))
    .sort((a, b) => (b.dc ?? 0) - (a.dc ?? 0))[0];
  await askSave(token, field);
}

// Whether a creature is in the field: any square it takes up has its centre
// inside the circle, the way a burst is measured. Worked out here rather than
// read from the region's own list of tokens, which Foundry brings up to date
// only as tokens move, and so misses a creature that was already standing
// there when the field appeared.
function isInside(token, field) {
  const shape = field.shapes?.[0];
  if (!shape?.radius) return false;
  const size = token.parent.grid.size;
  for (let i = 0; i < Math.max(token.width, 1); i++) {
    for (let j = 0; j < Math.max(token.height, 1); j++) {
      const x = token.x + (i + 0.5) * size;
      const y = token.y + (j + 0.5) * size;
      if (Math.hypot(x - shape.x, y - shape.y) <= shape.radius) return true;
    }
  }
  return false;
}

// A message to the creature's owners and the GM, with the button that rolls
// its save.
async function askSave(token, { dc, spell }) {
  const actor = token.actor;
  const whisper = game.users
    .filter((u) => u.isGM || actor.testUserPermission(u, "OWNER"))
    .map((u) => u.id);
  const name = Handlebars.escapeExpression(token.name);
  const against = dc ? ` (DC ${dc})` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token }),
    whisper,
    content:
      `<p><strong>${name}</strong> begins its turn in ${FIELD_NAME}.</p>` +
      `<p><a class="rc-stagnate">Will save${against}</a></p>` +
      "<p><strong>Failure</strong> Slowed 1 for 1 round. " +
      "<strong>Critical Failure</strong> Slowed 2 for 1 round.</p>",
    flags: { [MOD]: { stagnateSave: { token: token.uuid, dc, spell } } }
  });
}

function onSaveButton(event) {
  const button = event.target?.closest?.("a.rc-stagnate");
  if (!button) return;
  event.preventDefault();
  const messageId = button.closest("[data-message-id]")?.dataset.messageId;
  const save = game.messages.get(messageId)?.getFlag(MOD, "stagnateSave");
  if (!save) return;
  const actor = fromUuidSync(save.token)?.actor;
  if (!actor?.isOwner) {
    ui.notifications.warn("Stagnate Time: only the creature's owner can roll its save.");
    return;
  }
  rollSave(actor, save).catch(report);
}

// The Will save, rolled for this creature whoever has a token selected, with
// the spell as its source so that bonuses against spells apply. A failure or
// critical failure slows it, through an effect that grants the condition, so
// that a slow it already has from elsewhere is left alone.
async function rollSave(actor, { dc, spell }) {
  const item = spell ? await fromUuid(spell) : null;
  const roll = await actor.saves?.will?.roll({
    ...(dc ? { dc: { value: dc } } : {}),
    ...(item ? { item } : {})
  });
  const degree = roll?.degreeOfSuccess;
  if (degree !== 0 && degree !== 1) return;
  const value = degree === 0 ? 2 : 1;
  await actor.createEmbeddedDocuments("Item", [{
    type: "effect",
    name: `${FIELD_NAME}: Slowed ${value}`,
    img: ICON,
    system: {
      duration: { value: 0, unit: "rounds", expiry: "turn-end", sustained: false },
      rules: [{
        key: "GrantItem",
        uuid: SLOWED,
        inMemoryOnly: true,
        alterations: [{ mode: "override", property: "badge-value", value }]
      }],
      tokenIcon: { show: false }
    },
    flags: { [MOD]: { stagnateSlowed: true } }
  }]);
}
