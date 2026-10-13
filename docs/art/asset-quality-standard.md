# RIOSE Asset Quality Standard

**Status: gates e limites de triagem provisórios.** Use em conjunto com [RIOSE Art Bible v1](riose-art-bible-v1.md). O relatório [reference-measurements-v1.json](reference-measurements-v1.json), reproduzido por [`measure_style_references.py`](../../scripts/assets/measure_style_references.py), documenta dimensões, paleta representativa, distribuição HSV e um probe de eixos das fontes. Essas medições não identificam contorno, grid nativo ou materiais por si só; os gates artísticos e limites ainda dependem da calibração visual do sprite.

## 1. Estados e autoridade

Todo asset usa um estado: `DRAFT`, `REVIEW`, `APPROVED`, `RELEASED` ou `REJECTED`. `APPROVED` exige revisão humana visual registrada; passar script, aparecer em cena ou ter transparência correta não basta. `RELEASED` é uma versão aprovada e publicada na biblioteca/atlas.

Referências auditadas: [urbana original — gramática de composição](../assets/pixel-art-urban-reference.png) (1257×850 RGBA; SHA-256 corresponde ao arquivo em Downloads). [Crop limpo para comparação](../assets/pixel-art-urban-reference-clean.png). [Fazenda brasileira completa V7 — referência aprovada de conteúdo/escala rural](../assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png) (1525×1031 RGB; byte-idêntica ao original gerado), conforme designação explícita do brief do usuário; [comparativo V7](../assets/review-farm-pixel/comparativo-referencia-urbana-fazenda-v7.png). A aprovação da V7 aplica-se à cena como guia rural, não a sprites individuais.

Falhas que devem ser mantidas no conjunto de comparação: [fazenda pecuária escala v2 — comparação](../assets/review-cattle-pixel/comparativo-referencia-urbana-fazenda-escala-v2.png) e [imagem reprovada](../assets/review-cattle-pixel/rejected/fazenda-pecuaria-escala-v2-reprovada.png). Também consultar o [histórico do gate](../assets/review-cattle-pixel/README.md). As imagens reprovadas são evidência do que evitar; não usar como style target ou fonte de sprites.

## 2. Checks automáticos antes da revisão visual

O script deve falhar em qualquer condição mandatória abaixo e relatar o ID, o arquivo, o valor observado e o limite. Estes limites de arquivo são defaults de triagem; dimensões úteis dependem da classe e devem vir do manifesto.

| Check | Aceitação técnica inicial | Falha |
| --- | --- | --- |
| Arquivo/ID | PNG válido; ID único; schema válido; dimensões e bounds declarados; arquivo abre sem erro. | ID duplicado, PNG corrompido, metadata ausente ou divergente. |
| Modo/cor | PNG RGBA para sprite isolado; perfil sRGB incorporado ou normalizado com transformação registrada. | RGB opaco quando transparência é exigida, perfil desconhecido sem registro, paleta/cores alteradas silenciosamente. |
| Alpha | Pixel 0% fora do sprite; borda dura sem alpha fracionário inesperado. Como triagem para pixel art opaca: pixels de borda devem ser alpha 0 ou 255. Exceção deve ser documentada para efeito/translucidez funcional. | Halo colorido sobre matte branco, preto ou quadriculado; alpha fracionário periférico não intencional. |
| RGB transparente | RGB sob alpha 0 limpo/estendido a partir da cor interna mais próxima, sem matte verde/vermelho/preto introduzido. | Fringe observável no preview a 100%/50% em matte contrastante. |
| Padding/trim | Bounds de conteúdo, canvas e padding anotados; padding >= 2 px nativos ao redor de silhuetas duras, salvo tile/conector. | Recorte corta pixels, âncora ou sombra; padding inconsistente sem motivo. |
| Resolução/escala | Sprite produzido na resolução nativa planejada; atlas não redimensiona. Se ampliação de preview, escala inteira nearest-neighbor. | Resize fracionário, interpolação suave ou redução de imagem para fabricar pixel art. |
| Perfil/dimensões | `sourceSize`, `trim`, `footprint`, `anchor`, orientação, categoria e revisão no manifesto; dimensão positiva e coerente com classe. | Campo incoerente/ausente ou atlas que perde posição original. |
| Duplicatas | Hash de arquivo e comparação perceptual detectam cópias; variações iguais precisam de justificativa/alias. | Duplicata não documentada ou variante sem diferença útil. |
| Atlas | IDs, frames, bounds, padding e extrusão compatíveis; sem bleed entre vizinhos. Extrusão técnica inicial 2–4 px, sem mudar arte visível. | Frame errado, pixels vizinhos no recorte, atlas sobrescreve alpha/cor ou escala do sprite. |
| Tiles/conectores | Declarar conectores e testar mosaico mínimo 3×3 para cada combinação/rotação permitida. Comparar seams nos quatro lados; estrada/cerca alinhadas aos pontos de conexão declarados. | Linha de emenda, diferença de altura, buraco, degrau de borda, conector deslocado ou rotação que contradiz luz. |

Não remover ruído, quantizar paleta, redesenhar clusters ou alterar alfa automaticamente como forma de aprovação. Correção de matte/alpha pode ser uma operação separada, não destrutiva, registrada e revista antes/depois.

## 3. Rubrica visual — gate obrigatório

Revisar em quatro contextos: pixels nativos a 100%, zoom de mapa, zoom próximo e sobre mattes branco/carvão/quadriculado. Comparar sprites com a família Riose aprovada e avaliar cenas lado a lado com a referência urbana para composição, a fazenda V7 para conteúdo/escala e Riose V2 para terreno/grounding. Nenhuma referência deve ser usada fora do seu papel.

Pontuar cada dimensão de 0 a 2: `0 = reprovado`; `1 = revisar`; `2 = atende à referência`. Critérios abaixo são observáveis, não opinião genérica.

| Dimensão | 2 — atende | 1 — revisar | 0 — rejeitar |
| --- | --- | --- | --- |
| Pixel art nativa | Bordas são clusters/escadas desenhados; planos chapados; nenhuma interpolação/efeito de pintura detectável. | Alguns trechos suavizados ou textura demasiado pictórica, mas localizada. | Parece pintura, concept art, render ou pixelização por filtro. |
| Projeção/geometria | Chão acompanha projeção 2:1 dentro da tolerância provisória ±0,05 declive; volumes compartilham os mesmos eixos. | Uma peça pouco clara ou medida fora da tolerância, corrigível sem redesenhar o conjunto. | Câmara/ângulos incompatíveis, base inclinada ou perspectiva 3D divergente. |
| Contorno | Linha nativa predominantemente 1 px, seletiva; até 2 px apenas em separações justificadas; delicada ao lado da referência. | Linha pesada em regiões localizadas ou linha interna excessiva. | Contorno preto grosso/uniforme, halos ou silhueta engolida pela linha. |
| Clusters/detalhe | Clusters intencionais; detalhes pequenos arquitetônicos/ambientais legíveis sem micro-ruído; silhueta continua clara. | Detalhe insuficiente ou um pouco granular; requer ajuste localizado. | Ruído, textura orgânica/pintada, detalhe borrado ou simplificação/cartoon visivelmente abaixo da referência. |
| Luz/sombra | Uma luz comum; 3–5 tons chapados por material como limite inicial; sombra gráfica curta e nítida. | Um valor ou sombra inconsistente sem alterar a leitura. | Gradientes, luz volumétrica realista, sombra difusa ou direções misturadas. |
| Paleta/material | Família moderadamente dessaturada; material distingue-se por clusters/valores; contraste semelhante à referência. Chips extraídos e mapeamento funcional devem ser registrados separadamente. | Uma família saturada/desbotada ou material pouco separável. | Neon, brilho de render, texturas fotorrealistas ou contraste fora da identidade. |
| Escala/âncora | Footprint, escala relativa, ponto de contato e oclusão claros; objeto encaixa na composição de referência. | Anchor/footprint precisa de pequena revisão. | Escala contradiz humano/animal/estrutura, âncora flutua ou footprint é implausível. |
| Conteúdo/contexto BR | Forma reconhecível e função rural coerente; raça/equipamento/arquitetura representados sem erro visual crítico. | Contexto genérico, pequeno detalhe regional/funcional a esclarecer. | Identidade ou função errada; elemento incompatível com pecuária/uso solicitado. |
| Transparência/integração | Recorte limpo em três mattes; sem piso/sombra alheia embutidos; conectores/padding utilizáveis. | Cleanup localizado e documentável. | Fundo/halo, tile isolado, corte defeituoso ou arte não utilizável em cena. |

### Regra de aprovação

- Asset individual: nenhuma nota `0`; pontuação mínima `16/18`; dimensões de pixel art, projeção, contorno, luz, transparência e escala precisam receber `2` (para categoria em que dimensão não se aplica, marcar N/A com justificativa e manter média >= 1,8). Revisores registram nome/data, referência/versão usada, resolução observada e decisão.
- Cena de calibração: mesma régua, sem nota `0`; mínimo `16/18`; prova lado a lado deve manter o mesmo universo artístico, riqueza arquitetônica/terreno e escala conectada. A aprovação de uma cena não aprova sprites embutidos.
- Os thresholds são **provisórios** e só viram norma após calibração mensurada contra as referências auditadas e assinatura do gate visual. Uma exceção não pode dispensar o teste de identidade visual.
- Resultado abaixo do limiar: `REJECTED` com motivo por dimensão e arquivo de comparação. Corrigir a arte na fonte ou gerar novamente; não reduzir a resolução, aplicar posterização, blur inverso ou filtro para mascarar a falha.

## 4. Gate de calibração do estilo

Antes do lote, auditar fontes e produzir uma prancha de quatro amostras nativas: casa, árvore, bovino, tile de pasto. A prancha deve incluir cada asset isolado e uma composição que use esses mesmos arquivos, além do comparativo lado a lado com as referências em tamanho equivalente. O teste precisa demonstrar:

1. footprint, hierarquia e conectividade de cena coerentes com a gramática urbana;
2. escala e distribuição rural compatíveis com a Fazenda V7;
3. grama/terra e grounding coerentes com Riose V2;
4. contorno, clusters, materiais e luz coerentes com os sprites Riose individualmente aprovados;
5. integração sem halos, seams, objetos flutuando ou sombras divergentes.

Registrar os valores medidos (pixels nativos por tile, espessura de linha observada, iluminação, paleta amostrada, escala relativa, densidade e zooms de inspeção) em revisão versionada da Art Bible. Usar o arquivo urbano original para avaliar composição, não como gabarito de acabamento de sprite; manter a V7 para conteúdo/escala e Riose V2 para terreno. Registrar as cores median-cut como dados descritivos da urbana, separadas de qualquer paleta semântica Riose, que deve ser medida nos assets aprovados. Os thresholds permanecem provisórios até esta calibração, mesmo com proveniência das fontes já auditada.

## 5. Registro mínimo por asset

```yaml
id: stable-family-variant
revision: 1
status: DRAFT # DRAFT | REVIEW | APPROVED | RELEASED | REJECTED
source: ai-generated | hand-authored | edited
reference_versions: [urban-source-id, rural-source-id]
files: {sprite: path, preview: path}
technical: {format: png, color_profile: sRGB, width: px, height: px, alpha: true}
geometry: {projection: iso-2to1, footprint: [w, h], anchor: [x, y], orientation: direction}
connections: []
visual_review: {score: null, reviewer: null, date: null, evidence: null, notes: []}
rejection_reason: null
```

AI origin, prompts, source references, edits, rights/use conditions and review evidence must be preserved. Do not claim scientific validation, product endorsement or functional telemetry based on visual appearance.

## 6. Rejection checklist

Rejeitar e registrar a dimensão correspondente se ocorrer qualquer um destes casos:

- leitura como pintura digital, concept art, ilustração realista ou jogo mobile 3D;
- contorno grosso/cartoon, vegetação de bolotas ou densidade claramente inferior à referência;
- perspectiva/luz/escala incompatível com os outros assets;
- pixelização feita por filtro, blur/AA inconsistente, gradiente fotográfico ou micro-ruído;
- halo vermelho/verde, fundo opaco, sombra externa acidental ou corte com matte;
- tile com costura ou conector que não se alinha;
- detalhe biologicamente/funcionalmente enganoso ou indicador visual que implique métrica não suportada;
- composição isolada usada como falsa evidência de biblioteca modular, sem sprites reais e manifestados.

