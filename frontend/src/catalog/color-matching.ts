import { deltaE2000 } from "../color/ciede2000.ts";
import type { Lab } from "../color/color-conversion.ts";
import type { Pencil } from "./pencil-catalog.ts";

export interface PencilMatch {
  pencil: Pencil;
  /** CIEDE2000 difference between the target and the pencil's digital swatch. */
  deltaE: number;
}

export const DEFAULT_MATCH_COUNT = 10;

/**
 * Ranks pencils by CIEDE2000 distance to `target`.
 * Deterministic: ties break by art number, then id.
 * Pencils without a known color (`lab === null`) are never returned.
 */
export function findClosestPencils(
  target: Lab,
  pencils: readonly Pencil[],
  limit = DEFAULT_MATCH_COUNT,
): PencilMatch[] {
  const matches: PencilMatch[] = [];
  for (const pencil of pencils) {
    if (!pencil.lab) continue;
    matches.push({ pencil, deltaE: deltaE2000(target, pencil.lab) });
  }
  matches.sort(
    (a, b) =>
      a.deltaE - b.deltaE ||
      a.pencil.number - b.pencil.number ||
      a.pencil.id.localeCompare(b.pencil.id),
  );
  return matches.slice(0, Math.max(0, limit));
}

export interface DeltaEBand {
  label: string;
  /** Upper bound (exclusive) of ΔE00 for this band. */
  below: number;
}

/**
 * Rough, conventional reading guide for ΔE00. These are rules of thumb for
 * on-screen colors, not guarantees about pencil marks on paper.
 */
export const DELTA_E_BANDS: readonly DeltaEBand[] = [
  { label: "near-identical", below: 1 },
  { label: "very close", below: 2 },
  { label: "close", below: 5 },
  { label: "noticeable", below: 10 },
  { label: "distant", below: Number.POSITIVE_INFINITY },
];

export function describeDeltaE(deltaE: number): string {
  return (
    DELTA_E_BANDS.find((band) => deltaE < band.below) ??
    DELTA_E_BANDS[DELTA_E_BANDS.length - 1]!
  ).label;
}
