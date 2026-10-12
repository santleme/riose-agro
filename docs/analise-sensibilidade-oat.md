# Análise de sensibilidade OAT

A análise **One At A Time (OAT)** executa novamente o mesmo snapshot do `FarmEngine`, alterando um único campo de configuração por execução. Ela descreve como as saídas computacionais do modelo atual mudam sob os valores explícitos informados. Não estima causalidade, incerteza, intervalos de confiança ou previsões e não constitui validação científica.

## Executar

```sh
node examples/sensitivity-analysis.js
```

Ou importe `analyzeSensitivity` de `sensitivity-analysis.js` e forneça:

- `snapshot`: snapshot completo do `FarmEngine`, incluindo a seed e a configuração base;
- `targetVariable`: um campo existente da configuração: `diet`, `housing`, `weather` ou `supplement`;
- `values`: lista não vazia de valores válidos para esse campo;
- `outputs`: métricas numéricas existentes: `weight`, `gain`, `cost`, `pasture` ou `stress`;
- `durationHours`: duração inteira de 1 a 8760 horas (padrão: 24).

## Exemplo e contrato

O exemplo usa **suplementação** (`kg DM/animal/day`), com baseline explícito de `1` no snapshot e valores testados `[0, 1, 2]`. O baseline está incluído nessa lista. A análise executa uma execução de baseline e uma para cada valor listado, totalizando quatro execuções. Cada execução parte do mesmo snapshot e seed; as demais entradas permanecem constantes.

A saída JSON inclui a seed, duração, caminho e valor baseline da variável, unidades, outputs selecionados, baseline, resultados por valor e `executionCount`. Para cada output, `deltaFromBaseline` contém:

```text
delta absoluto = saída do valor testado − saída baseline
delta percentual = delta absoluto / saída baseline × 100
```

Quando a saída baseline é zero, o delta percentual é `null`. Inputs sem suporte no engine (por exemplo, `humidity`) retornam `status: "unsupported"` e não produzem resultados numéricos.

## Limitações

Os resultados são determinísticos para o mesmo snapshot, seed, valores, duração e versão do engine. Eles são demonstrativos e refletem as regras e hipóteses atuais do motor; não demonstram relações causais, não são recomendação de manejo e não foram automaticamente validados cientificamente. A análise não inclui interações entre variáveis, calibração estatística ou simulação global de incerteza.
