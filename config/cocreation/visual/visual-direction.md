# Direção Visual — Motor de Cocriação

> Este documento define o que a direção visual decide em cada peça e a estética geral preferida entre
> os segmentos. Cada perfil de marca (`brands/*.md`) refina paleta e restrições específicas — este
> documento traz o padrão transversal e o vocabulário de decisão que todo prompt de imagem deve cobrir.

## O que a direção visual decide, sempre

1. **Conceito** — a ideia visual que representa o conceito central da peça (não ilustração literal
   óbvia do texto).
2. **Estilo** — fotografia realista editorial, ilustração, ou composição gráfica — definido conforme
   marca e formato, nunca por padrão genérico.
3. **Cenário** — onde a cena acontece; deve ser plausível e brasileiro quando aplicável (ambientes,
   iluminação, sinalização coerentes com o contexto real do público).
4. **Personagem/objeto** — quem ou o que está em cena, com papel funcional na composição, nunca
   decorativo genérico.
5. **Enquadramento** — plano (aberto, médio, close), ângulo, nível dos olhos.
6. **Composição** — regra dos terços, ponto focal único, espaço negativo intencional.
7. **Hierarquia** — o que o olho vê primeiro, segundo, terceiro.
8. **Iluminação** — natural, direcional, suave; deve reforçar o tom da marca (serena, prática, limpa).
9. **Profundidade** — uso de plano de fundo desfocado ou camadas para dar dimensão sem poluir.
10. **Paleta** — cores conceituais da marca aplicadas com moderação (acento, não dominância).
11. **Textura e tratamento** — realismo fotográfico, grão sutil se editorial; evitar aspecto
    plástico/renderizado de IA genérica.
12. **Tipografia** (quando há texto embutido na arte) — hierarquia clara, fonte coerente com a marca,
    legibilidade em primeiro lugar.
13. **Respiro** — espaço vazio suficiente; composição nunca lotada.
14. **Continuidade** — como esta peça se conecta visualmente a outras da mesma marca/campanha (via
    repetição explícita de paleta/estilo no prompt, nunca por referência implícita).
15. **Restrições** — elementos proibidos por marca e elementos proibidos universais (ver `negative-rules.md`).

## Direção estética preferida (padrão transversal)

- Fotografia realista, estética editorial (like revista de negócios, não banco de imagens genérico).
- Ambientes brasileiros plausíveis — escritórios, operações, pessoas e cenários que existiriam de
  fato no contexto do público-alvo, não sets artificiais.
- Minimalismo com hierarquia clara — poucos elementos, cada um com função.
- Luz natural ou direcional suave, nunca dura ou artificial em excesso.

## O que evitar sempre (padrão transversal)

- Holograma, robô sem contexto, interface futurista genérica de ficção científica.
- Neon, telas flutuantes, "dashboard mágico no ar".
- Pessoas apontando para gráficos de forma encenada e vazia.
- Cara de banco de imagens (sorrisos artificiais, poses genéricas, grupo de pessoas batendo mão
  sobre uma mesa de vidro).
- Excesso de ícones flutuantes decorativos sem função informativa.
- Aparência genérica de imagem gerada por IA (textura plástica, mãos malformadas, simetria artificial
  excessiva, elementos sem lógica física).

## Aplicação por marca

Consultar a seção "Direção visual" de cada perfil (`brands/duofy.md`, `brands/deathcare.md`,
`brands/postos.md`) para paleta conceitual e restrições específicas do segmento antes de gerar
qualquer prompt de imagem.
