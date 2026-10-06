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
//   from everyone, that the map visibly bends inside (lib/lens.js). The
//   template is not kept, because a target helper set to remove templates
//   after picking targets would take the spell down with it.
// - The caster gets the spell's effect for its minute. When the effect ends
//   — expired, or removed by hand — the field goes; when the field is
//   removed by hand, the effect goes with it.
// - In an encounter, a creature starting its turn in the field gets a chat
//   message, seen only by its owners and the GM, with a button that rolls its
//   Will save against the DC. A failure or critical failure slows it, as an
//   effect taken away again at the end of its turn.
//
// All of it runs on the active GM's client, except the save itself, rolled
// by whoever presses the button for the creature they own.

import { MOD } from "../const.js";
import { registerLensField } from "../lib/lens.js";

const SLUG = "origin:item:slug:stagnate-time";
const ICON = "systems/pf2e/icons/spells/stagnate-time.webp";
const SLOWED = "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3";
const FIELD_NAME = "Stagnate Time";
const FIELD_COLOR = "#8fb8ff";

// Deleting a field or the caster's effect because the other has gone; the
// hooks that tie the two together leave such deletions alone.
const ENDING = `${MOD}StagnateEnding`;

export function registerStagnateTime() {
  registerLensField({ test: isField });
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

// PF2e may leave an expired effect in place rather than delete it, depending
// on its settings; a field whose effect is expired or missing is ended here.
async function endLapsedFields(scene) {
  for (const field of fields(scene)) {
    const { castId, caster } = field.getFlag(MOD, "stagnateTime");
    if (!caster) continue;
    const effect = spellEffect(fromUuidSync(caster), castId);
    if (!effect || effect.isExpired) await endSpell(castId, { scene });
  }
}

/* -------------------------------------------- */
/*  Turns: the save and the slow                */
/* -------------------------------------------- */

function turnKey(combat) {
  return combat ? `${combat.id}:${combat.round}:${combat.turn}` : null;
}

// Slows from this spell last the turn they were taken on; any from another
// turn are cleared as a new one begins. PF2e usually beats this to it — the
// effect expires at the end of the turn, and PF2e deletes expired effects —
// so an effect already gone by the time it is deleted here is no fault.
async function clearSlows(scene, combat) {
  const now = turnKey(combat);
  for (const token of scene.tokens) {
    const actor = token.actor;
    const stale = actor?.items.filter((i) => {
      const key = i.getFlag(MOD, "stagnateSlowed");
      return key && key !== now;
    }) ?? [];
    for (const item of stale) {
      if (!actor.items.has(item.id)) continue;
      await item.delete().catch(() => {});
    }
  }
}

// A new turn has begun — the first of the encounter included, which the
// encounter's own start hook announces before the encounter counts as
// started. Taken from the update itself, after it has gone through.
function onCombatUpdated(combat, changed) {
  if (!("turn" in changed) && !("round" in changed)) return;
  onTurnStart(combat);
}

// The start of a turn, on the active GM's client. Each step stands on its
// own, so that tidying up after the last turn can never keep the next
// creature from being asked for its save.
function onTurnStart(combat) {
  if (game.user !== game.users.activeGM || !combat?.started) return;
  const scene = combat.scene ?? canvas.scene;
  if (!scene) return;
  clearSlows(scene, combat).catch(report);
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
    flags: { [MOD]: { stagnateSlowed: turnKey(game.combat) } }
  }]);
}
