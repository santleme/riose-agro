# Estudo AoS e colunas numéricas alinhadas

Reprodução: `node --expose-gc scripts/benchmark-animal-layout.mjs`. O comando grava a coleta detalhada em [`animal-layout-study-2026-10.json`](./animal-layout-study-2026-10.json). A medição usa 8 aquecimentos e 31 amostras por fase, nas populações 100, 1.000 e 10.000, dentro do limite atual do `FarmEngine`.

O fixture parte da inicialização determinística do `FarmEngine` com semente `20261012`; a entrada de ingestão vem de `calculateFeeding`. Todos os protótipos usam o mesmo loop por animal, a mesma ordem e ramificação de repouso. A implementação AoS atualiza peso e energia nos objetos. O protótipo SoA pré-aloca colunas `Float64Array` para peso, energia e ingestão, uma coluna `Uint8Array` para repouso e um buffer de saída alinhado. Também é executado o kernel Rust `--release` com a entrada intercalada idêntica. Os resultados de todos os caminhos são comparados antes de aceitar a medição.

## Resultado representativo

Medianas em milissegundos por uma transição de uma hora. A comparação principal inclui leitura/escrita no estado objeto e, no SoA, gather e scatter:

| Animais | AoS direto | SoA kernel | Gather | Scatter | SoA fim a fim | Rust nativo |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0,0134 | 0,0077 | 0,0030 | 0,0034 | 0,0152 | 0,000108 |
| 1.000 | 0,0360 | 0,0064 | 0,0366 | 0,0023 | 0,0709 | 0,00126 |
| 10.000 | 0,1344 | 0,0361 | 0,0398 | 0,0208 | 0,1860 | 0,00903 |

Três execuções independentes mantiveram o custo SoA fim a fim acima do AoS em 1.000 animais (0,0697–0,0709 ms contra 0,0320–0,0360 ms) e 10.000 animais (0,1630–0,1860 ms contra 0,1214–0,1399 ms). Em 100 animais os custos ficaram próximos. Algumas fases curtas tiveram dispersão alta, por isso a decisão usa o ciclo completo e resultados repetidos, e não a vantagem do kernel isolado.

A materialização isolada de objetos de snapshot ficou próxima em 100 animais, e o protótipo de colunas foi mais rápido em 10.000 na amostra representativa (0,0773 ms contra 0,1090 ms). Essa fase não compensa o gather/scatter mais caro da transição no caminho avaliado. Os cinco buffers numéricos ocupam exatamente 410, 41.000 e 410.000 bytes para 100, 1.000 e 10.000 animais. Leituras do heap após GC variaram em poucos KB a cerca de 154 KB e incluem o motor e o harness; não permitem atribuir economia de heap às colunas. Cada variante aloca um objeto por animal ao materializar o snapshot. A contagem de alocações de pico não foi instrumentada.

## Decisão

Manter o estado de produção como objeto por animal. O kernel SoA isolado é mais rápido, mas o ganho não sobrevive à coleta e dispersão dos campos na transição realista medida. Rust é uma referência de custo do kernel numérico em processo nativo; esse número exclui serialização, FFI e custos de integração no motor. O estudo não mede o tick completo de 24 horas, interface ou renderer e não sustenta uma alegação de desempenho para esses caminhos.
