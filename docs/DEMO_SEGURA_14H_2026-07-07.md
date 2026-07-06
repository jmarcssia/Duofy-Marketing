# Roteiro Seguro de Demonstração — 07/07/2026, 14h

> **Mensagem do produto:** "V1 funcional e demonstrável, pronta para uso interno controlado,
> com próximos passos claros para produção." **Não** vender como produção final.
> Este roteiro foi desenhado para uma apresentação de ~15–20 min, com **um único operador**,
> em ambiente dev (`docker compose up -d`), sem sustos.

---

## 0. Antes de começar (checklist de 5 min)

- [ ] `docker compose up -d` — confirme `duofy-web`, `duofy-api`, `duofy-postgres`, `duofy-redis` saudáveis.
- [ ] Abra `http://localhost:3000` e **faça login uma vez** para aquecer (o primeiro request compila a rota).
- [ ] Confirme no seletor de marcas (topo) os **3 nomes oficiais**: TOTVS Varejo Postos de Combustíveis,
      Gestão DeathCare by Duofy, Duofy Soluções.
- [ ] Tenha esta aba aberta e o roteiro à mão. **Não** compartilhe a tela de terminal.
- [ ] Se o admin não existir: `docker exec duofy-api python -m app.seed`.

**Credenciais** (não estão mais pré-preenchidas na tela — digite):
- **Admin:** `admin@duofy.com.br` / `admin123456`
- **Gerente restrito (isolamento):** `manager.deathcare@duofy.com.br` / `manager123456`

---

## 1. Marca principal da demo: **TOTVS Varejo Postos de Combustíveis**

É a marca com a **jornada completa e real**: pesquisa aprovada + conteúdo aprovado com peças +
publicação registrada + eventos em julho/2026. **Todo o fluxo principal deve ser mostrado nela.**
DeathCare e Duofy também têm jornada completa (curada), mas Postos é a mais robusta.

---

## 2. Ordem de apresentação (o que clicar)

### 2.1 Operações (abertura — 2 min)
- Entre como **admin**. Mostre o dashboard: resumo de uso, saúde dos agentes, e o **chat do
  Orquestrador** à direita. Explique que é o "centro de comando".
- **Não** dispare uma pergunta longa ao Orquestrador ao vivo (pode levar 1–2 min). Se quiser mostrar
  o chat, use algo curto e avise que a resposta real leva ~1 min.

### 2.2 Calendário (o centro operacional — 4 min)
- Selecione **TOTVS Varejo Postos de Combustíveis** no topo. Abra **Calendário** → julho/2026.
- Mostre os eventos existentes. Abra um evento e percorra as abas (Visão geral, Briefing, Peças, Automação).
- Clique **Novo evento** → mostre o **wizard de 6 etapas** (Tipo → Marca/template → Briefing →
  Datas → Peças/aprovação → Resumo). **Aplique um template** para pré-preencher.
- **Pode criar o evento** (é barato, não dispara IA). **Não** clique "Executar pesquisa" ao vivo a
  menos que aceite esperar ~1 min (ver §4).

### 2.3 Agente de Pesquisa (3 min)
- Vá em **Agente de Pesquisa**. Mostre uma **pesquisa já aprovada** de Postos: o relatório, as
  **fontes reais** e o **briefing estruturado em chips** acima das fontes.
- Explique o gate: pesquisa passa pelo **Guardião de Qualidade** (nota ≥ 80) antes de ser aprovada.
- **Evite** iniciar uma pesquisa nova ao vivo (1–2 min). Se for fazer, ver §4 (plano B).

### 2.4 Agente de Cocriação + Peças (4 min)
- Vá em **Agente de Cocriação**. Mostre um **pacote já gerado** de Postos: o **mesmo carrossel**
  para Instagram e LinkedIn com **legendas diferentes**, e as **peças extras** (WhatsApp, e-mail).
- Mostre a **Revisão de Peças**: cada peça aprovável individualmente; o botão **Refinar** (explique
  que regenera só aquela peça). Quando as obrigatórias são aprovadas, o conteúdo vira **Aprovado**.
- **Não** exporte PDF logo após refinar uma peça ao vivo — o PDF agora **inclui as peças atuais e
  avisa** se houver divergência, mas o fluxo mais limpo é aprovar e depois exportar.

### 2.5 Publicações (2 min)
- Vá em **Publicações**. Mostre o **compositor**, o **upload de mídia** e a **fila**.
- Registre uma **publicação manual** de um conteúdo aprovado (isso funciona de verdade).
- **Explique o stub da Meta** (fala pronta em §6) e **não clique "Publicar na Meta"** ao vivo — ele
  retorna um 400 honesto ("em breve"), o que é correto mas quebra o ritmo.

### 2.6 Revisão e Relatórios (2 min)
- **Revisão** (`/approvals`): visão consolidada de itens aguardando aprovação.
- **Relatórios**: custo real de IA, tokens por modelo/agente, publicações registradas. A marca
  aparece com o **nome oficial**.

### 2.7 Isolamento por marca (o diferencial de segurança — 2 min)
- **Faça logout** e entre como **`manager.deathcare@duofy.com.br`**.
- Mostre que ele só vê **Gestão DeathCare by Duofy**: Calendário, Pesquisa, Conteúdo e Relatórios
  filtrados. O seletor de marcas mostra só DeathCare.
- (Opcional, técnico) Explique que uma tentativa de acessar dado de outra marca por URL direta
  retorna **404** — o sistema não vaza nem a existência do recurso.

---

## 3. O que **NÃO** clicar ao vivo

| Ação | Por quê | O que fazer |
|---|---|---|
| **Publicar na Meta** | Stub honesto → 400 "em breve" | Mostrar o caminho **manual**; explicar Meta (§6) |
| **Executar pesquisa / cocriação nova** sem avisar | Leva 1–2 min (IA real) | Usar dados já prontos; se for demonstrar, ver §4 |
| **Exportar PDF logo após refinar peça** | O PDF agora avisa/anexa peças, mas o fluxo limpo é aprovar antes | Aprovar as peças, depois exportar |
| Chat longo do Orquestrador ao vivo | Síncrono, ~1 min | Perguntas curtas, avisando a espera |
| Sino de notificações | (Corrigido — mostra contagem real) | Pode abrir; é honesto agora |
| Aba "Erros" em Publicações | Vazia por design em V1 | Não é foco; ignore |

---

## 4. Plano B se a IA demorar / travar

- **Pesquisa/cocriação real leva 1–2 min.** O sistema tem **polling anti-timeout**: o painel do
  evento continua acompanhando mesmo que o proxy encerre em ~30s. **Deixe rodando e narre** ("a
  pesquisa real consulta fontes e leva cerca de um minuto").
- Se **erro rápido** aparecer (ex.: fontes insuficientes), a UI agora mostra a **mensagem clara na
  hora** (não fica girando 210s). Basta ler a mensagem e seguir com os dados já prontos.
- **Regra de ouro:** todos os artefatos necessários **já existem** no banco (pesquisa aprovada,
  conteúdo com peças, publicação). Se algo ao vivo falhar, **volte para o item pronto** e continue.
- Não rode pesquisa "Profunda" nem loops de geração — só "Rápida" e no máximo 1 execução.

---

## 5. Dados que estão seedados (por marca)

| Marca | Pesquisa aprovada | Conteúdo aprovado c/ peças | Publicação | Eventos jul/2026 |
|---|---|---|---|---|
| **TOTVS Varejo Postos** | ✅ | ✅ (#70, 3 peças) | ✅ manual | ✅ |
| **Gestão DeathCare** | ✅ | ✅ (#72, real, curado hoje) | ✅ manual | ✅ |
| **Duofy Soluções** | ✅ | ✅ (#59) | ✅ manual | ✅ |

Usuário de demonstração de isolamento: `manager.deathcare` (escopo só DeathCare). Login testado ✓.

---

## 6. Falas prontas

**Sobre a Meta (stub):**
> "A publicação **manual** já está funcional — você registra o que foi publicado e isso entra nos
> relatórios. A publicação **automática na Meta** (Instagram/Facebook via API) é a próxima fase de
> integração; o sistema é honesto sobre isso e **nunca finge** que publicou. É uma decisão de
> engenharia: preferimos não simular sucesso."

**Sobre uso interno controlado:**
> "Esta é a V1: o núcleo — pesquisa, cocriação multicanal, calendário como centro operacional,
> revisão por peça e governança por marca — está **real e funcionando de ponta a ponta**. Está
> pronta para **uso interno controlado**. Para produção externa multi-cliente, o roadmap é claro:
> integração Meta, endpoints de IA assíncronos e o fechamento final do hardening — nada disso é
> incerteza de produto, são passos de engenharia planejados."

**Sobre segurança por marca:**
> "Cada usuário só enxerga as marcas do seu escopo — conteúdo, pesquisa, relatórios e memória. Uma
> tentativa de acesso fora do escopo retorna 'não encontrado', sem vazar nem a existência do dado."

---

## 7. Pontos que ainda são roadmap (seja transparente se perguntarem)

- **Meta real** (Graph API/OAuth) — próxima fase.
- **Endpoints de IA assíncronos** — hoje a espera de 1–2 min é mitigada por polling.
- **Worker de lembrete/recorrência** — as datas avançadas do evento são registradas, mas ainda não
  disparam lembretes automáticos.
- **Publicação agendada automática** — o agendamento é registrado; o disparo automático é roadmap.
- **Testes de frontend (Playwright/Vitest)** e upgrade do Next.js (npm audit) — tarefas isoladas.
