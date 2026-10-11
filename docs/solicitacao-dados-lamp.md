# Roteiro de solicitação de dados: LAMP

Status: **rascunho local; nenhuma mensagem foi enviada**.

O artigo de Congio et al. (2023; DOI [10.1016/j.scitotenv.2022.159128](https://doi.org/10.1016/j.scitotenv.2022.159128)) informa dados individuais de bovinos de corte da América Latina/Caribe com CMS, peso vivo, ganho médio diário e composição da dieta; sua declaração de disponibilidade diz que os dados serão fornecidos mediante solicitação. Este roteiro existe para esclarecer se há acesso e licença para pesquisa, não presume consentimento para qualquer reutilização.

## Perguntas para os responsáveis

1. Existe uma versão anonimizada dos dados LAMP e um dicionário que possa ser compartilhado para uma avaliação acadêmica/reprodutível?
2. Quais colunas estão disponíveis por animal e por estudo, quais unidades e métodos de medição foram usados para CMS, peso e GMD, e quais variáveis são medidas, calculadas ou imputadas?
3. É possível manter IDs pseudonimizados de estudo e animal, para agrupar linhas repetidas e reservar estudos inteiros na avaliação? Quais estudos/unidades poderiam ser usados como holdout externo?
4. Que licença/termos autorizam análise, calibração, validação, publicação de métricas e redistribuição de tabelas ou código derivados? É permitido arquivar checksums e um resumo não identificável sem redistribuir dados brutos?
5. Como identificar o subconjunto final de 1.100 observações/55 estudos citado no artigo e as exclusões aplicadas? Há sobreposição com as planilhas suplementares ou com bases abertas já publicadas?
6. Qual citação e reconhecimento devem acompanhar o uso? Há requisitos de aprovação ética, governança, embargo ou revisão dos resultados?

## Rascunho de mensagem (em inglês)

> **Subject:** Request for access and reuse terms for the LAMP beef cattle dataset
>
> Dear Dr. [name],
>
> I am evaluating public and permissioned datasets for a reproducible study of beef-cattle dry matter intake (DMI), body weight, and average daily gain (ADG). Your paper, “Improving the accuracy of beef cattle methane inventories in Latin America and Caribbean countries” (DOI: 10.1016/j.scitotenv.2022.159128), describes the LAMP individual-animal dataset and states that data are available on request.
>
> Would you be able to share an anonymized extract and data dictionary for research use, or advise on the process and applicable terms? In particular, I would need study-level and pseudonymous animal identifiers (if shareable) to prevent leakage across repeated observations, the measurement units and methods for DMI/BW/ADG, the selection/exclusion flags for the analyzed subset, and the license or written permissions covering analysis, model evaluation, publication of aggregate metrics, and any derived materials.
>
> The intended first analysis would be limited to checking whether a small, explicitly scoped beef-cattle model can reproduce DMI and ADG observations under a study-held-out evaluation. It would not treat the dataset as evidence for a causal pasture-versus-feedlot effect, nor redistribute raw records. Before proceeding, I would document the population, study overlap, missingness, and permitted uses and would follow any required citation, ethics, or review conditions.
>
> If there is a preferred data request form, collaborator agreement, or public repository for this subset, please let me know. Thank you for considering the request.
>
> Best regards,\
> [name / affiliation / contact]

## Gate antes de enviar ou analisar

- Preencher identidade/afiliação e receber autorização explícita do usuário para contato externo.
- Guardar a resposta e os termos permitidos fora do frontend; não incorporar registros ao Git sem licença compatível.
- Confirmar unidade de análise e agrupamento por estudo; comparar somente alvos medidos com o motor/modelo declarado.
- Reservar estudos completos como teste antes de qualquer ajuste; remover sobreposição conhecida e registrar o que não pôde ser verificado.
- Se os termos não autorizarem uso e publicação de métricas, não iniciar o pipeline.
