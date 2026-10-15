# Riose World Engine V8 · seleção visual inicial

## Direção de arte para a primeira prova

- Projeção ortográfica 2:1, grade de referência 128 × 64 px por unidade de terreno.
- Paleta natural reduzida: verde oliva, verde folha, terra ocre, argila, água azul petróleo e madeira escura.
- Agrupamentos de pixels nítidos, contorno escuro discreto, três valores de sombra por material e luz superior esquerda.
- Silhuetas grandes e legíveis; vegetação concentrada em bordas úmidas, margens e transições de nível.
- Sem textura fotográfica, gradientes de luz, antialiasing ou adereços pequenos sem função espacial.
- Estratos de solo terão textura própria. A cor e a forma da face visível precisam explicar o desnível.

## Fonte e revisão do catálogo

O catálogo existente em `assets/previews/asset-art-direction-v1/` foi gerado com Pillow a partir de 512 imagens distribuídas entre 25 pranchas temáticas. As pranchas de terreno, água, vegetação, construções, manejo, bovinos e máquinas foram inspecionadas visualmente. A prancha V4 contém os 27 sprites distintos usados no piloto; as pranchas completas mostram também candidatos, originais e itens rejeitados. Os sinais automáticos de cor, alpha e densidade de borda servem como triagem, não como aprovação artística.

## Seleção para a prova de terreno

| Peça | Fonte selecionada | Uso | Tratamento |
|---|---|---|---|
| Topo gramado | `docs/assets/kit-base-v1/tile-curation-v1/edge-corrected/grass-mid-01.png` | tile de topo de 128 × 64 px nas cotas | manter escala inteira na textura; ajustar os verdes à paleta comum |
| Estrada | `docs/assets/kit-base-v1/tile-curation-v1/edge-corrected/soil-dry-01.png` | tile e decal do leito | compor em módulos 2:1, com borda irregular |
| Água | `docs/assets/kit-base-v1/water/pond-small-01.png` | sprite de água na área inferior | recortar a água do sprite, animar brilho por frames gerados por Pillow; reduzir vegetação decorativa duplicada |
| Vegetação | `assets/approved/vegetation/shade-tree-v2.png`, mais os tiles baixos de grama | árvores de margem e capim | quantizar cores, reduzir detalhe e preservar alpha duro |
| Contato do terreno | `assets/candidates/terrain-family-v7/ranch-cliff-side-material-v1.png` | paleta-base das faces | usar como amostra; converter em padrão de pixels por estrato |

O tile de grama e o de solo seco têm contorno em degraus e densidade de pixel mais próxima do alvo. O sprite de água e a árvore aprovada têm volume e detalhe excessivos; serão usados apenas após estilização e em baixa densidade. A composição V4 `rural-diorama-ground-v2.png` fica fora da prova inicial porque é uma placa pronta que prende estrada e vegetação a uma única imagem.

## Lacunas registradas

- Não há sprite de ponte/cabeceira de ponte adequado no catálogo.
- Não há conjunto de faces de barranco por altura, cantos ou material.
- Não há rampa/escada modular para as dimensões da grade selecionada.
- Não há água em frames independentes nem transições tileáveis de grama para terra/água.
- Os edifícios, animais e parte da vegetação disponíveis exigem correção de paleta e agrupamento antes de uma aprovação de estilo V8.

## Seleção para a montagem rural

| Peça | Asset escolhido | Motivo e tratamento | Estado |
|---|---|---|---|
| Sede | `building-farmhouse-imagegen-v1` | recorte transparente com entrada legível; posicionada no platô e com socket de estrada | `REVIEW`; densidade de telhas ainda alta |
| Galpão | `building-shed-imagegen-v1` | vão aberto e máquinas visíveis; footprint de montagem maior que o registro visual original | `REVIEW`; validar escala com arte de produção |
| Piquete e porteira | `corral-wood-standard-imagegen-v1` | composto fechado mantém a cerca contínua; socket da porteira conecta ao acesso | `REVIEW`; componente composto contém a porteira no sprite |
| Bebedouro | `water-trough-round-imagegen-v1` | silhueta reconhecível e socket de acesso animal | `REVIEW`; precisa de recorte/pixelização para igualar os tiles |
| Bovinos | `nelore-state-atlas-v1.png` | idle aprovado e frames distintos de caminhada, pastejo e bebida pixelizados para o atlas V8 | idle `APPROVED_STATIC`; demais clips `REVIEW` |

As peças de infraestrutura foram inspecionadas nos PNGs de origem e na composição atual. Os postes e fios avulsos disponíveis são longos para um intervalo de uma célula; a montagem V8 usa o curral composto para não apresentar uma cerca quebrada. O socket da porteira continua explícito no grafo espacial, embora a porteira desenhada faça parte do sprite composto.

O atlas local `assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.png` contém frames distintos de idle, caminhada, pastejo e bebida. A pipeline corrige as franjas amarelas dos frames de revisão e os converte para PNGs pixelizados no atlas V8. Os frames de caminhada, pastejo e bebida seguem marcados como `REVIEW`; a animação exibida é demonstrativa e não modifica o Worker científico.

Para esta primeira prova, a ponte será um asset raster próprio montado de tábuas, travessas e postes, com pivô e footprint registrados; as faces de barranco serão sprites de atlas produzidos a partir da textura de solo existente. Aseprite CLI e Blender não estão disponíveis no PATH deste ambiente; Pillow 10.2.0 está disponível e será usado na pipeline inicial. A geração seguirá parâmetros versionados e produzirá PNGs transparentes, atlas e metadados.

## Estado de aprovação

Esta é uma seleção técnica para a primeira área, ainda pendente de aprovação artística do projeto. Os arquivos originais não serão sobrescritos; a saída estilizada ficará em `assets/generated/world-v8/`.
