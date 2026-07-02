# Regras Negativas Consolidadas — Visual e Prompt

> Lista consolidada de proibições visuais e de prompt para consulta rápida do agente antes de emitir
> qualquer prompt de imagem. Complementa `visual-direction.md` (estética) e `image-prompt-engine.md`
> (estrutura de prompt).

## Proibições universais de conteúdo de marca no prompt

- Logotipo de qualquer marca (Duofy, TOTVS, parceiros, concorrentes).
- Selo de certificação ou selo de parceria.
- Símbolo de arroba (@) ou handle de rede social.
- Hashtag renderizada na imagem.
- Marca d'água.
- Assinatura ou rubrica.
- Texto extra não definido explicitamente no campo de texto da peça.
- Nome de sistema, tela de produto, menu ou funcionalidade inventada.
- Número, KPI, gráfico ou dado sem fonte documental (nada de estatística fictícia visível na imagem).

## Proibições estéticas universais

- Holograma, robô genérico, interface futurista de ficção científica.
- Neon, "dashboard mágico flutuante", telas holográficas.
- Pessoas em pose encenada apontando para gráfico de forma vazia.
- Estética de banco de imagens (sorriso artificial, grupo batendo a mão sobre mesa de vidro, pose
  genérica de stock photo).
- Excesso de ícones decorativos flutuantes sem função informativa.
- Aparência genérica de IA: textura plástica, simetria excessiva, mãos malformadas, elementos sem
  lógica física ou perspectiva quebrada.
- Composição lotada sem espaço negativo.

## Proibições específicas — DeathCare

- Caixão, corpo, sepultamento, lápide em primeiro plano, cerimônia fúnebre explícita.
- Expressão de choro, luto ou dor explícita no rosto de qualquer personagem.
- Iconografia mórbida usada de forma dramática (cruz em destaque exagerado, ambiente sombrio
  intencionalmente perturbador).
- Qualquer cenário que sugira urgência, medo ou exploração emocional do momento da perda.

## Proibições específicas — Postos de Combustíveis

- "Frentista sorrindo para câmera" genérico de banco de imagens.
- Bomba de combustível como protagonista vazio da composição sem função narrativa.
- Cenário de posto irreal, "perfeito demais" ou fora do padrão real de operação brasileira.
- Preço de combustível visível em qualquer painel/totem dentro da imagem.

## Proibições específicas — Duofy institucional

- Robô ou IA antropomorfizada como personagem central.
- Qualquer elemento visual que sugira automação sem supervisão humana (ex.: sistema "rodando sozinho"
  sem presença humana na cena, quando o conceito exige mostrar governança).

## Checklist rápido antes de emitir o prompt

1. Tem logo, selo, @, hashtag, marca d'água ou assinatura pedidos? Remover.
2. Tem número, dado ou nome de sistema inventado pedido como texto na imagem? Remover.
3. Tem elemento da lista de proibições estéticas universais? Reformular.
4. Se DeathCare: tem qualquer elemento da lista de proibições específicas do segmento? Reformular.
5. Se Postos: tem qualquer elemento da lista de proibições específicas do segmento? Reformular.
6. Existe espaço de segurança descrito explicitamente para acabamento manual? Adicionar se faltar.
