import { Suspense } from "react";
import { WrongPortal } from "@/components/shell/wrong-portal";
import { PageSkeleton } from "@/components/ui/skeleton";

// Someone signed in with another role opened this portal: say whose area it is, and link to theirs.
export default function Forbidden() {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <WrongPortal portal="manager" />
    </Suspense>
  );
}
