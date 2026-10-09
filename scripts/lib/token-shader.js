// A shader drawn on a token's own picture: what a spell makes of a token's
// look while it stands.
//
// The shader is set as a filter on the token's sprite, so it works from the
// picture the token already has — its form stays, only what it is drawn as
// changes — and moves with it. The spell brings the shader and its settings;
// this file only puts it on the tokens and keeps it in step.
//
// Each client does this itself for every token a registered test accepts, as
// the token is drawn, and takes it away when the token goes; nothing is
// saved, and every client sees the same because the test reads the token's
// own data.
//
// The shader is given, besides its own settings, every frame:
//   float time       seconds, for animation
//   vec2  center     the token's centre, in screen pixels
//   vec2  tokenSize  the token's size on screen, in pixels
// in the coordinates PIXI filters use: vTextureCoord * inputSize.xy +
// outputFrame.xy is a pixel's position on screen, so (that - center) /
// tokenSize.x measures it in token widths from the centre, whatever the zoom
// and wherever the token is. The filter's frame is the token's, enlarged by
// padding — a share of the token's width added on every side — for a shader
// that draws beyond the token's edge, a haze about it say.
//
// The filter sits on Foundry's own token sprite, which no public API covers:
// should a version of Foundry draw tokens differently, the shader may stop
// showing, and the token is still there as it was.

const kinds = [];
const shaded = new Map();
let hooked = false;

// test(tokenDocument): whether a token is shaded. fragment: the shader's
// source. uniforms: its settings. padding: how far it may draw beyond the
// token, as a share of the token's width.
export function registerTokenShader({ test, fragment, uniforms = {}, padding = 0 }) {
  kinds.push({ test, fragment, uniforms, padding });
  if (hooked) return;
  hooked = true;
  Hooks.on("drawToken", dress);
  Hooks.on("refreshToken", dress);
  Hooks.on("destroyToken", (token) => strip(token.id));
  Hooks.on("canvasTearDown", () => { for (const id of [...shaded.keys()]) strip(id); });
}

function dress(token) {
  const kind = kinds.find((k) => k.test(token.document));
  const mesh = token.mesh;
  if (!kind || !mesh) return;
  let s = shaded.get(token.id);
  if (!s) {
    const filter = new PIXI.Filter(undefined, kind.fragment,
      { ...kind.uniforms, time: 0, center: [0, 0], tokenSize: [1, 1] });
    s = { filter, token, mesh, padding: kind.padding };
    shaded.set(token.id, s);
    if (shaded.size === 1) canvas.app.ticker.add(frame);
  }
  // A redrawn token may come with a new sprite, which needs the filter again.
  s.token = token;
  s.mesh = mesh;
  if (!(mesh.filters ?? []).includes(s.filter)) mesh.filters = [...(mesh.filters ?? []), s.filter];
}

function strip(id) {
  const s = shaded.get(id);
  if (!s) return;
  if (s.mesh?.filters) s.mesh.filters = s.mesh.filters.filter((f) => f !== s.filter);
  shaded.delete(id);
  if (!shaded.size) canvas.app.ticker.remove(frame);
}

function frame() {
  const time = performance.now() / 1000;
  const scale = canvas.stage.scale.x;
  for (const s of shaded.values()) {
    const width = s.token.w * scale;
    const height = s.token.h * scale;
    // The sprite sits at the token's centre, and moves with it as it walks.
    const c = canvas.stage.worldTransform.apply(s.mesh.position);
    s.filter.uniforms.time = time;
    s.filter.uniforms.center = [c.x, c.y];
    s.filter.uniforms.tokenSize = [width, height];
    s.filter.padding = Math.ceil(width * s.padding);
  }
}
