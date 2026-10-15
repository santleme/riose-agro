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

## Candidato de direção artística V1

O atlas `assets/candidates/world-v8/farm-art-atlas-v1-source.png` foi gerado usando o diorama pastel anexado à solicitação como referência de estilo e paleta, sem copiar a cena inteira. Ele contém árvore, sede, galpão, porteira, grupo de bovinos, lavoura, silo/caixa-d'água, moinho e trecho de córrego com cascata. O fundo tem alpha transparente; a pipeline corta as nove células em frames individuais e preserva o original. Lavoura, silo/caixa-d'água, moinho e córrego entram como decoração na montagem V8 para avaliar escala e encaixe. Todos os frames novos seguem como `REVIEW` até inspeção no runtime.

A cena ainda mistura esses candidatos com tiles de pixel art da prova inicial. Isso é deliberado para avaliar os objetos gerados no mapa atual; a revisão final de direção artística precisa escolher uma linguagem comum para chão, água, vegetação e construções antes de aprovar o conjunto.

## Seleção para a montagem rural

| Peça | Asset escolhido | Motivo e tratamento | Estado |
|---|---|---|---|
| Sede | `building-farmhouse-imagegen-v1` | recorte transparente com entrada legível; posicionada no platô e com socket de estrada | `REVIEW`; densidade de telhas ainda alta |
| Galpão | `building-shed-imagegen-v1` | vão aberto e máquinas visíveis; footprint de montagem maior que o registro visual original | `REVIEW`; validar escala com arte de produção |
| Cerca e porteira | `world-v8-farm-fence-wood-segment-y` e `fence-gate-wood-imagegen-v1` | módulo raster 2:1 com variantes pré-orientadas nos dois eixos, anéis de oito peças e sockets explícitos | `REVIEW`; os três anéis fecham logicamente e as porteiras apontam para células de estrada próximas; aprovação artística ainda pendente |
| Bebedouro | `water-trough-round-imagegen-v1` | silhueta reconhecível e socket de acesso animal | `REVIEW`; precisa de recorte/pixelização para igualar os tiles |
| Bovinos | `nelore-state-atlas-v1.png` | frames distintos de caminhada, pastejo e bebida pixelizados para o atlas V8 | `REVIEW`; idle continua aprovado apenas como imagem estática |

As peças de infraestrutura foram inspecionadas nos PNGs de origem e na composição atual. O novo módulo de madeira foi gerado em `farm-fence-wood-segment-v2-source.png`, mede 512×256 pixels após a pipeline, representa dois postes e três travessas e registra footprint de 1,5×0,7 células. A variante do segundo eixo é espelhada para conservar a projeção 2:1; as peças permanecem sem rotação em runtime. A cena final usa 21 segmentos e três porteiras em anéis fechados, removendo os marcadores de cerca V4 das pastagens. Testes confirmam os links dos sockets, footprints e distância de até uma célula entre cada porteira e uma via. A arte continua `REVIEW` porque o encaixe raster e a escala ainda precisam de inspeção artística.

O atlas local `assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.png` contém frames distintos de idle, caminhada, pastejo e bebida. A pipeline corrige as franjas amarelas dos frames de revisão e os converte para PNGs pixelizados no atlas V8. O scene graph contém os quatro clips, mas a fazenda final ainda não valida deslocamento contínuo nem colisão durante a animação; todos os clips de movimento seguem `REVIEW` e não modificam o Worker científico.

O contact sheet atual contém 42 entradas selecionadas em `assets/generated/world-v8/riose-v8-selected-assets-contact.png`. A seleção foi capturada em runtime em `artifacts/graphics/farm-final-v8/farm-final-v8-proof-1536x960.png`. A cena inclui 21 células alternadas com o candidato de grama natural e sockets de acesso da sede e do galpão ligados a células de rota. Esses dados melhoram a variedade local e registram intenção de conexão; ainda não provam continuidade raster das estradas nem encaixe visual dos acessos. A captura reprova a semelhança geral: há áreas de grama vazias, juntas nas estradas, água regular e estilos misturados. Os sprites são candidatos de composição, não arte final aprovada.

O manifesto `assets/generated/world-v8/terrain-atlas-v8.json` agora registra, por frame, revisão, fonte, arquivo de origem, transformação, referências consultadas e revisão visual pendente. Os registros tornam a proveniência auditável, mas não aprovam a arte. Parte da pipeline ainda quantiza ou redimensiona fontes; isso permanece um risco frente ao padrão de asset e exige revisão/substituição na fonte antes de qualquer `APPROVED`/`RELEASED`.

Foi gerada uma folha adicional com seis módulos de água em `assets/candidates/world-v8/farm-stream-modules-v1-source.png`; a pipeline cria `farm-stream-modules-atlas-v1.png` e seus seis PNGs individuais. Os módulos foram retirados da cena final: a inspeção no navegador mostrou recortes de terreno isolados sobre a água, sem continuidade suficiente para a direção do rio. A cena mantém o leito navegável em células e a arte de queda d'água já selecionada até uma composição modular de margem passar pela revisão visual. Uma variação de água estilizada por quantização também foi descartada após teste por produzir emendas escuras ao repetir. Esses experimentos ficam como evidência de seleção, não como assets aprovados.

Para esta primeira prova, a ponte será um asset raster próprio montado de tábuas, travessas e postes, com pivô e footprint registrados; as faces de barranco serão sprites de atlas produzidos a partir da textura de solo existente. Aseprite CLI e Blender não estão disponíveis no PATH deste ambiente; Pillow 10.2.0 está disponível e será usado na pipeline inicial. A geração seguirá parâmetros versionados e produzirá PNGs transparentes, atlas e metadados.

## Estado de aprovação

Esta é uma seleção técnica para a primeira área, ainda pendente de aprovação artística do projeto. Os arquivos originais não serão sobrescritos; a saída estilizada ficará em `assets/generated/world-v8/`.
