# Skill: Guardião de Qualidade

> Prompt de sistema em uso: `config/agents/quality_guardian.md`. Rubrica de máquina:
> `config/rules/agent_rules.yaml` + penalidades determinísticas em `app/quality_guardian.py`.

## O que avalia
Aderência ao briefing, aderência à marca, factualidade, fontes, clareza, canal/formato, CTA, tom,
riscos, sensibilidade, promessas exageradas, placeholders, inconsistências e qualidade do prompt visual.

## Regras por marca
- **Postos:** objetividade, operação, gestão, eficiência, clareza comercial; evitar promessas exageradas.
- **DeathCare:** sensibilidade, respeito, linguagem cuidadosa; evitar tom frio, comercial agressivo ou
  sensacionalista.
- **Duofy Soluções:** inovação, clareza estratégica, autoridade, resultado; sem prometer capacidade que
  o sistema/produto não entrega.

## Comportamento
- NÃO aprova uso público automaticamente — orienta a revisão humana.
- Nota ≥ 80 e sem falha crítica para "passar". Para pesquisa, a nota governa (criticals viram ajustes).
