// The clouds are adapted from amanshakya307's "Cloudscape" on 21st.dev, with the sky's colours,
// density, size and softness opened up to the sound, and a glow for every note played

export const MAX_STARS = 32;

type RGB = [number, number, number];
// The sky behind, the body of the clouds and their brightest tops
type Palette = [RGB, RGB, RGB];

const rgb = (hex: string): RGB => [0, 2, 4].map((i) => parseInt(hex.slice(i + 1, i + 3), 16) / 255) as RGB;
const palette = (...hexes: [string, string, string]) => hexes.map(rgb) as Palette;
const mix = (a: Palette, b: Palette, t: number) => a.map((c, i) => c.map((v, j) => v + (b[i][j] - v) * t)) as Palette;

// Each mode's daylight, after its character; Dórico keeps Cloudscape's own sky
const DAYS: Record<string, Palette> = {
  Dórico: palette("#87ceeb", "#f8f8f8", "#ffffff"),
  Lidio: palette("#b5e2f7", "#ffffff", "#ffffff"),
  Eólico: palette("#8a7fc0", "#d9cdf0", "#f3eefc"),
  Mixolidio: palette("#e9a75a", "#f8dcb0", "#fff1d9"),
  Pentatónica: palette("#f1a39a", "#f9cfc6", "#ffece6"),
};
const NIGHT = palette("#0a1430", "#3e4a66", "#8a96b4");
const DAWN = palette("#e49ab0", "#f8d5d8", "#fff1ec");
const SUNSET = palette("#d9653b", "#f6b26b", "#ffe0b0");
// How much of the mode's daylight tints the night, the dawn and the sunset
const TINT = 0.25;
// What the clouds lean toward as the pitch goes down or up, at most halfway
const WARM = rgb("#ffc58f");
const COOL = rgb("#a9c8ff");

/** The sky's colours as the light runs night (0), dawn (¼), day (½) and sunset (1) in a mode,
 * with the clouds warmed by a low pitch and cooled by a high one (semitones, ±12) */
export function skyColors(mode: string, light: number, pitch: number): Palette {
  const [sky, ...clouds] = lit(mode, light);
  const tint = pitch < 0 ? WARM : COOL;
  const t = (Math.abs(pitch) / 12) * 0.5;
  return [sky, ...clouds.map((c) => c.map((v, i) => v + (tint[i] - v) * t))] as Palette;
}

function lit(mode: string, light: number): Palette {
  const day = DAYS[mode];
  const stops: [number, Palette][] = [
    [0, mix(NIGHT, day, TINT)],
    [0.25, mix(DAWN, day, TINT)],
    [0.5, day],
    [1, mix(SUNSET, day, TINT)],
  ];
  const i = Math.max(0, stops.findLastIndex(([at]) => at <= light));
  if (i === stops.length - 1) return stops[i][1];
  const [from, a] = stops[i];
  const [to, b] = stops[i + 1];
  return mix(a, b, (light - from) / (to - from));
}

// Every number the shader takes, sent as u_<name>
const SCALARS = ["time", "clock", "rain", "pad", "halo", "warp", "width", "pulse", "saturation"] as const;

export type Frame = Record<(typeof SCALARS)[number], number> & {
  colors: Palette;
  // x and y (0–1, y up), age (0–1) and strength for each note's glow; age 1 is an empty slot
  stars: Float32Array;
};

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

const FRAGMENT = `
precision highp float;
uniform float u_time, u_clock, u_rain, u_pad, u_halo, u_warp, u_width, u_pulse, u_saturation;
uniform vec2 u_resolution;
uniform vec3 u_bottom, u_middle, u_top;
uniform vec4 u_stars[${MAX_STARS}];

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float rand(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
// One layer of rain at pixel p: a drop every spacing px across, falling speed screens a second,
// repeats drops down a column, each len of the fall long and width px wide, in a density share
// of the columns; slanted, and shuffled so no grid shows. The tail trails above the head.
float rain(vec2 p, float spacing, float speed, float repeats, float len, float width, float density, float seed) {
  p.x += p.y * 0.12;
  float cx = p.x / spacing + seed * 17.0;
  float column = floor(cx);
  float dx = (fract(cx) - 0.5 - (rand(column + seed) - 0.5) * 0.6) * spacing;
  float fall = 0.8 + 0.4 * rand(column + seed * 2.0);
  float drop = fract(-p.y / u_resolution.y * repeats - u_clock * speed * fall + rand(column + seed * 3.0));
  float tail = smoothstep(1.0 - len * (0.7 + 0.6 * rand(column + seed * 4.0)), 1.0, drop);
  return (1.0 - smoothstep(0.0, width, abs(dx))) * tail * tail * step(1.0 - density, rand(column + seed * 5.0));
}
float fbm(vec2 p, float t) {
  float v = 0.0;
  float a = 0.5;
  float fi = 0.0;
  mat2 rot = mat2(0.86, 0.51, -0.51, 0.86);
  for (int i = 0; i < 6; i++) {
    vec2 morph = vec2(sin(t * 0.5 + fi), cos(t * 0.3 - fi)) * 0.05 * u_warp;
    v += a * noise(p + morph);
    p = rot * p * 2.0;
    a *= 0.5;
    fi += 1.0;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  vec2 p = (uv - 0.5) * aspect;
  vec2 wind = vec2(u_time * 0.1, u_time * 0.02);

  // The pad and the sound itself thicken the clouds; the reverb's size softens their edges
  float pattern = fbm(p * 2.2 - wind, u_time) + u_pad * 0.15 - 0.09 + u_pulse * 0.1;

  // Every note lights the cloud it lands in from within and parts it a little, flaring fast and
  // dying slowly; low notes warm, high ones cool. The reverb spreads it, the eco pulses it again.
  float open = 0.0;
  float lit = 0.0;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < ${MAX_STARS}; i++) {
    vec4 s = u_stars[i];
    if (s.z >= 1.0) continue;
    float d = length(p - (s.xy - 0.5) * aspect);
    float life = (1.0 - s.z) * (1.0 - s.z) * smoothstep(0.0, 0.04, s.z) * s.w;
    float reach = exp(-d * mix(5.0, 2.5, u_halo));
    open += reach * life * 0.6;
    lit += reach * life;
    glow += mix(vec3(1.0, 0.6, 0.25), vec3(0.45, 0.7, 1.0), s.x) * reach * life;
  }
  pattern -= open;
  float bandLow = smoothstep(0.3, 0.3 + 0.35 * u_width, pattern);
  float bandHigh = smoothstep(0.7, 0.7 + 0.25 * u_width, pattern);

  vec3 color = mix(mix(u_bottom, u_middle, bandLow), u_top, bandHigh);
  color *= 1.0 + u_pulse * 0.15;
  // Tinted rather than added to, so it shows on a white cloud too; strongest where there's cloud
  // to light, faint in the clearing it opened
  color = mix(color, glow / max(lit, 0.001) * 1.3, min(lit * 2.5, 1.0) * (0.55 + bandLow * 0.45));

  // Rain greys the sky, hazes it toward the bottom, and falls in three layers for depth
  color = mix(color, vec3(dot(color, vec3(0.333))) * 0.8, u_rain * 0.5);
  color = mix(color, vec3(0.7, 0.74, 0.8), u_rain * 0.3 * (1.0 - uv.y));
  float streaks = rain(gl_FragCoord.xy, 4.0, 0.6, 2.0, 0.06, 0.6, u_rain, 1.0) * 0.3
    + rain(gl_FragCoord.xy, 9.0, 1.0, 1.5, 0.1, 1.0, u_rain * 0.7, 2.0) * 0.45
    + rain(gl_FragCoord.xy, 20.0, 1.6, 1.0, 0.16, 1.6, u_rain * 0.4, 3.0) * 0.6;
  // Light against the blue, darker against the white of a cloud, so it reads on both
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(color, mix(vec3(0.95, 0.97, 1.0), vec3(0.58, 0.64, 0.74), smoothstep(0.6, 0.9, lum)), min(streaks, 1.0));


  color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, u_saturation);
  gl_FragColor = vec4(color, 1.0);
}`;

/** Draws a frame from `read()` on every animation frame until the returned stop is called */
export function startSky(canvas: HTMLCanvasElement, read: () => Frame) {
  const gl = canvas.getContext("webgl");
  // shortcut: without WebGL the canvas stays a dark box but still plays notes
  if (!gl) return () => {};

  const program = gl.createProgram()!;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const at = (name: string) => gl.getUniformLocation(program, name);
  const scalars = SCALARS.map((name) => [name, at(`u_${name}`)] as const);
  const resolution = at("u_resolution");
  const stars = at("u_stars");
  const colors = ["u_bottom", "u_middle", "u_top"].map(at);

  let frame = 0;
  const draw = () => {
    frame = requestAnimationFrame(draw);
    // Capped at 2x: the shader runs per pixel, and a 3x phone screen would crawl
    const dpr = Math.min(devicePixelRatio, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) [canvas.width, canvas.height] = [w, h];
    gl.viewport(0, 0, w, h);
    const f = read();
    for (const [name, location] of scalars) gl.uniform1f(location, f[name]);
    gl.uniform2f(resolution, w, h);
    gl.uniform4fv(stars, f.stars);
    colors.forEach((location, i) => gl.uniform3fv(location, f.colors[i]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  frame = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frame);
}
