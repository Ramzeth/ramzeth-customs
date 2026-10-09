# Ramzeth Customs

Personal Foundry VTT library: prefabs, sounds and custom PF2e content.

Requires Foundry v14, [lib-wrapper](https://foundryvtt.com/packages/lib-wrapper)
and [Sequencer](https://foundryvtt.com/packages/sequencer), which plays the
spells' animations for everyone. Sounds, the screen dazzle and fading lights
go over the module's own socket, so after installing or updating to a version
that first uses it, relaunch the world once.
[Wall Height](https://foundryvtt.com/packages/wall-height) is recommended:
walls have no height in core v14, and without it a levitated Sliding Block
still stops everything beneath it. With
[Dice So Nice](https://foundryvtt.com/packages/dice-so-nice), a fireball waits
for its damage dice to land before it goes off. With
[PF2e Auto Action Tracker](https://foundryvtt.com/packages/pf2e-auto-action-tracker),
sustaining Ember Doppelgänger brings its card back for the next blast.

**Media are not included.** Every image and sound the module uses is expected
under `Data/ASSETS/` on the server, which is backed up separately. The module
holds only their paths: code paths are collected in `scripts/assets.js`,
compendium content refers to `ASSETS/` in its own data. A world without that
folder gets the code and the compendiums, with missing pictures and silence.

## Install

Paste the manifest URL into Foundry's *Install Module* dialog:

```
https://github.com/Ramzeth/ramzeth-customs/releases/latest/download/module.json
```

For a test instance, install from the dev channel instead. It is rebuilt on
every push to `main`, and *Update Module* will keep pulling from it:

```
https://github.com/Ramzeth/ramzeth-customs/releases/download/dev/module.json
```

Dev builds are versioned `<VERSION>.<build>` — `1.1.0.47` is build 47 of the
upcoming 1.1.0. The numbering is deliberately all digits: Foundry compares
versions segment by segment as numbers, and a commit hash would not order.

A world installed from the dev channel stays on it, because `1.1.0.47` reads
as newer than the eventual `1.1.0`. To move it back to stable, uninstall and
reinstall from the `latest` manifest.

## Contents

| Compendium | Type | What's in it |
|---|---|---|
| Ramzeth Prefabs | JournalEntry | Mass Edit presets |
| Ramzeth Sounds | Playlist | Ambience and music |
| Ramzeth Spells | Item (pf2e) | Forked system spells with added automation |

## Code layout

```
scripts/main.js                 wiring only
scripts/const.js                the module id
scripts/lib/                    reusable helpers, spell-agnostic
scripts/spells/<slug>.js        one file per automated spell
```

`scripts/spells/wall-of-stone.js` narrows the placed template to a thin stone
line, and adds GM buttons to the cast's chat card that turn the placed
sections into real walls — or tear them down again.

`scripts/spells/sliding-blocks.js` turns each placed square into a block with
one-way walls that follow it when it is dragged or levitated.

`scripts/spells/fireball.js` animates the spell when its damage is rolled from
the chat card, at the template placed from that card, growing with every rank
from 3 to 10.

`scripts/spells/stagnate-time.js` turns the placed template into a hidden field
the map visibly bends inside (drawn by `scripts/lib/region-shader.js`), ties it to the caster's
effect, and asks for a Will save from each creature starting its turn in it.

`scripts/spells/ember-doppelganger.js` turns the placed square into the Ember
Hussar — a token in the caster's likeness drawn as ash and embers in a haze of
smoke (by `scripts/lib/token-shader.js`) — ties it to the caster's effect, and
has it hurl a fireball, sized to the 10-foot burst, when the damage is
rolled. Both spells' blasts are set off by `scripts/lib/damage-burst.js`.

Actors that spells create live in the "Ramzeth Customs" folder and are
deleted with their last token (`scripts/lib/spell-actors.js`).

## Working on it

Compendiums are stored as YAML under `src/packs/` and compiled into LevelDB
when a release is built. The `packs/` directory is generated and not committed.

After editing compendium content inside Foundry, shut Foundry down (LevelDB
holds a lock) and extract the changes back into the repository:

```sh
npm install -g @foundryvtt/foundryvtt-cli@3.0.4

for pack in ramzeth-prefabs ramzeth-sounds ramzeth-spells; do
  fvtt package unpack -n "$pack" --in packs --out "src/packs/$pack" --yaml --omitVolatile
done
```

`--omitVolatile` leaves a file alone when only timestamps and version stamps
changed, which keeps diffs readable.

Note the CLI's path asymmetry: the LevelDB side is addressed as a parent
directory with the compendium name appended, the YAML side as an exact path.
`pack` swaps them — `--in src/packs/<name> --out packs`.

## Releasing

Bump `VERSION`, commit, push to `main`. The workflow builds the packs, fills
the manifest placeholders and publishes the release. A push that leaves
`VERSION` alone does nothing.
