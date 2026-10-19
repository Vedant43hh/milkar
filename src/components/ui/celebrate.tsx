"use client";

import { PartyPopper } from "lucide-react";
import { useEffect } from "react";

const COLORS = ["var(--accent)", "var(--brand)", "var(--success)", "#f472b6", "#60a5fa"];
const PIECES = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 7) * 60,
  duration: 1100 + ((i * 53) % 700),
  rotate: (i * 47) % 360,
  color: COLORS[i % COLORS.length],
}));

/**
 * Celebration overlay for a tier unlock: a short CSS confetti burst and a message card.
 * Confetti is skipped when the user prefers reduced motion (the global reduced-motion rule).
 */
export function Celebration({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2800);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" role="status" aria-live="polite">
      {PIECES.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute -top-4 block h-3 w-2 rounded-sm motion-reduce:hidden"
          style={{
            left: `${p.left}%`,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration}ms ${p.delay}ms cubic-bezier(0.2, 0.6, 0.4, 1) forwards`,
          }}
        />
      ))}
      <div className="absolute inset-x-4 top-1/3 mx-auto flex max-w-sm animate-pop items-center gap-3 rounded-2xl border border-accent bg-surface p-4 shadow-raised">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
          <PartyPopper aria-hidden className="size-6" />
        </span>
        <p className="font-semibold text-fg">{message}</p>
      </div>
    </div>
  );
}
