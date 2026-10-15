# Reconciliação do registry científico da branch local

Revisão da branch local `codex/issue-38-54-lot-comparison` (commits `e54ce90` e `7492f24`) contra `main` em `7885ba0` (após o PR #68, head `0d7c9c5`, e o PR #70). A branch não foi mesclada integralmente. O mapa abaixo registra a seleção feita para a issue #92 e deixa explícito o que não passou a ser autoridade duplicada. A adaptação selecionada está implementada no branch de trabalho do PR #116; o `main` consultado ainda não contém esse arquivo.

## Sobreposição explícita com #50–#53

| Issue | Artefatos da branch que se sobrepõem | Seleção | Autoridade no `main` revisado / destino selecionado |
| --- | --- | --- | --- |
| #50 — Knowledge Base | `scientific/registry/knowledge-base.json` | **OMITIDO**; sem consumidor ou fluxo de atualização próprio | `data/*/manifest.json`, `docs/evidence/` e busca lexical determinística em `scripts/science/scientific-retrieval.js` |
| #51 — Evidence Registry | `scientific/registry/evidence-registry.js` | **IMPLEMENTADO neste branch, adaptado** como consulta read-only; sem novo armazenamento ou schema | `scientific/evidence-resolver.js` (destino do PR #116), usando `observations` e `sourceCatalog`; `snapshot-validator.js` continua autoridade de validação |
| #52 — Parameter Registry | `scientific/registry/parameters.json` | **OMITIDO**; duplicaria coeficientes, unidades e faixa já publicadas | `scientific/br_corte_pasture_dmi.js` e `docs/modelos/br-corte-2023-cms-pasto.md` |
| #53 — Model Registry | `scientific/registry/models.json` e `schemas/scientific-registry.schema.json` | **OMITIDOS**; seriam um catálogo paralelo e conteriam uma lista de inputs demonstrativos não consumidos | `scientific/model-contract.js` + `scientific/br_corte_dmi_adapter.js` resolvem ID/versão do modelo executável |

Os issues #50–#53 aparecem como fechados no GitHub por comentários que apontam para `7492f24`, mas esse commit não está no `main` revisado nem foi parte do PR #68/#70. “Omitido” abaixo descreve a seleção desta reconciliação, não altera o estado remoto do issue. Os IDs e referências da branch antiga ficam documentados: fontes `br-corte-2023-chapter-2`, `usda-cper-foraging-adg-dataset`, `embrapa-cerrados-ct142-2007` e `embrapa-gado-corte-support-capacity`; parâmetro `br-corte-2023-eq-2.6-supplement-coefficient` (fonte BR-CORTE, Eq. 2.6); modelo `br-corte-2023-eq-2.6@2023`. O registro demonstrativo aponta para `engine.js@83c7b9e`, coordenada histórica do branch, não para um build atual. Nenhum ID ou estado de evidência foi reaproveitado para outra fonte.

O arquivo `schemas/lot-inputs.schema.json` não foi atribuído a #50–#53: ficou **ADIADO** porque as entradas ainda não são consumidas pelo cálculo. `lot-feeding.js` e alterações de UI também não foram incorporados; a reconciliação não reabre a integração do lote apenas por existir naquela branch.

| Mudança na branch | Seleção | Estado atual / motivo |
| --- | --- | --- |
| `scientific/registry/evidence-registry.js` | **IMPLEMENTADO neste branch, adaptado** | `scientific/evidence-resolver.js` consulta uma observação por caminho e normaliza `observed`, `derived`, `hypothesis` e ausência. Status desconhecido, inclusive `verified`, resulta em `MISSING`; a validação permanece em `snapshot-validator.js`. Teste de regressão cobre mapa, fonte, população, período e ausência de promoção. |
| `scientific/registry/models.json` | **OMITIDO** | O adaptador executável `scientific/br_corte_dmi_adapter.js` declara ID, versão, inputs, outputs, evidência e função via `scientific/model-contract.js`; essa interface já resolve versões exatas. O JSON antigo duplicava os metadados e listava o motor demonstrativo como registro executável, embora as entradas declaradas não fossem consumidas pelo engine. |
| `scientific/registry/parameters.json` | **OMITIDO / TRABALHO SOLTO** | O ID `br-corte-2023-eq-2.6-supplement-coefficient` fica preservado na nota acima; equação, coeficiente, unidades, faixa publicada e origem já estão em `scientific/br_corte_pasture_dmi.js` e `docs/modelos/br-corte-2023-cms-pasto.md`. Um JSON paralelo criaria outra cópia manual do mesmo parâmetro. |
| `scientific/registry/knowledge-base.json` | **OMITIDO / TRABALHO SOLTO** | As fontes e os quatro IDs ficam preservados na nota acima. Manifests de dados e `docs/evidence/` são fontes canônicas; `scripts/science/scientific-retrieval.js` já indexa esses documentos sem uma segunda cópia estática. |
| `schemas/scientific-registry.schema.json` e seus testes | **OMITIDOS** | Os registries estáticos correspondentes não foram adotados; manter esse schema sem consumidor criaria formato duplicado. Modelo executável continua sob `scientific/model-contract.js`. |
| `schemas/lot-inputs.schema.json` | **ADIADO** | A branch descreve entradas de manejo que ainda não são consumidas pelo motor. Reavaliar quando uma issue definir o ponto de execução; não conectar UI nem sugerir efeito científico antes disso. |
| Extração de `feeding-model.js` e proveniência | **JÁ LANÇADA** no PR #68 | A implementação equivalente está em `src/client/feeding-model.js` e `src/client/engine-provenance.js` no `main` revisado. Não copiar novamente a versão raiz nem alterar manifest/replay. |
| Alterações de lot/feeding e UI no restante da branch | **OMITIDAS / TRABALHO SOLTO** | Incluem `lot-feeding.js`, schema e interface para dados ainda sem consumidor científico. Não entram nesta reconciliação; ficam como trabalho solto para uma issue de integração específica. |

## Compatibilidade verificada

O replay do manifesto v1 tem um digest fixado em `tests/scientific-registry-reconciliation.test.js`; os testes `tests/engine.test.js` também fixam quatro snapshots de alimentação anteriores à extração do modelo. Os cálculos e o replay continuam no caminho atual sem importar os arquivos de `scientific/registry/` da branch antiga.

## Limite de evidência

O resolver preserva o status declarado: observação continua `OBSERVED`, valor derivado continua `SIMULATED`, hipótese continua `ASSUMED`, e ausência ou status desconhecido resulta em `MISSING`. Resolver uma fonte é apenas apresentação de proveniência; não valida a fonte, não promove dados e não demonstra validade científica.
