# Política de incerteza e confiança

Estado: a comparação exibe `Sem calibração suficiente`; ainda não há intervalos probabilísticos calibrados no Agroville. O motor mantém `validated: false`; os resultados atuais são determinísticos e demonstrativos.

## Fontes de incerteza

| Fonte | Como poderia ser quantificada | Situação atual |
|---|---|---|
| Medição | Erro, resolução, repetibilidade e cobertura descritos no protocolo/instrumento; propagar apenas se houver estimativas aplicáveis à população e à janela usada. | Não temos observações de fazendas Agroville nem erro de instrumentos nos campos simulados. Ausência de precisão documentada significa desconhecida, não zero. |
| Parâmetros | Reajustar em amostras de calibração; obter distribuição por bootstrap ou modelo estatístico especificado, respeitando a unidade de agrupamento. | Constantes de `engine.js` são hipóteses pontuais e não foram ajustadas. Não há distribuição defensável. |
| Diferença entre animais | Estimar a partir de observações repetidas com identificação individual e amostra compatível com a população-alvo; manter animais inteiros fora da avaliação. | A população do motor é virtual. O estudo USDA tem 33 animais e 36 períodos, mas não observa as entradas/saídas atuais do motor. |
| Erro estrutural do modelo | Usar resíduos fora da calibração para cada desfecho, com holdout por animal e, quando aplicável, fazenda, ano, região ou sistema. Avaliar viés, MAE/RMSE e cobertura das faixas. | Não há validação externa do motor; os resíduos de uma baseline de ADG no USDA não se transferem para CMS, custo, estoque de pasto ou pasto-versus-confinamento. |
| Falta de cobertura / extrapolação | Medir cobertura de entradas e população em relação ao domínio treinado; indicar fora de domínio ou falta de dado, sem fabricar faixa. | O responsável aprovou para prototipagem um caso adulto observacional USDA/CPER de ADG e indicadores de pastejo; a revisão zootécnica independente da #1 continua pendente. Esse recorte não é o domínio validado do `engine.js`. |

## Regra de apresentação

- A decisão do responsável na #1 fixa a trilha de prototipagem adulta (ADG/pastejo USDA/CPER, observacional), mas não substitui a revisão zootécnica independente. Como a #6 ainda não tem avaliação compatível das saídas do `engine.js`, mostrar `Sem calibração suficiente` e rotular suas projeções como `demonstrativas`.
- O estudo WVU DMI 2026 é apenas um candidato para avaliar separadamente uma saída de consumo; os dados ainda não foram obtidos nem licenciados. Mesmo que haja acesso, seus erros e cobertura não calibram peso, custo, estoque de pasto ou o comparador pasto × confinamento, nem justificam intervalos para o motor completo.
- Não desenhar faixas de confiança com ruído aleatório arbitrário, mínimo/máximo de animais, variação da semente ou texto de LLM. Esses valores não medem a cobertura de uma previsão.
- Para qualquer intervalo futuro, congelar o estimando, as entradas, o split e o pipeline antes do conjunto de teste. Informar nível nominal e cobertura observada, largura média, erro, viés, tamanho da amostra, subgrupos e população avaliada.
- Manter a projeção original imutável e versionada; resultado observado posterior deve ser associado ao manifesto do cenário (#4) sem recalibrar automaticamente (#16).
- Se faltarem campos obrigatórios ou a entrada estiver fora do domínio, bloquear o resultado inferencial ou mostrar a lacuna; não converter ausência em zero nem em intervalo amplo inventado.

## Critérios ainda dependentes das issues

1. #1 aprova população, pergunta e estimando.
2. #6 encontra dados de avaliação independente compatíveis ou registra por que ainda não é possível avaliar cada desfecho.
3. Só então escolher método de intervalos/calibração e definir níveis nominais, tamanho mínimo e análise por subgrupo no protocolo prévio.
4. #14 mostra estado de evidência e cobertura junto ao resultado; #16 registra o desfecho real com consentimento, qualidade e trilha de revisão.

O audit USDA (`npm run audit:usda-cper`) é um exercício de split e de predição exploratória de ADG dentro de um estudo. Sua performance não permite atribuir confiança às saídas do `engine.js`.
