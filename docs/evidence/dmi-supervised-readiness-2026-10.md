# Gate de prontidão para estimação supervisionada de DMI — 2026-10-13

**Decisão de prontidão de dados: no-go.** A evidência pública e reutilizável auditada não contém uma coorte elegível de vacas de corte maduras em pastagem com medições individuais de DMI total. Isso impede confiar em previsões individuais de consumo para essa população; não torna inútil a simulação mecanística, que continua podendo explorar cenários com as equações científicas existentes. Este documento não valida previsões nem representa parecer zootécnico independente, que não foi realizado.

## Estimando proposto

- **População:** vacas de corte biologicamente maduras manejadas em pastagem, com maturidade e classe produtiva explicitadas nos metadados. Novilhas/yearlings, animais em crescimento e vacas leiteiras ficam fora do escopo.
- **Outcome:** DMI total individual (forragem e suplemento), medida por animal-período, em kg de matéria seca/animal/dia, com protocolo de medição ou derivação documentado.
- **Uso:** estimação supervisionada de DMI individual por animal-período dentro desta população. Não é estimativa de ADG, análise causal nem validação completa do motor.
- **Chaves:** estudo/ensaio, animal e animal-período. A avaliação futura deve reter estudos/ensaios inteiros; registros repetidos do mesmo animal não podem ser distribuídos entre partições.

Entram somente fontes com microdados acessíveis, termos de reutilização específicos para os dados, população compatível, outcome individual com unidade/protocolo definidos e IDs de animal e estudo/ensaio. Excluem-se médias de grupo, pontos reconstruídos de figuras, ingestão apenas de suplemento, DMI previsto por outro modelo usado como rótulo e fontes sem direitos explícitos de reutilização.

## Evidência e decisão

A matriz de 28 fontes [dmi-adg-readiness-v1.json](dmi-adg-readiness-v1.json) não identifica uma fonte elegível para este estimando: 0 elegíveis, 0 condicionais ao alvo e 28 ineligíveis ou indisponíveis para esta população/outcome. As fontes condicionais no componente DMI disponíveis localmente cobrem vacas leiteiras, animais de confinamento e sete vacas Angus em um experimento de alimentação com feno; nenhuma representa DMI total de vacas de corte em pastagem para o estimando. O triage de fontes de DMI em pastagem [public-pasture-dmi-source-triage-2026-10.json](public-pasture-dmi-source-triage-2026-10.json) agora inclui quatro estudos próximos: Cabral et al. (2012), com vacas prenhes Zebu cruzadas no Brasil e DMI total individual estimada por marcadores; Sowell et al. (2003), com vacas de corte em pastagem nativa nos EUA; Nowakowski et al. (2017), com DMI de pastagem sem microdados; e a tese Pampa Corte com consumo de matéria orgânica de forragem e licença sem derivados. O artigo Cabral não informa idade individual, e todos esses registros carecem de um arquivo de dados reutilizável para o estimando. A triagem também incluiu o estudo CattleSat de 2026: apesar do foco em sistemas vaca-bezerro em pastagem, o artigo declara que não usou animais e calcula DMI por submodelos, então seus resultados são simulados, não rótulos observados. A coleção NANP permanece pista para inspeção futura, sem coorte e granularidade elegíveis confirmadas. Nenhum desses itens altera o no-go.

O Dryad `dbrv15fg8` (CC0) já é uma das 28 fontes da matriz: seus 154 yearling steers têm ADG e peso para estatísticas descritivas, mas não DMI nem chave por experimento/site/ano, inputs alinhados ao motor ou horizonte individual de peso. Por isso, o ADG também é ineligível para treino ou validação do motor; essa revisão não altera o no-go nem os totais do estimando. Consulte [a auditoria de elegibilidade da issue #15](issue-15-dryad-yearling-eligibility.json).

O conjunto local de vacas Angus [mdpi-angus-cow-grazing-audit.json](mdpi-angus-cow-grazing-audit.json) cobre uma população de pastagem relevante e está disponível sob os termos indicados no manifesto. Contudo, não mede DMI total: ingestão de suplemento não é ingestão total de forragem. A variação de peso em 84 dias é um outcome descritivo distinto e não pode servir como rótulo de DMI. Por isso, esse conjunto é ineligível para o estimando, mesmo sendo útil como referência populacional.

**Conclusão:** no-go para treino ou benchmark supervisionado de DMI no alvo definido. Não treinamos modelo nem estabelecemos meta de desempenho. A conclusão é limitada às fontes e evidências listadas; não afirma que nenhum dataset elegível exista em qualquer lugar.

## Condições para reabrir o gate

1. Obter microdados individuais públicos ou autorizados, com termos de reutilização específicos.
2. Confirmar vacas de corte maduras em pastagem, DMI total individual em kg MS/animal/dia, protocolo, missingness e IDs de animal e ensaio.
3. Recalcular elegibilidade e pré-registrar uma avaliação com holdout por estudo/ensaio antes de qualquer treino.

## Assinatura e limite de atribuição

Não houve signoff nem parecer zootécnico independente. A issue #22 foi encerrada como `NOT_PLANNED`; sua revisão não é dependência operacional. O no-go decorre especificamente da ausência de uma coorte aberta elegível, não da falta de parecer. Isso não aprova previsões individuais nem impede o uso da simulação como exploração mecanística claramente identificada. Consulte o JSON versionado e `scripts/science/readiness/validate_dmi_supervised_readiness.py` para os campos auditáveis do gate.
