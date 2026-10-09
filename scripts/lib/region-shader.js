// A shader drawn over the map inside a circular region: what a spell's field
// looks like while its region stands.
//
// A shader is a small program the graphics card runs for every pixel. Here it
// is set as a filter on the canvas group that draws the map, tiles and
// tokens, so it can do anything with the picture there — bend it, recolour
// it — limited to the circle by its own code. The spell brings the shader
// and its settings; this file only puts it on the map and keeps it in step.
//
// Each client does this itself for every region a registered test accepts,
// on the scene it is viewing, and takes it away when the region goes.
// Regions are scene documents, so every client knows of them without being
// told; the shader itself is drawn locally and saved nowhere. It fades in
// when its region appears and out when it is deleted; on loading a scene, a
// region already there shows at once.
//
// The shader is given, besides its own settings, every frame:
//   vec2  center  the circle's centre, in screen pixels
//   float radius  its radius, in screen pixels
//   float time    seconds, for animation
//   float fade    0 to 1, how far it has faded in or out
// in the coordinates PIXI filters use: vTextureCoord * inputSize.xy +
// outputFrame.xy is a pixel's position on screen.
//
// The filter sits on Foundry's own canvas group, which no public API covers:
// should a version of Foundry draw that group differently, the shader may
// stop showing, and nothing else is affected.

const FADE_MS = 1200;

// Kinds of shaded region: which regions are one, and their shader.
const kinds = [];

// Shaders on the scene being viewed, by region id.
const shaded = new Map();

let hooked = false;

// test(region): whether a region is shaded. fragment: the shader's source.
// uniforms: its settings.
export function registerRegionShader({ test, fragment, uniforms = {} }) {
  kinds.push({ test, fragment, uniforms });
  if (hooked) return;
  hooked = true;
  Hooks.on("canvasReady", rebuild);
  Hooks.on("canvasTearDown", clear);
  Hooks.on("createRegion", (region) => { if (region.parent === canvas.scene) add(region); });
  Hooks.on("updateRegion", (region) => { const s = shaded.get(region.id); if (s) s.shape = circleOf(region) ?? s.shape; });
  Hooks.on("deleteRegion", (region) => { const s = shaded.get(region.id); if (s) s.endedAt ??= performance.now(); });
}

function circleOf(region) {
  const shape = region.shapes?.[0];
  return shape?.radius ? { x: shape.x, y: shape.y, radius: shape.radius } : null;
}

function rebuild() {
  clear();
  for (const region of canvas.scene?.regions ?? []) add(region, { quick: true });
}

function add(region, { quick = false } = {}) {
  const kind = kinds.find((k) => k.test(region));
  const shape = kind && circleOf(region);
  if (!shape || shaded.has(region.id)) return;
  const filter = new PIXI.Filter(undefined, kind.fragment,
    { ...kind.uniforms, center: [0, 0], radius: 1, time: 0, fade: 0 });
  const group = canvas.primary;
  group.filters = [...(group.filters ?? []), filter];
  shaded.set(region.id, { filter, group, shape, bornAt: quick ? -Infinity : performance.now(), endedAt: null });
  if (shaded.size === 1) canvas.app.ticker.add(frame);
}

function drop(id) {
  const s = shaded.get(id);
  if (!s) return;
  s.group.filters = (s.group.filters ?? []).filter((f) => f !== s.filter);
  shaded.delete(id);
  if (!shaded.size) canvas.app.ticker.remove(frame);
}

function clear() {
  for (const id of [...shaded.keys()]) drop(id);
}

function frame() {
  const now = performance.now();
  const scale = canvas.stage.scale.x;
  for (const [id, s] of shaded) {
    const u = s.filter.uniforms;
    const p = canvas.stage.worldTransform.apply({ x: s.shape.x, y: s.shape.y });
    const fadeIn = Math.min((now - s.bornAt) / FADE_MS, 1);
    const fadeOut = s.endedAt === null ? 1 : 1 - (now - s.endedAt) / FADE_MS;
    u.center = [p.x, p.y];
    u.radius = s.shape.radius * scale;
    u.time = now / 1000;
    u.fade = Math.max(Math.min(fadeIn, fadeOut), 0);
    if (fadeOut <= 0) drop(id);
  }
}
