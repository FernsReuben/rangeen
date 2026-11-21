import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hexToLab } from "../color/color-conversion.ts";
import { describeDeltaE, findClosestPencils } from "./color-matching.ts";
import { formatLightfastness } from "./lightfastness.ts";
import { LUMINANCE_CATALOG } from "./luminance.ts";
import {
  buildCatalog,
  combineCatalogs,
  toDisplayName,
} from "./pencil-catalog.ts";
import { ALL_PENCILS, catalogFor, isRangeSelection } from "./pencil-ranges.ts";
import { POLYCHROMOS_CATALOG } from "./polychromos.ts";

const base = { brand: "Faber-Castell", product_line: "Polychromos" };
const record = (n: number, name: string, hex?: string, lightfastness = 3) => ({
  ...base,
  id: `id-${n}`,
  art_number: n,
  name,
  hex,
  lightfastness,
});

// Test fixture only: these colors are invented for testing, not catalog data.
const fixture = [
  record(201, "Test Red", "#FF0000", 3),
  record(202, "Test Dark Red", "#880000", 2),
  record(203, "Test Blue", "#0000FF", 3),
  record(204, "Test Gray", "#808080", 1),
  record(205, "Test Twin Red", "#FF0000", 3),
];

describe("buildCatalog", () => {
  it("throws when the source is not an array", () => {
    assert.throws(() => buildCatalog({}, "bad.json"), /must be a JSON array/);
  });

  it("precomputes LAB and sorts by art number", () => {
    const catalog = buildCatalog([...fixture].reverse(), "fixture");
    assert.deepEqual(
      catalog.pencils.map((p) => p.number),
      [201, 202, 203, 204, 205],
    );
    assert.equal(catalog.matchable.length, 5);
    assert.ok(Math.abs(catalog.pencils[0]!.lab!.l - 53.24) < 0.01);
    assert.equal(catalog.pencils[0]!.lightfastnessVerified, true);
  });

  it("reports invalid and duplicate records instead of dropping them silently", () => {
    const catalog = buildCatalog(
      [
        record(1, "A", "#111111"),
        { id: "x" },
        record(1, "Dup number", "#222222"),
        { ...record(3, "Dup id", "#333333"), id: "id-1" },
      ],
      "fixture",
    );
    assert.equal(catalog.pencils.length, 1);
    assert.deepEqual(
      catalog.rejected.map((r) => r.index),
      [1, 2, 3],
    );
  });

  it("treats a HEX shared by many pencils as an unknown placeholder", () => {
    const raw = [1, 2, 3, 4, 5].map((n) => record(n, `P${n}`, "#888888"));
    raw.push(record(6, "Real", "#123456"));
    const catalog = buildCatalog(raw, "fixture");
    assert.deepEqual(catalog.placeholderHexes, ["#888888"]);
    assert.equal(catalog.matchable.length, 1);
    const placeholder = catalog.pencils[0]!;
    assert.equal(placeholder.hex, null);
    assert.equal(placeholder.lab, null);
    assert.ok(placeholder.issues.includes("color-placeholder"));
  });

  it("marks identical lightfastness ratings across the whole catalog as unverified", () => {
    const catalog = buildCatalog(
      [record(1, "A", "#111111", 3), record(2, "B", "#222222", 3)],
      "fixture",
    );
    assert.ok(
      catalog.pencils.every((p) =>
        p.issues.includes("lightfastness-unverified"),
      ),
    );
    assert.ok(catalog.pencils.every((p) => !p.lightfastnessVerified));
  });

  it("flags invalid HEX and duplicate names", () => {
    const catalog = buildCatalog(
      [record(1, "Same", "#zzzzzz", 1), record(2, "same", "#222222", 2)],
      "fixture",
    );
    assert.deepEqual(catalog.pencils[0]!.issues, [
      "color-invalid",
      "duplicate-name",
    ]);
    assert.deepEqual(catalog.pencils[1]!.issues, ["duplicate-name"]);
  });
});

describe("findClosestPencils", () => {
  const catalog = buildCatalog(fixture, "fixture");

  it("ranks by CIEDE2000 and breaks ties by art number", () => {
    const matches = findClosestPencils(
      hexToLab("#FE0000"),
      catalog.matchable,
      10,
    );
    assert.deepEqual(
      matches.map((m) => m.pencil.number),
      [201, 205, 202, 204, 203],
    );
    assert.equal(matches[0]!.deltaE, matches[1]!.deltaE);
  });

  it("returns exactly the requested number of matches", () => {
    assert.equal(
      findClosestPencils(hexToLab("#00F"), catalog.matchable, 2).length,
      2,
    );
    assert.equal(
      findClosestPencils(hexToLab("#00F"), catalog.matchable, 0).length,
      0,
    );
  });

  it("is deterministic regardless of input order", () => {
    const target = hexToLab("#7A1020");
    const a = findClosestPencils(target, catalog.matchable).map(
      (m) => m.pencil.id,
    );
    const b = findClosestPencils(target, [...catalog.matchable].reverse()).map(
      (m) => m.pencil.id,
    );
    assert.deepEqual(a, b);
  });

  it("describes ΔE bands", () => {
    assert.equal(describeDeltaE(0.4), "near-identical");
    assert.equal(describeDeltaE(4.99), "close");
    assert.equal(describeDeltaE(40), "distant");
  });
});

describe("Polychromos catalog (from the 2014 Faber-Castell chart)", () => {
  const c = POLYCHROMOS_CATALOG;
  const byNumber = (n: number) => c.pencils.find((p) => p.number === n)!;

  it("loads all 120 colors with no rejected records or placeholders", () => {
    assert.equal(c.rejected.length, 0);
    assert.equal(c.pencils.length, 120);
    assert.deepEqual(c.placeholderHexes, []);
  });

  it("has a swatch color for every non-metallic pencil", () => {
    assert.equal(c.matchable.length, 117);
    const unmatched = c.pencils.filter((p) => !p.lab).map((p) => p.number);
    assert.deepEqual(unmatched, [250, 251, 252]);
    assert.ok(
      unmatched.every(
        (n) =>
          byNumber(n).metallic &&
          byNumber(n).issues.includes("metallic-no-flat-color"),
      ),
    );
  });

  it("matches the chart's set sizes exactly", () => {
    for (const size of [12, 24, 36, 60, 72, 120]) {
      assert.equal(
        c.pencils.filter((p) => p.sets.includes(size)).length,
        size,
        `set of ${size}`,
      );
    }
  });

  it("has verified 1–3 star lightfastness", () => {
    assert.ok(
      c.pencils.every(
        (p) =>
          p.lightfastnessVerified &&
          p.lightfastness! >= 1 &&
          p.lightfastness! <= 3,
      ),
    );
    assert.equal(c.pencils.filter((p) => p.lightfastness === 3).length, 102);
  });

  it("uses current names for renamed colors and keeps the chart names", () => {
    assert.equal(byNumber(130).displayName, "Salmon");
    assert.deepEqual(byNumber(130).formerNames, ["dark flesh"]);
    assert.equal(byNumber(159).displayName, "Hooker's Green");
  });

  it("gives sensible matches for obvious colors", () => {
    const top = (hex: string) =>
      findClosestPencils(hexToLab(hex), c.matchable, 1)[0]!.pencil.number;
    assert.equal(top("#FFFFFF"), 101); // white
    assert.equal(top("#000000"), 199); // black
    const yellow = findClosestPencils(hexToLab("#FFD627"), c.matchable, 3).map(
      (m) => m.pencil.number,
    );
    assert.ok(yellow.includes(107), `cadmium yellow in ${yellow}`);
  });

  it("keeps every swatch traceable to its CMYK source", () => {
    for (const p of c.matchable) {
      assert.equal(
        p.colorSource,
        "fc-chart-2014-cmyk-fogra39",
        String(p.number),
      );
      assert.equal(p.cmyk?.length, 4, String(p.number));
    }
  });
});

describe("Luminance 6901 catalog (from the 2023 Caran d'Ache chart)", () => {
  const c = LUMINANCE_CATALOG;
  const byCode = (code: string) => c.pencils.find((p) => p.code === code)!;

  it("loads all 100 colours, every one matchable", () => {
    assert.equal(c.rejected.length, 0);
    assert.equal(c.pencils.length, 100);
    assert.equal(c.matchable.length, 100);
    assert.deepEqual(c.placeholderHexes, []);
  });

  it("keeps maker codes with leading zeros", () => {
    assert.equal(byCode("001").displayName, "White");
    assert.equal(byCode("001").number, 1);
    assert.equal(new Set(c.pencils.map((p) => p.code)).size, 100);
  });

  it("matches the chart's statement of 81 LFI colours, the rest LFII", () => {
    assert.equal(c.pencils.filter((p) => p.lightfastness === 1).length, 81);
    assert.equal(c.pencils.filter((p) => p.lightfastness === 2).length, 19);
    assert.ok(
      c.pencils.every(
        (p) => p.lightfastnessScale === "astm-d6901" && p.lightfastnessVerified,
      ),
    );
  });

  it("lists pigments for every colour", () => {
    assert.ok(c.pencils.every((p) => p.pigments.length > 0));
    assert.deepEqual(byCode("001").pigments, ["PW6"]);
  });

  it("gives sensible matches for obvious colours", () => {
    const top = (hex: string) =>
      findClosestPencils(hexToLab(hex), c.matchable, 1)[0]!.pencil.code;
    assert.equal(top("#050505"), "009"); // black
    assert.equal(top("#FBEA29"), "240"); // lemon yellow
  });
});

describe("pencil ranges", () => {
  it("combines ranges without id collisions", () => {
    assert.equal(ALL_PENCILS.pencils.length, 220);
    assert.equal(ALL_PENCILS.matchable.length, 217);
    assert.equal(new Set(ALL_PENCILS.pencils.map((p) => p.id)).size, 220);
  });

  it("rejects combining catalogs that share an id", () => {
    const a = buildCatalog([record(1, "A", "#111111")], "a");
    assert.throws(
      () => combineCatalogs([a, a], "dup"),
      /more than one catalog/,
    );
  });

  it("selects catalogs by range", () => {
    assert.equal(catalogFor("polychromos").pencils.length, 120);
    assert.equal(catalogFor("luminance").pencils.length, 100);
    assert.equal(catalogFor("all"), ALL_PENCILS);
    assert.equal(isRangeSelection("luminance"), true);
    assert.equal(isRangeSelection("prismacolor"), false);
  });
});

describe("display helpers", () => {
  it("formats both lightfastness scales", () => {
    const poly = POLYCHROMOS_CATALOG.pencils.find((p) => p.number === 119)!; // 1 star
    assert.deepEqual(
      [formatLightfastness(poly)!.label, formatLightfastness(poly)!.emptyStars],
      ["★", "★★"],
    );
    const lum = LUMINANCE_CATALOG.pencils.find((p) => p.code === "801")!; // LFII
    assert.equal(formatLightfastness(lum)!.label, "LFII");
    assert.match(formatLightfastness(lum)!.description, /I is best/);
  });

  it("capitalises names but keeps particles and numerals", () => {
    assert.equal(toDisplayName("light ultramarine"), "Light Ultramarine");
    assert.equal(toDisplayName("Bleu de Nîmes"), "Bleu de Nîmes");
    assert.equal(toDisplayName("cold grey IV"), "Cold Grey IV");
  });
});
