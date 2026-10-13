# Estudo AoS e colunas numéricas alinhadas

## Captura atual (2026-10-13)

A reexecução mais recente usou a revisão limpa `ae33ff03b5ae452aacbc87c93b243c4a1bef0a8e`, com 31 repetições e o mesmo fixture, semente, aquecimentos, transições e verificações descritos abaixo. O relatório completo está em [`animal-layout-study-2026-10-13.json`](./animal-layout-study-2026-10-13.json). As medianas em milissegundos por transição mantêm o resultado anterior: colunas isoladas atualizam mais rápido, mas o caminho SoA fim a fim inclui gather/scatter e perdeu para AoS nas seis combinações.

| Animais | Hora | AoS direto | SoA kernel | Gather | Scatter | SoA fim a fim | Rust nativo |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 7 | 0,000828 | 0,000210 | 0,000134 | 0,000676 | 0,000920 | 0,000108 |
| 100 | 22 | 0,001223 | 0,000479 | 0,000469 | 0,000576 | 0,002010 | 0,000108 |
| 1.000 | 7 | 0,008192 | 0,004890 | 0,004522 | 0,008921 | 0,018344 | 0,000901 |
| 1.000 | 22 | 0,008214 | 0,004738 | 0,004838 | 0,006031 | 0,016459 | 0,001314 |
| 10.000 | 7 | 0,124060 | 0,047915 | 0,047557 | 0,083073 | 0,191653 | 0,009351 |
| 10.000 | 22 | 0,084382 | 0,052312 | 0,050144 | 0,058970 | 0,173579 | 0,009252 |

O protótipo mantém a mesma recomendação: AoS continua em produção. Esta repetição confirma que não há ganho líquido do SoA com as conversões necessárias; não mede o tick completo de 24 horas nem renderer, FFI ou integração Rust.

Reprodução: `node --expose-gc scripts/benchmark-animal-layout.mjs`. O script grava a coleta detalhada; a captura limpa atual está em [`animal-layout-study-2026-10-13.json`](./animal-layout-study-2026-10-13.json), e a captura anterior foi preservada em [`animal-layout-study-2026-10.json`](./animal-layout-study-2026-10.json). A configuração usa o cenário versionado `tests/scenarios/baseline-pasture.json`, semente 417, 8 aquecimentos e 31 amostras por fase para 100, 1.000 e 10.000 animais. As transições ativa (hora 7) e repouso (hora 22) são comparadas com `FarmEngine.tick`; AoS, colunas e Rust precisam produzir peso e energia idênticos.

### Captura anterior (revisão b9cbc09)

O protótipo SoA usa colunas numéricas alinhadas e mede kernel, gather, scatter e custo fim a fim separadamente. Também mede materialização de snapshot, clonagem, serialização JSON e transferência de buffers. A tabela histórica abaixo mostra medianas em milissegundos por transição. O Rust nativo mede apenas o kernel pré-alocado; para os números mais recentes, use a tabela da captura atual no início deste documento.

| Animais | Hora | AoS direto | SoA kernel | Gather | Scatter | SoA fim a fim | Rust nativo |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 7 | 0,000810 | 0,000211 | 0,000126 | 0,000667 | 0,000925 | 0,000153 |
| 100 | 22 | 0,000957 | 0,000512 | 0,000477 | 0,000629 | 0,001651 | 0,000108 |
| 1.000 | 7 | 0,008754 | 0,004880 | 0,004620 | 0,009904 | 0,021941 | 0,000927 |
| 1.000 | 22 | 0,008825 | 0,005077 | 0,006121 | 0,005103 | 0,018526 | 0,000919 |
| 10.000 | 7 | 0,126766 | 0,089465 | 0,061755 | 0,102820 | 0,230713 | 0,014643 |
| 10.000 | 22 | 0,086326 | 0,076775 | 0,063033 | 0,063002 | 0,171427 | 0,009387 |

O kernel SoA isolado é mais rápido, mas gather e scatter tornam o caminho fim a fim mais lento que AoS nas seis combinações desta coleta. Os sete buffers tipados usam 4.500, 45.000 e 450.000 bytes, respectivamente. A comparação de heap após GC é ruidosa e não foi interpretada como economia.

## Amostragem de alocações

O benchmark também coleta perfis amostrados do V8 para transição AoS, kernel SoA, gather, scatter, SoA fim a fim e materialização dos snapshots AoS e de colunas. Cada perfil usa 1.000 aquecimentos, intervalo de amostragem de 4.096 bytes e uma sessão própria; esses perfis são coletados depois das medições de tempo. O GC maior é solicitado antes e depois da operação medida. A tabela normaliza os bytes estimados por milhão de projeções de animais para facilitar a comparação entre populações.

| Animais | Hora | Transição AoS | SoA fim a fim | Snapshot AoS | Snapshot colunas |
|---:|---:|---:|---:|---:|---:|
| 100 | 7 | 2,71 MB | 1,30 MB | 5,87 MB | 6,41 MB |
| 100 | 22 | 16,12 MB | 15,63 MB | 6,07 MB | 6,11 MB |
| 1.000 | 7 | 1,67 MB | 1,54 MB | 6,46 MB | 6,60 MB |
| 1.000 | 22 | 16,11 MB | 16,15 MB | 6,70 MB | 6,45 MB |
| 10.000 | 7 | 2,93 MB | 2,75 MB | 13,36 MB | 12,60 MB |
| 10.000 | 22 | 16,09 MB | 15,73 MB | 13,09 MB | 13,31 MB |

Esses valores são estimativas estatísticas do `HeapProfiler`, não contagens exatas de objetos ou bytes, nem memória viva ou pico de alocação. A amostragem tem variância e pode incluir efeitos do runtime; o relatório JSON preserva a contagem de amostras, bytes estimados e principais pontos atribuídos para cada perfil. Não usar diferenças pequenas como prova de economia.

## Decisão

Manter o estado de produção como objeto por animal. A medição cobre uma transição horária e suas conversões de layout; não mede o tick completo de 24 horas, renderer, FFI ou custo de integração Rust no motor inteiro. O resultado não sustenta alegações sobre esses caminhos.

Para novas coletas, o script decide a recomendação a partir de amostras AoS/SoA fim a fim realmente pareadas, com a ordem alternada entre repetições: só sinaliza ganho repetível se a mediana SoA for menor em cada combinação de população/hora e se SoA vencer ao menos 80% dos pares em cada combinação. Mesmo nesse caso, a saída pede revisão separada antes de qualquer mudança de produção. A captura atual reforça a decisão de manter AoS; nas seis combinações, a mediana SoA fim a fim continua acima da mediana AoS.
