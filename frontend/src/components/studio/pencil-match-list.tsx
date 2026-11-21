import {
  describeDeltaE,
  type PencilMatch,
} from "../../catalog/color-matching.ts";
import { formatLightfastness } from "../../catalog/lightfastness.ts";
import type { Pencil, PencilCatalog } from "../../catalog/pencil-catalog.ts";
import { rangeLabel } from "../../catalog/pencil-ranges.ts";
import { usePalettes } from "../../state/palette-store.ts";
import { Check, Plus } from "../icons.tsx";
import { PencilSwatch } from "./pencil-swatch.tsx";

interface PencilMatchListProps {
  catalog: PencilCatalog;
  matches: PencilMatch[];
  /** Show which range each pencil belongs to (when matching across ranges). */
  showRange: boolean;
  onAdd: (match: PencilMatch) => void;
}

export function PencilMatchList({
  catalog,
  matches,
  showRange,
  onAdd,
}: PencilMatchListProps) {
  const { palettes, activeId } = usePalettes();
  const active = palettes.find((p) => p.id === activeId);
  const inPalette = new Set(active?.entries.map((e) => e.pencilId));

  if (catalog.matchable.length === 0) {
    return (
      <div className="notice" role="note">
        <p className="notice-title">No pencil colors to match against yet</p>
        <p>
          The catalog lists {catalog.pencils.length} pencils, but none has a
          known swatch color
          {catalog.placeholderHexes.length > 0 && (
            <>
              {" "}
              (every entry uses the placeholder{" "}
              <code>{catalog.placeholderHexes.join(", ")}</code>)
            </>
          )}
          . Add sourced HEX values to the catalog data and matches will appear
          here automatically.
        </p>
      </div>
    );
  }

  return (
    <ol className="match-list" aria-label="Closest pencils">
      {matches.map((match, index) => {
        const { pencil, deltaE } = match;
        const added = inPalette.has(pencil.id);
        const label = `${pencilTitle(pencil, showRange)}`;
        return (
          <li key={pencil.id} className="match-row">
            <span className="match-rank" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <PencilSwatch hex={pencil.hex} />
            <span className="match-name">
              <span>
                <span className="pencil-number">{pencil.code}</span>{" "}
                {pencil.displayName}
              </span>
              <span className="match-meta">
                {showRange && (
                  <span className="range-tag">{rangeLabel(pencil)}</span>
                )}
                <span className="match-hex">{pencil.hex}</span>
                <LightfastnessBadge pencil={pencil} />
              </span>
            </span>
            <span
              className="match-delta"
              title={`CIEDE2000 ΔE ${deltaE.toFixed(2)}: ${describeDeltaE(deltaE)}`}
            >
              <span className="delta-value">ΔE {deltaE.toFixed(1)}</span>
              <span className="delta-label">{describeDeltaE(deltaE)}</span>
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => onAdd(match)}
              disabled={added}
              aria-label={
                added ? `${label} is in the palette` : `Add ${label} to palette`
              }
              title={added ? "In palette" : "Add to palette"}
            >
              {added ? <Check /> : <Plus />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function LightfastnessBadge({ pencil }: { pencil: Pencil }) {
  const lf = formatLightfastness(pencil);
  if (!lf) return null;
  return (
    <span
      className={`lightfastness lightfastness--${pencil.lightfastnessScale ?? "unknown"}`}
      title={lf.description}
    >
      <span className="visually-hidden">{lf.description}</span>
      <span aria-hidden="true">
        {lf.label}
        {lf.emptyStars && (
          <span className="lightfastness-empty">{lf.emptyStars}</span>
        )}
      </span>
    </span>
  );
}

/** "Luminance 001 White" or "101 White". */
export function pencilTitle(pencil: Pencil, withRange: boolean): string {
  return `${withRange ? `${rangeLabel(pencil)} ` : ""}${pencil.code} ${pencil.displayName}`;
}
