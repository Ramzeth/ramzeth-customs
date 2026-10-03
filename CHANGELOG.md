# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/Ramzeth/ramzeth-customs/compare/1.2.0...HEAD
[1.2.0]: https://github.com/Ramzeth/ramzeth-customs/compare/1.1.0...1.2.0
[1.1.0]: https://github.com/Ramzeth/ramzeth-customs/releases/tag/1.1.0
