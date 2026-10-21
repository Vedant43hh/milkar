import { StaffShell } from "@/components/shell/shells";

export default function Layout({ children }: LayoutProps<"/manager">) {
  return <StaffShell portal="manager">{children}</StaffShell>;
}
