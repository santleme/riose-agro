# Benchmark de geração de layout — 2026-10

Captura limpa da revisão `5c91167f7dfa9d7209edf4352536b40a7865415e` (`dirty: false`) com 50 repetições, 10 aquecimentos e sementes `417–466`. O relatório com todas as observações está em [`farm-layout-generator-benchmark-2026-10.json`](./farm-layout-generator-benchmark-2026-10.json).

| Cena | Itens editáveis | Mediana | p95 | Min–max |
| --- | ---: | ---: | ---: | ---: |
| Beef | 1.090 | 8,04 ms | 11,19 ms | 7,15–13,73 ms |
| Dairy | 1.092 | 8,52 ms | 12,09 ms | 7,09–12,83 ms |
| Dairy com regra de adjacência | 1.092 | 8,19 ms | 11,07 ms | 7,03–11,78 ms |

A medição cobre apenas `generateFarmLayout()` com prefabs e manifesto locais. Exclui leitura de arquivos, renderização e simulação; são observações desta máquina, sem metas de desempenho. O mapeamento de seeds comuns de 32 bits foi preservado; a correção recente incorpora os bits altos de seeds inteiras seguras.
