# Prompt Codex — Fase 2: Auth, Layout e Seed

Implemente autenticação real, layout base e seeds iniciais.

## Objetivo

Permitir login com JWT, criar usuários simples, marcas e agentes iniciais no banco.

## Requisitos

1. Criar migrations Alembic para:
   - `users`
   - `brands`
   - `agents`
   - `settings`
2. Criar modelos SQLAlchemy.
3. Implementar login com e-mail/senha e JWT.
4. Implementar roles simples:
   - `admin`
   - `manager`
5. Criar endpoints:
   - `POST /api/auth/login`
   - `POST /api/auth/logout`
   - `GET /api/auth/me`
   - `GET /api/brands`
   - `GET /api/admin/agents`
6. Criar tela de login.
7. Criar layout autenticado com menu lateral.
8. Criar dashboard inicial protegido.
9. Criar seed com:
   - admin padrão via env;
   - Duofy Soluções;
   - TOTVS Postos de Combustíveis by Duofy;
   - TOTVS Gestão DeathCare by Duofy;
   - seis agentes da V1.

## Critérios de pronto

- Login funciona.
- Token protege páginas/endpoints.
- Dashboard aparece após login.
- Marcas aparecem em filtro/lista.
- Agents aparecem no admin.

## Responda no final

- Arquivos criados/alterados.
- Como rodar migrations e seed.
- Checks executados.
- Pendências.
