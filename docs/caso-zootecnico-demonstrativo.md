# Caso atual e escopo de domínio aprovado pelo responsável do projeto

Revisão: 11/10/2026. O responsável aprovou para prototipagem uma trilha denominada “adulta”; a fonte USDA/CPER descreve novilhos yearling (de um ano), e a equivalência dessa categoria ao recorte adulto ainda aguarda revisão zootécnica independente.

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

O responsável do projeto aprovou a pergunta observacional abaixo para guiar a trilha de ADG e pastejo: **avaliar a associação entre ADG observado e indicadores de pastejo na coorte USDA/CPER de novilhos yearling.** A fonte não informa raça individual, peso inicial elegível nem condição corporal; não concluir apenas com este arquivo se esses animais atendem à categoria zootécnica “adultos”. Bezerras ficam fora desta fase e continuam como módulo separado. Não se exige efeito causal, pois não há desenho controlado apropriado. A issue [#1](https://github.com/santleme/riose-agro/issues/1) foi encerrada após atualização dos critérios de aceite para concluir a definição de escopo. Isso registra a decisão de produto, não um parecer zootécnico independente, que não foi realizado. A issue [#6](https://github.com/santleme/riose-agro/issues/6) foi encerrada como investigação concluída: os dados públicos disponíveis não validam o motor completo.

## Caso observacional USDA/CPER

Há um conjunto de pastejo próximo ao domínio do simulador: novilhos yearling (de um ano) em quatro piquetes de shortgrass steppe semiárido no Colorado durante temporadas de 2019–2020. O artigo mede ganho por intervalos de cerca de 60 dias; os dados públicos contêm 36 registros animal-período, 33 identificadores únicos, comportamento diário de pastejo e estimativas de biomassa por satélite. A classificação desses yearlings como adultos para o produto permanece pendente de parecer especializado.

> Nesta população e nestes períodos de pastagem, como métricas diárias de forrageamento e biomassa estimada variam junto com o ganho médio diário observado?

Este é um caso **observacional** de novilhos yearling em pastejo, sem tratamento de confinamento e sem consumo individual de MS, preço, dieta detalhada ou peso inicial/final por animal no resumo. Portanto, ele não responde ao what-if atual “pasto versus confinamento” e não pode alimentar diretamente a equação de peso de `engine.js`. A população é de um ecossistema dos EUA, pequena e não representativa de fazendas brasileiras. O uso aprovado pelo responsável é um explorador de observações e indicadores de pastejo, não uma recomendação nem validação de CMS/custo. Linhas repetidas do mesmo brinco devem ficar no mesmo grupo de qualquer split.

O brief para uma futura revisão de domínio, incluindo a questão de classificar novilhos de um ano como “adultos”, está em [`revisao-independente-caso.md`](revisao-independente-caso.md), acompanhada na [#22](https://github.com/santleme/riose-agro/issues/22). O conjunto e as limitações estão descritos em [`fontes-dados-candidatos.md`](fontes-dados-candidatos.md); artigo: [Augustine et al. (2022)](https://doi.org/10.1071/AN21560), dados públicos: [USDA/Ag Data Commons](https://doi.org/10.15482/USDA.ADC/1524788). A decisão do responsável define o escopo de prototipagem; a revisão independente não foi realizada e poderá ser acompanhada como trabalho futuro, sem reabrir a issue de definição de escopo.

Como referência pública complementar de população adulta — sem substituir o CPER — Silva et al. (2023), [PLOS ONE](https://doi.org/10.1371/journal.pone.0288738), descrevem 48 vacas Angus/Brangus lactantes e prenhes em 12 pastagens subtropicais, por 56 dias, com pesagens a cada 14 dias. O artigo é CC BY e informa que os dados relevantes estão no manuscrito, em resultados agregados; não há microdados individuais abertos. A unidade experimental foi a pastagem. Serve para orientar a revisão de população e protocolo, não para treino, holdout, calibração ou combinação com o estudo observacional USDA/CPER.

### Decisão registrada para a issue #1 — escopo observacional aprovado

| Decisão | Especificação baseada no escopo aprovado e nas fontes públicas |
|---|---|
| População observada na fonte | Novilhos de um ano (yearling steers), de raças europeias mistas fornecidas por pecuaristas locais, em quatro piquetes de 130 ha no USDA Central Plains Experimental Range, Colorado. O artigo não especifica raça individual, peso inicial elegível ou condição corporal; não preencher esses campos por inferência. Se essa população atende ao rótulo zootécnico “adultos” continua sob revisão independente. |
| Janela e unidade de análise | Pastejo de meados de maio ao início de outubro em 2019–2020; três intervalos de ADG de aproximadamente 53, 59 e 60 dias. Unidade de resultado: animal-período (36 linhas, 33 brincos). Colares bem-sucedidos cobrem 9, 14 e 13 animais nos três períodos; medidas diárias de comportamento cobrem 15–21 dias dentro de cada janela de ganho. |
| Pergunta | Dentro deste estudo de shortgrass steppe, como a duração média do bout de pastejo (`GBD_5min`) e a velocidade média (`MeanVelo`) se associam ao ganho médio diário observado (`ADG_60d`)? |
| Desfecho primário | `ADG_60d`, kg/novilho/dia, observado por intervalo de pesagem. |
| Variáveis explicativas | Núcleo da pergunta: `GBD_5min` (minutos) e `MeanVelo` (m/min). A exploração descritiva também pode exibir horas de pastejo e `MeanTA` (ângulo médio de giro durante o pastejo, graus), presentes nos CSVs de período e diários; são indicadores adicionais, não novas hipóteses primárias. Biomassa (kg MS/ha) é estimativa de modelo Landsat–Sentinel calibrado para este sítio, não pesagem de cada piquete. |
| Comparador/intervenção | Nenhum braço de intervenção. Período sazonal e piquete são estratos observacionais; não equivalem a tratamento randomizado nem identificam efeito causal. |
| Fatores mantidos constantes por desenho | Nenhum fator foi controlado experimentalmente. Piquete e período variam dentro do estudo; condições comuns do protocolo/local não devem ser interpretadas como controle de dieta, clima ou estado do animal. |
| Fatores variáveis e confundimento potencial | Piquete e temporada variam; biomassa é estimada por satélite e muda no espaço/tempo. Clima, qualidade/oferta de forragem e estado individual podem influenciar ADG e comportamento, mas a base reutilizada não permite ajuste individual completo. São limitações/candidatos a confundimento, não efeitos identificados. |
| Covariáveis não disponíveis para ajuste individual | Raça, idade/data de nascimento, peso inicial elegível, condição corporal, dieta/suplementação individual e medidas locais de clima/qualidade da forragem não estão disponíveis nos arquivos usados. Não imputar nem inferir esses campos. |
| Uso aprovado pelo responsável do projeto | Explorador observacional de ADG e indicadores de pastejo; pode exercitar análise por animal/período. Não calibrar nem validar o motor atual de CMS, custo, estoque de pasto ou pasto-versus-confinamento. |
| Exclusões | Não generalizar para gado brasileiro, outros biomas/sistemas, confinamento ou resposta a manejo. Não inferir CMS individual a partir de tempo/velocidade de pastejo. |

O resumo de período e a série diária, sob domínio público, estão fixados por hashes em [`data/usda-cper/manifest.json`](../data/usda-cper/manifest.json). A série diária tem 644 linhas e inclui 8 dias fora do critério de cobertura completa; eles permanecem marcados como parciais. O dicionário diário descreve `Season` e `ADG_INT` com códigos que não correspondem aos valores/datas encontrados; a interface não usa esses códigos para juntar observações. O `ADG_60d` vem somente do resumo por animal-período.

### Reanálise descritiva da pergunta aprovada

`npm run analyze:usda-cper-association` calcula Spearman entre cada preditor pré-especificado e ADG por animal-período. Os intervalos percentis são de bootstrap por brinco (5.000 reamostragens); todas as janelas do mesmo animal permanecem juntas. Como sensibilidade secundária, calcula também uma correlação parcial de Spearman após residualizar postos por efeitos aditivos de período e piquete, com bootstrap por brinco. O relatório traz ainda associações dentro de cada período e piquete e uma análise que retira um período por vez. O relatório completo e o hash estão em [`docs/evidence/usda-cper-association.json`](evidence/usda-cper-association.json).

| Indicador observado | Spearman agrupado (n=36 períodos; 33 animais) | Intervalo bootstrap agrupado, 95% | Spearman parcial ajustado¹ | Intervalo bootstrap ajustado, 95% | Por período (1, 2, 3) | Por piquete (15E, 19N, 22W, 23E) | Retirando período 1, 2, 3 |
|---|---:|---:|---:|---:|---|---|---|
| Duração média do bout (`GBD_5min`) | −0,579 | [−0,813; −0,273] | −0,065 | [−0,461; +0,247] | −0,383; −0,310; −0,571 | −0,200; −0,718; −0,683; −0,418 | −0,600; −0,495; −0,524 |
| Velocidade média no pastejo (`MeanVelo`) | +0,727 | [+0,540; +0,836] | +0,187 | [−0,255; +0,561] | −0,583; +0,143; +0,555 | +0,657; +0,627; +0,867; +0,661 | +0,802; +0,190; +0,669 |

¹ Correlação de Pearson entre postos residualizados pelos efeitos aditivos de `60dADG_INT` e `Pasture` (equivalente a uma sensibilidade de Spearman parcial). Intervalos de 5.000 reamostragens por brinco; ambas abrangem zero. O ajuste é descritivo, usa apenas 36 linhas e células esparsas, não modela interações e não reamostra ano, piquete ou sítio. Portanto, não é teste confirmatório nem estimativa causal.

Para `MeanVelo`, retirar o período 2 reduz a correlação agrupada de +0,727 para +0,190; dentro do período 1, o sinal é negativo. O ajuste conjunto reduz as duas magnitudes agrupadas e os dois intervalos ajustados abrangem zero, indicando que a associação bruta é sensível à composição de período/piquete nesta amostra. `GBD_5min` continua negativa nas exclusões de período, mas a medida ajustada também fica próxima de zero e seu intervalo abrange zero. Esses padrões são hipóteses descritivas para revisão, não efeitos causais nem relação generalizável. Os intervalos reamostram animais deste estudo e **não** são faixas de previsão, nem estimam incerteza do `engine.js`. A análise tampouco é confirmação independente do artigo ou validação do motor.

Há uma coorte pública complementar no Dryad (DOI [10.5061/dryad.dbrv15fg8](https://doi.org/10.5061/dryad.dbrv15fg8)): 154 novilhos de quatro experimentos em 2022–2024, incluindo dois experimentos no CPER em 2023–2024, com ADG e BW individual. Ela está arquivada em [`data/dryad-grazing-yearlings/`](../data/dryad-grazing-yearlings/) e auditada separadamente. Não juntar esses registros aos animais/períodos 2019–2020: o CSV não traz identificador de experimento, DMI, covariáveis individuais de pastejo ou início/fim de pesagem; portanto só acrescenta uma referência descritiva de outra coorte, não valida o motor nem a associação primária deste caso.

**Estado da revisão de domínio:** não houve parecer independente de especialista em zootecnia. A issue #1 foi concluída como definição de escopo; a questão de categoria permanece registrada para eventual revisão futura e não altera o limite observacional do protótipo. O projeto não estimará efeito causal nesta fase. Uma pergunta causal sobre mudança de manejo exige dados com tratamento/comparador apropriados e não pode ser preenchida por esses períodos ou piquetes.

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

O artigo de Blake et al. (2026; DOI [10.1093/jas/skag133](https://doi.org/10.1093/jas/skag133)) descreve registros individuais diários de DMI, peso, água e clima em bovinos adultos de corte, com avaliações retidas por sistema/local. A publicação não disponibiliza os dados brutos em repositório ou arquivo suplementar público; pedidos de acesso dependem do autor correspondente e não foram enviados. O DMI de referência é calculado por marcador fecal e digestibilidade; portanto, qualquer avaliação precisa carregar esse protocolo, cobertura e mudanças entre anos. O roteiro opcional para eventual solicitação está em [`solicitacao-dados-wvu-dmi.md`](solicitacao-dados-wvu-dmi.md).

Esse candidato pode apoiar uma avaliação futura do alvo DMI do motor, se houver permissão, variáveis compatíveis e IDs de agrupamento. Ele **não muda** a decisão aprovada na #1 (ADG e pastejo USDA/CPER, exploratório e observacional) e não permite validar peso, custo, estoque de pasto ou efeito pasto × confinamento. Não se reutilizam os resultados de desempenho do artigo como validação do Agroville.
