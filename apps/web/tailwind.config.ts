import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#11131a",
        muted: "#6b7280",
        line: "#e9e8ef",
        panel: "#fbfbfd",
        purple: "#6d35ee",
        "purple-soft": "#f4efff",
        clay: "#6d35ee",
        linen: "#fbfbfd",
        moss: "#16a34a",
        orange: "#f97316",
        green: "#16a34a",
        red: "#ef4444"
      },
      fontFamily: {
        sans: ["Inter", "Aptos", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter", "Aptos", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
}

export default config
