import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const variants = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover shadow-card",
  secondary: "border border-border-strong bg-surface text-fg hover:bg-surface-2",
  ghost: "text-brand hover:bg-brand-soft",
  danger: "bg-danger text-white hover:opacity-90 dark:text-surface",
  accent: "bg-accent text-accent-fg hover:brightness-95 shadow-card",
} as const;

const sizes = {
  md: "min-h-11 px-4 text-[0.95rem]",
  sm: "min-h-11 px-3 text-sm",
  lg: "min-h-12 px-5 text-base",
} as const;

export type ButtonVariant = keyof typeof variants;

export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: { variant?: ButtonVariant; size?: keyof typeof sizes; block?: boolean; className?: string } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-control font-medium transition-[background-color,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
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

/** Square icon-only button. `label` is required for screen readers. */
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
        "inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
