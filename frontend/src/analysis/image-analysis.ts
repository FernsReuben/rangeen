import { deltaE2000 } from "../color/ciede2000.ts";
import {
  D65_WHITE,
  SRGB_TO_LINEAR_LUT,
  labToRgb,
  rgbToHex,
  type Lab,
} from "../color/color-conversion.ts";
import { OPAQUE_ALPHA_THRESHOLD, type PixelBuffer } from "./pixel-buffer.ts";

/**
 * Deterministic whole-image color analysis.
 *
 * Every pixel (after downsampling, see pixel-buffer.ts) is converted to
 * CIELAB (D65). All metrics below are computed from L* (value), C* (chroma,
 * used as the perceptual measure of saturation) and h (hue angle). The same
 * pixels always produce the same result: no randomness, and ties are broken
 * by fixed rules.
 *
 * The thresholds in ANALYSIS_THRESHOLDS are conventions chosen for this app,
 * not industry standards. They are exported so the UI can show them.
 */

export const ANALYSIS_THRESHOLDS = {
  /** C* below this counts as neutral (gray-ish) for temperature balance. */
  neutralChroma: 10,
  /** Warm hues: h ≥ warmFrom or h < warmTo (reds, oranges, yellows, magentas). Others are cool. */
  warmHueFrom: 330,
  warmHueTo: 105,
  /** Value zones on L*: shadows < shadowMax ≤ midtones < highlightMin ≤ highlights. */
  shadowMax: 100 / 3,
  highlightMin: 200 / 3,
  /** Saturation classes on C*. */
  mutedChromaMax: 15,
  vividChromaMin: 40,
  /** Tonal range (L* p95 − p5) cut-offs. */
  lowContrastRange: 35,
  highContrastRange: 70,
  /** Mean L* cut-offs for low-key / high-key. */
  lowKeyMeanL: 35,
  highKeyMeanL: 65,
  /** Share of chromatic pixels needed to call an image warm- or cool-dominant. */
  temperatureDominance: 0.65,
  /** Share of all pixels that are neutral for "largely neutral". */
  largelyNeutral: 0.6,
  /** A single value zone holding at least this share is called out. */
  zoneDominance: 0.55,
  /** Chromatic dominant colors spanning at most this hue range = limited hue range. */
  limitedHueSpread: 60,
} as const;

export const DOMINANT_COLOR_COUNT = 8;
const KMEANS_ITERATIONS = 16;
/** Dominant colors closer than this (ΔE00) are merged. */
const DOMINANT_MERGE_DELTA_E = 4;
const CHROMA_BIN_WIDTH = 10;
const CHROMA_BIN_COUNT = 8; // last bin is ≥ 70
const VALUE_BIN_COUNT = 10;

export interface DominantColor {
  hex: string;
  lab: Lab;
  chroma: number;
  hue: number;
  /** Fraction of analysed pixels, 0–1. */
  share: number;
}

export interface Histogram {
  /** Lower edge of each bin. */
  edges: number[];
  /** Fraction of pixels in each bin, sums to 1. */
  shares: number[];
}

export interface Characteristic {
  id: string;
  label: string;
  /** Measured reason, e.g. "Median C* 12.4 is below 15". */
  reason: string;
}

export interface ImageAnalysis {
  /** Number of opaque pixels analysed. */
  pixelCount: number;
  analysedWidth: number;
  analysedHeight: number;
  dominantColors: DominantColor[];
  temperature: { warm: number; cool: number; neutral: number };
  chroma: {
    mean: number;
    median: number;
    histogram: Histogram;
    muted: number;
    moderate: number;
    vivid: number;
  };
  value: {
    mean: number;
    median: number;
    histogram: Histogram;
    shadows: number;
    midtones: number;
    highlights: number;
  };
  contrast: {
    p5: number;
    p95: number;
    /** L* p95 − p5 */
    tonalRange: number;
    /** Standard deviation of L* (RMS contrast). */
    stdDev: number;
    min: number;
    max: number;
  };
  characteristics: Characteristic[];
}

export class EmptyImageError extends Error {
  constructor() {
    super("The image has no opaque pixels to analyse.");
    this.name = "EmptyImageError";
  }
}

const EPS = 216 / 24389;
const KAPPA = 24389 / 27;
const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

/** Percentile from a sorted array using nearest-rank (deterministic, no interpolation). */
function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[rank]!;
}

function hueOf(a: number, b: number): number {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}

function isWarmHue(h: number): boolean {
  return (
    h >= ANALYSIS_THRESHOLDS.warmHueFrom || h < ANALYSIS_THRESHOLDS.warmHueTo
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function analyzeImage(pixels: PixelBuffer): ImageAnalysis {
  const { data, width, height } = pixels;
  const total = width * height;

  const L = new Float32Array(total);
  const A = new Float32Array(total);
  const B = new Float32Array(total);
  let n = 0;

  // Buckets for dominant colors: 5 bits per sRGB channel.
  const bucketCount = new Uint32Array(32768);
  const bucketL = new Float64Array(32768);
  const bucketA = new Float64Array(32768);
  const bucketB = new Float64Array(32768);

  for (let i = 0; i < total; i++) {
    const j = i * 4;
    if (data[j + 3]! < OPAQUE_ALPHA_THRESHOLD) continue;
    const r8 = data[j]!;
    const g8 = data[j + 1]!;
    const b8 = data[j + 2]!;
    const r = SRGB_TO_LINEAR_LUT[r8]!;
    const g = SRGB_TO_LINEAR_LUT[g8]!;
    const b = SRGB_TO_LINEAR_LUT[b8]!;
    const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / D65_WHITE.x);
    const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
    const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / D65_WHITE.z);
    const l = 116 * fy - 16;
    const a = 500 * (fx - fy);
    const bb = 200 * (fy - fz);
    L[n] = l;
    A[n] = a;
    B[n] = bb;
    n++;

    const key = ((r8 >> 3) << 10) | ((g8 >> 3) << 5) | (b8 >> 3);
    bucketCount[key]! += 1;
    bucketL[key]! += l;
    bucketA[key]! += a;
    bucketB[key]! += bb;
  }

  if (n === 0) throw new EmptyImageError();

  // ---------------------------------------------------------- per-pixel stats
  const chromas = new Float32Array(n);
  let warm = 0;
  let cool = 0;
  let neutral = 0;
  let sumL = 0;
  let sumL2 = 0;
  let sumC = 0;
  let shadows = 0;
  let midtones = 0;
  let highlights = 0;
  const chromaBins = new Array<number>(CHROMA_BIN_COUNT).fill(0);
  const valueBins = new Array<number>(VALUE_BIN_COUNT).fill(0);
  let muted = 0;
  let vivid = 0;
  const T = ANALYSIS_THRESHOLDS;

  for (let i = 0; i < n; i++) {
    const l = L[i]!;
    const a = A[i]!;
    const b = B[i]!;
    const c = Math.hypot(a, b);
    chromas[i] = c;
    sumL += l;
    sumL2 += l * l;
    sumC += c;

    if (c < T.neutralChroma) neutral++;
    else if (isWarmHue(hueOf(a, b))) warm++;
    else cool++;

    if (l < T.shadowMax) shadows++;
    else if (l < T.highlightMin) midtones++;
    else highlights++;

    if (c < T.mutedChromaMax) muted++;
    else if (c >= T.vividChromaMin) vivid++;

    chromaBins[
      Math.min(CHROMA_BIN_COUNT - 1, Math.floor(c / CHROMA_BIN_WIDTH))
    ]! += 1;
    valueBins[
      Math.min(VALUE_BIN_COUNT - 1, Math.max(0, Math.floor(l / 10)))
    ]! += 1;
  }

  const sortedL = L.slice(0, n).sort();
  const sortedC = chromas.slice().sort();
  const meanL = sumL / n;
  const stdDev = Math.sqrt(Math.max(0, sumL2 / n - meanL * meanL));
  const p5 = percentile(sortedL, 0.05);
  const p95 = percentile(sortedL, 0.95);

  const temperature = { warm: warm / n, cool: cool / n, neutral: neutral / n };
  const chroma = {
    mean: sumC / n,
    median: percentile(sortedC, 0.5),
    histogram: {
      edges: chromaBins.map((_, i) => i * CHROMA_BIN_WIDTH),
      shares: chromaBins.map((v) => v / n),
    },
    muted: muted / n,
    moderate: (n - muted - vivid) / n,
    vivid: vivid / n,
  };
  const value = {
    mean: meanL,
    median: percentile(sortedL, 0.5),
    histogram: {
      edges: valueBins.map((_, i) => i * 10),
      shares: valueBins.map((v) => v / n),
    },
    shadows: shadows / n,
    midtones: midtones / n,
    highlights: highlights / n,
  };
  const contrast = {
    p5,
    p95,
    tonalRange: p95 - p5,
    stdDev,
    min: sortedL[0]!,
    max: sortedL[n - 1]!,
  };

  const dominantColors = findDominantColors(
    bucketCount,
    bucketL,
    bucketA,
    bucketB,
    n,
  );

  return {
    pixelCount: n,
    analysedWidth: width,
    analysedHeight: height,
    dominantColors,
    temperature,
    chroma,
    value,
    contrast,
    characteristics: describeCharacteristics(
      temperature,
      chroma,
      value,
      contrast,
      dominantColors,
    ),
  };
}

// ------------------------------------------------------------- dominant colors

interface Point {
  l: number;
  a: number;
  b: number;
  w: number;
}

/**
 * Weighted k-means in LAB over 15-bit color buckets.
 * Initialisation is deterministic: the heaviest bucket first, then repeatedly
 * the bucket with the largest weight × squared distance to its nearest center
 * (ties → lowest bucket key). Clusters within ΔE00 < 4 are then merged.
 */
function findDominantColors(
  count: Uint32Array,
  sumL: Float64Array,
  sumA: Float64Array,
  sumB: Float64Array,
  total: number,
): DominantColor[] {
  const points: Point[] = [];
  for (let key = 0; key < count.length; key++) {
    const w = count[key]!;
    if (w === 0) continue;
    points.push({ l: sumL[key]! / w, a: sumA[key]! / w, b: sumB[key]! / w, w });
  }

  const k = Math.min(DOMINANT_COLOR_COUNT, points.length);
  const centers: Point[] = [];
  const nearest = new Float64Array(points.length).fill(
    Number.POSITIVE_INFINITY,
  );

  let first = 0;
  for (let i = 1; i < points.length; i++)
    if (points[i]!.w > points[first]!.w) first = i;
  centers.push({ ...points[first]! });

  while (centers.length < k) {
    const last = centers[centers.length - 1]!;
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const d = (p.l - last.l) ** 2 + (p.a - last.a) ** 2 + (p.b - last.b) ** 2;
      if (d < nearest[i]!) nearest[i] = d;
      const score = p.w * nearest[i]!;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) break; // all remaining points coincide with centers
    centers.push({ ...points[best]! });
  }

  const assignment = new Int32Array(points.length);
  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      let bestC = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centers.length; c++) {
        const ctr = centers[c]!;
        const d = (p.l - ctr.l) ** 2 + (p.a - ctr.a) ** 2 + (p.b - ctr.b) ** 2;
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (assignment[i] !== bestC || iter === 0) {
        if (assignment[i] !== bestC) changed = true;
        assignment[i] = bestC;
      }
    }
    for (const ctr of centers) {
      ctr.l = 0;
      ctr.a = 0;
      ctr.b = 0;
      ctr.w = 0;
    }
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const ctr = centers[assignment[i]!]!;
      ctr.l += p.l * p.w;
      ctr.a += p.a * p.w;
      ctr.b += p.b * p.w;
      ctr.w += p.w;
    }
    for (const ctr of centers) {
      if (ctr.w > 0) {
        ctr.l /= ctr.w;
        ctr.a /= ctr.w;
        ctr.b /= ctr.w;
      }
    }
    if (!changed && iter > 0) break;
  }

  // Merge perceptually indistinguishable clusters, heaviest first.
  const clusters = centers
    .filter((c) => c.w > 0)
    .sort((x, y) => y.w - x.w || x.l - y.l);
  const merged: Point[] = [];
  for (const c of clusters) {
    const target = merged.find(
      (m) => deltaE2000(m, c) < DOMINANT_MERGE_DELTA_E,
    );
    if (target) {
      const w = target.w + c.w;
      target.l = (target.l * target.w + c.l * c.w) / w;
      target.a = (target.a * target.w + c.a * c.w) / w;
      target.b = (target.b * target.w + c.b * c.w) / w;
      target.w = w;
    } else {
      merged.push({ ...c });
    }
  }

  return merged
    .sort((x, y) => y.w - x.w || x.l - y.l)
    .map((c) => {
      const lab = { l: c.l, a: c.a, b: c.b };
      return {
        hex: rgbToHex(labToRgb(lab).rgb),
        lab,
        chroma: Math.hypot(c.a, c.b),
        hue: hueOf(c.a, c.b),
        share: c.w / total,
      };
    });
}

// ------------------------------------------------------------ characteristics

function hueSpread(colors: DominantColor[]): number {
  // Smallest arc of the hue circle containing every hue.
  const hues = colors.map((c) => c.hue).sort((a, b) => a - b);
  if (hues.length < 2) return 0;
  let largestGap = 360 - hues[hues.length - 1]! + hues[0]!;
  for (let i = 1; i < hues.length; i++)
    largestGap = Math.max(largestGap, hues[i]! - hues[i - 1]!);
  return 360 - largestGap;
}

function describeCharacteristics(
  temperature: ImageAnalysis["temperature"],
  chroma: ImageAnalysis["chroma"],
  value: ImageAnalysis["value"],
  contrast: ImageAnalysis["contrast"],
  dominant: DominantColor[],
): Characteristic[] {
  const T = ANALYSIS_THRESHOLDS;
  const out: Characteristic[] = [];

  if (value.mean < T.lowKeyMeanL) {
    out.push({
      id: "low-key",
      label: "Low key",
      reason: `Mean L* ${round1(value.mean)} is below ${T.lowKeyMeanL}.`,
    });
  } else if (value.mean > T.highKeyMeanL) {
    out.push({
      id: "high-key",
      label: "High key",
      reason: `Mean L* ${round1(value.mean)} is above ${T.highKeyMeanL}.`,
    });
  } else {
    out.push({
      id: "mid-key",
      label: "Mid key",
      reason: `Mean L* ${round1(value.mean)} is between ${T.lowKeyMeanL} and ${T.highKeyMeanL}.`,
    });
  }

  const range = round1(contrast.tonalRange);
  if (contrast.tonalRange >= T.highContrastRange) {
    out.push({
      id: "high-contrast",
      label: "High contrast",
      reason: `Tonal range (L* p5–p95) is ${range}, at least ${T.highContrastRange}.`,
    });
  } else if (contrast.tonalRange < T.lowContrastRange) {
    out.push({
      id: "low-contrast",
      label: "Low contrast",
      reason: `Tonal range (L* p5–p95) is ${range}, below ${T.lowContrastRange}.`,
    });
  } else {
    out.push({
      id: "moderate-contrast",
      label: "Moderate contrast",
      reason: `Tonal range (L* p5–p95) is ${range}, between ${T.lowContrastRange} and ${T.highContrastRange}.`,
    });
  }

  const medC = round1(chroma.median);
  if (chroma.median < T.mutedChromaMax) {
    out.push({
      id: "muted",
      label: "Muted",
      reason: `Median chroma C* ${medC} is below ${T.mutedChromaMax}.`,
    });
  } else if (chroma.median >= T.vividChromaMin) {
    out.push({
      id: "vivid",
      label: "Vivid",
      reason: `Median chroma C* ${medC} is at least ${T.vividChromaMin}.`,
    });
  } else {
    out.push({
      id: "moderately-saturated",
      label: "Moderately saturated",
      reason: `Median chroma C* ${medC} is between ${T.mutedChromaMax} and ${T.vividChromaMin}.`,
    });
  }

  if (temperature.neutral >= T.largelyNeutral) {
    out.push({
      id: "largely-neutral",
      label: "Largely neutral",
      reason: `${pct(temperature.neutral)} of pixels have C* below ${T.neutralChroma}.`,
    });
  }
  const chromatic = temperature.warm + temperature.cool;
  if (chromatic > 0) {
    const warmShare = temperature.warm / chromatic;
    if (warmShare >= T.temperatureDominance) {
      out.push({
        id: "warm",
        label: "Warm-dominant",
        reason: `${pct(warmShare)} of colored pixels have warm hues.`,
      });
    } else if (1 - warmShare >= T.temperatureDominance) {
      out.push({
        id: "cool",
        label: "Cool-dominant",
        reason: `${pct(1 - warmShare)} of colored pixels have cool hues.`,
      });
    } else {
      out.push({
        id: "mixed-temperature",
        label: "Mixed temperature",
        reason: `Colored pixels are ${pct(warmShare)} warm and ${pct(1 - warmShare)} cool.`,
      });
    }
  }

  const zones: Array<[string, string, number]> = [
    ["shadow-heavy", "Shadow-heavy", value.shadows],
    ["midtone-heavy", "Midtone-heavy", value.midtones],
    ["highlight-heavy", "Highlight-heavy", value.highlights],
  ];
  for (const [id, label, share] of zones) {
    if (share >= T.zoneDominance) {
      out.push({
        id,
        label,
        reason: `${pct(share)} of pixels fall in this value zone.`,
      });
    }
  }

  const chromaticDominant = dominant.filter(
    (c) => c.chroma >= T.mutedChromaMax && c.share >= 0.05,
  );
  if (chromaticDominant.length >= 2) {
    const spread = hueSpread(chromaticDominant);
    if (spread <= T.limitedHueSpread) {
      out.push({
        id: "limited-hue-range",
        label: "Limited hue range",
        reason: `Main colored areas span ${Math.round(spread)}° of hue (≤ ${T.limitedHueSpread}°).`,
      });
    }
  }

  return out;
}
