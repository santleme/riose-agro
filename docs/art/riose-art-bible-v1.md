# RIOSE Art Bible v1 — sistema visual pecuário

**Estado: especificação de calibração provisória. Não é um style lock nem uma aprovação de produção.** A proveniência dos arquivos de referência já foi auditada; os limites numéricos abaixo são hipóteses operacionais ainda não medidas contra esses originais. Confirmar ou revisar cada um após a calibração na escala nativa e aprovação do gate visual definido em [asset-quality-standard.md](asset-quality-standard.md). Uma cena gerada, um atlas ou um validador técnico não substitui essa aprovação.

## 1. Escopo e hierarquia das referências

O sistema cobre pecuária bovina brasileira: animais, pastagem e forragem vinculadas ao rebanho, água, manejo, construções, transporte e tecnologia pecuária. O motor de simulação é independente da arte; este documento não define nem altera arquitetura, lógica científica, colisão ou regras de negócio.

1. **Autoridade de acabamento:** [referência urbana original](../assets/pixel-art-urban-reference.png) (1257×850 RGBA). Usar para linguagem de pixel art, precisão geométrica, peso de linha, densidade, materiais, luz, escala aparente e qualidade de composição; não copiar seus edifícios nem seu layout. A [versão limpa](../assets/pixel-art-urban-reference-clean.png) é um crop auxiliar de comparação, não a fonte principal. Auditoria confirmou que o original do projeto é byte-identical à imagem-fonte em Downloads (SHA-256 correspondente).
2. **Autoridade aprovada de conteúdo e escala rural:** [fazenda brasileira completa v7](../assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png) (1525×1031 RGB), byte-identical à imagem original gerada. O brief do usuário designa explicitamente a V7 como aprovada para conteúdo, escala relativa e composição rural; consultar o [comparativo](../assets/review-farm-pixel/comparativo-referencia-urbana-fazenda-v7.png). Essa aprovação não aprova sprites individuais nem substitui o gate de estilo/produção.
3. **Exemplo inicial de conteúdo:** [amostra rural de seis elementos v3](../assets/farm-pixel-art-sample-v3.png). Foi aceita como base de direção; requer linhas mais delicadas e mais detalhe de terreno/construção.
4. **Evidência de falha:** [comparativo da cena pecuária em escala v2](../assets/review-cattle-pixel/comparativo-referencia-urbana-fazenda-escala-v2.png), [cena v2 reprovada](../assets/review-cattle-pixel/rejected/fazenda-pecuaria-escala-v2-reprovada.png) e [registro do gate](../assets/review-cattle-pixel/README.md). As candidatas v3–v6 e v1/v2 de escala não autorizam recorte, atlas ou produção em lote.

**Auditoria de fonte registrada:** os arquivos-fonte e suas dimensões estão identificados acima; a referência urbana original foi conferida contra o arquivo em Downloads por correspondência SHA-256, e a V7 corresponde byte a byte ao original gerado. Manter a grade, espessura de contorno, luz, paleta e densidade como valores provisórios até medi-los na escala nativa e concluir a prancha de calibração. Não solicitar novamente essas referências nem revalidar a aprovação da V7 para conteúdo/escala.

## 2. Identidade visual desejada

Handcrafted isometric pixel art de mapa de jogo comercial: plano de chão consistente, silhuetas em degraus, clusters intencionais, materiais legíveis, contornos escuros finos e seletivos, sombreamento gráfico de poucos tons e composição rural conectada e rica. O rural precisa compartilhar o acabamento urbano da referência A; a referência B informa o que compor e a escala relativa rural.

**Reprovar** pintura semirrealista, concept art, render 3D/mobile-game gloss, vetor geométrico simplificado, gradiente volumétrico, luz cinematográfica, textura fotográfica, ruído de pixel aleatório, contorno preto espesso uniforme, copa feita de bolotas repetidas, anti-aliasing borrado e halo colorido. Não converter uma pintura em pixel art por redução, posterização ou filtro.

## 3. Sistema geométrico e escala — valores de partida

| Parâmetro | Regra de calibração provisória | Como medir |
| --- | --- | --- |
| Projeção do chão | Isométrica 2:1: eixos horizontais projetados a ±26,565° (declive 0,5); tolerância inicial ±0,05 px/px. | Medir linhas longas de borda de tiles/estruturas; comparar os dois eixos na mesma escala nativa. |
| Módulo de chão | Subcélula lógica 64×32 px; losango-base 128×64 px (2×2 subcélulas). | A caixa visual pode ultrapassar o módulo, mas o footprint e a ancoragem ficam explícitos nos metadados. |
| Unidade de escala | Um tile-base de 128×64 é a unidade de comparação visual, não uma resolução de export obrigatória. Objetos podem ocupar múltiplas subcélulas. | Sobrepor footprints e pontos de contato, não redimensionar cada objeto até parecer caber. |
| Footprints iniciais | Boi adulto: 1×1; trator: 2×1; árvore média: 2×2; casa pequena: 3×3; sede/galpão e curral conforme montagem modular. | Valores iniciais, sujeitos a confirmação com a cena rural de referência e composição com humano/animal. |
| Orientação | Uma câmera fixa. Eixos de estrada, cerca e construção precisam compartilhar a mesma grade. Variação de orientação somente por espelhamento/rotação validado para a luz e a espécie. | Testar ao menos dois objetos conectados em cada eixo no mesmo plano. |
| Âncora | Props: ponto de contato central inferior (pés/base); objetos largos podem declarar âncora funcional distinta, sem mover o footprint. Tiles: centro do losango. | Âncora normalizada `[0..1, 0..1]`; registrar bounds de conteúdo, canvas e origem lógica. |
| Oclusão | Ordenar do ponto mais distante ao mais próximo usando o ponto de chão/footprint; altura visual não altera a área ocupada no chão. | Validar sobreposição de árvore, cerca, bovino e construção numa cena teste. |

Não ajustar projeção isoladamente para favorecer um asset. Grade e escala são **provisórias** até medir a referência-fonte e construir uma composição de calibração aprovada.

## 4. Pixel, contorno e bordas

- Desenhar/exportar a pixel grid nativa. Bordas de silhueta em degraus limpos; sem blur, anti-aliasing parcial, upscale não inteiro ou redução posterior para simular pixels.
- Limite de calibração inicial: contorno externo predominantemente com **1 px nativo**; até **2 px** apenas em pontos de separação estrutural de massa grande. Linhas internas predominantemente **1 px**, menos escuras e seletivas. Espessura deve ser medida após identificar a escala nativa efetiva da referência, não na imagem redimensionada pelo viewer.
- Usar contorno colorido profundo coerente com o material (carvão esverdeado/marrom, madeira escura, metal frio); evitar preto puro como borda universal. Não fechar toda folha, telha, pelo ou peça mecânica com linha própria.
- Reprovar qualquer linha que apareça como faixa pesada contínua ao redor da maioria dos elementos, e qualquer borda com pixels soltos que criem serrilhado/halo. Manter vazios internos em copas, telhados e estruturas quando necessários para leitura.
- Clusters devem formar planos, volume, textura ou detalhe identificável. Pixel solitário é permitido apenas como acento deliberado, não como ruído de preenchimento.

## 5. Luz, sombra e materiais

- Hipótese provisória de luz: fonte superior esquerda; sombra projetada deslocada para baixo/direita. Auditar a direção nos dois arquivos de referência antes de congelar.
- Calibração inicial de **3–5 tons chapados por material** (base, sombra e 1–3 níveis de luz/detalhe). Limites nítidos; sem gradiente contínuo, bloom, brilho especular realista, ambient occlusion extensa ou sombra difusa fotográfica.
- Sombra de contato: curta e contida na vizinhança do pé/base. Sombra projetada deve ter direção e escala coerentes em todos os assets; em tiles, não inserir sombra de objeto.
- Separar legibilidade por planos e clusters, não por mudança aleatória de saturação. Materiais recorrentes: terra/solo, pastagem, folhagem/lenho, madeira de manejo, telha/alvenaria, metal, água, pelagem e tecnologia.
- Bovinos devem ser estilizados mas reconhecíveis por silhueta e proporção: cupim Nelore, porte/categoria e chifres apenas quando pertinentes. O detalhe não pode transformar os animais em miniaturas fotográficas.

## 6. Paleta e densidade visual — medição de referência, função provisória

O relatório reproduzível [reference-measurements-v1.json](reference-measurements-v1.json), gerado por [`measure_style_references.py`](../../scripts/assets/measure_style_references.py), registra dimensões e hashes das fontes, cores RGB distintas, distribuição HSV, amostras de paleta e um probe de orientação de bordas. Na máscara de pixels neutros quase brancos, a saturação mediana medida é **0,2941** na referência urbana e **0,5059** na V7. Isso confirma, em nível global, que a V7 é consideravelmente mais saturada; ela continua sendo guia de conteúdo/escala e não a autoridade da paleta. O probe de Hough encontra 26,47% do comprimento dos segmentos urbanos na faixa de declive ±0,5, contra 10,30% na V7; é evidência de orientação recorrente, não calibração exata da grade do chão.

O relatório lista 12 chips median-cut representativos da urbana. Eles não são uma paleta completa: regiões semânticas, contornos, tons por material e escala nativa de cluster ainda exigem inspeção visual e amostras locais. As métricas não substituem a calibração nativa de um sprite.

### Extração do master urbano

Uma extração median-cut foi feita no PNG urbano original verificado, excluindo pixels neutros quase brancos com a regra documentada no relatório. Os chips abaixo são **cores representativas medidas da imagem**, não tokens finais nem mapeamentos semânticos: median-cut identifica regiões cromáticas, não determina sozinho se um chip é sombra, folhagem ou material. A fonte de estilo é a referência urbana; a paleta da V7 é mais saturada e serve para conteúdo/escala rural, não para governar cores do sistema.

| Grupo cromático representativo extraído | Chips exatos | Observação |
| --- | --- | --- |
| Chips median-cut representativos (sem rótulo semântico) | `#C6B2AA`, `#A69185`, `#6C8C7C`, `#3C373A`, `#CDC9B6`, `#736A68`, `#6C4B46`, `#996A5A`, `#476E78`, `#9DA8A3`, `#46575F`, `#8C4F45` | Valores amostrados no relatório; median-cut não determina material ou função de luz. |

### Mapeamento funcional inicial (provisório)

Este mapeamento é uma hipótese de uso dos chips extraídos, não uma nova extração nem uma regra por hex. Os grupos hex atuais em `style-tokens.json` são candidatos funcionais e podem não coincidir com os 12 chips de uma única quantização. Revisar amostras por material na referência original e em assets aprovados. Ajustes locais podem ser necessários para manter contraste, mas devem preservar as relações cromáticas medidas. Não importar automaticamente a saturação mais alta da V7.

| Papel visual candidato | Chips de partida | Critério de confirmação |
| --- | --- | --- |
| Contorno e sombra profunda | `#352A2D`, `#444347` | Contorno fino, colorido e seletivo; testar sobre fundo claro/escuro. |
| Vegetação e pasto | `#718F76`, `#949C8A` | Distinguir massas sem verde fluorescente; o segundo chip pode ser neutro de luz, não necessariamente folhagem. |
| Solo/terra | `#8E5045`, `#A36B57`; `#CAB1AD` apenas como chip claro candidato | Confirmar em regiões de chão; não tratar variação cromática como textura granulada. |
| Água/metal frio | `#486F78`, `#6194A3` | Atribuição por material permanece provisória; manter clusters chapados. |
| Alvenaria e detalhes claros | `#B8ADA5`, `#DBCABF`, `#E5DED5` | Preservar contraste e evitar grandes áreas de branco puro. |

Madeira, telha, pelagens, maquinaria e tecnologia ainda precisam de amostras próprias na referência ou aprovação por calibração; não derivar sua escala cromática de paleta agrícola saturada. Manter saturação moderada e contraste suficiente para zoom médio.

**Densidade de cena:** usar a cena urbana e a fazenda v7 como referências para contagem relativa de massas, conexões e microdetalhes. Para cada amostra, avaliar separadamente: número de setores conectados, detalhes arquitetônicos legíveis, variação de solo/pasto e áreas vazias deliberadas. Não estabelecer uma contagem universal de pixels por tile antes de auditar a escala nativa. Reprovar cena rural que seja funcional mas pareça vazia ao lado da referência; não corrigir densidade com ruído ou decoração sem função.

Níveis de detalhe para produção: **L0** silhueta/cores e ligação ao chão; **L1** leitura em zoom de mapa; **L2** detalhe de construção/equipamento visto em zoom próximo. A passagem de nível deve remover clusters inteiros por hierarquia de leitura, nunca aplicar blur ou redução automática. Definir o zoom de corte só após medir o renderizador e a referência.

## 7. Gramática de conteúdo e composição

- Cena de pecuária precisa apresentar relações de uso, não uma coleção de ícones: sede/apoio conectados à estrada; curral e corredores ligados aos piquetes; cerca e porteira com conectores; animais posicionados em pasto/água/manejo de forma legível.
- Construções devem manter telhado, beiral, vãos, portas, janelas, pilares e equipamento pequeno como detalhes hierarquizados em pixel clusters, acompanhando o acabamento da referência urbana.
- Árvores e vegetação terão silhuetas distintas por porte/espécie e irregularidade de copa; distribuir clusters e vazios, evitando repetição de bolotas.
- Solo, pasto, lama, estradas e água devem formar superfícies contínuas. Tiles declaram bordas, cantos, transições e conectores; nunca compor losangos isolados com pedestal ou emenda visível.
- Cada peça tem ponto de ancoragem, footprint, orientação, shadow policy e conectores, quando aplicável. A dimensão física da célula não é igual à altura visual do objeto.

## 8. Prompt-base reutilizável

```text
Create ONE production-ready native handcrafted isometric pixel-art asset for the RIOSE Brazilian cattle-ranch simulation.

STYLE AUTHORITY: use the supplied urban isometric pixel-art source as the dominant authority for pixel scale, delicacy of contours, cluster design, geometry, materials, palette relationships, shadow treatment and visual density. Use the supplied approved Brazilian farm V7 only for rural content, relative scale and connected ranch composition. Do not copy urban buildings or layout.
STYLE: fixed 2:1 ground projection; crisp deliberate stepped edges; selective fine dark colored outlines; controlled clusters; 3–5 hard-edged shades per material; consistent light direction after reference audit; moderately desaturated, readable colors; refined architectural/environmental microdetails with clear hierarchy. Native pixel-art construction, not a painting processed into pixels.
SUBJECT: [asset and variant]. FUNCTION: [ranch use]. MATERIALS: [materials]. FOOTPRINT: [logical cells]. ORIENTATION: [grid direction]. GROUND ANCHOR: [normalized point]. STATE: [visual state].
OUTPUT: one isolated clean PNG RGBA sprite, transparent background, no halo, no labels/frame/watermark, consistent padding and declared ground anchor. No baked terrain, neighboring object or unrelated scene. [For tiles: continuous declared connectors with transparent exterior and exact compatible edges.]
AVOID: semirealistic/painterly art, concept art, 3D/mobile-game render, gradients, soft photographic shadows, glossy highlights, blur/anti-aliasing, random micro-noise, heavy uniform black outlines, false pixelation filters, inconsistent camera/light/scale.
```

Anexar a referência urbana original como autoridade de estilo e a fazenda V7 como guia de conteúdo/escala rural. Prompt não é evidência de estilo nem critério de aprovação.

## 9. Aprovação e revisões

Estado obrigatório: `DRAFT → REVIEW → APPROVED → RELEASED`; reprovações registram motivo e caminho da evidência. A referência urbana governa estilo; a fazenda V7 aprovada governa conteúdo/escala rural. Uma nova cena precisa demonstrar que aplica a linguagem sem copiar conteúdo. Embora a proveniência das referências esteja auditada, os parâmetros desta bíblia continuam **provisórios** até a calibração mensurada e aprovação do gate; nenhum prompt, sprite, atlas ou composição candidata herda estado `APPROVED` por padrão.

