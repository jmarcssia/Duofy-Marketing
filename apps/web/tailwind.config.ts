import type { Config } from "tailwindcss"

/**
 * Sistema de design "Calm Intelligence" — um console de inteligência de marketing sereno e
 * editorial. Papel neutro levemente frio, uma tinta de marca roxo-índigo séria, um único acento
 * quente (signal) para atenção/Guardião, e semânticas harmonizadas. Os nomes de token antigos são
 * preservados (compatibilidade), com valores refinados.
 */
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Neutros — a tela vive quase toda aqui.
        ink: "#17161f", // texto principal: quase-preto com leve calor violeta (não #000)
        "ink-soft": "#3a3945", // texto forte secundário
        muted: "#6a6976", // legendas / texto terciário
        line: "#e8e7f0", // bordas 1px
        "line-strong": "#dad8e6", // divisórias / tabelas
        paper: "#faf9fd", // fundo do app (frio, calmo)
        raised: "#ffffff", // superfície de cartão
        panel: "#fcfbff", // insets/painéis quase-brancos
        surface: "#f2f1f8", // trilhos / sunken / base de skeleton

        // Tinta da marca (roxo-índigo mais sério que o #6d35ee anterior).
        brand: "#5a34e0",
        "brand-50": "#f1eeff",
        "brand-100": "#e4defb",
        "brand-600": "#5a34e0",
        "brand-700": "#4a29c0",
        purple: "#5a34e0", // alias de compat → brand
        "purple-soft": "#f1eeff",
        "purple-deep": "#4a29c0",
        clay: "#5a34e0", // alias legado → brand
        linen: "#faf9fd", // alias legado → paper

        // Acento-assinatura quente (atenção / Guardião / score baixo). Usar com parcimônia.
        signal: "#c17722",
        "signal-soft": "#fbf1e2",

        // Semânticas harmonizadas (calmas).
        green: "#1e8e5a",
        moss: "#1e8e5a",
        amber: "#b7791f",
        red: "#d8483f",
        blue: "#3e63c8",
        orange: "#c17722",
        teal: "#0d7d72",
        pink: "#c14a86",
        indigo: "#4a3fce",
        sky: "#2e73b8",
        slatex: "#6a6976"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "var(--font-hanken)",
          "var(--font-inter)",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" }
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "fade-in": "fade-in 220ms cubic-bezier(0.16,1,0.3,1)",
        "scale-in": "scale-in 180ms cubic-bezier(0.16,1,0.3,1)",
        "slide-up": "slide-up 240ms cubic-bezier(0.16,1,0.3,1)"
      },
      borderRadius: {
        lg: "0.625rem", // 10px — inputs/chips
        xl: "0.875rem", // 14px — botões/cards internos
        "2xl": "1.125rem", // 18px — cards de página
        "3xl": "1.5rem"
      },
      boxShadow: {
        // Elevação em 3 níveis: a maioria dos cards é "flat com borda" (card = quase sem sombra).
        soft: "0 1px 2px rgba(23,22,31,0.04)",
        card: "0 1px 2px rgba(23,22,31,0.04)",
        raised: "0 1px 2px rgba(23,22,31,0.05), 0 10px 28px rgba(23,22,31,0.06)",
        pop: "0 16px 48px rgba(23,22,31,0.12)",
        panel: "0 24px 64px rgba(23,22,31,0.10)"
      }
    }
  },
  plugins: []
}

export default config
