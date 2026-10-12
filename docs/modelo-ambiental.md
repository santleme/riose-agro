# Modelo ambiental

`environment-model.js` reúne as regras de clima que já eram aplicadas pelo engine: rótulos, multiplicador de demanda no calor, crescimento horário do pasto e aumento horário da sede. Também calcula o indicador de estresse existente, cuja regra considera calor antes do alojamento.

Os valores permanecem hipóteses demonstrativas do MVP. A extração não adiciona variáveis, fórmulas, dados meteorológicos nem validação científica. O engine continua responsável por aplicar esses efeitos ao estado e por manter sua API e compatibilidade.
