import { TabShell } from "@/components/shell/shells";

export default function ResidentLayout({ children }: LayoutProps<"/app">) {
  return <TabShell portal="app">{children}</TabShell>;
}
