import { useId } from "react";
import {
  PENCIL_RANGES,
  type RangeSelection,
} from "../../catalog/pencil-ranges.ts";

interface RangeSelectorProps {
  value: RangeSelection;
  onChange: (value: RangeSelection) => void;
}

const OPTIONS: Array<{ value: RangeSelection; label: string }> = [
  ...PENCIL_RANGES.map((r) => ({
    value: r.id as RangeSelection,
    label: r.label,
  })),
  { value: "all", label: "Both" },
];

/** Picks which pencil range(s) matching and the catalog list use. */
export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  const name = useId();
  return (
    <fieldset className="segmented segmented--range">
      <legend>Pencil range</legend>
      {OPTIONS.map((option) => (
        <label key={option.value} className="segment">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
