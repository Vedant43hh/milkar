"use client";

import { Printer } from "lucide-react";
import { Button } from "../ui/button";

/** Opens the browser's print dialog, where "Save as PDF" gives a PDF copy. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="secondary" icon={<Printer aria-hidden className="size-4" />} onClick={() => window.print()}>
      {label}
    </Button>
  );
}
