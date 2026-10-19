import { StaffShell } from "@/components/shell/shells";

export default function Layout({ children }: LayoutProps<"/admin">) {
  return <StaffShell area="admin">{children}</StaffShell>;
}
