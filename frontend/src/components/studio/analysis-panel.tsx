import { ANALYSIS_THRESHOLDS, type DominantColor, type Histogram, type ImageAnalysis } from "../../analysis/image-analysis.ts";
import { labToRgb, rgbToHex } from "../../color/color-conversion.ts";

export type AnalysisState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ImageAnalysis }
  | { status: "error"; message: string };

interface AnalysisPanelProps {
  state: AnalysisState;
  onUseColor: (color: DominantColor) => void;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const grayForL = (l: number) => rgbToHex(labToRgb({ l, a: 0, b: 0 }).rgb);

export function AnalysisPanel({ state, onUseColor }: AnalysisPanelProps) {
  if (state.status === "idle") return <p className="empty-hint">Add a reference image to analyze its colors.</p>;
  if (state.status === "running") {
    return (
      <p className="empty-hint" role="status">
        <span className="spinner" aria-hidden="true" /> Analyzing colors…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className="notice notice--error" role="alert">
        <p className="notice-title">Analysis failed</p>
        <p>{state.message}</p>
      </div>
    );
  }

  const a = state.result;
  const T = ANALYSIS_THRESHOLDS;

  return (
    <div className="analysis-panel">
      <section aria-labelledby="char-heading">
        <h3 id="char-heading" className="panel-heading">Palette character</h3>
        <ul className="trait-list">
          {a.characteristics.map((c) => (
            <li key={c.id} className="trait">
              <span className="trait-label">{c.label}</span>
              <span className="trait-reason">{c.reason}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="dominant-heading">
        <h3 id="dominant-heading" className="panel-heading">Dominant colors</h3>
        <div className="dominant-strip" aria-hidden="true">
          {a.dominantColors.map((c) => (
            <span key={c.hex + c.share} style={{ background: c.hex, flexGrow: c.share }} />
          ))}
        </div>
        <ul className="dominant-list">
          {a.dominantColors.map((c) => (
            <li key={c.hex + c.share}>
              <button
                type="button"
                className="dominant-chip"
                onClick={() => onUseColor(c)}
                title="Use this color to find pencils"
              >
                <span className="dominant-swatch" style={{ background: c.hex }} />
                <span className="dominant-hex">{c.hex}</span>
                <span className="dominant-share">{pct(c.share)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="fine-print">Select a color to see its closest pencils.</p>
      </section>

      <section aria-labelledby="temp-heading">
        <h3 id="temp-heading" className="panel-heading">Temperature</h3>
        <StackedBar
          parts={[
            { label: "Warm", value: a.temperature.warm, className: "seg-warm" },
            { label: "Neutral", value: a.temperature.neutral, className: "seg-neutral" },
            { label: "Cool", value: a.temperature.cool, className: "seg-cool" },
          ]}
        />
      </section>

      <section aria-labelledby="value-heading">
        <h3 id="value-heading" className="panel-heading">Value</h3>
        <BarChart
          histogram={a.value.histogram}
          colorFor={(edge) => grayForL(edge + 5)}
          labelFor={(edge) => `L* ${edge}–${edge + 10}`}
        />
        <StackedBar
          parts={[
            { label: "Shadows", value: a.value.shadows, className: "seg-shadow" },
            { label: "Midtones", value: a.value.midtones, className: "seg-mid" },
            { label: "Highlights", value: a.value.highlights, className: "seg-high" },
          ]}
        />
        <Stats
          items={[
            ["Mean L*", r1(a.value.mean)],
            ["Median L*", r1(a.value.median)],
          ]}
        />
      </section>

      <section aria-labelledby="sat-heading">
        <h3 id="sat-heading" className="panel-heading">Saturation (chroma C*)</h3>
        <BarChart
          histogram={a.chroma.histogram}
          colorFor={(edge) => rgbToHex(labToRgb({ l: 60, a: Math.min(edge + 5, 75) * 0.94, b: Math.min(edge + 5, 75) * -0.34 }).rgb)}
          labelFor={(edge, i, last) => (i === last ? `C* ≥ ${edge}` : `C* ${edge}–${edge + 10}`)}
        />
        <StackedBar
          parts={[
            { label: "Muted", value: a.chroma.muted, className: "seg-muted" },
            { label: "Moderate", value: a.chroma.moderate, className: "seg-moderate" },
            { label: "Vivid", value: a.chroma.vivid, className: "seg-vivid" },
          ]}
        />
        <Stats
          items={[
            ["Mean C*", r1(a.chroma.mean)],
            ["Median C*", r1(a.chroma.median)],
          ]}
        />
      </section>

      <section aria-labelledby="contrast-heading">
        <h3 id="contrast-heading" className="panel-heading">Contrast</h3>
        <div className="tonal-range" aria-hidden="true">
          <span
            className="tonal-range-fill"
            style={{
              left: `${a.contrast.p5}%`,
              width: `${Math.max(0.5, a.contrast.tonalRange)}%`,
              background: `linear-gradient(90deg, ${grayForL(a.contrast.p5)}, ${grayForL(a.contrast.p95)})`,
            }}
          />
        </div>
        <Stats
          items={[
            ["Tonal range", r1(a.contrast.tonalRange)],
            ["L* p5 → p95", `${r1(a.contrast.p5)} → ${r1(a.contrast.p95)}`],
            ["RMS (σ L*)", r1(a.contrast.stdDev)],
            ["Darkest / lightest", `${r1(a.contrast.min)} / ${r1(a.contrast.max)}`],
          ]}
        />
      </section>

      <details className="method">
        <summary>How these numbers are measured</summary>
        <p>
          Measured on a {a.analysedWidth}×{a.analysedHeight} linear-light downsample ({a.pixelCount.toLocaleString()} opaque
          pixels), converted to CIELAB (D65). The same image always gives the same results.
        </p>
        <ul>
          <li>Neutral: C* below {T.neutralChroma}. Warm hues: h ≥ {T.warmHueFrom}° or h &lt; {T.warmHueTo}°; the rest are cool.</li>
          <li>Shadows: L* below {r1(T.shadowMax)}; highlights: L* {r1(T.highlightMin)} and above.</li>
          <li>Muted: C* below {T.mutedChromaMax}; vivid: C* {T.vividChromaMin} and above.</li>
          <li>Tonal range is L* at the 95th minus the 5th percentile. Low contrast: below {T.lowContrastRange}; high: {T.highContrastRange}+.</li>
          <li>Low key: mean L* below {T.lowKeyMeanL}; high key: above {T.highKeyMeanL}.</li>
          <li>Dominant colors: weighted k-means in LAB with fixed initialisation; colors within ΔE00 4 are merged.</li>
        </ul>
        <p>These thresholds are this app's conventions, not industry standards.</p>
      </details>
    </div>
  );
}

function StackedBar({ parts }: { parts: Array<{ label: string; value: number; className: string }> }) {
  return (
    <div className="stacked">
      <div className="stacked-bar" aria-hidden="true">
        {parts.map((p) => (
          <span key={p.label} className={p.className} style={{ flexGrow: p.value }} />
        ))}
      </div>
      <ul className="stacked-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <span className={`legend-dot ${p.className}`} aria-hidden="true" />
            {p.label} <strong>{pct(p.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarChart({
  histogram,
  colorFor,
  labelFor,
}: {
  histogram: Histogram;
  colorFor: (edge: number) => string;
  labelFor: (edge: number, index: number, lastIndex: number) => string;
}) {
  const max = Math.max(...histogram.shares, 1e-9);
  const last = histogram.edges.length - 1;
  return (
    <ul className="bar-chart">
      {histogram.edges.map((edge, i) => {
        const share = histogram.shares[i] ?? 0;
        return (
          <li key={edge} title={`${labelFor(edge, i, last)}: ${pct(share)}`}>
            <span className="visually-hidden">
              {labelFor(edge, i, last)}: {pct(share)}
            </span>
            <span
              className="bar"
              aria-hidden="true"
              style={{ height: `${(share / max) * 100}%`, background: colorFor(edge) }}
            />
          </li>
        );
      })}
    </ul>
  );
}

function Stats({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="stats">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
