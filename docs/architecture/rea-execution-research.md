# REA 6.4.0 e arquitetura de execução da Riose

**Data:** 13 de outubro de 2026  
**Branch:** `codex/rea-research`, revisão integrada `fb69c16` (merge local de `origin/main`, que contém PR #116)
**Escopo:** validar o experimento opt-in `history-ring` contra o `main` atualizado, mantendo contratos e alterações de PR #116. A feature está isolada e permanece desligada por padrão.

## Decisão

**Estado recomendado: EXPERIMENTAL / OPT-IN.** Manter a técnica de histórico circular como feature opt-in (`history-ring`), sem ativá-la por padrão. Na matriz pareada do `main` integrado, 21 das 24 cargas melhoraram; três cargas de um dia regrediram, com a maior queda de 13,1%. O ganho mediano por população foi de 4,1%, 7,2% e 5,8% para 100, 1.000 e 10.000 animais. Os snapshots completos foram byte a byte idênticos nas 24 cargas. No workload end-to-end de dois braços, a mediana caiu 27,4% nos 21 pares e o p95 caiu 29,0% (807,519 para 573,776 ms). Há regressões em simulações curtas e um aumento de RSS de cerca de 5 MiB em medições de processos curtos numa carga de 1.000 animais/30 dias. Esses resultados não implicam ganho em todas as cargas.

O ganho medido pertence à mudança no armazenamento de histórico. REA forneceu evidência estática de layout e dependências; não foi usado como perfilador nem como fonte de alegações de desempenho. A suíte Rust padrão e com a feature, testes JS/Python, cenários e paridade cross-engine passaram após a integração.

## Instalação e capacidades REA no WSL

- `rea --version` retornou `6.4.0`. `rea update` confirmou `status=current`, `currentVersion=6.4.0`, `latestVersion=6.4.0`, `installMethod=npm`.
- O CLI 6.4.0 lista `inspect-binary-layout` e executou a inspeção ELF no WSL. Para habilitar o parser ELF, usei o virtualenv já existente em `/tmp/riose-rea-venv` (`pwntools 4.15.0`, `pyelftools 0.33`, `unicorn 2.1.2`) via `REA_PWNTOOLS_PYTHON`. Não alterei a configuração global do Codex.
- Ghidra, Hopper e `perf` não estão disponíveis no PATH. Portanto, a sessão possibilita inventário estático ELF, mas não decompilação, pseudocódigo, amostragem de pilhas ou perfil de CPU.

## Comparáveis open source

São comparáveis pelos mecanismos de execução, não por equivalência científica do modelo.

| Projeto | Mecanismo relevante | Aplicabilidade e limite para Riose |
| --- | --- | --- |
| [Rayon](https://docs.rs/rayon/latest/rayon/) | Iteradores paralelos Rust e work stealing ([FAQ](https://github.com/rayon-rs/rayon/blob/main/FAQ.md)). | O kernel metabólico puro é independente por animal, mas é uma parte pequena do tick; forragem, eventos e RNG ainda impõem dependências de ordem. É candidata para um lote isolado, sem fundamento atual para migrar o tick inteiro. |
| [Bevy ECS](https://bevy.org/learn/quick-start/getting-started/ecs/) | Sistemas Rust e agenda ECS com execução paralela quando os acessos aos dados permitem. | Referência de projeto para explicitar dependências entre sistemas. Migrar estado e snapshots para ECS tem custo maior e exige manter os contratos atuais. |
| [LAMMPS](https://docs.lammps.org/Build_basics.html) | Simulação científica com decomposição espacial MPI e suporte OpenMP em partes do sistema ([OpenMP](https://docs.lammps.org/Speed_omp.html)). | É comparação útil para paralelizar partículas com interação espacial. A Riose tem quatro estoques compartilhados e atualização ordenada; a decomposição não transfere diretamente. LAMMPS não está instalado neste WSL. |
| [Open MPI](https://www.open-mpi.org/) | Runtime MPI para iniciar e coordenar processos paralelos. WSL contém Open MPI 4.1.6 e os ELFs `orterun` e `libmpi` foram inspecionados pelo REA. | Evidencia o custo/complexidade de paralelismo entre processos. Para a Riose, Rayon seria uma escala menor e mais compatível com o kernel atual; MPI não é uma recomendação de adoção. |

As comparações descrevem mecanismos, não equivalência científica. A inspeção REA dos comparáveis cobre os binários Open MPI presentes no WSL; Rayon, Bevy e LAMMPS foram comparados por suas fontes/documentação oficiais e não foram compilados neste experimento.

## Inspeção REA dos binários Riose

Os binários Riose de controle e da implementação final com cursor circular, além de `orterun` e `libmpi.so.40.30.6`, foram inspecionados com `rea inspect-binary-layout` 6.4.0. As evidências dos binários atuais estão em [`rea-riose-cursor-sequential-layout-2026-10-13.json`](../evidence/rea-riose-cursor-sequential-layout-2026-10-13.json) e [`rea-riose-cursor-ring-layout-2026-10-13.json`](../evidence/rea-riose-cursor-ring-layout-2026-10-13.json). Também preservei as inspeções das versões intermediárias e Open MPI em [`rea-riose-sequential-layout-2026-10-13.json`](../evidence/rea-riose-sequential-layout-2026-10-13.json), [`rea-riose-history-ring-layout-2026-10-13.json`](../evidence/rea-riose-history-ring-layout-2026-10-13.json), [`rea-riose-merged-sequential-layout-2026-10-13.json`](../evidence/rea-riose-merged-sequential-layout-2026-10-13.json), [`rea-riose-merged-history-ring-layout-2026-10-13.json`](../evidence/rea-riose-merged-history-ring-layout-2026-10-13.json), [`rea-openmpi-orterun-layout-2026-10-13.json`](../evidence/rea-openmpi-orterun-layout-2026-10-13.json) e [`rea-openmpi-libmpi-layout-2026-10-13.json`](../evidence/rea-openmpi-libmpi-layout-2026-10-13.json).

| Observação estática | Controle | `history-ring` |
| --- | ---: | ---: |
| Evidence REA | `ev_3b695ddfd3673660abffe1aa6b2dff8dbb2db5731e5714f059aba0cb212fd82c` | `ev_8d039d00010d57df29bec464fc678c729c13c9a203b44042c8288a353ce15038` |
| SHA-256 ELF | `b69bda00dbb5e617f55e784ea50c9de64862c6288b62b43bc9b6cd88cf3bee5a` | `14461028371dbb2a92565d27a1d98b1798e5a5c6241664bc795a07900835e82f` |
| Tamanho | 890.304 bytes | 892.808 bytes |
| Tipo / arquitetura | ELF `ET_DYN`, x86-64, little-endian | ELF `ET_DYN`, x86-64, little-endian |
| Seções / segmentos | 35 / 12 | 35 / 12 |
| Bibliotecas ELF `NEEDED` | `libgcc_s.so.1`, `libc.so.6` | `libgcc_s.so.1`, `libc.so.6` |
| Símbolos / relocações | 1.305 / 1.064 | 1.307 / 1.066 |

Na revisão integrada, o executável experimental cresceu 2.504 bytes (0,28%) e não adicionou dependências dinâmicas. Ambos têm 35 seções, 12 segmentos e dependem de `libgcc_s.so.1`, `libm.so.6` e `libc.so.6`. As versões intermediárias com `VecDeque` tiveram tamanhos diferentes; seus registros preservados não descrevem o binário final. São observações de layout, não medições de memória residente nem prova de comportamento em runtime. O projeto declara `serde` e `serde_json` no Cargo; a lista ELF mostra apenas dependências dinâmicas, não dependências Rust linkadas estaticamente.

O `orterun` tem 14.488 bytes, 29 seções, 13 segmentos, 30 símbolos e 32 relocações; suas dependências ELF incluem `libopen-rte.so.40`, `libopen-pal.so.40`, `libevent_core-2.1.so.7` e `libc.so.6`. A `libmpi.so.40.30.6` tem 1.182.056 bytes, 29 seções, 11 segmentos, 2.201 símbolos e 1.921 relocações; depende de Open RTE, Open PAL, `libm`, `libhwloc` e `libc`. Isso confirma a estrutura dinâmica do runtime presente, sem demonstrar execução distribuída da Riose.

Limites REA: o perfil analisou bytes ELF e tabelas de seção/símbolo/relocação, mas não iniciou os binários. O estado de execução do entry point é `unknown`; caminhos de bibliotecas carregadas e base de carga são desconhecidos; completude do inventário de relocações e mapas GOT/PLT também é desconhecida. Os indicadores de mitigação são inferências estáticas. Sem Ghidra/Hopper não houve decompilação nem pseudocódigo. Não trate esses resultados como profiling.

## Técnica experimental

`AnimalState.history` e o formato público do snapshot continuam `Vec<ActivityRecord>`; JSON permanece uma lista cronológica limitada a 40 itens. Com a feature `history-ring`, `FarmEngine` mantém um índice privado (`u8`) para a entrada mais antiga. Quando o histórico enche, substitui essa posição em O(1) e avança o índice circular. `snapshot()` clona a lista e a gira para recuperar a ordem cronológica. Sem a feature, o caminho original continua ativo. O anel reaproveita o `Vec` existente, sem reservar 40 itens por animal.

O motivo técnico é a rotina atual de controle: depois de cada mudança de atividade, ela faz `Vec::remove(0)` quando chega a 40 registros, deslocando as outras entradas. O cursor evita o deslocamento sem alocar um buffer separado por animal e sem alterar cálculos, semente aleatória, ordem das atualizações, eventos, IDs ou serialização externa.

## Técnicas avaliadas

| Técnica | Decisão | Fundamento |
| --- | --- | --- |
| Histórico limitado por cursor circular sobre `Vec<ActivityRecord>` (`history-ring`) | Implementada como feature opt-in | Evita deslocar as 40 entradas e mantém o formato público; teve ganho no workload end-to-end, mas ainda tem perdas curtas e RSS variável. |
| Paralelizar lote metabólico independente com Rayon | Adiada | As atualizações por animal admitem isolamento depois que os insumos são calculados, mas o lote é apenas parte do tick; falta medir seu peso e validar determinismo sob paralelismo. |
| Agenda de sistemas baseada em dependências, como Bevy ECS | Não implementada | Pode liberar paralelismo entre sistemas, mas exige reestruturar estado e acesso compartilhado. É mudança maior sem evidência de que o agendador seja o gargalo. |

A decomposição espacial do LAMMPS e o runtime MPI foram comparados como mecanismos, mas não são candidatos de implementação: a Riose tem poucos estoques compartilhados e contratos de atualização em ordem.

## Benchmark e paridade

Hardware e compilação: WSL2, Linux `6.6.87.2-microsoft-standard-WSL2`, AMD Ryzen 7 7700X, x86-64; Rust 1.95.0; perfil Cargo release do workspace (thin LTO, um codegen unit, panic abort). A carga fornecida como baseline pelo usuário é de 10.000 animais/30 dias com mediana de 666 ms. Esse valor veio de outro revisionamento/harness e de um fluxo end-to-end de dois braços; não é comparável diretamente ao ensaio de um braço abaixo.

No checkout atualizado, `scripts/benchmark-history-ring-matrix.py` compila os dois modos e intercala por caso 24 cargas (100/1.000/10.000 animais, 1/30 dias, seeds 417/2026, pasto/galpão). Cada processo faz 3 aquecimentos e 21 repetições. O trecho cronometrado inclui criação do estado, configuração, ticks e serialização do snapshot. p50/p95 usam nearest rank. `/usr/bin/time` registra o RSS máximo do processo inteiro, incluindo aquecimentos. Os resultados brutos, amostras, RSS e hashes estão em [`rea-history-ring-matrix-2026-10-13.json`](../performance/rea-history-ring-matrix-2026-10-13.json).

| População | Casos | Mediana da razão p50 controle/anel | Casos com ganho | Diferença mediana de RSS máximo (controle − anel) |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 8 | 1,043× (4,1%) | 7/8 | 2 KiB |
| 1.000 | 8 | 1,078× (7,2%) | 7/8 | 60 KiB |
| 10.000 | 8 | 1,062× (5,8%) | 7/8 | -8 KiB |

Nos quatro casos de 10.000 animais/30 dias, a melhora mediana foi 23,2% no p50 e 17,7% no p95; o RSS máximo mediano ficou praticamente igual, com 48 KiB a mais no candidato. As três regressões ocorreram em cargas de um dia, incluindo uma de 13,1% em 1.000 animais. Os snapshots serializados foram idênticos por SHA-256 em todos os 24 pares. Isso valida a paridade de estado final nessas cargas, não substitui toda a cobertura de trajetória já existente.

O RSS em processos novos mostrou cerca de 5 MiB a mais no cursor: em 1.000 animais/30 dias/galpão, seis repetições deram 19,6–19,7 MiB no controle e 24,9–25,1 MiB no cursor, em duas seeds. Para distinguir um pico inicial de crescimento acumulado, rodei 60 simulações consecutivas dentro de cada processo, com 3 aquecimentos, para as duas variantes e seeds 417/2026. O `VmRSS` oscilou entre estados de reutilização do allocator; o `VmHWM` chegou a aproximadamente 25 MiB nas duas variantes e ficou estável nas últimas dez repetições. Não houve crescimento monotônico contínuo nessa janela. O aquecimento do processo elevou o pico ao longo das repetições antes do platô, então o traço não prova ausência de retenção pelo allocator e não explica a diferença vista em processos curtos. Registrei cada leitura em [`rea-history-ring-rss-in-process-2026-10-13.json`](../performance/rea-history-ring-rss-in-process-2026-10-13.json) e as medições de processos novos em [`rea-history-ring-rss-repeat-2026-10-13.json`](../performance/rea-history-ring-rss-repeat-2026-10-13.json). O cursor adiciona apenas um `Vec<u8>` por engine e reutiliza os vetores de histórico existentes; não atribuo a diferença observada a um local de alocação sem profiling.

As medições intermediárias foram preservadas para mostrar a decisão de implementação. A variante `VecDeque::with_capacity(40)` aumentou o RSS em cerca de 9,5–10 MiB para 10.000 animais/um dia ([dados](../performance/rea-history-ring-matrix-prefetch40-2026-10-13.json)) e não é a implementação final. A variante com crescimento e compactação tardia foi mais lenta em cenários de 10.000 animais/um dia ([dados](../performance/rea-history-ring-matrix-lazy-shrink-2026-10-13.json)); também foi descartada. A versão atual mantém `Vec<ActivityRecord>` e adiciona apenas o cursor por animal.

| Medição anterior à integração de `main` | Controle sequencial | `history-ring` | Variação |
| --- | ---: | ---: | ---: |
| Core, mediana (p95), ms; 21 amostras | 676,144 (858,056) | 339,580 (347,515) | -49,8% mediana |
| Processo `riose-run`, mediana (p95), ms; 5 amostras | 712,667 (735,640) | 464,676 (502,200) | -34,8% mediana |

Esses resultados anteriores pertencem à revisão pré-merge e não substituem a matriz acima. As amostras e hashes históricos estão em [`rea-execution-30-day-2026-10-13.json`](../performance/rea-execution-30-day-2026-10-13.json).

Também repeti no `main` integrado o workload end-to-end de dois braços: seed 2026, 10.000 animais, 30 dias, requisição idêntica (SHA-256 `fe46a5af5895a37f5e84311df534f597f556980c5c1b45a55cbba9546ec6e51d`), 3 aquecimentos e 21 pares no mesmo WSL. Na implementação final, a mediana do processo foi 699,093 ms no controle e 507,441 ms com `history-ring` (-27,4%); p95 nearest-rank foi 807,519 e 573,776 ms. `nativeResult` foi exatamente igual nos 21 pares. O controle atual ficou 5,0% acima dos 666 ms históricos; o candidato ficou 23,8% abaixo. O histórico veio de outra revisão e amostragem e serve apenas como referência. Tempos e amostras estão em [`rea-execution-current-10k-30d-process-2026-10-13.json`](../performance/rea-execution-current-10k-30d-process-2026-10-13.json); a execução intermediária com reserva antecipada está em [`rea-execution-current-10k-30d-process-vecdeque-2026-10-13.json`](../performance/rea-execution-current-10k-30d-process-vecdeque-2026-10-13.json).

A medição histórica exata de 666,240 ms veio de `a6293fd` e outro conjunto de amostras. A mediana arredondada de 666 ms informada pelo usuário é o mesmo baseline histórico aproximado. A medição end-to-end atual usa a mesma requisição, mas revisão e amostragem diferentes: compara-se controle e candidato dentro do par atual (699,093 → 507,441 ms), sem atribuir causalmente a diferença em relação aos 666 ms históricos. As amostras originais estão em [`rea-execution-30-day-2026-10-13.json`](../performance/rea-execution-30-day-2026-10-13.json).

Paridade observada:

- SHA-256 da requisição compartilhada: `fe46a5af5895a37f5e84311df534f597f556980c5c1b45a55cbba9546ec6e51d`.
- A saída científica `nativeResult` foi igual nos cinco pares cronometrados; uma verificação adicional encontrou igualdade do envelope completo em outros cinco pares.
- JSON da comparação de 30 dias serializado pelo benchmark interno: mesmo SHA-256 nos dois builds, `1727a3d2383aec8f4f889bae4983426ce191aa8c261101847b5e96c555cbb862`.
- Snapshots finais completos dos braços pasto e confinamento: SHA-256 igual nos dois builds, `21d16df787976d2f199e238e880e138dfd93ea87b80c084fac1bc4d148cedba4`.
- Na revisão atual após integrar `main`, os snapshots finais byte a byte foram iguais em todas as 24 combinações da matriz; os hashes por par estão no JSON dela.
- No benchmark de processo atual, `nativeResult` foi igual nos 21 pares; os hashes/timing estão no JSON end-to-end.

Para repetir no mesmo checkout:

```sh
python3 scripts/benchmark-history-ring-matrix.py > docs/performance/rea-history-ring-matrix-2026-10-13.json

cargo build --locked --release -p riose-core --bin bench-execution-30d --bin riose-run
RIOSE_REQUEST_OUT=/tmp/riose-10k-30d-request.json target/release/bench-execution-30d
cp target/release/riose-run /tmp/riose-run-sequential
cargo build --locked --release -p riose-core --bin riose-run --features riose-core/history-ring
cp target/release/riose-run /tmp/riose-run-history-ring
python3 scripts/benchmark-rea-process.py --input /tmp/riose-10k-30d-request.json --baseline /tmp/riose-run-sequential --candidate /tmp/riose-run-history-ring --warmups 3 --repetitions 21
```

## Pendências e decisão de adoção

- **Decisão:** recomendar o merge da PR quando o CI completo passar e a revisão não encontrar regressão nova. A feature continua **EXPERIMENTAL / OPT-IN**, sem ativação padrão; as medições mostram ganhos em 21 de 24 cargas, paridade exata nas cargas testadas, três regressões curtas de até 13,1% e a diferença de RSS de processos novos ainda sem causa identificada. O traço de 60 ciclos não mostrou crescimento contínuo sem limite: os picos das duas variantes convergiram para cerca de 25 MiB e estabilizaram nas últimas dez repetições. Isso não é prova de equivalência de memória em todos os workloads.
- O benchmark mede tempo decorrido, não localiza hot spots. `perf` não está disponível, então não afirmo qual porcentagem do tempo pertence a `remove(0)` nem que a análise estática identificou uma causa medida.
- `rea update` foi executado após as inspeções; a instalação npm permaneceu em 6.4.0. A configuração global do Codex não foi alterada.
- Na revisão experimental final, passaram `cargo test --locked --workspace` (25 testes da lib; 54 no total), `cargo test --locked --workspace --features riose-core/history-ring` (28 testes da lib; 57 no total), `npm test` (566 testes), a suíte Python (123 testes), `npm run test:scenarios`, `npm run test:parity`, `npm run build:wasm`, `cargo fmt --all -- --check` e `git diff --check`. O artefato WASM não mudou. Os testes e CI serão repetidos para a revisão que será enviada à PR.
- A branch local `codex/rea-research` recebeu `origin/main` em `fb69c16`; o histórico do PR #116 está preservado. Esta pesquisa não deve gerar novas issues para a mesma otimização sem evidência materialmente nova.
