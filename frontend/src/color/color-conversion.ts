export interface Rgb {
  /** 0–255 integers */
  r: number;
  g: number;
  b: number;
}

export interface LinearRgb {
  /** 0–1 linear-light values */
  r: number;
  g: number;
  b: number;
}

export interface Xyz {
  x: number;
  y: number;
  z: number;
}

export interface Lab {
  /** Lightness, 0–100 */
  l: number;
  a: number;
  b: number;
}

export interface Lch {
  l: number;
  /** Chroma, ≥ 0 */
  c: number;
  /** Hue angle in degrees, [0, 360) */
  h: number;
}

/** D65 reference white, Y normalised to 1 (CIE 1931 2° observer). */
export const D65_WHITE: Readonly<Xyz> = { x: 0.95047, y: 1.0, z: 1.08883 };

const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

// ------------------------------------------------------------------ HEX

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHex(value: string): boolean {
  return HEX_PATTERN.test(value.trim());
}

/** Parses "#rgb" or "#rrggbb" (case-insensitive, "#" optional). Throws on anything else. */
export function hexToRgb(value: string): Rgb {
  const match = HEX_PATTERN.exec(value.trim());
  if (!match?.[1]) throw new Error(`Invalid HEX color: "${value}"`);
  let hex = match[1];
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  const n = Number.parseInt(hex, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** Uppercase "#RRGGBB". Channels are rounded and clamped to 0–255. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (v: number) => clampByte(v).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}

export function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

// ------------------------------------------------------------- transfer

export function srgbChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(linear: number): number {
  const c =
    linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return c * 255;
}

/** Precomputed lookup: 8-bit sRGB → linear. Used for fast per-pixel work. */
export const SRGB_TO_LINEAR_LUT: Float64Array = (() => {
  const lut = new Float64Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbChannelToLinear(i);
  return lut;
})();

export function rgbToLinear({ r, g, b }: Rgb): LinearRgb {
  return {
    r: srgbChannelToLinear(r),
    g: srgbChannelToLinear(g),
    b: srgbChannelToLinear(b),
  };
}

/** Linear → 8-bit sRGB, rounded and clamped. */
export function linearToRgb({ r, g, b }: LinearRgb): Rgb {
  return {
    r: clampByte(linearChannelToSrgb(r)),
    g: clampByte(linearChannelToSrgb(g)),
    b: clampByte(linearChannelToSrgb(b)),
  };
}

// ------------------------------------------------------------------ XYZ

export function linearToXyz({ r, g, b }: LinearRgb): Xyz {
  return {
    x: 0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    y: 0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    z: 0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  };
}

export function xyzToLinear({ x, y, z }: Xyz): LinearRgb {
  return {
    r: 3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    g: -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    b: 0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  };
}

// ------------------------------------------------------------------ LAB

function labF(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

function labFInverse(f: number): number {
  const f3 = f * f * f;
  return f3 > LAB_EPSILON ? f3 : (116 * f - 16) / LAB_KAPPA;
}

export function xyzToLab({ x, y, z }: Xyz, white: Xyz = D65_WHITE): Lab {
  const fx = labF(x / white.x);
  const fy = labF(y / white.y);
  const fz = labF(z / white.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToXyz({ l, a, b }: Lab, white: Xyz = D65_WHITE): Xyz {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  return {
    x: labFInverse(fx) * white.x,
    y: labFInverse(fy) * white.y,
    z: labFInverse(fz) * white.z,
  };
}

export function linearToLab(linear: LinearRgb): Lab {
  return xyzToLab(linearToXyz(linear));
}

export function rgbToLab(rgb: Rgb): Lab {
  return linearToLab(rgbToLinear(rgb));
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

export interface LabToRgbResult {
  rgb: Rgb;
  /** False when the LAB color lies outside the sRGB gamut and had to be clipped. */
  inGamut: boolean;
}

export function labToRgb(lab: Lab): LabToRgbResult {
  const linear = xyzToLinear(labToXyz(lab));
  const tolerance = 1e-4;
  const inGamut = [linear.r, linear.g, linear.b].every(
    (c) => c >= -tolerance && c <= 1 + tolerance,
  );
  const clip = (c: number) => Math.min(1, Math.max(0, c));
  return {
    rgb: linearToRgb({
      r: clip(linear.r),
      g: clip(linear.g),
      b: clip(linear.b),
    }),
    inGamut,
  };
}

// ------------------------------------------------------------------ LCh

export function labToLch({ l, a, b }: Lab): Lch {
  const c = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c, h };
}
