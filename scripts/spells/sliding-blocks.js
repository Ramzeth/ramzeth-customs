// Sliding Blocks (PF2e, rank 4, Rage of Elements).
//
// The player places up to six one-square blocks from the @Template link in
// the spell's description, and each placed square becomes a block straight
// away: a token that carries the picture and the block's Hit Points, with
// eight walls attached to it that follow wherever the token is dragged.
// Sustaining the spell is simply dragging blocks. A block reduced to 0 Hit
// Points, or whose token is deleted, is gone together with its walls.

import { ASSETS } from "../assets.js";
import { MOD } from "../const.js";
import { attach } from "../lib/attach.js";
import { playSound } from "../lib/effects.js";
import { handlePlacement } from "../lib/region-placement.js";

// Marks a deletion as the spell ending rather than a block being destroyed,
// so the clean-up is silent.
const CLEARING = `${MOD}Clear`;

const SLUG = "origin:item:slug:sliding-blocks";
const BLOCK_COLOR = "#8a7a5c";

// Levitation needs walls with a height, which core v14 does not have. With
// the Wall Height module the block's walls span exactly the block's own
// height and rise with its token; without it they stand at every elevation,
// and a raised block still stops everything beneath it.
const WALL_HEIGHT = "wall-height";

function wallHeightActive() {
  return game.modules.get(WALL_HEIGHT)?.active ?? false;
}

// Up to six 5-foot cubes per casting. Each has AC 10, Hardness 10 and 40 Hit
// Points; heightening by two ranks adds 10, so only whole steps of two count.
const MAX_BLOCKS = 6;
const BASE_RANK = 4;
const BLOCK_AC = 10;
const BLOCK_HARDNESS = 10;
const BASE_HP = 40;
const HP_PER_HEIGHTENING = 10;

export function registerSlidingBlocks() {
  document.addEventListener("click", onButtonClick);
  handlePlacement(SLUG, {
    shape: squareTemplate,
    limit: (data) => Math.max(0,
      MAX_BLOCKS - collectBlocks(canvas.scene, data.flags?.pf2e?.messageId).length),
    // Turning a one-square block only pushes it off the grid.
    options: (options) => ({ ...options, allowRotation: false })
  });
  Hooks.on("createRegion", onBlockPlaced);
  Hooks.on("updateActor", onBlockDamaged);
  Hooks.on("deleteToken", onBlockDeleted);
  return { collectBlocks, clear };
}

/* -------------------------------------------- */
/*  Placement                                   */
/* -------------------------------------------- */

// The template becomes a one-square rectangle held by its corner. PF2e's own
// lines snap their start to a grid vertex while being placed; a rectangle
// anchored at its corner should snap the same way and so fill exactly one
// cell. Where the block ends up is still worked out from the centre and
// snapped again on the GM's side, so a template that lands off the grid
// cannot put a block off it.
function squareTemplate(data) {
  const size = canvas.grid.size;
  const shaped = foundry.utils.deepClone(data);
  shaped.shapes = [{
    type: "rectangle",
    x: data.shapes[0].x ?? 0,
    y: data.shapes[0].y ?? 0,
    width: size,
    height: size,
    anchorX: 0,
    anchorY: 0,
    rotation: 0,
    hole: false
  }];
  shaped.color = BLOCK_COLOR;
  return shaped;
}

// The centre of the grid square under the placed template.
function placedCell(region) {
  const scene = region.parent;
  const s = region.shapes[0];
  const centre = {
    x: s.x + s.width * (0.5 - (s.anchorX ?? 0)),
    y: s.y + s.height * (0.5 - (s.anchorY ?? 0))
  };
  return scene.grid.getSnappedPoint(centre, {
    mode: CONST.GRID_SNAPPING_MODES.CENTER,
    resolution: 1
  });
}

// A player cannot create tokens or walls, so the template they placed is only
// a request. The GM's client receives every region creation anyway and does
// the building, which is why only the active GM acts here.
//
// The template is removed whatever happens: it was a marker, and leaving it
// would put a coloured square under a block that is already there.
async function onBlockPlaced(region) {
  if (game.user !== game.users.activeGM) return;
  const origin = region.flags?.pf2e?.origin;
  if (!(origin?.rollOptions ?? []).includes(SLUG)) return;

  const scene = region.parent;
  const messageId = region.flags.pf2e.messageId;

  try {
    if (!messageId) {
      ui.notifications.warn("Sliding Blocks: ставьте блоки из карточки каста в чате.");
      return;
    }
    if (collectBlocks(scene, messageId).length >= MAX_BLOCKS) {
      ui.notifications.warn(`Sliding Blocks: больше ${MAX_BLOCKS} блоков за каст нельзя.`);
      return;
    }
    await createBlock(scene, messageId, placedCell(region), origin);
  } catch (err) {
    report(err);
  } finally {
    await scene.deleteEmbeddedDocuments("Region", [region.id]).catch(report);
  }
}

/* -------------------------------------------- */
/*  The block                                   */
/* -------------------------------------------- */

// The eight walls of a solid block, with the directions confirmed on the
// table. Two sets of four, each walking the square's edges clockwise on
// screen, so the interior lies on the same side of every wall:
//
//   movement  blocks entering only. Nothing walks into the block, while the
//             block itself leaves its own walls freely when it is moved.
//   senses    sight, light and sound, blocked on the way out only. The block
//             is seen from outside; nothing is seen or heard through it.
//
// The dungeon's own walls are two-way and stop the block like anything else.
//
// range, when given, is the block's vertical extent in scene distance units.
// lib/attach.js reads it from the walls and keeps it relative to the token's
// elevation from then on.
function cubeWalls({ x, y, width: w, height: h }, range = null) {
  const edges = [
    [x, y, x + w, y],
    [x + w, y, x + w, y + h],
    [x + w, y + h, x, y + h],
    [x, y + h, x, y]
  ];
  const NONE = CONST.WALL_SENSE_TYPES.NONE;
  const NORMAL = CONST.WALL_SENSE_TYPES.NORMAL;
  const height = () => (range ? { flags: { [WALL_HEIGHT]: { ...range } } } : {});

  return edges.flatMap((c) => [
    {
      c,
      move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
      sight: NONE, light: NONE, sound: NONE,
      dir: CONST.WALL_DIRECTIONS.LEFT,
      ...height()
    },
    {
      c,
      move: CONST.WALL_MOVEMENT_TYPES.NONE,
      sight: NORMAL, light: NORMAL, sound: NORMAL,
      dir: CONST.WALL_DIRECTIONS.RIGHT,
      ...height()
    }
  ]);
}

// The token carries the picture itself rather than leaving it to a tile: a
// token's art travels with the drag preview, while anything attached only
// catches up after the drop.
async function createBlock(scene, messageId, centre, origin) {
  const actor = await ensureBlockActor(messageId, origin);
  const size = scene.grid.size;
  const levitates = wallHeightActive();

  // A block is one square tall. Wall Height reads a token's own height from
  // this flag; without it the block would count as a creature of default
  // height when lines of sight are traced against it.
  const heightFlags = levitates
    ? { [WALL_HEIGHT]: { tokenHeight: scene.grid.distance } }
    : {};

  const [token] = await scene.createEmbeddedDocuments("Token", [{
    name: actor.name,
    actorId: actor.id,
    actorLink: false,
    texture: { src: ASSETS.slidingBlocks.cube },
    width: 1,
    height: 1,
    x: centre.x - size / 2,
    y: centre.y - size / 2,
    displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
    displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
    disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
    flags: { [MOD]: { castId: messageId, slidingBlock: true }, ...heightFlags }
  }]);

  // The walls are laid around where the token actually landed, read back
  // from the document, so they hug it even if its x/y were taken to mean
  // something other than the corner. Vertically they run from the token's
  // elevation to one square above it.
  const c = token.getCenterPoint();
  const range = levitates
    ? { bottom: c.elevation, top: c.elevation + scene.grid.distance }
    : null;
  await attach(token, {
    walls: cubeWalls({ x: c.x - size / 2, y: c.y - size / 2, width: size, height: size }, range)
  });
}

function blockHitPoints(rank) {
  return BASE_HP + HP_PER_HEIGHTENING * Math.floor((rank - BASE_RANK) / 2);
}

// One actor per casting; every block's token is unlinked to it, so each block
// takes damage on its own while all six share one stat block.
//
// Owned by whoever owns the caster. Unlinked tokens take their ownership from
// the actor, and without it the player could not drag the blocks they
// conjured.
async function ensureBlockActor(messageId, origin) {
  const existing = game.actors.find((a) =>
    a.getFlag(MOD, "castId") === messageId && a.getFlag(MOD, "slidingBlocks"));
  if (existing) return existing;

  const rank = origin?.castRank ?? BASE_RANK;
  const hp = blockHitPoints(rank);

  const caster = origin?.actor ? await fromUuid(origin.actor) : null;
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const owners = Object.entries(caster?.ownership ?? {})
    .filter(([id, level]) => id !== "default" && level >= OWNER)
    .map(([id]) => [id, OWNER]);

  return CONFIG.Actor.documentClass.create({
    name: `Sliding Block (rank ${rank})`,
    type: "hazard",
    img: ASSETS.slidingBlocks.cube,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, ...Object.fromEntries(owners) },
    system: {
      attributes: {
        ac: { value: BLOCK_AC },
        hardness: BLOCK_HARDNESS,
        hp: { value: hp, max: hp }
      }
    },
    prototypeToken: { actorLink: false },
    flags: { [MOD]: { castId: messageId, slidingBlocks: true } }
  });
}

function collectBlocks(scene, messageId) {
  if (!scene || !messageId) return [];
  return scene.tokens.filter((t) =>
    t.getFlag(MOD, "slidingBlock") && t.getFlag(MOD, "castId") === messageId);
}

/* -------------------------------------------- */
/*  Destruction and clean-up                    */
/* -------------------------------------------- */

// A block at 0 Hit Points is destroyed. Only its token is deleted here: the
// walls are attached to it, and lib/attach.js takes them away when it goes.
//
// Hit points of an unlinked token live in its own delta, so damage arrives as
// an update to the synthetic actor rather than the one in the sidebar.
function onBlockDamaged(actor, changes) {
  if (game.user !== game.users.activeGM) return;
  if (!actor.isToken) return;

  const token = actor.token;
  if (!token?.getFlag(MOD, "slidingBlock")) return;
  if (foundry.utils.getProperty(changes, "system.attributes.hp") === undefined) return;
  if ((actor.system?.attributes?.hp?.value ?? 1) > 0) return;

  token.parent.deleteEmbeddedDocuments("Token", [token.id]).catch(report);
}

// A block whose token goes is a block destroyed, whether it was worn down to
// 0 Hit Points or deleted by hand, so the sound is tied to the deletion
// rather than to the damage. The walls are not this handler's business:
// lib/attach.js takes them away on the same event.
//
// The document keeps its data after deletion, so its flags can still be
// read here.
function onBlockDeleted(token, options) {
  if (options?.[CLEARING]) return;
  if (game.user !== game.users.activeGM) return;
  if (!token.getFlag(MOD, "slidingBlock")) return;
  playSound(ASSETS.slidingBlocks.destroy);
}

// The spell is over: every block of the casting, its throwaway actor and any
// template still lying about. Walls go with their tokens through
// lib/attach.js; the actor goes last so no token is left pointing at nothing.
async function clear(scene, messageId) {
  const blocks = collectBlocks(scene, messageId).map((t) => t.id);
  if (blocks.length) {
    await scene.deleteEmbeddedDocuments("Token", blocks, { [CLEARING]: true });
  }

  const drafts = scene.regions
    .filter((r) => r.flags?.pf2e?.messageId === messageId &&
      (r.flags?.pf2e?.origin?.rollOptions ?? []).includes(SLUG))
    .map((r) => r.id);
  if (drafts.length) await scene.deleteEmbeddedDocuments("Region", drafts);

  const actor = game.actors.find((a) =>
    a.getFlag(MOD, "castId") === messageId && a.getFlag(MOD, "slidingBlocks"));
  if (actor) await actor.delete();

  return blocks.length;
}

/* -------------------------------------------- */
/*  Chat card button                            */
/* -------------------------------------------- */

function onButtonClick(event) {
  const button = event.target?.closest?.("a.rc-blocks");
  if (!button) return;
  event.preventDefault();

  if (!game.user.isGM) {
    ui.notifications.warn("Блоки Sliding Blocks убирает GM.");
    return;
  }

  // The button learns its casting from the card it is drawn in. It renders
  // on the item sheet too, where there is no card and nothing to do.
  const messageId = button.closest("[data-message-id]")?.dataset.messageId;
  if (!messageId) {
    ui.notifications.warn("Кнопка вне чат-карточки — каст не определить.");
    return;
  }

  if (button.dataset.action !== "clear") return;
  clear(canvas.scene, messageId)
    .then((count) => ui.notifications.info(`Убрано блоков: ${count}.`))
    .catch(report);
}

function report(err) {
  console.error(`${MOD} | sliding-blocks`, err);
  ui.notifications.error(`Sliding Blocks: ${err.message}`);
}
