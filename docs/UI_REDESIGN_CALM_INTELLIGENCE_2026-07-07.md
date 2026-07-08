# Redesign de UI/UX — "Calm Intelligence" (2026-07-07)

> Refinamento visual significativo + mais clean + correção de pendências, num sistema coeso.
> Branch: `feature/ui-redesign-calm-intelligence`. Verificado ao vivo (Playwright) + build/lint/tsc.

## Direção de design
Um console de **inteligência de marketing** sereno e editorial — papel neutro calmo, **uma tinta de
marca** roxo-índigo mais séria, **um único acento quente** (signal) para atenção/Guardião, tipografia
com voz de display real e cartões "flat". A assinatura: **cor por marca** (a gestora sempre sente em
qual marca está) e o **fio de fluxo** da jornada no login. Fugimos dos 3 defaults de IA (cream+serif+
terracotta; preto+verde-ácido; broadsheet).

## O que mudou

### 1. Tokens, tipografia e sombra (transforma o app inteiro de forma coesa)
- `tailwind.config.ts`: paleta refinada (nomes preservados p/ compat) — `ink #17161f`, `paper #faf9fd`,
  `line #e8e7f0`, marca `brand #5a34e0` (unifica purple/purple-deep), acento `signal #c17722`,
  semânticas harmonizadas. **O roxo genérico #6d35ee foi 100% substituído** (verificado: 0 ocorrências).
- **Fontes reais** (`layout.tsx`): **Hanken Grotesk** (display — títulos/KPIs), **Inter** (UI/corpo),
  **JetBrains Mono** (números/IDs). Antes era só Inter (sem voz de display).
- `globals.css`: **cartões "flat"** (borda 1px + sombra mínima — o maior salto "clean"), foco/hover na
  marca, `prefers-reduced-motion` respeitado, `.tabular` p/ métricas.

### 2. Primitivos consolidados (`components/ui.tsx`)
- PageHeader/StatCard/SectionHeader/ProgressRing agora em **display font**; ProgressRing recolorido na
  escala nova. Novos: **Card, SectionCard, PrimaryButton, SecondaryButton** e um **Toast global**
  (`ToastProvider`/`useToast`, montado no `(app)/layout`).
- **Removido código morto/duplicado:** `components/page-primitives.tsx` (2ª biblioteca de primitivos),
  `lib/ui.ts` (0 imports), e as páginas órfãs `admin/config` + `admin/agents` (duplicatas de `/admin`).

### 3. Shell (`app-shell.tsx`)
- **Container canônico** `max-w-[1280px]` (antes cada página esticava sem limite).
- **Navegação agrupada** pela jornada: **Operar · Produzir · Governar**, com micro-rótulos e **barra
  ativa** de 3px + wash da marca (antes: 8 itens chapados).
- **Seletor de marca** virou um controle de destaque com **swatch de cor por marca** (`lib/brand-accent.ts`)
  — antes era um `<select>` nativo apagado.
- Topbar 78→64px, sem blur pesado; avatar coeso; fundo `paper`.

### 4. Login (`login-form.tsx`)
Refeito no idioma do console: painel-tese escuro com a frase "Marketing com IA, sob supervisão humana"
em display + **fio de fluxo** (Pesquisa→…→Publicação), formulário paper com CTA de marca. Corrige o
**duplo redirect** (`/dashboard`→`/operations`) indo direto a `/operations`.

### 5. Correções de pendências
- **Erros crus não vazam mais**: `friendlyError` aplicado em ~24 catches de fluxos de escrita (admin,
  calendário, publicações, peças, memória, painel do evento) — antes o JSON bruto do backend aparecia na UI.
- **`apiFetch` endurecido**: trata **401** (limpa sessão + redireciona ao login) e **corpo vazio**
  (não vira "Unexpected end of JSON input").
- **`window.alert` → toast** (memória, relatórios).
- **`allowedPiecesFor`/`PIECES_BY_CHANNEL`** duplicados byte-a-byte → `lib/pieces.ts` (fonte única).
- **H1 crus** (calendário/memória/relatórios) unificados na voz display; cores do donut atualizadas.

## Verificação (ao vivo, Playwright + build)
- Build: ✅ `next build` (24 rotas; órfãs removidas). Lint: ✅ sem warnings. tsc: ✅ sem erros.
- Ao vivo: fundo `#faf9fd`, **h1 em Hanken 26px**, topbar 64px, nav **Operar/Produzir/Governar**,
  **swatch teal #0d7d72 para DeathCare** (cor por marca), cards com sombra flat (0.04) + borda #e8e7f0 +
  raio 18px, **0 ocorrências do roxo antigo**, **0 erros de console** em /operations, /research, /calendar.

## Roadmap (pendências menores não fechadas)
- `window.prompt` (nome de template / feedback de ajuste em Pesquisa e Revisão) → trocar por modal inline.
- Deep-links da busca global e do painel de evento ainda caem na raiz da lista (páginas-alvo precisam
  ler `?focus=<id>`).
- Contagens client-side (Revisão/Calendário) limitadas por `limit` fixo — mover a contagem para o backend.
- Stubs de rota (`/insights`, `/redes`, `/workspace`, `/costs`, `/dashboard`) e limpeza do `middleware`.
- Aplicar o "fio de fluxo" (stepper) também dentro das telas da jornada (Pesquisa→…→Publicação).
