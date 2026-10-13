# REA 6.4.0 e arquitetura de execução da Riose

**Data:** 13 de outubro de 2026  
**Branch:** `codex/rea-research`, criada sobre `16fa6ec` (`origin/main`)  
**Escopo:** experimento opt-in em `riose-core`; PR #116 e suas alterações locais não foram editados nem integrados.

## Decisão

Manter a técnica de histórico circular como experimento opt-in (`history-ring`). Na comparação de duas trajetórias de 30 dias, o runner com a feature reduziu a mediana de processo de 779,4 ms para 483,6 ms (38,0%) e produziu resultado científico exatamente igual ao controle. Não promovê-la ainda ao caminho padrão: o resultado histórico de 666,2 ms veio de outro revisionamento, não há perfilador disponível neste WSL e o trabalho ainda precisa de cobertura de regressão antes de retirar o controle sequencial.

O ganho medido pertence à mudança no armazenamento de histórico. REA forneceu evidência estática de layout e dependências; não foi usado como perfilador nem como fonte de alegações de desempenho.

## Instalação e capacidades REA no WSL

- `rea` não estava no `PATH`. `npx rea-agents@6.4.0 --version` disponibilizou o CLI 6.4.0; `npx rea-agents@6.4.0 update` informou `currentVersion=6.4.0`, `latestVersion=6.4.0` e `installMethod=unknown`.
- A sessão MCP já conectada ainda executa `rea-agents@6.3.0` (139 ferramentas). Executar o `rea update` dessa instalação retornou `failed / unknown-install-method`; não alterei a configuração global do Codex.
- O diagnóstico somente de leitura do CLI 6.4.0 encontrou a inscrição Codex desatualizada em `/mnt/c/Users/LUCAS COIMBRA/.codex/config.toml`, apontando para `npx -y rea-agents@6.3.0 mcp`. O mesmo diagnóstico indica Node 20.20.2 abaixo do requisito do 6.4.0 (Node 22.19+, 24.11+ ou 26+) e recomenda `rea setup` para atualizar a inscrição. Essa alteração global não foi autorizada e ficou pendente.
- A simulação de `rea setup --client codex --dry-run --json` retornou `status=needs_human`, `plannedActions=[]` e orientação para instalar um Node compatível e repetir a operação. O dry-run não alterou arquivos e, com o runtime WSL atual, não produziu um plano de escrita.
- Ghidra, Hopper e inscrição IDA não estão configurados. O servidor MCP não tinha Python com as dependências ELF. Para viabilizar a inspeção estrutural solicitada, criei somente `/tmp/riose-rea-venv` com `pwntools 4.15.0`, `pyelftools 0.33` e `unicorn 2.1.2` e chamei o CLI 6.4.0 com `REA_PWNTOOLS_PYTHON` apontando para esse virtualenv. Nenhum arquivo de configuração Codex foi escrito.
- O `perf` do Linux não está instalado. Logo, não há perfil de CPU, amostras de pilha nem atribuição de tempo por função nesta execução.

## Comparáveis open source

São comparáveis pelos mecanismos de execução, não por equivalência científica do modelo.

| Projeto | Mecanismo relevante | Aplicabilidade e limite para Riose |
| --- | --- | --- |
| [Rayon](https://github.com/rayon-rs/rayon) | Iteradores paralelos Rust e work stealing ([FAQ](https://github.com/rayon-rs/rayon/blob/main/FAQ.md)). | O kernel metabólico puro é independente por animal, mas é uma parte pequena do tick; a simulação ainda atualiza forragem compartilhada, eventos e RNG em ordem. Deixei a paralelização como candidata, sem introduzir Rayon. |
| [Bevy ECS](https://github.com/bevyengine/bevy/blob/main/examples/ecs/ecs_guide.rs) | Agenda sistemas em paralelo quando os acessos mutáveis permitem e explicita ordenação quando necessário. | É uma referência para separar sistemas e declarar dependências. Migrar o estado público para ECS seria uma mudança maior e exigiria preservar a ordem científica e os snapshots atuais. |
| [LAMMPS](https://github.com/lammps/lammps/blob/develop/doc/src/Intro_overview.rst) | Simulação de partículas com decomposição espacial MPI, além de caminhos OpenMP, vetorizados e GPU em partes do sistema. | Demonstra particionamento para cargas de partículas; a Riose tem somente quatro estoques de pasto compartilhados e atualização determinística ordenada, então essa decomposição não transfere diretamente. |

Usei fontes oficiais dos projetos para comparar os mecanismos. Não obtive nem analisei binários desses projetos; a inspeção REA abaixo é dos binários Rust controle/experimento da Riose.

## Inspeção REA dos binários Riose

O `riose-run` de controle e o build com `history-ring` foram compilados em release no mesmo workspace e inspecionados pelo `rea inspect-binary-layout` 6.4.0. Os registros integrais estão em [`rea-riose-run-sequential-2026-10-13.json`](../evidence/rea-riose-run-sequential-2026-10-13.json) e [`rea-riose-run-history-ring-2026-10-13.json`](../evidence/rea-riose-run-history-ring-2026-10-13.json).

| Observação estática | Controle | `history-ring` |
| --- | ---: | ---: |
| Evidence REA | `ev_f29940bfe88f3ea879ba3575782d0dbf2561c774e8763e420d02d7d57a25561c` | `ev_d9824e73ad965891bcd27aa35d08e88eb4caed8841fc77f93682549bc51306d1` |
| SHA-256 ELF | `ba4b2f882ca0c4cf23e5e9595805bbf6452205477a50e8694234c9c2db94c515` | `0df794cb90ae0644b4531fa2974b4244f7020741c6ad78a20df1330260e65184` |
| Tamanho | 830.944 bytes | 834.112 bytes |
| Tipo / arquitetura | ELF `ET_DYN`, x86-64, little-endian | ELF `ET_DYN`, x86-64, little-endian |
| Seções / segmentos | 35 / 12 | 35 / 12 |
| Bibliotecas ELF `NEEDED` | `libgcc_s.so.1`, `libc.so.6` | `libgcc_s.so.1`, `libc.so.6` |
| Símbolos / relocações | 1.265 / 1.025 | 1.269 / 1.026 |

O executável experimental cresceu 3.168 bytes (0,38%) e não adicionou dependência dinâmica. Isso é uma observação de layout, não uma medição de memória residente nem prova de comportamento em runtime. O projeto declara `serde` e `serde_json` no Cargo; a lista ELF acima mostra apenas dependências dinâmicas, não dependências Rust linkadas estaticamente.

Limites REA: o perfil analisou bytes ELF e tabelas de seção/símbolo/relocação, mas não iniciou o binário. O estado de execução do entry point é `unknown`; caminhos de bibliotecas carregadas e base de carga são desconhecidos; completude do inventário de relocações e mapas GOT/PLT também é desconhecida. Os indicadores de mitigação são inferências estáticas. Sem Ghidra/Hopper não houve decompilação nem pseudocódigo. Não trate esses resultados como profiling.

## Técnica experimental

`AnimalState.history` e a forma pública do snapshot continuam `Vec<ActivityRecord>`; JSON continua sendo uma lista cronológica limitada a 40 itens. Com a feature `history-ring`, `FarmEngine` move esse conteúdo para uma `VecDeque` privada, remove a entrada antiga com `pop_front()` e acrescenta com `push_back()`. `snapshot()` recompõe a lista ordenada. Sem a feature, o caminho original continua ativo.

O motivo técnico é a rotina atual de controle: depois de cada mudança de atividade, ela faz `Vec::remove(0)` quando chega a 40 registros. Isso desloca os demais elementos do histórico. O anel evita esse deslocamento sem alterar cálculos, semente aleatória, ordem das atualizações, eventos, IDs ou serialização externa.

## Benchmark e paridade

Hardware e compilação: WSL2, Linux `6.6.87.2-microsoft-standard-WSL2`, AMD Ryzen 7 7700X, x86-64; Rust 1.95.0; perfil Cargo release do workspace (thin LTO, um codegen unit, panic abort). Carga: seed 2026, 10.000 animais, 30 dias, comparação de dois braços (pasto/confinamento). O benchmark interno inclui criação da condição inicial, comparação diária e serialização JSON; usa 3 aquecimentos e 21 amostras. O benchmark de processo usa a mesma requisição JSON, um aquecimento e cinco repetições alternadas de `riose-run`, incluindo inicialização, leitura, parse, simulação e stdout.

| Medição | Controle sequencial | `history-ring` | Variação |
| --- | ---: | ---: | ---: |
| Core, mediana (p95), ms; 21 amostras | 701,758 (926,840) | 337,498 (343,280) | -51,9% mediana |
| Processo `riose-run`, mediana (p95), ms; 5 amostras | 779,433 (789,300) | 483,643 (493,572) | -38,0% mediana |

A medição histórica fornecida pelo usuário é 666,240 ms. Ela consta em [`hybrid-local-30-day-v2.json`](../../../../1f44/riose-agro/docs/performance/hybrid-local-30-day-v2.json), com source revision `a6293fd`, cinco repetições e campo `rust.processEndToEnd`. O atual controle sequencial e o experimento foram medidos sob o mesmo runner, entrada, hardware e série alternada; por isso, a comparação experimental principal é 779,433 → 483,643 ms. O experimento também ficou 27,4% abaixo do número histórico, mas esse delta não é uma comparação controlada entre revisões/harnesses e não deve ser atribuído isoladamente à técnica. As amostras, hashes e limites estão em [`rea-execution-30-day-2026-10-13.json`](../performance/rea-execution-30-day-2026-10-13.json).

Paridade observada:

- SHA-256 da requisição compartilhada: `fe46a5af5895a37f5e84311df534f597f556980c5c1b45a55cbba9546ec6e51d`.
- A saída científica `nativeResult` e o envelope completo do runner foram iguais entre controle e candidato em todos os cinco pares de processos.
- JSON da comparação de 30 dias serializado pelo benchmark interno: mesmo SHA-256 nos dois builds, `1727a3d2383aec8f4f889bae4983426ce191aa8c261101847b5e96c555cbb862`.
- Snapshots finais completos dos braços pasto e confinamento: SHA-256 igual nos dois builds, `21d16df787976d2f199e238e880e138dfd93ea87b80c084fac1bc4d148cedba4`.

Para repetir no mesmo checkout:

```sh
cargo build --release -p riose-core --bin bench-execution-30d --bin riose-run
RIOSE_REQUEST_OUT=/tmp/riose-10k-30d-request.json target/release/bench-execution-30d
cp target/release/riose-run /tmp/riose-run-sequential
cargo build --release -p riose-core --bin bench-execution-30d --bin riose-run --features riose-core/history-ring
cp target/release/riose-run /tmp/riose-run-history-ring
python3 scripts/benchmark-rea-process.py --input /tmp/riose-10k-30d-request.json --baseline /tmp/riose-run-sequential --candidate /tmp/riose-run-history-ring
```

## Pendências e decisão de adoção

- **Decisão:** reter `history-ring` como opção experimental nesta branch; não ativá-la por padrão nem fazer merge automático. A diferença de desempenho e os hashes iguais justificam uma avaliação posterior com cobertura de regressão do histórico e benchmarks repetidos em máquina de destino.
- O benchmark mede tempo decorrido, não localiza hot spots. `perf` não está disponível, então não afirmo qual porcentagem do tempo pertence a `remove(0)` nem que a análise estática identificou uma causa medida.
- O CLI 6.4.0 foi usado diretamente e gerou os registros REA. A sessão MCP Codex continua em 6.3.0 até uma atualização da inscrição global; o diagnóstico requer `rea setup` e reinício do Codex, ação que deixei para aprovação explícita.
- Não executei a suíte geral de testes. O pedido incluiu benchmarks reproduzíveis e paridade; os dois foram executados diretamente com snapshots e resultados de saída completos.
