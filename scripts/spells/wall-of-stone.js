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

// Wall of Stone is up to 120 feet long. The length of one section is set by
// the @Template link in the description, so the number of sections is derived
// from it rather than hardcoded.
const MAX_WALL_FEET = 120;

export function registerWallOfStone() {
  document.addEventListener("click", onWallButtonClick);
  Hooks.once("ready", patchTemplatePlacement);
  return { collectSections, buildWalls, demolishWalls };
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
function patchTemplatePlacement() {
  libWrapper.register(MOD,
    "canvas.regions.constructor.prototype.placeRegion",
    function (wrapped, data, options) {
      const ro = data?.flags?.pf2e?.origin?.rollOptions ?? [];
      if (ro.includes(SLUG) && data?.shapes?.[0]) {
        data = foundry.utils.deepClone(data);
        data.shapes[0].width = Math.max(2, Math.round(canvas.grid.size / 16));
        data.color = STONE_COLOR;
      }
      return wrapped(data, options);
    }, "WRAPPER");
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
function collectSections(messageId) {
  const regions = canvas.scene.regions
    .filter((r) =>
      r.flags?.pf2e?.messageId === messageId &&
      (r.flags?.pf2e?.origin?.rollOptions ?? []).includes(SLUG))
    .sort((x, y) =>
      (x._stats?.createdTime ?? 0) - (y._stats?.createdTime ?? 0) ||
      x.id.localeCompare(y.id));

  const shapes = [];
  for (const region of regions) {
    for (const shape of region.shapes) {
      if (shape.type === "line") shapes.push(shape);
    }
  }
  return shapes;
}

// Demolition is both an operation of its own and the first half of a rebuild.
// Returns the count so the button can say what it did.
//
// Walls only: the regions stay, so the layout survives and can be rebuilt.
// Re-placing a dozen sections is far more work than pressing the button again.
async function demolishWalls(messageId) {
  const ids = canvas.scene.walls
    .filter((w) => w.getFlag(MOD, "castId") === messageId)
    .map((w) => w.id);
  if (ids.length) await canvas.scene.deleteEmbeddedDocuments("Wall", ids);
  return ids.length;
}

// Demolish, then create from scratch — never append. That makes the button
// safe to press repeatedly: the player nudges a section, the GM presses it
// again, and the walls are rebuilt without duplicates or orphans.
//
// Walls are created with defaults on purpose: a plain Foundry wall already
// blocks movement, sight, light and sound in both directions, which is what a
// wall of stone does.
async function buildWalls(messageId) {
  const removed = await demolishWalls(messageId);

  const seen = new Set();
  const walls = [];
  let overflow = 0;
  let limit = Infinity;

  for (const shape of collectSections(messageId)) {
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
    // out from the first real one.
    if (limit === Infinity) {
      const pxPerFoot = canvas.grid.size / canvas.scene.grid.distance;
      limit = Math.floor(MAX_WALL_FEET / (shape.length / pxPerFoot));
    }

    if (walls.length >= limit) {
      overflow++;
      continue;
    }

    walls.push({
      c: [a.x, a.y, b.x, b.y],
      flags: { [MOD]: { castId: messageId } }
    });
  }

  if (walls.length) await canvas.scene.createEmbeddedDocuments("Wall", walls);
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
    ? demolishWalls(messageId).then((removed) => `Снесено стен: ${removed}.`)
    : buildWalls(messageId).then(({ removed, created, overflow }) => {
        const parts = [`Стен: ${created}`];
        if (removed) parts.push(`пересобрано, было ${removed}`);
        if (overflow) parts.push(`лишних секций отброшено: ${overflow}`);
        return `${parts.join("; ")}.`;
      });

  job
    .then((text) => ui.notifications.info(text))
    .catch((err) => ui.notifications.error(`Wall of Stone: ${err.message}`));
}
