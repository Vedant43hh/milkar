import { ResidentShell } from "@/components/shell/shells";

export default function ResidentLayout({ children }: LayoutProps<"/">) {
  return <ResidentShell>{children}</ResidentShell>;
}
