// One wrapper around the region layer's placeRegion, shared by every spell
// that shapes its own template.
//
// libWrapper allows a package a single wrapper per target, so spells cannot
// each register their own. They register a handler here instead, keyed by
// the roll option that identifies the spell, and the wrapper hands each
// placement to the matching handler.
//
// placeRegion is the only seam available: it receives the data the placement
// preview is drawn from, so correcting the data here fixes the preview and
// the region that gets created at once. The PF2e method that assembles that
// data, #onClickInlineTemplate, is private and cannot be wrapped.

import { MOD } from "../const.js";

const handlers = new Map();

// handler:
//   shape(data)        data for one placement — required
//   limit(data)        how many placements one click allows — default 1
//   options(options)   placement options — default unchanged
//   done(placed, limit) called once the run ends
export function handlePlacement(rollOption, handler) {
  handlers.set(rollOption, handler);
}

function handlerFor(data) {
  const rollOptions = data?.flags?.pf2e?.origin?.rollOptions ?? [];
  for (const [option, handler] of handlers) {
    if (rollOptions.includes(option)) return handler;
  }
  return null;
}

// One click on the link starts a run of placements rather than a single one:
// a wall is two dozen sections, a spell may conjure six blocks, and clicking
// back into the chat card between each of them is unusable at the table.
//
// The loop is ours rather than the layer's own multi-shape mode on purpose.
// placeRegion and placeRegions can both walk through several shapes, but they
// return null when the dismiss key is pressed, and it is not documented
// whether that discards what was already placed. Here every iteration is a
// finished call that has already created its region, so stopping early —
// right-click or Escape — cannot lose anything.
//
// Registered at "ready" because the target path resolves through
// canvas.regions, which does not exist before the canvas is up.
export function registerRegionPlacement() {
  Hooks.once("ready", () => {
    libWrapper.register(MOD,
      "canvas.regions.constructor.prototype.placeRegion",
      async function (wrapped, data, options) {
        const handler = data?.shapes?.[0] ? handlerFor(data) : null;
        if (!handler) return wrapped(data, options);

        const limit = handler.limit?.(data) ?? 1;
        const placementOptions = handler.options?.(options) ?? options;
        let last = null;
        let placed = 0;

        while (placed < limit) {
          const region = await wrapped(handler.shape(data), placementOptions);
          if (!region) break;
          last = region;
          placed++;
        }

        handler.done?.(placed, limit);
        return last;
      }, "WRAPPER");
  });
}
