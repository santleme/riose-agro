# Riose: avaliações científicas por módulo (13/10/2026)

A simulação continua útil como exploração de cenários apoiada por equações científicas dentro do domínio declarado. A distinção é entre calcular um cenário e demonstrar que uma previsão individual representa uma população real específica.

Por exemplo, o módulo implementa a Eq. 2.6 do BR-CORTE 2023 para consumo total de matéria seca condicionado ao ADG informado, em zebuínos em crescimento a pasto tropical com suplementação. A publicação descreve a população e sua validação. Isso não demonstra desempenho individual em vacas de corte maduras, não faz a própria equação prever ADG e não valida toda a simulação de estoque de pasto, custos ou decisões da fazenda. Os detalhes do domínio e da implementação estão em [`br-corte-2023-cms-pasto.md`](../modelos/br-corte-2023-cms-pasto.md).

## Evidência observacional separada por desfecho

| Módulo | Coorte e avaliação | Resultado atual | Limite da conclusão |
|---|---|---|---|
| Biomassa de forragem | Mendeley `10.17632/nj72kmdj77.1`, 342 observações em duas fazendas; GroupKFold de cinco folds por ponto espacial, 234 casos completos para altura | Regressão linear por altura: MAE 634,005, RMSE 871,162 e viés +1,090 kg DM/ha; baseline mediana: MAE 943,434, RMSE 1.268,270 e viés −311,506 | Diagnóstico interno em pontos/campanhas das mesmas fazendas. Vizinhos próximos podem ser correlacionados; não valida novas fazendas, inventário de piquete ou consumo animal. Junho sem altura foi excluído. |
| ADG | Novilhos yearling; desenvolvimento USDA/CPER (Colorado) e holdout USDA/CGREC (Dakota do Norte), 291 registros no holdout | Média de treino: MAE 0,242/RMSE 0,301/viés −0,132 kg/d; escala congelada do motor: 0,222/0,310/−0,058; motor default: 0,540/0,574/−0,500 | Diagnóstico de transporte ADG em um local externo e três anos. Não é DMI, não valida vacas maduras nem o motor completo. |
| Comportamento | Perea et al., 24 bovinos em quatro raças; seis folds OOF agrupados por animal; regressão logística com apenas motion index | Macro-F1 com peso igual por animal: 0,664, balanced accuracy 0,720; baseline majoritária: macro-F1 0,150, balanced accuracy 0,250 | Holdout por animal dentro de um único conjunto de dois ranchos, sem teste externo. Não mede ingestão, ADG ou orçamento de atividade de 24 horas. |
| DMI de vacas maduras a pasto | Nenhuma coorte pública obtida passou o gate de população + DMI total individual + unidades/método + grupos | **NO-GO; sem treino para o alvo original** | Continua faltando evidência independente para confiar em previsões individuais de consumo nesse público-alvo. |

Cada avaliação mantém protocolo, dados, partições e previsões em artefatos separados:

- [Biomassa: relatório de readiness e OOF agrupado](mendeley-pasture-biomass-prediction-readiness-2026-10.md)
- [ADG: holdout externo CPER→CGREC](engine-adg-usda-cgrec-transport-check.json) e [readiness](adg-independent-evaluation-readiness-2026-10.md)
- [Comportamento: relatório agrupado por animal e predições OOF](perea-behavior-grouped-evaluation.md)
- [DMI: auditoria de fontes abertas e lacuna do alvo](open-scientific-data-discovery-2026-10.md)

## Gates que permanecem

- Biomassa: ampliar para uma terceira fazenda e controlar dependência espacial entre amostras antes de alegar transferência.
- ADG: avaliar a população de uso pretendida com covariáveis de manejo/forragem alinhadas; o resultado atual fica restrito a novilhos.
- Comportamento: testar em ranchos/animais independentes e sensores mais completos antes de uso operacional.
- DMI: obter observações públicas compatíveis de vacas de corte maduras a pasto e avaliação independente por animal/ensaio. O experimento separado de novilhos em confinamento não atende esse gate.
- Incerteza: estimar cobertura somente com dados independentes compatíveis com cada desfecho; as métricas pontuais acima não são intervalos probabilísticos.
