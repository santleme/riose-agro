# Gate de prontidão para comparar lotes observados

## Decisão

`observed-study-slice` conectado à fazenda permite inspeção da identidade, dos campos e de métricas descritivas. Ele não inicializa o `FarmEngine` nem entra na comparação de cenários. O botão de comparação específica do lote permanece bloqueado até existir um adaptador revisado que preserve unidades, proveniência e população.

## Evidência inspecionada

O exemplo `schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json` representa um único novilho de um período de estudo. Traz ADG observado no intervalo e medidas derivadas de coleira, mas não contém peso inicial individual nem DMI. Também declara área do piquete ausente, elegibilidade `not-applicable`, ausência de condição inicial da fazenda e ausência de intervenção de alojamento/alimentação.

O `FarmEngine` requer um snapshot interno com pesos e estados por animal, quatro estoques iniciais de forragem, configuração e semente. O schema de snapshot observado não define uma transformação para essas estruturas. Completar valores com o snapshot demonstrativo ativo faria a execução parecer vinculada ao lote quando não está.

## Comportamento implementado

- A seleção continua preservando IDs e apresentando observações e métricas descritivas.
- A comparação do lote mostra os bloqueios e fica desabilitada.
- A comparação demonstrativa geral permanece disponível, mas não recebe contexto do lote selecionado, não mostra “lote real associado” e não grava essa associação no histórico.
- ADG observado não é tratado como resultado de intervenção, nem como peso ou consumo.

## Próximo gate técnico

Uma ponte executável exige um contrato de condição inicial e uma política de campos explícitos. No mínimo, deve declarar como mapear (ou rejeitar) peso individual com unidade e tempo, estado inicial do animal, configuração/seed e estoque de cada piquete. Para comparações de intervenção, deve especificar tratamentos realmente representados e manter a população e o desfecho dentro do domínio evidenciado. A ausência desses dados deve continuar produzindo bloqueio, não preenchimento sintético silencioso.
