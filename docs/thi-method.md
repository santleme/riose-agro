# Indicador temperatura–umidade (THI)

O Riose apresenta o THI como um **índice ambiental descritivo**, calculado somente quando temperatura de bulbo seco e umidade relativa estão disponíveis:

```text
THI = 0,8 × T + (UR / 100) × (T − 14,4) + 46,4
```

- `T`: temperatura do ar de bulbo seco em °C.
- `UR`: umidade relativa em porcentagem, de 0 a 100%.
- THI: índice convencional, sem unidade.
- Entradas aceitas pela interface: −40 a 60 °C e 0 a 100% UR. A faixa de temperatura é apenas uma validação de entrada; não representa domínio de validação fisiológica desta implementação.
- Se qualquer valor estiver ausente, inválido ou fora dos limites de entrada, o indicador fica indisponível. Nenhum valor é estimado a partir de categorias climáticas.

A expressão segue Mader, Davis e Brown-Brandl (2006), em pesquisa com bovinos de confinamento: [Journal of Animal Science, 84:712–719](https://doi.org/10.2527/2006.843712x). A fixture aplica a fórmula de Mader a 26,8 °C e 57,5% UR, condições reportadas para bezerros cruzados por Quintero-Moreno et al.; o resultado calculado pela fórmula de Mader é 74,97. A Tabela I desse estudo reporta THI 75,0, mas sua nota atribui o cálculo a West (1994) e Hammond et al. (1998), não à fórmula de Mader. Portanto, os valores de temperatura e umidade servem como entradas publicadas, e o THI reportado pelo estudo não é usado como resultado esperado do teste Mader. [Artigo e Tabela I](https://ve.scielo.org/scielo.php?pid=S0798-22592007000500007&script=sci_arttext).

Entradas, locators, população das fontes, unidades, decomposição da fórmula, precisão numérica e limitações dessa checagem estão congelados em [`tests/fixtures/scientific-numeric-reference-v1.json`](../tests/fixtures/scientific-numeric-reference-v1.json). O teste do THI lê essa fixture. O vetor aplica aritmeticamente a equação publicada a entradas externas; não é uma observação do Riose nem parte de qualquer dataset observacional.

O THI não mede a condição térmica individual e não incorpora vento, radiação solar, sombra, pelagem, genótipo, aclimatação ou duração de exposição. O indicador não usa limiares de classificação nem altera consumo, ganho de peso, comportamento ou outros resultados do motor. Comparações produtivas que relacionem o THI a respostas de bovinos exigem um modelo e validação próprios para a população e as entradas disponíveis.
