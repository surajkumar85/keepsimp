import { AppShell } from "@/components/app-shell"
import { OfflineSupport } from "@/components/offline-support"
import { Toaster } from "@/components/ui/toast"

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <OfflineSupport />
      <AppShell>{children}</AppShell>
      <Toaster />
    </>
  )
}
