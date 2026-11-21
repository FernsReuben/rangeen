import type { CSSProperties } from "react";

interface PencilSwatchProps {
  /** `null` renders the "color unknown" pattern. */
  hex: string | null;
  size?: "sm" | "md" | "lg";
  label?: string;
}

/** A tactile color chip. Unknown colors get a hatched pattern, never a guessed color. */
export function PencilSwatch({ hex, size = "md", label }: PencilSwatchProps) {
  const style = hex ? ({ "--swatch": hex } as CSSProperties) : undefined;
  return (
    <span
      className={`swatch swatch--${size}${hex ? "" : " swatch--unknown"}`}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={hex ?? "No verified swatch color"}
    />
  );
}
