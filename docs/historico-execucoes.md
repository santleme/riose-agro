# Histórico local de execuções

O histórico da comparação demonstrativa é salvo no `localStorage` do navegador, sob a chave `agroville-run-history-v1`. Ele não usa servidor, banco remoto ou autenticação. A interface mostra as 20 execuções mais recentes neste navegador; uma nova execução bem-sucedida continua disponível mesmo se o histórico estiver cheio ou indisponível, e a interface informa quando não conseguiu persistir.

Cada item tem `id` UUID, timestamp ISO 8601, operação (`comparison`), status (`completed` ou `failed`), fator e duração do cenário, seed, versão de compatibilidade do motor, resultado quando concluído e proveniência local. A entrada `manifest` reutiliza o manifesto de comparação já existente e guarda o snapshot inicial usado para reproduzir a execução. Snapshot e eventos são reduzidos aos campos necessários pelo motor; campos extras vindos de um manifesto importado não são copiados. Nenhum token, credencial, caminho local ou stack trace é registrado.

O módulo [`run-history.js`](../run-history.js) expõe `createRunRecord`, `recordRun`, `listRuns`, `getRun` e `runCompatibility`. Listagem ordena por timestamp decrescente. `recordRun` rejeita IDs repetidos, e o gerador usa UUID quando disponível. O aplicativo registra o resultado após a comparação terminar e registra um erro resumido quando ela falha. Erros de armazenamento não apagam o resultado que já está em memória.

O botão **Reproduzir** usa o manifesto original salvo e o validador/replayer existente em [`engine.js`](../engine.js). Versões de motor ou manifesto incompatíveis são identificadas e não executadas. O histórico não cria outro formato de snapshot ou replay, nem substitui os arquivos exportáveis de manifesto.

Ausência de dados inicia um histórico vazio. JSON truncado, estrutura desconhecida e armazenamento inacessível geram erro visível e não são sobrescritos; registros inválidos não são descartados silenciosamente. O limite é de 20 itens: ao persistir o 21º, o mais antigo sai da janela local de retenção. O navegador também pode negar gravações por quota; nesse caso, a comparação continua visível e uma mensagem explica que ela não foi salva.

Esta versão registra o fluxo de comparação do motor principal. A simulação científica BR-CORTE tem contrato próprio e não é incluída neste MVP.
