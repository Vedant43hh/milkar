import { CircleAlert } from "lucide-react";
import { t, type MessageKey } from "@/i18n";
import { Banner } from "./display";

/** Validation errors for a whole form, announced to screen readers. */
export function FormErrors({ errors }: { errors?: MessageKey[] }) {
  if (!errors?.length) return null;
  return (
    <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
      {errors.length === 1 ? (
        t(errors[0])
      ) : (
        <ul className="list-disc space-y-0.5 pl-4">
          {errors.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      )}
    </Banner>
  );
}
