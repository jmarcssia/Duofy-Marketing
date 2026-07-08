import { expect, test } from "@playwright/test"

import { login } from "./fixtures"

/**
 * Item de UX — /research?id=X deve abrir o relatório direto, sem exigir que o usuário
 * encontre o item na lista "Pesquisas recentes". Rede mockada: determinístico, sem custo de LLM.
 */
test.describe("Pesquisa — deep-link por ID", () => {
  test("abre o relatório direto quando a URL tem ?id=", async ({ page }) => {
    const REPORT_ID = 88001

    await page.route(`**/api/research/reports/${REPORT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: REPORT_ID,
          brand_slug: "duofy_solucoes",
          category: "general",
          channel: "Pesquisa",
          format: "research_report",
          title: "Relatório Deep-Link Mockado",
          briefing: "briefing de teste",
          briefing_json: null,
          status: "draft",
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          agent_run_id: null,
          current_version_id: 1,
          current_version_number: 1,
          current_content: "## Relatório\n\nConteúdo aberto direto por deep-link.",
          document_type: "research_report",
          document_sections: [],
          quality_notes: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sources: []
        })
      })
    })

    await login(page)
    await page.goto(`/research?id=${REPORT_ID}`)

    // Deve mostrar o relatório direto — não o formulário de nova pesquisa nem a lista lateral.
    await expect(page.getByText("Relatório Deep-Link Mockado")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Conteúdo aberto direto por deep-link.")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Nova pesquisa" })).not.toBeVisible()
  })

  test("ID inexistente mostra mensagem de erro, não trava a tela", async ({ page }) => {
    await page.route("**/api/research/reports/99999999", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Relatorio de pesquisa nao encontrado." })
      })
    })

    await login(page)
    await page.goto("/research?id=99999999")

    await expect(page.getByText(/não foi encontrado|não tem acesso/i)).toBeVisible({ timeout: 15_000 })
  })
})
