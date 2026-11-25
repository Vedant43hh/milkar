import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

// Flat buttons: no shadows, no lift or scale. Hover only changes the background colour.
const variants = {
  /** The main action on a screen: filled with the accent colour. */
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-border bg-surface text-fg hover:bg-surface-hover",
  ghost: "text-accent hover:bg-surface-hover",
  dangerGhost: "text-danger hover:bg-danger-soft",
  danger: "bg-danger text-accent-fg hover:bg-danger/90",
} as const;

// 44 px tall everywhere: these are tapped on phones.
const sizes = {
  md: "min-h-11 min-w-11 px-4 text-sm",
  sm: "min-h-11 min-w-11 px-3 text-sm",
  lg: "min-h-11 min-w-11 px-5 text-base",
} as const;

export type ButtonVariant = keyof typeof variants;

export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: { variant?: ButtonVariant; size?: keyof typeof sizes; block?: boolean; className?: string } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    block && "w-full",
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant, size, block, loading, icon, className, children, type = "submit", disabled, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: keyof typeof sizes; block?: boolean; icon?: ReactNode }) {
  return (
    <Link className={buttonClasses({ variant, size, block, className })} {...props}>
      {icon}
      {children}
    </Link>
  );
}

/** Square icon-only button (44 px). `label` is required for screen readers. */
export function IconButton({
  label,
  className,
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
