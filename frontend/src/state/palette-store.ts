import { useSyncExternalStore } from "react";

export interface PaletteEntry {
  pencilId: string;
  sourceHex: string | null;
  addedAt: string;
}

export interface Palette {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  entries: PaletteEntry[];
}

export interface PaletteState {
  palettes: Palette[];
  activeId: string | null;
  /** Last storage problem, shown to the user. */
  storageError: string | null;
}

const STORAGE_KEY = "rangeen.palettes.v1";
const HEX = /^#[0-9A-F]{6}$/;

type Listener = () => void;
const listeners = new Set<Listener>();
let state: PaletteState = { palettes: [], activeId: null, storageError: null };
let loaded = false;

function isEntry(v: unknown): v is PaletteEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.pencilId === "string" &&
    (e.sourceHex === null ||
      (typeof e.sourceHex === "string" && HEX.test(e.sourceHex))) &&
    typeof e.addedAt === "string"
  );
}

function isPalette(v: unknown): v is Palette {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.createdAt === "string" &&
    typeof p.updatedAt === "string" &&
    Array.isArray(p.entries) &&
    p.entries.every(isEntry)
  );
}

function load(): void {
  loaded = true;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("[palettes] Could not read saved palettes:", error);
    state = {
      ...state,
      storageError: "Saved palettes couldn't be read in this browser.",
    };
    return;
  }
  if (raw === null) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    const p = parsed as {
      version?: unknown;
      palettes?: unknown;
      activeId?: unknown;
    };
    if (
      p.version !== 1 ||
      !Array.isArray(p.palettes) ||
      !p.palettes.every(isPalette)
    ) {
      throw new Error("unexpected shape");
    }
    const palettes = p.palettes as Palette[];
    const activeId =
      typeof p.activeId === "string" &&
      palettes.some((x) => x.id === p.activeId)
        ? p.activeId
        : (palettes[0]?.id ?? null);
    state = { palettes, activeId, storageError: null };
  } catch (error) {
    // Keep the unreadable data so nothing is lost, and start fresh.
    console.error(
      "[palettes] Saved palettes are corrupt; starting fresh:",
      error,
    );
    try {
      window.localStorage.setItem(`${STORAGE_KEY}.corrupt-${Date.now()}`, raw);
    } catch {
      /* best effort only; the error is already reported below */
    }
    state = {
      palettes: [],
      activeId: null,
      storageError:
        "Saved palettes were unreadable, so a fresh list was started. The old data was kept in storage.",
    };
  }
}

function commit(next: Omit<PaletteState, "storageError">): void {
  let storageError: string | null = null;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        palettes: next.palettes,
        activeId: next.activeId,
      }),
    );
  } catch (error) {
    console.error("[palettes] Could not save palettes:", error);
    storageError =
      "Couldn't save palettes in this browser (storage may be full or disabled). Changes will be lost on reload.";
  }
  state = { ...next, storageError };
  for (const listener of listeners) listener();
}

function getState(): PaletteState {
  if (!loaded) load();
  return state;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePalettes(): PaletteState {
  return useSyncExternalStore(subscribe, getState, getState);
}

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

function updatePalette(id: string, change: (p: Palette) => Palette): void {
  const s = getState();
  commit({
    activeId: s.activeId,
    palettes: s.palettes.map((p) =>
      p.id === id ? { ...change(p), updatedAt: now() } : p,
    ),
  });
}

export const paletteActions = {
  create(name = "Untitled palette"): string {
    const s = getState();
    const palette: Palette = {
      id: newId(),
      name: name.trim() || "Untitled palette",
      createdAt: now(),
      updatedAt: now(),
      entries: [],
    };
    commit({ palettes: [...s.palettes, palette], activeId: palette.id });
    return palette.id;
  },

  rename(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    updatePalette(id, (p) => ({ ...p, name: trimmed }));
  },

  remove(id: string): void {
    const s = getState();
    const palettes = s.palettes.filter((p) => p.id !== id);
    commit({
      palettes,
      activeId: s.activeId === id ? (palettes[0]?.id ?? null) : s.activeId,
    });
  },

  setActive(id: string): void {
    const s = getState();
    if (s.palettes.some((p) => p.id === id))
      commit({ palettes: s.palettes, activeId: id });
  },

  /** Adds a pencil to the active palette, creating "My palette" if none exists. No duplicates. */
  addPencil(
    pencilId: string,
    sourceHex: string | null,
  ): { paletteName: string; added: boolean } {
    let s = getState();
    let id = s.activeId;
    if (!id) {
      id = paletteActions.create("My palette");
      s = getState();
    }
    const palette = s.palettes.find((p) => p.id === id)!;
    if (palette.entries.some((e) => e.pencilId === pencilId))
      return { paletteName: palette.name, added: false };
    updatePalette(id, (p) => ({
      ...p,
      entries: [...p.entries, { pencilId, sourceHex, addedAt: now() }],
    }));
    return { paletteName: palette.name, added: true };
  },

  removePencil(paletteId: string, pencilId: string): void {
    updatePalette(paletteId, (p) => ({
      ...p,
      entries: p.entries.filter((e) => e.pencilId !== pencilId),
    }));
  },
};
