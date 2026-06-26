import { AppShell } from "@/components/app-shell"
import { BrandProvider } from "@/lib/brand-context"

export default function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <BrandProvider>
      <AppShell>{children}</AppShell>
    </BrandProvider>
  )
}
