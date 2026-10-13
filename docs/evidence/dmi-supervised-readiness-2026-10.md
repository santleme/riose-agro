# Gate de prontidão para estimação supervisionada de DMI — 2026-10-13

**Decisão técnica preparatória: no-go.** A evidência local revisada não contém uma coorte elegível de vacas de corte maduras em pastagem com medições individuais reutilizáveis de DMI total. Este documento é um relatório de prontidão de dados, não validação do motor nem parecer zootécnico assinado. O estado de aprovação permanece pendente.

## Estimando proposto

- **População:** vacas de corte biologicamente maduras manejadas em pastagem, com maturidade e classe produtiva explicitadas nos metadados. Novilhas/yearlings, animais em crescimento e vacas leiteiras ficam fora do escopo.
- **Outcome:** DMI total individual (forragem e suplemento), medida por animal-período, em kg de matéria seca/animal/dia, com protocolo de medição ou derivação documentado.
- **Uso:** estimação supervisionada de DMI individual por animal-período dentro desta população. Não é estimativa de ADG, análise causal nem validação completa do motor.
- **Chaves:** estudo/ensaio, animal e animal-período. A avaliação futura deve reter estudos/ensaios inteiros; registros repetidos do mesmo animal não podem ser distribuídos entre partições.

Entram somente fontes com microdados acessíveis, termos de reutilização específicos para os dados, população compatível, outcome individual com unidade/protocolo definidos e IDs de animal e estudo/ensaio. Excluem-se médias de grupo, pontos reconstruídos de figuras, ingestão apenas de suplemento, DMI previsto por outro modelo usado como rótulo e fontes sem direitos explícitos de reutilização.

## Evidência e decisão

A matriz de 23 fontes [dmi-adg-readiness-v1.json](dmi-adg-readiness-v1.json) não identifica uma fonte elegível para este estimando: 0 elegíveis, 0 condicionais ao alvo e 23 ineligíveis ou indisponíveis para esta população/outcome. As fontes condicionais no componente DMI disponíveis localmente cobrem vacas leiteiras, animais de confinamento e sete vacas Angus em um experimento de alimentação com feno; nenhuma representa DMI total de vacas de corte em pastagem para o estimando. O triage de fontes de DMI em pastagem [public-pasture-dmi-source-triage-2026-10.json](public-pasture-dmi-source-triage-2026-10.json) encontrou artigos e candidatos sem microdados individuais reutilizáveis ou sem direitos de reutilização estabelecidos. A triagem agora inclui como near-miss um estudo de 2026 com dez vacas leiteiras Holstein × Gyr: o artigo estima DMI de pastagem por ciclo de pastejo, mas os dados são fornecidos apenas mediante solicitação razoável, e o outcome não é DMI total de vacas de corte maduras.

O Dryad `dbrv15fg8` (CC0) já é uma das 23 fontes da matriz: seus 154 yearling steers têm ADG e peso para estatísticas descritivas, mas não DMI nem chave por experimento/site/ano, inputs alinhados ao motor ou horizonte individual de peso. Por isso, o ADG também é ineligível para treino ou validação do motor; essa revisão não altera o no-go nem os totais do estimando. Consulte [a auditoria de elegibilidade da issue #15](issue-15-dryad-yearling-eligibility.json).

O conjunto local de vacas Angus [mdpi-angus-cow-grazing-audit.json](mdpi-angus-cow-grazing-audit.json) cobre uma população de pastagem relevante e está disponível sob os termos indicados no manifesto. Contudo, não mede DMI total: ingestão de suplemento não é ingestão total de forragem. A variação de peso em 84 dias é um outcome descritivo distinto e não pode servir como rótulo de DMI. Por isso, esse conjunto é ineligível para o estimando, mesmo sendo útil como referência populacional.

**Conclusão:** no-go para treino ou benchmark supervisionado de DMI no alvo definido. Não treinamos modelo nem estabelecemos meta de desempenho. A conclusão é limitada às fontes e evidências listadas; não afirma que nenhum dataset elegível exista em qualquer lugar.

## Condições para reabrir o gate

1. Obter microdados individuais públicos ou autorizados, com termos de reutilização específicos.
2. Confirmar vacas de corte maduras em pastagem, DMI total individual em kg MS/animal/dia, protocolo, missingness e IDs de animal e ensaio.
3. Obter a revisão zootécnica independente acompanhada pela [issue #22](https://github.com/santleme/riose-agro/issues/22), incluindo identificação/credenciais e avaliação do enquadramento da população.
4. Recalcular elegibilidade e aprovar previamente uma avaliação com holdout por estudo/ensaio antes de qualquer treino.

## Assinatura e limite de atribuição

O campo de aprovação está **pendente**: não há signoff ou atribuição do responsável do projeto e não existe parecer zootécnico independente registrado. A issue #22 e seu brief atual focam o caso USDA/CPER de ADG/pastejo; para satisfazer este gate, o parecer precisará avaliar explicitamente também o estimando separado de vacas de corte maduras em pastagem com DMI total. A definição acima é uma proposta operacional explícita para tornar o gate auditável, não uma decisão de especialista nem uma aprovação para expansão do produto. Consulte o JSON versionado para campos, estados e links validados por `scripts/validate_dmi_supervised_readiness.py`.
