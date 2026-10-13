# Estudo AoS e colunas numéricas alinhadas

Reprodução: `node --expose-gc scripts/benchmark-animal-layout.mjs`. O comando grava a coleta detalhada em [`animal-layout-study-2026-10.json`](./animal-layout-study-2026-10.json). A captura limpa mais recente foi feita em `a81f6ebdf4f77f4d43548e3dd6da81b30fb5d6b2` (`dirty: false`) e usa o cenário versionado `tests/scenarios/baseline-pasture.json`, semente 417, 8 aquecimentos e 31 amostras por fase para 100, 1.000 e 10.000 animais. As transições ativa (hora 7) e repouso (hora 22) são comparadas com `FarmEngine.tick`; AoS, colunas e Rust precisam produzir peso e energia idênticos.

O protótipo SoA usa colunas numéricas alinhadas e mede kernel, gather, scatter e custo fim a fim separadamente. Também mede materialização de snapshot, clonagem, serialização JSON e transferência de buffers. A tabela mostra medianas em milissegundos por transição. O Rust nativo mede apenas o kernel pré-alocado.

| Animais | Hora | AoS direto | SoA kernel | Gather | Scatter | SoA fim a fim | Rust nativo |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 7 | 0,000959 | 0,000210 | 0,000132 | 0,000712 | 0,000911 | 0,000108 |
| 100 | 22 | 0,000926 | 0,000849 | 0,000500 | 0,000581 | 0,001660 | 0,000162 |
| 1.000 | 7 | 0,008806 | 0,005014 | 0,006390 | 0,008592 | 0,020598 | 0,000918 |
| 1.000 | 22 | 0,007790 | 0,005640 | 0,004860 | 0,005695 | 0,016105 | 0,000909 |
| 10.000 | 7 | 0,121534 | 0,049896 | 0,047698 | 0,085628 | 0,192398 | 0,009306 |
| 10.000 | 22 | 0,078538 | 0,048999 | 0,053133 | 0,056624 | 0,158203 | 0,009216 |

O kernel SoA isolado é mais rápido, mas gather e scatter tornam o caminho fim a fim mais lento que AoS nas seis combinações desta coleta. Os sete buffers tipados usam 4.500, 45.000 e 450.000 bytes, respectivamente. A comparação de heap após GC é ruidosa e não foi interpretada como economia.

## Amostragem de alocações

O benchmark também coleta perfis amostrados do V8 para transição AoS, kernel SoA, gather, scatter, SoA fim a fim e materialização dos snapshots AoS e de colunas. Cada perfil usa 1.000 aquecimentos, intervalo de amostragem de 4.096 bytes e uma sessão própria; esses perfis são coletados depois das medições de tempo. O GC maior é solicitado antes e depois da operação medida. A tabela normaliza os bytes estimados por milhão de projeções de animais para facilitar a comparação entre populações.

| Animais | Hora | Transição AoS | SoA fim a fim | Snapshot AoS | Snapshot colunas |
|---:|---:|---:|---:|---:|---:|
| 100 | 7 | 2,85 MB | 1,35 MB | 6,07 MB | 6,07 MB |
| 100 | 22 | 16,08 MB | 16,06 MB | 6,29 MB | 6,18 MB |
| 1.000 | 7 | 1,76 MB | 1,70 MB | 6,37 MB | 6,52 MB |
| 1.000 | 22 | 15,83 MB | 15,90 MB | 6,46 MB | 6,39 MB |
| 10.000 | 7 | 3,07 MB | 3,18 MB | 13,41 MB | 13,54 MB |
| 10.000 | 22 | 16,08 MB | 16,13 MB | 12,80 MB | 13,19 MB |

Esses valores são estimativas estatísticas do `HeapProfiler`, não contagens exatas de objetos ou bytes, nem memória viva ou pico de alocação. A amostragem tem variância e pode incluir efeitos do runtime; o relatório JSON preserva a contagem de amostras, bytes estimados e principais pontos atribuídos para cada perfil. Não usar diferenças pequenas como prova de economia.

## Decisão

Manter o estado de produção como objeto por animal. A medição cobre uma transição horária e suas conversões de layout; não mede o tick completo de 24 horas, renderer, FFI ou custo de integração Rust no motor inteiro. O resultado não sustenta alegações sobre esses caminhos.

Para novas coletas, o script decide a recomendação a partir de amostras AoS/SoA fim a fim realmente pareadas, com a ordem alternada entre repetições: só sinaliza ganho repetível se a mediana SoA for menor em cada combinação de população/hora e se SoA vencer ao menos 80% dos pares em cada combinação. Mesmo nesse caso, a saída pede revisão separada antes de qualquer mudança de produção. A captura atual reforça a decisão de manter AoS; nas seis combinações, a mediana SoA fim a fim continua acima da mediana AoS.
