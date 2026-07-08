import { expect, test } from "@playwright/test"

import { ADMIN_EMAIL, login } from "./fixtures"

test.describe("Autenticação", () => {
  test("login com credenciais válidas leva à área autenticada", async ({ page }) => {
    await login(page)
    // Pós-login cai em /operations (ou na página pedida via ?next=) — em qualquer caso,
    // sai do /login e mostra a navegação principal do app-shell.
    await expect(page.getByRole("link", { name: "Operações" })).toBeVisible()
  })

  test("login com senha inválida mostra erro e permanece na tela", async ({ page }) => {
    await page.goto("/login")
    await page.locator("#email").fill(ADMIN_EMAIL)
    await page.locator("#password").fill("senha-errada-123")
    await page.getByRole("button", { name: "Entrar" }).click()
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test("rota protegida sem sessão redireciona para /login", async ({ page }) => {
    await page.context().clearCookies()
    await page.goto("/operations")
    await expect(page).toHaveURL(/\/login/)
  })
})
