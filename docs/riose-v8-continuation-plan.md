# Riose V8 — plano de continuação

Este documento registra o estado verificável da reconstrução isométrica e a sequência sugerida para continuar. O escopo original está em `RIOSE — ISOMETRIC WORLD ENGINE V8` na solicitação desta tarefa.

## Estado atual

- Cena integrada ao editor PixiJS 8, selecionável por `?scene=terrain-v8`, `?scene=farm-assembly-v8` ou `?scene=farm-final-v8`.
- Prova de terreno 16×12 com alturas 0/1, grama, estrada, rampa, água, ponte, sprites direcionais de barranco e 178 células navegáveis.
- Prova de montagem com sede e galpão no platô, piquete composto com porteira, bebedouro e cinco bovinos.
- Fazenda artesanal com três zonas de pastagem, curral de serviço, três prefabs compostos de cerca, nove bovinos e rotas visuais.
- Variação de seed muda a posição de duas árvores em células navegáveis seguras; não recompõe o layout da fazenda.
- Pipeline Pillow gera imagens PNG, atlas, metadados e contact sheet em `assets/generated/world-v8/`.
- Capturas 1536×960, com e sem grade, e métricas de navegador ficam em `artifacts/graphics/{terrain-v8,farm-assembly-v8,farm-final-v8,farm-final-v8-seed-84019}/`.
- Revisão visual automatizada feita nas três etapas; os assets continuam com status de revisão artística documentados em `docs/riose-v8-asset-selection.md`.
- Testes geométricos atuais: `node --test tests/terrain-world-v8.test.js tests/farm-assembly-v8.test.js tests/farm-final-v8.test.js` (10 aprovados na última execução).

## Próximas etapas

1. **Fechar a validação visual do terreno:** revisar projeção, alinhamento entre estrada/ponte/rampa, recortes de barranco e transições de material; corrigir artefatos antes de expandir o mapa. Guardar capturas antes/depois em `artifacts/graphics/terrain-v8/`.
2. **Tornar a montagem realmente modular:** substituir os prefabs de curral por peças conectáveis de cerca, canto, poste e porteira; derivar footprint, socket, colisão e clearance dos metadados; validar conexão da estrada à entrada e acesso do gado ao bebedouro.
3. **Modelar terreno navegável com mais de dois níveis:** ampliar o modelo x/y/z e as rotas por encostas, rampas e escadas; impedir mudanças de elevação fora de conexões navegáveis; adicionar testes para ocupação e conectividade.
4. **Aprimorar composição artesanal:** organizar a cena completa com caminhos e estruturas conectados, distribuir vegetação com regras de região e clearance e revisar escala/oclusão; não usar seed como substituto de direção artística.
5. **Completar renderer e interação:** verificar ordenação por footprint/ponto de contato, oclusão, sombras, câmera, zoom, culling e cache de camadas estáticas; comparar FPS, frame p95, memória e quantidade de sprites em capturas repetíveis.
6. **Completar animação visual:** confirmar estados idle/walk/graze/drink em frames raster distintos; testar rotas navegáveis e bloqueio por cerca/edifícios; manter dados demonstrativos fora dos estados científicos.
7. **Aprovar os assets:** selecionar/substituir sprites marcados REVIEW/UNRESOLVED, mantendo o estilo de pixel art 2:1 e registrando proveniência, pivôs, footprints e bounding boxes.
8. **Só então generalizar seeds:** variar regiões e composição com restrições explícitas, gerar contact sheet comparativo e rejeitar layouts inválidos; preservar o layout aprovado como referência.

## Comandos para retomar

```bash
npm run build:graphics-poc
node --test tests/terrain-world-v8.test.js tests/farm-assembly-v8.test.js tests/farm-final-v8.test.js
RIOSE_V8_SCENE=terrain-v8 node scripts/capture-terrain-v8.mjs
RIOSE_V8_SCENE=farm-assembly-v8 node scripts/capture-terrain-v8.mjs
RIOSE_V8_SCENE=farm-final-v8 node scripts/capture-terrain-v8.mjs
RIOSE_V8_SCENE=farm-final-v8 RIOSE_V8_SEED=84019 node scripts/capture-terrain-v8.mjs
```

Execute na branch `codex/riose-visual-rebuild`, no worktree local atual, preservando alterações não relacionadas e sem usar `main` como fonte de trabalho.
