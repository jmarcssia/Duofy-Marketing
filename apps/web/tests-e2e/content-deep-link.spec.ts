import { expect, test } from "@playwright/test"

import { login } from "./fixtures"

const baseOutput = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  brand_slug: "duofy_solucoes",
  category: "content",
  channel: "Instagram",
  format: "Carrossel",
  title: "Conteúdo Deep-Link Mockado",
  briefing: "briefing de teste",
  briefing_json: null,
  status: "draft",
  provider: "openrouter",
  model: "openai/gpt-4o-mini",
  agent_run_id: null,
  current_version_id: 1,
  current_version_number: 1,
  current_content: "## Conteúdo\n\nMarkdown de fallback sem pacote estruturado.",
  document_type: "content",
  document_sections: [],
  quality_notes: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  versions: [],
  latest_quality_review: null,
  ...overrides
})

test.describe("Conteúdo — deep-link por ID", () => {
  test("com pacote estruturado: Visão geral mostra o pacote rico por padrão", async ({ page }) => {
    const OUTPUT_ID = 88101

    await page.route(`**/api/outputs/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseOutput(OUTPUT_ID)) })
    })
    await page.route(`**/api/pieces?output_id=${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.route(`**/api/outputs/${OUTPUT_ID}/pieces`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.route(`**/api/cocreation/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          output_id: OUTPUT_ID,
          version_number: 1,
          status: "draft",
          package: {
            brand_slug: "duofy_solucoes", channel: "Instagram", format: "Carrossel",
            persona: "", objetivo: "", etapa_funil: "", analise_estrategica: "análise de teste",
            conceito: "", arco_narrativo: "", cta: "CTA de teste",
            captions: { Instagram: "Legenda rica de teste." },
            slides: [], visual_direction: {
              conceito: "", estilo: "", cenario: "", enquadramento: "", composicao: "",
              iluminacao: "", paleta: "", tipografia: "", restricoes: ""
            },
            extra_pieces: [], factualidade: [], checklist: []
          },
          content_markdown: "## Conteúdo\n\nMarkdown que não deveria aparecer na aba Visão geral.",
          warnings: []
        })
      })
    })

    await login(page)
    await page.goto(`/content?id=${OUTPUT_ID}`)

    await expect(page.getByText("Legenda rica de teste.")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible()
  })

  test("sem pacote estruturado: Visão geral cai para o markdown renderizado", async ({ page }) => {
    const OUTPUT_ID = 88102

    await page.route(`**/api/outputs/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseOutput(OUTPUT_ID)) })
    })
    await page.route(`**/api/outputs/${OUTPUT_ID}/pieces`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.route(`**/api/cocreation/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Este conteudo nao tem pacote estruturado." }) })
    })

    await login(page)
    await page.goto(`/content?id=${OUTPUT_ID}`)

    await expect(page.getByText("Markdown de fallback sem pacote estruturado.")).toBeVisible({ timeout: 15_000 })
  })

  test("aba Editar mostra o editor de markdown", async ({ page }) => {
    const OUTPUT_ID = 88103

    await page.route(`**/api/outputs/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseOutput(OUTPUT_ID)) })
    })
    await page.route(`**/api/outputs/${OUTPUT_ID}/pieces`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.route(`**/api/cocreation/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "sem pacote" }) })
    })

    await login(page)
    await page.goto(`/content?id=${OUTPUT_ID}`)
    await expect(page.getByText("Markdown de fallback sem pacote estruturado.")).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: "Editar", exact: true }).click()
    await expect(page.getByLabel(/Conteúdo \(Markdown\)/)).toBeVisible()
  })

  test("ID inexistente mostra mensagem de erro", async ({ page }) => {
    await page.route("**/api/outputs/99999999", async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Output nao encontrado." }) })
    })

    await login(page)
    await page.goto("/content?id=99999999")

    await expect(page.getByText(/não foi encontrado|não tem acesso/i)).toBeVisible({ timeout: 15_000 })
  })
})
