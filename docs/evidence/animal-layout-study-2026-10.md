# Estudo AoS e colunas numéricas alinhadas

Reprodução: `node --expose-gc scripts/benchmark-animal-layout.mjs`. O comando grava a coleta detalhada em [`animal-layout-study-2026-10.json`](./animal-layout-study-2026-10.json). A captura limpa mais recente foi feita em `4f81a61d39b9710adbbe4077a572ff6d5191f0ac` (`dirty: false`) e usa o cenário versionado `tests/scenarios/baseline-pasture.json`, semente 417, 8 aquecimentos e 31 amostras por fase para 100, 1.000 e 10.000 animais. As transições ativa (hora 7) e repouso (hora 22) são comparadas com `FarmEngine.tick`; AoS, colunas e Rust precisam produzir peso e energia idênticos.

O protótipo SoA usa colunas numéricas alinhadas e mede kernel, gather, scatter e custo fim a fim separadamente. Também mede materialização de snapshot, clonagem, serialização JSON e transferência de buffers. A tabela mostra medianas em milissegundos por transição. O Rust nativo mede apenas o kernel pré-alocado.

| Animais | Hora | AoS direto | SoA kernel | Gather | Scatter | SoA fim a fim | Rust nativo |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 7 | 0,000772 | 0,000213 | 0,000125 | 0,000615 | 0,000855 | 0,000108 |
| 100 | 22 | 0,000824 | 0,000482 | 0,000480 | 0,000560 | 0,001563 | 0,000144 |
| 1.000 | 7 | 0,009128 | 0,004761 | 0,006421 | 0,008923 | 0,017856 | 0,000900 |
| 1.000 | 22 | 0,008326 | 0,004792 | 0,005220 | 0,005771 | 0,016836 | 0,000918 |
| 10.000 | 7 | 0,122742 | 0,060266 | 0,049378 | 0,084775 | 0,200901 | 0,009261 |
| 10.000 | 22 | 0,088340 | 0,049386 | 0,053599 | 0,060815 | 0,181364 | 0,009297 |

O kernel SoA isolado é mais rápido, mas gather e scatter tornam o caminho fim a fim mais lento que AoS nas seis combinações desta coleta. Os sete buffers tipados usam 4.500, 45.000 e 450.000 bytes, respectivamente. A comparação de heap após GC é ruidosa e não foi interpretada como economia. As alocações de pico não são instrumentadas.

## Decisão

Manter o estado de produção como objeto por animal. A medição cobre uma transição horária e suas conversões de layout; não mede o tick completo de 24 horas, renderer, FFI ou custo de integração Rust no motor inteiro. O resultado não sustenta alegações sobre esses caminhos.

Para novas coletas, o script decide a recomendação a partir de amostras AoS/SoA fim a fim realmente pareadas, com a ordem alternada entre repetições: só sinaliza ganho repetível se a mediana SoA for menor em cada combinação de população/hora e se SoA vencer ao menos 80% dos pares em cada combinação. Mesmo nesse caso, a saída pede revisão separada antes de qualquer mudança de produção. A captura atual reforça a decisão de manter AoS; nas seis combinações, a mediana SoA fim a fim continua acima da mediana AoS.
