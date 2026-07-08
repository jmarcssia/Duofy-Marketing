import { expect, test } from "@playwright/test"

import { login } from "./fixtures"

/**
 * Item 1 (E2E) — exercita o fluxo assíncrono real da UI (run-async → polling de
 * /api/tasks/{id} → fetch do relatório) sem tocar o LLM: intercepta as 3 chamadas de
 * rede envolvidas e injeta respostas determinísticas. Isso prova que o código de
 * `lib/api.ts` (pollAgentTask) e a página de pesquisa reagem corretamente ao ciclo de
 * vida da tarefa (queued → running → completed), sem custo de API e sem flakiness de
 * pesquisa real (que depende de fontes externas).
 */
test.describe("Pesquisa — fluxo assíncrono (mockado)", () => {
  test("enfileira, faz polling da tarefa e exibe o relatório ao concluir", async ({ page }) => {
    const TASK_ID = 90001
    const OUTPUT_ID = 77001
    let pollCount = 0

    await page.route("**/api/research/run-async", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: TASK_ID,
          session_id: null,
          user_id: 1,
          brand_slug: "duofy_solucoes",
          task_type: "research",
          status: "queued",
          input: "teste e2e mockado",
          result: "",
          output_type: null,
          output_id: null,
          celery_task_id: "fake-celery-id",
          error: null,
          metadata_json: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          logs: []
        })
      })
    })

    await page.route(`**/api/tasks/${TASK_ID}`, async (route) => {
      pollCount += 1
      const done = pollCount >= 2 // 1a resposta "running", 2a+ "completed" — exercita o loop de fato
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: TASK_ID,
          session_id: null,
          user_id: 1,
          brand_slug: "duofy_solucoes",
          task_type: "research",
          status: done ? "completed" : "running",
          input: "teste e2e mockado",
          result: done ? "Pesquisa concluida. Relatorio salvo." : "",
          output_type: done ? "research" : null,
          output_id: done ? OUTPUT_ID : null,
          celery_task_id: "fake-celery-id",
          error: null,
          metadata_json: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          logs: []
        })
      })
    })

    await page.route(`**/api/research/reports/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: OUTPUT_ID,
          brand_slug: "duofy_solucoes",
          category: "general",
          channel: "Pesquisa",
          format: "research_report",
          title: "Relatório E2E Mockado",
          briefing: "briefing de teste",
          briefing_json: null,
          status: "draft",
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          agent_run_id: null,
          current_version_id: 1,
          current_version_number: 1,
          current_content: "## Relatório\n\nConteúdo de teste E2E mockado — sem custo de LLM.",
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
    await page.goto("/research")

    // BrandContext seleciona a marca de forma assíncrona (fetch de /api/brands após o mount).
    // `login()` já espera essa seleção assentar antes de devolver o controle (ver fixtures.ts),
    // mas esta é uma segunda rede de segurança: sem "Marca" preenchida, "Iniciar pesquisa" fica
    // preso em disabled e o teste travaria no clique em vez de falhar com uma mensagem clara.
    await expect(page.getByRole("button", { name: "Selecionar marca" })).toBeHidden({
      timeout: 30_000
    })

    await page.getByLabel("Pergunta principal").fill("Pergunta de teste E2E — fluxo assíncrono")
    // Nome exato: "Mercado"/"Rápida" também aparecem como substring em botões de template
    // ("Análise de mercado") — hasText faz substring case-insensitive e clicaria no errado.
    await page.getByRole("button", { name: "Mercado", exact: true }).click()
    await page.getByRole("button", { name: /^Rápida/ }).click()

    await page.getByRole("button", { name: /Iniciar pesquisa/ }).click()

    // A UI faz polling real (com o setTimeout do pollAgentTask) até a tarefa concluir —
    // aqui isso leva apenas alguns ciclos rápidos por conta do mock, não 1-2 minutos.
    await expect(page.getByText("Relatório E2E Mockado")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Conteúdo de teste E2E mockado")).toBeVisible()
    expect(pollCount).toBeGreaterThanOrEqual(2)
  })
})
