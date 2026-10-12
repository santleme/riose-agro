# Registro local de desfecho pós-decisão (#16)

Este contrato em rascunho cria um sidecar local para registrar medições posteriores à decisão sem alterar o manifesto nem a projeção arquivada. Ainda não recebe dados reais, não envia informações ao servidor e não atualiza parâmetros do motor.

## Fluxo

1. Exportar um manifesto reproduzível da comparação no Scenario Studio.
2. Arquivar a saída da comparação e o hash do código do motor que a produziu:

   ```sh
   npm run archive:comparison -- comparison.json comparison-result.json
   ```

   O CLI se recusa a substituir um arquivo de resultado já existente.
3. Ligar um snapshot de fazenda elegível aos bytes exatos do manifesto com `npm run link:snapshot`. O snapshot precisa declarar um caso aprovado e conter um lote com o mesmo número de animais da projeção.
4. Criar um registro conforme [`schemas/outcome-record.schema.json`](../schemas/outcome-record.schema.json), preenchendo observações para as métricas/entidades disponíveis e apontando para os arquivos exatos.
5. Validar os vínculos e as condições de comparabilidade:

   ```sh
   npm run validate:outcome -- outcome.json --archive comparison-result.json --manifest comparison.json --snapshot farm-snapshot-linked.json
   ```

   `--require-comparable` faz o comando terminar com erro se nenhuma observação puder ser comparada. A validação confere digest, referência ao manifesto, existência do lote e tamanho do rebanho; isso ainda não prova que os atributos do snapshot foram mapeados para o estado numérico do motor.

## Conteúdo e proteções

- Cada observação guarda valor ou ausência explícita, unidade, data/período, método, fonte/título/versão/localizador, qualidade e entidade (de preferência um ID pseudônimo estável).
- O registro inclui se a decisão foi executada, estado e base do consentimento, estado/base de acesso, política de retenção e revisão humana.
- O vínculo verifica SHA-256 dos bytes exatos do manifesto, do arquivo de projeção e do snapshot elegível que aponta para o mesmo manifesto. O arquivo de projeção também identifica SHA-256 do `engine.js` usado na captura. O lote selecionado precisa existir no snapshot e conter o mesmo número de animais da projeção.
- A diferença `observado - projetado` só é exibida como **descritiva** quando o horizonte, a métrica/unidade, a qualidade medida/derivada, o cenário realmente executado, uma janela totalmente posterior à decisão, o consentimento, a revisão humana e o alinhamento do desfecho forem aprovados. O contrato bloqueia níveis animal/fazenda porque as saídas atuais são agregadas por lote.
- O relatório separa valores registrados, comparáveis e indisponíveis/bloqueados para expor a cobertura do que foi possível confrontar.
- Uma métrica ausente, período divergente, unidade não suportada ou alinhamento pendente permanece sem comparação; não é convertido em zero nem em erro do modelo.
- Os hashes detectam divergência acidental entre arquivos; não são assinatura digital nem prova de autoria, veracidade da medição ou validade científica.
- A aprovação do registro atesta apenas a revisão declarada. Não substitui protocolo de campo, consentimento válido, qualidade do instrumento, população-alvo ou avaliação independente (#1/#6/#15).

## Estado e limites

`outcome-review.html` oferece captura de várias medições no navegador: lê localmente o manifesto, o snapshot e a projeção e baixa os artefatos, sem API de gravação ou storage do navegador. Exige snapshot elegível ligado ao manifesto exato, lote com tamanho igual ao rebanho projetado, cenário realmente executado e janela observada posterior à decisão. A validação não prova que os atributos do snapshot foram mapeados para o motor; essa integração requer mapeamento de domínio documentado e o contrato da #12. A revisão zootécnica futura da #22 não valida esse mapeamento nem o motor. O fluxo de CLI continua disponível para validação independente. Os testes usam somente valores artificiais criados em memória; eles verificam regras do contrato, não demonstram utilidade agronômica. Nenhum dado de propriedade foi coletado ou incorporado. A próxima etapa de #16 requer revisão do contrato por especialista, protocolo consentido e medidas reais alinhadas ao caso aprovado. Recalibração automática permanece fora de escopo.
