# Benchmark de geração de layout — 2026-10

Captura limpa da revisão `bce1b70e922f5a76c7daa4bb9a29ec09f05a75ae` (`dirty: false`) com 50 repetições, 10 aquecimentos e sementes `417–466`. O relatório com todas as observações está em [`farm-layout-generator-benchmark-2026-10.json`](./farm-layout-generator-benchmark-2026-10.json).

| Cena | Itens editáveis | Mediana | p95 | Min–max |
| --- | ---: | ---: | ---: | ---: |
| Beef | 1.090 | 6,57 ms | 8,38 ms | 6,04–10,22 ms |
| Dairy | 1.092 | 6,43 ms | 7,04 ms | 5,87–7,33 ms |
| Dairy com regra de adjacência | 1.092 | 6,53 ms | 6,99 ms | 5,97–8,39 ms |

A medição cobre apenas `generateFarmLayout()` com prefabs e manifesto locais. Exclui leitura de arquivos, renderização e simulação; são observações desta máquina, sem metas de desempenho. O mapeamento de seeds comuns de 32 bits foi preservado; a correção recente incorpora os bits altos de seeds inteiras seguras.
