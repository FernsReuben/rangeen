import { useMemo, useState } from "react";
import type { Pencil, PencilCatalog } from "../../catalog/pencil-catalog.ts";
import {
  ALL_PENCILS,
  rangeLabel,
  type RangeSelection,
} from "../../catalog/pencil-ranges.ts";
import {
  paletteActions,
  usePalettes,
  type Palette,
} from "../../state/palette-store.ts";
import {
  Check,
  Copy,
  Pencil as PencilIcon,
  Plus,
  Search,
  Trash2,
  X,
} from "../icons.tsx";
import { LightfastnessBadge, pencilTitle } from "./pencil-match-list.tsx";
import { PencilSwatch } from "./pencil-swatch.tsx";
import { RangeSelector } from "./range-selector.tsx";

interface PalettePanelProps {
  /** Catalog shown in the browser below the palette (the selected range). */
  catalog: PencilCatalog;
  range: RangeSelection;
  onRangeChange: (range: RangeSelection) => void;
}

export function PalettePanel({
  catalog,
  range,
  onRangeChange,
}: PalettePanelProps) {
  const { palettes, activeId, storageError } = usePalettes();
  const active = palettes.find((p) => p.id === activeId) ?? null;
  // Palettes can mix ranges, so entries resolve against every known pencil.
  const byId = useMemo(
    () => new Map(ALL_PENCILS.pencils.map((p) => [p.id, p])),
    [],
  );

  return (
    <div className="palette-panel">
      {storageError && (
        <div className="notice notice--error" role="alert">
          <p>{storageError}</p>
        </div>
      )}

      <div className="palette-switcher">
        <label className="field">
          <span className="field-label">Palette</span>
          <select
            value={activeId ?? ""}
            onChange={(e) => paletteActions.setActive(e.target.value)}
            disabled={palettes.length === 0}
          >
            {palettes.length === 0 && <option value="">No palettes yet</option>}
            {palettes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.entries.length})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button"
          onClick={() =>
            paletteActions.create(`Palette ${palettes.length + 1}`)
          }
        >
          <Plus /> New
        </button>
      </div>

      {active ? (
        <ActivePalette palette={active} byId={byId} />
      ) : (
        <p className="empty-hint">
          Create a palette, or add a pencil from the matches or the catalog
          below.
        </p>
      )}

      <CatalogBrowser
        catalog={catalog}
        active={active}
        range={range}
        onRangeChange={onRangeChange}
      />
    </div>
  );
}

function ActivePalette({
  palette,
  byId,
}: {
  palette: Palette;
  byId: Map<string, Pencil>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(palette.name);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const entries = palette.entries
    .map((e) => ({ entry: e, pencil: byId.get(e.pencilId) }))
    .sort(
      (a, b) =>
        (a.pencil?.productLine ?? "~").localeCompare(
          b.pencil?.productLine ?? "~",
        ) || (a.pencil?.number ?? 1e9) - (b.pencil?.number ?? 1e9),
    );

  const copyList = async () => {
    const text = [
      palette.name,
      ...entries.map(({ entry, pencil }) =>
        pencil
          ? `${pencil.brand} ${pencilTitle(pencil, true)}`
          : `Unknown pencil (${entry.pencilId})`,
      ),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error("[palettes] Clipboard write failed:", error);
    }
  };

  return (
    <section className="active-palette" aria-label={`Palette ${palette.name}`}>
      <header className="palette-header">
        {editing ? (
          <form
            className="rename-form"
            onSubmit={(e) => {
              e.preventDefault();
              paletteActions.rename(palette.id, name);
              setEditing(false);
            }}
          >
            <input
              aria-label="Palette name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
            />
            <button
              type="submit"
              className="icon-button"
              aria-label="Save name"
            >
              <Check />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Cancel rename"
              onClick={() => setEditing(false)}
            >
              <X />
            </button>
          </form>
        ) : (
          <>
            <h3 className="palette-title">{palette.name}</h3>
            <button
              type="button"
              className="icon-button icon-button--quiet"
              aria-label="Rename palette"
              onClick={() => {
                setName(palette.name);
                setEditing(true);
              }}
            >
              <PencilIcon />
            </button>
          </>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="icon-button icon-button--quiet"
          onClick={copyList}
          disabled={entries.length === 0}
          aria-label="Copy pencil list"
          title="Copy pencil list"
        >
          {copied ? <Check /> : <Copy />}
        </button>
        {confirmDelete ? (
          <span className="confirm">
            Delete?
            <button
              type="button"
              className="button button--danger"
              onClick={() => paletteActions.remove(palette.id)}
            >
              Delete
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setConfirmDelete(false)}
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="icon-button icon-button--quiet"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete palette"
            title="Delete palette"
          >
            <Trash2 />
          </button>
        )}
      </header>

      {entries.length === 0 ? (
        <p className="empty-hint">
          Empty. Add pencils from the sample matches or the catalog.
        </p>
      ) : (
        <ul className="palette-grid">
          {entries.map(({ entry, pencil }) => (
            <li key={entry.pencilId} className="palette-card">
              <PencilSwatch hex={pencil?.hex ?? null} size="lg" />
              <span className="palette-card-name">
                <span className="pencil-number">{pencil?.code ?? "?"}</span>
                {pencil?.displayName ?? "Pencil no longer in catalog"}
                {pencil && (
                  <span className="palette-card-range">
                    {rangeLabel(pencil)}
                  </span>
                )}
              </span>
              {entry.sourceHex && (
                <span
                  className="palette-card-source"
                  title="Sampled color this pencil was matched to"
                >
                  <span
                    className="source-dot"
                    style={{ background: entry.sourceHex }}
                  />
                  {entry.sourceHex}
                </span>
              )}
              <button
                type="button"
                className="icon-button icon-button--quiet palette-card-remove"
                onClick={() =>
                  paletteActions.removePencil(palette.id, entry.pencilId)
                }
                aria-label={`Remove ${pencil?.displayName ?? "pencil"} from palette`}
              >
                <X />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="fine-print">Saved in this browser only.</p>
    </section>
  );
}

function CatalogBrowser({
  catalog,
  active,
  range,
  onRangeChange,
}: {
  catalog: PencilCatalog;
  active: Palette | null;
  range: RangeSelection;
  onRangeChange: (range: RangeSelection) => void;
}) {
  const [query, setQuery] = useState("");
  const inPalette = new Set(active?.entries.map((e) => e.pencilId));
  const q = query.trim().toLowerCase();
  const results = q
    ? catalog.pencils.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.formerNames.some((n) => n.toLowerCase().includes(q)) ||
          p.code.startsWith(q) ||
          String(p.number).startsWith(q) ||
          p.pigments.some((pig) => pig.toLowerCase() === q),
      )
    : catalog.pencils;

  return (
    <section className="catalog-browser" aria-labelledby="catalog-heading">
      <h3 id="catalog-heading" className="panel-heading">
        Catalog{" "}
        <span className="muted">
          · {catalog.pencils.length} pencils · {catalog.matchable.length} with
          swatch colors
        </span>
      </h3>
      <RangeSelector value={range} onChange={onRangeChange} />
      <label className="search">
        <Search />
        <input
          type="search"
          placeholder="Search name, number or pigment"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the pencil catalog"
        />
      </label>
      <ul className="catalog-list">
        {results.map((p) => {
          const added = inPalette.has(p.id);
          return (
            <li key={p.id} className="catalog-row">
              <PencilSwatch hex={p.hex} size="sm" />
              <span className="pencil-number">{p.code}</span>
              <span
                className="catalog-name"
                title={
                  [
                    p.formerNames.length
                      ? `Formerly ${p.formerNames.join(", ")}`
                      : "",
                    p.pigments.length
                      ? `Pigments: ${p.pigments.join(", ")}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
              >
                {p.displayName}
                {range === "all" && (
                  <span className="range-tag">{rangeLabel(p)}</span>
                )}
                {p.metallic && (
                  <span
                    className="issue-tag issue-tag--quiet"
                    title="Metallic: no flat color, so it is never suggested as a match"
                  >
                    metallic
                  </span>
                )}
                {p.formerNames.length > 0 && (
                  <span className="former-name">
                    formerly {p.formerNames.join(", ")}
                  </span>
                )}
                {p.issues.includes("duplicate-name") && (
                  <span
                    className="issue-tag"
                    title="Another pencil in the source file has the same name"
                  >
                    duplicate name
                  </span>
                )}
              </span>
              <LightfastnessBadge pencil={p} />
              <button
                type="button"
                className="icon-button icon-button--quiet"
                disabled={added}
                onClick={() => paletteActions.addPencil(p.id, null)}
                aria-label={
                  added
                    ? `${pencilTitle(p, range === "all")} is in the palette`
                    : `Add ${pencilTitle(p, range === "all")} to palette`
                }
              >
                {added ? <Check /> : <Plus />}
              </button>
            </li>
          );
        })}
        {results.length === 0 && (
          <li className="empty-hint">No pencils match “{query}”.</li>
        )}
      </ul>
    </section>
  );
}
