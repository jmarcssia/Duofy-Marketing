# Formato — Campanha (multi-peça)

> Uma campanha coordena múltiplas peças (post, carrossel, e-mail, landing page etc.) em torno de um
> único objetivo e uma única mensagem central, distribuídas ao longo de um período. Este formato
> descreve a estrutura de planejamento; cada peça individual segue seu próprio formato específico.

## Estrutura de saída

1. **Objetivo da campanha** e **persona(s)-alvo**.
2. **Mensagem central (big idea)** — a ideia única que todas as peças reforçam, cada uma a partir de
   um ângulo diferente. Todas as peças devem ser reconhecíveis como parte da mesma campanha.
3. **Duração e janela de veiculação**.
4. **Jornada dentro da campanha** — como as peças se conectam ao longo do tempo (ex.: teaser →
   conteúdo de autoridade → prova/aprofundamento → conversão), coerente com a jornada do perfil de
   marca (`brands/*.md`).
5. **Mapa de peças** — lista de cada peça planejada, com:
   - Formato (post único, carrossel, e-mail, landing page etc.).
   - Canal.
   - Papel na jornada da campanha (topo, meio, fundo).
   - Data/ordem de publicação sugerida.
6. **Coerência visual da campanha** — diretriz curta de continuidade estética entre as peças (mesma
   paleta conceitual, mesmo tom fotográfico), reforçada explicitamente em cada prompt de imagem
   individual (nunca por referência implícita entre peças — ver `visual/image-prompt-engine.md`).
7. **CTA por etapa** — como o CTA evolui da etapa de topo (interação/atenção) para a etapa de fundo
   (conversão/consultoria), coerente com o perfil de marca.

## Regras

- Toda peça da campanha é gerada seguindo o formato específico dela (`carousel.md`, `email.md` etc.)
  — este documento só define a orquestração entre elas.
- A big idea não pode ser tão genérica que qualquer peça sirva para qualquer campanha — precisa ser
  específica ao tema/calendário que originou a campanha.
- Não repetir a mesma peça em canais diferentes sem adaptação de formato e tom (ver `linkedin.md` vs
  `post-unico.md`).
