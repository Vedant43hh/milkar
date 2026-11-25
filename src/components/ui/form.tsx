import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

// Fields: white with a 1px border dark enough to see when empty (3:1). Focus draws a 2px accent
// ring; a field with an error gets a red border as well as its written message.
const control =
  "min-h-11 w-full rounded-control border border-border-field bg-surface px-3 text-base text-fg placeholder:text-muted transition-colors focus:border-accent focus:outline-2 focus:outline-offset-0 focus:outline-accent aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-bg disabled:text-muted";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-fg", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "appearance-auto pr-8", className)} {...props} />;
}

/**
 * Label + control + hint/error, wired with ids for screen readers.
 * Pass the control as children with `id={id}`; Field adds aria attributes via the render prop.
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (aria: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A native checkbox styled as a switch: a grey track that turns the accent colour when on. Works without JavaScript inside forms. */
export function Switch({ label, className, ...props }: Omit<ComponentProps<"input">, "type"> & { label: ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-3", className)}>
      <span className="text-sm text-fg">{label}</span>
      <input type="checkbox" role="switch" className="peer sr-only" {...props} />
      <span
        aria-hidden
        className="relative h-6 w-11 shrink-0 rounded-full bg-border-field transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:border after:border-border after:bg-surface after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-5 peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      />
    </label>
  );
}

/** Radio-button group that looks like a segmented control: the chosen option is tinted with the accent. */
export function SegmentedControl<T extends string>({
  name,
  label,
  options,
  value,
  defaultValue,
  onChange,
}: {
  name: string;
  label: string;
  options: { value: T; label: ReactNode }[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-control border border-border bg-surface p-1">
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === undefined ? undefined : value === option.value}
              defaultChecked={defaultValue === undefined ? undefined : defaultValue === option.value}
              onChange={onChange ? () => onChange(option.value) : undefined}
              className="peer sr-only"
            />
            <span className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] px-2 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-fg peer-checked:bg-accent-soft peer-checked:font-medium peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
