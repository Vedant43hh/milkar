import { StaffShell } from "@/components/shell/shells";

export default function Layout({ children }: LayoutProps<"/captain">) {
  return <StaffShell area="captain">{children}</StaffShell>;
}
