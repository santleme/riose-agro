# Caso atual e decisão zootécnica pendente

Revisão: 11/10/2026.

## O que o software executa hoje

O caso operacional do MVP é uma **comparação demonstrativa**, não um caso de produção validado:

> Partindo do mesmo lote virtual de 24 bovinos de corte, com pesos iniciais gerados entre 330 e 400 kg, como mudam os resultados calculados em 30 dias quando o alojamento passa de pasto para confinamento?

O motor parte do mesmo snapshot e semente nos dois lados. Dieta, suplemento, classe climática e demais condições permanecem iguais; alojamento é o único fator alterado. A saída inclui peso médio simulado, consumo calculado de matéria seca (MS), custo de alimentação calculado e estoque de forragem simulado por piquete. Isso descreve o comportamento atual do programa, não recomenda um manejo.

## Variáveis disponíveis no MVP

| Variável | Unidade / domínio | Estado atual |
|---|---|---|
| Tamanho do lote | cabeças | 24 por padrão; configurável no motor |
| Peso inicial individual | kg de peso vivo | 330–400 kg, gerado pela semente |
| Duração da comparação | dias | 30 no fluxo do MVP; o motor aceita 1–365 |
| Alojamento | pasto / confinamento | único fator da comparação |
| Dieta | pasto / balanceada / concentrada | enumeração demonstrativa; não contém formulação ou análise de nutrientes |
| Suplemento | kg MS/cabeça/dia | 0–4, controlado na interface |
| Clima | normal / calor / chuva | classe escolhida, sem série observada ou localização |
| Pasto | kg MS/piquete | 4 piquetes abstratos; sem área, espécie, medição ou altura |
| Resultados | kg, kg MS, R$ ou índice | saídas internas do modelo, sem validação independente |

**Desfecho primário provisório de software:** diferença no peso médio simulado no dia 30. **Secundários:** diferenças em consumo calculado por fonte e por cabeça/lote, custo calculado do lote e estoque final simulado em cada piquete. Estes desfechos servem para testar interface, reprodutibilidade e consistência do código; não são estimativas de efeito zootécnico.

## O que falta para escolher um caso real

Um(a) especialista e o responsável pelos dados precisam definir antes de uma validação:

- pergunta de manejo e população-alvo: categoria, raça/cruzamento, sexo/castração, idade, faixa de peso e condição corporal;
- local, época, duração e sistemas comparados; confirmar se a intervenção relevante é alojamento ou uma mudança de dieta;
- composição e oferta das dietas, análise de matéria seca e nutrientes, protocolo de adaptação e medidas independentes de consumo;
- forrageira, área dos piquetes, massa/altura, amostragem de biomassa, taxa de lotação e manejo;
- clima observado, água, sanidade, protocolo de pesagem e fatores mantidos constantes;
- desfecho primário, protocolo de medição, população de validade e confundidores;
- origem, versão, permissão/licença e separação entre dados de calibração e validação.

Até essas decisões serem tomadas, não há uma população real ou um período de campo defensável para o motor. O projeto não tem dados medidos de animais nem pastos. Não se pode inferir área, lotação ou condição do pasto a partir dos estoques abstratos em kg MS/piquete. A issue [#1](https://github.com/santleme/riose-agro/issues/1) permanece aberta para revisão especializada; a issue [#6](https://github.com/santleme/riose-agro/issues/6) permanece aberta para validação independente.
