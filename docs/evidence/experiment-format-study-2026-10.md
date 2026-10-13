# Estudo de formato para saídas de experimentos (2026-10)

## Decisão

Manter JSON como formato de intercâmbio e aceitar JSONL para append/streaming quando isso simplificar o fluxo. **Não adotar Parquet agora.** Medi Parquet de verdade em um ambiente Python opt-in com PyArrow 26.0.0, sem adicionar a biblioteca ao runtime do app. Na carga medida, Parquet foi mais lento que JSON/JSONL nas três operações e seu arquivo comprimido foi maior que JSON/JSONL com gzip; a distribuição PyArrow instalada ocupou 172,316,845 bytes (o wheel baixado ocupou 53.9 MB). A leitura seletiva por colunas funcionou e preservou os valores, mas não compensou esses custos.

Reconsiderar Parquet se medições repetidas com a carga representativa mostrarem pelo menos 2× de benefício ponta a ponta na consulta dominante, ou se houver necessidade real de leitura seletiva de colunas em volumes onde parsear registros inteiros seja material, e o footprint/portabilidade da dependência forem aceitáveis.

## Carga e método

O script [`research_experiment_format.mjs`](../../scripts/research_experiment_format.mjs) executa o runner atual sobre 25 cenários determinísticos com 100 animais e 24 horas por cenário, derivados do fixture `tests/scenarios/baseline-pasture.json` com seeds de 417 a 441. A comparação liga cada resultado ao manifesto de lote pelo `runId` e verifica unidades, valores nulos de proveniência, identidade/build do engine, digest do cenário e do resultado, seed e status.

O lote ocupa 44,273 bytes como JSON e 44,271 bytes como JSONL; após gzip nível 6, ambos ocupam 5,133 bytes. Foram feitas 31 repetições por operação nesta reexecução, após aquecimento de escrita/leitura completa. Tempos incluem serialização e IO local. JSONL lê linha a linha e retém apenas a projeção solicitada, mas ainda faz parse de cada linha completa. JSON lê e faz parse do array completo. Ambos preservaram todos os campos e passaram round-trip normalizado exato; SHA-256 do conteúdo normalizado nesta captura: `161ad6c96d27b5063962c8e01bfe3cdca35ed2b546cd8686191b928365d04f0e`.

## Resultados observados

| Formato | Tamanho do arquivo | Gravação (ms) | Leitura completa (ms) | Leitura seletiva (ms) |
| --- | ---: | ---: | ---: | ---: |
| JSON | 44,273 bytes (gzip: 5,133) | 0.440 (0.322–0.608) | 0.519 (0.422–0.767) | 0.458 (0.333–0.932) |
| JSONL | 44,271 bytes (gzip: 5,133) | 0.486 (0.397–0.637) | 0.716 (0.558–1.013) | 0.763 (0.460–2.740) |
| Parquet + Zstandard | 25,856 bytes | 3.513 (3.210–4.106) | 1.496 (1.413–2.170) | 1.016 (0.967–1.060) |

As medianas JSON/JSONL vêm do mesmo lote e da mesma execução de 31 repetições que Parquet. JSON gzip ocupa cerca de 5× menos que Parquet + Zstandard. Parquet reduz o tamanho sem compressão, mas a escrita e as duas leituras foram mais lentas nesta carga; não alcançou o gate de 2× de benefício ponta a ponta.

O protótipo Parquet usou a mesma carga de 25 registros, armazenados em uma tabela Arrow aninhada e escritos com Zstandard. Round-trip normalizado de todos os registros passou, incluindo unidades e provenance nula. A consulta seletiva leu somente `run.scenarioId` e `run.outputs.totalDryMatterIntake.value`; também passou igualdade exata. O resultado de 31 repetições mostra que Parquet economizou bytes contra os arquivos JSON sem compressão, mas ficou cerca de 5× maior que JSON gzip e foi 1.3–8× mais lento nas operações medidas. O protótipo não serializa registros como strings JSON: usa structs aninhadas e projeta colunas Parquet reais.

A baseline JSON/JSONL histórica foi executada em Node 20.20.2, Python 3.12.3, Linux x64, CPU AMD Ryzen 7 7700X, com a revisão `8331dcf1f04d95ab6778228154cd8ddeb56288b7` e `dirty: false`. A captura deste estudo ampliado foi executada no mesmo tipo de ambiente com PyArrow 26.0.0, 31 repetições e a fonte em alteração (`4d56404424de7f6651813b42cbb1f380aa05982f`, `dirty: true`); seus resultados brutos estão no JSON vinculado. O relatório completo com dados brutos por repetição, amostras de memória, manifest digest e limitações está em [`experiment-format-study-2026-10.json`](experiment-format-study-2026-10.json). Reexecute a baseline com `npm run research:experiment-format`. Para reproduzir também Parquet, crie um venv, instale `requirements-format-parquet.txt` e passe o interpretador por `FORMAT_STUDY_PYTHON=/path/to/venv/bin/python`; `FORMAT_STUDY_RECORDS` e `FORMAT_STUDY_REPETITIONS` ajustam a carga.

## Limitações

- Uma fixture fixa foi expandida em lote determinístico de 25 registros; isto não representa lotes futuros de milhões de registros.
- O protótipo PyArrow é uma ferramenta opt-in de pesquisa, fora das dependências de execução do app. O footprint reportado soma os arquivos da distribuição Python instalada, excluindo Python e bibliotecas de sistema. Portabilidade medida aqui cobre apenas Python 3.12.3 em Linux x64/WSL2; não houve medição em Windows/macOS nem instalação empacotada em produção.
- As medidas de memória são amostras de `process.memoryUsage()` antes/depois de cada operação; RSS é do processo e não representa pico isolado por formato.
- Tempos e memória são específicos deste host, sem pretensão de representar produção.
- Uma mudança substancial no contrato de resultados de #103/#104 deve reabrir o estudo.
