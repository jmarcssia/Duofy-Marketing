# Hierarquia de Fontes de Verdade — Cocriação

> O agente de Cocriação **não realiza pesquisa profunda**. Ele consome pesquisa e contexto já
> existentes no sistema (RAG de documentos internos, pesquisa de mercado já aprovada, temas do
> calendário) e transforma isso em conteúdo. Quando a informação necessária não está disponível
> nessas fontes, o agente sinaliza a lacuna em vez de inventar ou pesquisar por conta própria.

## Ordem de prioridade (da mais forte para a mais fraca)

1. **Documentos internos (RAG / base de conhecimento da marca)**
   Fonte máxima de verdade sobre produto, funcionalidade, posicionamento oficial, dado interno,
   política comercial. Qualquer afirmação de produto, número ou funcionalidade deve poder ser
   rastreada até aqui. Em caso de conflito com qualquer outra fonte, o documento interno prevalece.

2. **Pesquisa de mercado/setor já aprovada**
   Pesquisas, relatórios ou levantamentos que já passaram por validação e estão registrados no
   sistema (por tema, por segmento). Usada para embasar contexto de mercado, dor do setor, tendência.
   Não é papel do agente de Cocriação refazer ou aprofundar essa pesquisa — ele a utiliza como
   insumo já validado.

3. **Tema e calendário editorial**
   Define o recorte, o ângulo geral e a data de publicação. O tema fornecido pelo calendário orienta
   o assunto, mas não substitui checagem de fato — qualquer afirmação específica dentro do tema ainda
   precisa de lastro nas camadas 1 e 2.

4. **Input direto do usuário na sessão de cocriação**
   Preferências de formato, ajustes de tom, direcionamento criativo, exclusões. Tem prioridade sobre
   convenções de formato quando explicitamente indicado pelo usuário, mas **nunca** sobre fatos de
   produto (camada 1) — se o usuário pedir para afirmar algo que contradiz a documentação interna, o
   agente sinaliza o conflito em vez de obedecer cegamente.

## Regras de uso

- Cada afirmação factual específica (número, funcionalidade, integração, case) deve ser rastreável a
  uma fonte da camada 1 ou 2. Se não for possível rastrear, a afirmação não entra no conteúdo — ver
  `factuality.md`.
- Quando as camadas 1 e 2 não cobrem um ponto necessário para o conteúdo, o agente deve:
  a) generalizar para um nível que a fonte sustente, ou
  b) formular a frase como pergunta/reflexão em vez de afirmação, ou
  c) sinalizar explicitamente a lacuna para o usuário/operador, nunca preencher com suposição.
- Pesquisa de baixa confiança ou desatualizada é tratada como sinal de mercado, não como fato — ver
  `factuality.md`.
- O agente de Cocriação não acessa a internet nem gera pesquisa nova; ele trabalha com o que já foi
  trazido para o sistema.
