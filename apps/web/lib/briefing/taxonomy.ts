/**
 * Taxonomia central de filtros/briefings (FASE 3).
 *
 * Fonte única das opções clicáveis usadas pelo BriefingBuilder em:
 * criação de evento no calendário, Agente de Pesquisa e Agente de Cocriação.
 * As chaves de `StructuredBriefing` (types.ts) casam com o backend
 * (apps/api/app/briefing_filters.py) — evoluir aqui não quebra o contrato:
 * o backend ignora chaves desconhecidas.
 */

export type Option = { id: string; label: string; hint?: string }

const opt = (id: string, label: string, hint?: string): Option => ({ id, label, hint })

/* ---------------- 2. Segmento ---------------- */

export const SEGMENTOS: Option[] = [
  opt("deathcare", "DeathCare"),
  opt("postos", "Postos de Combustíveis"),
  opt("institucional", "Institucional Duofy"),
  opt("tecnologia", "Tecnologia / ERP / Gestão"),
  opt("outro", "Outros")
]

/** Segmento default por marca (slug técnico do sistema). */
export const SEGMENTO_POR_MARCA: Record<string, string> = {
  deathcare: "deathcare",
  postos_combustiveis: "postos",
  duofy_solucoes: "institucional"
}

/* ---------------- 3/4. Subsegmentos ---------------- */

export const SUBSEGMENTOS_DEATHCARE: Option[] = [
  opt("funerarias", "Funerárias"),
  opt("planos_funerarios", "Planos funerários"),
  opt("cemiterios", "Cemitérios"),
  opt("crematorios", "Crematórios"),
  opt("atendimento_24h", "Atendimento 24h"),
  opt("gestao_comercial", "Gestão comercial"),
  opt("gestao_financeira", "Gestão financeira"),
  opt("equipe_frota", "Equipe e frota"),
  opt("contratos_faturamento", "Contratos e faturamento")
]

export const SUBSEGMENTOS_POSTOS: Option[] = [
  opt("gestao_comercial_pricing", "Gestão comercial e pricing"),
  opt("estoque_combustiveis", "Controle de estoque de combustíveis"),
  opt("financeiro_caixa", "Gestão financeira e caixa"),
  opt("conveniencia", "Conveniência e serviços agregados"),
  opt("equipe_compliance", "Equipe e compliance trabalhista"),
  opt("multi_unidade", "Gestão multi-unidade"),
  opt("pdv", "PDV"),
  opt("app_gestao", "APP Gestão"),
  opt("retaguarda", "Retaguarda"),
  opt("frotas", "Frotas"),
  opt("totem_pagamento", "Totem de pagamento")
]

export function subsegmentosPara(segmento: string | undefined): Option[] {
  if (segmento === "deathcare") return SUBSEGMENTOS_DEATHCARE
  if (segmento === "postos") return SUBSEGMENTOS_POSTOS
  return []
}

/* ---------------- 5. Persona que sente a dor ---------------- */

export const PERSONAS: Option[] = [
  opt("diretor_comercial", "Diretor Comercial"),
  opt("gerente_vendas", "Gerente de Vendas"),
  opt("coordenador_operacoes", "Coordenador de Operações"),
  opt("supervisor_atendimento", "Supervisor de Atendimento"),
  opt("gerente_operacional", "Gerente Operacional"),
  opt("gestor_logistica", "Gestor de Logística"),
  opt("coordenador_frota", "Coordenador de Frota"),
  opt("administrador_cemiterio", "Administrador de Cemitério"),
  opt("gestor_patrimonio", "Gestor de Patrimônio"),
  opt("gerente_financeiro", "Gerente Financeiro"),
  opt("controladoria", "Controladoria"),
  opt("gerente_comercial", "Gerente Comercial"),
  opt("supervisor_pista", "Supervisor de Pista"),
  opt("gerente_operacoes", "Gerente de Operações"),
  opt("responsavel_caixa", "Responsável pelo caixa"),
  opt("gerente_loja", "Gerente de Loja"),
  opt("comprador", "Comprador"),
  opt("supervisor_rh", "Supervisor de RH"),
  opt("controller", "Controller"),
  opt("analista_bi", "Analista de BI")
]

/* ---------------- 6. Decisor ---------------- */

export const DECISORES: Option[] = [
  opt("ceo", "CEO"),
  opt("diretor_geral", "Diretor Geral"),
  opt("diretor_operacoes", "Diretor de Operações"),
  opt("coo", "COO"),
  opt("cfo", "CFO"),
  opt("proprietario", "Proprietário"),
  opt("diretor_financeiro", "Diretor Financeiro"),
  opt("juridico", "Jurídico"),
  opt("diretor_expansao", "Diretor de Expansão"),
  opt("gerente_geral", "Gerente Geral")
]

/* ---------------- 7. Jornada / etapa de negócio ---------------- */

export const JORNADAS_DEATHCARE: Option[] = [
  opt("vendas_planos", "Vendas e gestão de planos"),
  opt("atendimento_24h", "Atendimento 24h"),
  opt("pos_vida", "Atendimento pós-vida"),
  opt("equipe_frota", "Equipe e frota"),
  opt("cemiterios_cremacao", "Cemitérios e cremação"),
  opt("contratos_faturamento", "Contratos e faturamento")
]

export const JORNADAS_POSTOS: Option[] = [
  opt("pricing", "Pricing"),
  opt("estoque", "Estoque"),
  opt("caixa_financeiro", "Caixa e financeiro"),
  opt("conveniencia", "Conveniência"),
  opt("equipe", "Equipe"),
  opt("multi_unidade", "Multi-unidade"),
  opt("pdv", "PDV"),
  opt("retaguarda", "Retaguarda"),
  opt("gestao_movel", "Gestão móvel"),
  opt("frotas", "Frotas"),
  opt("atendimento_cliente", "Atendimento ao cliente")
]

export const JORNADAS_MARKETING: Option[] = [
  opt("topo_funil", "Topo de funil"),
  opt("meio_funil", "Meio de funil"),
  opt("fundo_funil", "Fundo de funil"),
  opt("nutricao_leads", "Nutrição de leads"),
  opt("pos_venda", "Pós-venda"),
  opt("awareness", "Awareness"),
  opt("geracao_demanda", "Geração de demanda"),
  opt("conversao", "Conversão"),
  opt("relacionamento", "Relacionamento"),
  opt("autoridade", "Autoridade"),
  opt("institucional", "Institucional")
]

export function jornadasPara(segmento: string | undefined): Option[] {
  if (segmento === "deathcare") return JORNADAS_DEATHCARE
  if (segmento === "postos") return JORNADAS_POSTOS
  return []
}

/* ---------------- 8. Objetivo ---------------- */

export const OBJETIVOS: Option[] = [
  opt("pesquisar_mercado", "Pesquisar mercado"),
  opt("identificar_tendencia", "Identificar tendência"),
  opt("analisar_concorrencia", "Analisar concorrência"),
  opt("gerar_pauta", "Gerar pauta"),
  opt("conteudo_educativo", "Criar conteúdo educativo"),
  opt("conteudo_comercial", "Criar conteúdo comercial"),
  opt("criar_campanha", "Criar campanha"),
  opt("nutrir_leads", "Nutrir leads"),
  opt("gerar_autoridade", "Gerar autoridade"),
  opt("assessoria_imprensa", "Preparar assessoria de imprensa"),
  opt("apoiar_evento", "Apoiar evento"),
  opt("lancar_produto", "Lançar produto"),
  opt("explicar_solucao", "Explicar solução"),
  opt("quebrar_objecoes", "Quebrar objeções"),
  opt("material_vendas", "Produzir material para vendas")
]

/* ---------------- 9. Tipo de pesquisa ---------------- */

export const TIPOS_PESQUISA: Option[] = [
  opt("mercado", "Mercado"),
  opt("concorrencia", "Concorrência"),
  opt("tendencias", "Tendências"),
  opt("oportunidades", "Oportunidades"),
  opt("personas", "Personas"),
  opt("objecoes", "Objeções"),
  opt("benchmark", "Benchmark"),
  opt("swot", "SWOT"),
  opt("pestel", "PESTEL"),
  opt("dores_necessidades", "Dores e necessidades"),
  opt("narrativas", "Narrativas de conteúdo"),
  opt("fontes_estatisticas", "Fontes e estatísticas"),
  opt("campanha", "Pesquisa para campanha"),
  opt("imprensa", "Pesquisa para imprensa")
]

/* ---------------- 10. Escopo geográfico ---------------- */

export const ESCOPOS_GEO: Option[] = [
  opt("brasil", "Brasil"),
  opt("nacional", "Nacional"),
  opt("regional", "Regional"),
  opt("estadual", "Estadual"),
  opt("local", "Local"),
  opt("internacional", "Internacional"),
  opt("america_latina", "América Latina"),
  opt("estado_especifico", "Estado específico"),
  opt("cidade_especifica", "Cidade específica")
]

/* ---------------- 11. Período analisado ---------------- */

export const PERIODOS: Option[] = [
  opt("ultimos 7 dias", "Últimos 7 dias"),
  opt("ultimos 30 dias", "Últimos 30 dias"),
  opt("ultimos 90 dias", "Últimos 90 dias"),
  opt("ultimos 6 meses", "Últimos 6 meses"),
  opt("ultimo ano", "Último ano"),
  opt("2024", "2024"),
  opt("2025", "2025"),
  opt("2026", "2026"),
  opt("personalizado", "Personalizado")
]

/* ---------------- 12. Profundidade ---------------- */

/** Profundidade da taxonomia → depth do backend (quick|standard|deep). */
export const PROFUNDIDADES: (Option & { depth: "quick" | "standard" | "deep" })[] = [
  { ...opt("rapida", "Rápida", "menos fontes, resposta rápida"), depth: "quick" },
  { ...opt("padrao", "Padrão", "equilíbrio entre amplitude e tempo"), depth: "standard" },
  { ...opt("profunda", "Profunda", "mais fontes e profundidade"), depth: "deep" },
  { ...opt("consultiva", "Consultiva", "análise densa com recomendações"), depth: "deep" },
  { ...opt("executiva", "Executiva", "síntese para decisão de diretoria"), depth: "deep" }
]

/* ---------------- 13. Fontes ---------------- */

export const FONTES: Option[] = [
  opt("web_aberta", "Web aberta"),
  opt("noticias", "Notícias"),
  opt("documentos_internos", "Documentos internos"),
  opt("rag_institucional", "RAG institucional"),
  opt("relatorios", "Relatórios"),
  opt("sites_concorrentes", "Sites de concorrentes"),
  opt("redes_sociais", "Redes sociais"),
  opt("google_news", "Google News/RSS"),
  opt("duckduckgo", "DuckDuckGo"),
  opt("apify", "Apify (se habilitado)"),
  opt("manual", "Manual/anexo")
]

/* ---------------- 14. Entregáveis da pesquisa ---------------- */

export const ENTREGAVEIS: Option[] = [
  opt("resumo_executivo", "Resumo executivo"),
  opt("insights", "Insights"),
  opt("matriz_evidencias", "Matriz de evidências"),
  opt("concorrentes", "Concorrentes"),
  opt("oportunidades", "Oportunidades"),
  opt("riscos", "Riscos"),
  opt("swot", "SWOT"),
  opt("objecoes", "Objeções"),
  opt("ideias_conteudo", "Ideias de conteúdo"),
  opt("recomendacoes", "Recomendações"),
  opt("fontes_citadas", "Fontes citadas"),
  opt("tabela_comparativa", "Tabela comparativa"),
  opt("pauta_imprensa", "Pauta para imprensa"),
  opt("briefing_cocriacao", "Briefing para cocriação")
]

/* ---------------- 15. Canais de conteúdo ---------------- */

export const CANAIS: Option[] = [
  opt("Instagram", "Instagram"),
  opt("LinkedIn", "LinkedIn"),
  opt("WhatsApp", "WhatsApp"),
  opt("E-mail", "E-mail"),
  opt("Blog", "Blog"),
  opt("Facebook", "Facebook"),
  opt("Release", "Release"),
  opt("Pitch", "Pitch para imprensa"),
  opt("Landing page", "Landing page")
]

/* ---------------- 16. Formatos ---------------- */

export const FORMATOS: Option[] = [
  opt("Carrossel", "Carrossel"),
  opt("Post único", "Post único"),
  opt("Legenda", "Legenda"),
  opt("Artigo", "Artigo"),
  opt("Blog post", "Blog post"),
  opt("E-mail marketing", "E-mail marketing"),
  opt("Mensagem curta WhatsApp", "Mensagem curta WhatsApp"),
  opt("Sequência de nutrição", "Sequência curta de nutrição"),
  opt("Release", "Release"),
  opt("Pitch", "Pitch"),
  opt("Nota curta", "Nota curta"),
  opt("Roteiro", "Roteiro"),
  opt("Checklist", "Checklist"),
  opt("Infográfico", "Infográfico"),
  opt("Peça de campanha", "Peça de campanha"),
  opt("Texto institucional", "Texto institucional"),
  opt("Reels", "Reels"),
  opt("Stories", "Stories")
]

/* ---------------- 17. Peças e subpeças ---------------- */

/** id = kind do backend (content_pieces) quando existir; rótulo é o que o gestor vê. */
export const PECAS: Option[] = [
  opt("carousel", "Roteiro do carrossel + texto por slide"),
  opt("caption_instagram", "Legenda Instagram"),
  opt("caption_linkedin", "Legenda LinkedIn"),
  opt("whatsapp", "Mensagem WhatsApp"),
  opt("whatsapp_image_prompt", "Imagem opcional para WhatsApp (prompt)"),
  opt("email", "E-mail (assunto + preheader + corpo + CTA)"),
  opt("blog", "Blog post"),
  opt("release", "Release"),
  opt("pitch", "Pitch para imprensa"),
  opt("landing_page", "Landing page"),
  opt("visual_direction", "Direção de arte / prompts visuais")
]

/** Peças que o Agente de Cocriação gera via `pieces` (kinds extras). */
export const PECAS_EXTRAS_IDS = [
  "whatsapp",
  "whatsapp_image_prompt",
  "email",
  "blog",
  "release",
  "pitch",
  "landing_page"
] as const

/* ---------------- 18. Tom de voz ---------------- */

export const TONS: Option[] = [
  opt("institucional", "Institucional"),
  opt("consultivo", "Consultivo"),
  opt("educativo", "Educativo"),
  opt("tecnico", "Técnico"),
  opt("comercial_leve", "Comercial leve"),
  opt("comercial_direto", "Comercial direto"),
  opt("autoridade", "Autoridade"),
  opt("proximo", "Próximo"),
  opt("executivo", "Executivo"),
  opt("jornalistico", "Jornalístico"),
  opt("sensivel_respeitoso", "Sensível e respeitoso (DeathCare)"),
  opt("objetivo_operacional", "Objetivo e operacional (Postos)")
]

/** Tom default por segmento (regra de produto). */
export const TOM_POR_SEGMENTO: Record<string, string> = {
  deathcare: "sensivel_respeitoso",
  postos: "objetivo_operacional",
  institucional: "institucional"
}

/* ---------------- 19. CTA ---------------- */

export const CTAS: Option[] = [
  opt("falar_especialista", "Falar com especialista"),
  opt("solicitar_demo", "Solicitar demonstração"),
  opt("conhecer_solucao", "Conhecer solução"),
  opt("baixar_material", "Baixar material"),
  opt("ler_artigo", "Ler artigo"),
  opt("entrar_contato", "Entrar em contato"),
  opt("agendar_conversa", "Agendar conversa"),
  opt("ver_case", "Ver case"),
  opt("responder_mensagem", "Responder mensagem"),
  opt("sem_cta", "Sem CTA comercial"),
  opt("personalizado", "CTA personalizado")
]

/* ---------------- 20. Restrições de marca/conteúdo ---------------- */

export const RESTRICOES: Option[] = [
  opt("sem_logo", "Não usar logo nas imagens"),
  opt("sem_hashtag_imagem", "Não colocar hashtags na imagem"),
  opt("sem_promessa", "Não usar promessa exagerada"),
  opt("sem_numero_sem_fonte", "Não citar números sem fonte"),
  opt("sem_sensacionalismo", "Não usar linguagem sensacionalista"),
  opt("sem_tom_frio_deathcare", "Não usar tom frio para DeathCare"),
  opt("sem_tom_informal", "Não usar tom informal demais"),
  opt("adaptar_por_canal", "Adaptar texto por canal"),
  opt("mesmo_carrossel_ig_li", "Manter mesmo carrossel para Instagram e LinkedIn"),
  opt("legendas_diferentes", "Gerar legendas diferentes por canal"),
  opt("prompts_separados", "Gerar prompts visuais separados"),
  opt("prompt_unico_carrossel", "Gerar prompt único para carrossel"),
  opt("prompt_por_slide", "Gerar prompt por slide")
]

/** Restrições sempre ativas por padrão (postura do sistema). */
export const RESTRICOES_DEFAULT = [
  "sem_logo",
  "sem_hashtag_imagem",
  "sem_numero_sem_fonte",
  "mesmo_carrossel_ig_li",
  "legendas_diferentes"
]

/* ---------------- 23. Publicação ---------------- */

export const PUBLICACAO_MODOS: Option[] = [
  opt("manual", "Publicação manual"),
  opt("meta_auto", "Publicação automática Meta (se configurada)"),
  opt("preparar", "Apenas preparar publicação")
]

export const PUBLICACAO_REQUISITOS: Option[] = [
  opt("upload_imagem", "Requer upload de imagem"),
  opt("video", "Requer vídeo"),
  opt("carrossel", "Carrossel"),
  opt("feed", "Feed"),
  opt("stories", "Stories"),
  opt("reels", "Reels"),
  opt("facebook", "Facebook"),
  opt("instagram", "Instagram")
]

/* ---------------- 25. Dependências (workflow do evento) ---------------- */

export const DEPENDENCIAS: Option[] = [
  opt("pesquisa_antes", "Executar pesquisa antes"),
  opt("aprovar_pesquisa", "Exigir aprovação da pesquisa"),
  opt("cocriar_apos_aprovacao", "Executar cocriação após aprovação"),
  opt("revisar_pecas", "Revisar peças obrigatórias"),
  opt("publicar_apos_aprovacao", "Publicar só após aprovação"),
  opt("sem_dependencia", "Sem dependência")
]

/* ---------------- FASE 4/6: finalidade da cocriação ---------------- */

export const FINALIDADES: Option[] = [
  opt("redes_sociais", "Redes sociais"),
  opt("nutricao_leads", "Nutrição de leads"),
  opt("imprensa", "Imprensa"),
  opt("campanha", "Campanha"),
  opt("institucional", "Institucional"),
  opt("vendas", "Vendas"),
  opt("evento", "Evento")
]

/* ---------------- FASE 4: tipos e templates de evento ---------------- */

export const TIPOS_EVENTO: Option[] = [
  opt("research", "Pesquisa", "só o Agente de Pesquisa"),
  opt("research_content", "Pesquisa + Conteúdo", "pipeline completo com aprovação"),
  opt("content", "Conteúdo", "cocriação direta"),
  opt("task", "Tarefa"),
  opt("meeting", "Reunião"),
  opt("event", "Evento"),
  opt("delivery", "Entrega"),
  opt("publication", "Publicação")
]

export type EventTemplate = {
  id: string
  label: string
  hint: string
  event_type: string
  briefing?: Partial<Record<string, unknown>>
  channels?: string[]
  formats?: string[]
  pieces?: string[]
  requires_research_approval?: boolean
}

export const TEMPLATES_EVENTO: EventTemplate[] = [
  {
    id: "pesquisa_mercado",
    label: "Pesquisa de mercado",
    hint: "mercado + tendências + concorrência",
    event_type: "research",
    briefing: { tipos_pesquisa: ["mercado", "tendencias", "concorrencia"], entregaveis: ["resumo_executivo", "insights", "recomendacoes", "fontes_citadas"] }
  },
  {
    id: "pesquisa_campanha",
    label: "Pesquisa para campanha",
    hint: "insumos para campanha",
    event_type: "research",
    briefing: { tipos_pesquisa: ["campanha", "personas", "objecoes"], entregaveis: ["insights", "ideias_conteudo", "briefing_cocriacao"] }
  },
  {
    id: "conteudo_multicanal",
    label: "Conteúdo multicanal",
    hint: "IG + LinkedIn + WhatsApp + E-mail",
    event_type: "research_content",
    channels: ["Instagram", "LinkedIn", "WhatsApp", "E-mail"],
    formats: ["Carrossel"],
    pieces: ["carousel", "caption_instagram", "caption_linkedin", "whatsapp", "email", "visual_direction"]
  },
  {
    id: "carrossel_ig_li",
    label: "Carrossel Instagram + LinkedIn",
    hint: "mesmo carrossel, legendas diferentes",
    event_type: "content",
    channels: ["Instagram", "LinkedIn"],
    formats: ["Carrossel"],
    pieces: ["carousel", "caption_instagram", "caption_linkedin", "visual_direction"]
  },
  {
    id: "nutricao_wa_email",
    label: "Nutrição WhatsApp + E-mail",
    hint: "mensagens curtas + e-mail",
    event_type: "content",
    channels: ["WhatsApp", "E-mail"],
    formats: ["Mensagem curta WhatsApp", "E-mail marketing"],
    pieces: ["whatsapp", "whatsapp_image_prompt", "email"],
    briefing: { nutricao: { canais: ["ambos"], opcoes: ["mensagem_curta", "mensagem_alternativa", "prompt_imagem"] } }
  },
  {
    id: "release_imprensa",
    label: "Release para imprensa",
    hint: "release + pitch",
    event_type: "content",
    channels: ["Release", "Pitch"],
    formats: ["Release", "Pitch"],
    pieces: ["release", "pitch"],
    briefing: { imprensa: { entregas: ["release", "pitch_jornalista", "mensagens_chave"] }, finalidade: "imprensa" }
  },
  {
    id: "campanha_evento",
    label: "Campanha de evento",
    hint: "pesquisa + peças de divulgação",
    event_type: "research_content",
    channels: ["Instagram", "LinkedIn", "E-mail"],
    formats: ["Peça de campanha"],
    briefing: { finalidade: "evento", objetivos: ["apoiar_evento", "criar_campanha"] }
  },
  {
    id: "publicacao_manual",
    label: "Publicação manual",
    hint: "registrar publicação por fora",
    event_type: "publication",
    briefing: { publicacao: { modo: "manual" } }
  },
  { id: "tarefa_simples", label: "Tarefa simples", hint: "sem agente", event_type: "task" },
  { id: "reuniao", label: "Reunião", hint: "sem agente", event_type: "meeting" }
]

/* ---------------- FASE 5: templates de pesquisa ---------------- */

export type ResearchTemplate = {
  id: string
  label: string
  pergunta: string
  briefing?: Partial<Record<string, unknown>>
}

export const TEMPLATES_PESQUISA: ResearchTemplate[] = [
  {
    id: "mercado",
    label: "Análise de mercado",
    pergunta: "Análise de mercado e dimensionamento do setor",
    briefing: { tipos_pesquisa: ["mercado"], entregaveis: ["resumo_executivo", "insights", "fontes_citadas"] }
  },
  {
    id: "concorrencia",
    label: "Concorrência",
    pergunta: "Mapeamento de concorrentes, posicionamento e diferenciais",
    briefing: { tipos_pesquisa: ["concorrencia", "benchmark"], entregaveis: ["concorrentes", "tabela_comparativa"] }
  },
  {
    id: "tendencias",
    label: "Tendências do setor",
    pergunta: "Tendências e sinais de mercado para 2026",
    briefing: { tipos_pesquisa: ["tendencias"], entregaveis: ["insights", "oportunidades"] }
  },
  {
    id: "jornada",
    label: "Jornada do cliente",
    pergunta: "Jornada de compra, dores e pontos de decisão do cliente",
    briefing: { tipos_pesquisa: ["personas", "dores_necessidades"], entregaveis: ["insights", "objecoes"] }
  },
  {
    id: "oportunidades",
    label: "Oportunidades",
    pergunta: "Oportunidades de crescimento e nichos pouco explorados",
    briefing: { tipos_pesquisa: ["oportunidades"], entregaveis: ["oportunidades", "recomendacoes"] }
  },
  {
    id: "lancamento",
    label: "Lançamento de produto",
    pergunta: "Pesquisa para lançamento: cenário, riscos e go-to-market",
    briefing: { tipos_pesquisa: ["mercado", "oportunidades"], objetivos: ["lancar_produto"], entregaveis: ["riscos", "recomendacoes", "swot"] }
  },
  {
    id: "imprensa",
    label: "Pauta para imprensa",
    pergunta: "Levantamento de dados e ângulos para pauta de imprensa",
    briefing: { tipos_pesquisa: ["imprensa", "fontes_estatisticas"], entregaveis: ["pauta_imprensa", "fontes_citadas"] }
  },
  {
    id: "swot",
    label: "SWOT",
    pergunta: "Análise SWOT do segmento e posicionamento da marca",
    briefing: { tipos_pesquisa: ["swot"], entregaveis: ["swot", "recomendacoes"] }
  }
]

/** Helper: rótulo de uma opção pelo id (procura em uma lista). */
export function labelOf(options: Option[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id
}

/** Helper: rótulos de vários ids. */
export function labelsOf(options: Option[], ids: string[] | undefined): string[] {
  return (ids ?? []).map((id) => labelOf(options, id))
}
