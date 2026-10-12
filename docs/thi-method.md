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

A expressão segue Mader, Davis e Brown-Brandl (2006), em pesquisa com bovinos de confinamento: [Journal of Animal Science, 84:712–719](https://doi.org/10.2527/2006.843712x). Como verificação publicada arredondada, Quintero-Moreno et al. reportam 26,8 °C, 57,5% UR e THI 75,0 para bezerros cruzados; a expressão acima resulta em 74,97 (75,0 a uma casa decimal). A população desse exemplo é específica e não estabelece limite universal de desconforto: [artigo e Tabela I](https://ve.scielo.org/scielo.php?pid=S0798-22592007000500007&script=sci_arttext).

O THI não mede a condição térmica individual e não incorpora vento, radiação solar, sombra, pelagem, genótipo, aclimatação ou duração de exposição. O indicador não usa limiares de classificação nem altera consumo, ganho de peso, comportamento ou outros resultados do motor. Comparações produtivas que relacionem o THI a respostas de bovinos exigem um modelo e validação próprios para a população e as entradas disponíveis.
