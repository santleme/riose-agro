# Próximo MVP: comparação controlada de manejo

## Incrementos entregues

O MVP agora compara duas projeções de 30 dias a partir do mesmo snapshot: pasto e confinamento. Dieta, suplemento, clima, animais, pesos, pastagens, relógio e semente começam iguais. O local do rebanho é a única variável que muda entre as projeções. O atalho “Testar esse cenário” altera somente o local para confinamento. A tela principal continua sendo o mapa navegável da fazenda.

O motor continua JavaScript local e roda sem chave de API ou conexão externa. Ele já existia como JavaScript (não TypeScript); não houve migração de linguagem, Rust/WASM ou inclusão de Phaser/Tiled. Não há LLM conectado. A comparação e o estado inicial são reproduzíveis para a mesma semente e os mesmos parâmetros.

O inspetor também mantém até 40 transições recentes por animal. Cada registro guarda hora simulada, atividade, regra acionada, sede calculada e alojamento configurado. Isso expõe por que o código escolheu uma atividade e segue a separação de memória/percepção observada no Smallville como referência arquitetural. O histórico é determinístico e não é evidência de comportamento animal real.

## Verificação

- `npm test` cobre reprodução por semente, mudança exclusiva de alojamento, preservação do snapshot de entrada, repetibilidade da projeção e reprodução do histórico por animal.
- `node --check app.js`, `node --check worker.js` e `node --check engine.js` verificam sintaxe.
- `python3 -m http.server 8765` serve o app localmente; módulos e Web Worker precisam de HTTP, não `file://`.
- O teste manual de HTTP retornou `200 OK` para `/`.

## Métricas e parâmetros

O caso de comparação atualmente executado e as variáveis ainda necessárias para definir uma pergunta de campo estão em [`caso-zootecnico-demonstrativo.md`](caso-zootecnico-demonstrativo.md). O registro expandido de parâmetros, fontes contextuais e status de dados/licenças está em [`parametros-e-fontes.md`](parametros-e-fontes.md). Os números do motor continuam sem calibração: as referências não foram usadas como valores de entrada.

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

- Manter o mapa canvas e a renderização própria: já atendem a seleção/inspeção atual; não há necessidade observada de editor de tiles ou pathfinding neste incremento.
- Manter o motor determinístico local, sem dependência de API. A interface do sistema não precisa de LLM para comparação numérica.
- Adiar interface opcional para Hugging Face/Groq até que exista uma tarefa concreta de explicação/diálogo e backend protegido. Antes disso, confirmar em documentação oficial modelos disponíveis, protocolo de saída, limites e custos. A resposta de um modelo nunca será medida do motor.
- Não foi criado backend de cenários persistentes, exportação de semente/parâmetros, consumo medido ou validação biológica nesta entrega. O livro de consumo e a condição de pasto foram implementados como estimativas demonstrativas.
- As análises estáticas REA do app local e do recorte Smallville estão em `docs/evidence/`. Após esta etapa, REA analisou seis arquivos do app e emitiu Evidence `ev_4ad96b98a1908efa97adb3317d8fe978c8390027767c6aa5ca83a050266d4c68`, com o grafo compacto em `rea-agroville-issue3-static.json`. Em 11/10/2026, a análise Smallville repetida retornou o Evidence ID arquivado; `doctor --client codex` marcou registro e skill alinhados. O relatório geral aponta engines nativos opcionais ausentes, desnecessários para análise JavaScript. O `doctor` sob Node Linux 20.20.2 do WSL marca Node incompatível ao tentar diagnosticar a configuração Windows; para REA use o Node Windows 24.19.0 do Codex. O comando global `rea` não está no PATH WSL e o MCP ainda não aparece nesta sessão; é necessário reiniciar o Codex. A observação passiva da demo continua pendente porque o Chrome CDP em `127.0.0.1:9222` estava inacessível e a URL pública não abriu na ferramenta de navegação; a tarefa está atribuída a `GUZZBR1`.
- O repositório privado [santleme/riose-agro](https://github.com/santleme/riose-agro) recebeu o código no commit `5b8034a`. A issue #3 (consumo e estoque por piquete) foi concluída no commit `17bce17`. As issues #1, #2 e #6 seguem com `santleme`; as issues #4, #5, #7, #8 e #10 estão atribuídas ao contributor `GUZZBR1`. As issues #3, #9 e #11 foram fechadas após entrega.

## Próximos passos recomendados

1. Tornar a comparação uma entidade exportável com semente, estado inicial, parâmetros, intervalo e fator alterado em JSON/CSV.
2. Separar cenários do estado vivo do mapa, para que o usuário consiga nomear, salvar e repetir intervenções.
3. Definir uma pergunta zootécnica com especialista, selecionar dados de entrada e referência científica, e validar as saídas antes de rotular qualquer número como previsão.
4. Medir desempenho e cobertura de testes antes de considerar migração de engine ou renderer.
5. Reiniciar o Codex, abrir a demo num Chrome com CDP elegível e fazer captura passiva pelo REA; comparar essa evidência com o código local.
6. Avaliar filtros e recuperação por relevância na linha do tempo quando houver mais eventos e requisitos observados de usuários.

## Backlog

As issues e seus critérios de aceite estão no [repositório privado](https://github.com/santleme/riose-agro/issues). A issue [#3](https://github.com/santleme/riose-agro/issues/3) registra o consumo e estoque de forragem entregues; a [#8](https://github.com/santleme/riose-agro/issues/8) acompanha isolamento da aleatoriedade, e a [#10](https://github.com/santleme/riose-agro/issues/10) acompanha observação passiva REA. As issues de colaboração #4, #5, #7, #8 e #10 estão atribuídas a `GUZZBR1`; #1, #2 e #6 estão atribuídas a `santleme`.
