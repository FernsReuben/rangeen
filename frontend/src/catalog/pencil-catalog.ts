import {
  hexToLab,
  hexToRgb,
  isValidHex,
  type Lab,
  type Rgb,
} from "../color/color-conversion.ts";

export interface RawPencilRecord {
  id: string;
  brand: string;
  product_line: string;
  art_number: number;
  /** Code as printed by the maker, e.g. "001". Defaults to the art number. */
  code?: string;
  name: string;
  family?: string;
  lightfastness?: number;
  lightfastness_scale?: LightfastnessScale;
  pigments?: string[];
  hex?: string | null;
  /** Source CMYK the HEX was derived from, 0–100 per channel. */
  cmyk?: number[] | null;
  /** Set sizes this pencil comes in, e.g. [12, 24, 36]. */
  sets?: number[];
  former_names?: string[];
  finish?: "metallic";
  /** Short provenance key for `hex`, documented next to the data file. */
  color_source?: string | null;
}

/**
 * "stars-3": 1–3 stars, higher is better (Faber-Castell).
 * "astm-d6901": ASTM D6901 classes I–V stored as 1–5, lower is better.
 */
export type LightfastnessScale = "stars-3" | "astm-d6901";

export type PencilIssue =
  | "metallic-no-flat-color"
  | "color-placeholder"
  | "color-missing"
  | "color-invalid"
  | "lightfastness-unverified"
  | "duplicate-name";

export interface Pencil {
  id: string;
  brand: string;
  productLine: string;
  /** Numeric part of the code, used for sorting, e.g. 101 or 1. */
  number: number;
  /** Code as printed by the maker, e.g. "101" or "001". */
  code: string;
  /** Name exactly as in the source data. */
  name: string;
  /** Name for display: each word capitalised ("light ultramarine" → "Light Ultramarine"). */
  displayName: string;
  formerNames: string[];
  /** Family exactly as given by the source; not verified. */
  family: string | null;
  lightfastness: number | null;
  lightfastnessScale: LightfastnessScale | null;
  lightfastnessVerified: boolean;
  /** Colour Index pigment codes, when the source lists them. */
  pigments: string[];
  /** Digital swatch approximation. `null` = unknown. */
  hex: string | null;
  rgb: Rgb | null;
  /** Precomputed CIELAB (D65) from `hex`. `null` when the color is unknown. */
  lab: Lab | null;
  cmyk: number[] | null;
  colorSource: string | null;
  /** Set sizes containing this pencil; empty when unknown. */
  sets: number[];
  metallic: boolean;
  issues: PencilIssue[];
}

export interface RejectedRecord {
  index: number;
  reason: string;
}

export interface PencilCatalog {
  source: string;
  pencils: Pencil[];
  /** Pencils with a usable color, i.e. the ones color matching can use. */
  matchable: Pencil[];
  rejected: RejectedRecord[];
  /** HEX values detected as placeholders. */
  placeholderHexes: string[];
}

/** A HEX shared by more than this many records is treated as a placeholder. */
const PLACEHOLDER_SHARE_THRESHOLD = 3;

function validateRecord(value: unknown): RawPencilRecord | string {
  if (typeof value !== "object" || value === null) return "not an object";
  const r = value as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id === "") return "missing id";
  if (typeof r.brand !== "string") return "missing brand";
  if (typeof r.product_line !== "string") return "missing product_line";
  if (
    typeof r.art_number !== "number" ||
    !Number.isInteger(r.art_number) ||
    r.art_number <= 0
  ) {
    return "art_number must be a positive integer";
  }
  if (typeof r.name !== "string" || r.name.trim() === "") return "missing name";
  if (r.family !== undefined && typeof r.family !== "string")
    return "family must be a string";
  if (r.lightfastness !== undefined && typeof r.lightfastness !== "number") {
    return "lightfastness must be a number";
  }
  if (r.hex !== undefined && r.hex !== null && typeof r.hex !== "string")
    return "hex must be a string";
  const isNumberArray = (v: unknown) =>
    Array.isArray(v) &&
    v.every((x) => typeof x === "number" && Number.isFinite(x));
  if (
    r.cmyk !== undefined &&
    r.cmyk !== null &&
    !(isNumberArray(r.cmyk) && (r.cmyk as number[]).length === 4)
  ) {
    return "cmyk must be four numbers";
  }
  if (r.sets !== undefined && !isNumberArray(r.sets))
    return "sets must be an array of numbers";
  if (
    r.former_names !== undefined &&
    !(
      Array.isArray(r.former_names) &&
      r.former_names.every((x) => typeof x === "string")
    )
  ) {
    return "former_names must be an array of strings";
  }
  if (
    r.code !== undefined &&
    (typeof r.code !== "string" || r.code.trim() === "")
  )
    return "code must be a non-empty string";
  if (
    r.lightfastness_scale !== undefined &&
    r.lightfastness_scale !== "stars-3" &&
    r.lightfastness_scale !== "astm-d6901"
  ) {
    return 'lightfastness_scale must be "stars-3" or "astm-d6901"';
  }
  if (
    r.pigments !== undefined &&
    !(
      Array.isArray(r.pigments) &&
      r.pigments.every((x) => typeof x === "string")
    )
  ) {
    return "pigments must be an array of strings";
  }
  if (r.finish !== undefined && r.finish !== "metallic")
    return 'finish must be "metallic" when present';
  if (
    r.color_source !== undefined &&
    r.color_source !== null &&
    typeof r.color_source !== "string"
  ) {
    return "color_source must be a string";
  }
  return r as unknown as RawPencilRecord;
}

const LOWERCASE_PARTICLES = new Set([
  "de",
  "du",
  "des",
  "la",
  "le",
  "of",
  "and",
]);

/** "light ultramarine" → "Light Ultramarine"; "Bleu de Nîmes" keeps "de"; keeps numerals and capitals. */
export function toDisplayName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word, i) =>
      i > 0 && LOWERCASE_PARTICLES.has(word.toLowerCase())
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export function buildCatalog(raw: unknown, source: string): PencilCatalog {
  if (!Array.isArray(raw))
    throw new Error(`Pencil catalog "${source}" must be a JSON array.`);

  const rejected: RejectedRecord[] = [];
  const records: RawPencilRecord[] = [];
  const seenIds = new Set<string>();
  const seenNumbers = new Set<string>();

  raw.forEach((item, index) => {
    const result = validateRecord(item);
    if (typeof result === "string") {
      rejected.push({ index, reason: result });
      return;
    }
    const numberKey = `${result.brand}|${result.product_line}|${result.art_number}`;
    if (seenIds.has(result.id)) {
      rejected.push({ index, reason: `duplicate id ${result.id}` });
      return;
    }
    if (seenNumbers.has(numberKey)) {
      rejected.push({
        index,
        reason: `duplicate art number ${result.art_number}`,
      });
      return;
    }
    seenIds.add(result.id);
    seenNumbers.add(numberKey);
    records.push(result);
  });

  // Placeholder colors: identical HEX across several pencils.
  const hexCounts = new Map<string, number>();
  for (const r of records) {
    if (r.hex && isValidHex(r.hex)) {
      const key = r.hex.trim().toUpperCase();
      hexCounts.set(key, (hexCounts.get(key) ?? 0) + 1);
    }
  }
  const placeholderHexes = [...hexCounts]
    .filter(([, count]) => count > PLACEHOLDER_SHARE_THRESHOLD)
    .map(([hex]) => hex)
    .sort();

  const ratings = new Set(records.map((r) => r.lightfastness));
  const lightfastnessVerified = records.length < 2 || ratings.size > 1;

  const nameCounts = new Map<string, number>();
  for (const r of records) {
    const key = r.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const pencils = records
    .map((r): Pencil => {
      const issues: PencilIssue[] = [];
      let hex: string | null = null;
      const metallic = r.finish === "metallic";
      if (r.hex === undefined || r.hex === null || r.hex.trim() === "") {
        issues.push(metallic ? "metallic-no-flat-color" : "color-missing");
      } else if (!isValidHex(r.hex)) {
        issues.push("color-invalid");
      } else {
        const normalized = r.hex.trim().toUpperCase();
        if (placeholderHexes.includes(normalized))
          issues.push("color-placeholder");
        else
          hex =
            normalized.length === 4
              ? `#${normalized
                  .slice(1)
                  .split("")
                  .map((c) => c + c)
                  .join("")}`
              : normalized;
      }

      const lightfastness =
        typeof r.lightfastness === "number" ? r.lightfastness : null;
      if (lightfastness !== null && !lightfastnessVerified)
        issues.push("lightfastness-unverified");
      if ((nameCounts.get(r.name.trim().toLowerCase()) ?? 0) > 1)
        issues.push("duplicate-name");

      return {
        id: r.id,
        brand: r.brand,
        productLine: r.product_line,
        number: r.art_number,
        code: r.code?.trim() ?? String(r.art_number),
        name: r.name.trim(),
        displayName: toDisplayName(r.name),
        formerNames: r.former_names ?? [],
        family: r.family?.trim() || null,
        lightfastness,
        lightfastnessScale:
          lightfastness !== null ? (r.lightfastness_scale ?? null) : null,
        lightfastnessVerified: lightfastness !== null && lightfastnessVerified,
        pigments: r.pigments ?? [],
        hex,
        rgb: hex ? hexToRgb(hex) : null,
        lab: hex ? hexToLab(hex) : null,
        cmyk: hex && r.cmyk ? r.cmyk : null,
        colorSource: hex ? (r.color_source ?? null) : null,
        sets: [...(r.sets ?? [])].sort((a, b) => a - b),
        metallic,
        issues,
      };
    })
    .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));

  return {
    source,
    pencils,
    matchable: pencils.filter((p) => p.lab !== null),
    rejected,
    placeholderHexes,
  };
}

/**
 * Merges several catalogs (e.g. Polychromos + Luminance) for cross-range
 * matching. Pencils are ordered by product line, then number.
 */
export function combineCatalogs(
  catalogs: readonly PencilCatalog[],
  source: string,
): PencilCatalog {
  const pencils = catalogs
    .flatMap((c) => c.pencils)
    .sort(
      (a, b) =>
        a.productLine.localeCompare(b.productLine) ||
        a.number - b.number ||
        a.id.localeCompare(b.id),
    );
  const ids = new Set<string>();
  for (const p of pencils) {
    if (ids.has(p.id))
      throw new Error(`Pencil id ${p.id} appears in more than one catalog.`);
    ids.add(p.id);
  }
  return {
    source,
    pencils,
    matchable: pencils.filter((p) => p.lab !== null),
    rejected: catalogs.flatMap((c) =>
      c.rejected.map((r) => ({ ...r, reason: `${c.source}: ${r.reason}` })),
    ),
    placeholderHexes: [
      ...new Set(catalogs.flatMap((c) => c.placeholderHexes)),
    ].sort(),
  };
}
