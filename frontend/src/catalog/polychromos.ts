import rawCatalog from "./data/polychromos-catalog.json" with { type: "json" };
import { buildCatalog, type PencilCatalog } from "./pencil-catalog.ts";

/**
 * Faber-Castell Polychromos: all 120 colours.
 *
 * Built from Faber-Castell's "POLYCHROMOS® Artist Color Pencils – 120 Colors"
 * chart PDF (2014). See data/POLYCHROMOS-SOURCE.md.
 */
export const POLYCHROMOS_CATALOG: PencilCatalog = buildCatalog(
  rawCatalog,
  "polychromos-catalog.json",
);
