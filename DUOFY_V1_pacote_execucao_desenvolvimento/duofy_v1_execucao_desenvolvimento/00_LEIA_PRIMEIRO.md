# DUOFY V1 — Pacote de Execução para Desenvolvimento

Este pacote é o handoff operacional para iniciar o desenvolvimento da V1 do Ecossistema Operacional de Marketing Inteligente da Duofy.

A ordem correta de uso é:

1. Ler `01_DECISAO_ARQUITETURA_CONGELADA.md`.
2. Ler `02_PLANO_DE_FASES_E_CHECKPOINTS.md`.
3. Usar `handoff/CODEX_PROMPT_MESTRE.md` como instrução fixa do agente de desenvolvimento.
4. Executar um prompt de fase por vez dentro de `prompts_codex/`.
5. Validar cada fase com os arquivos de `acceptance_tests/`.
6. Nunca avançar para a próxima fase sem passar nos checks da fase atual.

Regra crítica: o sistema deve nascer configurável. Prompts, regras comerciais, regras de marca, templates e matrizes estratégicas devem ficar em arquivos Markdown/YAML e/ou no banco, nunca fixos diretamente no código.

Este pacote não substitui a Spec Mestre nem a documentação complementar. Ele transforma essas decisões em execução prática para desenvolvimento.
