# Próximo MVP: comparação controlada de manejo

## Incrementos entregues

O MVP agora compara duas projeções de 30 dias a partir do mesmo snapshot: pasto e confinamento. Dieta, suplemento, clima, animais, pesos, pastagens, relógio e semente começam iguais. O local do rebanho é a única variável que muda entre as projeções. O atalho “Testar esse cenário” altera somente o local para confinamento. A tela principal continua sendo o mapa navegável da fazenda.

O motor continua JavaScript local e roda sem chave de API ou conexão externa. Ele já existia como JavaScript (não TypeScript); não houve migração de linguagem, Rust/WASM ou inclusão de Phaser/Tiled. Não há LLM conectado. A comparação e o estado inicial são reproduzíveis para a mesma semente e os mesmos parâmetros.

O inspetor também mantém até 40 transições recentes por animal. Cada registro guarda hora simulada, atividade, regra acionada, sede calculada e alojamento configurado. Isso expõe por que o código escolheu uma atividade e segue a separação de memória/percepção observada no Smallville como referência arquitetural. O histórico é determinístico e não é evidência de comportamento animal real.

## Verificação

- `npm test`: 18 testes cobrem comparação controlada, ingestão/estoque, manifestos, cenários determinísticos, explicação opcional e fallback.
- `node --check app.js`, `worker.js`, `engine.js` e `server.js` verificam sintaxe JavaScript.
- `git diff --check` deve ser executado sobre os arquivos de código e documentação incluídos na entrega.

## Métricas e parâmetros

O caso de comparação atualmente executado e as variáveis ainda necessárias para definir uma pergunta de campo estão em [`caso-zootecnico-demonstrativo.md`](caso-zootecnico-demonstrativo.md). O registro expandido de parâmetros, fontes contextuais e status de dados/licenças está em [`parametros-e-fontes.md`](parametros-e-fontes.md). Os números do motor continuam sem calibração: as referências não foram usadas como valores de entrada.

A triagem de fontes Hugging Face, Kaggle, Embrapa e Mendeley, junto com a recomendação de próximos protótipos, está em [`fontes-dados-candidatos.md`](fontes-dados-candidatos.md). A recomendação atual é concluir primeiro a definição do caso (#1) e a busca/validação de dados (#6); prototipar a experiência de cenários depois que a infraestrutura nas issues #4/#5/#8 estiver pronta.

O peso é exibido em kg por animal; o consumo estimado em kg MS por lote e por animal acumulado durante o período projetado; o estoque de forragem em kg MS por piquete no início e no fim; e o custo em R$ acumulados da alimentação do lote. Esses valores são exibidos lado a lado para pasto e confinamento.

O livro de consumo soma: (1) forragem retirada do piquete no modo pasto; (2) a demanda-base atribuída como alimento no modo confinamento; (3) suplemento configurado, dividido por 24 em cada passo horário; e (4) o adicional fixo da dieta balanceada (1,8 kg MS/animal/dia) ou concentrada (3,2 kg MS/animal/dia). A demanda-base é 8 kg MS/animal/dia na referência de 360 kg, escalada pelo peso e pelo multiplicador de clima. A forragem do pasto é limitada pelo estoque disponível; no confinamento, o estoque de pasto não é consumido. Os fatores 1,2 e 1,35 ainda aplicados no cálculo interno de energia não alteram os kg MS contabilizados no livro de consumo.

O estoque por piquete inicia em 1.800 kg MS, recebe crescimento assumido ao longo do tempo e é limitado artificialmente a 2.400 kg MS por piquete. É uma massa simulada, sem área, teor de matéria seca medido, estrutura da pastagem ou categoria agronômica de condição. Não representa lotação, disponibilidade real ou recomendação de manejo.

Todos os parâmetros abaixo são hipóteses internas do protótipo, sem fonte biológica validada, calibração ou validação contra medidas independentes:

| Parâmetro no motor | Unidade usada pelo código | Hipótese atual | Fonte / limitação |
|---|---|---|---|
| `baseDemandKgDM` | kg MS/animal/dia | 8 na referência | Assumido; não é uma exigência nutricional validada. |
| `dailyPastureGrowthKgDM` | kg MS/piquete/dia | 35 | Assumido; não varia com estação, solo ou área real. |
| `initialPastureKgDM` | kg MS/piquete | 1.800 | Valor inicial ilustrativo, sem medição de biomassa. |
| `supplementPrice`, `balancedPrice`, `concentratePrice` | R$/kg MS (aproximação do código) | 1,80 / 1,60 / 2,10 | Preços fixos de demonstração; não são cotações de mercado. |
| `maintenanceKgDM` | kg MS/animal/dia na referência de 360 kg | 5,3 | Termo simplificado proporcional ao peso, sem composição nutricional. |
| Extra da dieta balanceada / concentrada | kg MS/animal/dia (constantes internas) | 1,8 / 3,2 | Acréscimos fixos de demonstração; não especificam proteína, energia ou fibra. |
| `gainFactor` | fator aplicado à diferença horária de ingestão/manutenção | 0,22 | Conversão arbitrária para demonstrar trajetória de peso; não é equação de ganho validada. |
| Multiplicadores de calor/chuva | adimensionais | Demanda de calor 0,8; crescimento do pasto em chuva 1,3 e calor 0,65 | Regras assumidas; não representam efeitos fisiológicos ou agronômicos validados. |
| Limite de forragem por piquete | kg MS/piquete | 2.400 | Teto artificial de estoque do motor, sem inferência de capacidade de suporte. |
| Indicador `stress` | índice sem unidade | Calor 28, confinamento 12, caso-base 5 | Pontuação fixa de interface; não é medida de estresse animal. |

Peso, consumo, custos, estresse, forragem e ganhos são **demonstrativos**. Não usar para formular dieta, definir lotação ou tomar decisão de manejo. O custo inclui taxas simplificadas e não contempla mão de obra, sanidade, infraestrutura, frete ou desperdício. O cálculo horário não representa eventos reais de refeição.

## Decisões e limites

- Manter o mapa canvas e a renderização própria: já atendem à seleção e inspeção atuais.
- Manter o motor determinístico local. Os cenários nomeados ficam no armazenamento do navegador; manifestos JSON registram snapshot, semente, período, fator e configurações para reprodução.
- A aleatoriedade de modelo e locomoção usa fluxos separados. Snapshots antigos recebem uma semente de locomoção derivada de forma determinística; a trajetória de locomoção antiga não é preservada.
- A explicação por LLM é opcional, isolada no backend e incapaz de aplicar ações. Sem chave ou rede, o fallback determinístico continua disponível. Textos explicativos são “não medidos”.
- As equações, consumo e estoque de forragem continuam sendo hipóteses demonstrativas; não há calibração nem validação biológica.
- A análise estática REA está arquivada em `docs/evidence/`. A preparação do REA foi confirmada pelo `doctor`, mas `list-browser-targets` ainda retorna `endpoint_unreachable`; portanto, não há alvo CDP nem Evidence de captura passiva da demo. Essa evidência de runtime continua pendente.
- As issues #4, #5, #7 e #8 estão implementadas localmente e serão enviadas em PR para revisão. As issues #1 e #6 ainda exigem definição de domínio e dados; a #10 segue pendente da captura passiva REA.

## Próximos passos recomendados

1. Definir com especialista a pergunta zootécnica, categoria, duração e desfecho (#1).
2. Obter dados licenciados e protocolo independente para validação (#6).
3. Concluir a captura passiva da demo com REA quando um alvo CDP estiver acessível (#10).
4. Medir desempenho e cobertura antes de considerar migração de engine ou renderer.
5. Avaliar filtros e recuperação por relevância quando houver requisitos observados de usuários.

## Backlog

As issues e seus critérios de aceite estão no [repositório privado](https://github.com/santleme/riose-agro/issues). A issue [#3](https://github.com/santleme/riose-agro/issues/3) registra o consumo e estoque de forragem entregues; a [#8](https://github.com/santleme/riose-agro/issues/8) acompanha isolamento da aleatoriedade, e a [#10](https://github.com/santleme/riose-agro/issues/10) acompanha observação passiva REA. As issues de colaboração #4, #5, #7, #8 e #10 estão atribuídas a `GUZZBR1`; #1 e #6 estão atribuídas a `santleme`. A issue #2, sobre documentação de parâmetros e fontes, foi concluída mantendo explícito que os valores atuais são demonstrativos e sem calibração externa.
