import { type Page, expect } from "@playwright/test"

// Credenciais de admin do ambiente de dev local (seed padrão do docker-compose.yml —
// não são segredos de produção). Sobrescrevíveis via env para outros ambientes.
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@duofy.com.br"
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin123456"

/**
 * Faz login pela UI real (não injeta cookie) e aguarda o redirecionamento pós-login assentar
 * por completo antes de devolver o controle ao teste.
 *
 * O submit do formulário dispara uma transição client-side (`router.replace`), não um reload.
 * BrandContext busca /api/brands no mount e, quando a marca é selecionada, isso dispara uma
 * SEGUNDA onda de fetches nas páginas (as mesmas listas recarregam agora com `brand_slug` na
 * query). Se o teste navegar (`page.goto`) — uma navegação "dura" — enquanto essa segunda onda
 * ainda está em voo, os fetches são cancelados (`net::ERR_ABORTED`); como o fetch de marca só
 * roda uma vez no mount sem retry, a página seguinte pode nunca conseguir selecionar marca.
 * `networkidle` garante que as duas ondas (inicial + pós-seleção de marca) já assentaram.
 */
export async function login(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto("/login")
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
  await expect(page.getByRole("link", { name: "Operações" })).toBeVisible({ timeout: 15_000 })
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
}
