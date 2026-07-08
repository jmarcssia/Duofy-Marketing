import type { Metadata } from "next"
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"]
})

// Display: uma grotesca com caráter para títulos e KPIs — a "voz" premium do console.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hanken",
  weight: ["500", "600", "700", "800"]
})

// Utility/numérico: instrumento de medição (IDs, tokens, scores, custos).
const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "600"]
})

export const metadata: Metadata = {
  title: "Duofy — Inteligência de Marketing",
  description: "Console de marketing com IA sob supervisão humana."
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${hanken.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
