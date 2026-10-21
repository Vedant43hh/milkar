import { StaffShell } from "@/components/shell/shells";

export default function Layout({ children }: LayoutProps<"/admin">) {
  return <StaffShell portal="admin">{children}</StaffShell>;
}
