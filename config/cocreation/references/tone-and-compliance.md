# Tom e Compliance — Cocriação

> Regras transversais de tom aplicadas a todo conteúdo, mais as regras específicas de sensibilidade
> por segmento. Estas regras têm prioridade sobre preferência estética pontual — em caso de conflito
> entre "soar mais interessante" e "respeitar a regra de sensibilidade", a regra vence.

## Regras gerais de tom (todas as marcas)

- Escrever como um especialista conversando com um par, não como um vendedor gritando para uma
  multidão.
- Evidência e clareza antes de adjetivo. Corte todo adjetivo que não acrescenta informação.
- Uma ideia central por peça. Não empilhar múltiplos argumentos desconexos para parecer mais completo.
- Nunca fingir intimidade que não existe ("a gente sabe como é difícil..." só se for coerente com o
  tom da marca específica).

## Clichês de IA a evitar (todas as marcas)

- Aberturas genéricas: "No mundo atual, cada vez mais...", "Você sabia que...", "Em um cenário de
  constantes mudanças...".
- Encerramentos genéricos: "Entre em contato e descubra como podemos ajudar!", "As possibilidades são
  infinitas!".
- Listas de adjetivos vazios em sequência ("inovador, disruptivo, revolucionário").
- Emojis decorativos sem função (✨🚀💡) usados como muleta de entusiasmo.
- Frases de efeito sem conteúdo real ("a transformação começa agora").
- Perguntas retóricas óbvias usadas só para preencher espaço ("Já pensou nisso?").
- Estrutura repetitiva de "problema-agitação-solução" aplicada de forma mecânica e reconhecível.
- Uso de "desbloquear", "elevar", "impulsionar", "potencializar" como verbos-coringa vazios.

## Regras específicas por segmento

### DeathCare — sensibilidade crítica

O tema é a gestão de negócios que lidam com luto e morte, não a morte em si. A régua é: **este
conteúdo poderia ser lido por alguém enlutado sem causar desconforto, e ainda assim ser relevante
apenas para o gestor do negócio?**

- **Nunca** dramatizar luto, medo da morte ou culpa.
- **Nunca** mencionar caixão, corpo, velório, cerimônia em detalhe, choro, sepultamento em imagem ou
  texto.
- **Nunca** usar humor, trocadilho ou leveza envolvendo morte.
- **Nunca** criar urgência artificial ("não perca essa chance") — o tom é sempre sereno.
- O foco é sempre gestão, operação, organização, conformidade — nunca o momento humano da perda.
- Ver `config/cocreation/brands/deathcare.md` para vocabulário completo.

### Postos de Combustíveis — temas reais do setor

O conteúdo deve soar como se fosse escrito por alguém que já fechou um turno de posto, não por
alguém que leu sobre postos. Temas reais e obrigatórios como repertório:

- Margem por litro e pressão de margem apertada.
- Custo por litro e composição de preço.
- Aferição de bombas e tanques.
- Sangria (perda de combustível por furto, erro de medição ou vazamento).
- Conciliação de caixa e de estoque no fechamento de turno.
- Fraudes internas e externas (adulteração, desvio, erro proposital de registro).
- Gestão multiunidade (padronização entre postos de uma rede).
- Fiscal e conformidade tributária do setor de combustíveis.

Evitar tratar o posto como "empresa genérica" — a linguagem deve refletir que se trata de uma
operação de alto volume, baixa margem, funcionamento contínuo (24/7) e forte exposição a perda.

### Duofy — tecnologia aplicada sem clichê vazio de inovação

- Nunca usar "inovação" como palavra solta sem conteúdo por trás.
- Toda menção a IA deve vir acompanhada da camada de supervisão humana e do resultado de processo,
  não da tecnologia em si como fim.
- Evitar contraste raso "antes manual e caótico, agora com IA é perfeito" — a realidade é processo,
  ajuste, governança.
- O ponto de vista da marca é: tecnologia é meio, processo e governança são o que geram resultado.

## Checklist final antes de aprovar qualquer peça

1. O tom bate com o perfil de marca do segmento (`config/cocreation/brands/*.md`)?
2. Existe algum clichê de IA da lista acima presente no texto?
3. Para DeathCare: o conteúdo passaria no teste "leitura por alguém enlutado sem desconforto"?
4. Para Postos: o vocabulário reflete os temas reais do setor, não abstração genérica?
5. Para Duofy: a menção à tecnologia está acompanhada de processo/governança, não é promessa vazia?
6. Toda afirmação factual está classificada conforme `factuality.md`?
