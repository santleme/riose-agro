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

O peso é exibido em kg por animal, a forragem em kg de matéria seca (MS) para o lote/área simulados, e o custo em R$ acumulados da alimentação do lote. A comparação mostra peso médio e custo acumulado ao final do período. O período da comparação é indicado em dias.

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

Peso, consumo implícito, custos, estresse, forragem e ganhos são **demonstrativos**. Não usar para formular dieta, definir lotação ou tomar decisão de manejo. O custo inclui taxas simplificadas e não contempla mão de obra, sanidade, infraestrutura, frete ou desperdício. O cálculo horário não representa eventos reais de refeição.

## Decisões e limites

- Manter o mapa canvas e a renderização própria: já atendem a seleção/inspeção atual; não há necessidade observada de editor de tiles ou pathfinding neste incremento.
- Manter o motor determinístico local, sem dependência de API. A interface do sistema não precisa de LLM para comparação numérica.
- Adiar interface opcional para Hugging Face/Groq até que exista uma tarefa concreta de explicação/diálogo e backend protegido. Antes disso, confirmar em documentação oficial modelos disponíveis, protocolo de saída, limites e custos. A resposta de um modelo nunca será medida do motor.
- Não foi criado backend de cenários persistentes, exportação de semente/parâmetros, consumo medido ou validação biológica nesta entrega.
- A análise estática REA do app local e de um recorte do frontend Smallville está arquivada em `docs/evidence/`. Em 11/10/2026, a análise Smallville foi repetida com o Node Windows 24.19.0 empacotado e devolveu o mesmo Evidence ID; `doctor --client codex` marcou o registro alinhado e a skill instalada. O relatório geral ainda aponta engines nativos opcionais ausentes, que não são necessários para essa análise JavaScript. O `doctor` sob Node Linux 20.20.2 do WSL não é um diagnóstico válido para essa configuração Windows: ele marca Node incompatível e registro divergente. O comando global `rea` não está no PATH WSL e o MCP ainda não aparece nesta sessão; é necessário reiniciar o Codex. A observação passiva da demo continua pendente porque o Chrome CDP em `127.0.0.1:9222` estava inacessível e a URL pública não abriu na ferramenta de navegação.
- O repositório privado [santleme/riose-agro](https://github.com/santleme/riose-agro) foi criado e sete issues foram abertas antes deste incremento. Os logins corretos são `santleme` e `GUZZBR`; o convite a GUZZBR continua pendente, então a atribuição formal a essa conta ainda não é possível.

## Próximos passos recomendados

1. Tornar a comparação uma entidade exportável com semente, estado inicial, parâmetros, intervalo e fator alterado em JSON/CSV.
2. Separar cenários do estado vivo do mapa, para que o usuário consiga nomear, salvar e repetir intervenções.
3. Definir uma pergunta zootécnica com especialista, selecionar dados de entrada e referência científica, e validar as saídas antes de rotular qualquer número como previsão.
4. Medir desempenho e cobertura de testes antes de considerar migração de engine ou renderer.
5. Reiniciar o Codex, abrir a demo num Chrome com CDP elegível e fazer captura passiva pelo REA; comparar essa evidência com o código local.
6. Avaliar filtros e recuperação por relevância na linha do tempo quando houver mais eventos e requisitos observados de usuários.

## Backlog

As issues e seus critérios de aceite estão no [repositório privado](https://github.com/santleme/riose-agro/issues). A auditoria abriu a issue [#8 para isolar a aleatoriedade de locomoção](https://github.com/santleme/riose-agro/issues/8). As tarefas atribuídas ao usuário usam o login `santleme`; as tarefas planejadas para `GUZZBR` aguardam a aceitação do convite para atribuição formal.
