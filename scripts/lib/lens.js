// A field that bends the map inside a circle: the picture swirls back and
// forth, slow waves ripple out from the centre, its colour drains towards a
// cold grey, and the edge refracts like the rim of a glass dome, splitting
// colours and blurring a little. Built for fields where time runs wrong.
//
// It is a shader — a small program run by the graphics card for every pixel
// — set as a filter on the canvas group that draws the map, tiles and
// tokens. Each one reads the map from a nearby point instead of its own, and
// that displacement is the whole effect.
//
// A field is tied to a region: every client puts a lens on each region a
// registered test accepts, on the scene it is viewing, and takes it away
// when the region goes. Regions are scene documents, so every client knows
// of them without being told; the lens itself is drawn locally and saved
// nowhere. It fades in when its region appears and out when it is deleted.
//
// The filter is set on Foundry's own canvas group, which no public API covers:
// should a version of Foundry draw that group differently, the lens may stop
// showing, and nothing else is affected.

const FRAG = `
precision highp float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputSize;
uniform vec4 outputFrame;
uniform vec4 inputClamp;
uniform vec2 center;
uniform float radius;
uniform float time;
uniform float fade;
uniform float strength, speed;
uniform float desat; uniform vec3 tint;
uniform float waveAmp, waveCount, waveSpeed;
uniform float rimWidth, rimSharp, rimSoft, rimBlur, rimAmp, rimSplit, rimSpeed, rimGlow;

vec4 at(vec2 px) {
  vec2 uv = (px - outputFrame.xy) * inputSize.zw;
  return texture2D(uSampler, clamp(uv, inputClamp.xy, inputClamp.zw));
}
vec3 rgbAt(vec2 o, vec2 split) {
  return vec3(at(o + split).r, at(o).g, at(o - split).b);
}

void main() {
  vec2 px = vTextureCoord * inputSize.xy + outputFrame.xy;
  vec2 d = px - center;
  float r = length(d);
  if (r >= radius || fade <= 0.0) { gl_FragColor = texture2D(uSampler, vTextureCoord); return; }
  float q = r / radius;
  float k = 1.0 - q;
  vec2 dir = r > 0.0 ? d / r : vec2(0.0);

  // the swirl, rocking one way and back
  float a = fade * strength * sin(time * speed) * k * k;
  float s = sin(a), c = cos(a);
  vec2 p = vec2(c * d.x - s * d.y, s * d.x + c * d.y);

  // slow rings creeping out from the centre
  float wave = sin((q * waveCount - time * waveSpeed) * 6.2831853);
  p += dir * wave * waveAmp * radius * k * fade;

  // the rim: rising towards the edge and easing to nothing just short of it
  float e = clamp((q - (1.0 - rimWidth)) / rimWidth, 0.0, 1.0);
  float outer = rimSoft > 0.0 ? 1.0 - smoothstep(1.0 - rimSoft, 1.0, q) : 1.0;
  float band = pow(e, rimSharp) * outer * fade;
  float shimmer = 0.85 + 0.15 * sin(time * rimSpeed + atan(d.y, d.x) * 7.0);
  vec2 bend = -dir * rimAmp * radius * band * shimmer;
  vec2 split = dir * rimSplit * radius * band;
  vec2 o = center + p + bend;

  // blurred across the rim, as through frosted glass
  vec2 b = dir * rimBlur * radius * band;
  vec3 rgb = (rgbAt(o - 2.0 * b, split) + rgbAt(o - b, split) + rgbAt(o, split)
            + rgbAt(o + b, split) + rgbAt(o + 2.0 * b, split)) / 5.0;
  vec4 col = vec4(rgb, at(o).a);

  // colour drained to a cold grey, easing off towards the edge
  float grey = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  col.rgb = mix(col.rgb, grey * tint, desat * smoothstep(1.0, 0.6, q) * fade);
  col.rgb += rimGlow * band * tint * col.a;

  gl_FragColor = col;
}`;

// How the field looks unless a kind of field says otherwise; chosen at the
// table by turning each one live. Lengths are shares of the radius, so the
// look holds at any zoom. strength and speed: how far the swirl rocks, in
// radians, and how fast. desat and tint: how much colour is drained, and to
// what. waveAmp, waveCount, waveSpeed: the rings' depth, how many across the
// radius, and how fast they creep out. rim…: the band at the edge — its
// width, how sharply it rises, how softly it ends, its blur, how far it bends
// the picture, how far it splits the colours, how fast it shimmers, and how
// bright its edge glows.
const LOOK = {
  strength: 0.6, speed: 1,
  desat: 0.7, tint: [0.8, 0.9, 1.0],
  waveAmp: 0.1, waveCount: 4, waveSpeed: 0.15,
  rimWidth: 0.12, rimSharp: 3, rimSoft: 0.04, rimBlur: 0.01,
  rimAmp: 0.06, rimSplit: 0.02, rimSpeed: 0.6, rimGlow: 0.15
};

const FADE_MS = 1200;

// Kinds of field: which regions are one, and how each looks.
const kinds = [];

// Lenses on the scene being viewed, by region id.
const lenses = new Map();

let hooked = false;

export function registerLensField({ test, look = {} }) {
  kinds.push({ test, look });
  if (hooked) return;
  hooked = true;
  Hooks.on("canvasReady", rebuild);
  Hooks.on("canvasTearDown", clear);
  Hooks.on("createRegion", (region) => { if (region.parent === canvas.scene) add(region); });
  Hooks.on("updateRegion", (region) => { const lens = lenses.get(region.id); if (lens) lens.shape = circleOf(region); });
  Hooks.on("deleteRegion", (region) => { const lens = lenses.get(region.id); if (lens) lens.endedAt ??= performance.now(); });
}

function kindOf(region) {
  return kinds.find((k) => k.test(region));
}

function circleOf(region) {
  const shape = region.shapes?.[0];
  return shape?.radius ? { x: shape.x, y: shape.y, radius: shape.radius } : null;
}

function rebuild() {
  clear();
  for (const region of canvas.scene?.regions ?? []) add(region, { quick: true });
}

// quick: on loading a scene the field is already there, and is shown at once.
function add(region, { quick = false } = {}) {
  const kind = kindOf(region);
  const shape = kind && circleOf(region);
  if (!shape || lenses.has(region.id)) return;
  const filter = new PIXI.Filter(undefined, FRAG, { ...LOOK, ...kind.look, center: [0, 0], radius: 1, time: 0, fade: 0 });
  const group = canvas.primary;
  group.filters = [...(group.filters ?? []), filter];
  lenses.set(region.id, { filter, group, shape, bornAt: quick ? -Infinity : performance.now(), endedAt: null });
  if (lenses.size === 1) canvas.app.ticker.add(frame);
}

function drop(id) {
  const lens = lenses.get(id);
  if (!lens) return;
  lens.group.filters = (lens.group.filters ?? []).filter((f) => f !== lens.filter);
  lenses.delete(id);
  if (!lenses.size) canvas.app.ticker.remove(frame);
}

function clear() {
  for (const id of [...lenses.keys()]) drop(id);
}

// Every frame: where each field is on screen, how large, and how far faded.
function frame() {
  const now = performance.now();
  const scale = canvas.stage.scale.x;
  for (const [id, lens] of lenses) {
    const u = lens.filter.uniforms;
    const p = canvas.stage.worldTransform.apply({ x: lens.shape.x, y: lens.shape.y });
    const fadeIn = Math.min((now - lens.bornAt) / FADE_MS, 1);
    const fadeOut = lens.endedAt === null ? 1 : 1 - (now - lens.endedAt) / FADE_MS;
    u.center = [p.x, p.y];
    u.radius = lens.shape.radius * scale;
    u.time = now / 1000;
    u.fade = Math.max(Math.min(fadeIn, fadeOut), 0);
    if (fadeOut <= 0) drop(id);
  }
}
