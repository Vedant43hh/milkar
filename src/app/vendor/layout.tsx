import { StaffShell } from "@/components/shell/shells";

export default function Layout({ children }: LayoutProps<"/vendor">) {
  return <StaffShell area="vendor">{children}</StaffShell>;
}
