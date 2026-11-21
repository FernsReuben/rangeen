import {
  SRGB_TO_LINEAR_LUT,
  linearToLab,
  linearToRgb,
  rgbToHex,
  type Lab,
  type Rgb,
} from "../color/color-conversion.ts";
import { OPAQUE_ALPHA_THRESHOLD, type PixelBuffer } from "./pixel-buffer.ts";

export const SAMPLE_SIZES = [1, 3, 5, 9] as const;
export type SampleSize = (typeof SAMPLE_SIZES)[number];

export interface ColorSample {
  /** Pixel the sample is centred on, in image coordinates. `null` for colors not taken from the image. */
  x: number | null;
  y: number | null;
  /** Width/height of the averaged square, in pixels. */
  size: number;
  /** Opaque pixels that contributed. */
  pixelCount: number;
  rgb: Rgb;
  hex: string;
  lab: Lab;
}

/**
 * Averages a size×size window centred on (x, y), in linear light, ignoring
 * transparent pixels and clipping at the image edges. Returns null when the
 * point is outside the image or every pixel in the window is transparent.
 */
export function samplePixels(
  pixels: PixelBuffer,
  x: number,
  y: number,
  size: number,
): ColorSample | null {
  const { width, height, data } = pixels;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= width || cy >= height) return null;

  const half = Math.floor(size / 2);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (
    let yy = Math.max(0, cy - half);
    yy <= Math.min(height - 1, cy + half);
    yy++
  ) {
    for (
      let xx = Math.max(0, cx - half);
      xx <= Math.min(width - 1, cx + half);
      xx++
    ) {
      const i = (yy * width + xx) * 4;
      if (data[i + 3]! < OPAQUE_ALPHA_THRESHOLD) continue;
      r += SRGB_TO_LINEAR_LUT[data[i]!]!;
      g += SRGB_TO_LINEAR_LUT[data[i + 1]!]!;
      b += SRGB_TO_LINEAR_LUT[data[i + 2]!]!;
      count++;
    }
  }
  if (count === 0) return null;

  const linear = { r: r / count, g: g / count, b: b / count };
  const rgb = linearToRgb(linear);
  return {
    x: cx,
    y: cy,
    size,
    pixelCount: count,
    rgb,
    hex: rgbToHex(rgb),
    lab: linearToLab(linear),
  };
}
