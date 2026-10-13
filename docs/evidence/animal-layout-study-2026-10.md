# Estudo AoS e colunas numéricas alinhadas

Reprodução: `node --expose-gc scripts/benchmark-animal-layout.mjs`. O comando grava a coleta detalhada em [`animal-layout-study-2026-10.json`](./animal-layout-study-2026-10.json). A captura foi feita em `8ba8e96` (`dirty: false`) e usa o cenário versionado `tests/scenarios/baseline-pasture.json`, semente 417, 8 aquecimentos e 31 amostras por fase para 100, 1.000 e 10.000 animais. As transições ativa (hora 7) e repouso (hora 22) são comparadas com `FarmEngine.tick`; AoS, colunas e Rust precisam produzir peso e energia idênticos.

O protótipo SoA usa colunas numéricas alinhadas e mede kernel, gather, scatter e custo fim a fim separadamente. Também mede materialização de snapshot, clonagem, serialização JSON e transferência de buffers. A tabela mostra medianas em milissegundos por transição. O Rust nativo mede apenas o kernel pré-alocado.

| Animais | Hora | AoS direto | SoA kernel | Gather | Scatter | SoA fim a fim | Rust nativo |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 7 | 0,000764 | 0,000211 | 0,000250 | 0,000648 | 0,000866 | 0,000110 |
| 100 | 22 | 0,000881 | 0,000482 | 0,000490 | 0,000562 | 0,001621 | 0,000110 |
| 1.000 | 7 | 0,009761 | 0,004817 | 0,004899 | 0,009338 | 0,018579 | 0,000926 |
| 1.000 | 22 | 0,008573 | 0,004909 | 0,005320 | 0,005708 | 0,016099 | 0,000926 |
| 10.000 | 7 | 0,120705 | 0,049932 | 0,046325 | 0,089872 | 0,199835 | 0,009295 |
| 10.000 | 22 | 0,085149 | 0,047687 | 0,052273 | 0,061409 | 0,166072 | 0,009305 |

O kernel SoA isolado é mais rápido, mas gather e scatter tornam o caminho fim a fim mais lento que AoS nas seis combinações desta coleta. Os sete buffers tipados usam 4.500, 45.000 e 450.000 bytes, respectivamente. A comparação de heap após GC é ruidosa e não foi interpretada como economia. As alocações de pico não são instrumentadas.

## Decisão

Manter o estado de produção como objeto por animal. A medição cobre uma transição horária e suas conversões de layout; não mede o tick completo de 24 horas, renderer, FFI ou custo de integração Rust no motor inteiro. O resultado não sustenta alegações sobre esses caminhos.

Para novas coletas, o script decide a recomendação a partir de amostras AoS/SoA fim a fim realmente pareadas, com a ordem alternada entre repetições: só sinaliza ganho repetível se a mediana SoA for menor em cada combinação de população/hora e se SoA vencer ao menos 80% dos pares em cada combinação. Mesmo nesse caso, a saída pede revisão separada antes de qualquer mudança de produção. A decisão gravada nos números históricos acima foi preservada.
