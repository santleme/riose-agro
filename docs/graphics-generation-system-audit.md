# Auditoria do sistema gráfico e plano de geração

Data da auditoria: 2026-10-14. Escopo: runtime visual, cenas, assets, geração, editor e QA presentes neste checkout.

> Este documento registra a auditoria que antecedeu a implementação. As avaliações de ferramentas, comandos e entrega abaixo foram atualizados em [riose-graphics-implementation-report.md](riose-graphics-implementation-report.md); leia-o como registro posterior e prevalente da vertical slice.

## Estado encontrado

- O produto não está estruturado como React + TypeScript + Vite. A aplicação principal é JavaScript servido por `src/server/server.js`; há um editor isométrico em `public/assets/scenario-editor` e um laboratório em `graphics-poc`. Ambos usam Canvas 2D e PixiJS 8. O pacote instala `pixi.js` 8.22.x e não instala `@pixi/tilemap`, React, Vite ou TypeScript. Esta entrega mantém a arquitetura existente; não adiciona uma migração de stack.
- A cena mantém coordenadas de grade/world separadas da projeção `isometric-2-to-1`. O editor usa `projectIso`/`unprojectIso`, pan e zoom, resize observer, culling por bounds, ordenação por profundidade e camadas. O Graphics Lab oferece Canvas e Pixi. A aplicação de produto também tem um canvas 2D independente.
- `public/assets/scenario-editor/scene-layout.js` gera layouts determinísticos de corte e leite com seed, piquetes, cercas, estradas, prefabs e validação de footprint/colisão. `graphics-poc/source/main-composer-v1/*.json` alimenta adapters que produzem `scene.json` e `scenes/dairy.json`. O formato Composer/adapter e o schema `schemas/visual-scene.schema.json` são contratos distintos; o adapter registra campos sem mapeamento.
- Ativos renderizados: sete atlas usados pelo Composer (`farm`, `handling-review`, `environment-review`, `infrastructure-review`, `technology-review`, `animals-review`, `dairy`) e nove imagens isoladas em `graphics-poc/assets/dairy`, além do Nelore adulto. O render manifest atual contém 35 entradas, das quais 28 estão como `REVIEW` e sete como `UNRESOLVED`. O estado é levado à cena e não representa aprovação artística.
- Os quadros de animais são imagens estáticas. Não há spritesheet nem clips `idle`, `walk`, `graze` ou `drink` declarados nos manifests. O movimento visual no Graphics Lab é uma representação do estado recebido; não equivale a animação por quadros. A cena leiteira é visual e não habilita motor numérico leiteiro.
- O asset registry recém-adicionado deriva do renderer manifest e do source manifest. Ele inclui dimensão em pixels do frame, frame do atlas, escala de exibição, projeção, footprint em células, pivô normalizado, colisão, terreno, animações, proveniência e estado de revisão. Em assets fora de terreno, a perspectiva 3/4 é marcada como inferida e precisa de revisão. Colisão é nula para ativos não bloqueantes; footprint retangular para bloqueantes deriva da flag e footprint existentes, não de uma máscara de pixels.
- O QA disponível inclui testes de contrato/layout e regressão de screenshot com Chromium/Playwright via CDP, usando SwiftShader. Os fixtures `tests/fixtures/graphics-screenshots-v1` cobrem corte, leite e edição de zona. O fluxo atual valida pixels do canvas em viewport fixa; não valida todas as escalas ou posições da câmera e não substitui aprovação visual humana.

## Assets e lacunas verificáveis

- O registry não promove arte nem inventa licença. Entradas sem source record ficam `UNRESOLVED`; assets de geração interna continuam com os status de revisão existentes.
- Há sprites suficientes para um protótipo de corte e uma prévia leiteira, mas não para afirmar direção de arte final em pixel art. A maior parte das entradas do Composer segue em revisão, e os sete IDs não resolvidos no render manifest continuam explicitamente não resolvidos.
- Não foram encontrados quadros de animação de bovinos, ângulos/direções adicionais ou metadados de transição de água. Por isso não há água animada nem estados de animação autorais no runtime.
- O footprint 1×1 de assets cujo manifesto só fornece uma célula não descreve necessariamente a área visual inteira. A âncora, footprint operacional e máscara de colisão de prédios altos precisam de revisão artística/técnica antes de liberar novas cenas com posicionamento autônomo amplo.
- O simulador não oferece uma variável validada de estresse hídrico/pasto para todas as cenas. `weather` e `forageShortfallKgDM` não devem ser convertidos automaticamente em estado hídrico/biomassa sem modelo e dados de suporte. A terceira cena adicionada é uma variante visual-only de pastagem seca, marcada `visual-only-unvalidated`; seus controles numéricos ficam desabilitados.

## Ferramentas avaliadas

- **Tiled CLI / API:** avaliação inicial antes da slice. Depois, foi obtido o AppImage oficial Tiled 1.12.2 e executado `--evaluate`; o build real de TMJ/TMX/TSX está registrado no relatório de implementação.
- **Blender Python:** avaliação inicial antes da slice. Depois, Blender 4.0.2 foi executado em background/Cycles CPU para fabricar um bebedouro demonstrativo; arquivos e limitações estão no relatório.
- **Aseprite CLI:** não foi encontrado executável Aseprite. Depois, uma alternativa operacional Pillow foi adicionada e executada para normalizar strips, produzir metadados e empacotar atlas; seus outputs seguem `REVIEW`.
- **`@pixi/tilemap`:** não é dependência atual. O renderer já culla terreno por viewport e cria sprites a partir do atlas, mas o benefício real de batching tilemap precisa ser medido com cargas e browser suportado. Não foi adicionado sem benchmark. O caminho básico atual funciona com Canvas 2D e PixiJS, sem GPU dedicada.

## Comandos disponíveis

```sh
npm run build:graphics-asset-registry
npm run validate:graphics-asset-registry
npm run build:graphics-poc
npm run test:graphics-screenshots
npm start
```

O primeiro comando refaz `graphics-poc/asset-registry.json` a partir dos dois manifests-fonte. O validador compara o registry ao resultado derivado e falha se estiver desatualizado ou sem metadados espaciais mínimos. `npm run build:graphics-poc` recompõe as cenas de corte/leite e a variante seca; depois de `npm start`, abra `/graphics-poc/` para pré-visualizar as três. Isso ainda não constitui um gerador semântico multi-cena autônomo.

## Etapas recomendadas

1. Fechar uma cena vertical de corte com os ativos aprovados, footprint e acessos revisados; validar visualmente os screenshots em zoom e viewport distintos.
2. Versionar um schema semântico com propriedades, piquetes, conectividade, rebanhos e relações, mantendo a representação gráfica em adapters. Converter as regras atuais gradualmente e rejeitar assets sem pivô/footprint.
3. Separar a composição em grammar, constraints, conectividade de caminhos, autotiling e regras de densidade; manter seed e validações como invariantes.
4. Conectar dados e estado hídrico cientificamente suportados para substituir a demonstração visual-only.
5. Expandir QA para capturas de múltiplas câmeras/escala, checagens de bounds/ordem/asset/animação e relatório antes/depois; guardar evidência do browser no release.

## Resultado da auditoria inicial

Na auditoria foram identificados o catálogo espacial, a variante visual-only de pastagem seca e as lacunas listadas acima. A implementação posterior adicionou uma slice Pixi/Tiled animada por quadros, fabricação Blender e captura multi-viewport. A engine autônoma completa, animação de deslocamento, cena seca cientificamente validada e aprovação estética continuam pendentes; detalhes no relatório posterior.

## Documentação primária consultada

- [Tiled scripting](https://doc.mapeditor.org/en/stable/manual/scripting/)
- [Tiled export](https://doc.mapeditor.org/en/stable/manual/export/)
- [Blender Python background mode](https://docs.blender.org/api/current/info_tips_and_tricks.html)
- [Aseprite CLI](https://www.aseprite.org/docs/cli/)
