// Wall of Stone (PF2e, rank 5).
//
// The player places 5-foot sections from the @Template link in the spell's
// description; each one becomes a thin line region. When the wall is shaped
// to satisfaction the GM presses a button on the same chat card and the
// sections are turned into real walls.
//
// Materialisation is deliberately deferred rather than done on createRegion:
// while the wall is being laid out the player moves, removes and re-places
// sections, and building walls along the way would break sight on the table
// halfway through and force a rebuild on every nudge.

import { MOD } from "../const.js";
import { lineEndpoints } from "../lib/region-geometry.js";

const SLUG = "origin:item:slug:wall-of-stone";
const STONE_COLOR = "#6b6b6b";

// One grid square of straight stone wall, from FA Nexus. The art runs along
// the image's long axis, so a tile rotated to match its wall lines up.
const TILE_TEXTURE =
  "fa-nexus-assets/!Core_Settlements/Structures/Building/Walls_and_Curbs/Wall_Stone_B/Wall_Stone_Earthy_B1_Straight_C_1x1.webp";

// Wall of Stone is up to 120 feet long. The length of one section is set by
// the @Template link in the description, so the number of sections is derived
// from it rather than hardcoded.
const MAX_WALL_FEET = 120;

// Each section has AC 10, Hardness 14 and 50 Hit Points, and is immune to
// critical hits and to precision damage. Heightening by two ranks adds 15 Hit
// Points, so only whole steps of two count.
const SECTION_AC = 10;
const SECTION_HARDNESS = 14;
const BASE_HP = 50;
const HP_PER_HEIGHTENING = 15;
const SECTION_IMMUNITIES = [
  { type: "critical-hits", exceptions: [] },
  { type: "precision", exceptions: [] }
];

export function registerWallOfStone() {
  document.addEventListener("click", onWallButtonClick);
  Hooks.once("ready", patchTemplatePlacement);
  return {
    collectRegions, collectSections, castRank, sectionHitPoints,
    build, demolish,
    deleteWalls, deleteTiles, deleteTokens, deleteSections, deleteSectionActor
  };
}

/* -------------------------------------------- */
/*  Template placement                          */
/* -------------------------------------------- */

// PF2e loses the enricher's width on the way to the region: shapes[0].width
// arrives equal to length, which turns every line into a square. placeRegion
// is the only seam available — it receives the data the placement preview is
// drawn from, so correcting it here fixes the preview and the document that
// gets created at once. The method that assembles that data, PF2e's private
// #onClickInlineTemplate, cannot be wrapped.
//
// Deferred to "ready" because the target path resolves through canvas.regions,
// which does not exist before the canvas is up.
//
// The wrapper also turns one click on the link into a placement run: a wall is
// two dozen sections, and clicking back into the chat card between each of
// them is unusable at the table.
//
// The loop is ours rather than the layer's own multi-shape mode on purpose.
// placeRegion and placeRegions can both take several shapes and walk through
// them, but they return null when the dismiss key is pressed, and it is not
// documented whether that discards what was already placed. Here every
// iteration is a finished call that has already created its region, so
// stopping early cannot lose anything: right-click or Escape simply ends the
// run.
function patchTemplatePlacement() {
  libWrapper.register(MOD,
    "canvas.regions.constructor.prototype.placeRegion",
    async function (wrapped, data, options) {
      const ro = data?.flags?.pf2e?.origin?.rollOptions ?? [];
      if (!ro.includes(SLUG) || !data?.shapes?.[0]) return wrapped(data, options);

      const limit = sectionBudget(data.shapes[0]);
      let last = null;
      let placed = 0;

      while (placed < limit) {
        const region = await wrapped(styleSection(data), options);
        if (!region) break;
        last = region;
        placed++;
      }

      if (placed) ui.notifications.info(`Wall of Stone: ${placed}/${limit} sections placed.`);
      return last;
    }, "WRAPPER");
}

// A section is only as thin as we make it: PF2e sets shapes[0].width equal to
// length, so every line arrives as a square.
function styleSection(data) {
  const styled = foundry.utils.deepClone(data);
  styled.shapes[0].width = Math.max(2, Math.round(canvas.grid.size / 16));
  styled.color = STONE_COLOR;
  return styled;
}

// How many sections fit in 120 feet. The length of one is set by the @Template
// link in the description, so it is measured rather than assumed.
function sectionBudget(shape) {
  const pxPerFoot = canvas.grid.size / canvas.scene.grid.distance;
  return Math.max(1, Math.floor(MAX_WALL_FEET / (shape.length / pxPerFoot)));
}

/* -------------------------------------------- */
/*  Sections and walls                          */
/* -------------------------------------------- */

// Every section placed from one chat card carries that card's id, which PF2e
// writes into flags.pf2e.messageId. One card is one cast, so this is what
// separates two walls raised by the same spell. The slug is checked as well:
// a single card can produce regions for more than one effect.
//
// Sorted by creation time, because the 120-foot limit has to drop the
// sections placed last rather than an arbitrary subset. Collection order
// would probably agree, but that is an implementation detail;
// _stats.createdTime is the actual moment of placement.
//
// Current scene only, by design.
function collectRegions(messageId) {
  return canvas.scene.regions
    .filter((r) =>
      r.flags?.pf2e?.messageId === messageId &&
      (r.flags?.pf2e?.origin?.rollOptions ?? []).includes(SLUG))
    .sort((x, y) =>
      (x._stats?.createdTime ?? 0) - (y._stats?.createdTime ?? 0) ||
      x.id.localeCompare(y.id));
}

function collectSections(messageId) {
  const shapes = [];
  for (const region of collectRegions(messageId)) {
    for (const shape of region.shapes) {
      if (shape.type === "line") shapes.push(shape);
    }
  }
  return shapes;
}

// Walls only. This is the first half of a rebuild, so it must leave the
// sections alone — they are what the walls are about to be rebuilt from.
async function deleteWalls(messageId) {
  const ids = canvas.scene.walls
    .filter((w) => w.getFlag(MOD, "castId") === messageId)
    .map((w) => w.id);
  if (ids.length) await canvas.scene.deleteEmbeddedDocuments("Wall", ids);
  return ids.length;
}

async function deleteTiles(messageId) {
  const ids = canvas.scene.tiles
    .filter((t) => t.getFlag(MOD, "castId") === messageId)
    .map((t) => t.id);
  if (ids.length) await canvas.scene.deleteEmbeddedDocuments("Tile", ids);
  return ids.length;
}

async function deleteTokens(messageId) {
  const ids = canvas.scene.tokens
    .filter((t) => t.getFlag(MOD, "castId") === messageId)
    .map((t) => t.id);
  if (ids.length) await canvas.scene.deleteEmbeddedDocuments("Token", ids);
  return ids.length;
}

async function deleteSections(messageId) {
  const ids = collectRegions(messageId).map((r) => r.id);
  if (ids.length) await canvas.scene.deleteEmbeddedDocuments("Region", ids);
  return ids.length;
}

async function deleteSectionActor(messageId) {
  const actor = game.actors.find((a) => a.getFlag(MOD, "castId") === messageId);
  if (!actor) return 0;
  await actor.delete();
  return 1;
}

// The spell is over: the stone, what it blocked, the draft and the throwaway
// actor all go away.
//
// Order matters twice over. Walls go first, so a failure halfway through
// cannot leave invisible walls standing with nothing on the map to explain
// them. The actor goes after its tokens, because deleting it first would
// leave them pointing at nothing.
async function demolish(messageId) {
  const walls = await deleteWalls(messageId);
  const tiles = await deleteTiles(messageId);
  const tokens = await deleteTokens(messageId);
  await deleteSectionActor(messageId);
  const sections = await deleteSections(messageId);
  return { walls, tiles, tokens, sections };
}

/* -------------------------------------------- */
/*  The throwaway actor                         */
/* -------------------------------------------- */

function castRank(messageId) {
  return collectRegions(messageId)[0]?.flags?.pf2e?.origin?.castRank ?? 5;
}

function sectionHitPoints(rank) {
  return BASE_HP + HP_PER_HEIGHTENING * Math.floor((rank - 5) / 2);
}

// One actor per cast, with every section's token unlinked to it: each section
// then takes damage on its own while they all share one stat block.
//
// Type "hazard" because PF2e already gives it exactly the fields a wall needs
// — armour class, hardness and hit points — with nothing to invent.
//
// Reused across rebuilds rather than recreated. The tokens are replaced
// anyway, so their damage resets, but the actor keeps its identity and the
// sidebar does not churn.
async function ensureSectionActor(messageId) {
  const existing = game.actors.find((a) => a.getFlag(MOD, "castId") === messageId);
  if (existing) return existing;

  const rank = castRank(messageId);
  const hp = sectionHitPoints(rank);

  return CONFIG.Actor.documentClass.create({
    name: `Wall of Stone (rank ${rank})`,
    type: "hazard",
    img: TILE_TEXTURE,
    system: {
      attributes: {
        ac: { value: SECTION_AC },
        hardness: SECTION_HARDNESS,
        hp: { value: hp, max: hp },
        immunities: SECTION_IMMUNITIES
      }
    },
    prototypeToken: { actorLink: false },
    flags: { [MOD]: { castId: messageId } }
  });
}

// Demolish, then create from scratch — never append. That makes the button
// safe to press repeatedly: the player nudges a section, the GM presses it
// again, and everything is rebuilt without duplicates or orphans.
//
// Each surviving section yields one wall and one tile, built in the same pass
// so that the snapping, the deduplication and the budget are applied to both
// exactly once.
//
// Walls are created with defaults on purpose: a plain Foundry wall already
// blocks movement, sight, light and sound in both directions, which is what a
// wall of stone does.
async function build(messageId) {
  const removed = await deleteWalls(messageId);
  await deleteTiles(messageId);
  await deleteTokens(messageId);

  const sections = collectSections(messageId);
  if (!sections.length) return { removed, created: 0, overflow: 0 };

  const actor = await ensureSectionActor(messageId);

  const seen = new Set();
  const walls = [];
  const tiles = [];
  const tokens = [];
  let overflow = 0;
  let limit = Infinity;

  for (const shape of sections) {
    const { a, b } = lineEndpoints(shape);

    // Both ends snapped onto the same vertex: nothing to build.
    if (a.x === b.x && a.y === b.y) continue;

    // Two sections dropped on the same edge would stack two identical walls,
    // which are then impossible to tell apart by hand. Deduplication happens
    // before the limit is applied: a section placed on top of another is a
    // slip of the mouse, not five feet of the spell's budget.
    const key = `${a.x},${a.y},${b.x},${b.y}`;
    const rev = `${b.x},${b.y},${a.x},${a.y}`;
    if (seen.has(key) || seen.has(rev)) continue;
    seen.add(key);

    // Section length is only knowable from a section, so the limit is worked
    // out from the first real one. The placement run already stops at this
    // number; this is the backstop for sections added across several runs.
    if (limit === Infinity) limit = sectionBudget(shape);

    if (walls.length >= limit) {
      overflow++;
      continue;
    }

    const flags = { [MOD]: { castId: messageId } };

    walls.push({ c: [a.x, a.y, b.x, b.y], flags });

    // The art is a 1×1 asset and is never stretched: it always covers exactly
    // one grid square, whatever the section length is.
    //
    // A tile is positioned by its top-left corner but rotates about its
    // centre, so the centre goes on the wall's midpoint and the corner is
    // derived from it — setting x/y directly would offset the tile by half a
    // square.
    const size = canvas.grid.size;

    const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    tiles.push({
      texture: { src: TILE_TEXTURE },
      width: size,
      height: size,
      x: centre.x - size / 2,
      y: centre.y - size / 2,
      rotation: shape.rotation ?? 0,
      locked: true,
      flags
    });

    // One square, centred on the wall like its tile. Unlinked, so this token's
    // hit points are its own; the bar is always on, because the point of the
    // token is to be a target that visibly wears down.
    //
    // The picture is the tile's job. A token always references some texture,
    // so rather than leaving the field empty and getting a placeholder, the
    // sprite is turned off with alpha. The token stays clickable either way —
    // its hit area comes from its bounds, not from what is drawn — so a click
    // on the stone still selects and targets the section underneath.
    tokens.push({
      name: actor.name,
      actorId: actor.id,
      actorLink: false,
      texture: { src: TILE_TEXTURE },
      alpha: 0,
      width: 1,
      height: 1,
      x: centre.x - size / 2,
      y: centre.y - size / 2,
      rotation: shape.rotation ?? 0,
      lockRotation: false,
      displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
      displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
      disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      flags
    });
  }

  if (walls.length) await canvas.scene.createEmbeddedDocuments("Wall", walls);
  if (tiles.length) await canvas.scene.createEmbeddedDocuments("Tile", tiles);
  if (tokens.length) await canvas.scene.createEmbeddedDocuments("Token", tokens);
  return { removed, created: walls.length, overflow };
}

/* -------------------------------------------- */
/*  Chat card buttons                           */
/* -------------------------------------------- */

// Delegated on the document rather than hooked on chat message rendering,
// because the name of that hook changed in v13 and is not worth depending on.
// Plain bubbling phase: nothing competes for this click.
function onWallButtonClick(event) {
  const button = event.target?.closest?.("a.rc-wall");
  if (!button) return;
  event.preventDefault();

  // data-visibility="gm" hides the buttons from players, but the markup can
  // still be reached, so the check is made here too.
  if (!game.user.isGM) {
    ui.notifications.warn("Стены Wall of Stone строит GM.");
    return;
  }

  // The button learns its cast from the card it is drawn in. It also renders
  // on the item sheet, where there is no card and nothing to do.
  const messageId = button.closest("[data-message-id]")?.dataset.messageId;
  if (!messageId) {
    ui.notifications.warn("Кнопка вне чат-карточки — каст не определить.");
    return;
  }

  const job = button.dataset.action === "demolish"
    ? demolish(messageId).then(({ walls, tiles, tokens, sections }) =>
        `Снесено: стен ${walls}, тайлов ${tiles}, токенов ${tokens}, секций ${sections}.`)
    : build(messageId).then(({ removed, created, overflow }) => {
        const parts = [`Секций построено: ${created}`];
        if (removed) parts.push(`пересобрано, было ${removed}`);
        if (overflow) parts.push(`лишних секций отброшено: ${overflow}`);
        return `${parts.join("; ")}.`;
      });

  job
    .then((text) => ui.notifications.info(text))
    .catch((err) => ui.notifications.error(`Wall of Stone: ${err.message}`));
}
