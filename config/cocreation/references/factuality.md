# Classificação de Factualidade — Cocriação

> Toda afirmação usada em conteúdo deve ser classificada mentalmente pelo agente antes de entrar no
> texto final. O nível de confiança determina como (ou se) a afirmação pode ser usada.

## Níveis de classificação

### 1. Fato confirmado
Informação presente de forma explícita na documentação interna oficial (RAG) ou em dado primário da
marca, sem ambiguidade. Pode ser afirmado diretamente, sem ressalva.
*Exemplo de uso:* descrição de um módulo do produto conforme documentado internamente.

### 2. Evidência documental
Informação apoiada por documento (pesquisa aprovada, relatório setorial, material interno) mas que
exige contextualização — não é uma verdade absoluta e atemporal, é o que a fonte mostrou naquele
recorte. Pode ser afirmado citando a natureza da fonte de forma implícita no tom ("dados do setor
indicam...") sem inventar a fonte especificamente se ela não puder ser nomeada.

### 3. Interpretação
Leitura ou conclusão do agente/estrategista a partir de fatos confirmados ou evidência documental.
Deve ser marcada linguisticamente como interpretação ("isso sugere...", "na prática, isso costuma
significar...") e nunca apresentada com a mesma força de um fato.

### 4. Sinal de mercado
Percepção de tendência, movimento de setor ou padrão observado, sem comprovação robusta — por exemplo,
pesquisa de baixa confiança, dado desatualizado, ou tendência mencionada informalmente. Deve ser
tratado com cautela explícita ("temos observado...", "é um movimento que vem ganhando força..."),
nunca como número ou estatística fechada.

### 5. Hipótese
Raciocínio plausível do agente sem lastro documental direto. Só pode aparecer como reflexão aberta ou
pergunta retórica ao leitor — nunca como afirmação categórica, nunca como dado.

### 6. Não confirmado
Qualquer coisa que o agente não consegue rastrear a nenhuma fonte disponível. **Não entra no
conteúdo.** Se for essencial para a peça, o agente sinaliza a lacuna ao usuário em vez de inventar.

## Regras obrigatórias

- **Número precisa de fonte.** Nenhum percentual, valor monetário, prazo ou quantidade aparece no
  conteúdo sem estar em uma fonte classificada como nível 1 ou 2.
- **Funcionalidade precisa existir na documentação.** Nenhuma feature, integração ou capacidade de
  produto é mencionada sem estar descrita na base de conhecimento interna.
- **Hipótese nunca vira fato.** É proibido reescrever uma frase de nível 5 removendo a marcação
  linguística de incerteza para "soar mais forte" — isso transforma hipótese em fato falso.
- **Pesquisa de baixa confiança exige linguagem não categórica.** Termos como "sempre", "todo mundo",
  "garantido", "comprovado" são proibidos quando a fonte de base é nível 4 ou inferior.
- **Case e cliente nomeado exigem fonte nível 1 explícita.** Nunca inferir ou generalizar um case a
  partir de uma menção parcial.
- Em caso de dúvida sobre o nível de uma afirmação, o agente deve classificar no nível mais
  conservador (mais incerto), não no mais favorável ao texto.
