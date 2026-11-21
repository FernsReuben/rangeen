import { useSyncExternalStore } from "react";
import type { ColorSample } from "../analysis/pixel-sampling.ts";

type Listener = () => void;

let current: ColorSample | null = null;
const listeners = new Set<Listener>();

export function setHoverSample(sample: ColorSample | null): void {
  if (sample === current) return;
  if (
    sample &&
    current &&
    sample.hex === current.hex &&
    sample.x === current.x &&
    sample.y === current.y
  )
    return;
  current = sample;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHoverSample(): ColorSample | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
