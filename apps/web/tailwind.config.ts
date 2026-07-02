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
        surface: "#f4f4f8",
        purple: "#6d35ee",
        "purple-soft": "#f4efff",
        "purple-deep": "#5b29d6",
        clay: "#6d35ee",
        linen: "#fbfbfd",
        moss: "#16a34a",
        orange: "#f97316",
        green: "#16a34a",
        red: "#ef4444",
        amber: "#d97706",
        blue: "#2563eb",
        teal: "#0d9488",
        pink: "#db2777",
        indigo: "#4f46e5",
        sky: "#0284c7",
        slatex: "#64748b"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "Aptos", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "Inter", "Aptos", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" }
        }
      },
      animation: {
        "fade-in": "fade-in 220ms cubic-bezier(0.16,1,0.3,1)",
        "scale-in": "scale-in 180ms cubic-bezier(0.16,1,0.3,1)"
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.375rem"
      },
      boxShadow: {
        card: "0 1px 2px rgba(18,20,30,0.04), 0 12px 32px rgba(18,20,30,0.05)",
        soft: "0 1px 2px rgba(18,20,30,0.04)",
        pop: "0 20px 60px rgba(18,20,30,0.12)",
        panel: "0 28px 80px rgba(18,20,30,0.08)"
      }
    }
  },
  plugins: []
}

export default config
