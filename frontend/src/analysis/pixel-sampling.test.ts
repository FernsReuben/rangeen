import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { samplePixels } from "./pixel-sampling.ts";
import type { PixelBuffer } from "./pixel-buffer.ts";

function checker(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = (x + y) % 2 === 0 ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("samplePixels", () => {
  it("reads a single pixel exactly", () => {
    const s = samplePixels(checker(4, 4), 1, 0, 1)!;
    assert.equal(s.hex, "#FFFFFF");
    assert.equal(s.pixelCount, 1);
    assert.ok(Math.abs(s.lab.l - 100) < 0.01);
  });

  it("averages a 3×3 window in linear light", () => {
    // 5 black + 4 white around (1,1): linear mean 4/9 → sRGB 177.8, rounds to 178.
    const s = samplePixels(checker(4, 4), 1, 1, 3)!;
    assert.equal(s.pixelCount, 9);
    assert.equal(s.rgb.r, 178);
  });

  it("clips the window at image edges", () => {
    assert.equal(samplePixels(checker(4, 4), 0, 0, 3)!.pixelCount, 4);
  });

  it("returns null outside the image or for transparent windows", () => {
    const img = checker(2, 2);
    assert.equal(samplePixels(img, -1, 0, 1), null);
    assert.equal(samplePixels(img, 2, 0, 1), null);
    img.data.fill(0);
    assert.equal(samplePixels(img, 0, 0, 3), null);
  });
});
