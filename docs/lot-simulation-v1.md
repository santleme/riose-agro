# Simulação demonstrativa por lote · v1

Na fazenda principal, clique em uma área livre do piquete para abrir o lote demonstrativo associado. O painel do lote mostra seus animais, peso médio e estoque de pasto e oferece uma comparação de suplementação de 30 dias.

A comparação usa o mesmo snapshot e a mesma semente nos dois cenários. A suplementação alternativa é aplicada somente aos animais do lote selecionado. O motor calcula o estoque do piquete selecionado; outros animais não entram na execução. Não há efeitos compartilhados entre lotes modelados nesta versão.

O fluxo estende o manifesto existente `riose-configured-comparison` v1 com `targetScope.kind = lot`; manifestos antigos sem escopo continuam válidos. O escopo registra IDs estáveis, fingerprint determinístico do snapshot, intervenção, parâmetros e identidade/status/evidências do modelo. A lista de evidências fica vazia porque esta simulação é demonstrativa e não possui validação empírica. O histórico local preserva o manifesto e o snapshot originais para replay. O Worker envia ao runner Rust somente o snapshot da população selecionada, usando o contrato de comparação configurada já suportado; se o runner não estiver disponível ou rejeitar a entrada, JavaScript/WASM executa a mesma população e registra o fallback.

Esta demonstração usa somente estado sintético e o motor demonstrativo não calibrado. As outras populações não entram em nenhum dos braços e permanecem imutáveis no snapshot de origem; não são simuladas nem se modelam interações entre lotes. O fingerprint FNV-1a identifica o conteúdo de entrada para reprodução, sem ser uma assinatura de segurança. Snapshots de fazenda importados e observações incompletas continuam descritivos e não podem ser executados como lotes elegíveis.
