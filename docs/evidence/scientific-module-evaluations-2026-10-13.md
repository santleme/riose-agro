# Riose: avaliações científicas por módulo (13/10/2026)

A simulação continua útil para explorar cenários com equações científicas dentro do domínio declarado. Calcular um cenário, porém, não demonstra que uma previsão individual representa a população de uma propriedade.

O módulo implementa a Eq. 2.6 do BR-CORTE 2023 para consumo total de matéria seca condicionado ao ADG informado, em zebuínos em crescimento a pasto tropical com suplementação. Isso não valida previsões individuais de consumo em vacas de corte maduras, não faz a equação prever ADG e não valida automaticamente estoque de pasto, custos ou decisões da fazenda. O domínio está detalhado em [`br-corte-2023-cms-pasto.md`](../modelos/br-corte-2023-cms-pasto.md).

## Evidência por desfecho

| Módulo | Coorte e avaliação | Resultado atual | Limite da conclusão |
|---|---|---|---|
| Biomassa de forragem | Mendeley `10.17632/nj72kmdj77.1`, 234 observações completas, 13 componentes espaciais em duas fazendas; CV aninhada por componente com buffer de 100 m | O seletor aninhado escolheu OLS nos 13 blocos. OLS: MAE/RMSE/viés de 649,7/885,7/−3,3 kg DM/ha; isotonic 719,9/1.017,7/+52,0; RF monotônico 679,9/940,4/−14,3; HGB monotônico 686,0/949,8/−9,2. | Desenvolvimento exploratório pós-baseline, não confirmação independente. A família foi escolhida depois da revisão dos resultados anteriores. As 13 componentes estão aninhadas em duas fazendas; altura e biomassa foram medidas nos mesmos pontos, mas a ordem relativa ao corte não está documentada. Não valida nova fazenda, inventário de piquete, consumo ou pastagem tropical em geral. |
| Biomassa, coorte externa | 64 agregados Dryad de massa pré-pastejo pareada com altura, oito paddocks repetidos; avaliação única anterior à nova família de candidatos | OLS: MAE/RMSE/viés 2.507,1/2.986,4/+2.094,7 kg/ha. O seletor da análise nova foi ajustado sem ler esses desfechos. | O holdout Dryad já foi consultado em avaliação anterior, portanto não é validação independente dos candidatos novos. Estimando e protocolo diferem dos quadrados brasileiros; não selecionar modelos com esses resultados. |
| ADG | Novilhos yearling CPER, 320 registros de 2009–2013; validação interna aninhada por ano, removendo identificadores repetidos | Média de treino: MAE/RMSE/viés 0,221/0,298/+0,001 kg/cabeça/dia; OLS apenas com peso inicial: 0,234/0,309/+0,021; Ridge apenas com peso inicial: 0,233/0,308/+0,020. Nenhum candidato superou a média. | Desenvolvimento interno em um local e cinco anos; sem inferência robusta nem validação externa nova. Duração realizada foi excluída por não ser garantidamente conhecida antes do desfecho; tratamento e pasto foram excluídos por estarem perfeitamente associados. |
| ADG, coorte externa previamente consultada | CPER→CGREC, 291 registros de novilhos em um local externo e três anos; comparação histórica congelada | Baseline média: MAE/RMSE/viés 0,242/0,301/−0,132; motor escalado: 0,222/0,310/−0,058; motor padrão: 0,540/0,574/−0,500 kg/cabeça/dia. | Diagnóstico de transporte já consultado, não holdout novo nem seleção para a nova análise. Não é DMI nem valida vacas maduras ou o simulador completo. |
| Comportamento | Perea et al., 24 bovinos em quatro raças; modelo aninhado em seis folds por animal sobre 5.582 linhas temporais comuns | Regra de dois limiares MI: F1 igual por animal para RE/RU 0,392; persistência autoalimentada: 0,364. A seleção aninhada anterior ficou em 0,403 para RE/RU e 0,666 de macro-F1 de quatro classes. | As regras simples foram desenhadas após revisão do baseline e tiveram acurácia por registro de 0,361 e 0,298; não avançaram. Não é validação independente, teste novo de rancho, ingestão ou orçamento de atividade de 24 horas. |
| DMI de vacas maduras a pasto | Nenhuma coorte pública obtida passou o gate de DMI total individual + população + método/unidades + grupos + permissão | **NO-GO; não treinar o alvo original** | Falta evidência independente para confiar em previsões individuais de consumo para esse público-alvo. |

O split espacial antigo da biomassa era otimista: 18 localizações tinham aliases espaciais e 15 eram distribuídas entre folds; 132/234 linhas de teste tinham algum ponto de treino a menos de 100 m. O resultado histórico com GroupKFold permanece preservado como referência, mas o resultado buffered é o diagnóstico interno mais conservador. Nenhum dos dois substitui validação em novas fazendas.

O conjunto chileno de comportamento em vacas leiteiras a pasto tem rótulos de vídeo e sinais IMU úteis para uma avaliação externa separada. O repositório é acessível, mas não declara uma licença de reutilização dos dados; por isso não foi incluído no caminho de treino/avaliação comercial. O artigo também relata somente 10 vacas e 10 eventos de repouso, o que limita métricas estáveis por classe. Ver [artigo e declaração de disponibilidade](https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2025.1630083/full), [repositório de dados](https://github.com/WASP-lab/db-cow-walking) e [auditoria de candidatos comportamentais](behavior-external-dataset-candidates-2026-10.md).

## Artefatos reproduzíveis

- Biomassa: [relatório de desenvolvimento espacial aninhado](../../experiments/biomass/nested-development-2026-10/evaluation-report.md), [protocolo](../../experiments/diagnostics/biomass/preregister-nested-height-models-2026-10.md) e [teste externo Dryad já consultado](../../experiments/biomass/dryad-external/evaluation-report.md).
- ADG: [desenvolvimento CPER aninhado](../../experiments/diagnostics/adg/cper-preoutcome-candidate-v1/evaluation.md) e [diagnóstico externo histórico CPER→CGREC](engine-adg-usda-cgrec-transport-check.json).
- Comportamento: [desenvolvimento de limiares e persistência](../../experiments/behavior/perea-threshold-persistence-development/results.md), [seleção temporal aninhada anterior](../../experiments/behavior/perea-nested-animal/results.md) e [OOF agrupado congelado](perea-behavior-grouped-evaluation.md).
- DMI: [descoberta de dados abertos e lacuna do alvo](open-scientific-data-discovery-2026-10.md).
- Incerteza: [readiness da issue #15](uncertainty-readiness-issue-15-2026-10.md).

## Gates que permanecem

- Biomassa: obter outra fazenda com protocolo de amostragem compatível e altura medida antes da coleta-alvo para avaliar transferência.
- ADG: obter um holdout independente, com duração planejada conhecida e covariáveis alinhadas de manejo e forragem; manter a população de novilhos separada da de vacas.
- Comportamento: usar animais e ranchos independentes com licença explícita e rótulos compatíveis; não tratar dados de outra espécie ou sistema como mistura da coorte Perea.
- DMI: obter microdados públicos compatíveis de vacas de corte maduras a pasto e grupos suficientes para avaliação independente por animal/ensaio.
- Incerteza: estimar cobertura somente com dados independentes compatíveis por desfecho. Erro pontual e sensibilidade determinística não são intervalos probabilísticos.
