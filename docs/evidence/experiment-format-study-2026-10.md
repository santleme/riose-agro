# Estudo de formato para saídas de experimentos (2026-10)

## Captura completa mais recente (2026-10-13)

JSON, JSONL e Parquet foram medidos com os mesmos 25 resultados e 31 repetições, na revisão limpa `4b422af08bfcf951c526ea91b3a66cdf50915bee`. O relatório completo está em [`experiment-format-study-2026-10-13.json`](./experiment-format-study-2026-10-13.json). Parquet usou PyArrow 26.0.0 em um ambiente isolado com Python 3.12.3; essa dependência não foi adicionada ao runtime do app.

| Formato | Arquivo | Gravação mediana (ms) | Leitura completa (ms) | Leitura seletiva (ms) |
| --- | ---: | ---: | ---: | ---: |
| JSON | 44.273 bytes (gzip: 5.133) | 0,514 | 1,002 | 0,483 |
| JSONL | 44.271 bytes (gzip: 5.133) | 0,525 | 1,246 | 0,572 |
| Parquet + Zstandard | 25.856 bytes | 3,820 | 1,604 | 1,097 |

Os três formatos passaram round-trip normalizado exato, incluindo unidades, proveniência nula, identidade/build do engine, digest e status; a projeção seletiva Parquet também passou igualdade exata. Nesta carga, Parquet foi mais lento nas três operações e seu arquivo Zstandard ficou cerca de 5× maior que JSON ou JSONL com gzip. O footprint instalado do PyArrow foi 168.197.888 bytes, excluindo Python e bibliotecas do sistema. Não há razão de desempenho para trocar JSON como formato padrão; JSONL continua útil para append/streaming quando simplifica o fluxo.

## Decisão

Manter JSON como formato de intercâmbio e aceitar JSONL para append/streaming quando isso simplificar o fluxo. **Não adotar Parquet agora.** Na captura limpa atual, PyArrow 26.0.0 foi usado somente no ambiente de pesquisa opt-in. Parquet foi mais lento nas três operações e o arquivo comprimido foi maior que JSON/JSONL gzip; a distribuição instalada ocupou 168.197.888 bytes, sem Python e bibliotecas compartilhadas. A leitura seletiva por colunas funcionou e preservou os valores, mas não compensou esses custos.

Reconsiderar Parquet se medições repetidas com a carga representativa mostrarem pelo menos 2× de benefício ponta a ponta na consulta dominante, ou se houver necessidade real de leitura seletiva de colunas em volumes onde parsear registros inteiros seja material, e o footprint/portabilidade da dependência forem aceitáveis.

## Carga e método

O script [`research_experiment_format.mjs`](../../scripts/research_experiment_format.mjs) executa o runner atual sobre 25 cenários determinísticos com 100 animais e 24 horas por cenário, derivados do fixture `tests/scenarios/baseline-pasture.json` com seeds de 417 a 441. A comparação liga cada resultado ao manifesto de lote pelo `runId` e verifica unidades, valores nulos de proveniência, identidade/build do engine, digest do cenário e do resultado, seed e status.

O lote ocupa 44.273 bytes como JSON e 44.271 bytes como JSONL; após gzip nível 6, ambos ocupam 5.133 bytes. Parquet + Zstandard ocupa 25.856 bytes. Foram feitas 31 repetições por operação após uma execução de aquecimento para escrita, leitura completa e leitura seletiva em cada formato. Tempos incluem serialização e IO local. JSONL lê linha a linha e retém apenas a projeção solicitada, mas ainda faz parse de cada linha completa. JSON lê e faz parse do array completo. Os três formatos preservaram todos os campos e passaram round-trip normalizado exato; SHA-256 do conteúdo normalizado nesta captura limpa: `161ad6c96d27b5063962c8e01bfe3cdca35ed2b546cd8686191b928365d04f0e`.

## Resultados da captura anterior (revisão b70f25b)

| Formato | Tamanho do arquivo | Gravação (ms) | Leitura completa (ms) | Leitura seletiva (ms) |
| --- | ---: | ---: | ---: | ---: |
| JSON | 44,273 bytes (gzip: 5,133) | 0.606 (0.379–0.840) | 0.964 (0.761–1.299) | 0.481 (0.361–0.689) |
| JSONL | 44,271 bytes (gzip: 5,133) | 0.495 (0.419–0.934) | 1.215 (0.917–2.191) | 0.619 (0.456–0.956) |
| Parquet + Zstandard | 25,856 bytes | 3.984 (3.497–5.531) | 1.738 (1.499–2.452) | 1.205 (0.980–1.960) |

As medianas JSON/JSONL vêm do mesmo lote e da mesma execução de 31 repetições que Parquet. JSON gzip ocupa cerca de 5× menos que Parquet + Zstandard. Parquet reduz o tamanho sem compressão, mas a escrita e as duas leituras foram mais lentas nesta carga; não alcançou o gate de 2× de benefício ponta a ponta.

O protótipo Parquet usou a mesma carga de 25 registros, armazenados em uma tabela Arrow aninhada e escritos com Zstandard. Round-trip normalizado de todos os registros passou, incluindo unidades e provenance nula. A consulta seletiva leu somente `run.scenarioId` e `run.outputs.totalDryMatterIntake.value`; também passou igualdade exata. O resultado de 31 repetições mostra que Parquet economizou bytes contra os arquivos JSON sem compressão, mas ficou cerca de 5× maior que JSON gzip e foi aproximadamente 3–10× mais lento nas operações medidas. O protótipo não serializa registros como strings JSON: usa structs aninhadas e projeta colunas Parquet reais.

A baseline JSON/JSONL histórica foi executada em Node 20.20.2, Python 3.12.3, Linux x64, CPU AMD Ryzen 7 7700X, com a revisão `8331dcf1f04d95ab6778228154cd8ddeb56288b7` e `dirty: false`. A captura anterior com os três formatos usou PyArrow 26.0.0 e a revisão limpa `b70f25b340cde3df5dde48e5422a502c48a7fe2d`; seus resultados brutos estão no [`experiment-format-study-2026-10.json`](experiment-format-study-2026-10.json). A reexecução atual está no arquivo `experiment-format-study-2026-10-13.json`. Reexecute JSON/JSONL com `npm run research:experiment-format`; para incluir Parquet, use o venv e `FORMAT_STUDY_PYTHON` documentados abaixo.

## Reprodução opt-in do Parquet

PyArrow é opcional e permanece fora das dependências do app. Sem `FORMAT_STUDY_PYTHON`, o script consulta `python3`: se PyArrow não estiver instalado nesse interpretador, ainda executa e mede JSON/JSONL, e marca Parquet como ignorado. Ele não instala dependências automaticamente. Para medir Parquet, instale a versão fixada em um ambiente isolado e passe esse interpretador explicitamente:

```sh
python3 -m venv /tmp/riose-format-venv
/tmp/riose-format-venv/bin/python -m pip install -r requirements-format-parquet.txt
FORMAT_STUDY_PYTHON=/tmp/riose-format-venv/bin/python \
FORMAT_STUDY_RECORDS=25 FORMAT_STUDY_REPETITIONS=31 \
node --expose-gc scripts/research_experiment_format.mjs > /tmp/experiment-format-study.json
```

`requirements-format-parquet.txt` fixa `pyarrow==26.0.0`. Para rodar somente a comparação JSON/JSONL sem PyArrow, execute `npm run research:experiment-format`; os controles de lote e repetições continuam opcionais. A saída JSON informa se Parquet foi medido ou ignorado. O redirecionamento acima salva o relatório localmente; só atualize o artefato versionado após verificar a revisão e a marca `dirty` incluídas na captura.

## Captura limpa anterior (2026-10-13, revisão b70f25b)

A revisão `b70f25b340cde3df5dde48e5422a502c48a7fe2d` foi medida limpa (`dirty: false`) com 25 registros e 31 repetições. O digest normalizado do lote JSON, JSONL e Parquet coincide (`161ad6c96d27b5063962c8e01bfe3cdca35ed2b546cd8686191b928365d04f0e`), assim como o digest da projeção seletiva. O protótipo Parquet leu apenas `run.scenarioId` e `run.outputs.totalDryMatterIntake.value` na consulta seletiva. A distribuição PyArrow instalada ocupou 172,316,320 bytes, sem contar Python e bibliotecas compartilhadas do sistema. Nesta captura, Parquet economizou espaço ante os arquivos JSON/JSONL sem compressão, mas ficou cerca de 5× maior que gzip e mais lento que JSON ou JSONL nas três operações; o gate de adoção não foi atingido.

## Limitações

- Uma fixture fixa foi expandida em lote determinístico de 25 registros; isto não representa lotes futuros de milhões de registros.
- O protótipo PyArrow é uma ferramenta opt-in de pesquisa, fora das dependências de execução do app. O footprint reportado soma os arquivos da distribuição Python instalada, excluindo Python e bibliotecas de sistema. Portabilidade medida aqui cobre apenas Python 3.12.3 em Linux x64/WSL2; não houve medição em Windows/macOS nem instalação empacotada em produção.
- As medidas de memória são amostras de `process.memoryUsage()` antes/depois de cada operação; RSS é do processo e não representa pico isolado por formato.
- Tempos e memória são específicos deste host, sem pretensão de representar produção.
- Uma mudança substancial no contrato de resultados de #103/#104 deve reabrir o estudo.
