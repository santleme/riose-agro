# Benchmark de geração de layout — 2026-10

Captura limpa da revisão `98ff2de` (`dirty: false`) com 50 repetições, 10 aquecimentos e sementes `417–466`. O relatório com todas as observações está em [`farm-layout-generator-benchmark-2026-10.json`](./farm-layout-generator-benchmark-2026-10.json).

| Cena | Itens editáveis | Mediana | p95 |
| --- | ---: | ---: | ---: |
| Beef | 1.090 | 7,42 ms | 10,42 ms |
| Dairy | 1.092 | 7,17 ms | 7,83 ms |
| Dairy com regra de adjacência | 1.092 | 7,68 ms | 9,11 ms |

A medição cobre apenas `generateFarmLayout()` com prefabs e manifesto locais. Exclui leitura de arquivos, renderização e simulação; são observações desta máquina, sem metas de desempenho. O mapeamento de seeds comuns de 32 bits foi preservado; a correção recente incorpora os bits altos de seeds inteiras seguras.
