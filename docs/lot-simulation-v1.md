# Simulação demonstrativa por lote · v1

Na fazenda principal, clique em uma área livre do piquete para abrir o lote demonstrativo associado. O painel do lote mostra seus animais, peso médio e estoque de pasto e oferece uma comparação de suplementação de 30 dias.

A comparação usa o mesmo snapshot e a mesma semente nos dois cenários. A suplementação alternativa é aplicada somente aos animais do lote selecionado. O motor calcula o estoque do piquete selecionado; outros animais não entram na execução. Não há efeitos compartilhados entre lotes modelados nesta versão.

O manifesto `riose-lot-configured-comparison` v1 registra a identidade sintética do lote, o modelo e versão, unidades, parâmetros, semente, configurações, snapshot inicial e proveniência. O histórico local permite reabrir a execução e reproduzi-la. O executor Rust local é usado quando o runner está disponível e aceita o cenário; em caso contrário, o caminho JavaScript/WASM executa o mesmo contrato e registra o executor usado.

Esta demonstração usa somente estado sintético e o motor demonstrativo não calibrado. Snapshots de fazenda importados e observações incompletas continuam descritivos e não podem ser executados como lotes elegíveis.
