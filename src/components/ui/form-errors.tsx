import { CircleAlert } from "lucide-react";
import { Banner } from "./display";

/** Validation errors (already translated) for a whole form, announced to screen readers. */
export function FormErrors({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
      {errors.length === 1 ? (
        errors[0]
      ) : (
        <ul className="list-disc space-y-0.5 pl-4">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </Banner>
  );
}
