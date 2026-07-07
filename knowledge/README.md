# Base de conhecimento (Markdown/YAML) — Duofy V1

Fonte preferencial de conhecimento para os agentes (RAG). Markdown/YAML são tratados como
**fontes de regras/tom/personas/exemplos/playbooks**; PDF/DOCX servem como fontes originais.

## Como usar
1. Escreva/edite os arquivos abaixo (Markdown ou YAML).
2. Faça upload em **Memória → Documentos**, escolhendo a **marca** correta (ou "institucional"
   para conteúdo que vale para todas). O upload já gera chunks + embedding e entra no RAG.
3. Para conteúdo institucional (comum a todas as marcas), use o escopo `institucional`.

O agente busca, por marca selecionada: **contexto institucional + contexto da marca + regras do
canal/formato + pesquisa aprovada (se houver) + exemplos relevantes**.

## Estrutura recomendada

```
knowledge/
  institucional/
    contexto_geral.md
    governanca.md
    regras_de_conteudo.md
  brands/
    postos_combustiveis/  (tom_de_voz, personas, produtos, dores, objecoes, exemplos_bons, exemplos_ruins)
    deathcare/            (idem + sensibilidade)
    duofy_solucoes/       (posicionamento, personas, solucoes, dores, objecoes, exemplos_bons, exemplos_ruins)
  channels/
    instagram.md · linkedin.md · whatsapp.md · email.md · blog.md · release.md
  playbooks/
    pesquisa_mercado.md · cocriacao_multicanal.md · revisao_guardiao.md
```

> Os arquivos aqui são **sementes/templates**. Preencha com o conhecimento real da operação; o
> valor do RAG vem da qualidade e especificidade destes documentos.
