import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  analyzeImage,
  type DominantColor,
} from "../../analysis/image-analysis.ts";
import { downsamplePixels } from "../../analysis/pixel-buffer.ts";
import type { ColorSample, SampleSize } from "../../analysis/pixel-sampling.ts";
import type { PencilMatch } from "../../catalog/color-matching.ts";
import { catalogFor } from "../../catalog/pencil-ranges.ts";
import { labToRgb } from "../../color/color-conversion.ts";
import {
  useBackendStatus,
  type BackendStatus,
} from "../../hooks/use-backend-status.ts";
import {
  ACCEPT_ATTRIBUTE,
  ImageLoadError,
  MAX_WORKING_SIDE,
  firstImageFile,
  loadImageFile,
  type LoadedImage,
} from "../../image/image-loader.ts";
import { paletteActions, usePalettes } from "../../state/palette-store.ts";
import { usePencilRange } from "../../state/use-pencil-range.ts";
import { Upload, X } from "../icons.tsx";
import { AnalysisPanel, type AnalysisState } from "./analysis-panel.tsx";
import { pencilTitle } from "./pencil-match-list.tsx";
import { ImageCanvas } from "./image-canvas.tsx";
import { ImageDropzone } from "./image-dropzone.tsx";
import { PalettePanel } from "./palette-panel.tsx";
import { PanelTabs } from "./panel-tabs.tsx";
import { SamplePanel } from "./sample-panel.tsx";
import "./studio.css";
import "./studio-panels.css";

type TabId = "sample" | "analysis" | "palettes";

/** Longest side used for whole-image analysis. */
const ANALYSIS_MAX_SIDE = 512;

const STATUS_LABEL: Record<BackendStatus, string> = {
  checking: "checking server",
  online: "server online",
  offline: "server offline",
};

export function Studio({ id }: { id: string }) {
  const [range, setRange] = usePencilRange();
  const catalog = catalogFor(range);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lockedSample, setLockedSample] = useState<ColorSample | null>(null);
  const [sampleSize, setSampleSize] = useState<SampleSize>(3);
  const [tab, setTab] = useState<TabId>("sample");
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const [toast, setToast] = useState<string | null>(null);
  const { palettes, activeId } = usePalettes();
  const backend = useBackendStatus();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const loadTokenRef = useRef(0);

  const activePalette = palettes.find((p) => p.id === activeId);

  const openFile = useCallback(async (file: File) => {
    const token = ++loadTokenRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const loaded = await loadImageFile(file);
      if (token !== loadTokenRef.current) {
        loaded.bitmap.close();
        return;
      }
      setImage((previous) => {
        previous?.bitmap.close();
        return loaded;
      });
      setLockedSample(null);
      setAnalysis({ status: "running" });
      // Let the browser paint the image before the (synchronous) analysis runs.
      window.setTimeout(() => {
        if (token !== loadTokenRef.current) return;
        try {
          const result = analyzeImage(
            downsamplePixels(loaded.pixels, ANALYSIS_MAX_SIDE),
          );
          if (token === loadTokenRef.current)
            setAnalysis({ status: "done", result });
        } catch (error) {
          console.error("[studio] Analysis failed:", error);
          if (token === loadTokenRef.current) {
            setAnalysis({
              status: "error",
              message:
                error instanceof Error ? error.message : "Unknown error.",
            });
          }
        }
      }, 30);
    } catch (error) {
      if (token !== loadTokenRef.current) return;
      if (!(error instanceof ImageLoadError))
        console.error("[studio] Image load failed:", error);
      setLoadError(
        error instanceof Error
          ? error.message
          : "That image couldn't be opened.",
      );
    } finally {
      if (token === loadTokenRef.current) setLoading(false);
    }
  }, []);

  const closeImage = () => {
    loadTokenRef.current++;
    setImage((previous) => {
      previous?.bitmap.close();
      return null;
    });
    setLockedSample(null);
    setAnalysis({ status: "idle" });
    setLoadError(null);
  };

  // Paste an image from the clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const file = firstImageFile(event.clipboardData);
      if (file?.type.startsWith("image/")) {
        event.preventDefault();
        void openFile(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [openFile]);

  // Escape unlocks from anywhere except text fields.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      setLockedSample(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const addMatch = (match: PencilMatch, sourceHex: string) => {
    const result = paletteActions.addPencil(match.pencil.id, sourceHex);
    setToast(
      result.added
        ? `Added ${pencilTitle(match.pencil, range === "all")} to ${result.paletteName}`
        : `${pencilTitle(match.pencil, range === "all")} is already in ${result.paletteName}`,
    );
  };

  const pickDominantColor = (color: DominantColor) => {
    const { rgb } = labToRgb(color.lab);
    setLockedSample({
      x: null,
      y: null,
      size: 1,
      pixelCount: 0,
      rgb,
      hex: color.hex,
      lab: color.lab,
    });
    setTab("sample");
  };

  return (
    <section id={id} className="studio" aria-labelledby={`${id}-heading`}>
      <header className="studio-header">
        <div>
          <p className="studio-kicker">01 — studio</p>
          <h2 id={`${id}-heading`} className="studio-title">
            Reference
          </h2>
        </div>
        {image && (
          <div className="file-chip">
            <span className="file-name" title={image.fileName}>
              {image.fileName}
            </span>
            <span className="file-meta">
              {image.originalWidth}×{image.originalHeight}
              {image.scaledDown &&
                ` · working at ${image.pixels.width}×${image.pixels.height}`}
            </span>
            <button
              type="button"
              className="icon-button icon-button--quiet"
              onClick={() => replaceInputRef.current?.click()}
              aria-label="Replace image"
              title="Replace image"
            >
              <Upload />
            </button>
            <button
              type="button"
              className="icon-button icon-button--quiet"
              onClick={closeImage}
              aria-label="Close image"
              title="Close image"
            >
              <X />
            </button>
            <input
              ref={replaceInputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void openFile(file);
                e.target.value = "";
              }}
            />
          </div>
        )}
        <p
          className={`status-chip status-chip--${backend}`}
          role="status"
          title="Backend API status (not needed for sampling or analysis)"
        >
          <span className="status-dot" aria-hidden="true" />
          {STATUS_LABEL[backend]}
        </p>
      </header>

      <div className="studio-grid">
        <div
          className="studio-stage"
          style={
            image
              ? ({
                  "--image-aspect": image.pixels.width / image.pixels.height,
                } as CSSProperties)
              : undefined
          }
        >
          {image ? (
            <>
              <ImageCanvas
                image={image}
                sampleSize={sampleSize}
                lockedPoint={
                  lockedSample &&
                  lockedSample.x !== null &&
                  lockedSample.y !== null
                    ? { x: lockedSample.x, y: lockedSample.y }
                    : null
                }
                onLock={(s) => {
                  setLockedSample(s);
                  setTab("sample");
                }}
                onUnlock={() => setLockedSample(null)}
              />
              {loadError && (
                <p className="stage-error" role="alert">
                  {loadError}
                  <button
                    type="button"
                    className="icon-button icon-button--quiet"
                    onClick={() => setLoadError(null)}
                    aria-label="Dismiss"
                  >
                    <X />
                  </button>
                </p>
              )}
              {image.scaledDown && (
                <p className="stage-note">
                  Large image: sampling a {MAX_WORKING_SIDE}px working copy.
                </p>
              )}
            </>
          ) : (
            <ImageDropzone
              onFile={(f) => void openFile(f)}
              busy={loading}
              error={loadError}
            />
          )}
        </div>

        <aside className="studio-panel" aria-label="Color tools">
          <PanelTabs<TabId>
            idPrefix={id}
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "sample", label: "Sample" },
              { id: "analysis", label: "Analysis" },
              {
                id: "palettes",
                label: "Palettes",
                badge: activePalette?.entries.length || undefined,
              },
            ]}
          >
            {tab === "sample" && (
              <SamplePanel
                catalog={catalog}
                range={range}
                onRangeChange={setRange}
                hasImage={image !== null}
                lockedSample={lockedSample}
                sampleSize={sampleSize}
                onSampleSizeChange={setSampleSize}
                onUnlock={() => setLockedSample(null)}
                onAddMatch={addMatch}
              />
            )}
            {tab === "analysis" && (
              <AnalysisPanel state={analysis} onUseColor={pickDominantColor} />
            )}
            {tab === "palettes" && (
              <PalettePanel
                catalog={catalog}
                range={range}
                onRangeChange={setRange}
              />
            )}
          </PanelTabs>
        </aside>
      </div>

      <p
        className="toast"
        role="status"
        aria-live="polite"
        data-visible={toast ? "true" : "false"}
      >
        {toast}
      </p>
    </section>
  );
}
