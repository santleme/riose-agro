# Ríose Isometric Cattle Style v1

**Status:** amostra rural de seis elementos aprovada como base estética, com ajuste de contorno/densidade pendente; foco atual pecuária bovina. A prova de cena mista v7 é histórica e não aprova a cena bovina, cujas iterações v3–v6 falharam no gate. Para escopo, famílias, kit-base, prompts e governança, consulte a [direção visual de pecuária bovina brasileira](pecuaria-bovina-brasileira.md). Os exemplos de fazenda mista e agricultura abaixo são históricos/de suporte; novos assets seguem o documento pecuário.

## 1. Definição do estilo

Pixel art isométrica refinada para um simulador brasileiro de pecuária bovina: diorama jogável, câmera fixa, silhuetas nítidas, clusters de pixels deliberados, contorno escuro fino, poucos planos de sombra e alta densidade organizada. A referência urbana define acabamento, perspectiva, paleta, escala e riqueza de composição. O conteúdo visual deve representar rebanho, manejo, pastagem e infraestrutura pecuária brasileira.

**Referências:** [referência urbana limpa](assets/pixel-art-urban-reference-clean.png) (recorte da quinta imagem enviada, usado para comparativos) é o guia dominante de estilo; [original](assets/pixel-art-urban-reference.png), [amostra rural de seis elementos](assets/farm-pixel-art-sample-v3.png) e cenas completas orientam acabamento, conteúdo e composição. A [fazenda completa v5](assets/fazenda-brasileira-completa-pixel-v5-reprovada.png) foi reprovada por contornos grossos, copas arredondadas e render suavizado. A [v6](assets/review-farm-pixel/fazenda-brasileira-completa-v6-candidata.png) ainda tinha contornos pesados. A [v7](assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png) e seu [comparativo](assets/review-farm-pixel/comparativo-referencia-urbana-fazenda-v7.png) passaram como prova de direção para avançar a curadoria do kit; renders de cena não aprovam sprites individualmente. [v1](assets/fazenda-brasileira-completa-pixel-v1.png), [v2](assets/fazenda-brasileira-completa-pixel-v2.png), [v3](assets/fazenda-brasileira-completa-pixel-v3.png) e [v4](assets/fazenda-brasileira-completa-pixel-v4.png) permanecem para histórico. Cenas completas orientam layout/densidade; não são fonte para recortar sprites nem liberam produção em lote.

## 2. Princípios e regras visuais

| Eixo | Regra de produção v1 |
| --- | --- |
| Perspectiva | Isométrica fixa, vista de cima em 3/4. Projeção de chão 2:1: eixos projetados a aproximadamente ±26,6° da horizontal (inclinação ±0,5 px/px, tolerância ±0,05). Topo de tile-base em losango 128×64 px no tamanho nativo de referência. Não misturar orientações de câmera. |
| Escala | Definir cada objeto em módulos de chão de 64×32 px lógicos. O módulo expressa footprint; arte pode ocupar mais pixels para altura, mantendo o pé no ponto de ancoragem. Casa pequena 3×3, árvore 2×2, trator 2×1, boi 1×1, galpão 5×3, curral modular 6×5 como valores iniciais, ajustáveis após a composição de teste. |
| Contorno | Cor escura colorida (carvão esverdeado/marrom, não preto puro). 1 px lógico contínuo só onde separa silhuetas; até 2 px em trechos de silhueta grande. Linhas internas 1 px, mais leves e seletivas. Não desenhar halo externo. O contorno não deve fechar cada folha, telha ou peça mecânica. |
| Pixel clusters | Borda em degraus visíveis; agrupar pixels em massas de forma, evitando serrilhado aleatório, dithering e ruído isolado. Em um tile 128×64, usar cerca de 4–8 clusters deliberados para variação do chão, com 1–3 marcas pequenas de apoio. A distribuição deve parecer irregular, não um padrão repetido uniforme. |
| Sombra | Luz padrão do alto à esquerda. 3–5 tons chapados por material, com limites nítidos; sombra de contato curta sob a base, projetada para baixo/direita. Sem gradiente atmosférico, bloom ou sombra fotográfica difusa. |
| Paleta | Saturação moderada e contraste controlado: verdes folha/sálvia, verde escuro de contorno, terra ocre/vermelha, madeira quente, telha terracota, creme, água azul-esverdeada e metal cinza azulado. Curar cores por família de material; evitar neon, highlights brancos extensos e verdes fluorescentes. Não quantizar pintura para tentar obter pixel art. |
| Detalhe | Densidade semelhante à referência sem micro-ruído: portas, janelas, telhas em faixas, estrutura de galpão, nervuras de silo, rodas, implementos, trilhos e equipamentos devem ser pequenos e intencionais. Cada detalhe precisa continuar legível em zoom médio e não competir com a silhueta. |
| Vegetação | Copas construídas com clusters de formatos e valores variados, não bolotas repetidas. Três níveis de massa (folhagem, sombra, luz), alguns recortes de céu e galhos/tronco legíveis quando a escala permitir. Repetir variantes com rotação/espelho só se a luz e a espécie continuarem plausíveis. |
| Coerência | Mesmo módulo, câmera, luz, espessura de linha, densidade e escala em todos os objetos. Sombra e vegetação não podem mudar de linguagem de um atlas para outro. Conteúdo e materiais devem comunicar o agro brasileiro sem estereótipos decorativos excessivos. |

### Paleta de partida (não é uma trava por pixel)

- contorno: `#343B32`; sombra profunda: `#46523C`;
- folhagem sombra/base/luz: `#426342`, `#66834B`, `#91A75C`;
- pasto base/luz: `#84945C`, `#A5AA6C`;
- terra base/sombra/luz: `#A85F3E`, `#794633`, `#C78451`;
- madeira: `#76513B`, `#A9774D`; telha: `#A9533F`, `#CC7650`;
- paredes: `#D9CFAC`; metal: `#687C80`, `#9AA6A0`; água: `#477E83`, `#76A6A0`.

Tratar esses valores como amostras de família para manter coerência. Ajustar pixels locais para contraste e leitura, sem introduzir uma segunda paleta independente.

## 3. Fora do estilo

Reprovar: pintura semirrealista/painterly; acabamento 3D renderizado ou jogo mobile; gradiente fotográfico; contorno preto grosso em volta de tudo; folhas como bolinhas uniformes; textura granulada aplicada por toda a superfície; anti-aliasing borrado; perspectiva ou direção da luz divergente; pixelização feita só por filtro; sprite recortado com fundo sólido/halo; itens colados uns aos outros; texto, labels ou molduras em sprite; escala sem âncora/footprint; tile com borda que deixa emenda.

## 4. Contrato técnico de asset

- Arquivo de produção: PNG RGBA com transparência real; RGB em pixels transparentes limpo para evitar franja em matte claro/escuro. Não aceitar as cenas de referência achatadas como sprites.
- Sprites isolados por objeto/variante; nada de cenário, solo ou sombra de outro asset embutido. Uma sombra de contato própria pode vir no recorte do objeto, desde que curta e coerente.
- Tiles de chão: módulo nativo 128×64, 2:1, com bordas/conectores declarados; tile aprovado só depois de repetir em grade 3×3 em todas as combinações permitidas. Variantes devem compartilhar os mesmos limites e altura de borda.
- Props: canvas recortado com margem transparente consistente; `anchor` normalizada aponta para o contato dos pés/base com o chão; para chão, origem no centro do losango. Guardar `sourceSize` e bounds de conteúdo depois do trim.
- Footprint em módulos lógicos, não inferido do alpha. Colisão separada do sprite. Vegetação e edifícios altos ordenados pelo ponto de contato dos pés/base.
- Definir pontos de conexão em cercas, porteiras, caminhos e bordas de tile; declarar `connectorType`, orientação e comprimento. Não esticar segmentos para encaixar.
- Gerar sprite nativo limpo e ampliar em escala inteira com nearest-neighbor quando a apresentação pedir pixels maiores. Não reduzir pintura grande para fabricar textura pixelada. Se uma imagem já for pixel art e o gerador deixar alfa fracionário/glow periférico, pode-se limpar **somente o matte alfa** (threshold binário e limpar RGB em alpha 0), sem redimensionar, quantizar cor ou redesenhar clusters; revisar antes/depois em fundo claro e escuro para garantir que a silhueta/art pixels não mudaram. Conferir em 100%, 50% e 25%.
- Revisar sobre fundo branco, carvão e quadriculado. Rejeitar qualquer halo visível, alfa semitransparente inesperado em bordas duras ou fundo preso ao recorte.

## 5. Template universal de prompt

Substituir os campos entre colchetes. Anexar sempre a referência urbana como guia de estilo e um exemplo rural aprovado como guia de conteúdo/escala. Uma chamada gera um asset/variante por vez.

```text
Create ONE isolated production sprite: [ASSET + VARIANT] for the Ríose Brazilian farm simulation.

STYLE REFERENCE: Match the attached isometric urban pixel-art image for pixel density, finish, silhouette clarity, fine outline weight, lighting, restrained palette and miniature-map quality. Use the attached approved farm sample only for rural scale/content. Do not copy urban objects or layout.
STYLE: refined hand-crafted isometric pixel art, fixed 2:1 ground projection, clean stepped edges, deliberate clusters, fine selective dark colored outlines, 3–5 flat shades per material, upper-left key light, short lower-right contact shadow, controlled moderately saturated Brazilian rural palette, microdetails with clear hierarchy. Detailed enough to read at medium zoom; never noisy.
ASSET: [specific geometry/materials/pose/details]. Brazilian rural context. Silhouette and intended use: [purpose].
TECHNICAL: one object only, centered at a consistent ground anchor, footprint [W×H logical modules], camera/orientation [orientation], native pixel-art edges, PNG with true transparent background, clean alpha, no colored fringe, no baked ground tile. Leave safe transparent padding. Suitable for a modular game atlas.
DO NOT: painterly/semirealistic rendering, 3D render, gradients, soft photographic shadows, anti-alias blur, glossy mobile-game look, random micro-noise, thick uniform black outline, text, labels, watermark, border, neighboring assets, full scene, drop-shadow halo.
```

Para tiles, trocar `one object` por `one seamless ground tile`, especificar os conectores/arestas e pedir exterior transparente. Tileability deve ser validada no compositor; o prompt não prova que não há emenda.

## 6. Prompts específicos prontos

Cada bloco completa o [template universal](#5-template-universal-de-prompt). Anexe a referência urbana limpa em todas as chamadas; use a amostra rural aprovada somente para conteúdo e escala. Gere uma peça/variante por chamada. Peça PNG RGBA com transparência real para objetos; para tiles, transparência fora da área útil e bordas de encaixe explicitadas. O prompt não substitui a revisão de pixels nem o teste 3×3.

1. **Grama/pasto claro (tile 128×64):** `One seamless 2:1 isometric grass ground tile for a Brazilian pasture, native 128×64 px canvas, clean diamond boundary, muted sage-green base with 4–8 deliberate pixel clusters of short grass in two related greens, a few bare-earth pixels only, no raised edge, no cast shadow, exact matching boundary pixels on all four diamond edges, transparent outside the diamond.`
2. **Pasto médio e seco (tile 128×64):** `One native 128×64 2:1 isometric pasture tile, medium-season Brazilian field grass with sparse controlled clusters and modest olive/ochre variation. Match the base grass tile's diamond contour and edge pixels exactly; no new object, no border thickness change, no lighting gradient, transparent exterior.`
3. **Terra arada/solo seco (tile 128×64):** `One seamless 128×64 2:1 isometric Brazilian red-earth ground tile, compacted dry soil with a few short furrows and small muted clods drawn as deliberate pixel groups. Keep the full diamond level with grass tiles, edge pixels compatible on all four sides, no stones larger than a cluster, no pedestal, transparent outside.`
4. **Estrada reta (tile 128×64):** `One 128×64 isometric straight farm-road ground tile aligned to the 2:1 grid. Compacted terracotta earth with two narrow wheel tracks, restrained green shoulders, road endpoints meet the opposite diamond edges at matching coordinates. No vehicle, fence, raised bank or shadow; transparent outside the tile.`
5. **Curva, junção e cruzamento (tiles separados):** `Create ONE road connector variant only: [90-degree turn / T-junction / crossroads] for the same 128×64 isometric road family. Preserve the straight road's width, terracotta palette, tile edge, wheel-track style and 2:1 projection. State matching connector edges precisely; keep grass shoulder pixels consistent. Transparent exterior; no vehicle or signage.`
6. **Cerca reta (módulo 1×1):** `One isolated modular Brazilian pasture fence segment, two eucalyptus posts exactly one logical cell apart, three fine dark wires, visible square-cut post tops and small fasteners. Isometric 2:1 ground orientation, endpoint connectors centered on the module edges, slim readable silhouette, transparent background, no grass base.`
7. **Cerca de canto:** `One separate isometric corner fence asset matching the straight fence: same two eucalyptus posts, height, wire count, spacing and outline. Two perpendicular connector directions meet cleanly at the corner post; include no ground tile, gate, cattle or shadow halo. Transparent background.`
8. **Porteira:** `One closed wooden Brazilian farm gate between matching eucalyptus posts, three rails or fine wire panels, simple diagonal brace and small latch. Isometric 2:1 orientation, exact connector points on both fence ends, opening width one logical cell, transparent background, no surrounding pasture.`
9. **Árvore pequena:** `One small Brazilian pasture shade tree, 2×2 logical footprint, branching trunk and irregular canopy built from 5–7 distinct stepped pixel clusters in three muted greens. Leave small silhouette gaps, vary crown direction, anchor at visible trunk base, short graphic contact shadow, transparent background; avoid round lollipop foliage.`
10. **Árvore média/grande:** `One medium/large Brazilian farm shade tree, [medium 3×3 / large 4×4] logical footprint, asymmetric branching trunk and layered canopy with separated leaf masses, occasional visible branch gaps and selective highlights. Same pixel scale and green family as the small tree, base anchor, compact shadow and transparent background.`
11. **Arbusto e capim:** `One low native Brazilian field shrub OR one tall grass tuft, under fence height, compact irregular clusters with 3 flat green values and a few intentional leaf tips. Ground contact at bottom-center, transparent background, no dirt tile, no flower noise, same leaf pixel scale as the approved tree.`
12. **Lago pequeno:** `One small irregular farm pond ground asset, 3×3 logical footprint, calm blue-green water with 2–3 crisp highlight clusters, narrow red-earth/grass bank and only a few reed clumps. Top-down 2:1 isometric ground plane, clean shore silhouette and declared water/shore connectors, transparent exterior, no broad scenery.`
13. **Açude médio:** `One medium Brazilian farm reservoir ground asset, 5×4 logical footprint, irregular but readable shoreline, restrained water pixel clusters, one compact earthen dam bank and sparse reeds. Keep water and shore edge separable in the image, 2:1 perspective, transparent outside footprint, no buildings or large reflections.`
14. **Casa rural simples:** `One modest Brazilian rural home, 3×3 footprint, cream plaster, terracotta tile roof in short stepped rows, shaded veranda, timber door and two green-shutter windows. Two wall planes and roof ridge clearly readable, fine selective contours, ground-contact anchor, transparent background, no yard or plants.`
15. **Sede da fazenda:** `One larger Brazilian fazenda headquarters, 4×4 footprint, tiled roof with small ridge/chimney detail, shaded front veranda with slender posts, cream walls, several windows and a restrained garden threshold. Same 2:1 camera and fine line weight as the small farmhouse; isolated cutout, transparent background, no road.`
16. **Galpão/oficina:** `One open-sided rural machinery shed, 5×3 footprint, timber or muted painted-steel rafters, terracotta or zinc roof, legible bay posts, a few stacked feed sacks and one tool rack inside. Keep open bays visible, anchor at ground corners, transparent background, no tractor or terrain tile.`
17. **Silo:** `One galvanized grain silo, 1×1 ground footprint, cylindrical ribbed walls, conical roof, small ladder, base supports and one restrained access hatch. Pixel clusters form clean metal planes with 3–4 tones, no photographic glints, transparent background, ground anchor at center.`
18. **Curral/brete modular:** `One compact isometric cattle-handling module, 6×5 footprint, timber rails with even post spacing, one gate opening and a clear sorting lane leading to a simple squeeze chute. Show modular join points on intended edges; no animals or surrounding dirt, transparent outside the module.`
19. **Cocho:** `One isolated Brazilian cattle feed bunk, 2×1 footprint, weathered timber or muted enamel trough, short legs, clean rim and a small grouped hay surface. Isometric 2:1 orientation, bottom-centered anchor, transparent background, no animal or pasture.`
20. **Bebedouro:** `One isolated galvanized livestock water trough, 1×1 footprint, short separated legs, crisp rim, small blue-green flat water surface and simple float valve. Same camera/light/pixel scale as the feed bunk, transparent background, no ground tile or glow.`
21. **Trator:** `One compact green Brazilian farm tractor, 2×1 footprint, three-quarter isometric aligned to a 2:1 ground axis, two readable wheel sizes with dark grouped treads, compact cab, yellow hub accents, steps and rear hitch. Fine selective contours, base anchor under wheels, transparent background, no trailer or road.`
22. **Caminhonete rural:** `One generic Brazilian farm pickup, 2×1 footprint, double cab, restrained forest-green body, cream lower trim, readable window planes, tires and open bed. Same 2:1 vehicle camera and pixel scale as the tractor, no logo/plate text, grounded anchor, transparent background.`
23. **Caminhão pequeno/carreta:** `One small rural flatbed truck OR one detached farm trailer, [3×1 / 2×1] footprint. Simple cab/bed silhouette, wood or muted metal cargo sides, grouped wheel details, consistent three-quarter isometric angle with the tractor. One vehicle only, no branding or cargo clutter, transparent background.`
24. **Talhão agrícola preparado:** `One seamless 128×64 crop-field ground tile with straight planting beds aligned to the 2:1 isometric grid, red-brown soil rows and restrained pixel clusters; no plants yet. Row ends must match declared tile connectors, same diamond footprint as pasture, transparent exterior, no raised block.`
25. **Lavoura por estágios:** `One 128×64 field tile for exactly one crop and stage: [emerging soybean / mature soybean / growing maize / mature maize / harvested stubble]. Keep row direction, module, soil and edge connectors identical across the family. Soybean stays low with compact leaf clusters; mature maize has small readable tassels. Transparent exterior; no labels or tools.`
26. **Irrigação:** `One isolated modular small-farm irrigation unit: [straight sprinkler pipe / single center-pivot span / wheel tower]. Thin readable metal frame, 1–2 restrained water pixel clusters, clear end connectors and a stated logical footprint. Match the farm pixel scale; transparent background; no field or gradient water spray.`
27. **Props rurais:** `Create exactly one isolated Brazilian farm-yard prop: [hay bale / crate / feed sack / pallet / tire stack / fuel drum / shovel / tool rack]. Compact 1×1 footprint unless specified, fine outline, 3–4 grouped material tones, grounded bottom anchor, transparent background; no writing, neighboring props or baked ground.`
28. **Bovinos Nelore e leiteiros:** `One full-body cattle sprite in a calm standing pose, 1×1 footprint: [white/light-grey Nelore with recognizable shoulder hump / black-and-white dairy cow]. Four separated legs, ears, muzzle and tail stay readable; coat uses grouped pixel marks rather than hairs. Consistent three-quarter isometric camera, fine outline, short ground contact shadow, transparent background.`

## 7. Checklist de aprovação


### Visual — todos precisam passar

- [ ] perspectiva 2:1 coerente; eixos do chão dentro de ±0,05 da inclinação 0,5;
- [ ] câmera, orientação e ponto de contato combinam com os assets aprovados;
- [ ] contorno externo seletivo de 1 px lógico (até 2 px só em formas grandes), sem borda preta pesada/halo;
- [ ] clusters de pixels deliberados, volumes legíveis, 3–5 tons chapados por material;
- [ ] luz superior esquerda e sombra de contato curta para baixo/direita;
- [ ] paleta rural moderada e estável; sem neon, gradiente pictórico ou brilho 3D;
- [ ] microdetalhes intencionais (aberturas, estrutura, equipamento) aparecem em zoom médio;
- [ ] silhueta continua clara em 100%, 50% e 25%; não parece de outro jogo;
- [ ] vegetação variada e irregular sem micro-ruído nem padrão repetitivo;
- [ ] em cena, densidade organizada e leitura de zonas/conexões preservada.

### Técnico — todos precisam passar

- [ ] PNG RGBA, transparência limpa, RGB de borda sem fringe colorida;
- [ ] sem cenário/fundo/asset vizinho embutido; bounds e margem recortados;
- [ ] nome/categoria/caminho estáveis; tamanho-fonte e resolução lógica conhecidos;
- [ ] âncora, footprint, orientação e colisão descritos separadamente;
- [ ] tiles/conectores identificados; render de grade 3×3 sem costuras;
- [ ] módulos e variantes registrados; tags de bioma/estação/uso corretas;
- [ ] sprite revisado em fundo branco, escuro e quadriculado;
- [ ] manifesto carrega frame correto, trim e atlas padding/extrusion de 2–4 px conferidos.

**Gate:** falha em qualquer item obrigatório reprova a variante. Cor e contagem global de pixels não são gates isolados; avaliar clusters, bordas e leitura no sprite e no mapa.

## 8. Pastas e convenções

```text
public/assets/
  manifest.json                 # manifesto de produção vigente
  style-guide.md                # cópia/versionamento do contrato de arte, se servido pelo app
  source-v1/                    # PNGs RGBA curados, uma variante por arquivo
    terrain/ roads/ fences/ vegetation/ water/
    buildings/ livestock/ vehicles/ agriculture/ props/
  atlas/                        # atlas derivados; nunca fonte de edição
  previews/                     # comparativos, checkerboard e cena teste
docs/
  style-guide.md                # fonte normativa
  assets/                       # referências e renders de cena (não sprites de runtime)
```

Nome estável em kebab-case: `<categoria>-<espécie-ou-função>-<estágio-ou-variante>-NN`, por exemplo `vegetation-shade-tree-cerrado-01.png`, `agriculture-soybean-mature-01.png`. Evitar trocar o ID quando só o arquivo/arte muda; incrementar revisão da imagem e registrar substituição.

## 9. Manifesto proposto

O projeto já possui `public/assets/manifest.json` v1 com `id`, categoria, frame, âncora, footprint, tags, cenário, variantes, escala e colisão. O exemplo abaixo é uma proposta de metadados v2; não substitui nem altera o manifesto/runtime atual nesta etapa.

```json
{
  "version": 2,
  "style": "riose-isometric-farm-v1",
  "projection": { "type": "isometric-2to1", "modulePx": [64, 32], "light": "top-left" },
  "atlases": {
    "vegetation-v1": { "image": "/assets/atlas/vegetation-v1.png", "sourceSize": [2048, 2048], "filter": "nearest", "extrusionPx": 3 }
  },
  "assets": [{
    "id": "vegetation-shade-tree-cerrado-01",
    "category": "vegetation",
    "file": "/assets/source-v1/vegetation/vegetation-shade-tree-cerrado-01.png",
    "atlasFrame": { "atlas": "vegetation-v1", "x": 0, "y": 0, "w": 256, "h": 256 },
    "sourceSize": [256, 256], "trim": { "x": 8, "y": 12, "w": 240, "h": 236 },
    "anchor": { "x": 0.5, "y": 0.92, "meaning": "ground-contact" },
    "footprint": { "cells": [2, 2], "collision": { "type": "circle", "radiusCells": 0.45 } },
    "pixelScale": 2,
    "connectors": [], "edgeMask": null,
    "tags": ["tree", "shade", "cerrado"], "biomes": ["southeast", "center-west"],
    "seasonVariants": ["wet", "dry"], "variantGroup": "shade-tree-cerrado",
    "layer": "over-ground-by-anchor", "zSort": "anchor-y"
  }]
}
```

Tile metadata usa `edgeMask` e `connectors` para provar que segmentos se encaixam; estruturas usam conectores nomeados (ex.: fence-end-northwest/southeast). A colisão descreve espaço lógico e não deriva da caixa de pixels. O manifesto atual não consome todos esses campos, portanto permanecem proposta até uma etapa separada de integração.

## 10. Pipeline de produção

1. Fixar versão das referências e objetivo do lote; anexar a referência urbana dominante em toda geração.
2. Gerar **um asset por chamada**, com recorte transparente; criar variações sem mudar câmera, luz, escala, paleta ou peso de traço.
3. Fazer triagem visual contra o guia; reprovar pinturas/render 3D e repetir o asset em vez de tentar consertá-lo com resize/filtro.
4. Validar alpha em mattes branco/escuro/quadriculado; limpar halos e verificar sombra/bounds. Cleanup do matte não pode mudar forma, paleta ou linguagem da arte.
5. Marcar resolução nativa, âncora de chão, footprint, módulos, orientações e conectores; recortar com margem segura.
6. Aprovar tiles em matriz 3×3 e props em composição simples; fazer revisão de escala e densidade em cena.
7. Salvar fontes na pasta categorizada; registrar id estável, revisão, licença/origem e critérios aprovados.
8. Montar atlas por categoria/tamanho/uso; usar trim, extrusão de 2–4 px e nearest-neighbor na apresentação de pixel art.
9. Validar manifesto/frames e conferir no mapa existente sem misturar mudança de arte com mudança de arquitetura.
10. Substituir no runtime somente após revisão humana do kit e cena teste; manter fallback técnico para falha de carga, não como visual final.

### Kit base v1 — lote de curadoria

| Grupo | Quantidades alvo | Peças |
| --- | ---: | --- |
| Terreno | 3 | pasto claro, pasto médio, solo seco |
| Caminhos | 2 | reta, curva/junção compatível |
| Cerca | 2 | segmento reto, canto |
| Vegetação | 4 | árvore pequena, média e grande, arbusto |
| Água | 1 | lago pequeno |
| Edificações | 5 | casa simples, sede, galpão, silo, curral modular |
| Pecuária | 2 | cocho, bebedouro |
| Animais | 2 | vaca leiteira, boi Nelore |
| Veículos | 2 | trator, caminhonete |
| Agricultura | 4 | soja emergindo/madura, milho crescendo/maduro |
| **Total** | **27** | IDs únicos; uma versão inicial por item |

**Ordem:** primeiro 3 elementos de calibração (tile de pasto, árvore média, casa) para fixar contorno/escala; em seguida produzir o restante mantendo os valores aprovados. Depois curar todos em uma única prancha, montar cena teste v2 e só então decidir quais entram em atlas/runtime.

## 11. Auditoria e próximos passos

- **Reaproveitar:** `engine.js`/`worker.js`, estado da simulação, seed e dados de animais; `public/assets/manifest.json` como ponto de partida de schema; referências urbanas/rurais para curadoria.
- **Manter como legado, não estilo final:** os três atlas atuais em `public/assets/atlas/` e os prompts semirrealistas de [arte-e-pipeline.md](arte-e-pipeline.md). Não substituir esses frames silenciosamente.
- **Referências não recortáveis:** as cenas em `docs/assets/` são RGB opacas; servem para comparar estilo e layout, não para fatiar como sprites. Gerar novas imagens de sprite com alfa real.
- **Compositor atual:** `app.js` carrega frames por manifesto, mas o posicionamento/escala está codificado manualmente e não consome âncoras/footprints/variantes; o mapa visual ainda é composto em posições fixas. A integração dos novos metadados e a geração procedural são etapa posterior, fora deste lote visual.
- **Próximas ações:** produzir os 27 PNGs do kit base sob esse contrato; aprovar individualmente e na prancha; montar cena teste v2; atualizar atlas/manifesto/runtime em mudança separada após aprovação da arte.
