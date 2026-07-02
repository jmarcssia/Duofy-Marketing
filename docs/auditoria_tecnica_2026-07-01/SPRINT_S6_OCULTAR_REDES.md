# Sprint Núcleo de Agentes — S6: Ocultar /redes e integrações fora de escopo (concluído)

**Objetivo:** remover da experiência ativa o que é mock/fora de escopo V1, sem apagar histórico.

## Mudanças
- **`components/app-shell.tsx`** — item "Redes & Tráfego" removido da navegação; import `ShareIcon` (agora sem uso) removido.
- **`app/(app)/redes/page.tsx`** — passa a **redirecionar para `/operations`**. O painel era 100% mock (Instagram Insights / Meta Ads sem integração real); o mock fica preservado no histórico do git e volta quando houver integração.
- **`middleware.ts`** — `/redes` removido de `protectedPrefixes` e do `matcher`.
- Integrações "Em breve" do Admin (Meta Ads, Google Sheets, Tavily, SendGrid) já vêm marcadas/desabilitadas — permanecem sinalizadas como fora de escopo.

## Verificação
```
next lint → ✔ No ESLint warnings or errors
```
`/redes` inacessível pela navegação e sem exibir dados falsos (redireciona). Backend inalterado.

## Critérios de aceite (S6) — atendidos
- [x] `/redes` fora da navegação.
- [x] `middleware`/`matcher` limpos de `/redes`.
- [x] Mock não é mais exibido (redirect), código preservado no histórico.
