import { defineConfig, devices } from "@playwright/test"

/**
 * Item 3 — testes E2E de golden path via UI real (navegador), além do `next build`.
 *
 * Reusa o servidor de dev já rodando em :3000 quando disponível (stack Docker do projeto,
 * com a API real em :8000 via proxy do Next) — só sobe um novo `next dev` se nada estiver
 * escutando na porta. Sem chamadas de LLM: os testes que exercitam os fluxos assíncronos de
 * pesquisa/cocriação interceptam a API (`page.route`) para ficarem determinísticos e sem custo.
 */
export default defineConfig({
  testDir: "./tests-e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Workers baixo de propósito: várias instâncias de Chromium em paralelo esgotam
  // memória/disco em máquinas de dev com recursos apertados (visto na prática — OOM do
  // Chromium com o default de 1 worker por núcleo). Sequencial é mais lento mas robusto.
  workers: process.env.CI ? 2 : 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000
  }
})
