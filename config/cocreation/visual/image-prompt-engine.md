# Motor de Prompt de Imagem — Cocriação

> Cada prompt de imagem gerado pelo agente de Cocriação é **completo e independente**. Nunca escrever
> "mantenha o estilo do slide anterior", "igual à imagem anterior" ou qualquer referência implícita a
> outra peça — o modelo de geração de imagem não tem memória entre chamadas. Toda coerência visual
> entre peças de uma mesma campanha ou carrossel é obtida **repetindo explicitamente** paleta, estilo
> e tratamento em cada prompt individual.

## Campos obrigatórios de todo prompt de imagem

1. **Proporção** — formato exato da peça (ex.: 1:1 feed, 4:5 feed vertical, 9:16 stories/reels,
   16:9 paisagem/blog/capa).
2. **Finalidade** — para que peça e canal esta imagem se destina (contextualiza decisões de composição).
3. **Contexto** — o que a imagem precisa comunicar dentro da peça (conceito, não descrição literal do texto).
4. **Cenário** — ambiente específico e plausível (ex.: "escritório administrativo de porte médio,
   mesa organizada, luz de janela lateral").
5. **Personagem/objeto** — quem ou o que aparece, com descrição funcional (idade aproximada, papel na
   cena, vestuário coerente com o contexto profissional — nunca descrição que objetifique ou
   estereotipe).
6. **Enquadramento** — plano e ângulo exatos.
7. **Posição dos elementos** — onde cada elemento fica no quadro (ex.: "personagem à esquerda,
   ocupando um terço do quadro; espaço negativo à direita reservado para texto").
8. **Composição** — regra de composição aplicada (terços, ponto focal, linha guia).
9. **Luz** — direção, qualidade e temperatura da luz.
10. **Profundidade** — o que está em foco, o que está desfocado ao fundo.
11. **Tratamento** — realismo fotográfico editorial, grão sutil, ausência de tratamento "plástico de IA".
12. **Paleta** — cores exatas conceituais da marca em uso, repetidas explicitamente mesmo que já
    tenham aparecido em prompt anterior da mesma peça/campanha.
13. **Hierarquia visual** — o que deve chamar atenção primeiro.
14. **Espaço de segurança (safe space)** — área da imagem reservada, sem elementos importantes, para
    acomodar texto, logo ou @ que serão inseridos depois na etapa de acabamento manual.
15. **Elementos proibidos** — lista explícita do que não deve aparecer (ver regras obrigatórias abaixo
    e `negative-rules.md`).

## Regras obrigatórias — nunca solicitar no prompt de imagem

- **Nunca** pedir logotipo (TOTVS, Duofy, ou qualquer marca) dentro da imagem gerada.
- **Nunca** pedir selo de parceiro ou selo de certificação dentro da imagem.
- **Nunca** pedir símbolo de arroba (@) ou handle de rede social na imagem.
- **Nunca** pedir hashtag renderizada dentro da imagem.
- **Nunca** pedir marca d'água.
- **Nunca** pedir assinatura, rubrica ou nome de pessoa real renderizado como texto de autenticação.
- **Nunca** pedir texto extra além do texto exato definido para aquela peça (nada de texto de
  preenchimento, nada de "lorem ipsum visual", nada de frase inventada solta na imagem).
- **Nunca** pedir nome de sistema, software ou interface inventada (não existe tela de produto
  específica a menos que documentada — não inventar nome de tela, menu ou funcionalidade).
- **Nunca** pedir número inventado renderizado como texto/dado na imagem (gráfico com valor fictício,
  KPI inventado, percentual sem fonte).
- **Nunca** pedir qualquer logotipo de terceiros, ícone de rede social de terceiros, ou referência a
  marca concorrente.

## Texto da arte é separado do prompt visual

Quando a peça exige texto sobreposto na imagem (título de carrossel, headline de post), esse texto
**sai em campo próprio** do formato da peça (ver `formats/*.md`, campo "texto exato do slide/imagem"),
nunca embutido dentro do prompt de geração de imagem como instrução de renderização de texto — modelos
de imagem renderizam texto mal, e a inserção correta de texto/logo/@ acontece na etapa de edição,
depois da geração da imagem-base.

## Espaço para acabamento manual

Todo prompt deve prever e descrever explicitamente uma área de respiro (canto, faixa lateral, ou
espaço negativo) para que logo, @ e eventuais elementos de marca sejam inseridos posteriormente na
interface de edição — a geração de imagem entrega a base, não a peça finalizada.

## Estrutura recomendada de escrita do prompt (ordem sugerida)

Proporção → finalidade/contexto → cenário → personagem/objeto → enquadramento e posição → composição
→ luz → profundidade → tratamento → paleta → hierarquia → espaço de segurança → elementos proibidos.
