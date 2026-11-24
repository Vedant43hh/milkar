import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

// Soft UI: every button is the page colour and raised; it sinks a little on hover and is pressed
// in while held. What a button does shows in its text colour (primary is the portal's colour).
const variants = {
  primary: "neu-raised-sm font-semibold text-brand hover:neu-raised-xs active:neu-pressed-sm",
  secondary: "neu-raised-sm text-fg hover:neu-raised-xs active:neu-pressed-sm",
  ghost: "text-brand hover:neu-raised-xs active:neu-pressed-sm",
  dangerGhost: "text-danger hover:neu-raised-xs active:neu-pressed-sm",
  danger: "neu-raised-sm font-semibold text-danger hover:neu-raised-xs active:neu-pressed-sm",
  accent: "neu-raised-sm font-semibold text-accent hover:neu-raised-xs active:neu-pressed-sm",
} as const;

const sizes = {
  md: "min-h-11 min-w-11 px-4 text-[0.95rem]",
  sm: "min-h-11 min-w-11 px-3 text-sm",
  lg: "min-h-12 min-w-12 px-5 text-base",
} as const;

export type ButtonVariant = keyof typeof variants;

export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: { variant?: ButtonVariant; size?: keyof typeof sizes; block?: boolean; className?: string } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-control font-medium transition-[box-shadow,color,opacity] duration-200 ease-in-out disabled:pointer-events-none disabled:opacity-50 disabled:neu-flat",
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

/** Round, raised icon-only button (44 px). `label` is required for screen readers. */
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
        "inline-flex size-11 items-center justify-center rounded-full text-muted neu-raised-sm transition-[box-shadow,color] duration-200 ease-in-out hover:text-fg hover:neu-raised-xs active:neu-pressed-sm disabled:pointer-events-none disabled:opacity-50 disabled:neu-flat",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
