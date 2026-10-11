# Plano de MVP: fazenda, cenários e aprendizagem com resultados

## Incrementos entregues

O Scenario Studio atual começa no mapa e compara a configuração base com uma única intervenção: alojamento, de pasto para confinamento. Os controles de dieta, suplemento e clima definem condições compartilhadas dos dois lados; ainda não são fatores alternativos da comparação. Base e alternativa partem do mesmo snapshot e semente, e o manifesto registra esse par. A mudança é demonstrativa, não uma recomendação agronômica. A fazenda continua sendo a tela principal.

A comparação de 30 dias permanece restrita a pasto versus confinamento, mantendo dieta, suplemento, clima e estado inicial iguais. Próximo passo após o contrato de snapshot: definir um segundo fator de comparação com valor explícito, intervalo permitido, unidade e regra de validação no manifesto; lançar um fator por vez, nunca uma combinação de alterações.

O motor continua JavaScript local e roda sem chave de API ou conexão externa. Ele já existia como JavaScript (não TypeScript); não houve migração de linguagem, Rust/WASM ou inclusão de Phaser/Tiled. Não há LLM conectado. A comparação e o estado inicial são reproduzíveis para a mesma semente e os mesmos parâmetros.

O inspetor também mantém até 40 transições recentes por animal. Cada registro guarda hora simulada, atividade, regra acionada, sede calculada e alojamento configurado. Isso expõe por que o código escolheu uma atividade e segue a separação de memória/percepção observada no Smallville como referência arquitetural. O histórico é determinístico e não é evidência de comportamento animal real.

## Verificação

- `npm test` cobre reprodução por semente, mudança exclusiva de alojamento, preservação do snapshot de entrada, repetibilidade da projeção e reprodução do histórico por animal.
- `node --check app.js`, `node --check worker.js` e `node --check engine.js` verificam sintaxe.
- `python3 -m http.server 8765` serve o app localmente; módulos e Web Worker precisam de HTTP, não `file://`.
- O teste manual de HTTP retornou `200 OK` para `/`.

## Métricas e parâmetros

O caso de comparação atualmente executado e as variáveis ainda necessárias para definir uma pergunta de campo estão em [`caso-zootecnico-demonstrativo.md`](caso-zootecnico-demonstrativo.md). O registro expandido de parâmetros, fontes contextuais e status de dados/licenças está em [`parametros-e-fontes.md`](parametros-e-fontes.md). Os números do motor continuam sem calibração: as referências não foram usadas como valores de entrada.

A triagem de fontes Hugging Face, Kaggle, Embrapa e Mendeley, junto com a recomendação de próximos protótipos, está em [`fontes-dados-candidatos.md`](fontes-dados-candidatos.md). O manifesto, o salvamento/replay e a explicação opcional (#4/#5/#7/#8) já estão em `main`. O contrato de snapshot da #12 está implementado: schema, exemplo licenciado, validador, ligação verificável ao manifesto e painel local de revisão. O exemplo adulto permanece pendente de revisão de domínio e inelegível como estado inicial. A integração de um snapshot real ao motor continua fora desse contrato e depende de dados reais compatíveis e parecer de domínio.

O peso é exibido em kg por animal; o consumo estimado em kg MS por lote e por animal acumulado durante o período projetado; o estoque de forragem em kg MS por piquete no início e no fim; e o custo em R$ acumulados da alimentação do lote. Esses valores são exibidos lado a lado para pasto e confinamento.

O livro de consumo soma: (1) forragem retirada do piquete no modo pasto; (2) a demanda-base atribuída como alimento no modo confinamento; (3) suplemento configurado, dividido por 24 em cada passo horário; e (4) o adicional fixo da dieta balanceada (1,8 kg MS/animal/dia) ou concentrada (3,2 kg MS/animal/dia). A demanda-base é 8 kg MS/animal/dia na referência de 360 kg, escalada pelo peso e pelo multiplicador de clima. A forragem do pasto é limitada pelo estoque disponível; no confinamento, o estoque de pasto não é consumido. Os fatores 1,2 e 1,35 ainda aplicados no cálculo interno de energia não alteram os kg MS contabilizados no livro de consumo.

O estoque por piquete inicia em 1.800 kg MS, recebe crescimento assumido ao longo do tempo e é limitado artificialmente a 2.400 kg MS por piquete. É uma massa simulada, sem área, teor de matéria seca medido, estrutura da pastagem ou categoria agronômica de condição. Não representa lotação, disponibilidade real ou recomendação de manejo.

Todos os parâmetros abaixo são hipóteses internas do protótipo, sem fonte biológica validada, calibração ou validação contra medidas independentes:

| Parâmetro no motor | Unidade usada pelo código | Hipótese atual | Fonte / limitação |
|---|---|---|---|
| `baseDemandKgDM` | kg MS/animal/dia | 8 na referência | Assumido; não é uma exigência nutricional validada. |
| `dailyPastureGrowthKgDM` | kg MS/piquete/dia | 35 | Assumido; não varia com estação, solo ou área real. |
| `initialPastureKgDM` | kg MS/piquete | 1.800 | Valor inicial ilustrativo, sem medição de biomassa. |
| `supplementPrice`, `balancedPrice`, `concentratePrice` | R$/kg MS (aproximação do código) | 1,80 / 1,60 / 2,10 | Preços fixos de demonstração; não são cotações de mercado. |
| `maintenanceKgDM` | kg MS/animal/dia na referência de 360 kg | 5,3 | Termo simplificado proporcional ao peso, sem composição nutricional. |
| Extra da dieta balanceada / concentrada | kg MS/animal/dia (constantes internas) | 1,8 / 3,2 | Acréscimos fixos de demonstração; não especificam proteína, energia ou fibra. |
| `gainFactor` | fator aplicado à diferença horária de ingestão/manutenção | 0,22 | Conversão arbitrária para demonstrar trajetória de peso; não é equação de ganho validada. |
| Multiplicadores de calor/chuva | adimensionais | Demanda de calor 0,8; crescimento do pasto em chuva 1,3 e calor 0,65 | Regras assumidas; não representam efeitos fisiológicos ou agronômicos validados. |
| Limite de forragem por piquete | kg MS/piquete | 2.400 | Teto artificial de estoque do motor, sem inferência de capacidade de suporte. |
| Indicador `stress` | índice sem unidade | Calor 28, confinamento 12, caso-base 5 | Pontuação fixa de interface; não é medida de estresse animal. |

Peso, consumo, custos, estresse, forragem e ganhos são **demonstrativos**. Não usar para formular dieta, definir lotação ou tomar decisão de manejo. O custo inclui taxas simplificadas e não contempla mão de obra, sanidade, infraestrutura, frete ou desperdício. O cálculo horário não representa eventos reais de refeição.

## Decisões e limites

- Manter o mapa canvas e a renderização própria: já atendem a seleção/inspeção atual; não há necessidade observada de editor de tiles ou pathfinding neste incremento.
- Manter o motor determinístico local, sem dependência de API. A interface do sistema não precisa de LLM para comparação numérica.
- Manter o LLM como explicação opcional e substituível, com fallback determinístico. `server.js` agora oferece adaptadores OpenAI Responses, Groq Chat Completions e Hugging Face Inference Providers; o prompt recebe somente a configuração e métricas validadas e nenhuma resposta muda a simulação. Variáveis/limites e fontes verificadas estão em [`politica-incerteza.md`](politica-incerteza.md) e na revisão técnica. Não enviar dados reais identificáveis; texto gerado não é medição nem recomendação.
- Não foi criado backend de cenários persistentes, exportação de semente/parâmetros, consumo medido ou validação biológica nesta entrega. O livro de consumo e a condição de pasto foram implementados como estimativas demonstrativas.
- As análises estáticas REA do app local e do recorte Smallville estão em `docs/evidence/`. Nesta sessão, o doctor executado com Node Windows 24.19.0 confirmou o registro Codex como alinhado; `environment_healthy: false` vem de engines nativos opcionais ausentes, que não são necessários para análise JavaScript. O doctor com Node Linux 20.20.2 não representa essa instalação Windows e reporta incompatibilidade. Nenhuma alteração de setup foi necessária. O servidor MCP ainda não aparece no inventário desta sessão; a observação passiva continua pendente até reconectar Codex e disponibilizar um Chrome com CDP em `127.0.0.1:9222` (a issue #10 está com `GUZZBR1`).
- O repositório privado [santleme/riose-agro](https://github.com/santleme/riose-agro) recebeu o código no commit `5b8034a`. A issue #3 (consumo e estoque por piquete) foi concluída no commit `17bce17`. A issue #2 documenta os parâmetros como demonstrativos e está concluída; após fechar a entrega do contrato de snapshot, seguem na trilha `santleme` as issues #1, #6, #15 e #16. As issues #10, #13 e #14 estão atribuídas a `GUZZBR1`. As issues #3, #4, #5, #7, #8, #9 e #11 foram fechadas após entrega.

## Próximos passos recomendados

1. A decisão de produto da #1 aprovou ADG e indicadores de pastejo em adultos como exploração observacional; falta parecer zootécnico independente. Para #6, LAMP é candidato regional de CMS/GMD por estudo; o estudo WVU 2026 é candidato a DMI diária de bovinos em pastejo. Ambos dependem de acesso/licença e IDs de agrupamento; os roteiros em [`solicitacao-dados-lamp.md`](solicitacao-dados-lamp.md) e [`solicitacao-dados-wvu-dmi.md`](solicitacao-dados-wvu-dmi.md) não foram enviados. Até dados e protocolo compatíveis, não recalibrar nem promover o motor atual a previsão.
2. A entrega da #12 cobre schema 0.1.0, exemplo aberto, validação estrutural/semântica, painel do mapa e vínculo SHA-256/tipo/versão ao manifesto, sem copiar seed ou configuração. O exemplo USDA é um recorte observacional, está pendente de domínio e não executável. A futura ligação de dados de fazenda ao estado do motor requer contrato de mapeamento e medições de uma fazenda; não inferir esse estado a partir dos recortes publicados.
3. Os fluxos demonstrativos de #13 e #14 já estão em `main` pelos PRs #18 e #19. Integrar o snapshot ao fluxo atual sem duplicar manifesto, replay, explicação ou evidência visual.
4. Manter o explorador observacional adulto separado: USDA/CPER pode mostrar comportamento de pastejo e ADG publicados, mas não alimenta consumo, custo, confinamento ou efeito causal.
5. Adiar faixas de confiança (#15) até haver avaliação independente e resultados retidos com cobertura mensurada. A política de incerteza e o estado atual estão em [`politica-incerteza.md`](politica-incerteza.md). Um primeiro contrato local de #16 agora arquiva a projeção e valida sidecars de desfecho; completar o ciclo ainda requer protocolo consentido, dados reais e revisão de domínio.
6. Medir desempenho e requisitos reais antes de trocar o motor/renderer. REA estático já confirmou a estrutura; a captura de navegador continua pendente porque o MCP/CDP não está disponível nesta sessão.

## Próximo MVP recomendado: ciclo de cenário e resultado observado

O Scenario Studio já compara duas condições com estado inicial e semente iguais, e o novo painel **Revisar snapshot** valida a estrutura, cobertura, fontes e vínculo ao manifesto. O próximo MVP deve fechar o ciclo entre uma projeção imutável e a medição posterior daquela decisão. O mapa e o inspetor continuam como tela principal:

1. O responsável aprovou na #1 a trilha adulta observacional: ADG e indicadores de pastejo do USDA/CPER; bezerras ficam em módulo separado e não haverá alegação causal. Obter revisão zootécnica independente antes de encerrar a issue. O par pasto/confinamento do motor segue demonstrativo.
2. Congelar e nomear a projeção, manifesto, versão do motor, semente e estado inicial antes da decisão; a repetição deve reproduzir os mesmos resultados.
3. O protótipo local de #16 inclui schema de sidecar, arquivo de resultados com hash do manifesto e do `engine.js`, CLI e página **Registrar resultado** no mapa. A página exige snapshot elegível ligado aos bytes exatos do manifesto, oferece os lotes cujo número de animais coincide com a projeção e coleta várias métricas sem enviar dados ao servidor.
4. Próxima etapa: revisar o contrato com especialista e testar a captura usando protocolo e dados autorizados. O validador também bloqueia cenário não executado, observação que não seja posterior à decisão, janela/duração divergentes, qualidade incerta, lote inexistente e rebanho de tamanho incompatível. A tela só compara `projetado × observado` de forma descritiva quando unidade/período/alinhamento correspondem; não chamar diferença de erro quando alvo e medida não forem equivalentes.
5. Manter arquivos e exportação reproduzíveis. Integrar ao fluxo da fazenda só após revisão do contrato (#12), do protocolo (#1) e dos dados compatíveis (#6); o sidecar atual não envia nem persiste dados no servidor.
6. Manter resultados `demonstrativos` até haver avaliação independente; sem faixas probabilísticas (#15) até cobertura e calibração retidas sustentarem intervalos.

Esse recorte é o MVP seguinte recomendado porque prova uma capacidade central do “Simile do Agro”: registrar uma hipótese antes de agir e confrontá-la com o que ocorreu. A ideia posterior de estimar respostas de grupos de produtores é outro produto de pesquisa: exige amostra de produtores, desenho consentido, resultados reais e holdout por fazenda/participante. Não usar agentes bovinos ou personas geradas por LLM como substituto dessa amostra.

O USDA/CPER serve para leitura observacional de novilhos em pastagem, mas não tem DMI individual nem intervenção comparável. O explorador Zenodo cobre bezerras e permanece separado. A triagem nova identificou LAMP (2.194 registros em cinco países latino-americanos, 1.656 brasileiros no conjunto original) como candidato de dados de CMS/peso/GMD, sob solicitação e sem licença confirmada; ver [`fontes-dados-candidatos.md`](fontes-dados-candidatos.md). HF/Kaggle continuam úteis para software e tarefas visuais, mas as buscas atuais não acharam ali dados abertos adequados para validar o motor adulto.

## Estado das issues em 11/10/2026, após os merges #17–#19

- **Trilha santleme:** #1 tem a decisão de produto registrada (ADG adulto e pastejo, observacional; bezerras separadas e sem causalidade), aguardando revisão zootécnica independente; #6 documenta que os dados públicos compatíveis ainda não validam o motor; #12 foi concluída com schema 0.1.0, exemplo público, CLI `link:snapshot` e painel visual no mapa, sem converter recorte observacional em estado-base. #15 mantém política e rótulo “sem calibração suficiente”, sem base para intervalos; #16 tem contrato local v1 e CLIs, mas segue incompleta sem resultados reais, protocolo consentido e validação de domínio. Não fechar as issues que ainda dependem desses dados ou pareceres.
- **Trilha GUZZBR1:** PR [#17](https://github.com/santleme/riose-agro/pull/17) foi integrado em `main` no commit `22d5593`; implementa manifesto v1, cenários salvos, explicação opcional no backend e separação de aleatoriedade, cobrindo #4/#5/#7/#8. A issue #13 continua aberta, embora o fluxo demonstrativo do Scenario Studio tenha entrado pelo PR [#18](https://github.com/santleme/riose-agro/pull/18); falta cumprir o aceite dependente do caso #1. A issue #14 também continua aberta após o PR [#19](https://github.com/santleme/riose-agro/pull/19), que já mostra unidade, período, regras e limites da evidência ao lado dos resultados. A #10 (captura REA passiva) continua aberta e depende de navegador/CDP disponível.
- **Ordem de integração:** não duplicar #4/#5/#8 dentro de #13; usar o contrato entregue na #12 como referência de proveniência para snapshots elegíveis, #14 para proveniência visual, e #6 como gate para elevar resultados do motor.

## Decisão para o protótipo seguinte

### Protótipo de pesquisa entregue

A página [`observed-data.html`](../observed-data.html) permite explorar peso e ingestão observados nos três grupos do ensaio Zenodo. Ela fica separada do mapa e do motor: mostra curvas por semana, médias calculadas por animal, faixas mínimas/máximas descritivas, cobertura, valores ausentes e procedência. Um snapshot CC0 permite executar sem rede; `npm run build:observed-data` o regenera a partir dos XLSX e verifica os checksums de origem. A interface não exibe ADG como confirmação independente, não prevê resultados e não altera o simulador adulto.

O explorador agora também permite escolher dois grupos e comparar médias semanais por animal, com diferença absoluta/relativa e `n` por grupo. Isso é um contraste descritivo dentro deste ensaio, não um efeito causal nem previsão. Sem dados dos dois grupos numa semana, a tabela explicita a ausência; não há imputação, intervalo de confiança ou promoção do dado de bezerra para o motor de bovinos adultos. Este é o primeiro protótipo de “resposta de coortes” com observações rastreáveis, separado da simulação da fazenda.

O snapshot versionado agora pode ser validado e ligado ao manifesto já disponível, tanto pela CLI quanto pelo painel de revisão no mapa. O exemplo USDA exige ADG e indicadores de pastejo para a trilha observacional, enquanto marca o recorte como não executável. O fluxo demonstrativo do Scenario Studio (#13) foi integrado pelo PR #18; a conclusão formal da issue depende da revisão zootécnica de #1 e dos demais critérios de #6. A comparação do MVP segue limitada a uma intervenção: pasto versus confinamento. Cenários salvos e replay estão no código mergeado de #4/#5/#8; não criar um formato concorrente.

O explorador [`adult-data.html`](../adult-data.html) mostra os 36 registros animal-período USDA/CPER (ADG contra bout, velocidade ou horas de pastejo) e agora permite selecionar um dos 33 animais para navegar a série diária pública: bout, horas, velocidade e biomassa estimada. Pontos sem observação permanecem ausentes; ADG continua no nível de intervalo. A série é somente descritiva e fica fora do motor: não sustenta intervenção causal nem valida as saídas do `engine.js`. O dicionário diário tem códigos inconsistentes em `Season` e `ADG_INT`; a UI não os usa como períodos e deixa essa limitação explícita.

A auditoria incorporou o dataset adulto Rothamsted 2018–2025, com licença CC BY 4.0 e checksums registrados. O split preserva as coortes 1–3 no treino (1.864 linhas/190 animais) e a coorte 4 (2024–25; 498 linhas/58 animais) como holdout; erro animal/linha não cruza o split. A baseline constante treinada nas coortes anteriores obteve MAE 0,461 e RMSE 0,570 kg/animal/dia no holdout do mesmo local. Isso é uma referência temporal dentro dos seis piquetes de North Wyke, não validação em fazendas novas nem do motor. Rothamsted não tem `GBD_5min`, `MeanVelo`, CMS individual, custo ou confinamento; por isso complementa a exploração ADG/pasto da #1, mas não substitui a validação compatível exigida na #6. Relatório e script estão em [`evidence/rothamsted-adg-audit.json`](evidence/rothamsted-adg-audit.json), [`audit_rothamsted_adg.py`](../scripts/audit_rothamsted_adg.py) e [`fontes-dados-candidatos.md`](fontes-dados-candidatos.md).

Para exercitar a interface comparativa com dados reais, existe um protótipo de pesquisa separado: visualizar os três grupos publicados de bezerras (Control, Bucket e Pipe) como **observações do experimento**, com tamanho de grupo, faixa etária, ausência de dados e métricas publicadas. Não extrapolar esses números para bovinos adultos ou pasto, nem fazê-los passar por saída do motor. A amostra de 27 e os NAs documentados fazem esse protótipo inadequado para calibração geral; o split por animal só mede repetibilidade interna e não substitui replicação externa. O responsável decidiu manter esta trilha separada; qualquer modelo/what-if para bezerras exige decisão própria e dados/validação adequados.

### Três etapas para o “Simile do Agro”

1. **Gêmeo exploratório da fazenda (agora):** mapa/lote, cenário-base, intervenção explícita e comparação reproduzível. O motor segue demonstrativo até haver caso e validação compatíveis.
2. **Aprendizagem com resultados reais:** salvar a projeção e versão antes da decisão; depois anexar medições com unidade, procedência, qualidade e consentimento. Comparar erro sem sobrescrever a projeção ou retreinar automaticamente (#12/#16).
3. **Resposta de populações de produtores (pesquisa futura):** estimar como segmentos respondem a preços, recomendações ou políticas. Isso exige amostra representativa, desenho de pesquisa, variáveis de segmentação, desfechos observados e holdout de participantes/fazendas. Personas ou respostas sintéticas de LLM podem testar interface, mas não são dados nem previsões.

Assim, o primeiro MVP atende a exploração de um lote. A ambição “Simile do Agro” pode significar duas coisas diferentes, que precisam ficar explícitas no produto: (a) explorar futuros de uma fazenda sob uma intervenção; ou (b) estimar como grupos de produtores responderiam a preços, políticas ou recomendações. A primeira pode evoluir com cenários determinísticos e resultados de campo vinculados à mesma versão. A segunda exige pesquisa com produtores, amostragem e validação por subgrupo antes de qualquer agente sintético. Não substituir nenhuma das duas por agentes bovinos conversacionais.

### Próximo incremento recomendado e divisão de trabalho

1. **Santleme — levar a decisão do caso à revisão independente (#1/#6):** o responsável aprovou o recorte adulto observacional USDA/CPER para ADG e pastejo; bezerras ficam como módulo separado e não se exigirá efeito causal. Nenhum dos dados disponíveis valida hoje o motor adulto pasto-versus-confinamento. Preservar os roteiros LAMP e WVU até confirmar arquivo, licença, dicionário e IDs de agrupamento.
2. **Santleme — preservar os gates de dados e incerteza:** o contrato #12 foi entregue; a CLI e o painel **Revisar snapshot** validam e ligam uma cópia ao manifesto v1 por digest SHA-256, sem copiar seed, período ou configurações. O exemplo não é um snapshot de fazenda executável. Em #15, manter “sem calibração suficiente”, sem faixas probabilísticas, até haver avaliação retida.
3. **GUZZBR1 — continuar as issues de produto:** #4/#5/#7/#8 estão no PR #17; o fluxo da #13 foi integrado no PR #18 e a proveniência visual da #14 no PR #19, sem fechar os critérios dependentes de #1/#6. A #10 (observação passiva REA) aguarda navegador/CDP. Não duplicar esses recursos nesta trilha local.
4. **Depois da integração — próximo MVP de fazenda:** selecionar valor explícito de uma intervenção, congelar snapshot, executar e repetir pelo manifesto, e mostrar diferença com unidade, horizonte, lacunas e pressupostos no próprio mapa. A previsão continua rotulada demonstrativa enquanto #1/#6 não autorizarem outra classificação.
5. **Depois de medir decisões reais — ciclo de aprendizagem (#16):** ampliar o sidecar local para coleta revisada dentro do mapa, manter projeção original imutável e relatar comparações descritivas antes de qualquer recalibração humana.
6. **Pesquisa futura de população de produtores:** estudar a decisão real de produtores com protocolo consentido, variáveis de segmentação, desfecho e holdout por fazenda/participante. Só então prototipar agentes como instrumento de pesquisa, medir a fidelidade contra a amostra real e expor o erro por subgrupo. LLM pode explicar cenário, mas não deve inventar resposta populacional.

Hugging Face é útil para descobrir, versionar e distribuir datasets/modelos; a documentação do Hub orienta verificar o dataset card, metadados de licença, arquivos e conteúdo antes de uso. Hospedagem ou uma tag de licença não demonstra aderência científica nem licença compatível por si só. Nesta sessão, a busca do conector Hugging Face não ficou disponível; portanto não adicionamos dataset novo por essa via. Kaggle segue útil para fixtures de interface e benchmark técnico depois de inspecionar pacote, origem e licença; datasets sintéticos encontrados não podem calibrar nem validar biologia. Priorizar fontes experimentais/acadêmicas com protocolo, IDs de grupo, unidades e acesso verificável.

### Especificação recomendada do próximo protótipo após as issues Santleme

Construir um **caderno de decisão prospectivo no mapa**, com uma pergunta aprovada na #1 e uma unidade de análise (lote) definida antes de abrir o período. Não ampliar a lista de variáveis do motor primeiro. O fluxo deve: (1) congelar snapshot, manifesto, resultado e data da decisão; (2) registrar qual opção o produtor executou e o que de fato mudou; (3) coletar depois medições com janela, unidade, método e fonte; (4) mostrar cobertura e diferenças apenas para métricas revisadas e alinhadas; e (5) preservar a projeção original. Esse é o protótipo de aprendizagem útil para uma fazenda e pode ser testado com uma pequena parceria consentida, sem chamar o resultado de previsão validada.

O caso de prototipagem está definido: ADG e indicadores observados de pastejo do USDA/CPER. A #1 ainda precisa de revisão zootécnica independente e a #6 de avaliação compatível; os dados atuais não validam CMS, custo ou o contrafactual pasto–confinamento. O contrato da #12 foi concluído; uma integração futura requer mapeamento explícito de uma fazenda real, e o manifesto deverá preservar data-base e ID estável do lote como proveniência da projeção. O sidecar #16 verifica vínculo aos mesmos bytes do manifesto e compatibilidade de lote/rebanho, mas isso não prova que os valores do snapshot foram mapeados ao motor. A #15 permanece sem faixas probabilísticas.

Tratar “Simile do Agro” como duas pistas de produto explícitas: **decisão de manejo de uma fazenda** (este MVP) e **resposta de uma população de produtores** (pesquisa separada). Para a segunda, primeiro coletar respostas reais com protocolo e amostra definida; depois comparar previsões por segmento em holdout de fazendas/produtores. Não gerar personas sintéticas como substituto de pesquisa nem usar LLM para fabricar resposta de mercado.

HF serve aqui como catálogo de candidatos e para fixar revisão/checksum do dataset escolhido. Examinar card, versão, arquivos, esquema, procedência, licença e compatibilidade de população antes de ingestão; metadados do Hub são informação do publicador, não validação científica nem parecer jurídico. Kaggle pode fornecer fixture de UI explicitamente sintética ou um benchmark de visão para biomassa em trilha separada; não usar dataset sintético como evidência biológica. A triagem existente não encontrou dataset aberto que valide o motor adulto atual, então a melhor prototipagem com dados agora é transparência e rastreabilidade, não treino de modelo.

### Escopo preservado para o módulo separado de bezerras

- **Pergunta de pesquisa:** neste protocolo de bezerras leiteiras, como o acesso a feno longo em balde ou tubo se relaciona com peso/ADG e ingestão durante o período pré-desaleitamento?
- **População observada:** 27 bezerras Holandesas, alojadas individualmente, 9 por grupo, nascimento até 60 dias; feno nos grupos Bucket/Pipe até o dia 50 e TMR no desaleitamento.
- **Resultados para uma tela exploratória:** peso observado em kg por idade; ADG derivado em kg/d; ingestão observada de grão/feno/TMR em g MS/d e água em L/d, com NAs e mudanças de fase explícitos.
- **Limite da tela:** descrever este experimento e comparar as observações reportadas; não simular resposta individual futura, recomendar dieta ou validar o motor adulto. Critérios científicos, resumo estatístico e intervalos precisam de revisão por especialista antes de chamar qualquer efeito de estimativa generalizável.

O detalhe do schema, cobertura, licenças e checksums está em [`fontes-dados-candidatos.md`](fontes-dados-candidatos.md). Sem aprovação do recorte, a alternativa mais aderente ao produto é manter Scenario Studio no caso atual e conseguir dados de bovinos de corte/pastejo com acesso e licença adequados antes de apresentar previsões.

## Backlog

As issues e seus critérios de aceite estão no [repositório privado](https://github.com/santleme/riose-agro/issues). A issue [#3](https://github.com/santleme/riose-agro/issues/3) registra o consumo e estoque de forragem entregues; a [#8](https://github.com/santleme/riose-agro/issues/8) acompanha isolamento da aleatoriedade, e a [#10](https://github.com/santleme/riose-agro/issues/10) acompanha observação passiva REA. As issues de colaboração #10, #13 e #14 estão atribuídas a `GUZZBR1`; #1, #6, #12, #15 e #16 estão na trilha `santleme`. A issue #2, sobre documentação de parâmetros e fontes, foi concluída mantendo explícito que os valores atuais são demonstrativos e sem calibração externa.
