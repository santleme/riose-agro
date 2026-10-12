# Gate de prontidão para estimação supervisionada de DMI — 2026-10-12

**Decisão técnica preparatória: no-go.** A evidência local revisada não contém uma coorte elegível de vacas de corte maduras em pastagem com medições individuais reutilizáveis de DMI total. Este documento é um relatório de prontidão de dados, não validação do motor nem parecer zootécnico assinado. O estado de aprovação permanece pendente.

## Estimando proposto

- **População:** vacas de corte biologicamente maduras manejadas em pastagem, com maturidade e classe produtiva explicitadas nos metadados. Novilhas/yearlings, animais em crescimento e vacas leiteiras ficam fora do escopo.
- **Outcome:** DMI total individual (forragem e suplemento), medida por animal-período, em kg de matéria seca/animal/dia, com protocolo de medição ou derivação documentado.
- **Uso:** estimação supervisionada de DMI individual por animal-período dentro desta população. Não é estimativa de ADG, análise causal nem validação completa do motor.
- **Chaves:** estudo/ensaio, animal e animal-período. A avaliação futura deve reter estudos/ensaios inteiros; registros repetidos do mesmo animal não podem ser distribuídos entre partições.

Entram somente fontes com microdados acessíveis, termos de reutilização específicos para os dados, população compatível, outcome individual com unidade/protocolo definidos e IDs de animal e estudo/ensaio. Excluem-se médias de grupo, pontos reconstruídos de figuras, ingestão apenas de suplemento, DMI previsto por outro modelo usado como rótulo e fontes sem direitos explícitos de reutilização.

## Evidência e decisão

A matriz de dez fontes [dmi-adg-readiness-v1.json](dmi-adg-readiness-v1.json) não identifica uma fonte elegível para este estimando. As fontes condicionais de DMI disponíveis localmente descrevem vacas leiteiras ou animais de confinamento e só permitem análises de componente dentro desses escopos. O triage de fontes de DMI em pastagem [public-pasture-dmi-source-triage-2026-10.json](public-pasture-dmi-source-triage-2026-10.json) encontrou artigos e candidatos sem microdados individuais reutilizáveis ou sem direitos de reutilização estabelecidos.

O conjunto local de vacas Angus [mdpi-angus-cow-grazing-audit.json](mdpi-angus-cow-grazing-audit.json) cobre uma população de pastagem relevante e está disponível sob os termos indicados no manifesto. Contudo, não mede DMI total: ingestão de suplemento não é ingestão total de forragem. A variação de peso em 84 dias é um outcome descritivo distinto e não pode servir como rótulo de DMI. Por isso, esse conjunto é ineligível para o estimando, mesmo sendo útil como referência populacional.

**Conclusão:** no-go para treino ou benchmark supervisionado de DMI no alvo definido. Não treinamos modelo nem estabelecemos meta de desempenho. A conclusão é limitada às fontes e evidências listadas; não afirma que nenhum dataset elegível exista em qualquer lugar.

## Condições para reabrir o gate

1. Obter microdados individuais públicos ou autorizados, com termos de reutilização específicos.
2. Confirmar vacas de corte maduras em pastagem, DMI total individual em kg MS/animal/dia, protocolo, missingness e IDs de animal e ensaio.
3. Obter a revisão zootécnica independente acompanhada pela [issue #22](https://github.com/santleme/riose-agro/issues/22), incluindo identificação/credenciais e avaliação do enquadramento da população.
4. Recalcular elegibilidade e aprovar previamente uma avaliação com holdout por estudo/ensaio antes de qualquer treino.

## Assinatura e limite de atribuição

O campo de aprovação está **pendente**: a evidência técnica não foi assinada pelo responsável do projeto e não existe parecer zootécnico independente registrado. A definição acima é uma proposta operacional explícita para tornar o gate auditável, não uma decisão de especialista nem uma aprovação para expansão do produto. Consulte o JSON versionado para campos, estados e links validados por `scripts/validate_dmi_supervised_readiness.py`.
