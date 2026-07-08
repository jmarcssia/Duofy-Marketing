import { AppShell } from "@/components/app-shell"
import { ToastProvider } from "@/components/ui"
import { BrandProvider } from "@/lib/brand-context"

export default function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <BrandProvider>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </BrandProvider>
  )
}
