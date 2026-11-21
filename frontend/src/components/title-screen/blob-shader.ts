export const BLOB_VERTEX_SHADER = /* glsl */ `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const BLOB_FRAGMENT_SHADER = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;   // canvas size in device pixels
uniform float u_time;        // seconds
uniform vec2 u_pointer;      // eased pointer position, -1..1 on each axis

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float smoothNoise(vec2 p) {
  return noise(p) * 0.65 + noise(p * 2.03 + 3.7) * 0.35;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotate = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotate * p;
    amplitude *= 0.5;
  }
  return value;
}

// Thermal / iridescent ramp: 0 = rim gold, 1 = deep core blue.
vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 gold    = vec3(0.98, 0.74, 0.26);
  vec3 orange  = vec3(0.95, 0.38, 0.14);
  vec3 magenta = vec3(1.00, 0.16, 0.76);
  vec3 violet  = vec3(0.52, 0.14, 1.00);
  vec3 blue    = vec3(0.10, 0.16, 1.00);
  vec3 navy    = vec3(0.04, 0.04, 0.38);
  vec3 c = mix(gold, orange, smoothstep(0.00, 0.10, t));
  c = mix(c, magenta, smoothstep(0.10, 0.32, t));
  c = mix(c, violet,  smoothstep(0.32, 0.52, t));
  c = mix(c, blue,    smoothstep(0.52, 0.74, t));
  c = mix(c, navy,    smoothstep(0.74, 1.00, t));
  return c;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y; // y up, height = 1
  float t = u_time;

  // Shrink the blob on narrow (portrait) screens so it stays behind the title.
  float scale = clamp((u_resolution.x / u_resolution.y) / 1.15, 0.62, 1.0);
  vec2 center = vec2(0.0, 0.07) + u_pointer * 0.02;
  vec2 q = (p - center) / scale;
  float px = 1.5 / (u_resolution.y * scale); // ~1.5 device pixels in q units

  // --- Shape -------------------------------------------------------------
  float r0 = 0.32;
  vec2 dir = normalize(q + 1e-5);
  float angle = atan(q.y, q.x);
  float wobble = smoothNoise(dir * 1.1 + vec2(t * 0.09, -t * 0.06)) - 0.5;
  float lobes = sin(angle * 3.0 + t * 0.35) * 0.018 + sin(angle * 2.0 - t * 0.22) * 0.014;
  float radius = r0 * (1.0 + wobble * 0.7) + lobes;
  float d = length(q) - radius;               // < 0 inside
  float inside = smoothstep(px, -px, d);

  // --- Interior ----------------------------------------------------------
  // Normalised by the local radius so every direction reaches exactly 1 at the centre.
  float depth = pow(clamp(1.0 - length(q) / radius, 0.0, 1.0), 0.55); // 0 edge, 1 core
  vec2 fq = q * 2.4;
  vec2 warp = vec2(
    fbm(fq + vec2(0.0, t * 0.12)),
    fbm(fq + vec2(5.2, -t * 0.10))
  );
  float swirl = fbm(fq + 1.8 * warp + vec2(t * 0.05, 0.0));

  vec3 blob = palette(depth * 1.15 + (swirl - 0.5) * 0.85);

  // Top-lit: the lower part of the blob sinks into shadow.
  float light = smoothstep(-0.34, 0.20, q.y + (swirl - 0.5) * 0.28);
  blob *= mix(0.05, 1.0, light);

  // Hot highlight bands where the swirl peaks.
  float hot = smoothstep(0.58, 0.78, swirl) * light;
  blob += hot * vec3(1.0, 0.55, 0.85) * 0.35;

  // Warm glow just inside the edge.
  float edgeGlow = smoothstep(0.05, 0.0, -d) * inside;
  blob += edgeGlow * vec3(1.0, 0.42, 0.10) * mix(0.35, 0.7, light);

  // --- Rim lines ---------------------------------------------------------
  float rimWidth = px * (1.4 + 1.6 * smoothNoise(dir * 2.0 + t * 0.2));
  float rim = smoothstep(rimWidth, 0.0, abs(d - 0.002));

  // A second, wispy contour along the lower right, like a trailing ribbon.
  float d2 = d + 0.02 + 0.012 * sin(t * 0.5 + angle * 2.0);
  float wispMask = smoothstep(0.15, 0.6, dot(dir, normalize(vec2(0.55, -0.85))));
  float wisp = smoothstep(px * 1.6, 0.0, abs(d2)) * wispMask;

  // --- Background ----------------------------------------------------------
  vec3 bg = vec3(0.028, 0.024, 0.038);
  float vignette = smoothstep(1.25, 0.15, length(p * vec2(0.85, 1.1)));
  bg *= 0.55 + 0.45 * vignette;
  bg += 0.025 * fbm(p * 1.3 + t * 0.02) * vec3(0.5, 0.2, 0.7);

  // Soft magenta halo outside the blob.
  float halo = exp(-max(d, 0.0) * 9.0) * (1.0 - inside);

  vec3 color = bg + halo * vec3(1.0, 0.18, 0.75) * 0.14;
  color = mix(color, blob, inside);
  color += rim  * vec3(1.0, 0.80, 0.38) * 0.95;
  color += wisp * vec3(1.0, 0.82, 0.45) * 0.7;

  // Dither to avoid banding in the dark gradients.
  color += (hash(gl_FragCoord.xy + fract(t)) - 0.5) * (2.0 / 255.0);

  gl_FragColor = vec4(color, 1.0);
}
`;
