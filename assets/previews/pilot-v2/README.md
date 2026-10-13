# Piloto pecuário V2 — revisão

Esta pasta reúne uma prancha selecionada e uma composição estática feita com PNGs já listados no manifesto semântico. Ela não é uma exportação runtime e não aprova sprites.

- `contact-sheet.png`: os 12 itens do piloto mais a casa de calibração v2.
- `scene-candidate.png`: composição anterior para revisão de layout; usa tiles legados.
- `ranch-pilot-terrain-v2.png`: piloto de fazenda de corte com o terreno V2, sede, açude, curral, galpão, cochos, Nelore representativo, trator e monitoramento. A composição usa PNGs reais do manifesto, com escala por `scaleHints`; segue estática e em revisão.
- `visual-gate-comparison.png`: comparação do piloto com a referência urbana e a Fazenda V7.
- `farmhouse-comparison.png`: referência urbana, cena V7 aprovada e casa nova lado a lado.
- `farmhouse-scale-comparison.png`: detalhes comparados em tamanho de apresentação semelhante para avaliar clusters, contorno e densidade.
- `rejected/`: uma tentativa com fundo/vinheta e a fonte bruta da tentativa aproveitada; a saída derivada de alpha rígido está registrada como `building.farmhouse.imagegen.v2` no manifesto, ainda em revisão.

## Resultado visual

A composição continua reprovada para style lock: há incompatibilidade de escala e acabamento entre tiles, bases individuais e props; a estrada candidata não possui conectores que permitam costura convincente. O arranjo de sede, curral, galpão, água e animais melhorou em proximidade, mas ainda não lê como um diorama único e coeso.

Uma nova casa foi gerada com a referência urbana, preservada como fonte e exportada com alpha binário por threshold 128, sem alterar RGB visível. A inspeção em matte não revelou halo amplo; o perfil de cor continua sem classificação. A forma e o detalhe parecem adequados para avaliação, mas o contorno/volume ainda precisa de aprovação humana lado a lado. Ela entrou no manifesto como `REVIEW` (art pending, technical pending), não como asset aprovado. A tentativa alternativa com vinheta pintada e zero pixels opacos foi rejeitada e preservada.

O próximo gate é a revisão visual do comparativo; o piloto V2 é mais conectado, mas ainda tem densidade e microdetalhe inferiores às referências. Nenhum sprite ou família foi promovido. A integração runtime e a promoção permanecem fora de escopo até passar o gate artístico e técnico.


### Terreno V2

A composição `ranch-pilot-terrain-v2.png` usa o contrato em `assets/manifests/terrain-family.v2.json`. O pasto base ocupa 9×9 subcélulas projetadas; o caminho tem footprint 4×4 e as manchas localizadas 2×2. As escalas preferenciais são verificadas por `scripts/assets/validate_library.py`. Os candidatos mantêm estado `REVIEW`; o alpha binário não prova correspondência estilística, continuidade visual, perfil de cor ou aprovação do gate.

## Terrain family V3 review

- `ranch-pilot-terrain-v3.png` composes the new V4 grass plate with existing V2 road, compacted, dry, and mud image overlays. The scene keeps the real farmhouse, corral, pond, cattle, shed, tractor, shade tree, and monitor station.
- `terrain-family-v3-comparison.png` shows the previous V2 pilot beside the V3 terrain integration at matched display size. V3 keeps wear decals smaller and focused around the house approach, gate/water, and tractor access.
- `../calibration-v2/pasture-premium-v4-alpha-crop-repeat-3x3.png` is the 3x3 repeat proof. V4 is **not approved for auto-tiling**: tonal diagonal joins remain visible. The pilot uses it once as a compact diorama ground plate, avoiding internal tile joins.
- Source artwork remains under `assets/source/terrain-family-v3/`; reviewed exports remain under `assets/candidates/terrain-family-v3/`. Both V3 and V4 candidates are `REVIEW` in the semantic manifest. No image has been promoted to production.
- Contract: `assets/manifests/terrain-family.v3.json`.
