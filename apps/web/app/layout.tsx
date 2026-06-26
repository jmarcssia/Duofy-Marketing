import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "DUOFY V1",
  description: "Fundacao tecnica local-first da DUOFY V1"
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
