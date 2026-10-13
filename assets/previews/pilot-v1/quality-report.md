# Riose livestock pilot v1 — revisão do pacote

**Decisão atual — 2026-10-13:** o usuário aprovou visualmente os 12 sprites do piloto e a cena composta. O gate artístico da Fase B **passou para este piloto**. Isso não constitui style lock global, liberação para produção ou autorização de publicação/comercialização.

**Checkpoint atual:** o piloto está indexado em `assets/pilots/cattle-ranch-v1/pilot.json`; a prancha está em `assets/previews/pilot-v3/contact-sheet.png` e a comparação lado a lado em `assets/previews/pilot-v3/approval-comparison.png`. A cena atual combina 82 placements e 6 overlays; o overlay V2 de solo compactado tem aprovação separada. Todos os 12 itens têm `art: pass` e `technical: pass`, e estão `APPROVED`; nenhum está `RELEASED`. Os quatro PNGs antes pendentes receberam ICC sRGB com valores de pixel preservados e passaram pela validação técnica. A pastagem V4 está aprovada apenas como placa única de terreno: o mosaico 3×3 ainda mostra junções tonais, então ela não pode ser auto-repetida. A cena composta usa a placa unificada V2. O manifesto completo ainda não passa no promotion gate. Os registros abaixo descrevem etapas históricas e não substituem esse checkpoint atualizado.


## Evidência visual

- [Comparação lado a lado: referência urbana, fazenda V7 e cena candidata](reference-comparison.png)
- [Cena composta a partir de sprites PNG reais](scene-candidate.png)
- [Prancha dos 12 itens do piloto](contact-sheet-drafts.png)

A cena liga sede, açude, cerca/porteira, curral, bebedouros, galpão, trator, gado e leitor. O brinco aparece num inset de inspeção, pois sua escala funcional é um overlay pequeno no animal. A cena ainda é estática, de revisão, e não está ligada ao renderizador. O compositor redimensiona os PNGs para demonstrar layout e escala lógica; por isso, esta imagem não prova densidade nativa nem qualidade de borda. Inspecionar os PNGs-fonte em resolução nativa e nunca reutilizar pixels do preview como arte.

## Diferenças contra a autoridade urbana

1. **Contorno e pixel scale:** vários sprites usam linhas externas visivelmente grossas e degraus grandes; a referência urbana tem contornos mais delicados e escala de cluster mais fina.
2. **Volume:** bovinos, estruturas e alguns props mantêm faixas de sombra suaves/volumétricas. Precisam de planos chapados mais curtos e separação gráfica mais precisa.
3. **Densidade e coerência:** a infraestrutura central já se lê como fazenda, mas o pasto aberto repete marcas pequenas, as conexões de estrada são segmentos soltos e o conjunto ainda tem vazios grandes. A cena V7 é mais densa e conectada.
4. **Módulos:** a porteira e o curral ainda não provam conectores funcionais com painéis e tiles adjacentes. O arquivo de curral existente é uma composição de pen, não um kit modular.
5. **Microdetalhe:** sede e galpão são legíveis, porém os vãos, beirais, ferragens e equipamentos pequenos não têm a hierarquia fina da referência urbana.

## Estado por família

| Família | Itens presentes | Revisão artística | Técnica / limite atual |
|---|---|---|---|
| Nelore | adulto parado legado, caminhada v2 editada, pastejo, bezerro | adulto aprovado reutilizado na cena; caminhada v2 com arte pendente; demais poses seguem `revise` | caminhada v2 tem alpha binário; revisão técnica completa aguarda perfil de cor; os outros PNGs ainda têm alpha parcial |
| Manejo | cerca reta, porteira, bebedouro, cocho, curral | `revise` — material consistente entre candidatos, mas linha/grão grossos | conexões da cerca/porteira não validadas; curral não é kit modular |
| Pastagem | tile base | `revise` — dimensão lógica existe | teste de borda já registrado no legado; densidade/cluster da grama diverge do master |
| Tecnologia | brinco conceitual, estação leitora ilustrativa | `revise` — contorno e volume pesados | não indica leitura, alcance, localização ou certificação; brinco é conceito interno |

Todos os 12 itens seguem `REVIEW`; nenhum está `APPROVED` ou `RELEASED`. Assets de legado têm prompt, modelo e licença desconhecidos e não podem ser publicados até conferir procedência. Os seis novos arquivos têm origem de geração registrada, mas a versão do modelo não fica exposta no registro. Na seleção atual de 12, 8 PNGs ainda têm alpha parcial; em 6/12 não há pixels plenamente opacos. As três poses editadas e o tile de pastagem têm alpha binário. As edições seguem `pending` na revisão técnica porque os perfis de cor não estão classificados. Isso não prova halo, mas reprova a transparência dura esperada e exige revisão de borda/RGB sob alpha zero. Presença de canal alpha não comprova recorte limpo.

## Gate técnico automatizado

`python3 scripts/assets/validate_library.py` valida o schema semântico, contenção dos caminhos, leitura PNG, dimensões declaradas, hashes separados da fonte e do export, duplicatas exatas, limites básicos de tamanho/resolução, classificação de perfil, política de alpha e padding. Resultado atual no manifesto semântico completo: **48 itens, zero erros estruturais/de integridade e 67 avisos**. Os avisos incluem perfil ICC ausente/não verificado, alpha parcial, padding insuficiente e RGB diverso sob alpha zero como heurística de possível bleed; essa heurística não detecta nem prova halo. O contato da biblioteca completa é regenerável sem corte usando `python3 scripts/assets/build_contact_sheet.py`; a prancha do piloto usa `--ids` para selecionar os 12 IDs.

`python3 scripts/assets/validate_library.py --promotion-gate` continua falhando para o manifesto completo: 47/47 registros não são promovíveis; nenhum conjunto satisfaz simultaneamente status, gates artístico/técnico e direitos documentados. Não existe ainda um graphics manifest de atlas, então bounds, extrusão e bleed em atlas permanecem sem validação automatizada. A inspeção visual e aprovação do estilo continuam sendo gates humanos obrigatórios.

## Nova calibração de arte — seis sprites e reteste da casa

Gerei seis PNGs independentes (casa, árvore, trator, Nelore, estrada e pastagem) com a cidade como referência dominante e V7 apenas como conteúdo/escala. **Todos foram reprovados**: contornos uniformes pesados, volume suave/renderizado e clusters grandes ou repetitivos; a estrada e o pasto não demonstram conectividade. A inspeção técnica encontrou 30,0%–43,0% de pixels com alpha parcial; cinco arquivos não têm nenhum pixel totalmente opaco e o trator tem só 399. Há vinheta/halo incorporado, portanto não são recortes de produção.

Depois gerei uma única casa usando apenas a referência urbana e especificações mais estritas de pixel nativo, outline de 1 px e 3–4 tons. Também foi reprovada: telhas repetitivas em clusters grandes, linha mais pesada, microdetalhe inferior ao master e vinheta preservada; RGBA tem 620.715 pixels parciais e zero pixels totalmente opacos. A revisão paralela de direção de arte confirmou os sete vereditos. A prancha comparativa está em [art-calibration-v2/comparison-sheet.png](../art-calibration-v2/comparison-sheet.png), com PNGs, hashes, prompts e motivos em [art-calibration-v2/rejected](../art-calibration-v2/rejected/README.md).

## Experimentos de refinamento rejeitados

Três novas tentativas de Nelore parado foram geradas com a referência urbana dominante. A terceira instruía explicitamente alpha binário (0/255). Nas três, a ferramenta entregou PNG 1536×1024 sem nenhum pixel com alpha 255: 496.594, 340.356 e 449.565 pixels parcialmente transparentes, respectivamente. No conjunto inicial, 9 dos 12 candidatos também terminam em alpha máximo 254 sem pixels opacos. A comparação em quadriculado não mostra halo colorido amplo, mas as faixas de volume e o contorno escuro contínuo continuam fora do padrão. Evidências e linhagem estão em [rejected/README.md](rejected/README.md). Nenhuma tentativa foi promovida ao manifesto.

## Refinamento de caminhada — 2026-10-12

Duas gerações do zero para walking repetiram halo parcialmente opaco e não produziram uma passada distinta; ambas foram rejeitadas. Edições do Nelore aprovado geraram candidatos de walking, grazing e calf. O alpha dos três foi normalizado em 128, sem alterar RGB visível; a inspeção em matte de alto contraste mostra recortes limpos. Os três estão no manifesto como candidatos `pending` para revisão artística e classificação do perfil de cor. A leitura juvenil do calf ainda precisa ser confirmada em escala de cena. Os prompts estão em [pilot-v1-generation-prompts.md](../../prompts/pilot-v1-generation-prompts.md); a evidência das tentativas rejeitadas de walking está em [rejected/nelore-walking-refinement-2026-10-12](rejected/nelore-walking-refinement-2026-10-12/README.md).

A cena foi recomposta com o Nelore adulto aprovado para repouso e os novos candidatos de caminhada e pastejo; o calf v2 está no contato do piloto e aguarda revisão de escala. Os demais elementos continuam em revisão; a Fase B não está aprovada.

## Próxima revisão de arte

Suspender novos lotes com este gerador para os sprites do piloto: dois métodos de referência e prompts mais restritos mantiveram o mesmo problema de arte e alpha. A próxima amostra precisa vir de autoria nativa em ferramenta que permita controlar a grade de pixels e alpha binário, começando pela casa e revisando contorno/densidade em relação à referência urbana original; não retocar estas pinturas com redução, posterização ou filtros. Só depois de uma amostra passar em resolução nativa retomar o conjunto de seis, compor a cena com esses mesmos arquivos e abrir a produção das outras seis peças do piloto.

## Auditoria paralela de fontes de autoria e sprites existentes

Três revisões independentes foram usadas para continuar a investigação: direção de arte, ferramentas locais de autoria e candidatos individuais da biblioteca. A conclusão comum foi **não promover nenhum sprite existente**.

- Nenhum editor nativo de pixel art está disponível no ambiente pesquisado (Aseprite, LibreSprite, Krita, GIMP, Pixelorama, Pinta, mtPaint e LazPaint não encontrados). Pillow/OpenCV e o script `docs/assets/kit-base-v1/author_native_tiles.py` permitem desenhar tiles de chão em grid, mas não são uma fonte apropriada para substituir a arte detalhada de animais, edifícios e máquinas.
- Os tiles de terreno e plantio de 128×64 têm alpha binário e repetição técnica 3×3 documentada; continuam simples/vazios e não atingem a escala de clusters, hierarquia de detalhe e densidade da referência urbana. Servem como referência técnica, não como aprovação visual.
- Os sprites antigos de bovino, casa, árvore, trator e infraestrutura têm mais detalhe, mas usam contorno mais pesado e sombreado volumétrico; versões `alpha-cleaned` apenas limiarizam transparência e não provam recorte limpo. Parte deles também tem procedência/licença incompleta.
- Os três PNGs recentes de Nelore e as seis imagens de calibração mais o reteste da casa falham visualmente e no alpha. Repetir a mesma geração por prompt não é uma rota de correção; preservar os originais como `REJECTED`.

**Próxima amostra autorizada pelo gate:** um único sprite rural desenhado em grid nativo, começando pela casa ou pelo Nelore, com arquivo-fonte editável, escala/âncora registradas e PNG exportado com alpha binário. Comparar em resolução nativa com a referência urbana e validar a borda antes de produzir outras famílias. Caso essa autoria não possa ocorrer no ambiente, deixar a calibração pendente e não avançar para lote, atlas ou promoção.

### Calibração adicional por edição de imagem

Uma casa candidata foi editada diretamente com a referência urbana como autoridade de estilo, preservando o tema e o footprint rural. Essa rota produziu silhueta legível, mas manteve contorno grosso, telhas repetitivas e volume sombreado mais cartunesco que o master. O alpha original contém 841.820 pixels parciais e apenas 513 totalmente opacos; a imagem toca a borda esquerda do canvas. Foi **reprovada** e preservada em [art-calibration-v3/rejected](../art-calibration-v3/rejected/README.md). Isso confirma que o teste de edição também não atende à produção; nenhuma limpeza por threshold foi aplicada.

### Segunda ferramenta de geração — tentativa sem resultado

Para variar a rota, a referência urbana e a fazenda V7 foram carregadas como imagens de referência em uma segunda ferramenta de geração. O serviço aceitou os dois arquivos, mas a criação da imagem falhou com `quota_exceeded`; portanto não há novo resultado visual para avaliar ou integrar. Os IDs de mídia retornados foram `MAHXw4nhH4U` (referência de estilo urbana) e `MAHXw1FwQnk` (referência de conteúdo/escala rural). Se a cota voltar, essa ferramenta pode retomar a tentativa sem reenviar os arquivos. A geração continua pendente e nenhum ativo foi aprovado.

### Casa-base V2 — geração direta com referência urbana

Uma nova casa foi gerada diretamente pelo ImageGen, usando a referência urbana para a linguagem visual. A fonte está em `assets/source/infrastructure/house-reference-v1-raw.png`; a exportação com alpha binário em `assets/candidates/infrastructure/building-farmhouse-reference-imagegen-v2.png`. O alpha foi limiarizado em 128 e RGB oculto zerado; a inspeção em fundo magenta/ciano não mostrou halo amplo. O bbox útil tem margem transparente em todos os lados; o perfil ICC não está embutido, então a revisão técnica permanece `pending`. A comparação completa está em [pilot-v2/farmhouse-comparison.png](../pilot-v2/farmhouse-comparison.png), e a leitura de contorno/clusters em escala aproximada de uso está em [pilot-v2/farmhouse-scale-comparison.png](../pilot-v2/farmhouse-scale-comparison.png). Uma tentativa alternativa com vinheta e alpha sem pixels opacos foi preservada em [pilot-v2/rejected](../pilot-v2/rejected/).

A casa V2 é uma nova **candidata**, não uma aprovação: a geometria e os detalhes combinam com a cena rural V7, mas o peso do contorno e o volume ainda precisam passar por revisão de arte. Ela foi registrada como item 48 do manifesto (`building.farmhouse.imagegen.v2`) e usada na composição V2. O gate da Fase A continua aberto; não ampliar o lote piloto com base nesta candidata.

### Calibração V2 — retorno do usuário em 2026-10-12

O usuário aprovou explicitamente a casa V2 e sua direção visual com “gostei!”. A aprovação foi registrada em `building.farmhouse.imagegen.v2` e se limita à arte/direção dessa casa; não aprova automaticamente os outros sprites nem fecha o style lock.

A amostra de seis elementos usa a casa aprovada, o Nelore adulto já aprovado e candidatos de árvore, trator, estrada e pastagem. A cena e a comparação com a referência urbana estão em `assets/previews/calibration-v2/six-asset-scene-candidate.png` e `assets/previews/calibration-v2/urban-side-by-side.png`. A árvore e o trator parecem próximos da linguagem aprovada. Os tiles de estrada e pastagem ainda mostram intervalos visíveis quando repetidos em 3×3 (`road-repeat-3x3.png` e `pasture-repeat-3x3.png`); ficam em revisão e não devem entrar em produção até corrigir conectividade e escala. A cena é uma prova de composição, não uma cena de runtime nem aprovação dos quatro candidatos.

O manifesto agora contém 53 registros. `python3 scripts/assets/validate_library.py` informa **0 erros estruturais/de integridade e 72 avisos**. Os avisos incluem perfis ICC não verificados para novos PNGs e questões pré-existentes de alpha nos assets legados; não são promovidos por este resultado. Os quatro candidatos novos seguem em `REVIEW`; a casa V2 tem revisão artística `pass` por decisão direta do usuário, enquanto sua revisão técnica continua pendente. O novo terreno premium V1 também segue em `REVIEW`, com arte e repetição ainda sem aprovação.


### Refinamento do terreno — feedback de 2026-10-12

A partir do feedback de que o pasto estava genérico, repetitivo e ruidoso, foi gerada uma nova base de pastagem com superfície mais calma, grupos maiores de grama, menos flores e paleta oliva/sálvia controlada. A comparação antes/depois está em `assets/previews/calibration-v2/pasture-ground-v2-v4.png`; a nova versão integrada à cena de referência está em `assets/previews/calibration-v2/six-asset-scene-premium-ground-v1.png`. O export está em `assets/candidates/calibration-v3/pasture-ground-premium-v1.png`, com a origem em `assets/source/calibration-v3/pasture-ground-refined-v4-raw.png` e prompt em `assets/prompts/pasture-ground-premium-v1.md`.

O export possui alpha binário (0/255), recorte transparente limpo com 2 px de padding e losango 2:1. A comparação visual confirma menos densidade e mais respiro. O teste 3×3 ainda mostra linhas de junção entre cópias do tile (`assets/previews/calibration-v2/pasture-premium-v1-repeat-3x3.png`), então o asset não foi promovido nem conectado ao runtime. O perfil ICC continua não verificado.


### Família de terrenos V1 — atualização

Foram registrados candidatos coordenados para pasto base, estrada de terra, pasto pisoteado/seco e solo cultivado. A estrada tem uma versão de tile completo que foi marcada `revise` por criar uma borda dura ao sobrepor a base; a composição usa agora a faixa transparente `terrain.road.dirt-overlay.imagegen.v1`, com margem irregular de grama e terra. O preview da família é `assets/previews/calibration-v2/terrain-family-v1-candidates.png`; a cena e a comparação urbana estão em `assets/previews/calibration-v2/terrain-family-v1-scene.png` e `assets/previews/calibration-v2/terrain-family-v1-urban-comparison.png`.

A ordem proposta está em `assets/manifests/terrain-family.v1.json`: base contínua, variantes alternativas de superfície, faixa de transição transparente e grounding sob sprites usando estrada/solo usado. A estrada fica sob bovino e trator na prova de cena; a casa mantém sua base de pedra e a árvore seus próprios apoios de raiz. Não há ainda integração ao runtime. Todos os novos terrenos permanecem `REVIEW`; a validação semântica confirma integridade de arquivo, não qualidade ou aprovação de arte. Estado atual: 57 registros, zero erros estruturais/de integridade e 76 avisos (incluindo ICC não verificado).


### Família unificada de terrenos V2 — 2026-10-12

O feedback identificou que a estrada marrom e patches antigos ainda pareciam pertencer a outra direção de arte. O V2 passa a compor o terreno como uma família de camadas de imagem: base de pasto, overlay de estrada com borda irregular, manchas localizadas de terra compactada, pasto seco, lama e solo cultivado. Os antigos tiles integrais de solo seco/lama/solo cultivado e o worn V1 permanecem no manifesto por procedência, mas ficam explicitamente excluídos da composição V2. O contrato renderer-neutral está em `assets/manifests/terrain-family.v2.json`; prompts, fontes e exports estão registrados no manifesto semântico. O schema de asset agora admite `scaleHints` opcionais: tamanho de renderização preferencial e unidade projetada de subcélula 64×32 (tile-base 128×64 = 2×2 subcélulas). O pasto de base usa 9×9 subcélulas, a faixa 4×4 e os patches 2×2; o compositor de revisão respeita essas proporções.

A amostra com casa, árvore, trator e Nelore usa apenas sprites PNG reais sobre o pasto refinado, com estrada em alpha e patches de uso abaixo dos pontos de contato: `assets/previews/calibration-v2/terrain-family-v2-scene.png`. A cena de piloto com curral, sede, galpão, açude, cochos, bovinos e estação de monitoramento está em `assets/previews/pilot-v2/ranch-pilot-terrain-v2.png`; o comparativo com as duas autoridades visuais está em `assets/previews/pilot-v2/visual-gate-comparison.png`. A comparação de composição V1/V2 está em `assets/previews/calibration-v2/terrain-family-v2-comparison.png`; a prancha dos seis materiais está em `assets/previews/calibration-v2/terrain-family-v2-candidates.png`. A prancha de gate com as autoridades visual urbana e rural está em `assets/previews/calibration-v2/terrain-family-v2-style-gate.png`.

Os cinco novos exports mantêm alpha binário 0/255 e remoção de componentes desconectados; a inspeção de alpha não prova aprovação visual. `python3 scripts/assets/validate_library.py` encontrou **62 assets, zero erros de estrutura/integridade e 81 avisos**; os novos terrenos continuam com perfil ICC não verificado. O terreno base ainda apresenta junções no reteste 3×3 previamente registrado. `python3 scripts/assets/validate_library.py --promotion-gate` continua falhando para 62/62 assets, por falta de aprovação artística/técnica e documentação de direitos de release; nenhum asset foi promovido nesta continuação. A família V2 permanece em `REVIEW`: a faixa ainda precisa de validação de conectores/repetição e as áreas de estado precisam de revisão de escala/posicionamento na composição. A cena V2 melhora a conexão entre sede, manejo, água e apoio, mas ainda tem densidade e microdetalhe inferiores às referências; a Fase A segue sem style lock e nenhuma geração nova foi promovida. Não há integração com o runtime nesta etapa.


### Terrain family V3 (2026-10-12)

- Added a new image-generated pasture base candidate V3 and an edge-cleanup candidate V4; originals are preserved.
- Added renderer-neutral terrain composition contract V3 and a pilot scene applying image-authored road, compacted, dry, and mud overlays with grounding below props.
- Comparison preview: `assets/previews/pilot-v2/terrain-family-v3-comparison.png`.
- Repeat validation: V4 still shows diagonal tonal joins in a 3x3 grid. It is retained as a single-use diorama ground plate candidate and is not approved as a repeating tile.
- Art review remains pending; no terrain candidate has been promoted.
