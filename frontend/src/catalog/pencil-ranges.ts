import { LUMINANCE_CATALOG } from "./luminance.ts";
import {
  combineCatalogs,
  type Pencil,
  type PencilCatalog,
} from "./pencil-catalog.ts";
import { POLYCHROMOS_CATALOG } from "./polychromos.ts";

/** The pencil ranges rangeen knows about. Add new ranges here. */
export const PENCIL_RANGES = [
  {
    id: "polychromos",
    label: "Polychromos",
    brand: "Faber-Castell",
    catalog: POLYCHROMOS_CATALOG,
  },
  {
    id: "luminance",
    label: "Luminance",
    brand: "Caran d'Ache",
    catalog: LUMINANCE_CATALOG,
  },
] as const;

export type RangeId = (typeof PENCIL_RANGES)[number]["id"];
export type RangeSelection = RangeId | "all";

export const ALL_PENCILS: PencilCatalog = combineCatalogs(
  PENCIL_RANGES.map((r) => r.catalog),
  "all ranges",
);

export function isRangeSelection(value: unknown): value is RangeSelection {
  return value === "all" || PENCIL_RANGES.some((r) => r.id === value);
}

export function catalogFor(selection: RangeSelection): PencilCatalog {
  return selection === "all"
    ? ALL_PENCILS
    : PENCIL_RANGES.find((r) => r.id === selection)!.catalog;
}

/** Short range label for a pencil, e.g. "Luminance". */
export function rangeLabel(pencil: Pencil): string {
  return (
    PENCIL_RANGES.find((r) => r.catalog.pencils.includes(pencil))?.label ??
    pencil.productLine
  );
}

/** Human-readable explanation for each `color_source` key used in the data. */
export const COLOR_SOURCE_NOTES: Record<string, string> = {
  "fc-chart-2014-cmyk-fogra39":
    "Polychromos swatches are converted from the CMYK colours in Faber-Castell's 2014 printed chart (assuming the Coated FOGRA39 profile).",
  "cda-luminance-chart-2023-scan":
    "Luminance swatches are measured from the heavy-pressure end of the scanned strokes in Caran d'Ache's 2023 colour chart.",
};
