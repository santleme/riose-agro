# Wyffels et al. (2020): comportamento de vacas em pastejo dormente

Fonte: Wyffels et al., *PLOS ONE* 15(10), e0240629, DOI [10.1371/journal.pone.0240629](https://doi.org/10.1371/journal.pone.0240629).

Os arquivos suplementares selecionados foram baixados da página oficial da PLOS em 12/10/2026. O artigo informa que os dados relevantes estão no manuscrito e nos suplementos e aplica a licença Creative Commons Attribution (CC BY). Ao reutilizar os arquivos, cite o artigo e preserve a atribuição. URLs e SHA-256 estão em `manifest.json`.

| Arquivo local | Suplemento | Conteúdo publicado |
|---|---|---|
| `S1-Appendix-grazing-minutes.csv` | S1 Appendix | Tempo de pastejo diário (`Time_min`) e covariáveis por animal/data |
| `S2-Appendix-distance-traveled.csv` | S2 Appendix | Distância diária (`Dist_m`) e covariáveis por animal/data |
| `S3-Table-weight-bcs.pdf` | S3 Table | Peso não encolhido e condição corporal por classe etária |

O estudo acompanhou vacas Angus e Angus × Simmental, de 1 a 12 anos, em pastagem nativa dormente no Montana durante dois invernos (272 e 302 vacas no rebanho comercial). Os suplementos S1/S2 contêm 29 vacas com coleira em cada ano, não toda a população do rebanho. O campo `PreWt` não tem unidade no cabeçalho. Deduplicando S1 por ano e animal, a média dos 58 valores é 1.381,98; interpretá-la como lb e converter para kg resulta em 626,86 kg, que coincide após arredondamento com os 627 kg informados no artigo. Isso é evidência forte de que o campo está em libras, mas continua sendo uma inferência de unidade, não um rótulo explícito do CSV. Preserve o valor original e registre essa inferência se algum derivado vier a convertê-lo.

Esta captura é uma fonte observacional separada. Os suplementos permitem explorar covariação entre comportamento, consumo de suplemento, idade, BCS e peso inicial. Não há ADG nem pesos individuais repetidos nos CSVs S1/S2; a tabela S3 apresenta resumos por idade. Consumo de suplemento não é consumo de matéria seca total ou ingestão de forragem. Não use esta fonte como validação do motor, como estimativa causal ou como substituta do caso USDA/CPER.
