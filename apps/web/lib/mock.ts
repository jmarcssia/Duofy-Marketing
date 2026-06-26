/**
 * Camada de dados MOCK — isolada e tipada.
 * Coerente com DUOFY / Deathcare / Postos / Marketing e os agentes.
 * Substituível por API real: cada export aqui mapeia 1:1 a um futuro endpoint.
 */

import type { Tone } from "@/components/ui"

export type MockUser = { name: string; role: string }

export const currentUser: MockUser = { name: "Camila Rocha", role: "Gerente de Conteúdo" }

export const workspaces = ["Workspace Growth", "Workspace Deathcare", "Workspace Postos"]

export const teamMembers = [
  "Camila Rocha",
  "Mariana Costa",
  "Lucas Mendes",
  "Ana Paula",
  "Rafael Lima",
  "Beatriz Nunes"
]

/* ============== OPERAÇÕES ============== */

export type ResearchCard = {
  id: string
  title: string
  tags: { label: string; tone: Tone }[]
  source: string
  owner: string
  date: string
  guardian: { label: string; tone: Tone }
  column: "analise" | "revisao" | "aprovado"
}

export const orchestratorMessages = [
  { id: "m1", text: "Olá, Camila! Aqui estão os destaques das suas pesquisas hoje.", time: "09:20" },
  { id: "m2", text: "Ótimo! Quais temas estão prontos para revisão?", time: "09:21", me: true },
  { id: "m3", text: "Você tem 2 pesquisas em revisão e 1 pronta para aprovação.", time: "09:21" }
]

export const researchCards: ResearchCard[] = [
  {
    id: "r1",
    title: "Tendências de vídeos curtos para 2025",
    tags: [
      { label: "Redes sociais", tone: "purple" },
      { label: "Vídeos", tone: "blue" }
    ],
    source: "DataReportal",
    owner: "Lucas Mendes",
    date: "14/05",
    guardian: { label: "Guardião: Em análise", tone: "amber" },
    column: "analise"
  },
  {
    id: "r2",
    title: "Benchmark de marcas no TikTok",
    tags: [
      { label: "Benchmark", tone: "teal" },
      { label: "TikTok", tone: "pink" }
    ],
    source: "Socialinsider",
    owner: "Ana Paula",
    date: "13/05",
    guardian: { label: "Guardião: Em análise", tone: "amber" },
    column: "analise"
  },
  {
    id: "r3",
    title: "Comportamento de consumo de conteúdo no Instagram",
    tags: [
      { label: "Comportamento", tone: "indigo" },
      { label: "Instagram", tone: "pink" }
    ],
    source: "GWI",
    owner: "Camila Rocha",
    date: "12/05",
    guardian: { label: "Guardião: Em revisão", tone: "amber" },
    column: "revisao"
  },
  {
    id: "r4",
    title: "Formatos que mais geram engajamento",
    tags: [
      { label: "Engajamento", tone: "green" },
      { label: "Redes sociais", tone: "purple" }
    ],
    source: "BuzzSumo",
    owner: "Rafael Lima",
    date: "11/05",
    guardian: { label: "Guardião: Em revisão", tone: "amber" },
    column: "revisao"
  },
  {
    id: "r5",
    title: "Hábitos digitais da Geração Z",
    tags: [
      { label: "Comportamento", tone: "indigo" },
      { label: "Geração Z", tone: "sky" }
    ],
    source: "HubSpot",
    owner: "Mariana Costa",
    date: "09/05",
    guardian: { label: "Guardião: Aprovado", tone: "green" },
    column: "aprovado"
  }
]

export const researchDetail = {
  title: "Comportamento de consumo de conteúdo no Instagram",
  source: "GWI",
  createdAt: "12/05/2025",
  author: "Camila Rocha",
  summary:
    "Pesquisa sobre como os usuários consomem conteúdo no Instagram em 2025, incluindo preferências de formatos, horários de atividade, tempo de consumo e fatores que influenciam engajamento.",
  meta: [
    { label: "Público-alvo", value: "Jovens adultos (18–34 anos)" },
    { label: "Abrangência", value: "Brasil" },
    { label: "Metodologia", value: "Survey online com 1.200 respondentes" },
    { label: "Período", value: "Abr/2025" }
  ]
}

export const cocriacaoPrompts = [
  { id: "s1", label: "Slide 1 — Prompt da capa", text: "Crie uma capa de carrossel minimalista e moderna sobre Instagram. Título em destaque: \"Como o brasileiro consome conteúdo no Instagram em 2025?\". Estilo limpo, tipografia forte, cores em tons de roxo e branco." },
  { id: "s2", label: "Slide 2 — Prompt", text: "Apresente o dado: \"89% dos usuários acessam o Instagram diariamente\". Use um design visual com ícone de calendário ou relógio. Estilo clean e profissional." },
  { id: "s3", label: "Slide 3 — Prompt", text: "Mostre os formatos preferidos: Reels (53%), Carrossel (28%), Stories (19%). Use gráfico de barras ou círculos proporcionais. Visual moderno e fácil de entender." },
  { id: "s4", label: "Slide 4 — Prompt", text: "Horários de pico: 12h às 14h e 19h às 22h. Crie um layout com linha do tempo ou relógio destacando os horários. Cores suaves e ícones." },
  { id: "s5", label: "Slide 5 — Prompt", text: "O que mais engaja: Conteúdo útil, entretenimento e bastidores. Use ícones para cada item, layout organizado e estética consistente." }
]

export const cocriacaoAngles = {
  strategic: "Educar sobre hábitos reais de consumo no Instagram, gerando identificação e aplicabilidade para marcas que querem se conectar melhor.",
  persona: "Jovem Conectado — 18 a 34 anos, urbano, consome diariamente, valoriza autenticidade e praticidade.",
  legend: "Entenda como seu público consome conteúdo no Instagram em 2025 e crie estratégias que realmente geram conexão e engajamento. 🚀📲",
  cta: "Qual insight mais te surpreendeu? Comente abaixo! Salve este post para aplicar depois.",
  hashtags: "#Instagram #Conteúdo #MarketingDigital #Duofy"
}

export const formatRules = [
  { format: "Carrossel", icon: "carousel", text: "Até 10 slides. Conteúdo educativo com progressão lógica. Títulos curtos e dados visuais." },
  { format: "LinkedIn", icon: "linkedin", text: "Texto objetivo, tom profissional e insights aplicáveis ao mercado. Até 1.300 caracteres." },
  { format: "Post único", icon: "post", text: "Mensagem direta e impactante. Foco em uma ideia principal e CTA claro." },
  { format: "Blog", icon: "blog", text: "Estrutura com introdução, desenvolvimento, exemplos e conclusão. 1.000 a 1.800 palavras." }
]

export const operationsGuardian = {
  score: 92,
  checklist: [
    "Aderência à persona",
    "Clareza da copy",
    "Consistência com pesquisa",
    "Prompts detalhados"
  ],
  suggestion: "incluir dado regional específico para aumentar relevância",
  lastCheck: "hoje às 09:35"
}

/* ============== CALENDÁRIO ============== */

export const calendarStats = [
  { label: "Publicações do mês", value: "28", delta: "12% vs. Abril", dir: "up" as const, tone: "purple" as Tone },
  { label: "Tarefas pendentes", value: "14", delta: "8% vs. Abril", dir: "up" as const, tone: "orange" as Tone },
  { label: "Revisões agendadas", value: "6", delta: "14% vs. Abril", dir: "down" as const, tone: "blue" as Tone },
  { label: "Eventos importados", value: "19", delta: "21% vs. Abril", dir: "up" as const, tone: "green" as Tone }
]

export type CalendarKind = "carrossel" | "post" | "linkedin" | "blog" | "revisao" | "campanha"

export const calendarKindMeta: Record<CalendarKind, { label: string; tone: Tone }> = {
  carrossel: { label: "Carrossel", tone: "pink" },
  post: { label: "Post único", tone: "green" },
  linkedin: { label: "LinkedIn", tone: "blue" },
  blog: { label: "Blog", tone: "amber" },
  revisao: { label: "Revisão", tone: "purple" },
  campanha: { label: "Campanha", tone: "orange" }
}

// dia do mês -> eventos (Maio/2025)
export const calendarEvents: Record<number, CalendarKind[]> = {
  5: ["carrossel"],
  6: ["post"],
  7: ["linkedin"],
  8: ["blog"],
  9: ["revisao"],
  12: ["post"],
  13: ["carrossel"],
  14: ["linkedin"],
  15: ["post", "campanha"],
  16: ["revisao"],
  19: ["linkedin"],
  20: ["blog"],
  21: ["carrossel"],
  22: ["revisao"],
  23: ["post"],
  26: ["campanha"],
  27: ["linkedin"],
  28: ["carrossel"],
  29: ["blog"],
  30: ["revisao"]
}

export const calendarDayDetail = {
  day: "15 de Maio",
  items: [
    { time: "09:00", kind: "post" as CalendarKind, title: "Post único: Dica rápida", owner: "Camila Rocha", status: "Aprovado", tone: "green" as Tone },
    { time: "11:30", kind: "campanha" as CalendarKind, title: "Campanha: Lançamento Q2", owner: "Mariana Costa", status: "Em andamento", tone: "orange" as Tone },
    { time: "15:00", kind: "revisao" as CalendarKind, title: "Revisão de conteúdo", owner: "Lucas Mendes", status: "Agendada", tone: "purple" as Tone }
  ],
  cocriacao: {
    objetivo: "Educar e engajar sobre planejamento de conteúdo.",
    persona: "Profissionais de marketing e social media",
    legenda: "Organizar é o primeiro passo para criar com propósito. ✍️",
    prompt: "Escreva um post educativo e prático sobre como estruturar um calendário editorial eficiente com apoio da IA. Linguagem clara, tom amigável e foco em produtividade."
  }
}

export const importedThemes = [
  { theme: "Como planejar conteúdo com IA", channel: "LinkedIn", format: "Artigo / Post", priority: "Alta", priorityTone: "red" as Tone, origin: "Excel – Plano de Conteúdo", importedAt: "12/05/2025 10:32" },
  { theme: "Check-list para redes sociais", channel: "Instagram", format: "Carrossel", priority: "Média", priorityTone: "amber" as Tone, origin: "Google Planilhas", importedAt: "11/05/2025 16:21" },
  { theme: "Tendências de marketing 2025", channel: "LinkedIn", format: "Artigo / Post", priority: "Alta", priorityTone: "red" as Tone, origin: "Excel – Brainstorm", importedAt: "10/05/2025 09:14" },
  { theme: "Bastidores do time Duofy", channel: "Instagram", format: "Post único", priority: "Baixa", priorityTone: "slate" as Tone, origin: "Google Planilhas", importedAt: "09/05/2025 14:08" },
  { theme: "Guia: Métricas que importam", channel: "LinkedIn", format: "Artigo / Post", priority: "Média", priorityTone: "amber" as Tone, origin: "Excel – Plano Mensal", importedAt: "08/05/2025 11:47" }
]

/* ============== MEMÓRIA ============== */

export const memoryStats = [
  { label: "Documentos indexados", value: "1.248", delta: "12% vs. período anterior", tone: "purple" as Tone },
  { label: "Coleções ativas", value: "46", delta: "8% vs. período anterior", tone: "indigo" as Tone },
  { label: "Última sincronização", value: "Hoje, 09:23", hint: "Sincronização completa", tone: "blue" as Tone },
  { label: "Uso pelos agentes", value: "3.142", delta: "18% vs. período anterior", tone: "green" as Tone }
]

export type MemoryDoc = {
  id: string
  name: string
  version: string
  type: string
  brand: string
  tags: string[]
  source: string
  status: "Indexado" | "Atualizando"
}

export const memoryDocs: MemoryDoc[] = [
  { id: "d1", name: "Brand Kit Duofy 2024", version: "v2.3", type: "Guia", brand: "Duofy", tags: ["brand", "visual", "tom de voz"], source: "Drive · Marketing", status: "Indexado" },
  { id: "d2", name: "Apresentação Institucional", version: "v1.4", type: "Apresentação", brand: "Duofy", tags: ["institucional", "posicionamento"], source: "Drive · Marketing", status: "Indexado" },
  { id: "d3", name: "Diretrizes de Tom de Voz", version: "v1.2", type: "Documento", brand: "Duofy", tags: ["tom de voz", "comunicação"], source: "Confluence", status: "Indexado" },
  { id: "d4", name: "Manual de Atendimento", version: "v3.1", type: "Manual", brand: "Duofy", tags: ["atendimento", "processos"], source: "Confluence", status: "Indexado" },
  { id: "d5", name: "Política de Privacidade", version: "v2.0", type: "Política", brand: "Duofy", tags: ["jurídico", "privacidade"], source: "Drive · Jurídico", status: "Indexado" },
  { id: "d6", name: "Catálogo de Produtos", version: "v1.7", type: "Planilha", brand: "Duofy", tags: ["produtos", "preços"], source: "Drive · Produto", status: "Atualizando" },
  { id: "d7", name: "FAQ Interno", version: "v0.9", type: "Documento", brand: "Duofy", tags: ["faq", "interno"], source: "Notion", status: "Indexado" }
]

export const memoryCollections = [
  { name: "Brand & Comunicação", desc: "Tudo sobre marca, tom de voz e comunicação institucional.", docs: 152, usage: "1.245", delta: "15%", updatedAt: "08/05/2025" },
  { name: "Produtos & Soluções", desc: "Informações de produtos, preços e diferenciais.", docs: 318, usage: "892", delta: "12%", updatedAt: "07/05/2025" },
  { name: "Atendimento & Processos", desc: "Processos, fluxos e diretrizes de atendimento.", docs: 276, usage: "643", delta: "9%", updatedAt: "06/05/2025" },
  { name: "Jurídico & Compliance", desc: "Políticas, contratos e documentos legais.", docs: 97, usage: "198", delta: "6%", updatedAt: "05/05/2025" }
]

export const memoryActivity = [
  { icon: "upload", title: "Documento indexado", desc: "\"Diretrizes de Tom de Voz v1.2\" foi indexado com sucesso.", time: "Hoje, 09:23" },
  { icon: "edit", title: "Documento atualizado", desc: "\"Brand Kit Duofy 2024\" foi atualizado para v2.3.", time: "Hoje, 09:15" },
  { icon: "search", title: "Buscas realizadas", desc: "124 buscas realizadas pelos agentes nas últimas 24h.", time: "Hoje, 08:47" },
  { icon: "users", title: "Conteúdo utilizado", desc: "\"Apresentação Institucional v1.4\" foi usada como referência em 6 respostas.", time: "Ontem, 17:32" }
]

export const memoryDetail = {
  name: "Brand Kit Duofy 2024",
  version: "v2.3",
  meta: {
    tipo: "Guia",
    fonte: "Drive · Marketing",
    tamanho: "24,7 MB",
    criadoEm: "12/03/2024",
    atualizadoEm: "08/05/2025, 09:15",
    idioma: "Português (Brasil)"
  },
  tags: ["brand", "visual", "tom de voz", "identidade", "diretrizes", "+2"],
  versions: [
    { v: "v2.3", current: true, at: "08/05/2025, 09:15", by: "Camila Rocha" },
    { v: "v2.2", current: false, at: "24/04/2025, 16:42", by: "Lucas Mendes" },
    { v: "v2.1", current: false, at: "10/03/2025, 11:03", by: "Camila Rocha" },
    { v: "v2.0", current: false, at: "05/02/2025, 14:20", by: "Lucas Mendes" }
  ],
  agentPerms: [
    { agent: "Assistente de Conteúdo", canUse: true },
    { agent: "Analista de Redes", canUse: true },
    { agent: "Suporte Duofy", canUse: true }
  ],
  preview:
    "O Brand Kit Duofy define os elementos visuais, verbais e estratégicos que representam nossa marca. Ele orienta a criação de conteúdos consistentes, reconhecíveis e alinhados ao posicionamento da Duofy.",
  previewPages: "Página 1 de 68"
}

/* ============== REVISÃO ============== */

export type ReviewItem = {
  id: string
  title: string
  kind: string
  channelTone: Tone
  owner: string
  status: string
  statusTone: Tone
  priority: string
  priorityTone: Tone
}

export const reviewQueue: ReviewItem[] = [
  { id: "rv1", title: "Guia de melhores práticas para Reels", kind: "Pesquisa", channelTone: "pink", owner: "Mariana Costa", status: "Em revisão", statusTone: "amber", priority: "Alta", priorityTone: "red" },
  { id: "rv2", title: "Calendário de conteúdos Junho/2025", kind: "Cocriação", channelTone: "purple", owner: "Lucas Mendes", status: "Pendente", statusTone: "orange", priority: "Média", priorityTone: "amber" },
  { id: "rv3", title: "Benchmark TikTok Fitness 2025", kind: "Pesquisa", channelTone: "blue", owner: "Rafael Lima", status: "Em análise", statusTone: "blue", priority: "Alta", priorityTone: "red" },
  { id: "rv4", title: "Post institucional: Nossa história", kind: "Cocriação", channelTone: "purple", owner: "Beatriz Nunes", status: "Pendente", statusTone: "orange", priority: "Baixa", priorityTone: "slate" },
  { id: "rv5", title: "Ideias de vídeos YouTube Educação Financeira", kind: "Pesquisa", channelTone: "red", owner: "Mariana Costa", status: "Em revisão", statusTone: "amber", priority: "Média", priorityTone: "amber" }
]

export const reviewDetail = {
  title: "Guia de melhores práticas para Reels",
  kind: "Pesquisa",
  owner: "Mariana Costa",
  agent: "Guardião de Conteúdo",
  brand: "Growth",
  createdAt: "20/05/2025 09:12",
  updatedAt: "22/05/2025 14:35",
  id: "#PESQ-1287",
  body: [
    { h: "1. Introdução", p: "Os Reels se consolidaram como um dos formatos mais eficazes para alcançar novas audiências, gerar engajamento e fortalecer a presença de marca no Instagram." },
    { h: "2. Melhores práticas", list: ["Gancho forte nos primeiros 2 segundos", "Duração ideal entre 7 e 15 segundos", "Legendas nativas e objetivas", "Áudio em tendência ou original", "CTAs claros e alinhados ao objetivo do conteúdo"] },
    { h: "3. Frequência recomendada", p: "Publicar de 3 a 5 Reels por semana é o ideal para manter consistência e aproveitar o alcance orgânico do algoritmo." }
  ],
  suggestions: [
    "Adicionar exemplo de gancho para aumentar a aplicabilidade.",
    "Recomendar horários sugeridos com base em dados da marca."
  ],
  versionDiff: {
    current: { v: "v3", at: "22/05/2025 14:35", by: "Mariana Costa", line: "Duração ideal entre 7 e 15 segundos" },
    previous: { v: "v2", at: "21/05/2025 16:10", by: "Guardião de Conteúdo", line: "Duração ideal entre 5 e 12 segundos" }
  },
  guardian: {
    score: 92,
    label: "Excelente",
    attention: [
      "Incluir exemplo de gancho para Reels.",
      "Adicionar recomendações de horários ideais de publicação."
    ],
    checklist: [
      "Alinhado à estratégia da marca",
      "Clareza e objetividade",
      "Coerência e consistência",
      "Conformidade com diretrizes",
      "Valor e aplicabilidade"
    ]
  }
}

/* ============== RELATÓRIOS ============== */

export const reportStats = [
  { label: "Custo total OpenRouter", value: "R$ 12.842,32", delta: "12,4% vs. período anterior", dir: "up" as const, tone: "green" as Tone, icon: "dollar" },
  { label: "Total de chamadas", value: "58.376", delta: "18,6% vs. período anterior", dir: "up" as const, tone: "blue" as Tone, icon: "phone" },
  { label: "Tokens consumidos", value: "145,2M", delta: "23,1% vs. período anterior", dir: "up" as const, tone: "purple" as Tone, icon: "database" },
  { label: "Eficiência média", value: "0,87", delta: "6,2% vs. período anterior", dir: "up" as const, tone: "teal" as Tone, icon: "refresh" },
  { label: "Execuções concluídas", value: "54.912", delta: "94,1% do total", dir: "up" as const, tone: "green" as Tone, icon: "check" },
  { label: "Economia estimada", value: "R$ 3.214,87", delta: "19,3% vs. período anterior", dir: "up" as const, tone: "amber" as Tone, icon: "piggy" }
]

export const costOverTime = {
  labels: ["22 Abr", "25 Abr", "29 Abr", "2 Mai", "6 Mai", "9 Mai", "13 Mai", "16 Mai", "20 Mai"],
  points: [1980, 2650, 2200, 3050, 2480, 3320, 2760, 3480, 3210]
}

export const callsByAgent = [
  { label: "Orquestrador", value: 21482 },
  { label: "Redes Sociais", value: 12764 },
  { label: "Pesquisa", value: 8943 },
  { label: "Revisão", value: 6211 },
  { label: "Memória", value: 5318 },
  { label: "Tráfego", value: 3658 }
]

export const tokensByModel = [
  { label: "GPT-4o", value: 48.2, color: "#6d35ee" },
  { label: "Claude 3.5 Sonnet", value: 24.7, color: "#8b5cf6" },
  { label: "Gemini 1.5 Pro", value: 12.9, color: "#2563eb" },
  { label: "Llama 3.1 70B", value: 8.6, color: "#0d9488" },
  { label: "Mixtral 8x22B", value: 3.8, color: "#f97316" },
  { label: "Outros", value: 1.8, color: "#cbd0dd" }
]

export const costByWorkflow = [
  { label: "Produção de conteúdo", value: 4812.5 },
  { label: "Social Media", value: 3127.66 },
  { label: "Pesquisa & Insights", value: 2345.21 },
  { label: "Análise de desempenho", value: 1742.11 },
  { label: "Revisão & QA", value: 1028.84 },
  { label: "Outros", value: 785.99 }
]

export const agentPerformance = [
  { agent: "Orquestrador", calls: "21.482", tokens: "54,2M", cost: "R$ 4.812,50", eff: "0,89", delta: "5,2%", dir: "up", success: "95,1%" },
  { agent: "Redes Sociais", calls: "12.764", tokens: "31,8M", cost: "R$ 3.127,66", eff: "0,86", delta: "3,1%", dir: "up", success: "93,7%" },
  { agent: "Pesquisa", calls: "8.943", tokens: "21,6M", cost: "R$ 2.345,21", eff: "0,91", delta: "8,6%", dir: "up", success: "95,8%" },
  { agent: "Revisão", calls: "6.211", tokens: "14,2M", cost: "R$ 1.742,11", eff: "0,88", delta: "2,8%", dir: "up", success: "94,3%" },
  { agent: "Memória", calls: "5.318", tokens: "11,9M", cost: "R$ 1.028,84", eff: "0,84", delta: "1,1%", dir: "down", success: "91,2%" }
]

export const modelTable = [
  { model: "GPT-4o", tokens: "69,9M", pct: "48,2%", cost: "R$ 6.186,21", per1m: "R$ 88,46", eff: "0,91", delta: "6,3%", dir: "up" },
  { model: "Claude 3.5 Sonnet", tokens: "35,9M", pct: "24,7%", cost: "R$ 3.172,15", per1m: "R$ 88,27", eff: "0,89", delta: "4,1%", dir: "up" },
  { model: "Gemini 1.5 Pro", tokens: "18,7M", pct: "12,9%", cost: "R$ 1.652,31", per1m: "R$ 88,29", eff: "0,87", delta: "2,3%", dir: "up" },
  { model: "Llama 3.1 70B", tokens: "12,5M", pct: "8,6%", cost: "R$ 1.109,88", per1m: "R$ 88,79", eff: "0,84", delta: "0,8%", dir: "down" },
  { model: "Mixtral 8x22B", tokens: "5,5M", pct: "3,8%", cost: "R$ 435,34", per1m: "R$ 79,15", eff: "0,83", delta: "1,3%", dir: "down" }
]

export const reportInsights = [
  { icon: "share", title: "Fluxos mais utilizados", text: "Produção de conteúdo, Social Media e Pesquisa & Insights concentram 77% do custo total.", link: "Ver detalhes" },
  { icon: "alert", title: "Anomalias detectadas", text: "Aumento incomum de custo no fluxo Social Media entre 10–12 de maio.", link: "Ver análise" },
  { icon: "trend", title: "Oportunidades de otimização", text: "Trocar GPT-4o por Claude 3.5 Sonnet em Social Media pode reduzir custos em até R$ 742,21 (18%).", link: "Ver oportunidades" },
  { icon: "check", title: "Ações sugeridas", text: "Revisar prompts do Orquestrador. Otimizar fluxo de Revisão & QA. Padronizar modelo por fluxo.", link: "Ver plano de ação" }
]

export const potentialSaving = { value: "R$ 1.128,46", window: "nos próximos 30 dias" }

/* ============== REDES & TRÁFEGO (provisório) ============== */

export const networkStats = [
  { label: "Seguidores", value: "84,2k", delta: "3,1% no mês", dir: "up" as const, tone: "pink" as Tone },
  { label: "Alcance", value: "1,2M", delta: "12,4% no mês", dir: "up" as const, tone: "purple" as Tone },
  { label: "Engajamento", value: "5,8%", delta: "0,6 p.p.", dir: "up" as const, tone: "teal" as Tone },
  { label: "Investimento Ads", value: "R$ 18.430", delta: "8,2% no mês", dir: "up" as const, tone: "blue" as Tone }
]

export const networkSeries = {
  labels: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
  points: [42000, 58000, 51000, 73000, 69000, 88000, 96000, 112000]
}

export const adCampaigns = [
  { name: "Lançamento Q2 — Tráfego", objective: "Tráfego", status: "Ativa", statusTone: "green" as Tone, spend: "R$ 6.240", roas: "3,8x", ctr: "2,4%" },
  { name: "Remarketing Carrinho", objective: "Conversão", status: "Ativa", statusTone: "green" as Tone, spend: "R$ 4.120", roas: "5,1x", ctr: "3,1%" },
  { name: "Awareness Marca Duofy", objective: "Alcance", status: "Pausada", statusTone: "amber" as Tone, spend: "R$ 3.870", roas: "—", ctr: "1,2%" },
  { name: "Geração de Leads B2B", objective: "Leads", status: "Ativa", statusTone: "green" as Tone, spend: "R$ 4.200", roas: "2,9x", ctr: "1,9%" }
]

export const audienceSplit = [
  { label: "18–24", value: 22, color: "#6d35ee" },
  { label: "25–34", value: 38, color: "#8b5cf6" },
  { label: "35–44", value: 24, color: "#2563eb" },
  { label: "45+", value: 16, color: "#0d9488" }
]

export const funnelSteps = [
  { label: "Impressões", value: 1200000 },
  { label: "Cliques", value: 84000 },
  { label: "Visitas", value: 61000 },
  { label: "Leads", value: 9400 },
  { label: "Conversões", value: 2100 }
]

/* ============== ADMINISTRAÇÃO (provisório) ============== */

export const adminAgents = [
  { name: "Orquestrador", slug: "orchestrator", model: "claude-sonnet-latest", skills: 6, status: "Ativo", tone: "green" as Tone },
  { name: "Pesquisa e Inteligência", slug: "research_agent", model: "claude-sonnet-latest", skills: 4, status: "Ativo", tone: "green" as Tone },
  { name: "Cocriação e Conteúdo", slug: "content_agent", model: "claude-sonnet-latest", skills: 5, status: "Ativo", tone: "green" as Tone },
  { name: "Calendário e Campanhas", slug: "calendar_agent", model: "claude-sonnet-latest", skills: 3, status: "Ativo", tone: "green" as Tone },
  { name: "Assessoria de Imprensa", slug: "press_agent", model: "claude-sonnet-latest", skills: 3, status: "Ativo", tone: "green" as Tone },
  { name: "Métricas e Análise", slug: "metrics_agent", model: "gpt-4o-mini", skills: 2, status: "Ativo", tone: "green" as Tone },
  { name: "Guardião de Qualidade", slug: "quality_guardian", model: "claude-sonnet-latest", skills: 4, status: "Ativo", tone: "green" as Tone }
]

export const adminProviders = [
  { name: "OpenRouter", status: "Conectado", tone: "green" as Tone, model: "anthropic/claude-sonnet-latest" },
  { name: "Anthropic", status: "Desconectado", tone: "slate" as Tone, model: "—" },
  { name: "OpenAI", status: "Desconectado", tone: "slate" as Tone, model: "—" },
  { name: "OpenAI Embeddings", status: "Desconectado", tone: "slate" as Tone, model: "—" },
  { name: "Apify", status: "Desconectado", tone: "slate" as Tone, model: "—" }
]

export const adminLimits = [
  { label: "Orçamento mensal", value: "R$ 20.000", used: 64 },
  { label: "Tokens / dia", value: "8,0M", used: 71 },
  { label: "Chamadas / min", value: "120", used: 38 }
]
