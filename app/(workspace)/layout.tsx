import { AppShell } from "@/components/app-shell"
import { OfflineSupport } from "@/components/offline-support"

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <OfflineSupport />
      <AppShell>{children}</AppShell>
    </>
  )
}
