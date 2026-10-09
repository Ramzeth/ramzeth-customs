// A spell's burst that goes off when the spell's damage is rolled from its
// chat card, rather than when its template is placed: the table sees the
// dice, then the blast, then rolls its saves. The spell brings what goes off;
// this file only says where and when.
//
// Placing the burst template only marks where. The template itself may be
// long gone by the time the damage is rolled — the target helper removes it
// once targets are picked — so where it lay is remembered when it is placed.
// With Dice So Nice, the burst waits for the damage dice to land.
//
// Template and damage are tied together by the spell's chat card: a roll sets
// off only the burst placed from its own card, and only once, so a reroll
// does not go off again and two casts never swap places. PF2e marks the
// template with its card but not the damage roll, so the module marks the
// roll itself, on the client of whoever presses the card's damage button. A
// template or a roll without a card — placed or rolled from anywhere else —
// sets nothing off.
//
// Only templates with a radius are bursts: a spell may place other regions
// carrying the same roll option — a summoned creature's square, say.
//
// Every GM keeps the bursts placed, so that whichever GM is active when the
// damage is rolled has them; only that one sets the burst off, and what goes
// off is expected to show itself to everyone (through Sequencer, say).

import { MOD } from "../const.js";

// Dice So Nice says, for each roll message, whether this client will animate
// its dice, and later when they have landed. Should neither ever come, the
// burst goes off after this long anyway.
const DSN = "dice-so-nice";
const DICE_WAIT_MS = 15000;

// A damage button is any button on a chat card whose action names damage —
// PF2e's spell card has "spell-damage". Pressing one is held for the roll it
// starts for this long, which leaves time for PF2e's damage dialog; a press
// that led to no roll is forgotten after it.
const DAMAGE_BUTTON = '[data-action*="damage"]';
const PRESS_HELD_MS = 120000;

// Kinds of burst, by the roll option that marks the spell.
const kinds = new Map();

// Bursts placed and not yet rolled for, by chat card.
const bursts = new Map();

// The chat card whose damage button this client pressed last, and when.
let pressed = null;

// Damage rolls whose dice are still rolling, by message id.
const rolling = new Map();

// What Dice So Nice decided about a burst's damage message, when it decided
// before this module heard of the message.
const diceDecided = new Map();

let hooked = false;

// rollOption: the spell's origin:item:slug:<slug>.
// onPlaced(region): on every client, as the burst's template is placed — to
//   start loading what will be played, say.
// fire(shot): on the active GM's client, once the damage is in. shot is
//   scene, centre {x, y}, radius   where the burst was placed, in pixels
//   rank      the rank cast, if known
//   damage    the damage rolled, if the roll has a total
//   actor     the caster's uuid
//   tokenId   the token the damage was rolled from, if any
//   card      the spell's chat card
export function registerDamageBurst(rollOption, { onPlaced, fire }) {
  kinds.set(rollOption, { onPlaced, fire });
  if (hooked) return;
  hooked = true;
  // Capturing, so the press is seen before PF2e acts on it.
  document.addEventListener("click", onButtonPressed, true);
  Hooks.on("preCreateChatMessage", markDamageCard);
  Hooks.on("createRegion", onBurstPlaced);
  Hooks.on("createChatMessage", onDamageRolled);
  Hooks.on("diceSoNiceMessageProcessed", onDiceProcessed);
  Hooks.on("diceSoNiceRollComplete", release);
}

function kindOf(flags) {
  const rollOptions = flags?.pf2e?.origin?.rollOptions ?? [];
  for (const [option, kind] of kinds) {
    if (rollOptions.includes(option)) return kind;
  }
  return null;
}

function damageKind(message) {
  return message?.flags?.pf2e?.context?.type === "damage-roll" ? kindOf(message.flags) : null;
}

// On the client of whoever presses a damage button on a chat card.
function onButtonPressed(event) {
  const card = event.target.closest?.(DAMAGE_BUTTON)?.closest("[data-message-id]");
  if (card) pressed = { card: card.dataset.messageId, at: Date.now() };
}

// Still on that client, as the roll it started becomes a message: the card
// is written into it, for the active GM to read.
function markDamageCard(message) {
  if (!pressed || !damageKind(message)) return;
  if (Date.now() - pressed.at <= PRESS_HELD_MS) {
    message.updateSource({ [`flags.${MOD}.card`]: pressed.card });
  }
  pressed = null;
}

// A burst placed again from the same card replaces the one before.
function onBurstPlaced(region) {
  const kind = kindOf(region.flags);
  const shape = region.shapes?.[0];
  if (!kind || !shape?.radius) return;
  try {
    kind.onPlaced?.(region);
  } catch (err) {
    console.warn(`${MOD} | damage burst`, err);
  }

  const card = region.flags.pf2e.messageId;
  if (!game.user.isGM || !card) return;
  const origin = region.flags.pf2e.origin;
  bursts.set(card, {
    scene: region.parent,
    centre: { x: shape.x, y: shape.y },
    radius: shape.radius,
    rank: origin.castRank ?? null,
    actor: origin.actor ?? null,
    card
  });
}

// The damage of a placed burst has been rolled. Without Dice So Nice, or
// when it has already said it will not animate these dice, the burst goes off
// at once; otherwise once the dice land.
function onDamageRolled(message) {
  if (!game.user.isGM) return;
  const kind = damageKind(message);
  if (!kind) return;
  const decided = diceDecided.get(message.id);
  diceDecided.delete(message.id);

  const card = message.flags[MOD]?.card;
  const shot = card && bursts.get(card);
  if (!shot) return;
  bursts.delete(card);
  if (game.user !== game.users.activeGM) return;

  const { origin, context } = message.flags.pf2e;
  const damage = message.rolls?.[0]?.total;
  shot.damage = Number.isFinite(damage) ? damage : null;
  shot.rank = origin?.castRank ?? shot.rank;
  shot.tokenId = context?.token ?? null;

  const go = () => goOff(kind, shot);
  if (!game.modules.get(DSN)?.active || decided === false) {
    go();
    return;
  }
  rolling.set(message.id, { go, timer: setTimeout(() => release(message.id), DICE_WAIT_MS) });
}

// Dice So Nice has decided whether this client animates a message's dice. It
// may decide before or after this module hears of the message.
function onDiceProcessed(messageId, interception) {
  if (game.user !== game.users.activeGM) return;
  if (rolling.has(messageId)) {
    if (!interception.willTrigger3DRoll) release(messageId);
    return;
  }
  if (damageKind(game.messages.get(messageId))) {
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
  waiting.go();
}

function goOff(kind, shot) {
  Promise.resolve()
    .then(() => kind.fire(shot))
    .catch((err) => console.error(`${MOD} | damage burst`, err));
}
