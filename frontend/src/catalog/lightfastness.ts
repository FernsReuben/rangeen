import type { Pencil } from "./pencil-catalog.ts";

const ROMAN = ["", "I", "II", "III", "IV", "V"];

export interface LightfastnessDisplay {
  /** Short visible label, e.g. "★★★" or "LFI". */
  label: string;
  /** Unfilled stars to draw after the label (stars scale only). */
  emptyStars: string;
  /** Longer explanation for tooltips and screen readers. */
  description: string;
}

/** Formats a pencil's lightfastness on its own scale, or null when unknown. */
export function formatLightfastness(
  pencil: Pencil,
): LightfastnessDisplay | null {
  const value = pencil.lightfastness;
  if (value === null) return null;
  const unverified = pencil.lightfastnessVerified ? "" : " (unverified)";
  if (pencil.lightfastnessScale === "astm-d6901") {
    return {
      label: `LF${ROMAN[value] ?? value}`,
      emptyStars: "",
      description: `ASTM D6901 lightfastness ${ROMAN[value] ?? value} (I is best, V is worst)${unverified}`,
    };
  }
  return {
    label: "★".repeat(value),
    emptyStars: "★".repeat(Math.max(0, 3 - value)),
    description: `Lightfastness ${value} of 3 stars${unverified}`,
  };
}
