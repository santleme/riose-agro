# Reconciliação do registry científico da branch local

Revisão da branch local `codex/issue-38-54-lot-comparison` (commit `7492f24`, registry científico) contra o estado após o PR #68. A branch não foi mesclada integralmente. O mapa abaixo registra a seleção feita para a issue #92 e deixa explícito o que não passou a ser autoridade duplicada.

| Mudança na branch | Decisão | Estado atual / motivo |
| --- | --- | --- |
| `scientific/registry/evidence-registry.js` | Adaptada | `scientific/evidence-resolver.js` expõe uma consulta de leitura de uma observação por caminho e normaliza `observed`, `derived`, `hypothesis` e estados ausentes. A validação de snapshots continua sendo responsabilidade de `snapshot-validator.js`; o resolver não aprova nem altera evidência. |
| `scientific/registry/models.json` | Omitida | O adaptador executável `scientific/br_corte_dmi_adapter.js` declara ID, versão, inputs, outputs, evidência e função via `scientific/model-contract.js`. O arquivo branch duplicava esses metadados e listava o motor demonstrativo como se fosse registro executável, embora suas entradas descritas não fossem consumidas pelo engine. Resolver ID/versão será feito na trilha #93 sobre o contrato existente. |
| `scientific/registry/parameters.json` | Omitida | A equação, coeficiente, unidades, faixa publicada e origem já estão em `scientific/br_corte_pasture_dmi.js` e `docs/modelos/br-corte-2023-cms-pasto.md`. Um JSON paralelo criaria outra cópia manual do mesmo parâmetro. |
| `scientific/registry/knowledge-base.json` | Omitida | Fontes e auditorias têm registros canônicos nos manifests de dados e em `docs/evidence/`. A cópia estática não acrescentava um fluxo de atualização ou validação de referência. |
| `schemas/scientific-registry.schema.json` e seus testes | Omitidos | Como os registries estáticos correspondentes não foram adotados, o schema abrangente ficaria sem consumidor e institucionalizaria formatos duplicados. O contrato executável de modelo continua em `scientific/model-contract.js`. |
| `schemas/lot-inputs.schema.json` | Adiada | A branch descreve entradas de manejo que ainda não são consumidas pelo motor. Integrá-las ao input contratual antes de definir o ponto de execução faria a UI sugerir que elas afetam cálculos. Reavaliar apenas quando uma issue definir esse consumo. |
| Extração de `feeding-model.js` e proveniência | Já integrada no PR #68 | A implementação atual mantém o módulo de alimentação e `engine-provenance.js`. Nenhuma cópia ou port da branch foi necessário; a lista de fontes do bundle atual inclui `feeding-model.js`. |
| Alterações de lot/feeding e UI no restante da branch | Fora do escopo desta reconciliação | A branch contém mudanças amplas posteriores e arquivos removidos em relação ao estado atual. Não foram incorporadas; revisar em issues específicas se algum gap concreto persistir. |

## Limite de evidência

O resolver preserva o status declarado: observação continua `OBSERVED`, valor derivado continua `SIMULATED`, hipótese continua `ASSUMED`, e ausência ou status desconhecido resulta em `MISSING`. Resolver uma fonte é apenas apresentação de proveniência; não valida a fonte, não promove dados e não demonstra validade científica.
