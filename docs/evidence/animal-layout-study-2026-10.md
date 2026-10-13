# Estudo AoS e colunas numéricas alinhadas

Reprodução: `node --expose-gc scripts/benchmark-animal-layout.mjs`. O comando grava a coleta detalhada em [`animal-layout-study-2026-10.json`](./animal-layout-study-2026-10.json). A captura foi feita em `4d56404` (`dirty: false`) e usa o cenário versionado `tests/scenarios/baseline-pasture.json`, semente 417, 8 aquecimentos e 31 amostras por fase para 100, 1.000 e 10.000 animais. As transições ativa (hora 7) e repouso (hora 22) são comparadas com `FarmEngine.tick`; AoS, colunas e Rust precisam produzir peso e energia idênticos.

O protótipo SoA usa colunas numéricas alinhadas e mede kernel, gather, scatter e custo fim a fim separadamente. Também mede materialização de snapshot, clonagem, serialização JSON e transferência de buffers. A tabela mostra medianas em milissegundos por transição. O Rust nativo mede apenas o kernel pré-alocado.

| Animais | Hora | AoS direto | SoA kernel | Gather | Scatter | SoA fim a fim | Rust nativo |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 7 | 0,000781 | 0,000214 | 0,000127 | 0,000659 | 0,000872 | 0,000110 |
| 100 | 22 | 0,000864 | 0,000501 | 0,000502 | 0,000605 | 0,001612 | 0,000110 |
| 1.000 | 7 | 0,012564 | 0,004933 | 0,007025 | 0,009677 | 0,024819 | 0,000935 |
| 1.000 | 22 | 0,009028 | 0,004894 | 0,004919 | 0,006058 | 0,016653 | 0,001412 |
| 10.000 | 7 | 0,120993 | 0,083044 | 0,052829 | 0,096757 | 0,205292 | 0,013759 |
| 10.000 | 22 | 0,137985 | 0,050121 | 0,053259 | 0,061021 | 0,196880 | 0,009470 |

O kernel SoA isolado é mais rápido, mas gather e scatter tornam o caminho fim a fim mais lento que AoS nas seis combinações desta coleta. Os sete buffers tipados usam 4.500, 45.000 e 450.000 bytes, respectivamente. A comparação de heap após GC é ruidosa e não foi interpretada como economia. As alocações de pico não são instrumentadas.

## Decisão

Manter o estado de produção como objeto por animal. A medição cobre uma transição horária e suas conversões de layout; não mede o tick completo de 24 horas, renderer, FFI ou custo de integração Rust no motor inteiro. O resultado não sustenta alegações sobre esses caminhos.

Para novas coletas, o script decide a recomendação a partir de amostras AoS/SoA fim a fim realmente pareadas, com a ordem alternada entre repetições: só sinaliza ganho repetível se a mediana SoA for menor em cada combinação de população/hora e se SoA vencer ao menos 80% dos pares em cada combinação. Mesmo nesse caso, a saída pede revisão separada antes de qualquer mudança de produção. A captura atual reforça a decisão de manter AoS; nas seis combinações, a mediana SoA fim a fim continua acima da mediana AoS.
