# Benchmark de geração de layout — 2026-10

Captura limpa da revisão `1a60b28` (`dirty: false`) com `FARM_LAYOUT_REPETITIONS=30`, `FARM_LAYOUT_WARMUPS=5` e sementes `417–446`. O relatório com todas as observações está em [`farm-layout-generator-benchmark-2026-10.json`](./farm-layout-generator-benchmark-2026-10.json).

| Cena | Itens editáveis | Mediana | p95 |
| --- | ---: | ---: | ---: |
| Beef | 1.090 | 7,31 ms | 12,53 ms |
| Dairy | 1.092 | 7,07 ms | 8,10 ms |
| Dairy com regra de adjacência | 1.092 | 6,81 ms | 7,62 ms |

A medição cobre apenas `generateFarmLayout()` com prefabs e manifesto locais. Exclui leitura de arquivos, renderização e simulação; são observações desta máquina, sem metas de desempenho.
