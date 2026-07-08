import { type Page, expect, test } from "@playwright/test"

import { login } from "./fixtures"

// Smoke test do golden path: cada item da navegação principal carrega sem erro de console
// e mostra um marco de que renderizou de verdade — pega quebras de import/render que o
// `next build` não vê em runtime (ex.: hooks que só falham com dados reais da API, erros de
// hidratação). A maioria das páginas tem um <h1>/<h2> de título; /admin não tem heading
// próprio (só a barra de abas), por isso usa um locator dedicado.
const NAV_PAGES: Array<{ path: string; landmark: (page: Page) => ReturnType<Page["getByRole"]> }> = [
  { path: "/operations", landmark: (p) => p.getByRole("heading", { name: "Central de Operações" }) },
  { path: "/research", landmark: (p) => p.getByRole("heading", { name: "Agente de Pesquisa" }) },
  { path: "/content", landmark: (p) => p.getByRole("heading", { name: "Cocriação", exact: false }) },
  { path: "/calendar", landmark: (p) => p.getByRole("heading", { name: "Calendário", exact: false }) },
  { path: "/approvals", landmark: (p) => p.getByRole("heading", { name: "Revisão", exact: false }) },
  { path: "/publicacoes", landmark: (p) => p.getByRole("heading", { name: "Publicações", exact: false }) },
  { path: "/relatorios", landmark: (p) => p.getByRole("heading", { name: "Relatórios", exact: false }) },
  { path: "/admin", landmark: (p) => p.getByRole("button", { name: "Agentes", exact: true }) },
  { path: "/memory", landmark: (p) => p.getByRole("heading", { name: "Memória", exact: false }) }
]

test.describe("Navegação principal (golden path)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  for (const { path, landmark } of NAV_PAGES) {
    test(`${path} carrega sem erros de console`, async ({ page }) => {
      // Ruído inofensivo específico do modo dev do Next (RSC payload cai para navegação
      // client-side normal) — não indica um bug da aplicação; não deve reprovar o teste.
      const isDevNoise = (text: string) => /Failed to fetch RSC payload/.test(text)

      const consoleErrors: string[] = []
      page.on("console", (msg) => {
        if (msg.type() === "error" && !isDevNoise(msg.text())) consoleErrors.push(msg.text())
      })
      page.on("pageerror", (err) => {
        if (!isDevNoise(err.message)) consoleErrors.push(err.message)
      })

      await page.goto(path)
      // Timeout generoso: no primeiro acesso a cada rota, o Next em dev mode ainda compila a
      // página sob demanda (visto na prática — bem além do que uma página já compilada leva).
      await expect(landmark(page).first()).toBeVisible({ timeout: 30_000 })

      expect(consoleErrors, `erros de console em ${path}:\n${consoleErrors.join("\n")}`).toEqual([])
    })
  }
})
