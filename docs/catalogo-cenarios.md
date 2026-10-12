# Catálogo de cenários

O catálogo versionado fica em `scenario-presets.js` (`SCENARIO_PRESET_CATALOG_VERSION = 1`). Cada preset registra ID e versão, descrição, estado inicial, intervenção, horizonte, semente quando aplicável, fatores constantes e estado de suporte.

## Presets

- `baseline` reinicia o motor com semente `2026` e 24 animais. O estado gerado e a configuração padrão vêm de `FarmEngine`; não há intervenção.
- `housing-comparison` usa o mesmo estado inicial e chama a comparação existente por 30 dias: pasto como referência e confinamento como alternativa. Dieta, suplementação, clima, rebanho e estoque inicial permanecem iguais.
- `heat`, `reduced-feed` e `limited-trough-access` são `unsupported`. Como não há uma execução correspondente no motor atual, o catálogo não declara estado inicial, duração ou semente para esses candidatos e explica sua indisponibilidade na interface.

O catálogo não altera cálculos biológicos. A comparação continua demonstrativa e não validada. Novos presets devem passar por `validateScenarioPresetCatalog` e usar apenas intervenções já suportadas pelo motor até que uma mudança de escopo autorize outra capacidade.
