# Contrato do snapshot da fazenda

Versão do schema: `0.1.0`. O responsável aprovou para prototipagem o caso observacional USDA/CPER de ADG e pastejo, cuja coorte contém novilhos yearling. A issue #1 foi encerrada como definição de escopo. Não houve revisão zootécnica independente; qualquer revisão de domínio futura é separada e não muda o status desta issue.

O snapshot representa o **estado do domínio** no início de um caso: fazenda/local, população, lotes, animais, piquetes, operações, histórico e medições. Ele não contém semente, duração da simulação ou duas configurações de cenário. Esses dados pertencem ao manifesto reproduzível da issue #4; `manifestReference` aponta para o arquivo serializado via tipo, versão e SHA-256, sem copiar seu conteúdo. O vínculo mantém o formato atual (`type: agroville-comparison`) e aceita as versões 1 e 2; o snapshot não redefine a estrutura interna do manifesto. A versão 1 continua disponível, e a versão 2 foi adicionada pela issue #26.

## Procedência por campo

Cada medição guarda ID próprio, caminho estável do indicador, instante de coleta, valor, unidade, classificação, fonte, localizador dentro da fonte, população de validade e período quando conhecido. O mesmo caminho pode se repetir quando o ID e o instante/período distinguem medições. Se a fonte não fornecer data exata, `observedAt` fica `null`, `period` mantém o período disponível e `timeMissingReason` explica a lacuna; o contrato não fabrica uma data.

Para a camada ambiental, o snapshot pode declarar `farm.environment.temperature_c` em °C e `farm.environment.relative_humidity_pct` em %. Ambos são campos opcionais com a mesma proveniência. No painel de lote, observações espaciais também podem declarar área em `paddock.<id>.area_ha`, `area_m2`, `area_acres` ou `lot.<id>.area_*`; comprimento do cocho pode usar `paddock.<id>.trough_length_m` (a unidade do campo determina a conversão). Área e infraestrutura ausentes continuam ausentes e não geram métricas calculadas.

As classificações permitidas são:

- `observed`: medida ou categoria publicada na fonte;
- `derived`: transformação documentada de uma fonte (por exemplo, a classe taxonômica inferida da descrição do estudo);
- `hypothesis`: hipótese explícita ainda não medida;
- `missing`: a fonte não contém o valor;
- `not-applicable`: o campo não se aplica ao registro.

`missing` e `not-applicable` exigem `value: null` e uma justificativa. Um número de demonstração não pode substituir esse `null`; para incluí-lo, ele deve ser rotulado `hypothesis`, apontar para sua origem e continuar claramente fora das medições observadas.

## Escopo de domínio das variáveis

O snapshot pode incluir `variableClassification`, um catálogo opcional e versionado separado do status de evidência (`observed`, `derived` etc.). Na versão `1.0.0`, `variables` associa IDs estáveis a `farm`, `lot` ou `animal`; por exemplo, clima é da fazenda, dieta/cocho/densidade são do lote, e peso/idade/categoria são do animal. Um campo classificado aponta para um desses IDs com `variableId`. O schema valida o formato e os níveis; o validador semântico exige que cada referência exista no catálogo e que cada entrada do catálogo seja usada por ao menos um campo. Essa metadata descreve o domínio do dado e não altera fórmulas ou o engine.

Campos sem `variableId` permanecem **não classificados**. Não se deve inferir o nível pelo nome do campo, por sua posição no JSON ou pela entidade que o contém; classifique-o somente quando houver uma decisão explícita. Como o catálogo e `variableId` são opcionais, snapshots anteriores continuam válidos sem migração. Exemplo de fragmentos para classificar a categoria do animal:

```json
{
  "variableClassification": {
    "version": "1.0.0",
    "variables": {"category": "animal"}
  },
  "animals": [{
    "category": {
      "path": "animal.eartag-242.category",
      "variableId": "category"
    }
  }]
}
```

## Operações e histórico

Eventos agora usam um envelope com ID estável, tipo, instante, classificação de evidência, fonte, localizador, população de validade e campos medidos/derivados/hipotéticos. Cada campo do evento reutiliza o mesmo contrato de proveniência (`unit`, status, fonte, localizador e população válida) e um caminho no formato `operations.<eventId>.<field>` ou `history.<eventId>.<field>`. O validador rejeita fonte inexistente, caminho fora do evento, campos sem procedência e IDs repetidos no mesmo registro. Isso cobre eventos novos no rascunho 0.1.0; os logs vazios do exemplo USDA continuam indicando cobertura ausente/parcial, não ausência de eventos na fazenda real.

## Elegibilidade

`caseDefinition.requiredFields` precisa declarar ao menos um campo: um snapshot não pode se tornar elegível com uma lista vazia de requisitos.

`caseDefinition.requiredFields` lista ADG observado e os indicadores de pastejo aprovados pelo responsável do projeto para prototipagem. Isso não torna um recorte de pesquisa elegível ao motor nem valida o modelo numérico. O helper [`snapshot-validator.js`](../src/client/snapshot-validator.js) verifica caminhos duplicados e ligados à entidade correta, classificação, unidade, localizador, fonte registrada, lacunas obrigatórias, referências cruzadas animal↔lote, observações para entidades existentes, proveniência dos eventos e consistência da elegibilidade. Ele valida somente relações semânticas: o resultado usa `semanticValid` deliberadamente e não afirma que o objeto satisfaz toda a estrutura JSON Schema. `simulationEligibility.status` fica `blocked` quando faltam campos obrigatórios, `review-pending` quando os campos estão presentes mas aguardam a revisão de domínio aplicável, `ready` somente após aprovação e preenchimento, e `not-applicable` para um `observed-study-slice`, que não pode ser executado como estado-base do motor, mesmo se o caso observacional for aprovado. A #22 acompanha revisão futura da classificação da população; não muda o encerramento da #1. As lacunas requeridas continuam visíveis nesse estado. A validação estrutural é definida por [`farm-snapshot.schema.json`](../schemas/farm-snapshot.schema.json). `tests/farm-snapshot.test.js` compila esse schema com Ajv 2020-12 e verifica o exemplo e violações estruturais, além das checagens semânticas do helper. O comando [`validate-farm-snapshot.js`](../scripts/validate-farm-snapshot.js) executa ambas em conjunto e retorna `valid` somente quando schema e semântica passam; pode conferir o arquivo manifesto ligado usando `--manifest <arquivo>`, verificando SHA-256 e tipo/versão, sem duplicar o validador interno da issue #4. O comando [`link-farm-snapshot.js`](../scripts/link-farm-snapshot.js) valida um snapshot existente e um manifesto v1 com o validador do motor, grava tipo/versão/SHA-256 em uma cópia de saída e se recusa a sobrescrevê-la. Ele rejeita `observed-study-slice` e não promove elegibilidade. Também pode falhar snapshots inelegíveis com `--require-eligible`. O workspace de experimentos revisa os resultados do motor, mas não converte automaticamente campos observacionais para o estado interno da simulação; a definição observacional da #1 não aprovou esse mapeamento, que precisa de documentação própria.

A rota local **Revisar snapshot** aceita um JSON pelo servidor `npm start`. A API executa o schema JSON 2020-12, as verificações semânticas e, quando o snapshot está ligado, confere o manifesto pelos bytes originais, SHA-256 e tipo/versão. A resposta mostra erros, bloqueios e campos obrigatórios ausentes. O arquivo só é processado em memória pela instância local: não é guardado, não é enviado a um provedor de LLM e não é aplicado ao motor atual. A rota tem limite de corpo de 4 MiB. Um servidor estático como `python3 -m http.server` não inclui essa API de validação.

O exemplo [`usda-cper-2019-paddock-19n-eartag-242.json`](../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json) usa uma linha pública de um estudo USDA em domínio público. O ganho médio diário, duração do pastejo e velocidade são medidas observadas do estudo. Peso inicial, CMS individual e área do piquete ficam ausentes, com motivo explícito; a linha observacional não é um estado de fazenda e tem `simulationEligibility.status=not-applicable`. A amostra descreve um animal-período, não um lote real completo.

## Limites e dependências

- A aprovação do responsável delimita a trilha observacional de ADG/pastejo; a classificação biológica da população não foi estabelecida por revisão independente. Bezerras permanecem em módulo separado.
- O conjunto USDA é observacional, tem 33 IDs em 36 períodos e não mede CMS ou confinamento. Serve como exemplo de proveniência e de lacunas, não para validar as saídas atuais de CMS/custo/ganho.
- O Dryad de bezerras não é marcado como independente do Zenodo enquanto os IDs não forem comparados.
- O exemplo declara `not-linked` porque não há manifesto exportado para esse recorte de estudo; continua não executável como comparação do motor. Para um snapshot ligado, forneça o arquivo exato do manifesto ao CLI e mantenha os bytes exportados para preservar o digest.
- Não usar campos do snapshot para substituir `engine.js` ou apresentar previsão calibrada. A revisão visual verifica o contrato de dados e mostra elegibilidade, mas não altera o motor nem transforma a demonstração atual em uma simulação de fazenda real. A conversão para estado inicial executável requer um mapeamento validado de campos; encerrar a definição de escopo na #1 não validou esse mapeamento.
