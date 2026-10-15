# Riose — direção da engine de mundos isométricos

Esta direção usa as partes já integradas ao produto e separa capacidade existente de trabalho ainda pendente. PixiJS 8 continua sendo o renderer principal; a cena V8 atual é uma prova integrada, não uma engine de produção concluída.

## Parte 1 — Diagnóstico técnico

O desafio é manter quatro fontes coerentes ao mesmo tempo: um mundo lógico com altitude e conectividade; módulos com footprints e encaixes; assets com escala, âncoras e proveniência; e uma composição renderizada que permaneça legível conforme o cenário cresce. Um renderizador sozinho não resolve caminhos sobre relevo, colisão com cercas nem consistência de escala. Uma biblioteca de sprites sozinha também não gera cenas rurais funcionais.

O contrato crítico é que simulação e desenho não compartilhem estado mutável: a simulação publica um snapshot tipado com identidades, posições, ações e métricas; o cliente converte apenas esse snapshot em poses e efeitos visuais. A cena `visual-only` atual permanece demonstrativa e não deve ser interpretada como resultado científico.

## Parte 2 — Stack escolhida

**Stack principal: JavaScript ES Modules no navegador + PixiJS 8 + JSON Schema/Ajv para contratos.** É a menor migração possível neste repositório: PixiJS 8 já está integrado, assets e cenas já são compilados por scripts, e JavaScript mantém a pipeline e o runtime com um único formato de módulo. A escolha privilegia ciclos curtos de implementação e depuração por código.

PixiJS oferece sprites, atlas, containers, filtros e rendering WebGL/WebGPU para a apresentação 2.5D. A profundidade e a topologia são responsabilidade do modelo da Riose, não de uma cena 3D improvisada. Three.js acrescentaria câmera e geometria 3D quando a direção atual depende de sprites e projeção ortográfica; Phaser duplicaria parte das capacidades de engine sem substituir o modelo de terreno. Nenhuma dessas alternativas resolve assembly e proveniência de assets por si só.

Complementos: AJV (já instalado) para validar o schema; Pillow para pipeline raster; Playwright/Chromium já usado para capturas locais; busca em grade/A* determinística para rotas; e estruturas simples próprias para footprint, sockets e culling. Blender fica opcional para produzir fontes volumétricas, sempre com saída estilizada e revisada antes da entrada no atlas.

## Parte 3 — Arquitetura

O pipeline proposto é:

```text
World JSON → validação de schema → scene compiler → world model x/y/z
           → assembly constraints → render graph PixiJS → interação/câmera
Snapshot científico ───────────────────────────────→ visual bindings
Assets de origem → preparação → atlas + manifesto → asset registry ─┘
```

- **World schema canônico:** versão, dimensões, projeção, células/regiões, camadas de terreno, módulos, entidades, rotas, bindings científicos e `visualState`. IDs estáveis referenciam assets e entidades; posições científicas não são inferidas de pixels.
- **Terreno:** células ou regiões armazenam material, elevação, inclinação, navegabilidade, ocupação, conectividade e transições. Projeção 2:1 transforma `x/y`; `z` altera a superfície lógica e a renderização. Rampas e pontes são arestas navegáveis explícitas; barrancos são faces geradas pela diferença de cota.
- **Assembly:** prefabs descrevem footprint, pivot de contato, bounds, colisão, clearance, orientação e sockets tipados. O compilador valida encaixes de estrada, portão, cerca e entrada, depois reserva áreas e calcula rotas. Distribuição aleatória não posiciona estruturas principais.
- **Asset pipeline:** originais imutáveis; scripts de preparação; PNGs isolados; atlas; contact sheet; manifesto versionado com origem, revisão, dimensões, footprint, anchor, sockets e estado de revisão visual. `REVIEW` não equivale a aprovado. IA pode gerar fontes de arte, mas não substitui o gate de projeção, escala, transparência e leitura de cena.
- **Scene compiler:** transforma intenção declarativa em regiões semânticas, elevações, caminhos, prefabs, vegetação e entidades. As primeiras cenas são artesanais e determinísticas; regras de geração são extraídas só depois de validação visual.
- **Renderer PixiJS:** converte coordenadas do mundo em posições de tela, ordena por footprint e ponto de contato, agrupa estáticos, anima entidades, recorta fora da câmera e oferece pan/zoom/seleção. A scene JSON não controla ordem de desenho.
- **Bridge científica:** recebe snapshots versionados, aplica bindings declarativos (por exemplo, condição → clip/ícone/cor) e descarta atualizações antigas. A camada visual não calcula ingestão, crescimento ou produção.

## Parte 4 — Plano incremental

1. **Cenário mínimo:** validar schema, projeção, atlas real, câmera e captura de uma área pequena. O editor Pixi e a captura de 1536×960 existem; falta estabilizar qualidade artística e contrato canônico.
2. **Terreno elevado:** testar platô, nível baixo, barranco, rampa, água e ponte navegável. A prova V8 já contém esses elementos e testes de conectividade; falta melhorar continuidade visual das margens e das estradas.
3. **Módulo rural:** sede, galpão, piquete fechado, entrada conectada, porteira, bebedouro e cinco bovinos. A cena isolada e prefabs existem; validação de colisão raster e grounding continua pendente.
4. **Reuso entre cenários:** separar prefabs e regras de cenas pequenas, corte e leite. Só variar seeds quando as restrições e o estilo da cena-base passarem revisão; hoje a cena final é artesanal, não um gerador geral.
5. **Integração científica:** conectar snapshot real a bindings visuais e validar que o renderer não altera dados do simulador. A cena `visual-only` atual não é essa integração.

## Parte 5 — Prova de viabilidade

O experimento mínimo é uma única área compilada pelo mesmo schema e renderer que o produto usa: um platô gramado ligado por rampa a uma várzea, estrada cruzando uma ponte sobre um córrego, um piquete modular com portão e bebedouro, sede e galpão conectados por sockets, cinco bovinos em estados distintos e um grupo de árvores. Dois JSONs devem reutilizar o mesmo catálogo e prefabs, mudando tamanho e layout; ambos precisam renderizar no navegador.

Critérios mensuráveis: caminho contínuo entre entradas; elevação só muda por ligação permitida; anel de cerca fechado com acesso pelo portão; animais confinados ao piquete; ausência de interseções entre footprints reservados; assets com proveniência e estado explícitos; screenshot limpa e de debug em 1536×960; captura sem erro de runtime. O protótipo atual já cobre parte do terreno e da montagem, mas não prova movimento de animais com colisão nem equivalência artística com as referências.

## Estado atual e limites

O estado por marco e as capturas ficam em [`riose-v8-continuation-plan.md`](riose-v8-continuation-plan.md). A revisão visual da fazenda continua aberta: a imagem atual ainda tem gramado e rio regulares e consistência de escala inferior às referências. A engine não será declarada aprovada por esta proposta arquitetural.
