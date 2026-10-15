# Riose V8 — plano de continuação

Este documento acompanha a reconstrução integrada ao editor PixiJS 8. O escopo original está em `RIOSE — ISOMETRIC WORLD ENGINE V8` na solicitação desta tarefa. Use apenas o worktree local e preserve os dados científicos existentes.

## Estado verificável até 2026-10-15

Direção arquitetural em [`riose-v8-engine-architecture.md`](riose-v8-engine-architecture.md): PixiJS 8 + JavaScript ES Modules, schema validado, world model x/y/z, assembly explícito e bridge visual isolada. É uma decisão de stack e arquitetura; os marcos incompletos abaixo continuam incompletos.

- Três cenas selecionáveis no editor: `?scene=terrain-v8`, `?scene=farm-assembly-v8` e `?scene=farm-final-v8`.
- Prova de terreno de 16×12 células: duas cotas, grama, estrada, rampa, água, ponte e faces de barranco. A captura confirmou 178 células navegáveis, 40 segmentos de barranco e travessia conectada.
- Prova de montagem: sede e galpão elevados, acesso viário, porteira, bebedouro e cinco bovinos dentro do piquete. A cerca do piquete de prova é feita de módulos com sockets.
- Cena final artesanal de 20×18: três níveis de altura, 334 células navegáveis, 80 segmentos de barranco, caminho de 31 células, ponte, três zonas de pastagem, lavoura, sede, galpão, curral, moinho, 124 prefabs e 20 bovinos.
- Decals de estrada agora têm sprites 2:1 separados para cada eixo e cruzamentos, com paleta de terra mais clara; a inspeção mostra continuidade melhor, ainda com algumas juntas visualmente duras.
- As três pastagens agora usam 21 segmentos raster 2:1 e três porteiras modulares. Os sockets fecham os anéis e cada porteira aponta para uma célula de estrada a no máximo uma unidade; os metadados de footprint e colisão são verificados.
- A câmera inicial da cena final usa mais da área disponível, e a composição ganhou árvores de borda e bosque. O adensamento controlado acrescentou bovinos somente em células de pastagem livres. Ainda há bastante grama vazia em relação à referência.
- A captura atual alterna 21 células de pasto com uma variante raster derivada do asset de pastagem existente. A malha, os níveis e a conectividade permanecem iguais; casa e galpão agora registram sockets para células da rota viária. A inspeção obrigou a desfazer uma posição da sede que cruzava a lavoura.
- O renderer ordena prefabs pelo canto de contato mais próximo da câmera, lendo a elevação lógica daquele ponto. Ainda faltam validações de oclusão por footprint completo, sombras e cache estático.
- Pipeline Pillow produz PNGs transparentes, atlas, metadados e folhas de contato. A seleção atual dos 42 sprites está em `assets/generated/world-v8/riose-v8-selected-assets-contact.png`; a folha de catálogo anterior está em `assets/generated/world-v8/terrain-atlas-v8-contact.png`.
- Capturas do terreno, montagem e fazenda final em 1536×960, com e sem grade, em `artifacts/graphics/{terrain-v8,farm-assembly-v8,farm-final-v8}/`.
- O manifesto V8 registra agora revisão, fonte, arquivo de origem, referências e estado pendente de revisão visual por sprite. Teste impede tratar candidato sem revisão humana como aprovado.
- Validação no Chromium headless em 2026-10-15: renderer Pixi, viewport 1536×960, sem erros de runtime, 334 células navegáveis, 80 faces de barranco, 31 células de rota e 650 sprites visíveis. Última captura final: 46,7 FPS médios, p95 de frame 33,4 ms, p95 de pintura 1,0 ms. Valores desta execução não constituem orçamento aprovado.
- Testes geométricos atuais: `node --test tests/terrain-world-v8.test.js tests/farm-assembly-v8.test.js tests/farm-final-v8.test.js` — 17 aprovados.
- Os assets novos continuam `REVIEW`. A captura ainda está longe da referência em densidade de chão, desenho contínuo das vias, integração do rio e consistência de escala/estilo. A aprovação artística permanece pendente.

## Próximas etapas

1. **Concluída — prova visual do terreno:** confirmar projeção, ligação estrada/rampa/ponte, materiais e captura limpa. Registrar quaisquer regressões no próximo ciclo.
2. **Concluída parcialmente — prova de montagem:** sete peças essenciais, cinco bovinos, anel modular e bebedouro conectados na cena isolada. Na fazenda final, os três anéis e as porteiras conectadas às vias estão implementados; revisar proporções e colisões visuais na escala final.
3. **Concluída parcialmente — terreno com altura real:** manter o mapa x/y/z e a rota navegável; melhorar a composição das faces, transições e caminho de terra. O modelo existe, a revisão visual segue aberta.
4. **Ativa — direção de arte e composição:** comparar cada captura com a referência; reduzir o vazio, unir as juntas das estradas, integrar a água à margem inferior e harmonizar escala, paleta e acabamento dos sprites. Manter a cena composta por peças, sem substituir o mundo por uma imagem única. A captura atual ainda reprova a semelhança: rio e gramado continuam muito regulares, a casa precisa de nova avaliação visual e há assets com acabamento misturado.
5. **Pendente — renderer de produção:** completar oclusão por footprint, sombras de contato, câmera livre, culling e cache estático. Repetir medições após corrigir a cena.
6. **Pendente — animação funcional:** os quatro clips têm frames raster distintos, mas a cena final ainda não simula deslocamento contínuo dos bovinos nem testa colisão com cada cerca/edifício. Restringir mudanças de elevação às rotas navegáveis e manter os dados demonstrativos separados do Worker científico.
7. **Pendente — aprovação dos assets:** substituir sprites marcados `REVIEW` quando necessário e registrar proveniência, pivôs, footprints e bounding boxes. Não declarar igualdade visual antes da inspeção da composição completa.
8. **Adiada — generalização de cenas/seeds:** a variação existente desloca apenas árvores decorativas. Só ampliar a geração após a cena artesanal e seus três marcos visuais estarem aprovados.

## Comandos para retomar

```bash
npm run build:graphics-poc
node --test tests/terrain-world-v8.test.js tests/farm-assembly-v8.test.js tests/farm-final-v8.test.js
RIOSE_V8_SCENE=terrain-v8 node scripts/capture-terrain-v8.mjs
RIOSE_V8_SCENE=farm-assembly-v8 node scripts/capture-terrain-v8.mjs
RIOSE_V8_SCENE=farm-final-v8 node scripts/capture-terrain-v8.mjs
```

Execute na branch `codex/riose-visual-rebuild`, no worktree local atual, sem consultar `main` ou repositório remoto.
