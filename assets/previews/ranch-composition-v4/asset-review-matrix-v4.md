# Matriz de revisão do piloto V4

> **Escopo histórico:** esta tabela registra a triagem do conjunto candidato da composição V4 antes da decisão do piloto cattle-ranch-v1. Seus estados e notas de revisão não refletem as aprovações registradas depois no manifesto canônico. Consulte `assets/manifests/manifest.json` para o estado atual por ID e `assets/pilots/cattle-ranch-v1/pilot.json` para o escopo das 12 aprovações do piloto. A aprovação da composição não promove todos os assets que ela referencia.

No snapshot V4 original, havia **28** assets únicos (4 APPROVED; 24 REVIEW). Os campos de estado e revisão abaixo são históricos; as medições de PNG descrevem os arquivos examinados naquele snapshot e não substituem a validação técnica atual.

Alpha fracionário era sinal para inspeção em mattes, não rejeição automática. A matriz não substitui a revisão artística humana.

| Asset ID | Estado | Arte / técnica | PNG | Alpha fracionário | Padding mínimo | ICC |
|---|---|---|---:|---:|---:|---|
| `building.farmhouse.imagegen.v2` | APPROVED | pass / pass | 1774×887 | 0 | 55px | sRGB |
| `building.shed.imagegen.v1` | REVIEW | pending / pass | 505×407 | 6,150 | 6px | sRGB |
| `building.workshop.imagegen.v1` | REVIEW | pending / pass | 485×392 | 4,035 | 7px | sRGB |
| `corral.wood.standard.imagegen.v1` | REVIEW | pending / pass | 580×371 | 13,817 | 5px | sRGB |
| `feed.salt.roofed.imagegen.v1` | REVIEW | pending / pass | 279×314 | 8,050 | 6px | sRGB |
| `feed.trough.hay.imagegen.v1` | REVIEW | pending / pass | 423×261 | 10,617 | 4px | sRGB |
| `fence.gate.wood.imagegen.v1` | REVIEW | pending / pass | 379×303 | 9,592 | 4px | sRGB |
| `fence.wire.wood-post.imagegen.v1` | REVIEW | pending / pass | 416×299 | 10,319 | 4px | sRGB |
| `handling.alley.cattle.imagegen.v1` | REVIEW | pending / pass | 441×357 | 13,858 | 5px | sRGB |
| `handling.chute.cattle.imagegen.v1` | REVIEW | pending / pass | 369×349 | 10,425 | 4px | sRGB |
| `livestock.nelore.adult.grazing.ne.v1` | REVIEW | pending / pending | 1536×1024 | 0 | 79px | ausente |
| `livestock.nelore.adult.idle.imagegen.v1` | APPROVED | pass / pass | 1536×1024 | 0 | 77px | sRGB |
| `livestock.nelore.adult.walking.ne.v1` | REVIEW | pending / pending | 1536×1024 | 0 | 72px | ausente |
| `livestock.nelore.calf.idle.ne.v1` | REVIEW | pending / pending | 1536×1024 | 0 | 128px | ausente |
| `technology.gateway.antenna.imagegen.v1` | REVIEW | pending / pass | 320×507 | 7,813 | 6px | sRGB |
| `technology.monitor.station.imagegen.v1` | REVIEW | pending / pass | 318×502 | 7,463 | 7px | sRGB |
| `technology.reader.handheld.imagegen.v1` | REVIEW | pending / pass | 305×483 | 4,387 | 7px | sRGB |
| `technology.scale.electronic.full.imagegen.v1` | REVIEW | pending / pass | 485×392 | 11,457 | 7px | sRGB |
| `technology.traceability.system.imagegen.v1` | REVIEW | pending / pass | 490×504 | 8,540 | 8px | sRGB |
| `terrain.ranch.complete-ground.imagegen.v2` | REVIEW | pending / pending | 1774×887 | 0 | 20px | ausente |
| `terrain.soil.compacted-patch.imagegen.v2` | REVIEW | pending / pending | 1774×887 | 0 | 51px | ausente |
| `vegetation.tree.shade.imagegen.v2` | APPROVED | pass / pass | 1536×1024 | 0 | 65px | sRGB |
| `vehicle.livestock-truck.imagegen.v1` | REVIEW | pending / pass | 568×403 | 15,175 | 7px | sRGB |
| `vehicle.pickup.rural.imagegen.v1` | REVIEW | pending / pass | 497×287 | 11,906 | 6px | sRGB |
| `vehicle.tractor.imagegen.v2` | APPROVED | pass / pass | 1536×1024 | 0 | 81px | sRGB |
| `water.pond.imagegen.v1` | REVIEW | pending / pass | 444×320 | 7,354 | 6px | sRGB |
| `water.reservoir.imagegen.v1` | REVIEW | pending / pass | 437×321 | 4,692 | 6px | sRGB |
| `water.trough.round.imagegen.v1` | REVIEW | pending / pass | 462×237 | 8,208 | 4px | sRGB |

## Gate registrado no snapshot V4

- Composição e distribuição das zonas da cena V4: aprovada pelo usuário.
- Assets aprovados individualmente: casa, árvore, trator e Nelore adulto parado.
- Os demais assets, incluindo placa de terreno e overlays, permanecem REVIEW até validação individual.
- O gate global de estilo não está aprovado. A biblioteca não avança para as fases seguintes até esse gate passar.
