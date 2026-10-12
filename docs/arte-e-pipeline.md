# Direção visual e pipeline de assets

> **Direção substituída:** os atlas desta etapa anterior ficaram semirrealistas e não são referência de estilo. Os prompts das seções abaixo são arquivo histórico. Para nova geração, use o template e os 28 prompts atualizados da [bíblia visual Ríose Isometric Farm Style v1, seção 6](style-guide.md#6-prompts-específicos-prontos), que já incorporam a referência pixel-art dominante, escala 2:1, alpha e conectores.

## Diagnóstico e decisão de arte

O mapa anterior era desenhado dentro de `app.js` com retângulos: terreno, estradas, cercas, árvores, casas, curral, água e até os bovinos eram formas de poucos pixels. Isso resolvia a composição inicial, mas deixava a arte com aparência de protótipo e misturava visual e simulação no mesmo lugar.

A correção é **asset-first, image-based e code-composed**. O estilo-alvo é um diorama isométrico ilustrado premium: câmera consistente, volumes com silhueta clara, contorno fino, luz vinda do alto à esquerda, sombras macias e detalhe rural brasileiro legível em zoom médio. A referência urbana serve só para perspectiva, acabamento, escala e paleta; não entram edifícios nem objetos urbanos. Layout, seed, hit-test, estado do rebanho e clima continuam sendo responsabilidade do código.

O protótipo atual usa atlas ilustrados com alfa para chão, infraestrutura, vegetação, construções, equipamento, água e bovinos. Os sprites têm proporção e recorte coerentes; o mapa os compõe de forma determinística a partir da semente. A malha da fazenda ainda usa as coordenadas retangulares do MVP para manter o motor zootécnico e a seleção de animais funcionando durante a migração. A próxima migração pode mover o layout para coordenadas de célula isométrica sem reescrever as regras da simulação.

## O que manter, trocar e tratar como transição

| Parte atual | Decisão |
| --- | --- |
| Motor de simulação em `engine.js` e `worker.js` | Manter separado do desenho. |
| Seed determinística, bounds dos piquetes e posições do rebanho | Manter; reutilizar como entrada do compositor. |
| Pan, zoom, interação e seleção do canvas | Manter; converter o hit-test quando a projeção virar uma grade isométrica completa. |
| Canvas 2D e composição em camadas | Manter neste MVP; PixiJS passa a valer quando o volume de sprites/chunks justificar a mudança. |
| Retângulos de terreno, árvores, cercas, água, prédios, máquinas e corpos dos bovinos | Substituídos por imagens da biblioteca. |
| Formas simples de fallback quando manifesto ou textura não carregar | Fallback técnico temporário, nunca o estilo de produção. |
| Etiquetas de piquete, seleção e indicador de chuva/calor | Overlays de interface/dados, não arte do mundo. |

## Biblioteca inicial entregue

Os PNGs originais são spritesheets transparentes gerados para este projeto. O manifesto descreve cada recorte e metadado. As células são contíguas; as coordenadas fracionárias do segundo atlas são intencionais porque sua imagem mede 1774 × 887.

| Atlas | Conteúdo |
| --- | --- |
| `public/assets/atlas/farm-starter-atlas.png` | Pasto vivo, pasto misto, solo seco, solo úmido, estrada reta e curva, cerca, porteira, árvore de sombra, frutífera, arbusto, lago, casa-sede, galpão, silo e trator. |
| `public/assets/atlas/livestock-equipment-atlas.png` | Bebedouro, cocho, curral/brete, vaca leiteira, bovino Nelore, bezerro, caminhonete e caminhão utilitário. |
| `public/assets/atlas/crop-stages-atlas.png` | Solo preparado, soja emergindo/crescendo/madura, milho crescendo/maduro, pós-colheita e lavoura irrigada. |
| `public/assets/manifest.json` | Categorias, arquivos, frames, âncoras, pegadas, tags, cenários compatíveis, variantes, dicas de escala e colisão opcional. |
| `public/assets/scenarios.json` | Seis receitas de fazenda com região de referência, estação, densidade, paleta, zonas e famílias de assets. |

Categorias planejadas: terreno/transições; agricultura e estágios de cultivo; pecuária; estradas e infraestrutura; vegetação; edificações; máquinas/veículos; água e margens; props, decalques e overlays. Cada novo item recebe `id` estável em kebab-case, por exemplo `field-soybean-growing-02` ou `fence-corner-wood-01`.

## Convenção de arte

- PNG RGBA, alfa limpo, sem chão ou cenário embutido nos objetos.
- Para objetos, ponto de ancoragem no contato com o solo; para chão, origem no centro do losango.
- Ângulo de câmera 2:1, luz superior esquerda, contorno fino uniforme e sombra curta.
- Um sprite deve ter uma função visual. Variações de estação e cultivo são ids distintos, não filtros de cor improvisados.
- Sem texto dentro da imagem, sem moldura de célula, sem objetos que cruzem para outra célula.
- A escala lógica mora no manifesto, não em duplicatas do PNG. Manter margem transparente de segurança e testar a silhueta em 100%, 50% e 25%.

## Prompts prontos para geração

Usar o prefixo visual comum abaixo no início de cada pedido e, depois, o prompt específico. Para sprites de chão, pedir losango modular; para objetos, pedir alfa transparente real e uma sombra de contato discreta. Gerar variações em chamadas separadas para manter a grade consistente.

**Prefixo visual comum**

```text
Premium illustrated isometric farm-sim game asset, clean 2:1 isometric camera from above, Brazilian rural setting, refined miniature diorama, crisp readable silhouette, fine elegant consistent outlines, soft upper-left lighting and contact shadow, balanced sage pasture green, warm red-earth, cream and terracotta palette, rich small details without clutter, polished production-ready modular sprite, match one coherent art direction across the asset library. Rural content only; do not include city or urban elements. No text, labels, watermark, UI, grid, border or neighboring objects. Transparent background for a cutout asset.
```

**1. Grama e terreno — tile modular**

```text
Create a seamless square isometric ground tile for a Brazilian farm map: short mixed pasture grass with a few hand-painted blades, subtle soil edge, no objects taller than the tile surface. The ground plane is one clean diamond with a 2:1 top face, aligned edges that tile on all four sides. Produce separate matching variants for fresh light pasture, medium pasture, dry ochre ground, ploughed red soil, dark damp soil, mud, gravel and sandy track. Transparent background outside the diamond; consistent tile dimensions and camera.
```

**2. Estrada de terra — segmentos**

```text
Create one modular isometric Brazilian farm dirt-road segment, compacted reddish earth with two restrained wheel tracks, subtle grass along the shoulders. Show only one straight segment with clean diamond-aligned endpoints; make matching straight, 90-degree turn, T-junction, crossroads and narrow path as separate assets. Isometric ground tile, transparent outside the road footprint, endpoints designed to join without seams.
```

**3. Cerca reta e cerca de canto**

```text
Create a modular rural Brazilian fence sprite: weathered eucalyptus or native hardwood posts with two fine dark wires, optionally a simple three-rail wooden variant. One straight isometric segment ending exactly at post centers; generate a matching corner separately with the same post spacing and height. Clear outline and transparent background, no ground tile, readable at small zoom.
```

**4. Porteira**

```text
Create a closed rural Brazilian farm gate between two timber fence posts, simple sturdy wood-and-wire construction with a visible latch, isometric side angle matching a straight fence module. The bottom aligns to the farm ground plane; transparent background and a tiny soft contact shadow. Keep the opening width compatible with a tractor or cattle path.
```

**5. Árvore pequena**

```text
Create a small Brazilian pasture shade tree with a compact rounded crown, branching trunk visible below foliage, a few distinct leaf clusters and a ground contact shadow. Isometric cutout, trunk base precisely at the anchor, transparent background; keep its crown narrow enough to repeat along fences without obscuring neighbors.
```

**6. Árvore média / frutífera**

```text
Create a medium Brazilian farmyard fruit tree, such as a restrained citrus or jabuticaba interpretation, with a branching trunk and sparse readable fruit among layered leaves. Use the same camera, light, outline and palette as the pasture-tree library. Full tree isolated, transparent background, base-centered anchor, no pot or scenery.
```

**7. Arbusto e capim**

```text
Create an isolated low flowering native-field shrub with three-dimensional leaf clusters and just a few tiny flowers; include a separate tuft of tall pasture grass as a matching variant. Isometric cutout with transparent background and small contact shadow; low enough to place at a pond edge or fence corner.
```

**8. Lago pequeno / açude**

```text
Create a small irregular farm pond as an isometric ground asset, clear blue-green water, terracotta and grassy bank, a few reeds and two understated reflections. The entire shoreline is a closed modular footprint with a clean edge and transparent exterior. Make the water surface readable in wide zoom, without fish, labels or surrounding landscape.
```

**9. Açude médio e margem**

```text
Create a medium Brazilian farm reservoir (açude) with a calm irregular water surface, shallow wet edge, one earthen dam bank, sparse native reeds and a subtle water reflection. Isometric ground-plane sprite, transparent outside its footprint. Provide separate bank, water, and vegetation-edge layers so the compositor can assemble different shorelines.
```

**10. Casa rural**

```text
Create a modest Brazilian rural home with cream limewashed walls, terracotta tile roof, shaded veranda, timber door and two green shutters. Isometric three-quarter diorama, clearly readable roof and wall volumes, base-centered transparent cutout, soft shadow, believable compact footprint; no urban architecture or signage.
```

**11. Sede da fazenda**

```text
Create a welcoming Brazilian fazenda headquarters house, slightly larger than the simple rural home, with terracotta roof, veranda, cream walls, a few native garden plants and restrained timber details. Premium illustrated isometric game building, transparent background, coherent light and scale, clean footprint for placement next to a farm road.
```

**12. Galpão e oficina**

```text
Create a practical open-sided Brazilian farm machinery shed with red-brown timber or painted steel framing, broad terracotta or muted metal roof, a few hay bales and one implement visible inside. Isometric modular building asset, transparent background, base anchor, readable openings, no baked landscape.
```

**13. Silo**

```text
Create a single galvanized grain silo used on a Brazilian soybean and maize farm, ribbed metal cylinder, conical roof, ladder and short supporting base. Isometric cutout, polished but not photoreal, transparent background, clear silhouette at 50% size. Generate a matching horizontal grain bin as a separate asset.
```

**14. Curral e brete**

```text
Create a compact cattle-handling corral module with timber rails, a sorting lane, small squeeze chute/brete and one visible gate. Isometric ground-plane diorama cutout, modular square footprint, no animals, transparent outside the pens, consistent fence post scale and soft shadows.
```

**15. Cocho**

```text
Create a long Brazilian cattle feed bunk, weathered timber or muted green enamel, sturdy legs and a small amount of hay. Isometric object sprite with full readable silhouette, transparent background, bottom-centered anchor, designed to tile in a straight line beside a fence or shed.
```

**16. Bebedouro**

```text
Create a compact green metal cattle water trough on four legs, visible clean blue-green water and a simple float valve. Isometric isolated prop, transparent background, subtle ground shadow, small footprint and strong silhouette that reads at 25% scale.
```

**17. Trator**

```text
Create a compact green farm tractor common in Brazil, with yellow wheel hubs, detailed tires and a small rear hitch, seen from a consistent isometric three-quarter angle. Isolated transparent sprite, visible cab and wheels, no driver portrait detail, grounded contact shadow and footprint suitable for a two-tile track.
```

**18. Caminhonete rural**

```text
Create a generic forest-green Brazilian farm pickup, double cab, cream lower trim, practical tires and an open bed; no brand marks, lettering or license text. Isometric three-quarter cutout, transparent background, match tractor camera, balanced proportions and clear wheel silhouette.
```

**19. Caminhão pequeno e carreta**

```text
Create a compact red-brown farm utility truck with a simple open cargo bed, and a matching small agricultural trailer as a separate variation. Brazilian rural work vehicle, isometric view consistent with other machinery, transparent background, no logos, clear shadow and readable silhouette.
```

**20. Talhão agrícola**

```text
Create a modular isometric crop-field ground tile for a Brazilian farm: organized low rows of soybean or maize following the diamond footprint, rich but uncluttered plants, visible red-brown earth between rows. Provide individual matching stage sprites: prepared bare soil, newly emerged seedlings, growing crop, mature crop, and harvested stubble. Transparent outside the tile, same row direction and edge alignment.
```

**21. Lavoura em estágios**

```text
Create a coordinated set of Brazilian maize and soybean field-stage sprites viewed isometrically: germination, young crop, mature crop, and post-harvest. Keep tile footprint, camera, sowing-row direction, light and palette identical across stages. Mature maize has recognizable tassels; soybean remains lower with leaf clusters. No text or boundary fence; transparent outside the field tile.
```

**22. Irrigação**

```text
Create a simple small-farm irrigation asset for Brazil: one isometric pivot segment or modular sprinkler line over a crop field, slender metal structure with a few restrained water droplets. Transparent background, clean equipment silhouette, modular straight pieces and endpoint connection, no full landscape.
```

**23. Props rurais**

```text
Create one isolated modular Brazilian farm-yard prop per image: hay bale, wooden crate, feed sack, pallet, tire stack, fuel drum, shovel, tool rack, or small signpost. Premium consistent isometric illustration, fine outlines, soft top-left light, transparent background, grounded anchor and uncluttered silhouette. No writing on sacks or signs.
```

**24. Bovinos**

```text
Create an isolated full-body Brazilian cattle sprite in a calm standing pose, readable at small game-map scale. Make separate variants: black-and-white dairy cow; white or warm-grey Nelore beef animal with its characteristic shoulder hump; cream-and-brown calf. Isometric three-quarter top view matching the farm asset camera, all four legs visible, transparent background, consistent coat detail, fine outline and soft contact shadow. Avoid photographic realism and avoid clipping the tail, horns or feet.
```

## Pastas, atlas e carregamento

```text
public/assets/
  manifest.json
  scenarios.json
  atlas/
    farm-starter-atlas.png
    livestock-equipment-atlas.png
  terrain/ agriculture/ livestock/ infrastructure/
  vegetation/ buildings/ vehicles/ water/ props/
docs/arte-e-pipeline.md
```

Manter as imagens-fonte por atlas no browser para reduzir pedidos HTTP. Quando o conjunto crescer, produzir atlas separados por categoria/estação, cada um abaixo do limite de textura do dispositivo; dividir assets grandes e tiles repetidos em atlas distintos. Preservar RGBA, adicionar extrusão de 2–4 px ao gerar atlas compactado para evitar sangramento em zoom, e usar nearest/linear conforme a textura (ilustração detalhada usa linear; pixel art usa nearest). O manifesto aponta para o frame sem obrigar o código a conhecer o arranjo da folha.

Pipeline de curadoria: gerar um lote de estilo; rejeitar inconsistências de câmera/sombra/escala; remover halos de alfa; recortar sem perder a sombra; normalizar escala usando pegada lógica e âncora; conferir o alfa sobre fundo claro/escuro; atribuir ids e tags; montar/atualizar atlas; validar dimensões e frames; revisar no mapa em zoom amplo e próximo; versionar a direção de arte. Nunca substituir um frame existente sem revisar as cenas que o usam.

## Composição procedural

1. O cenário fornece a seed, estação, bioma, orçamento de elementos e zonas permitidas. A seed gera um `Random(seed)` local; não usar `Math.random()` compartilhado com o motor de simulação.
2. Gerar uma planta lógica: sede e galpão próximos à via de acesso; piquetes ligados por porteiras; curral perto da sede; bebedouro dentro de cada zona de pasto; culturas em blocos contíguos; açude longe de edifícios; árvores como borda/sombra sem bloquear navegação.
3. Validar pegadas, bordas, distância mínima, colisões e conexões de estrada antes de criar sprites. A renderização recebe entidades (`assetId`, `x`, `y`, `layer`, `rotation`, `scale`, `variant`) sem mudar os dados do motor.
4. Renderizar terreno abaixo de estradas e campos; depois água/margens; edifícios/props ordenados por `y`; rebanho; overlays de seleção, clima e leitura de dados. Ordenar objetos altos pelo pé do sprite, não pelo topo da imagem.
5. Cachear chunks por seed + cenário + estação. Ao trocar de cenário, regenerar apenas a planta e recarregar atlas que ainda não esteja na cache.

As seis receitas em `public/assets/scenarios.json` cobrem pecuária extensiva, agricultura Centro-Oeste, fazenda mista Sudeste, seca, período chuvoso e demonstração premium. Cada receita registra zonas e famílias de assets; dimensões reais e limites de simulação continuam pertencendo ao motor, não ao manifesto artístico.

## Próximos passos de migração

1. Adicionar variantes de solo e culturas de outras fases/espécies e bovinos nas poses de pastar, beber e descansar; usar variantes de estado no mesmo ponto de ancoragem.
2. Separar `world-layout.js` (seed e zonas), `asset-manifest.js` (validação/carregamento) e `world-renderer.js` (ordenação, atlas e chunks) do arquivo da interface.
3. Migrar o layout para coordenadas de célula isométrica e transformar eventos de ponteiro pelo mesmo projetor/inversor; manter a API `x/y` do motor por adaptador.
4. Adotar PixiJS/tilemap quando houver muitos milhares de sprites simultâneos ou chunks medidos; não trocar o stack só por preferência.
5. Curar manualmente a biblioteca antes de tratar os primeiros atlas como arte final de produção; prompts e imagem gerada são um ponto de partida consistente, não uma aprovação artística automática.
