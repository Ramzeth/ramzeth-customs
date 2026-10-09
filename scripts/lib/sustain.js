// Sustaining a spell, as PF2e Auto Action Tracker reports it.
//
// The tracker reminds a caster, at the start of their turn, of each spell
// they are sustaining, with buttons to Sustain it or let it lapse. Choosing
// Sustain makes a GM's client post a message of its own, marked as the
// tracker's sustain and naming the spell's item, which logs the action. The
// copy of the spell's card in it is stripped of the links that would make it
// work, so a spell that does something each time it is sustained registers
// here to be told, and posts what it needs — its own card again, say
// (postSpellCard).
//
// Letting a spell lapse deletes the caster's effects whose
// flags.pf2e.origin.uuid is the spell's; a spell whose effect carries it ends
// with that.
//
// Without the tracker nothing here is ever called.

import { MOD } from "../const.js";

const TRACKER = "pf2e-auto-action-tracker";

// What to do when a spell is sustained, by the spell's slug.
const handlers = new Map();

let hooked = false;

// handler({ actor, spell, message }): on the active GM's client, as the
// caster sustains the spell. message is the tracker's.
export function onSustain(slug, handler) {
  handlers.set(slug, handler);
  if (hooked) return;
  hooked = true;
  Hooks.on("createChatMessage", onTrackerMessage);
}

function onTrackerMessage(message) {
  if (game.user !== game.users.activeGM) return;
  const flags = message.flags?.[TRACKER];
  if (!flags?.isSustainAutomation || !flags.sustainedItemId) return;
  const actor = ChatMessage.getSpeakerActor(message.speaker);
  const spell = actor?.items.get(flags.sustainedItemId);
  const handler = spell && handlers.get(spell.slug ?? spell.system?.slug);
  if (!handler) return;
  Promise.resolve()
    .then(() => handler({ actor, spell, message }))
    .catch((err) => console.error(`${MOD} | sustain`, err));
}

// The spell's own chat card, posted again as if cast at castRank — with its
// buttons and template links, and whatever other modules add to a spell's
// card, targets and saves included — without spending a slot or an action;
// the tracker does not count it as a cast. author: the user it is posted as,
// so that it is theirs to use as their own cast's card was. flags: added to
// it.
export async function postSpellCard(spell, { castRank, author, flags = {}, rollMode = "publicroll" } = {}) {
  const message = await spell.toMessage(null, { create: false, rollMode, data: { castRank } });
  if (!message) return null;
  message.updateSource({ flags, ...(author ? { author } : {}) });
  return ChatMessage.implementation.create(message.toObject(), { renderSheet: false });
}
