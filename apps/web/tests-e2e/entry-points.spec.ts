import { expect, test } from "@playwright/test"

import { login } from "./fixtures"

/**
 * Confirma que os pontos de entrada corrigidos (Operações, busca global, Aprovações) geram
 * links com ?id= — em vez de páginas genéricas que obrigam o usuário a procurar o item de novo.
 * Rede mockada: listas fixas e determinísticas.
 */
test.describe("Pontos de entrada — redirecionamento correto", () => {
  test("Operações → 'Saídas recentes' linka pesquisa e conteúdo com ?id=", async ({ page }) => {
    const researchItem = {
      id: 77201, brand_slug: "duofy_solucoes", category: "research", channel: "Pesquisa",
      format: "research_report", title: "Pesquisa recente de teste", briefing: "b", briefing_json: null,
      status: "draft", provider: "openrouter", model: "openai/gpt-4o-mini", agent_run_id: null,
      current_version_id: 1, current_version_number: 1, current_content: "conteúdo",
      document_type: "research_report", document_sections: [], quality_notes: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
    const contentItem = {
      ...researchItem, id: 77202, category: "content", channel: "Instagram", format: "Carrossel",
      title: "Conteúdo recente de teste"
    }

    await page.route("**/api/research/reports?**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([researchItem]) })
    })
    await page.route("**/api/content/outputs?**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([contentItem]) })
    })

    await login(page)
    await page.goto("/operations")

    const researchLink = page.getByRole("link", { name: /Pesquisa recente de teste/ })
    const contentLink = page.getByRole("link", { name: /Conteúdo recente de teste/ })
    await expect(researchLink).toBeVisible({ timeout: 15_000 })
    await expect(researchLink).toHaveAttribute("href", "/research?id=77201")
    await expect(contentLink).toHaveAttribute("href", "/content?id=77202")
  })

  test("Busca global linka resultado com ?id=", async ({ page }) => {
    const item = {
      id: 77301, brand_slug: "duofy_solucoes", category: "content", channel: "Instagram",
      format: "Carrossel", title: "Resultado de busca de teste", briefing: "b", briefing_json: null,
      status: "draft", provider: "openrouter", model: "openai/gpt-4o-mini", agent_run_id: null,
      current_version_id: 1, current_version_number: 1, current_content: "conteúdo",
      document_type: "content", document_sections: [], quality_notes: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
    await page.route("**/api/outputs?query=**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([item]) })
    })
    await page.route("**/api/memory/search", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })

    await login(page)
    await page.goto("/operations")
    await page.getByPlaceholder("Buscar pesquisas, conteúdos, marcas...").fill("teste")
    await page.getByPlaceholder("Buscar pesquisas, conteúdos, marcas...").press("Enter")

    const resultLink = page.getByRole("link", { name: /Resultado de busca de teste/ })
    await expect(resultLink).toBeVisible({ timeout: 15_000 })
    await expect(resultLink).toHaveAttribute("href", "/content?id=77301")
  })

  test("Aprovações → item da lista linka com ?id=", async ({ page }) => {
    const item = {
      id: 77401, brand_slug: "duofy_solucoes", category: "content", channel: "Instagram",
      format: "Carrossel", title: "Item de aprovação de teste", briefing: "b", briefing_json: null,
      status: "review", provider: "openrouter", model: "openai/gpt-4o-mini", agent_run_id: null,
      current_version_id: 1, current_version_number: 1, current_content: "conteúdo",
      document_type: "content", document_sections: [], quality_notes: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
    await page.route("**/api/outputs?**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([item]) })
    })
    await page.route("**/api/calendar?**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })

    await login(page)
    await page.goto("/approvals")

    const openLink = page.getByRole("link", { name: /Abrir/ }).first()
    await expect(openLink).toBeVisible({ timeout: 15_000 })
    await expect(openLink).toHaveAttribute("href", "/content?id=77401")
  })
})
