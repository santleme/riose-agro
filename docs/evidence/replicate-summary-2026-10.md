# Resumo de replicatas — 2026-10

O agregador em `experiments/replicate-summary.js` consome registros concluídos do manifesto de experimentos em lote. Para resumir um arquivo produzido pelo runner, execute `node scripts/summarize-experiment-replicates.mjs <batch-manifest.json> <batch-results.jsonl> [summary.json] [campo-de-entrada ...]`. Ele verifica os digests e vínculos de cada resultado, agrupa por campos de entrada declarados, valida unidades por saída e calcula `n`, média, desvio padrão amostral e quantis empíricos Type 7 (p05, p25, p50, p75 e p95). Falhas, lotes ainda em execução e saídas ausentes permanecem contados separadamente. Cada grupo registra os IDs das execuções por estado; cada saída lista os IDs incluídos e ausentes. Resumos ligados a manifesto também incluem o ID do experimento, digest do manifesto e digests dos resultados usados. Unidades incompatíveis são erro.

Os valores são ordenados antes das reduções numéricas e a média/variância usam soma compensada para deixar os resultados invariantes à ordem dos registros e reduzir erro de arredondamento. IDs de execução duplicados são rejeitados para preservar proveniência inequívoca.

Essas medidas descrevem a variação entre replicatas. Os quantis não são intervalos de confiança e não estimam incerteza calibrada. O issue #15 continua responsável pela calibração estatística.

## Desempenho

`node scripts/benchmark-replicate-summary.mjs` mediu sete agregações por carga, após um aquecimento, com dois outputs numéricos e dois grupos sintéticos:

| Registros | Mediana por agregação (captura anterior à inclusão de proveniência por ID) | Heap observado após agregação |
| ---: | ---: | ---: |
| 1.000 | 1,47 ms | 5,9 MB |
| 10.000 | 11,09 ms | 13,9 MB |
| 100.000 | 143,80 ms | 86,3 MB |

O heap inclui as entradas sintéticas mantidas pelo benchmark; não representa alocação incremental do agregador. A API recebe uma lista completa, então a agregação não é streaming. Mesmo na carga de 100 mil registros, o tempo mediano foi cerca de 144 ms, mas a retenção total de dados fica visível no relatório JSON.

## Limites

- A análise inclui somente execuções `completed`; execuções `failed` contribuem à contagem de falhas.
- Saídas não numéricas não são agregadas.
- `standardDeviation` é desvio padrão amostral e retorna `null` para menos de duas observações.
- O resumo não substitui avaliação de coortes, desenho experimental ou revisão de domínio.

Relatório bruto: `docs/evidence/replicate-summary-benchmark-2026-10.json`.
