# Riose livestock pilot v1 — revisão do pacote

**Resultado do gate: NÃO APROVADO para style lock ou promoção.** Os arquivos são candidatos de revisão, e a cena serve como prova de composição com fontes reais. A direção está na família certa de pixel art isométrica, mas o acabamento ainda não corresponde à referência urbana com precisão suficiente.

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
| Nelore | adulto parado legado, caminhada, pastejo, bezerro | `revise` — silhueta e poses legíveis; anatomia sombreada e contorno muito pesados | PNG RGBA; revisar pixels de alpha parcial e manter os estados como desenhos distintos |
| Manejo | cerca reta, porteira, bebedouro, cocho, curral | `revise` — material consistente entre candidatos, mas linha/grão grossos | conexões da cerca/porteira não validadas; curral não é kit modular |
| Pastagem | tile base | `revise` — dimensão lógica existe | teste de borda já registrado no legado; densidade/cluster da grama diverge do master |
| Tecnologia | brinco conceitual, estação leitora ilustrativa | `revise` — contorno e volume pesados | não indica leitura, alcance, localização ou certificação; brinco é conceito interno |

Todos os 12 itens seguem `REVIEW`; nenhum está `APPROVED` ou `RELEASED`. Assets de legado têm prompt, modelo e licença desconhecidos e não podem ser publicados até conferir procedência. Os seis novos arquivos têm origem de geração registrada, mas a versão do modelo não fica exposta no registro. O validador encontrou alpha fracionário em 11 dos 12 arquivos (7,1%–34,8% dos pixels por arquivo); em 9 dos 12, o alpha máximo é 254 e há zero pixels plenamente opacos. Isso não prova halo, mas reprova a transparência dura esperada e exige revisão de borda/RGB sob alpha zero. Presença de canal alpha não comprova recorte limpo.

## Gate técnico automatizado

`python3 scripts/assets/validate_library.py` valida o schema semântico, contenção dos caminhos, leitura PNG, dimensões declaradas, hashes separados da fonte e do export, duplicatas exatas, limites básicos de tamanho/resolução, classificação de perfil, política de alpha e padding. Resultado atual: **12 itens, zero erros estruturais/de integridade, 39 avisos**. Os avisos registram perfil ICC ausente/não verificado, alpha parcial nas sprites, padding insuficiente em cinco sprites e RGB diverso sob alpha zero como heurística de possível bleed; esta última não detecta nem prova halo. O tile de pastagem aceita alpha binário nas bordas, mas isso não substitui o teste visual de continuidade.

`python3 scripts/assets/validate_library.py --promotion-gate` falha para os 12 itens: nenhum atende simultaneamente status, gates artístico/técnico e direitos documentados. Não existe ainda um graphics manifest de atlas, então bounds, extrusão e bleed em atlas permanecem sem validação automatizada. A inspeção visual e aprovação do estilo continuam sendo gates humanos obrigatórios.

## Nova calibração de arte — seis sprites e reteste da casa

Gerei seis PNGs independentes (casa, árvore, trator, Nelore, estrada e pastagem) com a cidade como referência dominante e V7 apenas como conteúdo/escala. **Todos foram reprovados**: contornos uniformes pesados, volume suave/renderizado e clusters grandes ou repetitivos; a estrada e o pasto não demonstram conectividade. A inspeção técnica encontrou 30,0%–43,0% de pixels com alpha parcial; cinco arquivos não têm nenhum pixel totalmente opaco e o trator tem só 399. Há vinheta/halo incorporado, portanto não são recortes de produção.

Depois gerei uma única casa usando apenas a referência urbana e especificações mais estritas de pixel nativo, outline de 1 px e 3–4 tons. Também foi reprovada: telhas repetitivas em clusters grandes, linha mais pesada, microdetalhe inferior ao master e vinheta preservada; RGBA tem 620.715 pixels parciais e zero pixels totalmente opacos. A revisão paralela de direção de arte confirmou os sete vereditos. A prancha comparativa está em [art-calibration-v2/comparison-sheet.png](../art-calibration-v2/comparison-sheet.png), com PNGs, hashes, prompts e motivos em [art-calibration-v2/rejected](../art-calibration-v2/rejected/README.md).

## Experimentos de refinamento rejeitados

Três novas tentativas de Nelore parado foram geradas com a referência urbana dominante. A terceira instruía explicitamente alpha binário (0/255). Nas três, a ferramenta entregou PNG 1536×1024 sem nenhum pixel com alpha 255: 496.594, 340.356 e 449.565 pixels parcialmente transparentes, respectivamente. No conjunto inicial, 9 dos 12 candidatos também terminam em alpha máximo 254 sem pixels opacos. A comparação em quadriculado não mostra halo colorido amplo, mas as faixas de volume e o contorno escuro contínuo continuam fora do padrão. Evidências e linhagem estão em [rejected/README.md](rejected/README.md). Nenhuma tentativa foi promovida ao manifesto.

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
