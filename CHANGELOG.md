# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-10-06

### Added

- Stagnate Time: placing the spell's template raises a field where time runs
  thick, hidden as a region but plain to see on the map, which bends inside
  it — the picture rocks in a slow swirl, faint rings creep outward, its
  colour drains to a cold grey, and the edge refracts like glass. The caster
  gets the spell's effect for its minute; when it ends the field goes, and
  removing the field ends the effect. In an encounter, a creature starting
  its turn in the field gets a message, for its owners and the GM, with a
  button that rolls its Will save against the caster's spell DC; a failure
  slows it 1 and a critical failure 2, until the end of that turn. Creatures
  already standing in the field when it appears are asked too, from the
  first turn of the encounter. The caster's effect and the slows run on PF2e
  timers and are removed by PF2e when they run out.
- A reusable lens field (`scripts/lib/lens.js`): a shader bending the map
  inside any region a spell marks, drawn on each client and fading in and
  out with its region.

## [1.4.1] - 2026-10-06

### Changed

- Fireball: how big the fireball looks follows the damage rolled rather than
  the rank cast. It looks like the rank whose average damage the roll is
  nearest — from 25 damage it looks like rank 4, then 32, 39, 46, 53, 60 and
  67 for ranks 5 to 10 — so a lucky roll looks bigger and a poor one smaller,
  about as often each way, and bonus damage beyond the rank shows too.
- Wall of Stone: each section is shut in a rectangle of terrain walls around
  the stone drawn on its tile, its axis on the grid edge, instead of a single
  wall on the edge. The inside of the stone is now in view from either side,
  so a section's token can be seen and targeted, while nothing beyond the
  wall can be seen through it and nothing passes. Sections built before keep
  their single wall until the wall is demolished and built again.

## [1.4.0] - 2026-10-05

### Added

- Fireball animation, played by the module rather than Automated Animations.
  A bead of fire grows silently at the caster's hand, flies to the centre of
  the burst as a bolt of fire for the whole of the whoosh — its light
  carried along with it — and blossoms into the explosion with the bang, the
  moment it lands. It goes off when the damage is rolled from the spell's chat
  card, once Dice So Nice's dice have landed, at the template placed from
  that same card; placing the template only marks where. Each card's fireball
  goes off once, so a reroll does not explode again. Every rank from 3 to 10
  is a step up: the fire goes from orange through amber, gold and white to
  blinding white edged in blue and then violet; it grows from short of the
  burst's edge to well past it; a short blast becomes a long one with a glow.
  At every rank a real light flares over the scene with the strike, reaching
  further with every rank, and dies down smoothly with the fire —
  ember-orange while the ground still smoulders. From rank 4 every screen at
  the table is dazzled for a moment, harder with every rank, until at rank 10
  the whole screen goes white; the fireball bursts out of the flash as it
  starts to clear. From rank 5 it leaves its mark, more of it with every
  rank: glowing cracks in the ground; a shockwave from rank 6; the fireball
  blazing on from rank 8, spreading wider and thinner as it burns out;
  red-hot ground from rank 9. The fire is drawn above the scene's lighting,
  so it shows on a dark map whether or not a light falls on it. Every client
  starts loading the animations as soon as the template is placed, so even
  the first fireball of a session plays in full. Uses free JB2A animations —
  Fireball, Fire Bolt and generic fire, ground and shockwave files — copied
  into `Data/ASSETS/Animations/` with JB2A's own folders.
- Screen shake with the fireball's blast: none at rank 3, harder and longer
  with every rank above. Users flagged `noShake` are left out — meant for a
  TV used as a play mat.
- Fireball sound, timed to what is on screen: the whoosh while the bolt
  flies, the bang the moment it lands, together with the flash, the blast and
  the shake. Quiet at rank 3 and louder with every rank; the lower
  ranks cut the bang's rumble short with a fade, since their blast is over
  sooner. Ranks 7 and 8 use a slower, deeper version of the sound with a
  longer tail, and ranks 9 and 10 a deeper and longer one still, both made
  from the same source and kept as `fireball_heavy.ogg` and
  `fireball_huge.ogg` beside it in `Data/ASSETS/Sounds/Oneshots/Fire/`.

### Changed

- Sounds are no longer placed on the map: everyone hears them at the same
  volume. A placed sound reached only users with a token selected near it, so
  it went silent while a template was being placed and never reached a
  display user with no tokens. Applies to Wall of Stone collapsing and a
  Sliding Block destroyed as well.
- Sounds are played by each client through Foundry's own audio, on the
  interface channel, instead of through Sequencer: Sequencer fades an
  unplaced sound out from full volume whatever volume it was playing at, so
  a quiet sound leapt to full just before it ended. They reach the other
  clients over the module's own socket, which needs the world to be
  relaunched once after updating.

## [1.3.1] - 2026-10-04

### Added

- Sliding Blocks: a destroyed block plays a sound where it stood. Removing the
  blocks when the spell ends stays silent.

### Changed

- Sequencer is now a required dependency. Sounds are always placed on the map
  where things happened; the flat, unplaced fallback is gone.

## [1.3.0] - 2026-10-03

### Added

- Sliding Blocks: a **Place Block** link in the spell's description places up
  to six one-square blocks, each becoming a block as soon as it is placed. A
  block is a token carrying the picture and an unlinked hazard with the
  block's AC, Hardness and Hit Points, owned by whoever owns the caster so the
  player can drag it. Eight one-way walls attached to it follow wherever it is
  dragged, keep anything from moving into it, and stop sight, light and sound
  passing through it.
- Sliding Blocks: a block at 0 Hit Points, or whose token is deleted, is
  removed together with its walls.
- Sliding Blocks: blocks levitate. Raising a block's token raises its walls
  with it, so creatures can pass beneath a lifted block and anything at its
  height is still stopped. Needs the Wall Height module, now listed as
  recommended; without it a block's walls stand at every elevation.
- Sliding Blocks: **Remove Blocks** button on the cast's chat card, for the
  GM, which clears every block of that casting.
- Sliding Blocks in the Ramzeth Spells compendium, with the placement link and
  the button in its description.

## [1.2.0] - 2026-10-03

### Added

- Wall of Stone: one click on the template link starts a placement run.
  Sections are placed one after another until right-click or Escape, up to the
  spell's 120 feet.
- Wall of Stone: **Build Walls** button on the cast's chat card, for the GM.
  Each placed section becomes a wall, a stone tile and an unlinked hazard token
  with the section's AC, Hardness, Hit Points and immunities, and no health bar
  shown. Pressing it again adds newly placed sections instead of rebuilding.
- Wall of Stone: **Demolish Walls** button that removes everything the cast
  created.
- Wall of Stone: a section reduced to 0 Hit Points, or whose token is deleted,
  collapses. Its wall and tile are removed, rubble and difficult terrain take
  their place, and a collapse sound plays where it stood.
- Wall of Stone in the Ramzeth Spells compendium, with the placement link and
  the buttons in its description.

### Changed

- All images and sounds are referenced from `Data/ASSETS/` instead of
  `fa-nexus-assets/`. The files must be present there on the server; the module
  does not ship them.

### Fixed

- "92 Skirmish" in the Combat playlist pointed at a lowercase `assets/` folder
  that does not exist on a case-sensitive server.

## [1.1.0] - 2026-09-21

### Added

- Ramzeth Prefabs and Ramzeth Sounds compendiums, built from YAML sources, and
  an empty Ramzeth Spells compendium.
- Wall of Stone templates are placed as a thin stone-coloured line instead of a
  square.

[unreleased]: https://github.com/Ramzeth/ramzeth-customs/compare/1.5.0...HEAD
[1.5.0]: https://github.com/Ramzeth/ramzeth-customs/compare/1.4.1...1.5.0
[1.4.1]: https://github.com/Ramzeth/ramzeth-customs/compare/1.4.0...1.4.1
[1.4.0]: https://github.com/Ramzeth/ramzeth-customs/compare/1.3.1...1.4.0
[1.3.1]: https://github.com/Ramzeth/ramzeth-customs/compare/1.3.0...1.3.1
[1.3.0]: https://github.com/Ramzeth/ramzeth-customs/compare/1.2.0...1.3.0
[1.2.0]: https://github.com/Ramzeth/ramzeth-customs/compare/1.1.0...1.2.0
[1.1.0]: https://github.com/Ramzeth/ramzeth-customs/releases/tag/1.1.0
