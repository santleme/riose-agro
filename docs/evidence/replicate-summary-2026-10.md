# Resumo de replicatas — 2026-10

O agregador em `experiments/replicate-summary.js` consome registros concluídos do manifesto de experimentos em lote. Para resumir um arquivo produzido pelo runner, execute `node scripts/summarize-experiment-replicates.mjs <batch-manifest.json> <batch-results.jsonl> [summary.json] [campo-de-entrada ...]`. Ele verifica os digests e vínculos de cada resultado, agrupa por campos de entrada declarados, valida unidades por saída e calcula `n`, média, desvio padrão amostral e quantis empíricos Type 7 (p05, p25, p50, p75 e p95). Falhas, lotes ainda em execução e saídas ausentes permanecem contados separadamente. Cada grupo registra os IDs das execuções por estado; cada saída lista os IDs incluídos e ausentes. Resumos ligados a manifesto também incluem o ID do experimento, digest do manifesto e digests dos resultados usados. Unidades incompatíveis são erro.

Os valores são ordenados antes das reduções numéricas e a média/variância usam soma compensada para deixar os resultados invariantes à ordem dos registros e reduzir erro de arredondamento. IDs de execução duplicados são rejeitados para preservar proveniência inequívoca.

Essas medidas descrevem a variação entre replicatas. Os quantis não são intervalos de confiança e não estimam incerteza calibrada. O issue #15 continua responsável pela calibração estatística.

## Desempenho

`node scripts/benchmark-replicate-summary.mjs` mede sete agregações por carga, após um aquecimento, com dois outputs numéricos e dois grupos sintéticos. A captura anterior usa a revisão `50b53a2ac92ab35410a6a4a635258a70d93b2f02`; a captura limpa atual (`ae33ff03b5ae452aacbc87c93b243c4a1bef0a8e`, `dirty: false`) e suas amostras estão em [`replicate-summary-benchmark-2026-10-13.json`](./replicate-summary-benchmark-2026-10-13.json):

| Registros | Mediana por agregação | Heap observado após agregação |
| ---: | ---: | ---: |
| 1.000 | 4,05 ms | 15,4 MB |
| 10.000 | 18,84 ms | 18,6 MB |
| 100.000 | 256,55 ms | 83,2 MB |

O heap inclui as entradas sintéticas mantidas pelo benchmark; não representa alocação incremental do agregador. A API recebe uma lista completa, então a agregação não é streaming. Na carga de 100 mil registros, o tempo mediano foi cerca de 257 ms; a retenção total de dados fica visível no relatório JSON. As entradas são sintéticas e o teste mede o agregador sobre uma lista completa, não o runner nem o motor da fazenda. A captura anterior foi preservada em [`replicate-summary-benchmark-2026-10.json`](./replicate-summary-benchmark-2026-10.json).

## Limites

- A análise inclui somente execuções `completed`; execuções `failed` contribuem à contagem de falhas.
- Saídas não numéricas não são agregadas.
- `standardDeviation` é desvio padrão amostral e retorna `null` para menos de duas observações.
- O resumo não substitui avaliação de coortes, desenho experimental ou revisão de domínio.

Relatório bruto atual: `docs/evidence/replicate-summary-benchmark-2026-10-13.json`; captura anterior: `docs/evidence/replicate-summary-benchmark-2026-10.json`.
