# Estudo de formato para saídas de experimentos (2026-10)

## Decisão

Manter JSON como formato de intercâmbio e aceitar JSONL para append/streaming quando isso simplificar o fluxo. **Não adotar Parquet agora.** O toolchain Python existente não tem `pyarrow` nem `fastparquet`; adicionar uma dependência binária sem demonstrar benefício não atende ao gate do roadmap.

Reconsiderar Parquet se medições repetidas com a carga representativa mostrarem pelo menos 2× de benefício ponta a ponta na consulta dominante, ou se houver necessidade real de leitura seletiva de colunas em volumes onde parsear registros inteiros seja material, e o footprint/portabilidade da dependência forem aceitáveis.

## Carga e método

O script [`research_experiment_format.mjs`](../../scripts/research_experiment_format.mjs) executa o runner atual sobre 25 cenários determinísticos com 100 animais e 24 horas por cenário, derivados do fixture `tests/scenarios/baseline-pasture.json` com seeds de 417 a 441. A comparação liga cada resultado ao manifesto de lote pelo `runId` e verifica unidades, valores nulos de proveniência, identidade/build do engine, digest do cenário e do resultado, seed e status.

O lote ocupa 44,273 bytes como JSON e 44,271 bytes como JSONL; após gzip nível 6, ambos ocupam 5,131 bytes. Foram feitas nove repetições por operação, após aquecimento de escrita/leitura completa. Tempos incluem serialização e IO local. JSONL lê linha a linha e retém apenas a projeção solicitada, mas ainda faz parse de cada linha completa. JSON lê e faz parse do array completo. Ambos preservaram todos os campos e passaram round-trip normalizado exato; SHA-256 do conteúdo normalizado: `9af9d8e4decaafae3a01f4cfb568c03946fb98d7c47d5da55225eec33651f125`.

## Resultados observados

| Formato | Gravação (ms) | Leitura completa (ms) | Leitura seletiva (ms) | Bytes gzip nível 6 |
| --- | ---: | ---: | ---: | ---: |
| JSON | 0.515 (0.422–0.816) | 0.544 (0.498–0.711) | 0.472 (0.385–0.509) | 5,131 |
| JSONL | 0.480 (0.412–0.566) | 0.735 (0.633–0.921) | 0.635 (0.548–0.752) | 5,131 |

JSONL foi cerca de 7% mais rápido para escrever, enquanto JSON foi mais rápido para leitura completa e seletiva nesta carga. Tamanho comprimido empatou. Esses números locais não justificam migração de formato nem adoção de Parquet.

A evidência foi capturada em `ab1a5f719700595f3750a24146922fd20d1aa599` com `dirty: false`. O relatório completo com dados brutos por repetição, amostras de memória, manifest digest e limitações está em [`experiment-format-study-2026-10.json`](experiment-format-study-2026-10.json). Reexecute com `npm run research:experiment-format`; `FORMAT_STUDY_RECORDS` e `FORMAT_STUDY_REPETITIONS` ajustam a carga.

## Limitações

- Uma fixture fixa foi expandida em lote determinístico de 25 registros; isto não representa lotes futuros de milhões de registros.
- Parquet não foi medido: nenhuma biblioteca Arrow/Parquet estava instalada e o estudo não adicionou dependências. Footprint e portabilidade binária continuam desconhecidos.
- As medidas de memória são amostras de `process.memoryUsage()` antes/depois de cada operação; RSS é do processo e não representa pico isolado por formato.
- Tempos e memória são específicos deste host, sem pretensão de representar produção.
- Uma mudança substancial no contrato de resultados de #103/#104 deve reabrir o estudo.
