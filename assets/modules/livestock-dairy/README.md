# Módulo visual — pecuária leiteira

Expansão separada do núcleo de pecuária de corte. O catálogo contém exatamente 20 arquétipos animais, 50 entradas de infraestrutura e 30 estados reutilizáveis. `catalog.json` distingue referências compartilhadas, itens planejados e geração em andamento; apenas arquivos PNG presentes são integráveis. Itens comuns apontam para IDs existentes e não duplicam pixels.

O pack prioritário de 15 itens está no catálogo. Quatro arquétipos leiteiros e quatro instalações próprias são produzidos como conteúdo do módulo; cocho, bebedouro, cerca, gateway, brinco e leitor são referências compartilhadas. Coleira de atividade é um asset leiteiro novo. Novas imagens ficam em `source/`, os PNGs prontos ficam em `assets/`, e o manifesto runtime do módulo aponta para seus próprios atlas e para IDs do core.

## Regras de integração

- Não importar este manifesto automaticamente no pacote `livestock-core`.
- Resolução de `sourceRef` compartilhada é delegada ao manifesto runtime existente.
- `footprint` é medido em tiles lógicos; `anchor` marca contato com solo.
- Sprites de animais usam âncora inferior central; infraestrutura usa o centro da borda sul.
- Imagens geradas ficam em revisão até aprovação artística; isso não bloqueia o catálogo nem a composição do cenário.
- Estados são modificadores semânticos do runtime, não cópias de sprites por estado.

## Prioridade de produção

1. **Essenciais:** pack de 15 itens em `catalog.json`; nove sprites locais já foram gerados e seis slots reutilizam referências do core. O catálogo mostra separadamente imagens candidatas e ativos ainda planejados.
2. **Expansão de infraestrutura:** completar as 50 entradas com bezerreiro/maternidade como módulos de edifício, free-stall/compost-barn como variantes estruturais do galpão, e manejo de silagem, resíduos, água, cercas, rotas e serviços.
3. **Estados visuais:** implementar os 30 estados catalogados como modificadores de sprites, níveis de preenchimento e sinais operacionais.
4. **Tecnologia:** ligar brinco, leitor, gateway, coleira, balança e estação ao monitoramento de lote e eventos de ordenha, sem futurismo decorativo.

## Limite visual desta amostra

Holandesa, Girolando e bezerra têm silhuetas legíveis e alfa limpo. A novilha gerada ficou próxima da vaca adulta em proporção; está incluída como candidata e deve ser substituída numa próxima rodada de geração específica. A arte dos sprites segue a ilustração isométrica aprovada; a folhagem/relva base usada na prévia mantém o tile do core e ainda evidencia suas bordas de módulo. O atlas foi separado sem alterar o núcleo.
