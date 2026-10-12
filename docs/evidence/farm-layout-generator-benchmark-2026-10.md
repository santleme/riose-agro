# Benchmark de geração de layout — 2026-10

Captura limpa da revisão `8f8656c` (`dirty: false`) com `FARM_LAYOUT_REPETITIONS=30`, `FARM_LAYOUT_WARMUPS=5` e sementes `417–446`. O relatório com todas as observações está em [`farm-layout-generator-benchmark-2026-10.json`](./farm-layout-generator-benchmark-2026-10.json).

| Cena | Itens editáveis | Mediana | p95 |
| --- | ---: | ---: | ---: |
| Beef | 1.090 | 6,74 ms | 10,75 ms |
| Dairy | 1.092 | 6,45 ms | 7,30 ms |
| Dairy com regra de adjacência | 1.092 | 6,61 ms | 7,24 ms |

A medição cobre apenas `generateFarmLayout()` com prefabs e manifesto locais. Exclui leitura de arquivos, renderização e simulação; são observações desta máquina, sem metas de desempenho.
