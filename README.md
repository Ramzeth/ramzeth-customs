# Ramzeth Customs

Personal Foundry VTT library: prefabs, sounds and custom PF2e content.

Requires Foundry v14 and [lib-wrapper](https://foundryvtt.com/packages/lib-wrapper).

## Install

Paste the manifest URL into Foundry's *Install Module* dialog:

```
https://github.com/<owner>/ramzeth-customs/releases/latest/download/module.json
```

## Contents

| Compendium | Type | What's in it |
|---|---|---|
| Ramzeth Prefabs | JournalEntry | Mass Edit presets |
| Ramzeth Sounds | Playlist | Ambience and music |
| Ramzeth Spells | Item (pf2e) | Forked system spells with added automation |

`scripts/main.js` adjusts the Wall of Stone template so the placed line is a
thin stone-coloured wall rather than a five-foot band.

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
