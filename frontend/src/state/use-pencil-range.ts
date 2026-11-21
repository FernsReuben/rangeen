import { useCallback, useState } from "react";
import {
  isRangeSelection,
  type RangeSelection,
} from "../catalog/pencil-ranges.ts";

const STORAGE_KEY = "rangeen.pencil-range.v1";
const DEFAULT: RangeSelection = "polychromos";

function read(): RangeSelection {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isRangeSelection(value) ? value : DEFAULT;
  } catch (error) {
    console.warn("[pencil-range] Could not read the saved range:", error);
    return DEFAULT;
  }
}

/** Which pencil range(s) to match against, remembered in this browser. */
export function usePencilRange(): [
  RangeSelection,
  (next: RangeSelection) => void,
] {
  const [range, setRange] = useState<RangeSelection>(read);
  const update = useCallback((next: RangeSelection) => {
    setRange(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      console.warn("[pencil-range] Could not save the range:", error);
    }
  }, []);
  return [range, update];
}
