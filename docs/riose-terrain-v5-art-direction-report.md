# Riose Agro · terreno e direção visual V5

Data: 2026-10-14. Esta entrega conecta três propostas de relevo geradas por seed ao mapa Tiled e ao renderer Pixi. É uma etapa de implementação, não uma aprovação artística: os paredões internos ainda parecem estreitos em alguns pontos e a transição da placa para o relevo merece outra iteração após avaliação humana.

## Direção de arte do terreno

- Projeção ortográfica isométrica 2:1; câmera de renderização a 30° de elevação.
- Placa de 14 × 14 unidades isométricas. A convenção atual estima 5 m por unidade no plano; os objetos recebem elevação do mesmo heightfield e a projeção vertical estilizada é de 74,7 px por unidade. Essa razão vertical é deliberadamente parte da leitura diorama e não altera os dados científicos.
- Luz quente superior esquerda e preenchimento frio; topo usa amostragem `Closest`, faces do terreno usam argila em estratos. PNG final preserva canal alpha e limita a paleta a 192 cores.
- O material de pastagem imagegen é uma camada de microtextura a 12% aplicada apenas aos pixels verdes da placa existente. Estradas, talhão e posição das estruturas continuam ancorados à composição V4; por isso o material não substitui o trabalho de composição que ainda falta.
- Paleta observada: verdes oliva e capim, terra ocre/avermelhada, madeira escura e iluminação creme. A compatibilidade de sprites e de terreno continua `pending-human-review`.

## Propostas e decisão provisória

`graphics-poc/generated/terrain-v5/terrain-proposal-board-seed-84018.png` compara os renders CPU da mesma placa de origem:

1. **Homestead High Ground** — patamar da sede, ombro posterior baixo e bacia frontal. Selecionado para revisão de runtime por conservar melhor a leitura do acesso existente; a estrada passa junto ao ponto de apoio da sede, então a sede permanece praticamente à cota zero.
2. **Cross Ridge Saddle** — crista diagonal com sela. Não selecionado porque a crista compete com a sede e produz mais cruzamentos de escarpa junto ao acesso.
3. **Pasture Terraces** — dois terraços de pastagem e baixada. Alternativa para uma futura cena de piquetes; as bordas encontram o talhão e o caminho em mais pontos.

A saída selecionada está em `graphics-poc/generated/terrain-v5/homestead-high-ground.png`; o TMJ Tiled usa esse arquivo como `ImageLayer`. Os apoios dos objetos são amostrados bilinearmente do heightmap e registrados em metros e em unidades isométricas. O heightfield e a seleção guardam a seed, para que outra seed passe pelo mesmo gerador.

## Catálogo visual

`npm run build:asset-art-direction` percorreu 512 imagens em `assets/`, `public/assets/`, `docs/assets/` e `graphics-poc/`, mediu dimensões, alpha e uma aproximação de até 256 cores dominantes, associou os metadados disponíveis e gerou 25 folhas de contato por categoria. O resultado tem 28 arquivos selecionados para a composição piloto, 34 no diretório rejeitado de laboratório e 450 aguardando revisão. “Selecionado” descreve uso na cena piloto, não licença de distribuição nem aprovação de estilo. Itens sem licença, perspectiva ou footprint resolvidos continuam sem aprovação.

Abrir [catálogo de assets](../assets/previews/asset-art-direction-v1/index.html) ou os dados completos em [inventory.json](../assets/previews/asset-art-direction-v1/inventory.json). A inspeção é agrupada em pastagem/solo (124), bovinos (123), outros (117), manejo/cercas (38), construções (30), caminhos (29), vegetação (19), tecnologia (17), máquinas (9) e água (6).

`npm run score:asset-art-compatibility` também foi executado. Ele deriva oito cores dos pixels visíveis nos assets do piloto e produz sinais de proximidade de paleta, perspectiva declarada, disponibilidade de escala recomendada, densidade de bordas, alpha e contexto. Sinais registrados: 98 arquivos dentro, 323 próximos e 91 fora da paleta de triagem; perspectiva desconhecida em 439/512; escala recomendada disponível em 15/512; direção de luz explicitamente cadastrada em 0/512. “Fora da paleta” e densidade de bordas são pedidos de revisão, não rejeições automáticas. Os oito valores estão em [art-direction-report.json](../assets/previews/asset-art-direction-v1/art-direction-report.json), com a [Art Direction Bible](riose-art-direction-bible.md) e tamanhos medianos de uso real por categoria.

A etapa seguinte gerou três macrocomposições por transformações de blocos semânticos: sede central, corredor de serviço e pátio norte. Cada cena foi compilada por Tiled e capturada no renderer Pixi. A seleção por inspeção visual escolheu `proposal-homestead-hub`; as outras duas foram rejeitadas por sobreposição entre curral, galpão, cochos e rotas. O `npm run build:graphics-poc` usa essa escolha como entrada padrão. Evidência: [quadro das propostas](../artifacts/graphics/terrain-v5-composition-proposals.png) e [selection.json](../graphics-poc/generated/terrain-v5/composition-proposals/selection.json).

### Materiais de superfície — geração v2

`scripts/terrain/generate_heightmaps.py` compõe uma superfície por seed a partir da placa base e das texturas recortadas dos assets de pasto seco, solo compactado e lama. A regra coloca zonas em coordenadas de mundo semeadas; campos de ruído em duas escalas distorcem as bordas e limitam a transição. Estrada e cultivo ficam fora da máscara. Também extrai uma tira opaca de solo da borda frontal da placa para materializar faces de perímetro e escarpas internas com UVs em escala de mundo no Blender, eliminando a troca de cor a cada face. A textura superior e a malha renderizada seguem para a ImageLayer Tiled carregada pelo Pixi. A primeira aplicação como decals foi rejeitada porque repetia a silhueta inteira dos tiles. Agora os recortes de textura são reamostrados na escala da zona e misturados com a microarte original. Tiled também leva a gramática e os sete registros de zona em propriedades semânticas; o renderer verifica esses registros no carregamento. O manifesto lista seed, posição, tipo de material e arquivo-fonte.

A borda da função `terrace` deixou de ser binária e virou um talude suave. A rampa do corredor de acesso passou de 36 px para 78 px. Um projetor de restrições de inclinação propaga a mesma condição aos três heightfields. O gradiente máximo entre células ficou em 0,04 unidade de mundo em todas as propostas; a cena selecionada conserva 10 níveis e 0,36 unidade entre baixada e cota máxima. O teste automatizado aplica esse limite aos três mapas.

Evidência de comparação da superfície: [base e zonas por seed](../artifacts/graphics/terrain-v5-surface-materials-before-after.png). Captura de navegador após a geração: [canvas Pixi](../artifacts/graphics/ranch-v5-surface-materials-browser.png). Esta etapa ainda não implementa Wang tiles nem um atlas de bordas; as zonas são texturas compostas na placa, não materiais independentes do renderer. O talude suaviza o platô central; faltam transições com material e vegetação específicas para escarpas. A inspeção é evidência de integração, não aprovação artística.

## Execução verificada nesta etapa

| Ferramenta | Versão e comando executado | Arquivos e uso | Resultado / limite |
|---|---|---|---|
| Tiled | 1.12.2; `npm run build:graphics-poc` executa `tiled --evaluate` | `.tmj`, `.tmx` e `.tsx` em `graphics-poc/generated/`; o Pixi carrega o TMJ | Compilação real por API JS; 82 objetos e camadas separados. Sem edição manual no Tiled. |
| Blender | 4.0.2; `npm run build:terrain-proposals -- --seed 84018` | Três `.blend`, renders transparentes e heightmaps versionados em `assets/candidates/terrain-family-v7/` e `graphics-poc/generated/terrain-v5/` | Cycles em CPU; três propostas concluídas com a textura de superfície composta por zonas de material. |
| Pillow | 10.2.0; executado pelo wrapper Blender após os renders | PNGs finais com alpha, paleta limitada e prancha comparativa | Alternativa operacional de processamento; Aseprite não encontrado na instalação local inspecionada. |
| Chromium / Playwright | Chromium 1248, Playwright 1.57.0, ANGLE SwiftShader; `npm run capture:graphics-ranch-v4` | Capturas de navegador em [ranch-v5-surface-materials-browser.png](../artifacts/graphics/ranch-v5-surface-materials-browser.png) | 1600×1000, canvas 1532×869, 91% de ocupação horizontal, 82 posições, 28 IDs, 3 animais com 4 frames, sete zonas de material importadas pelo TMJ, zero erros. A configuração Pixi usa antialias desligado e arredondamento de pixels, apropriados à pixel art; mediana de 120 frames foi 16,7 ms (59,9 FPS), p95 33,4 ms, transferência de 16,51 MB. Controle Chromium sem cena ficou em 60 FPS. Medição indicativa de SwiftShader, não benchmark de hardware do usuário. |

As execuções Tiled, Blender e browser são reais. Os `.blend` e sprites de laboratório mantêm estado de revisão; não inferimos direitos ou aprovação pela existência do arquivo.

`node --test tests/graphics-scene.test.js` passou 26/26; inclui validação do gradiente máximo do heightfield selecionado, sete zonas semeadas, três fontes artísticas, três mapas Tiled com 82 placements cada e da composição escolhida no mapa principal. A inspeção da captura continua necessária e os testes não aprovam a qualidade artística.

`npm run test:graphics-screenshots` passou os quatro fixtures existentes (beef, dairy, cenário seco e beef-zone). O diff foi 0% nas três primeiras imagens; a tolerância de Canvas 2D aceitou max channel delta 6 no beef e 4 no beef-zone. Essas imagens são do outro preview Canvas 2D e não substituem a captura Pixi que foi inspecionada separadamente.

Comparação visual do relevo: [terrain-v5-before-after.png](../artifacts/graphics/terrain-v5-before-after.png). Comparação das zonas de material: [terrain-v5-surface-materials-before-after.png](../artifacts/graphics/terrain-v5-surface-materials-before-after.png). Captura Pixi: [ranch-v5-surface-materials-browser.png](../artifacts/graphics/ranch-v5-surface-materials-browser.png). A prancha das três propostas aparece em `graphics-poc/generated/terrain-v5/terrain-proposal-board-seed-84018.png`.

## Reproduzir

```sh
npm run build:terrain-proposals -- --seed 84018
npm run build:graphics-poc
npm run capture:graphics-ranch-v4
npm run compare:terrain-v5
npm run build:asset-art-direction
```

O gerador aceita outra seed inteira após `--seed`; a seleção registrada segue a mesma proposta e a seed informada.

## Limitações abertas

- As três opções são relevo aplicado à mesma composição base, não três layouts completos de fazenda. A variação é de topografia e continua sutil no primeiro plano em partes do quadro.
- A placa herdada ainda define a geometria pintada das estradas e da lavoura. As zonas novas variam o tratamento de cor e preservam o detalhe existente, mas ainda não formam um sistema completo de materiais/autotiling por terreno.
- Paredes internas do mesh ficam visíveis como faixas estreitas em alguns locais. A seleção é provisória, não um selo de qualidade visual.
- Os assets de cena existentes continuam misturando estilos e níveis de acabamento. O inventário expõe a proveniência e facilita a revisão, mas não corrige incompatibilidades automaticamente.
- Esta iteração não altera a simulação Rust/WASM nem usa elevação para modificar qualquer estado científico.
