import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deltaE2000 } from "./ciede2000.ts";
import {
  hexToLab,
  hexToRgb,
  isValidHex,
  labToLch,
  labToRgb,
  linearToRgb,
  rgbToHex,
  rgbToLab,
  rgbToLinear,
  type Lab,
} from "./color-conversion.ts";

function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  label = "",
) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} ± ${tolerance}, got ${actual}`,
  );
}

function assertLabClose(actual: Lab, expected: Lab, tolerance: number) {
  assertClose(actual.l, expected.l, tolerance, "L*");
  assertClose(actual.a, expected.a, tolerance, "a*");
  assertClose(actual.b, expected.b, tolerance, "b*");
}

describe("hex parsing", () => {
  it("parses 6- and 3-digit hex, with or without #", () => {
    assert.deepEqual(hexToRgb("#FF8000"), { r: 255, g: 128, b: 0 });
    assert.deepEqual(hexToRgb("ff8000"), { r: 255, g: 128, b: 0 });
    assert.deepEqual(hexToRgb("#f80"), { r: 255, g: 136, b: 0 });
  });

  it("rejects invalid hex", () => {
    for (const bad of ["", "#12", "#12345", "#GGGGGG", "#12345678", "red"]) {
      assert.equal(isValidHex(bad), false, bad);
      assert.throws(() => hexToRgb(bad), /Invalid HEX/);
    }
  });

  it("formats as uppercase #RRGGBB and clamps", () => {
    assert.equal(rgbToHex({ r: 255, g: 128, b: 0 }), "#FF8000");
    assert.equal(rgbToHex({ r: 300, g: -4, b: 12.6 }), "#FF000D");
  });
});

describe("sRGB ↔ linear", () => {
  it("round-trips every 8-bit value exactly", () => {
    for (let v = 0; v < 256; v++) {
      const rgb = { r: v, g: 255 - v, b: (v * 7) % 256 };
      assert.deepEqual(linearToRgb(rgbToLinear(rgb)), rgb);
    }
  });
});

describe("sRGB → CIELAB (D65)", () => {
  // Reference values for sRGB primaries under D65 / 2°.
  it("matches known reference values", () => {
    assertLabClose(hexToLab("#FFFFFF"), { l: 100, a: 0, b: 0 }, 0.01);
    assertLabClose(hexToLab("#000000"), { l: 0, a: 0, b: 0 }, 1e-9);
    assertLabClose(hexToLab("#FF0000"), { l: 53.24, a: 80.09, b: 67.2 }, 0.01);
    assertLabClose(
      hexToLab("#00FF00"),
      { l: 87.73, a: -86.18, b: 83.18 },
      0.01,
    );
    assertLabClose(
      hexToLab("#0000FF"),
      { l: 32.3, a: 79.19, b: -107.86 },
      0.01,
    );
  });

  it("gives neutral grays a* = b* ≈ 0", () => {
    for (const v of [1, 50, 128, 200, 254]) {
      const lab = rgbToLab({ r: v, g: v, b: v });
      assertClose(lab.a, 0, 0.01, `a* for gray ${v}`);
      assertClose(lab.b, 0, 0.01, `b* for gray ${v}`);
    }
  });

  it("round-trips LAB → sRGB for in-gamut colors", () => {
    for (const hex of ["#1A2B3C", "#FF8000", "#7F7F7F", "#00C8AA", "#FDFDFD"]) {
      const { rgb, inGamut } = labToRgb(hexToLab(hex));
      assert.equal(inGamut, true, hex);
      assert.equal(rgbToHex(rgb), hex);
    }
  });

  it("flags out-of-gamut LAB colors", () => {
    assert.equal(labToRgb({ l: 50, a: 120, b: -120 }).inGamut, false);
  });

  it("computes LCh hue in [0, 360)", () => {
    const lch = labToLch({ l: 50, a: 0, b: -10 });
    assertClose(lch.c, 10, 1e-12);
    assertClose(lch.h, 270, 1e-12);
  });
});

describe("CIEDE2000", () => {
  // Test pairs from Sharma, Wu & Dalal (2005), Table 1.
  const cases: Array<[Lab, Lab, number]> = [
    [{ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ l: 50, a: 2.8361, b: -74.02 }, { l: 50, a: 0, b: -82.7485 }, 3.4412],
    [{ l: 50, a: 0, b: 0 }, { l: 50, a: -1, b: 2 }, 2.3669],
    [{ l: 50, a: 2.5, b: 0 }, { l: 73, a: 25, b: -18 }, 27.1492],
    [{ l: 50, a: 2.5, b: 0 }, { l: 61, a: -5, b: 29 }, 22.8977],
    [{ l: 50, a: 2.5, b: 0 }, { l: 56, a: -27, b: -3 }, 31.903],
    [{ l: 50, a: 2.5, b: 0 }, { l: 58, a: 24, b: 15 }, 19.4535],
    [{ l: 50, a: 2.5, b: 0 }, { l: 50, a: 3.1736, b: 0.5854 }, 1.0],
    [
      { l: 60.2574, a: -34.0099, b: 36.2677 },
      { l: 60.4626, a: -34.1751, b: 39.4387 },
      1.2644,
    ],
    [
      { l: 63.0109, a: -31.0961, b: -5.8663 },
      { l: 62.8187, a: -29.7946, b: -4.0864 },
      1.263,
    ],
    [
      { l: 2.0776, a: 0.0795, b: -1.135 },
      { l: 0.9033, a: -0.0636, b: -0.5514 },
      0.9082,
    ],
  ];

  it("matches the Sharma et al. reference data to 4 decimals", () => {
    for (const [lab1, lab2, expected] of cases) {
      assertClose(
        deltaE2000(lab1, lab2),
        expected,
        5e-5,
        JSON.stringify([lab1, lab2]),
      );
    }
  });

  it("is symmetric and zero for identical colors", () => {
    for (const [lab1, lab2] of cases) {
      assertClose(
        deltaE2000(lab1, lab2),
        deltaE2000(lab2, lab1),
        1e-9,
        "symmetry",
      );
      assert.equal(deltaE2000(lab1, lab1), 0);
    }
  });
});
