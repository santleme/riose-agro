# Auditoria de organização e arquitetura do repositório

**Data:** 2026-10-14 (America/Sao_Paulo)
**Revisão observada:** `main` em `27c5d29`, merge do PR #135
**Escopo:** estrutura rastreada, manifests, caminhos de execução, imports locais, contratos, documentação arquitetural e duplicação exata de imagens. Auditoria estática; nenhum teste ou benchmark foi executado.

## Resumo

O repositório já possui divisões úteis por intenção — runtime, dados, pesquisa, ativos visuais e contratos —, mas cresceu como um monorepositório de várias frentes. A sensação de “coisas espalhadas” vem principalmente de quatro causas:

1. **A arquitetura descrita não acompanha mais o código.** Alguns documentos ainda descrevem uma revisão anterior, antes de Rust/WASM, CI e do sistema visual atual.
2. **Há múltiplas implementações de composição e renderização visual.** O Product, o Graphics PoC, o editor em `public/assets/scenario-editor` e o editor de blockout em `tools/` têm propósitos relacionados, porém contratos e código separados.
3. **As pastas de ferramentas e testes cresceram horizontalmente.** `scripts/` tem 156 arquivos e `tests/` 157; os nomes ajudam a reconhecer o domínio, mas a localização deixa descoberta e propriedade pouco claras.
4. **As fronteiras de publicação mantêm caminhos antigos na raiz.** As páginas HTML ficam na raiz para preservar URLs estáticas, enquanto seus módulos estão em `src/client/`; o servidor também mantém uma lista de caminhos públicos/legados.

Isso não é apenas uma questão de mover diretórios. Vários caminhos são consumidos por páginas estáticas, manifests, scripts, testes, CI e ferramentas de pesquisa. Uma reorganização precisa começar por propriedade e contratos e preservar essas interfaces.

## Progresso desde a auditoria

O retrato e as contagens abaixo continuam descrevendo `main@27c5d29`. As etapas seguintes foram incorporadas depois desse snapshot:

- PR #157 agrupou os módulos de runtime do Product em `src/client/product/` e registrou o mapa de propriedade.
- PR #158 compartilhou a projeção isométrica entre Product, Graphics PoC e Scenario Editor.
- PR #159 tornou `src/client/product/scene.json` a fonte versionada do mundo Product, definiu seu schema e ligou o validador a spatial e asset checks.
- PR #160 compartilhou os pontos projetados de terreno, caminhos, cercas e portões entre Canvas e Pixi.
- PR #161 isolou o desenho estático Pixi em `static-world-renderer.js`.
- PR #162 adicionou a validação do contrato Product ao job JavaScript/WASM da CI.
- PR #163 inventariou os formatos e caminhos de authoring de Product, Graphics PoC e Scenario Editor.
- PR #164 conectou o Product Composer à cena Product versionada, com validação antes da abertura e exportação.
- PRs #165 e #166 moveram o código-fonte do Scenario Editor para `src/client/scenario-editor/`, preservando as URLs públicas como fachadas compatíveis.
- PR #167 extraiu o renderer Canvas do Scenario Editor para uma interface explícita de cena.
- PR #168 isolou a pilha de undo do Composer em `scene-history.js`.
- PR #169 separou a validação do contrato grid em `scene-validation.js`.
- PR #170 centralizou leitura e escrita de cenas locais em `scene-storage.js`.
- PR #171 agrupou builds, screenshots e benchmarks do Graphics PoC em `scripts/graphics/`.
- PR #172 reuniu o runner de cenários e as bibliotecas reutilizáveis de lotes experimentais em `scripts/experiments/`.
- PR #173 agrupou benchmarks de simulação/sistema e validação de relatórios em `scripts/benchmarks/`.
- PR #174 agrupou as comparações fixas do motor por coorte em `scripts/science/engine-audits/`, mantendo o comparador CGREC no caminho original porque o baseline científico versionado fixa seus bytes.
- PR #175 agrupou auditorias de fontes e análises de associação das coortes USDA em `scripts/science/source-audits/usda/`, com comandos, testes e raízes de dados atualizados.
- PR #176 reuniu auditorias e análises de fontes públicas não USDA em `scripts/science/source-audits/`; os scripts Mendeley biomass readiness e CGREC permanecem em caminhos congelados pelo baseline científico.
- PR em andamento organiza avaliações de biomassa e ADG em `scripts/science/evaluations/`; o avaliador Perea também permanece no caminho fixado pelo baseline científico.

Essas mudanças conectam e documentam o fluxo interno do Product e reduzem o acoplamento do Scenario Editor; não tornam o formato de cena do Graphics PoC intercambiável com o mundo irregular do Product. A decisão sobre um adaptador entre authoring continua aberta. `scene-layout.js` permanece dono da geração de layouts do Composer, enquanto `scene.json` é fonte do mundo fixo do Product.

O inventário de authoring já está registrado em `scene-authoring-inventory.md`, e os fluxos de edição do Scenario Editor agora têm fronteiras explícitas para layout, validação, renderização, histórico e armazenamento. O próximo bloco é organizar tooling por responsabilidade, corrigindo junto os caminhos consumidos por `package.json`, testes, documentação e CI. As cenas do Product, Scenario Editor e Graphics Lab continuam contratos distintos até um consumidor exigir e especificar uma conversão.

## Retrato do repositório

| Área | Inventário observado | Leitura |
| --- | ---: | --- |
| Páginas HTML na raiz | 17 | Entradas públicas e páginas de dados; preservam URLs estáticas. |
| `src/client/` e `src/server/` | 62 + 4 arquivos | Aplicação, engine, Worker, páginas de dados, renderer, API local e integração nativa. |
| `crates/riose-core/` | 15 arquivos Rust | Core usado em builds nativos/WASM e paridade com a engine JS. |
| `scripts/` | 156 arquivos, incluindo 24 em `scripts/assets/` | Auditorias de dados, processamentos, benchmarks, builds e validações. Muitos scripts continuam no nível raiz. |
| `tests/` | 157 arquivos | Testes JS/Python, fixtures e contratos no mesmo nível. |
| `experiments/` | 87 arquivos | Relatórios e experimentos organizados por domínio; contém também utilitários importados por scripts e testes. |
| `assets/` | 342 arquivos; cerca de 280 MB | Fontes, candidatos, aprovados, previews, manifests e materiais de módulos. |
| `public/` | cerca de 31 MB | Arquivos servidos como ativos/runtime, incluindo um editor independente. |
| `graphics-poc/` | 38 arquivos; cerca de 27 MB | Renderer e cenas de pesquisa, com bundles/atlas próprios. |
| `data/` | 149 arquivos; cerca de 36 MB | Dados externos, brutos e processados, em diretórios por fonte. |
| `docs/` | 465 arquivos; cerca de 164 MB | Arquitetura, evidências, relatórios, screenshots e kits visuais. |

O projeto também combina JavaScript/HTML/CSS, Python, Rust, JSON Schemas e dados científicos. Essa mistura é coerente com o escopo; o problema é não haver um mapa único e atualizado que diferencie código de produto, ferramentas de pesquisa, protótipos e artefatos de evidência.

## Caminhos e módulos atuais

### Aplicação e simulação

`home.html`, `product.html`, `lab.html` e páginas especializadas seguem URLs de raiz. O fluxo do Product usa módulos em `src/client/`, um Worker e o estado da engine; o renderer traduz esse estado para apresentação. O servidor local está em `src/server/`. O core Rust é uma implementação paralela intencional: CI compara trajetórias JS/Rust e mantém a opção WASM/nativa. Não é uma duplicação que deva ser removida sem uma decisão de produto.

### Pesquisa científica e dados

`data/` guarda fontes e resultados processados; `scientific/` concentra contratos/adaptadores científicos; `schemas/` guarda contratos usados em mais de uma linguagem; `scripts/` implementa auditoria, processamento e avaliação; `experiments/` guarda protocolos, execuções e relatórios; `docs/evidence/` guarda evidências publicáveis. Esse fluxo existe, mas a divisão entre “código reutilizável” e “execução/resultado de pesquisa” não está sempre clara: há imports de `scripts/` e `tests/` para utilitários em `experiments/`.

### Ativos visuais

Há um pipeline de fonte/candidato/aprovado em `assets/`, ativos servidos em `public/assets/`, cópias de trabalho/manifestos em `graphics-poc/`, cenas do Product em `src/client/product-spatial.js` e o renderer em `src/client/product-world-renderer.js`. Além disso, o editor standalone vive sob `public/assets/scenario-editor/` e há um blockout separado em `tools/product-composer.*`.

As responsabilidades de authoring, esquema de cena, adaptação de cenas e renderização estão sobrepostas. O documento existente [avaliação do renderer do Product](../product-world-renderer-assessment.md) já identifica essa duplicação e recomenda escolher um contrato de cena comum e adaptar o renderer existente. Essa conclusão continua sendo a prioridade arquitetural mais concreta.

## Evidências de acoplamento e dispersão

- Uma varredura estática encontrou imports locais entre áreas: `tests → src` (120), `scripts → src` (50), `tests → scripts` (31), `scripts → experiments` (10), e `src → scientific` (2), além de imports de PoC e exemplos. São contagens de referências, não de módulos únicos.
- Não apareceram ciclos no grafo de imports JS relativos analisado. Dois imports para `product-world-renderer.bundle.js` apontam para artefato gerado pelo build e ignorado pelo Git; devem continuar explicitamente tratados como saída de build.
- Os maiores módulos incluem `public/assets/scenario-editor/composer.js` (1.499 linhas), `graphics-poc/app.js` (903), `graphics-poc/scene-adapter-v1.js` (530), `src/client/app.js` (510), `src/client/product-world-renderer.js` (415) e `src/server/server.js` (398). Tamanho sozinho não determina problema, mas os três primeiros reforçam que há sistemas visuais com comportamento próprio, e não apenas arquivos de configuração duplicados.
- A comparação SHA-256 das imagens em `assets/`, `public/`, `graphics-poc/` e `docs/` encontrou **31 grupos de cópias exatas** (31 arquivos extras). Exemplos incluem o Nelore aprovado espelhado em `graphics-poc/`, ativos dairy copiados para a PoC e imagens-fonte repetidas em kits documentais. Algumas cópias são justificadas por build/benchmark ou preservação de evidência; qualquer deduplicação deve conferir manifests e caminhos de execução.
- O servidor mantém uma allowlist extensa de arquivos públicos e uma regra de compatibilidade para servir arquivos de `src/client/` por nomes antigos. Essa lógica protege páginas e deploys, mas torna mudanças de caminho arriscadas e pouco óbvias. Ver `PUBLIC_FILES`, `CLIENT_FILES` e `serveStatic()` em `src/server/server.js`.
- O mapa de módulos em `docs/architecture/module-boundaries.md` ajuda a entender a intenção, mas não reflete todos os elementos atuais do Product/Research/Graphics. O documento `docs/architecture/current-system-audit.md` é explicitamente baseado no commit antigo `913b36b` e ainda afirma que não havia Rust, WASM, CI ou pipeline de build, apesar de esses elementos existirem no HEAD auditado.
- `docs/architecture/repository-layout.md` explica por que as páginas HTML estão na raiz, mas agrupa `scripts/`, `tests/`, `examples/` e `docs/` como materiais de desenvolvimento e não mapeia `crates/`, `experiments/`, `tools/` ou os três caminhos visuais.

## O que deve permanecer separado por enquanto

- **JS e Rust:** manter as implementações paralelas até haver uma decisão de adoção. A paridade é um requisito verificável, não um acidente de pastas.
- **Dados de origem e evidência:** não misturar esses arquivos com código de runtime. Proveniência, licença, checksums e resultados fazem parte do conteúdo científico.
- **Schemas compartilhados:** manter uma localização estável e independente da linguagem até decidir uma política única de contratos; vários módulos e ferramentas os consomem.
- **URLs das páginas:** não mover páginas da raiz sem preservar seus caminhos publicados e seus links relativos.
- **Candidatos, rejeitados e aprovados:** estados de revisão visual têm significado; não consolidar pastas eliminando essa distinção.

## Direção recomendada

Primeiro consolidar o mapa de propriedade e os contratos. Depois organizar arquivos físicos por essas responsabilidades:

```text
pages/                 (opcional; apenas se houver wrappers mantendo URLs atuais)
src/
  application/         composição de páginas e orquestração
  simulation-js/       engine JS, Worker e protocolo
  visualization/       contratos, adapters e renderização reutilizados pelo Product
  scientific/          lógica científica de runtime e proveniência
  server/              API local e adaptadores de execução
crates/riose-core/     core Rust, com paridade explícita ao JS
tools/
  data/{audit,process,evaluate}/
  benchmarks/
  graphics/
  lib/                 utilitários realmente compartilhados
research/
  experiments/
data/                  fontes e derivados com manifests
assets/                source, candidates, approved, manifests e documentação visual
schemas/               contratos compartilhados
docs/{architecture,evidence,decisions}/
tests/{application,simulation,scientific,visualization,server}/
```

Esse desenho é uma hipótese de destino, não uma ordem para mover diretórios. `pages/` só vale se os HTMLs de raiz forem wrappers estáveis; caso contrário, as entradas podem ficar onde estão e o mapa deve documentar a exceção. O Product já tem uma fonte de cena versionada própria. A decisão pendente é mapear os fluxos de authoring do Scenario Editor, `tools/product-composer` e Graphics PoC e descobrir se algum deles realmente precisa trocar dados com o Product. Não se deve impor um formato compartilhado até os campos e as regras de preservação estarem definidos.

## Sequência de reorganização com menor risco

1. **Inventariar propriedade e entradas:** documentar cada página/CLI, módulos importados, contrato, saída de build e testes associados. Marcar cada área como produto, ferramenta, pesquisa, protótipo, dado-fonte, artefato ou histórico.
2. **Atualizar documentação de arquitetura:** substituir o mapa desatualizado por um mapa atual e manter auditorias históricas com seus commits claramente identificados.
3. **Definir propriedade de cenas e renderers:** o Product já possui cena versionada, geometria compartilhada entre Canvas/Pixi e validação em CI. Mapear os formatos e fluxos de authoring restantes antes de propor adapters; manter PoCs e históricos separados até a integração ficar comprovada.
4. **Reorganizar tooling em grupos:** separar auditoria/processamento/avaliação de dados, benchmarks, build/visual e utilitários compartilhados. Atualizar comandos de `package.json`, imports, CI e descoberta Python no mesmo passo.
5. **Agrupar testes por módulo/contrato:** fazer somente depois de definir discovery Node/Python e atualizar caminhos. Preservar fixtures e dados de referência.
6. **Reduzir cópias visuais com manifesto de origem:** eliminar apenas cópias deriváveis; manter snapshots usados para evidência e assets de saída que tenham uma finalidade de runtime mensurada.
7. **Mover páginas e arquivos de servidor por último:** adicionar compatibilidade de URL e cobertura de rota antes de alterar locais físicos. A allowlist do servidor e os deploys estáticos são interfaces observáveis.

## Próxima tarefa sugerida

Criar um inventário rastreável de **editor/CLI → formato de cena → módulo de entrada → módulos chamados → artefatos → validação/CI** para Scenario Editor, Graphics PoC e `tools/product-composer`. Em seguida, decidir com evidência se um adapter é necessário e modularizar o `composer.js` nas responsabilidades que o inventário confirmar. Essa ordem transforma a sensação de dispersão em decisões verificáveis e evita uma movimentação que quebre caminhos sem reduzir acoplamento.

## Limites desta auditoria

Esta revisão cobre a árvore limpa de `main@27c5d29`, leitura de documentação/manifests/código e análise estática de imports e hashes visuais. Não executou testes, benchmarks, app/browser, workflows de CI ou todas as ferramentas de pesquisa. O clone original disponível na máquina estava três commits atrasado e tinha alterações locais; foi deixado intacto. O checkout desta auditoria foi criado limpo a partir do `main` remoto.

## Progresso da reorganização — 15/10/2026

Após essa fotografia inicial, os PRs #157–179 foram integrados para separar cenas e renderização do Product, fronteiras do Scenario Editor, tooling de Graphics/experimentos/benchmarks e auditorias/avaliações científicas, pipelines de dados públicos e análises de coorte. A documentação corrente está em [`repository-layout.md`](repository-layout.md) e [`tooling-layout.md`](tooling-layout.md); este relatório preserva a auditoria inicial como registro histórico.

O PR #177 agrupou avaliadores em `scripts/science/evaluations/`; #178 organizou aquisição e processamento em `scripts/science/data_pipelines/`; e #179 moveu análises de coorte para `scripts/science/source-audits/`. O grupo atual, ainda sem PR, reúne geração de readiness DMI/ADG e seus gates de evidência em `scripts/science/readiness/`. As alterações atualizam comandos, imports, manifestos e documentação; scripts com caminhos congelados por baselines continuam nas localizações documentadas.
