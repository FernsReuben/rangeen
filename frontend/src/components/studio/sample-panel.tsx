import { useMemo, useState } from "react";
import {
  SAMPLE_SIZES,
  type ColorSample,
  type SampleSize,
} from "../../analysis/pixel-sampling.ts";
import {
  findClosestPencils,
  type PencilMatch,
} from "../../catalog/color-matching.ts";
import type { PencilCatalog } from "../../catalog/pencil-catalog.ts";
import {
  COLOR_SOURCE_NOTES,
  type RangeSelection,
} from "../../catalog/pencil-ranges.ts";
import { labToLch } from "../../color/color-conversion.ts";
import { useHoverSample } from "../../state/hover-sample-store.ts";
import { Copy, Check, Unlock } from "../icons.tsx";
import { PencilMatchList } from "./pencil-match-list.tsx";
import { PencilSwatch } from "./pencil-swatch.tsx";
import { RangeSelector } from "./range-selector.tsx";

interface SamplePanelProps {
  catalog: PencilCatalog;
  range: RangeSelection;
  onRangeChange: (range: RangeSelection) => void;
  hasImage: boolean;
  lockedSample: ColorSample | null;
  sampleSize: SampleSize;
  onSampleSizeChange: (size: SampleSize) => void;
  onUnlock: () => void;
  onAddMatch: (match: PencilMatch, sourceHex: string) => void;
}

const fmt = (n: number) =>
  Object.is(Math.round(n * 10) / 10, -0)
    ? "0.0"
    : (Math.round(n * 10) / 10).toFixed(1);

export function SamplePanel({
  catalog,
  range,
  onRangeChange,
  hasImage,
  lockedSample,
  sampleSize,
  onSampleSizeChange,
  onUnlock,
  onAddMatch,
}: SamplePanelProps) {
  const hover = useHoverSample();
  const sample = lockedSample ?? hover;
  const matches = useMemo(
    () => (sample ? findClosestPencils(sample.lab, catalog.matchable) : []),
    [sample, catalog],
  );

  return (
    <div className="sample-panel">
      <fieldset className="segmented">
        <legend>Sample size</legend>
        {SAMPLE_SIZES.map((size) => (
          <label key={size} className="segment">
            <input
              type="radio"
              name="sample-size"
              value={size}
              checked={sampleSize === size}
              onChange={() => onSampleSizeChange(size)}
            />
            <span>{size === 1 ? "1 px" : `${size}×${size}`}</span>
          </label>
        ))}
      </fieldset>

      {sample ? (
        <SampleReadout
          sample={sample}
          locked={lockedSample !== null}
          onUnlock={onUnlock}
        />
      ) : (
        <p className="empty-hint">
          {hasImage
            ? "Hover over the image to preview colors. Click to lock one."
            : "Add a reference image to start sampling colors."}
        </p>
      )}

      {lockedSample && hover && hover.hex !== lockedSample.hex && (
        <p className="hover-peek" aria-live="off">
          <PencilSwatch hex={hover.hex} size="sm" /> under cursor{" "}
          <code>{hover.hex}</code>
        </p>
      )}

      {sample && (
        <section aria-label="Closest pencils" className="matches">
          <h3 className="panel-heading">
            Closest pencils <span className="muted">· CIEDE2000</span>
          </h3>
          <RangeSelector value={range} onChange={onRangeChange} />
          <PencilMatchList
            catalog={catalog}
            matches={matches}
            showRange={range === "all"}
            onAdd={(m) => onAddMatch(m, sample.hex)}
          />
          <p className="fine-print">
            {sourceNotes(matches.map((m) => m.pencil.colorSource))} Swatches are
            approximations: paper, pressure, layering and lighting all change
            how a pencil looks on the page. Metallic pencils are never
            suggested.
          </p>
        </section>
      )}
    </div>
  );
}

function sourceNotes(sources: Array<string | null>): string {
  return [...new Set(sources)]
    .map((key) => (key ? COLOR_SOURCE_NOTES[key] : undefined))
    .filter((note): note is string => Boolean(note))
    .join(" ");
}

function SampleReadout({
  sample,
  locked,
  onUnlock,
}: {
  sample: ColorSample;
  locked: boolean;
  onUnlock: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const lch = labToLch(sample.lab);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 1200);
    } catch (error) {
      console.error("[sample] Clipboard write failed:", error);
    }
  };

  const rows: Array<[string, string]> = [
    ["HEX", sample.hex],
    ["RGB", `${sample.rgb.r}, ${sample.rgb.g}, ${sample.rgb.b}`],
    ["LAB", `${fmt(sample.lab.l)}, ${fmt(sample.lab.a)}, ${fmt(sample.lab.b)}`],
    ["LCh", `${fmt(lch.l)}, ${fmt(lch.c)}, ${Math.round(lch.h)}°`],
  ];

  return (
    <div className={`readout${locked ? " readout--locked" : ""}`}>
      <div className="readout-swatch" style={{ background: sample.hex }}>
        <span className="readout-state">{locked ? "Locked" : "Hover"}</span>
      </div>
      <dl className="readout-values">
        {rows.map(([label, value]) => (
          <div key={label} className="readout-row">
            <dt>{label}</dt>
            <dd>
              <code>{value}</code>
              <button
                type="button"
                className="icon-button icon-button--quiet"
                onClick={() => copy(value)}
                aria-label={`Copy ${label} ${value}`}
                title="Copy"
              >
                {copied === value ? <Check /> : <Copy />}
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <p className="readout-meta">
        {sample.x !== null && sample.y !== null ? (
          <>
            Pixel {sample.x}, {sample.y} ·{" "}
            {sample.size === 1
              ? "single pixel"
              : `${sample.size}×${sample.size} average`}
          </>
        ) : (
          "Color from image analysis"
        )}
        <span className="muted"> · LAB D65</span>
      </p>
      {locked && (
        <button
          type="button"
          className="button button--ghost"
          onClick={onUnlock}
        >
          <Unlock /> Unlock <kbd>Esc</kbd>
        </button>
      )}
    </div>
  );
}
