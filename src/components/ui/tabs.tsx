"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

/** Accessible tabs (WAI-ARIA tabs pattern with arrow-key navigation). */
export function Tabs({ label, items, defaultTab }: { label: string; items: { id: string; label: ReactNode; content: ReactNode }[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab ?? items[0]?.id);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + items.length) % items.length;
    setActive(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-2 overflow-x-auto p-1">
        {items.map((item, i) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "min-h-11 rounded-control px-4 text-sm whitespace-nowrap transition-[box-shadow,color] duration-200 ease-in-out",
                selected ? "neu-pressed-sm font-medium text-brand" : "text-muted hover:text-fg hover:neu-raised-xs",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          hidden={item.id !== active}
          className="pt-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
