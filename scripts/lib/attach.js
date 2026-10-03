// Attaching placeables to a token so that they move with it.
//
// The token is the anchor. Every attached document stores, in its own flags,
// which token it belongs to and where it sits relative to that token's
// centre. When the token moves, each attached document is put back at
// "centre + offset", worked out from scratch every time rather than by
// applying a delta, so a missed or doubled update cannot make anything drift.
//
// Only the attached documents point at their anchor; the token keeps no list
// of them. A list would have to be kept in step by hand, and anything deleted
// from its own layer would leave it stale. The token carries just a marker
// saying it is an anchor, so that ordinary tokens moving around the scene
// never trigger a search.
//
// Movement on the map, plus elevation for walls that have a vertical range.
// Nothing attached so far needs to turn with its token.

import { MOD } from "../const.js";

// Walls have no height in core v14; the Wall Height module stores one in
// these flags, in scene distance units, with -Infinity and Infinity meaning
// unbounded. A wall is lifted with its anchor only if both ends are finite:
// an unbounded wall stands at every elevation and has nothing to move.
const WALL_HEIGHT = "wall-height";

function wallRange(data) {
  const { bottom, top } = data.flags?.[WALL_HEIGHT] ?? {};
  return Number.isFinite(bottom) && Number.isFinite(top) ? { bottom, top } : null;
}

// Read from the document rather than the placeable, so it is right even for a
// token that is not on the current canvas, and does not depend on whether a
// token's x/y mean a corner or a centre.
function anchorCentre(token) {
  return token.getCenterPoint();
}

// Each attachable type stores its offset in the shape it is positioned by: a
// wall by its two endpoints, a tile by its own anchor point (the centre, in
// v14). toOffset accepts a document or plain creation data alike and returns
// the flags to store; fromOffset turns those flags back into update data.
//
// A wall's vertical range is kept in a flag of its own, offsetZ, next to the
// horizontal offset rather than inside it, so walls attached before
// elevation was tracked keep working unchanged — they simply have none.
const SHAPES = {
  Wall: {
    collection: "walls",
    toOffset: (data, o) => {
      const flags = {
        offset: [data.c[0] - o.x, data.c[1] - o.y, data.c[2] - o.x, data.c[3] - o.y]
      };
      const range = wallRange(data);
      if (range) flags.offsetZ = [range.bottom - o.elevation, range.top - o.elevation];
      return flags;
    },
    fromOffset: ({ offset, offsetZ }, o) => {
      const target = {
        c: [o.x + offset[0], o.y + offset[1], o.x + offset[2], o.y + offset[3]]
      };
      if (offsetZ) {
        target[`flags.${WALL_HEIGHT}.bottom`] = o.elevation + offsetZ[0];
        target[`flags.${WALL_HEIGHT}.top`] = o.elevation + offsetZ[1];
      }
      return target;
    }
  },
  Tile: {
    collection: "tiles",
    toOffset: (data, o) => ({ offset: [data.x - o.x, data.y - o.y] }),
    fromOffset: ({ offset }, o) => ({ x: o.x + offset[0], y: o.y + offset[1] })
  }
};

// Creates walls and tiles attached to a token. They are given in absolute
// scene coordinates, exactly as they would be created on their own; their
// offsets from the token's current centre are worked out here, so the caller
// never deals in offsets.
//
// Flags the caller passes are kept: ours are merged in beside them, so a
// spell can still tag the same documents with its own ids.
//
// The anchor marker goes on first. Setting it is an update to the token, and
// the movement handler must already be able to tell that update apart from a
// move — it only reacts to position changes.
export async function attach(token, { walls = [], tiles = [] } = {}) {
  if (!token.getFlag(MOD, "anchor")) await token.setFlag(MOD, "anchor", true);

  const scene = token.parent;
  const centre = anchorCentre(token);
  const created = {};

  for (const [type, list] of [["Wall", walls], ["Tile", tiles]]) {
    if (!list.length) continue;
    const { toOffset } = SHAPES[type];
    const data = list.map((d) => foundry.utils.mergeObject(d, {
      flags: { [MOD]: { attachedTo: token.id, ...toOffset(d, centre) } }
    }, { inplace: false }));
    created[type] = await scene.createEmbeddedDocuments(type, data);
  }

  return created;
}

// Jobs for one anchor run one after another. Two quick moves would otherwise
// race: both read the token's position, and whichever write lands last wins,
// even if it was worked out from the earlier position. Run in turn, each job
// reads the position at the moment it starts, so the last one always sees
// where the token finally stands.
const pending = new Map();

function serial(key, job) {
  const run = (pending.get(key) ?? Promise.resolve()).then(job, job);
  pending.set(key, run);
  run.finally(() => { if (pending.get(key) === run) pending.delete(key); });
  return run;
}

// Keys may be dotted paths into flags, so they are read with getProperty.
function isAt(doc, target) {
  return Object.entries(target).every(([key, value]) => {
    const current = foundry.utils.getProperty(doc, key);
    return Array.isArray(value)
      ? value.every((v, i) => current?.[i] === v)
      : current === value;
  });
}

// Puts everything attached to a token back at "centre + offset": one batched
// update per document type, and only for documents actually out of place, so
// realigning a scene where nothing moved writes nothing at all.
export function placeAttached(token) {
  return serial(token.uuid, async () => {
    const scene = token.parent;

    // Deleted while the job was waiting its turn. The deletion handler takes
    // the attached documents away; moving them now would race it.
    if (!scene?.tokens.has(token.id)) return;

    const centre = anchorCentre(token);

    for (const [type, { collection, fromOffset }] of Object.entries(SHAPES)) {
      const updates = [];
      for (const doc of scene[collection]) {
        if (doc.getFlag(MOD, "attachedTo") !== token.id) continue;
        const flags = doc.flags?.[MOD];
        if (!flags?.offset) continue;

        const target = fromOffset(flags, centre);
        if (!isAt(doc, target)) updates.push({ _id: doc.id, ...target });
      }
      if (updates.length) await scene.updateEmbeddedDocuments(type, updates);
    }
  });
}

// Removes everything attached to a token. Queued with the moves, so it cannot
// interleave with a realignment still in flight. Works for a token that is
// already gone: all it needs is the id and the scene.
export function detach(token) {
  return serial(token.uuid, async () => {
    const scene = token.parent;
    if (!scene) return;

    for (const [type, { collection }] of Object.entries(SHAPES)) {
      const ids = scene[collection]
        .filter((d) => d.getFlag(MOD, "attachedTo") === token.id)
        .map((d) => d.id);
      if (ids.length) await scene.deleteEmbeddedDocuments(type, ids);
    }
  });
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

// What moves the anchor: its place on the map, its size, and its elevation —
// the last for walls that carry a vertical range.
const POSITION_KEYS = ["x", "y", "width", "height", "elevation"];

function report(err) {
  console.error(`${MOD} | attach`, err);
  ui.notifications.error(`Attach: ${err.message}`);
}

// Updates reach every client; only the active GM acts on them. That is what
// lets a player move a token they own and have its walls follow: players may
// not touch walls, the GM's client may, and the event arrives there anyway,
// so no socket is involved. It arrives in the order the server wrote the
// updates, and it arrives even when the GM is looking at another scene —
// which is why everything here works from the document, never the canvas.
//
// Only position changes count. Setting the anchor flag is an update too, and
// must not set anything in motion.
function onTokenUpdated(token, changes) {
  if (game.user !== game.users.activeGM) return;
  if (!token.getFlag(MOD, "anchor")) return;
  if (!POSITION_KEYS.some((key) => key in changes)) return;
  placeAttached(token).catch(report);
}

function onTokenDeleted(token) {
  if (game.user !== game.users.activeGM) return;
  if (!token.getFlag(MOD, "anchor")) return;
  detach(token).catch(report);
}

// An anchor moved while no GM was connected left its walls behind: nobody was
// there to receive the update. Realigning when a GM loads the scene repairs
// it, and costs nothing when everything is in place, since placeAttached
// writes only what is out of position.
function onCanvasReady() {
  if (game.user !== game.users.activeGM) return;
  for (const token of canvas.scene.tokens) {
    if (token.getFlag(MOD, "anchor")) placeAttached(token).catch(report);
  }
}

export function registerAttach() {
  Hooks.on("updateToken", onTokenUpdated);
  Hooks.on("deleteToken", onTokenDeleted);
  Hooks.on("canvasReady", onCanvasReady);
  return { attach, detach, placeAttached };
}
