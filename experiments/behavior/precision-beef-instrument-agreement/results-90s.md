# Precision Beef: concordância entre instrumentos em janelas de 90 s

**Decisão:** CONDITIONAL para diagnóstico de concordância entre instrumentos; inelegível como evidência de comportamento em pastejo, consumo, ganho de peso ou validação da Riose.

## Coorte e protocolo

- Fonte: Zenodo DOI `10.5281/zenodo.4064802`, licença CC BY 4.0; 37 arquivos brutos verificados por checksum e 18 Parquets processados.
- 18 novilhos confinados; 138.453 janelas comuns e 138.118 elegíveis para pontuação.
- Janelas semiabertas de 90 s ancoradas no início arredondado do README. O modelo usa estatísticas do collar; o rótulo é a classe majoritária derivada do halter.
- O score exclui janelas de fronteira parcial, rótulos empatados/inválidos, features não finitas e contagens abaixo de 800/900 em qualquer instrumento.
- O split da fonte foi preservado: 15 animais no desenvolvimento; animais 04, 10, 11 no teste. Não houve sobreposição de animais.

## Resultados

| Avaliação | Macro-F1 | Acurácia balanceada | Acurácia |
|---|---:|---:|---:|
| Desenvolvimento, leave-one-animal-out nos 15 animais de treino | 0.656 | 0.691 | 0.663 |
| Teste da fonte, RF fixo (18.866 janelas) | 0.656 | 0.713 | 0.676 |
| Teste da fonte, baseline de classe majoritária | 0.220 | 0.333 | 0.492 |

## Interpretação e limites

O classificador supera o baseline simples neste split, mas a métrica representa concordância de sinais entre collar e halter. A referência não é verdade-terreno independente: as classes são inferidas pelo próprio instrumento halter. Os animais de teste são a divisão publicada pela fonte, não uma nova coorte independente.

O artigo informa que a sincronização foi verificada, mas não documenta pareamento linha a linha nem correção de offsets de relógio. O pipeline usa bins compartilhados ancorados pelo README, sem junção por índice, interpolação ou pareamento pelo vizinho mais próximo. Isso fornece uma regra reproduzível, não prova de sincronização exata.

Esta avaliação não mede DMI nem ADG, não testa pastoreio, fazendas novas, nem valida previsões individuais para vacas adultas. A simulação baseada em equações publicadas permanece útil dentro do domínio científico declarado; o NO-GO para DMI individual de vacas adultas a pasto continua em vigor.

## Reprodução

O JSON registra as versões de Python, NumPy, pandas, scikit-learn e PyArrow; seed e parâmetros fixos do RF; SHA-256 da implementação, protocolo, ordem de linhas, rótulos e predições de teste. As predições não foram recalculadas para gerar este resumo.

## Artefatos

- Protocolo: `amendment-2026-10-13.md`.
- Auditoria temporal: `data/precision-beef/alignment-audit.json`.
- Processamento e checksums: `data/precision-beef/processing-report-90s.json` e `data/precision-beef/manifest.json`.
- Resultado completo: `results-90s.json`.
