import rawCatalog from "./data/luminance-catalog.json" with { type: "json" };
import { buildCatalog, type PencilCatalog } from "./pencil-catalog.ts";

/**
 * Caran d'Ache Luminance 6901: all 100 colours.
 *
 * Built from Caran d'Ache's Luminance colour chart PDF (2023), whose swatches
 * are scanned pencil strokes. See data/LUMINANCE-SOURCE.md.
 */
export const LUMINANCE_CATALOG: PencilCatalog = buildCatalog(
  rawCatalog,
  "luminance-catalog.json",
);
