import { expect, test } from "@playwright/test"

import { login } from "./fixtures"

/**
 * Item 1 (E2E) — mesma ideia do research-async.spec.ts, para o fluxo assíncrono de
 * cocriação (generate-async → polling → getCocreation). Rede mockada: determinístico,
 * rápido e sem custo de LLM.
 */
test.describe("Cocriação — fluxo assíncrono (mockado)", () => {
  test("gera o pacote via polling e exibe o conteúdo ao concluir", async ({ page }) => {
    const TASK_ID = 90101
    const OUTPUT_ID = 77101
    let pollCount = 0

    const fakePackage = {
      brand_slug: "duofy_solucoes",
      channel: "Instagram",
      format: "Carrossel",
      persona: "",
      objetivo: "",
      etapa_funil: "",
      analise_estrategica: "",
      conceito: "",
      arco_narrativo: "",
      cta: "",
      captions: { Instagram: "Legenda de teste E2E mockada." },
      slides: [],
      visual_direction: {
        conceito: "", estilo: "", cenario: "", enquadramento: "", composicao: "",
        iluminacao: "", paleta: "", tipografia: "", restricoes: ""
      },
      extra_pieces: [],
      factualidade: [],
      checklist: []
    }

    await page.route("**/api/cocreation/generate-async", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: TASK_ID,
          session_id: null,
          user_id: 1,
          brand_slug: "duofy_solucoes",
          task_type: "cocreation",
          status: "queued",
          input: "teste e2e cocriação",
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
      const done = pollCount >= 2
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: TASK_ID,
          session_id: null,
          user_id: 1,
          brand_slug: "duofy_solucoes",
          task_type: "cocreation",
          status: done ? "completed" : "running",
          input: "teste e2e cocriação",
          result: done ? "Conteudo cocriado." : "",
          output_type: done ? "cocreation" : null,
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

    await page.route(`**/api/cocreation/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          output_id: OUTPUT_ID,
          version_number: 1,
          status: "draft",
          package: fakePackage,
          content_markdown: "## Pacote\n\nConteúdo cocriado de teste E2E mockado.",
          warnings: []
        })
      })
    })

    await login(page)
    await page.goto("/content")

    // BrandContext seleciona a marca de forma assíncrona (fetch de /api/brands após o mount).
    // `login()` já espera essa seleção assentar antes de devolver o controle (ver fixtures.ts),
    // mas esta é uma segunda rede de segurança: sem "Marca" preenchida, "Gerar" fica preso em
    // disabled e o teste travaria no clique em vez de falhar com uma mensagem clara.
    await expect(page.getByRole("button", { name: "Selecionar marca" })).toBeHidden({
      timeout: 30_000
    })

    await page.getByLabel("Tema").fill("Tema de teste E2E — cocriação assíncrona")
    // Nome exato: hasText faz substring case-insensitive e poderia colidir com outros
    // rótulos que contêm essas palavras (ex.: templates).
    await page.getByRole("button", { name: "Instagram", exact: true }).click()
    await page.getByRole("button", { name: "Carrossel", exact: true }).click()

    await page.getByRole("button", { name: "Gerar", exact: true }).click()

    // A view renderiza o pacote ESTRUTURADO (captions/visual_direction/cta), não o
    // content_markdown bruto — a legenda mockada é o sinal de que o pacote chegou e renderizou.
    await expect(page.getByText("Legenda de teste E2E mockada.")).toBeVisible({ timeout: 20_000 })
    expect(pollCount).toBeGreaterThanOrEqual(2)
  })
})
