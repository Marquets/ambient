// The pond is adapted from "Caustic Pool" on 21st.dev: shallow water lit from above, its waves
// stirred here by the notes and the rain, its water picked by the mode and dimmed by the light.
//
// A wave equation runs on a float texture (ping-ponged each step), and the render pass reads that
// height field as a lens: the caustic is the area compression of the refracted-ray map, which is
// the determinant of its Jacobian, so bright veins land exactly where the surface focuses light.
// Everything else (the sand, the absorption with depth, two suns, the Fresnel sky) is lit off the
// same field. Needs WebGL2 with float or half-float render targets.

type Vec3 = [number, number, number];

type Params = {
  propagation: number;
  damping: number;
  edgeWidth: number;
  edgeDamp: number;
  clampH: number;
  causticA: number;
  detFloor: number;
  clamp1: number;
  contrast: number;
  clamp2: number;
  floorBase: number;
  causticGain: number;
  veinThresh: number;
  veinGain: number;
  veinColor: Vec3;
  baseDepth: number;
  depthScale: number;
  depthNoise: number;
  depthNoiseAmp: number;
  absorb: Vec3;
  absorbScale: number;
  deepColor: Vec3;
  deepGain: number;
  parallax: number;
  nScale: number;
  sun1: Vec3;
  sun2: Vec3;
  spec1: number;
  spec2: number;
  spec2Gain: number;
  glintGain: number;
  glintColor: Vec3;
  fresnelPow: number;
  fresnelGain: number;
  skyColor: Vec3;
  sandHi: Vec3;
  sandLo: Vec3;
  rippleScale: number;
  warpScale: number;
  warp: number;
  bandFreq: number;
  bandSkew: number;
  bandGain: number;
  grainScale: number;
  grainAmp: number;
  octaves: number;
  lacunarity: number;
  gain: number;
  exposure: number;
  grain: number;
  gamma: number;
  vigOuter: number;
  vigInner: number;
  vigDark: number;
  vigBright: number;
};

const DEFAULTS: Params = {
  propagation: 0.245,
  damping: 0.996,
  edgeWidth: 0.045,
  edgeDamp: 0.9,
  clampH: 1.6,
  causticA: 9,
  detFloor: 0.06,
  clamp1: 6,
  contrast: 1.22,
  clamp2: 8,
  floorBase: 0.34,
  causticGain: 0.3,
  veinThresh: 1,
  veinGain: 0.1,
  veinColor: [140, 204, 217],
  baseDepth: 1.05,
  depthScale: 1.4,
  depthNoise: 2,
  depthNoiseAmp: 0.25,
  absorb: [107, 33, 20],
  absorbScale: 1.7,
  deepColor: [5, 26, 37],
  deepGain: 0.3,
  parallax: 2.4,
  nScale: 8.5,
  sun1: [0.3, 0.45, 0.82],
  sun2: [-0.5, 0.15, 0.78],
  spec1: 150,
  spec2: 70,
  spec2Gain: 0.35,
  glintGain: 0.85,
  glintColor: [255, 247, 224],
  fresnelPow: 4,
  fresnelGain: 0.22,
  skyColor: [41, 77, 102],
  sandHi: [219, 179, 120],
  sandLo: [158, 117, 77],
  rippleScale: 6.5,
  warpScale: 3,
  warp: 0.6,
  bandFreq: 9,
  bandSkew: 4,
  bandGain: 0.06,
  grainScale: 240,
  grainAmp: 0.045,
  octaves: 4,
  lacunarity: 2.03,
  gain: 0.5,
  exposure: 1.55,
  grain: 0.022,
  gamma: 0.4545,
  vigOuter: 1.28,
  vigInner: 0.32,
  vigDark: 0.6,
  vigBright: 1.05,
};

// Each mode's water: the deep sea for Dorian, a sandy tide pool for Lydian, ink for Aeolian's
// night, golden hour for Mixolydian's amber, a stranger pool for the pentatonic
const WATERS: Record<string, Partial<Params>> = {
  Lydian: {},
  Aeolian: {
    causticA: 16, contrast: 1.8, clamp2: 10, veinGain: 0.22, veinColor: [235, 240, 255],
    floorBase: 0.1, causticGain: 0.42, baseDepth: 1.4, depthScale: 2.2,
    absorb: [120, 120, 120], absorbScale: 2.6, deepColor: [3, 4, 6], deepGain: 0.35,
    sandHi: [120, 122, 128], sandLo: [24, 26, 30], grainAmp: 0.02,
    glintColor: [255, 255, 255], glintGain: 1.2, skyColor: [40, 44, 52],
    fresnelGain: 0.26, exposure: 1.9, grain: 0.05,
  },
  Dorian: {
    causticA: 12, contrast: 1.5, veinGain: 0.16, veinColor: [120, 190, 235],
    floorBase: 0.22, causticGain: 0.26, baseDepth: 1.6, depthScale: 1.9,
    absorb: [70, 30, 14], absorbScale: 2.4, deepColor: [4, 22, 40], deepGain: 0.55,
    sandHi: [150, 160, 150], sandLo: [70, 90, 95], skyColor: [30, 66, 104],
    fresnelGain: 0.3, exposure: 1.35, glintColor: [220, 240, 255], glintGain: 0.7,
  },
  Mixolydian: {
    causticA: 8, contrast: 1.15, veinGain: 0.12, veinColor: [255, 214, 150],
    floorBase: 0.42, causticGain: 0.34, baseDepth: 0.9, depthScale: 1.1,
    absorb: [120, 55, 20], absorbScale: 1.4, deepColor: [24, 20, 12], deepGain: 0.28,
    sandHi: [240, 196, 130], sandLo: [176, 118, 66], sun1: [0.55, 0.18, 0.72],
    glintColor: [255, 236, 190], glintGain: 1.1, skyColor: [90, 70, 45],
    fresnelGain: 0.2, exposure: 1.75,
  },
  Pentatonic: {
    causticA: 11, contrast: 1.4, veinGain: 0.2, veinColor: [180, 255, 120],
    floorBase: 0.3, causticGain: 0.32, baseDepth: 1.2, depthScale: 1.6,
    absorb: [90, 20, 110], absorbScale: 2, deepColor: [30, 6, 44], deepGain: 0.5,
    sandHi: [120, 210, 150], sandLo: [40, 80, 120], glintColor: [200, 255, 220],
    glintGain: 0.9, skyColor: [70, 40, 110], fresnelGain: 0.28, exposure: 1.6,
  },
};

// The step only runs at the rate its numbers were tuned for; a slow frame takes several
const SIM_RATE = 60;
const MAX_SUB = 4;
const MAX_DROPS = 12;
// What a note does to the water, at full strength; its echoes land weaker
const NOTE = { strength: 0.22, radius: 0.05 };
// A few drops always falling somewhere, so the water never lies dead still; the rain adds more
const AMBIENT = { count: 4, strength: 0.018 };
const RAIN = { perSecond: 14, strength: 0.05 };

/** What the pond reads each frame: the drops the notes let fall since the last one, x and y 0–1
 * from the bottom left, with their strength 0–1; how hard it rains; the light; and the mode */
export type PondFrame = { drops: [number, number, number][]; rain: number; light: number; mode: string; still: boolean };

type Kind = "f" | "i" | "c" | "v";
type Slot = [keyof Params, Kind];

const UPDATE_UNIFORMS: Slot[] = [
  ["propagation", "f"], ["damping", "f"], ["edgeWidth", "f"], ["edgeDamp", "f"], ["clampH", "f"],
];

// `c` is a 0–255 colour, `v` a raw vec3
const RENDER_UNIFORMS: Slot[] = [
  ["causticA", "f"], ["detFloor", "f"], ["clamp1", "f"], ["contrast", "f"], ["clamp2", "f"],
  ["floorBase", "f"], ["causticGain", "f"], ["veinThresh", "f"], ["veinGain", "f"], ["veinColor", "c"],
  ["baseDepth", "f"], ["depthScale", "f"], ["depthNoise", "f"], ["depthNoiseAmp", "f"],
  ["absorb", "c"], ["absorbScale", "f"], ["deepColor", "c"], ["deepGain", "f"],
  ["parallax", "f"], ["nScale", "f"],
  ["sun1", "v"], ["sun2", "v"], ["spec1", "f"], ["spec2", "f"], ["spec2Gain", "f"],
  ["glintGain", "f"], ["glintColor", "c"],
  ["fresnelPow", "f"], ["fresnelGain", "f"], ["skyColor", "c"],
  ["sandHi", "c"], ["sandLo", "c"], ["rippleScale", "f"], ["warpScale", "f"], ["warp", "f"],
  ["bandFreq", "f"], ["bandSkew", "f"], ["bandGain", "f"], ["grainScale", "f"], ["grainAmp", "f"],
  ["octaves", "i"], ["lacunarity", "f"], ["gain", "f"],
  ["exposure", "f"], ["grain", "f"], ["gamma", "f"],
  ["vigOuter", "f"], ["vigInner", "f"], ["vigDark", "f"], ["vigBright", "f"],
];

const uName = (k: string) => "u" + k[0].toUpperCase() + k.slice(1);
const glslType = (kind: Kind) => (kind === "i" ? "int" : kind === "f" ? "float" : "vec3");
const declare = (slots: Slot[]) => slots.map(([k, kind]) => `uniform ${glslType(kind)} ${uName(k)};`).join("\n");

const VERT = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// One step of the wave equation, plus whatever drops were queued this frame
const UPDATE = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uAspect;
uniform int uDropCount;
uniform vec4 uDrops[${MAX_DROPS}];
${declare(UPDATE_UNIFORMS)}
in vec2 vUv;
out vec4 o;
void main(){
  vec2 uv = vUv;
  float c = texture(uState, uv).r, p = texture(uState, uv).g;
  float l = texture(uState, uv - vec2(uTexel.x, 0.0)).r;
  float r = texture(uState, uv + vec2(uTexel.x, 0.0)).r;
  float u = texture(uState, uv + vec2(0.0, uTexel.y)).r;
  float d = texture(uState, uv - vec2(0.0, uTexel.y)).r;
  float nv = (2.0 * c - p) + (l + r + u + d - 4.0 * c) * uPropagation;
  nv *= uDamping;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uDropCount) break;
    vec2 dp = uv - uDrops[i].xy;
    dp.x *= uAspect;
    float rr = uDrops[i].w;
    nv += uDrops[i].z * exp(-dot(dp, dp) / (rr * rr));
  }
  vec2 e = min(uv, 1.0 - uv);
  nv *= mix(uEdgeDamp, 1.0, smoothstep(0.0, uEdgeWidth, min(e.x, e.y)));
  o = vec4(clamp(nv, -uClampH, uClampH), c, 0.0, 1.0);
}`;

const RENDER = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform float uTime;
uniform float uAspect;
${declare(RENDER_UNIFORMS)}
in vec2 vUv;
out vec4 frag;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= uOctaves) break; s += a * vnoise(p); p *= uLacunarity; a *= uGain; }
  return s;
}
vec3 sand(vec2 uv){
  vec2 p = uv * vec2(uAspect, 1.0);
  float rip = fbm(p * uRippleScale + fbm(p * uWarpScale) * uWarp);
  float band = 0.5 + 0.5 * sin(rip * uBandFreq + p.x * uBandSkew);
  vec3 b = mix(uSandHi, uSandLo, rip);
  b = mix(b, b * (1.0 + uBandGain), band);
  return b + (vnoise(p * uGrainScale) - 0.5) * uGrainAmp;
}
void main(){
  vec2 uv = vUv, t = uTexel;
  float hc = texture(uState, uv).r;
  float hl = texture(uState, uv - vec2(t.x, 0.0)).r, hr = texture(uState, uv + vec2(t.x, 0.0)).r;
  float hu = texture(uState, uv + vec2(0.0, t.y)).r, hd = texture(uState, uv - vec2(0.0, t.y)).r;
  float hpp = texture(uState, uv + t).r, hmm = texture(uState, uv - t).r;
  float hpm = texture(uState, uv + vec2(t.x, -t.y)).r, hmp = texture(uState, uv + vec2(-t.x, t.y)).r;
  float hx = (hr - hl) * 0.5, hy = (hu - hd) * 0.5;
  float hxx = hr - 2.0 * hc + hl, hyy = hu - 2.0 * hc + hd, hxy = (hpp - hpm - hmp + hmm) * 0.25;

  // The caustic is the area compression of the refracted-ray map: bright where the surface
  // focuses light, which is the determinant of its Jacobian
  float jxx = 1.0 - uCausticA * hxx, jyy = 1.0 - uCausticA * hyy, jxy = -uCausticA * hxy;
  float det = jxx * jyy - jxy * jxy;
  float ca = clamp(1.0 / max(abs(det), uDetFloor), 0.0, uClamp1);
  ca = clamp(pow(ca, uContrast), 0.0, uClamp2);

  vec2 land = uv + vec2(hx, hy) * uParallax;
  vec3 col = sand(land) * (uFloorBase + ca * uCausticGain);
  col += uVeinColor * max(ca - uVeinThresh, 0.0) * uVeinGain;

  float depth = clamp(uBaseDepth - hc * uDepthScale + fbm(land * uDepthNoise) * uDepthNoiseAmp, 0.2, 3.0);
  col *= exp(-uAbsorb * depth * uAbsorbScale);
  col += uDeepColor * depth * uDeepGain;

  vec3 N = normalize(vec3(-hx * uNScale, -hy * uNScale, 1.0)), V = vec3(0.0, 0.0, 1.0);
  vec3 s1 = normalize(uSun1 + vec3(0.0, 0.0, 1e-4));
  vec3 s2 = normalize(uSun2 + vec3(0.0, 0.0, 1e-4));
  float sp = pow(max(dot(N, normalize(s1 + V)), 0.0), uSpec1)
           + pow(max(dot(N, normalize(s2 + V)), 0.0), uSpec2) * uSpec2Gain;
  col += sp * uGlintColor * uGlintGain;
  col = mix(col, uSkyColor, pow(1.0 - N.z, uFresnelPow) * uFresnelGain);
  col *= mix(uVigDark, uVigBright, smoothstep(uVigOuter, uVigInner, length((uv - 0.5) * vec2(uAspect, 1.0))));
  col = vec3(1.0) - exp(-col * uExposure);
  col += (hash(uv * uResolution + fract(uTime)) - 0.5) * uGrain;
  frag = vec4(pow(max(col, vec3(0.0)), vec3(uGamma)), 1.0);
}`;

/** The mode's water, dimmed toward night: at full dark it keeps a fifth of its light */
export function pondParams(mode: string, light: number): Params {
  const p = { ...DEFAULTS, ...(WATERS[mode] ?? {}) };
  const day = Math.min(1, Math.max(0, light / 0.45));
  return { ...p, exposure: p.exposure * (0.2 + 0.8 * day * day * (3 - 2 * day)) };
}

/** Runs the pond on the canvas from `read()` on every animation frame until the returned stop is
 * called; false if this browser can't, so the caller can fall back */
export function startPond(canvas: HTMLCanvasElement, read: () => PondFrame): (() => void) | false {
  // The simulation's grid: 512 keeps the caustics sharp across a wide screen, and costs four times
  // what 256 does, which a phone's narrower one doesn't need
  const GRID = canvas.clientWidth > 900 ? 512 : 256;
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, powerPreference: "high-performance" });
  if (!gl) return false;
  // Rendering into a float texture is the whole technique
  if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float")) return false;
  gl.getExtension("OES_texture_half_float_linear");

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("pond:", gl.getShaderInfoLog(s));
    return s;
  };
  const link = (fs: string) => {
    const p = gl.createProgram()!;
    const v = compile(gl.VERTEX_SHADER, VERT);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error("pond:", gl.getProgramInfoLog(p));
    return p;
  };
  const stepProgram = link(UPDATE);
  const drawProgram = link(RENDER);

  const findUniforms = (p: WebGLProgram, slots: Slot[], fixed: string[]) => ({
    tuned: slots.map(([k, kind]) => [gl.getUniformLocation(p, uName(k)), k, kind] as const),
    named: Object.fromEntries(fixed.map((n) => [n, gl.getUniformLocation(p, n)])),
  });
  const stepU = findUniforms(stepProgram, UPDATE_UNIFORMS, ["uState", "uTexel", "uAspect", "uDropCount", "uDrops"]);
  const drawU = findUniforms(drawProgram, RENDER_UNIFORMS, ["uState", "uTexel", "uResolution", "uTime", "uAspect"]);
  const upload = (u: typeof stepU, p: Params) => {
    for (const [loc, key, kind] of u.tuned) {
      const value = p[key];
      if (kind === "c") gl.uniform3f(loc, ...((value as Vec3).map((c) => c / 255) as Vec3));
      else if (kind === "v") gl.uniform3f(loc, ...(value as Vec3));
      else if (kind === "i") gl.uniform1i(loc, value as number);
      else gl.uniform1f(loc, value as number);
    }
  };

  // Two float targets, each step reading one and writing the other
  const makeTarget = () => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, GRID, GRID, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, GRID, GRID);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo };
  };
  const targets = [makeTarget(), makeTarget()];
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let current = 0;
  const vao = gl.createVertexArray();

  const dropData = new Float32Array(MAX_DROPS * 4);
  let queued: number[][] = [];
  const drop = (x: number, y: number, strength: number, radius: number) => {
    if (queued.length < MAX_DROPS) queued.push([x, y, strength, radius]);
  };

  // Ambient drops wander slowly round fixed spots, each falling every second or so
  const sources = Array.from({ length: AMBIENT.count }, () => ({
    px: 0.2 + 0.6 * Math.random(),
    py: 0.2 + 0.6 * Math.random(),
    phase: Math.random() * 6.28,
    next: Math.random() * 1.2,
    period: 0.7 + Math.random() * 1.1,
  }));
  const t0 = performance.now();
  const clock = () => (performance.now() - t0) / 1000;
  let rainDue = 0;

  const stepOnce = (step: number, params: Params, rain: number) => {
    const t = clock();
    for (const s of sources) {
      s.next -= step;
      if (s.next > 0) continue;
      s.next = s.period * (0.7 + Math.random() * 0.6);
      drop(s.px + 0.12 * Math.sin(t * 0.4 + s.phase), s.py + 0.12 * Math.cos(t * 0.35 + s.phase), AMBIENT.strength, 0.03 + Math.random() * 0.02);
    }
    for (rainDue += rain * RAIN.perSecond * step; rainDue >= 1; rainDue--) drop(Math.random(), Math.random(), RAIN.strength * (0.5 + Math.random()), 0.015 + Math.random() * 0.01);

    const n = Math.min(queued.length, MAX_DROPS);
    for (let i = 0; i < n; i++) dropData.set(queued[i], i * 4);
    queued = [];
    const src = targets[current];
    const dst = targets[current ^ 1];
    gl.useProgram(stepProgram);
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, GRID, GRID);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(stepU.named.uState, 0);
    gl.uniform2f(stepU.named.uTexel, 1 / GRID, 1 / GRID);
    gl.uniform1f(stepU.named.uAspect, canvas.clientWidth / Math.max(canvas.clientHeight, 1));
    gl.uniform1i(stepU.named.uDropCount, n);
    gl.uniform4fv(stepU.named.uDrops, dropData);
    upload(stepU, params);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    current ^= 1;
  };

  const paint = (params: Params) => {
    // Capped at 2x: the render runs per pixel, and a 3x phone screen would crawl
    const dpr = Math.min(devicePixelRatio, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) [canvas.width, canvas.height] = [w, h];
    gl.useProgram(drawProgram);
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[current].tex);
    gl.uniform1i(drawU.named.uState, 0);
    gl.uniform2f(drawU.named.uTexel, 1 / GRID, 1 / GRID);
    gl.uniform2f(drawU.named.uResolution, w, h);
    gl.uniform1f(drawU.named.uTime, clock());
    gl.uniform1f(drawU.named.uAspect, canvas.clientWidth / Math.max(canvas.clientHeight, 1));
    upload(drawU, params);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Flat water is one flat colour, so a few drops go in and run out before the first paint
  const first = read();
  const startParams = pondParams(first.mode, first.light);
  for (let i = 0; i < 6; i++) {
    drop(0.2 + 0.6 * Math.random(), 0.2 + 0.6 * Math.random(), 0.05 + 0.07 * Math.random(), 0.035 + 0.03 * Math.random());
    if (i % 3 === 2) stepOnce(1 / SIM_RATE, startParams, 0);
  }
  for (let i = 0; i < 26; i++) stepOnce(1 / SIM_RATE, startParams, 0);

  let raf = 0;
  let last = performance.now();
  let accumulated = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const f = read();
    const params = pondParams(f.mode, f.light);
    for (const [x, y, strength] of f.drops) drop(x, y, NOTE.strength * strength, NOTE.radius);
    // Reduced motion holds the water still: one paint of it as it lies
    if (f.still) return paint(params);
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    const step = 1 / SIM_RATE;
    accumulated += dt;
    let taken = 0;
    for (; accumulated >= step && taken < MAX_SUB; taken++, accumulated -= step) stepOnce(step, params, f.rain);
    if (taken === 0) {
      stepOnce(step, params, f.rain);
      accumulated = 0;
    }
    paint(params);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    for (const t of targets) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    }
    gl.deleteVertexArray(vao);
    gl.deleteProgram(stepProgram);
    gl.deleteProgram(drawProgram);
  };
}
