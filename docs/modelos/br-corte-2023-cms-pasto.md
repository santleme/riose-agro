# BR-CORTE 2023 — consumo total de MS em zebuínos a pasto

## Implementação

O módulo `scientific/br_corte_pasture_dmi.js` implementa independentemente a Eq. 2.6 do capítulo 2 do BR-CORTE 2023. A equação publicada é:

```text
CMS total (kg MS/dia) = −0,4684
  + 0,7732 × CMSs
  + 0,0742 × PC^0,75
  + 0,7953 × GMD
  − 0,9047 × GMD²
```

`CMSs` é consumo de suplemento em kg MS/dia; `PC` é peso corporal médio em kg (o termo elevado a 0,75 é peso metabólico, kg^0,75); `GMD` é ganho médio diário em kg/dia. O BR-CORTE reporta R² = 0,638. A equação é empírica e prevê CMS total condicionado ao GMD informado.

### Caso de reprodução publicado

A Tabela 2.14 informa 7,58 kg MS/dia para zebuínos de 400 kg, GMD de 0,5 kg/dia e suplemento de 1,6 kg MS/dia. A implementação retorna 7,576844757 kg MS/dia, que arredonda para 7,58.

### Domínio e evidência

A tabela de validação independente contém 174 unidades experimentais zebuínas: PC 133–474 kg, GMD −0,18–1,34 kg/dia, CMS 1,98–12,3 kg/dia e suplemento 0–5,32 kg/dia. Estatísticas publicadas: intercepto 0,470 (p=0,170), inclinação 1,05 (p=0,376), R²=0,670, CCC=0,741 e quadrado médio do erro de predição 2,13. Os autores recomendam o modelo para recria e suplementação moderada em pastejo tropical. Grande parte dos dados de desenvolvimento foi obtida em períodos secos. Esses resultados são evidência de validação da regressão no conjunto descrito, não garantia para qualquer fazenda.

O simulador recusa GMD ou suplemento fora dos intervalos de validação e interrompe a projeção se o peso sair do intervalo de validação. A predição isolada também retorna um sinalizador de domínio. O código não reproduz nem inclui o banco de dados ou as planilhas do livro.

O mecanismo de sensibilidade determinística entregue na [#21](https://github.com/santleme/riose-agro/issues/21), `analyzePastureDmiSensitivity()`, calcula variações de uma entrada por vez (±10 kg de peso, ±0,1 kg/d de GMD informado e ±0,5 kg MS/d de suplemento), truncadas aos intervalos independentes acima. O resultado não é intervalo de confiança, intervalo preditivo, incerteza de parâmetro nem calibração empírica do Riose; a interface mantém essa distinção explícita. A #15 permanece separada para calibração estatística.

### Contrato do protótipo integrado

- 100 animais Nelore identificados com IDs 1–100 e alocados em até quatro piquetes com água disponível.
- Entradas configuráveis: peso inicial médio, dispersão opcional (API), GMD assumido, suplemento, estoque inicial por piquete, disponibilidade de água e horizonte de 30, 60 ou 90 dias.
- A trajetória de peso é `peso inicial + GMD informado × dias`; ela é uma hipótese do cenário, **não** uma previsão independente do BR-CORTE.
- A forragem pedida é o resíduo de balanço de MS `CMS total − suplemento`. Essa diferença não é outra equação validada de CMS de forragem.
- A retirada por piquete nunca excede o estoque. Qualquer déficit é reportado; não se ajusta o GMD nem se finge que o CMS previsto foi ingerido.
- O mapa isométrico existente e os painéis mostram o estado final da execução selecionada. Reiniciar retorna ao motor demonstrativo anterior.

Pastagem não cresce nem se recupera neste protótipo. Área, biomassa utilizável, seletividade/qualidade da forragem, consumo e demanda de água, resposta à falta d'água, energia, proteína e conversão alimentar também não estão modelados. Água é configurável e exibida, mas não altera CMS ou ganho. Parâmetros de estoque de pasto são hipóteses de cenário, sem referência a observação de fazenda.

### Uso e atribuição

Fonte científica: Azevêdo et al., capítulo 2, *Exigências Nutricionais de Zebuínos Puros e Cruzados — BR-CORTE 2023*, equação 2.6 e tabelas 2.11–2.14. [PDF oficial em português](https://brcorte.com.br/assets/book2023/br/02.pdf). O livro está publicamente acessível; não identificamos uma licença aberta para redistribuir texto, tabelas, dados ou planilhas. Esta implementação contém apenas a expressão matemática transcrita de forma independente, metadados de fonte e um caso numérico resumido, sem código copiado do software BR-CORTE.

## Próximos módulos

O próximo modelo a procurar é um mecanismo independente de GMD que conecte consumo, qualidade da dieta e exigências de energia/proteína; só então CMS e ganho poderão ser acoplados sem circularidade. Crescimento e recuperação de pastagem devem vir de equações publicadas com entradas climáticas/solo/forrageira explícitas. A #1 foi concluída como definição da pergunta observacional ADG/pastejo USDA/CPER; esta trilha BR-CORTE é um módulo de cenário separado e não valida o caso CPER. A revisão de domínio independente ficou para a #22. Na #15, R² e métricas da validação publicada são reportadas como evidência do modelo-fonte; não são intervalos de previsão calibrados para Riose nem substituem intervalos empíricos locais.
