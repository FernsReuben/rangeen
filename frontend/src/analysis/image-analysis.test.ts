import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hexToRgb } from "../color/color-conversion.ts";
import { EmptyImageError, analyzeImage } from "./image-analysis.ts";
import { downsamplePixels, type PixelBuffer } from "./pixel-buffer.ts";

/** Builds an image from horizontal bands of solid colors (equal-width columns per entry). */
function makeImage(
  columns: Array<{ hex: string; width: number }>,
  height = 10,
  alpha = 255,
): PixelBuffer {
  const width = columns.reduce((s, c) => s + c.width, 0);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    let x = 0;
    for (const col of columns) {
      const { r, g, b } = hexToRgb(col.hex);
      for (let k = 0; k < col.width; k++, x++) {
        const i = (y * width + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = alpha;
      }
    }
  }
  return { width, height, data };
}

const close = (a: number, b: number, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const ids = (a: ReturnType<typeof analyzeImage>) =>
  a.characteristics.map((c) => c.id);

describe("analyzeImage", () => {
  it("rejects fully transparent images", () => {
    assert.throws(
      () => analyzeImage(makeImage([{ hex: "#FF0000", width: 4 }], 4, 0)),
      EmptyImageError,
    );
  });

  it("black and white halves: high contrast, two dominant colors, split value zones", () => {
    const a = analyzeImage(
      makeImage([
        { hex: "#000000", width: 50 },
        { hex: "#FFFFFF", width: 50 },
      ]),
    );
    assert.equal(a.pixelCount, 1000);
    assert.equal(a.dominantColors.length, 2);
    close(a.dominantColors[0]!.share, 0.5);
    close(a.value.shadows, 0.5);
    close(a.value.highlights, 0.5);
    close(a.value.midtones, 0);
    close(a.temperature.neutral, 1);
    close(a.contrast.tonalRange, 100, 0.01);
    assert.ok(ids(a).includes("high-contrast"));
    assert.ok(ids(a).includes("largely-neutral"));
    assert.ok(ids(a).includes("muted"));
  });

  it("pure red: warm, vivid, one dominant color", () => {
    const a = analyzeImage(makeImage([{ hex: "#FF0000", width: 20 }]));
    assert.equal(a.dominantColors.length, 1);
    assert.equal(a.dominantColors[0]!.hex, "#FF0000");
    close(a.temperature.warm, 1);
    close(a.chroma.vivid, 1);
    assert.ok(ids(a).includes("warm"));
    assert.ok(ids(a).includes("vivid"));
    assert.ok(ids(a).includes("low-contrast"));
  });

  it("blue and teal: cool-dominant with a limited hue range", () => {
    const a = analyzeImage(
      makeImage([
        { hex: "#1E3A8A", width: 30 },
        { hex: "#1D6FA3", width: 30 },
      ]),
    );
    assert.ok(ids(a).includes("cool"));
    assert.ok(ids(a).includes("limited-hue-range"));
  });

  it("dark image is low key and shadow-heavy", () => {
    const a = analyzeImage(
      makeImage([
        { hex: "#151515", width: 30 },
        { hex: "#2A1A10", width: 10 },
      ]),
    );
    assert.ok(ids(a).includes("low-key"));
    assert.ok(ids(a).includes("shadow-heavy"));
  });

  it("shares and histograms sum to 1", () => {
    const a = analyzeImage(
      makeImage([
        { hex: "#E63946", width: 7 },
        { hex: "#F1FAEE", width: 11 },
        { hex: "#A8DADC", width: 5 },
        { hex: "#457B9D", width: 9 },
        { hex: "#1D3557", width: 13 },
      ]),
    );
    const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
    close(sum(a.dominantColors.map((c) => c.share)), 1);
    close(sum(a.chroma.histogram.shares), 1);
    close(sum(a.value.histogram.shares), 1);
    close(a.temperature.warm + a.temperature.cool + a.temperature.neutral, 1);
    close(a.value.shadows + a.value.midtones + a.value.highlights, 1);
  });

  it("is deterministic", () => {
    const img = makeImage([
      { hex: "#C2185B", width: 13 },
      { hex: "#7B1FA2", width: 8 },
      { hex: "#FBC02D", width: 21 },
      { hex: "#388E3C", width: 5 },
    ]);
    assert.deepEqual(analyzeImage(img), analyzeImage(img));
  });

  it("ignores transparent pixels", () => {
    const img = makeImage([{ hex: "#00FF00", width: 10 }]);
    for (let i = 0; i < img.data.length; i += 8) img.data[i + 3] = 0; // half the pixels transparent
    const a = analyzeImage(img);
    assert.equal(a.pixelCount, 50);
  });
});

describe("downsamplePixels", () => {
  it("returns small images untouched", () => {
    const img = makeImage([{ hex: "#123456", width: 10 }]);
    assert.equal(downsamplePixels(img, 64), img);
  });

  it("averages in linear light and keeps aspect ratio", () => {
    // Alternating black/white columns: linear average is 50% light → sRGB 188, not 128.
    const cols = Array.from({ length: 200 }, (_, i) => ({
      hex: i % 2 ? "#FFFFFF" : "#000000",
      width: 1,
    }));
    const small = downsamplePixels(makeImage(cols, 100), 100);
    assert.equal(small.width, 100);
    assert.equal(small.height, 50);
    assert.equal(small.data[0], 188);
  });
});
