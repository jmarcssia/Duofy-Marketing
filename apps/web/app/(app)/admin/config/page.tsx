"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { PageTitle, SectionCard, SoftButton } from "@/components/page-primitives"
import {
  apiFetch,
  type Agent,
  type Brand,
  type ProviderCredential,
  type QualitySettings
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"

const tabs = [
  "Marcas",
  "Agentes",
  "Modelos LLM",
  "Ferramentas",
  "Limites de Custo",
  "Usuários",
  "Regras de Marca"
]

const helperByProvider: Record<string, string> = {
  openrouter: "Use esta opção para modelos no formato anthropic/..., openai/... e outros via OpenRouter.",
  anthropic: "Use para chamadas diretas à API da Anthropic.",
  openai: "Use para chamadas diretas à API da OpenAI.",
  apify: "Chave reservada para ferramentas de pesquisa/coleta em fases futuras."
}

function providerHelper(provider: string) {
  if (provider === "openrouter") {
    return "Base URL recomendada: https://openrouter.ai/api/v1. Modelo recomendado: ~anthropic/claude-sonnet-latest. O agente de pesquisa usa web search via OpenRouter quando o pedido exige informacao atual."
  }
  if (provider === "openai_embeddings") {
    return "Configura embeddings para documentos e RAG. Base URL recomendada: https://api.openai.com/v1. Modelo recomendado: text-embedding-3-small. Se ficar desabilitado, o sistema usa fallback local para testes."
  }
  return helperByProvider[provider] ?? "Configure a chave e habilite o provedor para uso no sistema."
}

export default function AdminConfigPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("Modelos LLM")
  const [brands, setBrands] = useState<Brand[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [providers, setProviders] = useState<ProviderCredential[]>([])
  const [qualitySettings, setQualitySettings] = useState<QualitySettings | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const activeBrand = brands[0]

  const loadData = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }
    const [brandList, agentList, providerList, qualityConfig] = await Promise.all([
      apiFetch<Brand[]>("/api/brands", token),
      apiFetch<Agent[]>("/api/admin/agents", token),
      apiFetch<ProviderCredential[]>("/api/admin/providers", token),
      apiFetch<QualitySettings>("/api/admin/quality-settings", token)
    ])
    setBrands(brandList)
    setAgents(agentList)
    setProviders(providerList)
    setQualitySettings(qualityConfig)
  }, [router])

  useEffect(() => {
    loadData().catch(() => setMessage("Não foi possível carregar configurações."))
  }, [loadData])

  async function saveProvider(event: FormEvent<HTMLFormElement>, provider: ProviderCredential) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token) return
    const form = new FormData(event.currentTarget)
    const apiKey = String(form.get("api_key") ?? "").trim()
    const payload = {
      provider: provider.provider,
      display_name: String(form.get("display_name") ?? provider.display_name),
      api_key: apiKey || null,
      base_url: String(form.get("base_url") ?? "") || null,
      default_model: String(form.get("default_model") ?? "") || null,
      is_enabled: form.get("is_enabled") === "on"
    }

    await apiFetch<ProviderCredential>(`/api/admin/providers/${provider.provider}`, token, {
      method: "PUT",
      body: JSON.stringify(payload)
    })
    setMessage(`Configuração de ${provider.display_name} salva.`)
    await loadData()
  }

  async function saveQualitySettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token) return
    const form = new FormData(event.currentTarget)
    const provider = String(form.get("provider") ?? "").trim()
    const model = String(form.get("model") ?? "").trim()
    const payload: QualitySettings = {
      review_mode: String(form.get("review_mode") ?? "hybrid") as QualitySettings["review_mode"],
      provider: provider ? (provider as QualitySettings["provider"]) : null,
      model: model || null
    }
    const updated = await apiFetch<QualitySettings>("/api/admin/quality-settings", token, {
      method: "PUT",
      body: JSON.stringify(payload)
    })
    setQualitySettings(updated)
    setMessage("Configuração do Guardião de Qualidade salva.")
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Configurações Admin"
        subtitle="Configure marcas, agentes, modelos e chaves sem hardcode no sistema."
      />

      <div className="flex flex-wrap gap-8 border-b border-line">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`pb-4 text-sm font-bold ${
              activeTab === tab ? "border-b-2 border-purple text-purple" : "text-muted"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {message ? (
        <div className="rounded-2xl border border-purple/20 bg-purple-soft px-5 py-3 text-sm font-semibold text-purple">
          {message}
        </div>
      ) : null}

      {activeTab === "Modelos LLM" || activeTab === "Ferramentas" ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {activeTab === "Modelos LLM" && qualitySettings ? (
            <SectionCard title="Guardião de Qualidade">
              <form onSubmit={saveQualitySettings} className="space-y-4">
                <p className="text-sm leading-6 text-muted">
                  Configure a revisão antes da aprovação. O modo híbrido mantém a validação local obrigatória e usa LLM quando houver provedor habilitado.
                </p>
                <label className="block text-sm font-semibold">
                  Modo de revisão
                  <select
                    name="review_mode"
                    defaultValue={qualitySettings.review_mode}
                    className="duofy-focus mt-2 w-full rounded-xl border border-line bg-white px-4 py-3"
                  >
                    <option value="local_only">Local apenas</option>
                    <option value="hybrid">Híbrido com fallback local</option>
                    <option value="llm_required">LLM obrigatório</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Provedor preferencial
                  <select
                    name="provider"
                    defaultValue={qualitySettings.provider ?? ""}
                    className="duofy-focus mt-2 w-full rounded-xl border border-line bg-white px-4 py-3"
                  >
                    <option value="">Derivar do modelo/agente</option>
                    {providers
                      .filter((provider) => ["openrouter", "anthropic", "openai"].includes(provider.provider))
                      .map((provider) => (
                        <option key={provider.provider} value={provider.provider}>
                          {provider.display_name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Modelo preferencial
                  <input
                    name="model"
                    defaultValue={qualitySettings.model ?? ""}
                    placeholder="Ex.: anthropic/claude-sonnet-latest"
                    className="duofy-focus mt-2 w-full rounded-xl border border-line bg-white px-4 py-3"
                  />
                </label>
                <SoftButton>Salvar Guardião</SoftButton>
              </form>
            </SectionCard>
          ) : null}
          {providers
            .filter((provider) =>
              activeTab === "Ferramentas"
                ? ["apify", "openai_embeddings"].includes(provider.provider)
                : !["apify", "openai_embeddings"].includes(provider.provider)
            )
            .map((provider) => (
              <SectionCard key={provider.provider} title={provider.display_name}>
                <form onSubmit={(event) => saveProvider(event, provider)} className="space-y-4">
                  <p className="text-sm leading-6 text-muted">{providerHelper(provider.provider)}</p>
                  <input type="hidden" name="display_name" value={provider.display_name} />

                  <label className="block text-sm font-semibold">
                    API key
                    <input
                      name="api_key"
                      type="password"
                      placeholder={
                        provider.has_api_key
                          ? `Salva: ${provider.masked_api_key}`
                          : "Cole a chave aqui"
                      }
                      className="duofy-focus mt-2 w-full rounded-xl border border-line bg-white px-4 py-3"
                    />
                  </label>

                  <label className="block text-sm font-semibold">
                    Base URL
                    <input
                      name="base_url"
                      defaultValue={provider.base_url ?? ""}
                      placeholder={
                        provider.provider === "openrouter"
                          ? "https://openrouter.ai/api/v1"
                          : provider.provider === "openai_embeddings"
                            ? "https://api.openai.com/v1"
                          : undefined
                      }
                      className="duofy-focus mt-2 w-full rounded-xl border border-line bg-white px-4 py-3"
                    />
                  </label>

                  <label className="block text-sm font-semibold">
                    Modelo padrão
                    <input
                      name="default_model"
                      defaultValue={provider.default_model ?? ""}
                      placeholder={
                        provider.provider === "openrouter"
                          ? "~anthropic/claude-sonnet-latest"
                          : provider.provider === "openai_embeddings"
                            ? "text-embedding-3-small"
                          : undefined
                      }
                      disabled={provider.provider === "apify"}
                      className="duofy-focus mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 disabled:bg-slate-50 disabled:text-muted"
                    />
                  </label>

                  <label className="flex items-center gap-3 text-sm font-semibold">
                    <input
                      name="is_enabled"
                      type="checkbox"
                      defaultChecked={provider.is_enabled}
                      className="h-5 w-5 accent-purple"
                    />
                    Habilitar provedor
                  </label>

                  <SoftButton>Salvar {provider.display_name}</SoftButton>
                </form>
              </SectionCard>
            ))}
        </div>
      ) : null}

      {activeTab === "Marcas" ? (
        <div className="grid gap-5 xl:grid-cols-[0.65fr_2.35fr]">
          <SectionCard title="Marcas">
            <div className="space-y-3">
              {brands.map((brand, index) => (
                <div
                  key={brand.slug}
                  className={`rounded-2xl border p-4 ${
                    index === 0 ? "border-purple bg-purple-soft" : "border-line bg-white"
                  }`}
                >
                  <h3 className="text-lg font-extrabold tracking-[-0.04em]">{brand.name}</h3>
                  <p className="mt-1 text-sm text-muted">{brand.niche}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Informações da Marca">
            <div className="grid gap-4 md:grid-cols-3">
              <input readOnly value={activeBrand?.name ?? ""} className="rounded-xl border border-line px-4 py-3" />
              <input readOnly value={activeBrand?.slug ?? ""} className="rounded-xl border border-line px-4 py-3" />
              <input readOnly value={activeBrand?.niche ?? ""} className="rounded-xl border border-line px-4 py-3" />
            </div>
            <textarea
              readOnly
              value={activeBrand?.description ?? ""}
              className="mt-4 min-h-24 w-full rounded-xl border border-line px-4 py-3"
            />
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "Agentes" ? (
        <SectionCard title="Agentes configurados">
          <div className="grid gap-3 md:grid-cols-2">
            {agents.map((agent) => (
              <div key={agent.slug} className="rounded-2xl border border-line bg-white p-4">
                <h3 className="font-bold tracking-[-0.03em]">{agent.name}</h3>
                <p className="mt-2 text-sm text-muted">{agent.default_model}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}
