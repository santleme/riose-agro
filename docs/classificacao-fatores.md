# Classificação de fatores

Esta classificação descreve a origem operacional dos fatores e não altera os valores existentes, o snapshot, o manifesto ou o motor.

## Categorias ativas

- `external`: condições do ambiente que o manejo da fazenda não define diretamente, como temperatura, umidade, chuva, vento e ambiente. O campo legado `weather` também é externo.
- `management`: decisões e recursos definidos ou organizados na fazenda, como dieta, alimento ofertado, frequência e horários, cocho, água, sombra, ventilação e limpeza. Os campos legados `diet`, `housing` e `supplement` são de manejo.

## Compatibilidade

`classifyFactor` aceita a chave antiga como string ou os formatos de objeto com `key`, `id` ou `path`. Quando o objeto não contém `category`, a classificação é inferida pela chave conhecida. `classifyConfiguration` aplica esse fallback a cada campo de uma configuração antiga, preserva os valores e deixa chaves desconhecidas com `category: null`; não descarta nem transforma esses campos.

Uma categoria explícita é validada. A lista estrutural de categorias válidas também reconhece `partially_controllable` para permitir uma futura extensão. Nenhum fator recebe essa categoria automaticamente e ela não é usada como categoria ativa nesta versão.

## Limites

As categorias não inferem causalidade, grau de controle, efeitos biológicos ou recomendações de manejo. Elas são metadados descritivos isolados; dados históricos continuam válidos sem um campo de classificação.
