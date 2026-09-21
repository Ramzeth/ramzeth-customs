# Ramzeth Customs

Personal Foundry VTT library: prefabs, sounds and custom PF2e content.

Requires Foundry v14 and [lib-wrapper](https://foundryvtt.com/packages/lib-wrapper).

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
