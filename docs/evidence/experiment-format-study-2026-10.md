# Estudo de formato para saídas de experimentos (2026-10)

## Decisão

Manter JSON como formato de intercâmbio e aceitar JSONL para append/streaming quando isso simplificar o fluxo. **Não adotar Parquet agora.** O toolchain Python existente não tem `pyarrow` nem `fastparquet`; adicionar uma dependência binária sem demonstrar benefício não atende ao gate do roadmap. Nenhum dado ou campo foi removido na comparação JSON/JSONL.

Reconsiderar Parquet se medições repetidas com a carga representativa mostrarem pelo menos 2× de benefício ponta a ponta na consulta dominante, ou se houver necessidade real de leitura seletiva de colunas em volumes onde parsear registros inteiros seja material, e o footprint/portabilidade da dependência forem aceitáveis.

## Carga e método

O script [`research_experiment_format.mjs`](../../scripts/research_experiment_format.mjs) executa o runner atual sobre 25 cenários determinísticos com 100 animais e 24 horas por cenário, derivados do fixture `tests/scenarios/baseline-pasture.json` com seeds de 417 a 441. O lote tem 2,264,732 bytes como JSON e 2,264,730 bytes como JSONL; após gzip nível 6, 254,263 e 254,390 bytes, respectivamente.

Cada formato foi gravado, lido integralmente e consultado para `scenarioId` e ingestão total. Foram feitas nove repetições por operação; tempos são medianas locais com mínimos/máximos. A leitura seletiva ainda lê e faz parse de todos os registros. Logo, JSONL não fornece projeção de colunas; não havia implementação Parquet para comparar. Memória reporta heap/RSS/external/ArrayBuffers do processo amostrados antes/depois; não é memória de pico isolada por formato.

## Resultados observados

| Formato | Gravação (ms) | Leitura completa (ms) | Consulta de métrica (ms) | Bytes gzip nível 6 |
| --- | ---: | ---: | ---: | ---: |
| JSON | 5.19 (4.60–10.33) | 20.23 (18.05–28.20) | 11.08 (10.78–12.21) | 254,263 |
| JSONL | 3.80 (3.42–4.21) | 19.09 (18.33–19.89) | 10.99 (10.69–14.06) | 254,390 |

JSON e JSONL fizeram round-trip sem diferenças após normalização, com SHA-256 `acfe77be653e7404d494cb2f26fca19e84c1c665f36cba43cf416680aa1a4d39`. Os tempos e tamanhos são próximos nesta carga; não justificam adicionar Parquet ou migrar o formato padrão.

O registro completo dos resultados, incluindo runtime, medições por repetição, amostras de memória e limitações, está em [`experiment-format-study-2026-10.json`](experiment-format-study-2026-10.json). Reexecute com `npm run research:experiment-format`; `FORMAT_STUDY_RECORDS` e `FORMAT_STUDY_REPETITIONS` ajustam a carga.

## Limitações

- A medição representa o formato de saída atual do runner, não lotes futuros de dezenas de milhões de registros.
- JSONL e JSON contêm os mesmos registros completos; nenhum campo, unidade, valor nulo, proveniência ou falha foi removido.
- Parquet não foi medido: nenhuma biblioteca Arrow/Parquet estava instalada e o estudo não adicionou dependências. Footprint e portabilidade binária de Parquet permanecem desconhecidos.
- O RSS é do processo e as amostras são específicas deste host; não são um orçamento de memória por tarefa nem números de produção.
- Uma futura mudança substancial no contrato de resultados de #103/#104 deve reabrir o estudo.
