import { TabShell } from "@/components/shell/shells";

export default function TechnicianLayout({ children }: LayoutProps<"/tech">) {
  return <TabShell portal="tech">{children}</TabShell>;
}
