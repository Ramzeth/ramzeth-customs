// Where the module's media live.
//
// None of these files ship with the module. They sit in the world's
// Data/ASSETS folder, which is backed up on its own; the module only knows
// their paths. Keeping every path in this one file means moving or renaming
// an asset is a single edit, and the code itself never spells out a location.
//
// Compendium content (prefabs, playlists) refers to ASSETS directly in its
// own data and is not covered here.

export const ASSETS = {
  wallOfStone: {
    // One grid square of straight stone wall. The art runs along the image's
    // long axis.
    wallTile: "ASSETS/Images/!Core_Settlements/Structures/Building/Walls_and_Curbs/Wall_Stone_B/Wall_Stone_Earthy_B1_Straight_C_1x1.webp",

    // A pile two squares long and one deep.
    rubble: "ASSETS/Images/!Core_Settlements/Structures/Rubble/Rubble_Piles/Stone/Rubble_Pile_Stone_Earthy_A36_4x2.webp",

    collapse: "ASSETS/Sounds/Oneshots/Stone/Rock-Fall-Colosseum_Collapse.mp3"
  },

  slidingBlocks: {
    // A square stone plinth, standing in for the cube seen from above. Drawn
    // at two squares and scaled down onto a one-square token.
    cube: "ASSETS/Images/!Core_Settlements/Structures/Statues/Bases/Base_Stone_Sandstone_Square_B_2x2.webp"
  }
};
