# Estudo AoS e colunas numéricas alinhadas

Reprodução: `node --expose-gc scripts/benchmark-animal-layout.mjs`. O comando grava a coleta detalhada em [`animal-layout-study-2026-10.json`](./animal-layout-study-2026-10.json). A captura usa o cenário versionado `tests/scenarios/baseline-pasture.json`, semente 417, 8 aquecimentos e 31 amostras por fase para 100, 1.000 e 10.000 animais. As transições ativa (hora 7) e repouso (hora 22) são comparadas com `FarmEngine.tick`; AoS, colunas e Rust precisam produzir peso e energia idênticos.

O protótipo SoA usa colunas numéricas alinhadas e mede kernel, gather, scatter e custo fim a fim separadamente. Também mede materialização de snapshot, clonagem, serialização JSON e transferência de buffers. A tabela mostra medianas em milissegundos por transição. O Rust nativo mede apenas o kernel pré-alocado.

| Animais | Hora | AoS direto | SoA kernel | Gather | Scatter | SoA fim a fim | Rust nativo |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 7 | 0,000814 | 0,000208 | 0,000124 | 0,000632 | 0,000899 | 0,000099 |
| 100 | 22 | 0,000857 | 0,000478 | 0,000466 | 0,000572 | 0,001657 | 0,000108 |
| 1.000 | 7 | 0,008758 | 0,004820 | 0,004517 | 0,009097 | 0,017363 | 0,000900 |
| 1.000 | 22 | 0,010263 | 0,004704 | 0,004685 | 0,005607 | 0,015445 | 0,000909 |
| 10.000 | 7 | 0,122756 | 0,073814 | 0,062560 | 0,119993 | 0,327194 | 0,009378 |
| 10.000 | 22 | 0,089847 | 0,051751 | 0,054403 | 0,059785 | 0,178631 | 0,009180 |

O kernel SoA isolado é mais rápido, mas gather e scatter tornam o caminho fim a fim mais lento que AoS nas seis combinações desta coleta. Os sete buffers tipados usam 4.500, 45.000 e 450.000 bytes, respectivamente. A comparação de heap após GC é ruidosa e não foi interpretada como economia. As alocações de pico não são instrumentadas.

## Decisão

Manter o estado de produção como objeto por animal. A medição cobre uma transição horária e suas conversões de layout; não mede o tick completo de 24 horas, renderer, FFI ou custo de integração Rust no motor inteiro. O resultado não sustenta alegações sobre esses caminhos.
