# Riose Agro · Art Direction Bible V5

Este guia deriva os números abaixo dos 28 arquivos usados na composição piloto; uso atual não equivale a aprovação artística ou liberação de direitos.

## Projeção e escala

- Projeção isométrica 2:1, coordenadas de tela de 61 px por eixo horizontal e 27,2 px por eixo vertical na placa de 14 × 14 unidades.
- Convenção de terreno: 1 unidade isométrica = 5 m no plano. O render estiliza a altura em 74,7 px/unidade; não usar essa altura visual para alterar dados científicos.
- As dimensões abaixo são medianas de `requestedSizePx` nos usos existentes, não limites universais. Assets sem metadados espaciais continuam marcados para revisão.

| Categoria | Tamanho mediano de render |
|---|---:|
| buildings | 175 × 131 px |
| handling-and-fences | 106 × 68 px |
| livestock | 52 × 43 px |
| technology | 46 × 54 px |
| vegetation | 67 × 82 px |
| vehicles-and-machinery | 110 × 86 px |
| water | 67 × 57 px |

## Paleta derivada dos assets em uso

| Cor | Participação amostrada |
|---|---:|
| <span style="display:inline-block;width:1.5em;height:1em;background:#323430"></span> `#323430` | 19.0% |
| <span style="display:inline-block;width:1.5em;height:1em;background:#614631"></span> `#614631` | 18.2% |
| <span style="display:inline-block;width:1.5em;height:1em;background:#486877"></span> `#486877` | 12.9% |
| <span style="display:inline-block;width:1.5em;height:1em;background:#959391"></span> `#959391` | 12.5% |
| <span style="display:inline-block;width:1.5em;height:1em;background:#a25b36"></span> `#a25b36` | 11.0% |
| <span style="display:inline-block;width:1.5em;height:1em;background:#e0d2c6"></span> `#e0d2c6` | 9.6% |
| <span style="display:inline-block;width:1.5em;height:1em;background:#777c42"></span> `#777c42` | 9.5% |
| <span style="display:inline-block;width:1.5em;height:1em;background:#c78953"></span> `#c78953` | 7.4% |

Amostragem reamostrada dos pixels visíveis dos 28 assets do piloto, quantizada em oito centros RGB. Não é uma paleta final aprovada; áreas de transparência foram excluídas.

## Luz, material e compatibilidade

- Iluminação principal dos renders Blender de terreno: quente, superior esquerda; preenchimento frio de cima/direita. Os manifests não descrevem uma direção comum de luz para os sprites existentes, então consistência de luz permanece pendente de inspeção.
- Cores RGB, densidade de bordas, alpha e orientação declarada no inventário são sinais de triagem. Nenhum deles aprova perspectiva, estilo ou qualidade artística.
- A composição atual mistura fontes geradas e sprites raster de famílias diferentes. A inspeção humana deve comparar contornos, sombras, escala, perspectiva, detalhe e adequação agropecuária antes de promover assets.
- A coleção usada no piloto continua com revisão artística e direitos pendentes; ativos fora dela ficam em espera ou laboratório sem excluir seus originais.

Relatório técnico e sinais por arquivo: [art-direction-report.json](../assets/previews/asset-art-direction-v1/art-direction-report.json).
