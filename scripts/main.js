// Entry point. Wiring only — every piece of behaviour lives in its own file.

import { MOD } from "./const.js";
import { registerWallOfStone } from "./spells/wall-of-stone.js";

Hooks.once("init", () => {
  // Spell automation is PF2e-specific. The compendiums are not, so the system
  // is checked here instead of being declared in module.json, which would tie
  // the whole module — prefabs and sounds included — to one system.
  if (game.system.id !== "pf2e") return;

  const api = {
    wallOfStone: registerWallOfStone()
  };

  Hooks.once("ready", () => {
    game.modules.get(MOD).api = api;
  });
});
