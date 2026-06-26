# Comandos e Checks

## Subir ambiente

```bash
docker compose up --build
```

## Backend

```bash
cd apps/api
python -m pytest
python -m ruff check .
alembic upgrade head
```

## Frontend

```bash
cd apps/web
npm install
npm run lint
npm run build
```

## Health

```bash
curl http://localhost:8000/health
```

## Regra de relatório do agente de desenvolvimento

Toda fase deve terminar com:

1. O que foi feito.
2. Arquivos criados/alterados.
3. Como rodar.
4. Testes executados.
5. Falhas encontradas.
6. Próxima fase recomendada.
