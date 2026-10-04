# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Fireball animation, played by the module rather than Automated Animations.
  Placing the burst template sends a bead of fire from the caster to the
  centre of the burst, where it explodes to fill the area. Higher ranks play
  faster, glow, burst more than once and leave flames burning; the area never
  grows, since a fireball is a 20-foot burst at every rank. Uses the free JB2A
  Fireball animations, copied into `Data/ASSETS/Animations/3rd_Level/Fireball/`.
- Screen shake with the fireball's blast, scaled to its rank. Users flagged
  `noShake` are left out — meant for a TV used as a play mat.
- Fireball sound in two parts, each timed to what is on screen: the launch
  from the caster as the bead forms at their hand, the bang from the centre
  of the burst the moment the bead strikes, together with the blast and the
  shake. Louder at higher ranks; lower ranks cut the bang's rumble short with
  a fade, since their blast is over sooner.

### Fixed

- Placed sounds — Wall of Stone collapsing, a Sliding Block destroyed — were
  heard five times further away than intended, which all but removed their
  fall-off with distance.

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

[unreleased]: https://github.com/Ramzeth/ramzeth-customs/compare/1.3.1...HEAD
[1.3.1]: https://github.com/Ramzeth/ramzeth-customs/compare/1.3.0...1.3.1
[1.3.0]: https://github.com/Ramzeth/ramzeth-customs/compare/1.2.0...1.3.0
[1.2.0]: https://github.com/Ramzeth/ramzeth-customs/compare/1.1.0...1.2.0
[1.1.0]: https://github.com/Ramzeth/ramzeth-customs/releases/tag/1.1.0
