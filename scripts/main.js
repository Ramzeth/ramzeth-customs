// Entry point. Wiring only — every piece of behaviour lives in its own file.

import { MOD } from "./const.js";
import { registerAttach } from "./lib/attach.js";
import { registerEffects } from "./lib/effects.js";
import { registerRegionPlacement } from "./lib/region-placement.js";
import { registerFireball } from "./spells/fireball.js";
import { registerSlidingBlocks } from "./spells/sliding-blocks.js";
import { registerStagnateTime } from "./spells/stagnate-time.js";
import { registerWallOfStone } from "./spells/wall-of-stone.js";

Hooks.once("init", () => {
  // Infrastructure knows nothing about any game system, so it is always on.
  registerEffects();
  const api = {
    attach: registerAttach()
  };

  // Spell automation is PF2e-specific. The compendiums are not, so the system
  // is checked here instead of being declared in module.json, which would tie
  // the whole module — prefabs and sounds included — to one system.
  if (game.system.id === "pf2e") {
    registerRegionPlacement();
    api.wallOfStone = registerWallOfStone();
    api.slidingBlocks = registerSlidingBlocks();
    api.fireball = registerFireball();
    api.stagnateTime = registerStagnateTime();
  }

  Hooks.once("ready", () => {
    game.modules.get(MOD).api = api;
  });
});
