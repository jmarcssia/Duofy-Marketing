# Roteiro de Demo DUOFY V1

## Preparacao

1. Subir a stack completa:

```powershell
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed
```

2. Acessar:

- Web: http://localhost:3000
- Login: `admin@duofy.com.br`
- Senha: `admin123456`

3. Configurar provedores em `Admin > Configuracoes`:

- OpenRouter para chat/agentes/conteudo/pesquisa.
- OpenAI Embeddings opcional para embeddings reais.

## Fluxo sugerido

1. Abrir `Memoria / Documentos` e subir um arquivo TXT/MD de contexto da marca.
2. Usar a busca RAG para confirmar que o trecho aparece.
3. Abrir `Chat` e pedir:

```text
Gere um post LinkedIn sobre inadimplencia em planos funerarios usando a memoria da marca.
```

4. Acompanhar a tarefa ate `Concluida`.
5. Abrir `Conteudos`, revisar o output gerado e enviar para aprovacao.
6. Abrir `Aprovacoes`, aprovar e criar memoria.
7. Abrir `Pesquisa`, rodar uma pesquisa curta com fontes.
8. Salvar o relatorio como memoria ou usar em conteudo.
9. Abrir `Calendario`, gerar eventos e executar um item manualmente.
10. Abrir `Custos` e validar tokens/custo da chamada.
11. Abrir `Insights`, gerar snapshot e exportar PDF.
12. Em `Conteudos`, exportar PDF de um output.

## Observacoes

- A V1 nao publica externamente.
- Custos sao estimativas locais, nao billing oficial.
- Worker Celery precisa estar ativo para o chat executar tarefas.
