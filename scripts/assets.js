// Where the module's media live.
//
// None of these files ship with the module. They sit in the world's
// Data/ASSETS folder, which is backed up on its own; the module only knows
// their paths. Keeping every path in this one file means moving or renaming
// an asset is a single edit, and the code itself never spells out a location.
//
// Compendium content (prefabs, playlists) refers to ASSETS directly in its
// own data and is not covered here.

const STONE_COLLAPSE = "ASSETS/Sounds/Oneshots/Stone/Rock-Fall-Colosseum_Collapse.mp3";

// JB2A, free edition, copied out of the module's Library folder.
const FIREBALL = "ASSETS/Animations/3rd_Level/Fireball";

export const ASSETS = {
  wallOfStone: {
    // One grid square of straight stone wall. The art runs along the image's
    // long axis.
    wallTile: "ASSETS/Images/!Core_Settlements/Structures/Building/Walls_and_Curbs/Wall_Stone_B/Wall_Stone_Earthy_B1_Straight_C_1x1.webp",

    // A pile two squares long and one deep.
    rubble: "ASSETS/Images/!Core_Settlements/Structures/Rubble/Rubble_Piles/Stone/Rubble_Pile_Stone_Earthy_A36_4x2.webp",

    collapse: STONE_COLLAPSE
  },

  slidingBlocks: {
    // A square stone plinth, standing in for the cube seen from above. Drawn
    // at two squares and scaled down onto a one-square token.
    cube: "ASSETS/Images/!Core_Settlements/Structures/Statues/Bases/Base_Stone_Sandstone_Square_B_2x2.webp",

    // TODO: placeholder. This is the Wall of Stone collapse, a whole wall
    // section coming down; a single 5-foot block crumbling wants a sound of
    // its own.
    destroy: STONE_COLLAPSE
  },

  // JB2A draws its art at 200 pixels per 5-foot square. That is the scale of
  // the files themselves and has nothing to do with the grid of any scene:
  // Sequencer maps each file onto whatever grid the scene uses.
  fireball: {
    // 800 file pixels square — a 20-foot blast at the file's own scale.
    explosion: `${FIREBALL}/FireballExplosion_01_Orange_800x800.webm`,

    // Flames left burning, without flying debris, for the higher ranks.
    afterglow: `${FIREBALL}/FireballLoopNoDebris_01_Orange_800x800.webm`,

    // Eight seconds long.
    sound: "ASSETS/Sounds/Oneshots/Fire/fireball.ogg",

    // The bead in flight, drawn at fixed lengths. Each file is its length
    // plus 200 file pixels of run-up at either end. The one nearest the
    // actual distance is stretched to fit it.
    beams: [
      { feet: 5,  src: `${FIREBALL}/FireballBeam_01_Orange_05ft_600x400.webm` },
      { feet: 15, src: `${FIREBALL}/FireballBeam_01_Orange_15ft_1000x400.webm` },
      { feet: 30, src: `${FIREBALL}/FireballBeam_01_Orange_30ft_1600x400.webm` },
      { feet: 60, src: `${FIREBALL}/FireballBeam_01_Orange_60ft_2800x400.webm` },
      { feet: 90, src: `${FIREBALL}/FireballBeam_01_Orange_90ft_4000x400.webm` }
    ]
  }
};
