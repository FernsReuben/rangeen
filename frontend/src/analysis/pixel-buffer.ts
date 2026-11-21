import {
  SRGB_TO_LINEAR_LUT,
  linearChannelToSrgb,
  clampByte,
} from "../color/color-conversion.ts";

/** RGBA8 pixels in row-major order, the same layout as canvas ImageData. */
export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Pixels with alpha below this are treated as transparent and ignored by analysis. */
export const OPAQUE_ALPHA_THRESHOLD = 128;

/**
 * Deterministic area-average downsample, averaging in linear light so that
 * fine light/dark detail doesn't shift the overall value. Pixels below the
 * alpha threshold are excluded; an output pixel with no opaque sources is
 * fully transparent. Does nothing (returns the input) if already small enough.
 *
 * Implemented in plain code rather than via canvas scaling so results do not
 * depend on the browser's resampling filter.
 */
export function downsamplePixels(
  source: PixelBuffer,
  maxSide: number,
): PixelBuffer {
  const { width, height, data } = source;
  const longest = Math.max(width, height);
  if (longest <= maxSide) return source;

  const scale = maxSide / longest;
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const out = new Uint8ClampedArray(outW * outH * 4);

  // Accumulators per output pixel.
  const sumR = new Float64Array(outW * outH);
  const sumG = new Float64Array(outW * outH);
  const sumB = new Float64Array(outW * outH);
  const count = new Uint32Array(outW * outH);

  const xMap = new Uint32Array(width);
  for (let x = 0; x < width; x++)
    xMap[x] = Math.min(outW - 1, Math.floor((x * outW) / width));

  for (let y = 0; y < height; y++) {
    const oy = Math.min(outH - 1, Math.floor((y * outH) / height));
    const rowOut = oy * outW;
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      if (data[i + 3]! < OPAQUE_ALPHA_THRESHOLD) continue;
      const o = rowOut + xMap[x]!;
      sumR[o]! += SRGB_TO_LINEAR_LUT[data[i]!]!;
      sumG[o]! += SRGB_TO_LINEAR_LUT[data[i + 1]!]!;
      sumB[o]! += SRGB_TO_LINEAR_LUT[data[i + 2]!]!;
      count[o]! += 1;
    }
  }

  for (let o = 0; o < outW * outH; o++) {
    const n = count[o]!;
    if (n === 0) continue;
    const j = o * 4;
    out[j] = clampByte(linearChannelToSrgb(sumR[o]! / n));
    out[j + 1] = clampByte(linearChannelToSrgb(sumG[o]! / n));
    out[j + 2] = clampByte(linearChannelToSrgb(sumB[o]! / n));
    out[j + 3] = 255;
  }

  return { width: outW, height: outH, data: out };
}
