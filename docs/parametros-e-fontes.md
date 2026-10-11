# Parâmetros, fontes e licenças

Revisão documental: 11/10/2026.

## Estado dos valores no motor

Os números abaixo são hipóteses internas do protótipo. Nenhuma tabela, artigo ou base de dados externa foi importada para `engine.js`, e nenhuma constante biológica foi calibrada a partir das fontes desta página. A publicação de fontes serve para orientar uma futura escolha e validação de parâmetros; não é evidência de que os valores atuais sejam corretos.

| Valor/cálculo no motor | Unidade de cálculo usada | Hipótese atual | Fonte do valor atual / população | Limitação e licença |
|---|---|---|---|---|
| `baseDemandKgDM = 8`, escalado por peso/360 e multiplicador de calor `0.8` | kg MS/cabeça/dia antes da divisão horária | Demanda-base arbitrária na referência de 360 kg | Código local; não há fonte externa nem população calibrada | Não é equação de exigência ou ingestão validada; no pasto a retirada ainda é limitada pelo estoque, no confinamento é contabilizada como alimento-base. |
| `maintenanceKgDM = 5.3` e `gainFactor = 0.22` | kg MS/cabeça/dia na referência; fator aplicado a cada passo horário | Termo de manutenção e conversão simplificada para mudança de peso | Código local; população não estabelecida | Não modela energia metabolizável, composição da dieta ou eficiência validada; peso resultante é demonstrativo. |
| Ingestão energética `supplement × 1.2` e extra de dieta `× 1.35` | fatores adimensionais | Ponderações arbitrárias internas | Código local | Não alteram o livro de kg MS; não têm fonte nem interpretação nutricional validada. |
| Extra balanceado `1.8` / concentrado `3.2` | kg MS/cabeça/dia | Quantidades fixas por rótulo de dieta | Código local; nenhum ingrediente ou formulação | Sem análise de MS/nutrientes e sem correspondência a uma dieta real. |
| `dailyPastureGrowthKgDM = 35`; clima chuva `×1.3`, calor `×0.65`; teto `2400` | kg MS/piquete/dia; fator; kg MS/piquete | Crescimento, resposta ao clima e teto artificiais | Código local; espécie, solo, local e estação não definidos | Quatro piquetes sem área, medição, composição, estrutura ou perdas; não é produção por hectare nem condição agronômica. |
| `initialPastureKgDM = 1800` | kg MS/piquete | Estoque inicial ilustrativo | Código local; sem amostragem | Não representa massa de forragem medida ou disponibilidade utilizável. |
| Suplemento configurável `0–4`; `supplementPrice=1.8` | kg MS/cabeça/dia; R$/kg MS assumido | Faixa de UI e preço fixo | Código local; região/data/insumo ausentes | Preço não é cotação; custo não representa produto real. |
| `balancedPrice=1.6`, `concentratePrice=2.1`; base de confinamento `0.65` | R$/kg MS assumido | Preços fixos por categoria e alimento-base | Código local; sem ingredientes, região ou data | Valores ilustrativos, sem fonte de mercado; custo exclui mão de obra, sanidade, instalações, frete e desperdício. |
| População do demo: 24 animais padrão, pesos iniciais 330–400 kg; quatro piquetes | cabeças, kg de peso vivo, número | Geração pseudoaleatória determinística por semente | Código local; não corresponde a amostra de campo | Não define sexo, idade, raça, fase ou condição corporal; faixa e lote são escolhas de interface. |
| Sede: incremento 5/h ou 9/h no calor, gatilho `>65`, retorno a `12`; descanso 21h–06h | índice interno, hora | Regras fixas de atividade | Código local | Não são medidas fisiológicas ou observações comportamentais. |
| `stress`: 5 / 12 / 28 | índice sem unidade | Rótulos constantes segundo configuração | Código local | Não mede estresse animal. |
| Comparação de 30 dias | dias | Horizonte padrão de apresentação | Código/UI local | Não é duração experimental escolhida por fonte científica. |

Os valores da coluna “unidade” descrevem como o código os calcula, não garantem que representem corretamente uma unidade zootécnica de campo. Em especial, `maintenanceKgDM` é um termo de MS subtraído da ingestão; não equivale a exigência energética de manutenção.

## Fontes primárias consultadas para orientar a próxima etapa

| Fonte | Evidência relevante para desenho do caso | Uso permitido nesta documentação | Limite de aplicação ao MVP |
|---|---|---|---|
| Barioni et al., Embrapa Cerrados, *Tabelas para Estimativa de Ingestão de Matéria Seca de Bovinos de Corte em Crescimento em Pastejo* (Comunicado Técnico 142, 2007). [Registro Infoteca-e](https://www.infoteca.cnptia.embrapa.br/handle/doc/569918) · [PDF](https://www.infoteca.cnptia.embrapa.br/bitstream/doc/569918/1/comtec142.pdf) | A publicação explica que IMS depende de peso, estádio fisiológico e qualidade do alimento; é direcionada a bovinos em crescimento em pastejo. | Referência contextual para especificar categoria, condições e limites antes de selecionar uma equação. | Não adotamos suas tabelas nem importamos seus valores; não são universais e não validam o `baseDemandKgDM`. O repositório registra acesso aberto, mas não identifica licença de reutilização dos dados/tabelas; não os redistribuímos. |
| Martins et al., *Pesquisa Agropecuária Brasileira* 48(10), 2013, DOI [10.1590/S1678-3921.pab2013.v48.17678](https://doi.org/10.1590/S1678-3921.pab2013.v48.17678). [Página do artigo](https://apct.sede.embrapa.br/pab/pt_BR/article/view/17678) | Experimento com cultivares específicas de `Urochloa humidicola`, lotação contínua, períodos seco/águas e mensuração de massa/estrutura/valor nutritivo/consumo/desempenho. | Exemplo de por que forrageira, estação, estrutura do dossel e protocolo de medição precisam fazer parte de um caso delimitado. | Não é dado importado, não corresponde ao pasto sem espécie/área do MVP, e não calibra as constantes atuais. Consultar os termos do artigo antes de reutilizar tabelas. |
| National Academies of Sciences, Engineering, and Medicine, *Nutrient Requirements of Beef Cattle*, 8ª edição revisada (2016), DOI [10.17226/19014](https://doi.org/10.17226/19014). [Livro](https://nap.nationalacademies.org/read/19014) | Referência de requisitos nutricionais para bovinos de corte e base conceitual para aplicações de modelos mecanísticos. | Leitura metodológica a considerar ao escolher um modelo nutricional e definir entradas. | Não foi codificado nem usado para estimar os números atuais; publicação protegida por direitos autorais, sem conteúdo reproduzido neste repositório. |
| Embrapa Gado de Corte, [capacidade de suporte de pastagem](https://cloud.cnpgc.embrapa.br/sac/2016/06/15/como-se-calcula-a-capacidade-de-suporte-de-uma-pastagem/) | A explicação expressa a capacidade com produção de forragem e área, e leva em conta perdas e uso seletivo. | Referência conceitual para registrar área, produção e perdas se o produto vier a representar lotação/capacidade de suporte. | Não calculamos capacidade de suporte; os kg MS por piquete não têm denominador de área nem medições. |

## Dados e licença

- **Dados importados/calibração/validação:** nenhum.
- **Licença de dados usada pelo motor:** não se aplica aos valores arbitrários internos; não foram copiados valores dessas publicações para o motor.
- **Fontes contextuais:** consultadas para descrever dependências de população e manejo. Atribuição e link não concedem direitos de redistribuição; verificar licença/termos de cada fonte antes de extrair ou publicar dados.
- **Próximo conjunto de dados:** só escolher após a definição do caso em [`caso-zootecnico-demonstrativo.md`](caso-zootecnico-demonstrativo.md), registrando instituição, versão/data, população, protocolo, unidades, licença/permissão, qualidade e separação explícita entre calibração e validação.

Enquanto não houver dados apropriados e validação independente, todas as saídas permanecem **demonstrativas** e não devem orientar dieta, lotação ou manejo real. A issue [#2](https://github.com/santleme/riose-agro/issues/2) permanece aberta até revisão de especialista e seleção documentada de fonte aplicável.
