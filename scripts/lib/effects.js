// One-shot effects heard and seen by everyone at the table.
//
// The spells resolve their own events — a section collapsing, a block being
// destroyed — on the active GM's client, so an effect has to reach the other
// clients rather than play locally.
//
// Sequencer does the playing: it broadcasts, and it places the effect on the
// map so it comes from where things happened. It is a required dependency of
// the module, so there is no fallback — a flat, unplaced sound was the only
// alternative, and not one worth keeping.
//
// This is for events only this module knows about. Anything PF2e itself
// raises — a spell being cast, a strike landing — belongs in an Automated
// Animations autorec entry instead, with no code at all.

export function playSoundAt(src, at, { volume = 0.8, radiusSquares = 12 } = {}) {
  if (!src) return;
  new Sequence()
    .sound()
      .file(src)
      .volume(volume)
      .atLocation(at)
      .radius(canvas.scene.grid.distance * radiusSquares)
    .play();
}
