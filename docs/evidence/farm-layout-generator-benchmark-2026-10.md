# Benchmark de geração de layout — 2026-10

Captura completa da revisão `7ee4a740c9c2f528a036b710ac9582d54e05395a` (`dirty: false`), já incluindo a implementação de seed de `scene-layout.js` que incorpora os bits altos de inteiros seguros. Foram usadas 50 repetições, 10 aquecimentos e seeds `417–466`. O relatório com todas as observações está em [`farm-layout-generator-benchmark-2026-10.json`](./farm-layout-generator-benchmark-2026-10.json).

| Cena | Itens editáveis | Mediana | p95 | Min–max |
| --- | ---: | ---: | ---: | ---: |
| Beef | 1.090 | 9,50 ms | 11,94 ms | 7,27–18,97 ms |
| Dairy | 1.092 | 9,15 ms | 12,12 ms | 7,15–13,69 ms |
| Dairy com regra de adjacência | 1.092 | 10,20 ms | 13,51 ms | 6,86–14,49 ms |

A medição cobre apenas `generateFarmLayout()` com prefabs e manifesto locais. Exclui leitura de arquivos, renderização e simulação; são observações desta máquina, sem metas de desempenho. O benchmark usa seeds de 32 bits neste sweep; a mudança de implementação também evita que seeds seguras acima de 32 bits se aliasem, cuja correção é coberta por `tests/farm-layout-generator.test.js`.
