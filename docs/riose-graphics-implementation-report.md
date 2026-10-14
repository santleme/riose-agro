# Riose Agro · implementação visual V4

Data: 2026-10-14. Esta é uma vertical slice executável e verificável; não representa aprovação artística final nem conclusão de todos os requisitos da engine.

## O que foi implementado

- Cena de corte baseada na composição real V4 (`rural-diorama-scene-v4-...-review.json`), compilada em camadas no PixiJS 8. A saída continua preservando os estados de revisão e proveniência do catálogo. O renderer lê o `.tmj` gerado e usa seus 82 objetos, âncoras de contato e dimensões gráficas. Os 26 assets únicos de cena e o asset de terreno resultam em 28 IDs referenciados.
- Enquadramento da cena: cálculo de bounds incluindo a altura visível, ajuste inicial responsivo, fundo neutro, pan e zoom. Chromium a 1600×1000 capturou um canvas de 1532×869; o terreno ocupa aproximadamente 87% da largura interna do canvas. São salvas capturas base, zoom e viewport responsivo.
- Catálogo visual específico da cena, com a placa do terreno separada e sprites em checkerboard para evidenciar transparência, estado artístico e técnico.
- Pipeline de spritesheets com Pillow: normalização de quadros, limpeza da franja colorida de matte, pivôs de contato, bounds de contato, metadados por estado e contact sheets. Um atlas combinado contém um idle estático e quatro quadros candidatos por estado walk, graze e drink. Apenas o loop `graze` foi conectado à cena; três animais que já estavam no estado visual de pastejo usam quatro quadros reais.
- Validação de browser com Chromium/Playwright via SwiftShader, verificando carregamento, exceções, objetos, diversidade de assets e clip animado. Além do servidor temporário de captura, a rota real do produto foi exercitada em `PORT=8017 npm start`; `artifacts/graphics/ranch-v4-product-server.png` vem dessa rota. O servidor publica apenas a cena, o manifest e os arquivos exatos referenciados, sem expor fontes ou o `.blend`. O fixture legado foi preservado para comparação.
- Fabricador de demonstração em Blender Python: bebedouro de madeira com câmera ortográfica, iluminação consistente, RGBA transparente e render Cycles em CPU. O PNG e o `.blend` são candidatos `REVIEW`; não foram adicionados à cena, pois a inspeção estilística ainda é necessária.
- O código e arte da cena são independentes do estado da simulação científica. O cenário seco existente permanece rotulado `visual-only-unvalidated`.

## Ferramentas executadas e resultados

| Ferramenta | Executável/versão | Comando realmente executado | Saída e uso |
|---|---|---|---|
| Tiled | Tiled 1.12.2, AppImage oficial extraído em `~/.local/share/riose-tools/tiled-1.12.2/squashfs-root/AppRun` | `AppRun --evaluate scripts/tiled/build-scene.js <repo-root>`; também executado via `npm run build:graphics-poc` | `graphics-poc/generated/ranch-v4.tmj`, `.tmx`, `.tsx`. O build usa a API JS embutida de Tiled (`TileMap`, `Tileset`, `ImageLayer`, `ObjectGroup`, `MapObject`), objetos/layers e formato de coleção de imagens. O renderer Pixi lê o TMJ; não há edição manual do mapa. `scripts/tiled/install-portable.mjs` permite refazer a instalação local sem sudo. |
| Blender | Blender 4.0.2, pacotes Ubuntu extraídos em `~/.local/share/riose-tools/blender-4.0.2` | `npm run render:blender-demo` → Blender `--background --factory-startup --python scripts/blender/create-rustic-water-trough.py` | `assets/candidates/blender-demo/rustic-water-trough.blend`, PNG RGBA 480×360 e JSON espacial. Render Cycles CPU, 20 amostras. Denoising foi desativado porque o pacote não contém OIDN. O asset é candidato, fora do runtime. `npm run tools:install-blender` fornece instalação portátil para Ubuntu 24.04. |
| Aseprite / alternativa | Aseprite não foi encontrado no PATH ou instalação local inspecionada; Pillow 10.2.0 disponível | `npm run build:livestock-animation-atlas` | Cria três strips processados, JSONs, contact sheets e `assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.png` (2348×1888). Ferramenta equivalente operacional, não uma execução falsa de Aseprite. Direitos e aprovação artística permanecem em revisão. |
| Browser QA | Chromium 1248, Playwright 1.57.0, WebGL via ANGLE/SwiftShader | `npm run capture:graphics-ranch-v4`; também foi aberto `http://127.0.0.1:8017/graphics-poc/ranch-v4.html` via `PORT=8017 npm start` | PNGs base/zoom/responsivo e JSON de métricas em `artifacts/graphics/`. Ambas as execuções reportam zero erros, 82 posições, 28 IDs referenciados e 3 animais com animação de pastejo em quatro quadros. |
| Pillow catálogo | Pillow 10.2.0 | `npm run build:graphics-asset-catalog` | `assets/previews/ranch-composition-v4/asset-contact-sheet-v4-runtime.png`, 27 sprites e uma placa de terreno. |

As ferramentas Tiled e Blender não exigiram alteração global no sistema: `sudo` não está disponível sem senha neste WSL, então foram usadas distribuições/pacotes oficiais em diretórios locais. Isso é um limite do ambiente; a execução das ferramentas foi real.

## Comparação e leitura visual

`artifacts/graphics/ranch-v4-comparison.png` põe lado a lado o fixture antigo e a captura real do novo viewer. A vista antiga mostra a cena pequena, fundo verde uniforme, sobreposição de rótulos e infraestrutura sem hierarquia. A vista nova utiliza a composição V4 em sprites e camadas: sede central, galpão de máquinas, faixas de cultivo, acessos, curral, divisões e agrupamentos de gado, vegetação e lateral do terreno. O fundo e o enquadramento foram alterados substancialmente.

Isso demonstra melhoria verificável de ocupação, hierarquia e densidade para uma cena piloto; não comprova equivalência à referência artística nem aprovação final. Parte dos assets permanece em estados `REVIEW`; a mistura entre a placa do terreno e alguns sprites pode ser refinada após inspeção humana.

## Limitações ainda abertas

- Ainda não há gerador autônomo de scene grammar/constraint solving compilando novos grafos semânticos. A cena de runtime reutiliza uma composição previamente existente com posições por objeto; o build converte esses dados por Tiled. As cenas de corte/leite/seca geradas pelo adapter anterior não demonstram três layouts autorais distintos aprovados.
- O mapa Tiled não usa Wang sets/autotiling; a placa e overlays existentes são reaproveitados. Não existe pathfinding de rebanho ou resolução geral de colisão no viewer desta slice.
- O runtime reproduz graze por frames; não movimenta agentes. Walk e drink são arte candidata e não são exibidos. Idle é um sprite estático de um quadro, não uma animação inventada.
- Oclusão segue o `depthKey`/âncora disponível no dado de composição. Máscaras complexas de oclusão, footprint físico calibrado para cada construção e validação geral de overlap ainda faltam.
- O QA mede carregamento, contagem, camera captures e erros de runtime; não classifica automaticamente qualidade estética. Nenhuma inspeção visual automatizada foi tratada como aprovação.
- Stack existente identificada: servidor JavaScript, Canvas 2D e laboratório PixiJS 8. React, TypeScript, Vite e `@pixi/tilemap` não estavam instalados no projeto; não foram introduzidos, nem o motor Rust/WASM foi alterado.
- Blender gerou um candidato inédito, mas não há modelo 3D externo usado nem processamento de quantização pixel art no script de render. Não promovemos esse asset por não ter demonstrado compatibilidade estilística.

## Comandos

```sh
npm run tools:install-tiled        # opcional se o AppImage local não existir
npm run tools:install-blender      # opcional; Ubuntu 24.04, extração local
npm run build:graphics-poc         # Tiled --evaluate + scene adapters + Pixi bundle
npm run build:graphics-asset-catalog
npm run build:livestock-animation-atlas
npm run render:blender-demo
npm run capture:graphics-ranch-v4
npm run compare:graphics-ranch-v4
npm run test:graphics-screenshots
npm start                          # preview do produto; /graphics-poc/ranch-v4.html
```

O trabalho preserva a cena demonstrável em vez de tratar a arquitetura completa como concluída. Próximo passo de engenharia é substituir posições manuais do grafo V4 por constraints/grammar reutilizáveis e só então validar layouts realmente diferentes.
