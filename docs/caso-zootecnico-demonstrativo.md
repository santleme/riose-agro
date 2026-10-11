# Caso atual e escopo de domínio aprovado pelo responsável do projeto

Revisão: 11/10/2026. O responsável do projeto aprovou a trilha observacional adulta; revisão zootécnica independente ainda está pendente.

## O que o software executa hoje

O caso operacional do MVP é uma **comparação demonstrativa**, não um caso de produção validado:

> Partindo do mesmo lote virtual de 24 bovinos de corte, com pesos iniciais gerados entre 330 e 400 kg, como mudam os resultados calculados em 30 dias quando o alojamento passa de pasto para confinamento?

O motor parte do mesmo snapshot e semente nos dois lados. Dieta, suplemento, classe climática e demais condições permanecem iguais; alojamento é o único fator alterado. A saída inclui peso médio simulado, consumo calculado de matéria seca (MS), custo de alimentação calculado e estoque de forragem simulado por piquete. Isso descreve o comportamento atual do programa, não recomenda um manejo.

## Variáveis disponíveis no MVP

| Variável | Unidade / domínio | Estado atual |
|---|---|---|
| Tamanho do lote | cabeças | 24 por padrão; configurável no motor |
| Peso inicial individual | kg de peso vivo | 330–400 kg, gerado pela semente |
| Duração da comparação | dias | 30 no fluxo do MVP; o motor aceita 1–365 |
| Alojamento | pasto / confinamento | único fator da comparação |
| Dieta | pasto / balanceada / concentrada | enumeração demonstrativa; não contém formulação ou análise de nutrientes |
| Suplemento | kg MS/cabeça/dia | 0–4, controlado na interface |
| Clima | normal / calor / chuva | classe escolhida, sem série observada ou localização |
| Pasto | kg MS/piquete | 4 piquetes abstratos; sem área, espécie, medição ou altura |
| Resultados | kg, kg MS, R$ ou índice | saídas internas do modelo, sem validação independente |

**Desfecho primário provisório de software:** diferença no peso médio simulado no dia 30. **Secundários:** diferenças em consumo calculado por fonte e por cabeça/lote, custo calculado do lote e estoque final simulado em cada piquete. Estes desfechos servem para testar interface, reprodutibilidade e consistência do código; não são estimativas de efeito zootécnico.

## Caso observacional aprovado para prototipagem; motor ainda demonstrativo

Um(a) especialista e o responsável pelos dados precisam definir antes de uma validação:

- pergunta de manejo e população-alvo: categoria, raça/cruzamento, sexo/castração, idade, faixa de peso e condição corporal;
- local, época, duração e sistemas comparados; confirmar se a intervenção relevante é alojamento ou uma mudança de dieta;
- composição e oferta das dietas, análise de matéria seca e nutrientes, protocolo de adaptação e medidas independentes de consumo;
- forrageira, área dos piquetes, massa/altura, amostragem de biomassa, taxa de lotação e manejo;
- clima observado, água, sanidade, protocolo de pesagem e fatores mantidos constantes;
- desfecho primário, protocolo de medição, população de validade e confundidores;
- origem, versão, permissão/licença e separação entre dados de calibração e validação.

O responsável do projeto aprovou a pergunta observacional abaixo para guiar a trilha adulta do protótipo: **avaliar a associação entre ADG observado e indicadores de pastejo em novilhos adultos no conjunto USDA/CPER.** Bezerras ficam fora desta fase e continuam como módulo separado. Não se exige efeito causal, pois não há desenho controlado apropriado. Essa decisão de produto não equivale a parecer zootécnico independente; a issue [#1](https://github.com/santleme/riose-agro/issues/1) continua aberta até essa revisão. A issue [#6](https://github.com/santleme/riose-agro/issues/6) permanece aberta para avaliação compatível e independente.

## Caso adulto observacional USDA/CPER

Há um conjunto adulto mais próximo da categoria do simulador: novilhos de um ano em quatro piquetes de shortgrass steppe semiárido no Colorado durante temporadas de 2019–2020. O artigo mede ganho por intervalos de cerca de 60 dias; os dados públicos contêm 36 registros animal-período, 33 identificadores únicos, comportamento diário de pastejo e estimativas de biomassa por satélite.

> Nesta população e nestes períodos de pastagem, como métricas diárias de forrageamento e biomassa estimada variam junto com o ganho médio diário observado?

Este é um caso **observacional** de adultos em pastejo, sem tratamento de confinamento e sem consumo individual de MS, preço, dieta detalhada ou peso inicial/final por animal no resumo. Portanto, ele não responde ao what-if atual “pasto versus confinamento” e não pode alimentar diretamente a equação de peso de `engine.js`. A população é de um ecossistema dos EUA, pequena e não representativa de fazendas brasileiras. O uso aprovado pelo responsável é um explorador de observações e indicadores de pastejo, não uma recomendação nem validação de CMS/custo. Linhas repetidas do mesmo brinco devem ficar no mesmo grupo de qualquer split.

O conjunto e as limitações estão descritos em [`fontes-dados-candidatos.md`](fontes-dados-candidatos.md); artigo: [Augustine et al. (2022)](https://doi.org/10.1071/AN21560), dados públicos: [USDA/Ag Data Commons](https://doi.org/10.15482/USDA.ADC/1524788). A decisão do responsável define o escopo de prototipagem; a revisão independente ainda é necessária para fechar a issue #1.

### Decisão registrada para a issue #1 — trilha adulta observacional

| Decisão | Proposta para aprovação |
|---|---|
| População | Novilhos de um ano acompanhados no USDA Central Plains Experimental Range (Colorado), em quatro piquetes de 130 ha, temporadas de 2019–2020. |
| Unidade de análise | Animal-período de ganho; 36 registros, 33 brincos únicos. As medidas de coleira abrangem 15–21 dias de cada período de ~53–60 dias. |
| Pergunta | Dentro deste estudo de shortgrass steppe, como a duração média do bout de pastejo (`GBD_5min`) e a velocidade média (`MeanVelo`) se associam ao ganho médio diário observado (`ADG_60d`)? |
| Desfecho primário | `ADG_60d`, kg/novilho/dia, observado por intervalo de pesagem. |
| Variáveis explicativas | `GBD_5min` (minutos) e `MeanVelo` (m/min); biomassa estimada e período podem ser exibidos como contexto, não como intervenção. |
| Comparador/intervenção | Nenhum braço de intervenção. Período sazonal e piquete são estratos observacionais; não equivalem a tratamento randomizado nem identificam efeito causal. |
| Uso aprovado pelo responsável do projeto | Explorador observacional de ADG e indicadores de pastejo; pode exercitar análise por animal/período. Não calibrar nem validar o motor atual de CMS, custo, estoque de pasto ou pasto-versus-confinamento. |
| Exclusões | Não generalizar para gado brasileiro, outros biomas/sistemas, confinamento ou resposta a manejo. Não inferir CMS individual a partir de tempo/velocidade de pastejo. |

**Próximo passo de revisão:** especialista pode confirmar a adequação zootécnica desta pergunta observacional e das definições das variáveis. O projeto não estimará efeito causal nesta fase. Uma pergunta causal sobre mudança de manejo exige dados com tratamento/comparador apropriados e não pode ser preenchida por esses períodos ou piquetes.

## Candidato a caso com dados públicos de bezerras (aguarda revisão especializada)

Bezerras ficam fora desta fase. A página de dados publicada permanece como módulo separado, sem integrar seu desfecho ou suas observações à trilha adulta:

> Em bezerras Holandesas alojadas individualmente, como diferem o consumo diário de matéria seca e o ganho médio diário até o início do desaleitamento entre controle sem feno e acesso a feno longo no balde?

O estudo de referência incluiu 27 bezerras (9 por grupo: controle, feno no balde e feno em tubo), acompanhadas do nascimento até o desaleitamento; há consumo diário de grãos/feno/TMR/água e pesos semanais. O contraste inicial proposto é somente **controle versus feno no balde**; o grupo do tubo fica fora do contraste primário para manter uma intervenção interpretável. Desfecho primário proposto: ganho médio diário (kg/cabeça/dia) até o início do desaleitamento. Secundário: consumo de MS por fonte (g/cabeça/dia, convertido para kg apenas para apresentação) e ruminação/comportamento quando disponível.

Entradas e unidades identificadas: idade (dias), tratamento, ingestão de grão/feno/TMR em g de MS/dia, água em L/dia, peso vivo semanal em kg, e protocolo de leite e alojamento descrito no estudo. Os demais fatores do ensaio devem ser transcritos do método antes de implementar o caso. Limites: amostra pequena, população de bezerras leiteiras dos EUA em alojamento individual; não representa bovinos de corte adultos, pastejo, rebanhos brasileiros nem manejo comercial de uma fazenda. O candidato precisa de revisão de especialista antes de ser escolhido e não valida os parâmetros atuais de `engine.js`.

A fonte e o segundo conjunto independente com ingestão diária, mas sem peso, estão descritos em [`fontes-dados-candidatos.md`](fontes-dados-candidatos.md). Se esse módulo for retomado, deve permanecer isolado para não misturar as equações de animais adultos com dados de bezerras.

## Novo candidato condicionado a acesso: LAMP (bovinos de corte na América Latina)

O artigo de Congio et al. (2023; DOI [10.1016/j.scitotenv.2022.159128](https://doi.org/10.1016/j.scitotenv.2022.159128)) descreve 2.194 observações individuais reunidas em 67 estudos da América Latina/Caribe, com 1.656 registros do Brasil no conjunto original. Reporta CMS, peso vivo, GMD e composição de dieta, entre outras variáveis. O artigo diz que dados serão disponibilizados mediante solicitação; ainda não obtivemos arquivo nem autorização/licença de uso.

**Pergunta candidata, caso haja acesso e aprovação de especialista:** entre os bovinos de corte e estudos incluídos no conjunto LAMP, quão bem um modelo explicitamente definido estima CMS diária a partir de peso e variáveis disponíveis da dieta quando estudos inteiros são retidos para avaliação?

- **Tipo de pergunta:** preditiva/associativa em estudos observacionais agrupados, não efeito causal de uma intervenção de fazenda.
- **Unidade e desfecho:** observação individual no estudo; CMS em kg MS/dia. GMD e peso podem ser alvos secundários apenas se as definições/protocolos forem consistentes.
- **Comparador de avaliação:** modelo/baseline especificado antes do holdout, com splits por estudo — possivelmente também por país — sem separar animais/períodos do mesmo estudo entre treino e teste.
- **Limites conhecidos:** o conjunto foi compilado para pesquisa de metano e só inclui os registros/estudos elegíveis após exclusões; 32 dos 67 estudos originais são descritos como não publicados. Isso limita representatividade e exige autorização explícita, IDs de estudo/animal, descrição de métodos de CMS e auditoria de sobreposição. O artigo não fornece trajetória diária da fazenda, custos ou disponibilidade de pasto necessários para validar essas saídas do `engine.js` ou o contrafactual pasto × confinamento.
- **Escopo desta fase:** bezerras não fazem parte do caso adulto aprovado e qualquer extensão para essa população precisa de decisão e validação próprias. O conjunto não autoriza recalibrar o motor atual.

O roteiro técnico de acesso está em [`solicitacao-dados-lamp.md`](solicitacao-dados-lamp.md); ele permanece um rascunho local não enviado.

## Candidato separado para validação de CMS: WVU DMI em pastejo

O artigo de Blake et al. (2026; DOI [10.1093/jas/skag133](https://doi.org/10.1093/jas/skag133)) descreve registros individuais diários de DMI, peso, água e clima em bovinos adultos de corte, com avaliações retidas por sistema/local. O artigo informa que os dados podem ser obtidos pelo autor correspondente, mas não publica um arquivo ou licença aberta. O DMI de referência é calculado por marcador fecal e digestibilidade; portanto, qualquer avaliação precisa carregar esse protocolo, cobertura e mudanças entre anos. O roteiro para pedir acesso está em [`solicitacao-dados-wvu-dmi.md`](solicitacao-dados-wvu-dmi.md) e não foi enviado.

Esse candidato pode apoiar uma avaliação futura do alvo DMI do motor, se houver permissão, variáveis compatíveis e IDs de agrupamento. Ele **não muda** a decisão aprovada na #1 (ADG e pastejo USDA/CPER, exploratório e observacional) e não permite validar peso, custo, estoque de pasto ou efeito pasto × confinamento. Não se reutilizam os resultados de desempenho do artigo como validação do Agroville.
