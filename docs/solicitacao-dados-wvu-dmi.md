# Roteiro de solicitação de dados: DMI de bovinos adultos em pastejo (WVU)

Status: **mensagem pronta; ainda não enviada porque nenhum conector de email está conectado nesta sessão**.

O artigo de Blake et al. (2026; [DOI 10.1093/jas/skag133](https://doi.org/10.1093/jas/skag133)) descreve DMI individual diária de bovinos de corte em pastejo e informa: “Data may be available by contacting the corresponding author.” A avaliação reportada inclui separações retidas por animal e por sistema/local, mas o artigo não fornece os arquivos nem uma licença aberta. O DMI de referência é estimado por marcador fecal e digestibilidade da forragem, e não deve ser descrito como pesagem direta de alimento consumido.

Este é um pedido de acesso para avaliar um único alvo compatível do motor (CMS/DMI diária). Não muda o caso aprovado na #1 — ADG e indicadores de pastejo do USDA/CPER — e não permite alegar validação de peso, custos, estoque de pasto ou do cenário pasto × confinamento. A licença e os termos devem ser avaliados antes de receber ou processar os dados.

## Perguntas para os responsáveis

1. Existe um extrato anonimizado dos registros diários de pastejo e respectivos dicionários que possa ser disponibilizado para avaliação reprodutível de DMI?
2. O extrato pode conter IDs pseudônimos estáveis de animal, grupo de pastejo, teste, piquete, local e ano, preservando os grupos inteiros para splits sem vazamento?
3. Quais são as colunas, unidades, resolução temporal, filtros de qualidade e motivos de exclusão para DMI, peso, água, dieta/forragem e variáveis meteorológicas?
4. Como o DMI foi calculado a partir do marcador fecal e da digestibilidade em cada ano? Há mudanças de marcador/protocolo que precisam virar estratos ou exclusões?
5. Quais conjuntos foram usados em treino, calibração e validação retida no artigo? É permitido criar avaliação independente do `engine.js` sem treinar com os rótulos de teste publicados?
6. Quais termos/licença permitem validação interna, publicação de métricas agregadas, divulgação de checksums e armazenamento de um manifesto sem redistribuir os registros brutos? Há NDA, taxa, revisão dos resultados ou aprovação ética aplicáveis?
7. Qual citação e reconhecimento devem acompanhar a análise? Há uma pessoa responsável pela aprovação de uso dos dados além do autor correspondente?

## Mensagem autorizada para envio (em inglês)

To: matt.wilson@mail.wvu.edu

> **Subject:** Request for access and reuse terms for grazing beef-cattle DMI records
>
> Dear Dr. Wilson,
>
> I am assessing whether the Agroville prototype can be evaluated against independent measurements of beef-cattle intake. Your paper, “Generalizable long short-term memory models for beef cattle DMI under grazing” (DOI: 10.1093/jas/skag133), describes individual daily DMI records across grazing and drylot systems and notes that data may be available by contacting the corresponding author.
>
> Would an anonymized, research-use extract of the individual DMI records and a data dictionary be available? For a leakage-safe assessment, stable pseudonymous animal IDs and study/test/site/year/group identifiers would be important, along with DMI units and calculation protocol, measurement coverage and exclusions, and the associated weight, water, weather, and grazing-context fields where they may be shared.
>
> Our first proposed use would be limited to an exploratory check of the prototype’s daily dry-matter-intake output. We would not treat it as validation of weight, cost, pasture-stock, or pasture-versus-confinement outputs, and would keep animals/tests/sites grouped when reserving evaluation data. Before any analysis, could you clarify the applicable license or agreement, whether aggregate metrics may be published, and whether there are fees, review, or ethics requirements? We would not redistribute the raw records.
>
> If there is a preferred data request form or repository, please point me to it. Thank you for considering the request.
>
> Best regards,\
> Lucas Coimbra\
> Agroville prototype project

## Gate antes de enviar ou analisar

- O usuário autorizou explicitamente o envio em 2026-10-11; o autor correspondente e o endereço foram confirmados no artigo. Enviar pela conta de email conectada do usuário, sem alegar afiliação institucional.
- Não assumir licença ou consentimento a partir da disponibilidade por contato; registrar os termos concedidos.
- Confirmar unidades, algoritmo de referência, cobertura, missingness, filtros e mudanças anuais do protocolo.
- Congelar estimando, entradas, população e split antes de qualquer ajuste; manter animal/teste/site inteiros no holdout apropriado e não usar rótulos retidos para calibração.
- Se os termos não autorizarem análise e publicação de métricas, não iniciar o pipeline. Mesmo com acesso, não promover a validação de DMI para os demais outputs do motor.
