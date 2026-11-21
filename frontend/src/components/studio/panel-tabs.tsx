import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabDefinition<Id extends string> {
  id: Id;
  label: string;
  badge?: string | number;
}

interface PanelTabsProps<Id extends string> {
  idPrefix: string;
  tabs: readonly TabDefinition<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  children: ReactNode;
}

/** WAI-ARIA tabs: arrow keys / Home / End move between tabs; only the active panel is rendered. */
export function PanelTabs<Id extends string>({ idPrefix, tabs, active, onChange, children }: PanelTabsProps<Id>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === active);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    buttonsRef.current[next]?.focus();
  };

  return (
    <div className="panel-tabs">
      <div role="tablist" className="tab-list" aria-label="Studio panels" onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttonsRef.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className="tab"
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
              {tab.badge !== undefined && <span className="tab-badge">{tab.badge}</span>}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}-panel-${active}`}
        aria-labelledby={`${idPrefix}-tab-${active}`}
        className="tab-panel"
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
