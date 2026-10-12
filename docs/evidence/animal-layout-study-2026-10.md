# Estudo AoS e colunas numéricas alinhadas

Reprodução: `node --expose-gc scripts/benchmark-animal-layout.mjs`. O comando grava a coleta detalhada em [`animal-layout-study-2026-10.json`](./animal-layout-study-2026-10.json). A captura foi feita em `dd6111e` (`dirty: false`) e usa o cenário versionado `tests/scenarios/baseline-pasture.json`, semente 417, 8 aquecimentos e 31 amostras por fase para 100, 1.000 e 10.000 animais. As transições ativa (hora 7) e repouso (hora 22) são comparadas com `FarmEngine.tick`; AoS, colunas e Rust precisam produzir peso e energia idênticos.

O protótipo SoA usa colunas numéricas alinhadas e mede kernel, gather, scatter e custo fim a fim separadamente. Também mede materialização de snapshot, clonagem, serialização JSON e transferência de buffers. A tabela mostra medianas em milissegundos por transição. O Rust nativo mede apenas o kernel pré-alocado.

| Animais | Hora | AoS direto | SoA kernel | Gather | Scatter | SoA fim a fim | Rust nativo |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 7 | 0,000798 | 0,000217 | 0,000124 | 0,000672 | 0,000900 | 0,000108 |
| 100 | 22 | 0,000842 | 0,000475 | 0,000473 | 0,000566 | 0,001652 | 0,000108 |
| 1.000 | 7 | 0,008163 | 0,004798 | 0,004547 | 0,009105 | 0,018366 | 0,000891 |
| 1.000 | 22 | 0,010332 | 0,004741 | 0,004718 | 0,005595 | 0,015784 | 0,000909 |
| 10.000 | 7 | 0,110427 | 0,047586 | 0,045050 | 0,083803 | 0,198936 | 0,009072 |
| 10.000 | 22 | 0,074988 | 0,047517 | 0,053506 | 0,055875 | 0,161337 | 0,009081 |

O kernel SoA isolado é mais rápido, mas gather e scatter tornam o caminho fim a fim mais lento que AoS nas seis combinações desta coleta. Os sete buffers tipados usam 4.500, 45.000 e 450.000 bytes, respectivamente. A comparação de heap após GC é ruidosa e não foi interpretada como economia. As alocações de pico não são instrumentadas.

## Decisão

Manter o estado de produção como objeto por animal. A medição cobre uma transição horária e suas conversões de layout; não mede o tick completo de 24 horas, renderer, FFI ou custo de integração Rust no motor inteiro. O resultado não sustenta alegações sobre esses caminhos.
