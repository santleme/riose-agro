# Kit-base visual misto v1 — legado/candidatos

**Escopo atualizado:** este lote foi criado para uma fazenda mista e não é mais o kit principal. Consulte o [kit de pecuária bovina v1](../kit-pecuaria-bovina-v1/README.md) e a [direção visual normativa](../../pecuaria-bovina-brasileira.md). Conteúdo agrícola é somente referência histórica ou suporte alimentar opcional; cada sprite precisa passar pelo novo gate antes de reuso.

O lote-base contém 27 IDs de sprite, com variantes de terreno adicionais; este diretório não está conectado ao runtime. Os candidatos seguem [Ríose Isometric Farm Style v1](../../style-guide.md), mas a presença do arquivo não significa aprovação visual. O [manifesto candidato](manifest-candidate-v1.json) registra source size, trim, frame de atlas e diagnósticos técnicos. `vegetation/tree-medium-02.png` é uma alternativa alpha-cleaned em revisão, ainda sem aprovação estética; a geração seguinte foi [reprovada por manter o contorno pesado e introduzir alpha fracionário/franja](rejected/README.md).

## Estado de aprovação

| Grupo | Estado | Uso permitido nesta etapa |
| --- | --- | --- |
| Referência urbana limpa | Referência de estilo aprovada pelo usuário; é a quinta imagem enviada e corresponde pixel a pixel à captura recuperada de Downloads. | Guia visual dominante, sem copiar objetos ou layout urbano. |
| Amostra rural v3 | Direção qualitativa aprovada como base pelo feedback do usuário; contorno e densidade ainda requerem refinamento. | Guia de conteúdo/escala rural e ponto de comparação. |
| 27 IDs deste kit | Candidatos de curadoria; não estão ligados ao runtime e ainda não passaram pelo gate visual completo. | Composição estática, avaliação de alpha, escala e repetição. |
| Atlas em `public/assets/atlas/` | Legado semirrealista já usado pelo simulador; preservado durante esta etapa. | Continuidade do MVP atual; não serve como alvo de estilo para novos assets. |
| Cena completa v5 | Reprovada no gate de estilo. | Comparação de layout/densidade; não integrar nem recortar como sprite. |
| Fazenda completa v7 | Melhor candidata de cena completa; passou na prova de direção para avançar a curadoria do kit. Alguns contornos ainda podem ser refinados asset a asset. | Validar densidade em mapa grande; não equivale à aprovação individual dos sprites. |

### Seis elementos da amostra modular

Os seis PNGs abaixo existem individualmente e podem ser compostos sem recortar a prancha de estudo. A aprovação da direção da amostra não significa que estes arquivos já passaram pela curadoria final de contorno, escala e alpha.

| Elemento | ID do manifesto | Arquivo candidato |
| --- | --- | --- |
| Casa rural | `farmhouse-small-01` | [farmhouse-small-01.png](buildings/farmhouse-small-01.png) |
| Árvore | `tree-medium-01` | [tree-medium-01.png](vegetation/tree-medium-01.png) |
| Trator | `tractor-01` | [tractor-01.png](vehicles/tractor-01.png) |
| Boi Nelore | `ox-nelore-01` | [ox-nelore-01.png](livestock/ox-nelore-01.png) |
| Estrada | `dirt-road-straight-01` | [dirt-road-straight-02.png](roads/dirt-road-straight-02.png) |
| Terreno com vegetação | `grass-light-01` | [grass-light-03-01.png](terrain/grass-light-03-01.png) |

A referência urbana define o estilo; as cenas rurais definem conteúdo e escala. A [cena completa v5](../fazenda-brasileira-completa-pixel-v5-reprovada.png) é uma imagem única de estudo reprovada no gate visual; consulte o [comparativo lado a lado](../comparativo-referencia-urbana-fazenda-v5-reprovada.png). A [cena de teste v2 deste kit](comparativo-cena-kit-v2-referencia.png) é montada com PNGs do manifesto, tiles nativos e âncoras declaradas; ela mostra a composição real dos candidatos e ainda está visualmente esparsa. Nenhum atlas semirrealista legado foi alterado.

Consulte [manifest-candidate-v1.json](manifest-candidate-v1.json) para IDs, medidas, diagnósticos alfa, âncoras e footprints iniciais. Os arquivos com falhas visuais ou de borda precisam de retrabalho antes de qualquer integração.

Execute `python3 docs/assets/kit-base-v1/validate_candidate_kit.py` da raiz do projeto para conferir unicidade de IDs, caminhos, tamanhos declarados, alpha binário, limites dos frames, fidelidade de pixels fonte→atlas e padding transparente. O validador verifica integridade técnica; não aprova a direção artística.

Pranchas de inspeção: [sprites do manifesto](review-contact-sheet-kit-v1.png), [originais](review-contact-sheet-v1.png) e [cópias com alfa binário](review-contact-sheet-alpha-clean-v1.png). As cópias em `alpha-cleaned/` preservam as cores e dimensões dos originais e só removem pixels com alfa abaixo de 128; isso remove halos de matte, mas não corrige o desenho ou a costura. Pastagem, solo seco, estrada reta e lavouras nativas usam o grid 128×64 e passaram no teste técnico 3×3; esse resultado não aprova o acabamento visual. A curva de estrada ainda não tem conexão funcional validada. `grass-light-02.png` fica como versão de teste simples.

O script [compose_scene_preview.py](compose_scene_preview.py) gera uma composição estática dos sprites para revisão de escala/âncora, repetindo estrada e lavouras como tiles PNG nativos. [compose_scene_comparison.py](compose_scene_comparison.py) monta o comparativo usando a referência urbana exata. A imagem [scene-test-v2-kit.png](scene-test-v2-kit.png) e o [comparativo urbano](comparativo-cena-kit-v2-referencia.png) provam o caminho de composição asset-first sem alterar o runtime. A densidade, os conectores e as posições ainda precisam de refinamento; esta montagem não substitui a cena conceitual em [mapa-fazenda-teste.md](../../mapa-fazenda-teste.md) nem aprova os sprites individualmente. A nova [fazenda brasileira completa v7](../review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png) testa currais, pastagens, lavouras, máquinas, estradas e edificações em uma cena integrada; veja o [comparativo lado a lado com a referência urbana](../review-farm-pixel/comparativo-referencia-urbana-fazenda-v7.png) e o [registro de curadoria](../review-farm-pixel/README.md). Ela melhora a densidade e a conexão das zonas, mas segue como candidata visual, sem aprovação final.

O script [build_candidate_atlases.py](build_candidate_atlases.py) gera nove atlases de revisão, um por categoria, a partir dos PNGs-fonte sem redimensionar nem alterar cores. Eles têm padding transparente de 2 px, frames e trims no manifesto. Veja a [prancha dos atlas](review-atlases-candidate-v1.png) e a pasta [atlas-candidate-v1](atlas-candidate-v1/). Estes atlas não são servidos pelo simulador e permanecem candidatos até aprovação de estilo e revisão de âncoras.

Para reconstruir as imagens de revisão a partir dos PNGs-fonte, execute na raiz do projeto:

```bash
python3 docs/assets/kit-base-v1/author_native_tiles.py
python3 docs/assets/kit-base-v1/build_candidate_atlases.py
python3 docs/assets/kit-base-v1/compose_atlas_review.py
python3 docs/assets/kit-base-v1/compose_scene_preview.py
python3 docs/assets/kit-base-v1/compose_scene_comparison.py
python3 docs/assets/kit-base-v1/validate_candidate_kit.py
```

O empacotador altera apenas `manifest-candidate-v1.json` e os PNGs dentro de `atlas-candidate-v1/`; não modifica o manifesto ou atlas do runtime.
