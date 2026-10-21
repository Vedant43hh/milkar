// Simple line illustrations for "How it works", drawn with the theme's colours (no image files).

export function OpenIllustration() {
  return (
    <svg aria-hidden viewBox="0 0 120 80" className="h-20 w-auto">
      <rect x="18" y="18" width="44" height="56" rx="4" className="fill-surface-2 stroke-border-strong" strokeWidth="2" />
      {[28, 40, 52].map((y) => [26, 38, 50].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" rx="1" className="fill-brand/40" />))}
      <rect x="34" y="62" width="12" height="12" rx="2" className="fill-brand/60" />
      <path d="M70 26h36a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H86l-8 8v-8h-8a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6z" className="fill-accent-soft stroke-accent" strokeWidth="2" />
      <path d="M78 38h22M78 44h14" className="stroke-accent-soft-fg" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function JoinIllustration() {
  return (
    <svg aria-hidden viewBox="0 0 120 80" className="h-20 w-auto">
      {[20, 44, 68, 92].map((cx, i) => (
        <g key={cx} opacity={i === 3 ? 0.45 : 1}>
          <circle cx={cx} cy="26" r="8" className="fill-brand/70" />
          <path d={`M${cx - 12} 50a12 12 0 0 1 24 0`} className="fill-brand/30" />
        </g>
      ))}
      <rect x="12" y="60" width="96" height="8" rx="4" className="fill-surface-2" />
      <rect x="12" y="60" width="70" height="8" rx="4" className="fill-accent" />
    </svg>
  );
}

export function DeliverIllustration() {
  return (
    <svg aria-hidden viewBox="0 0 120 80" className="h-20 w-auto">
      <rect x="8" y="28" width="52" height="30" rx="4" className="fill-brand/70" />
      <path d="M60 36h18l12 12v10H60z" className="fill-brand/50" />
      <circle cx="24" cy="60" r="7" className="fill-fg" />
      <circle cx="74" cy="60" r="7" className="fill-fg" />
      <rect x="88" y="14" width="26" height="20" rx="4" className="fill-success/20 stroke-success" strokeWidth="2" />
      <circle cx="101" cy="24" r="5" className="fill-success" />
    </svg>
  );
}
