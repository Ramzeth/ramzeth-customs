// Actors made by spells — one per cast: a wall's sections, a set of blocks, a
// summoned creature — and their clean-up.
//
// Such an actor is only ever the stat block behind its tokens on the map. It
// is marked by the cast it came from (flags.<module>.castId), and it is
// deleted as soon as the last of its tokens has left every scene: a wall worn
// down section by section, the last block destroyed, a summon killed or
// dismissed. Spells therefore only ever remove tokens. On loading, the active
// GM also sweeps away any such actor with no token left at all — whatever an
// interrupted clean-up left behind.
//
// The actors are kept in a folder of their own in the Actors sidebar, so
// they neither crowd the world's own actors nor go unnoticed.

import { MOD } from "../const.js";

const FOLDER_NAME = "Ramzeth Customs";

export function isSpellActor(actor) {
  return !!actor?.getFlag(MOD, "castId");
}

// The folder, made the first time it is needed. Concurrent callers share one
// creation rather than making two folders.
let creating = null;

export async function spellActorFolder() {
  const existing = game.folders.find((f) => f.type === "Actor" && f.getFlag(MOD, "spellActors"));
  if (existing) return existing;
  creating ??= Folder.create({
    name: FOLDER_NAME,
    type: "Actor",
    color: "#6b4fa8",
    flags: { [MOD]: { spellActors: true } }
  }).finally(() => { creating = null; });
  return creating;
}

// Ownership for a spell's actor: whoever owns the caster owns it too, and no
// one else sees it. Unlinked tokens take their ownership from the actor, so
// without this the player could not move what they conjured.
export function spellActorOwnership(caster) {
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const owners = Object.entries(caster?.ownership ?? {})
    .filter(([id, level]) => id !== "default" && level >= OWNER)
    .map(([id]) => [id, OWNER]);
  return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, ...Object.fromEntries(owners) };
}

function hasTokens(actor) {
  return game.scenes.some((s) => s.tokens.some((t) => t.actorId === actor.id));
}

// Actors already on their way out. Deleting several tokens at once calls the
// token hook once for each, by when all of them are gone, and every call would
// otherwise send its own deletion of the same actor.
const deleting = new Set();

function remove(actors) {
  const ids = actors.map((a) => a.id).filter((id) => !deleting.has(id));
  if (!ids.length) return;
  ids.forEach((id) => deleting.add(id));
  Actor.deleteDocuments(ids)
    .catch((err) => console.error(`${MOD} | spell actors`, err))
    .finally(() => ids.forEach((id) => deleting.delete(id)));
}

export function registerSpellActors() {
  Hooks.on("deleteToken", (token) => {
    if (game.user !== game.users.activeGM) return;
    const actor = game.actors.get(token.actorId);
    if (isSpellActor(actor) && !hasTokens(actor)) remove([actor]);
  });
  Hooks.once("ready", () => {
    if (game.user !== game.users.activeGM) return;
    remove(game.actors.filter((a) => isSpellActor(a) && !hasTokens(a)));
  });
}
