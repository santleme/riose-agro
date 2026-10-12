# Matriz de prontidão DMI/ADG v1.0.0

Agregação determinística de manifestos e relatórios de auditoria existentes. Este índice referencia evidências; não replica linhas de dados. `trainable` indica elegibilidade de registros para treino dentro do escopo local indicado, não que houve treino.

**Entradas processadas:** 10 fontes; 25 arquivos de entrada referenciados. **Tempo observado:** 0.004645 s.

## Matriz

| Fonte | Acesso | DMI | ADG | População / unidade | Uso admissível | Evidências |
|---|---|---|---|---|---|---|
| USDA/CPER foraging behavior and weight gains | available_local | ineligible (trainable: false) | conditional (trainable: true) | Yearling cattle on semi-arid Colorado rangeland; adult classification is unresolved. Animal-period ADG in kg/day; DMI is not present. | Exploratory observational ADG/pastejo analysis; no causal claim, adult-cow claim, or full-engine validation. | `manifest: data/usda-cper/manifest.json`, `audit: docs/evidence/usda-cper-association.json`, `decision: docs/caso-zootecnico-demonstrativo.md` |

**usda-cper-behavior — razões.** DMI: No individual DMI outcome is present. ADG: Suitable only for the approved exploratory association/component scope; yearling classification, observational design and repeated animal keys constrain generalization.
**Licença:** U.S. Public Domain (manifest) **Missingness:** See linked audit report; source has repeated animal-period observations.

| USDA/CPER long-term grazing intensity weight gains | available_local | ineligible (trainable: false) | conditional (trainable: true) | Yearling cattle (heifers and steers) managed under grazing intensities, 2000–2019. One animal-season row; entry/exit weights converted to kg; derived ADG kg/day. | Bounded ADG component assessment with year/pasture/animal key discipline; not full-engine or causal treatment validation. | `manifest: data/usda-cper-ltgi-2000-2019/manifest.json`, `audit: docs/evidence/usda-cper-ltgi-audit.json`, `decision: docs/evidence/engine-adg-usda-cper-ltgi-check.json` |

**usda-cper-ltgi — razões.** DMI: No individual DMI outcome is present. ADG: Public individual seasonal gain supports a bounded ADG component diagnostic; it is not a daily trajectory or replicated causal treatment experiment.
**Licença:** U.S. Public Domain (manifest) **Missingness:** Exclusions, repeated keys and measurement protocol changes are described in the audit report.

| Dryad finishing steers methane-model dataset | available_local | conditional (trainable: true) | conditional (trainable: true) | Finishing/feedlot beef steers across five experiments. One animal-by-experiment summary row; DMI and ADG in kg/day. | Limited finishing/feedlot component assessment; keep experiment IDs grouped and do not transfer conclusions to grazing. | `manifest: data/dryad-finishing-steers/manifest.json`, `audit: docs/evidence/dryad-finishing-steers-audit.json`, `decision: docs/evidence/engine-dmi-dryad-finishing-check.json` |

**dryad-finishing-steers — razões.** DMI: Open individual experiment-level DMI is usable for a fixed-default finishing component diagnostic, but not pasture transfer or full-engine validation. ADG: ADG is reported for the same finishing cohort, but it is not the approved pasture population and is a phase summary.
**Licença:** CC0-1.0 (manifest) **Missingness:** The linked audit reports 446 complete outcome rows; no daily paired trajectory.

| SDSU individual DMI on rangeland | available_local | conditional (trainable: true) | ineligible (trainable: false) | Rangeland grazing cohort described in the linked audit; verify eligibility for any target population before use. Derived DMI kg/day from intake pounds and period mean dry-matter percentage; see manifest derivation. | DMI component diagnostic under the documented derivation; no claim of complete pasture-engine validation. | `manifest: data/sdsu-individual-dmi/manifest.json`, `audit: docs/evidence/sdsu-individual-dmi-audit.json`, `decision: docs/evidence/sdsu-engine-dmi-check.json` |

**sdsu-individual-dmi — razões.** DMI: Local source and derivation are available, but derived intake and population/period limitations require a component-only interpretation. ADG: The paired source/audit does not establish an approved ADG outcome for the target use.
**Licença:** CC BY (manifest article/supplement; see source-specific evidence) **Missingness:** Rows without forage matching are retained with derived DMI blank; see audit and manifest.

| GrASTech dairy grazing DMI | available_local | conditional (trainable: true) | ineligible (trainable: false) | Lactating dairy cows in a grazing supplementation experiment. See audit report; linked workbooks hold animal, period, feed and herbage measures. | Dairy grazing DMI component analysis only; do not treat it as beef-cattle validation. | `manifest: data/grastech-dairy-grazing-dmi/manifest.json`, `audit: docs/evidence/grastech-dairy-grazing-dmi-engine-check.json`, `decision: docs/evidence/grastech-dairy-grazing-dmi-engine-check.json` |

**grastech-dairy-grazing — razões.** DMI: Individual grazing-intake evidence is available, but dairy population and study-specific measurement limit transfer to beef cattle. ADG: The cited audit does not establish an approved paired ADG target for this assessment.
**Licença:** Etalab Open License 2.0 (manifest) **Missingness:** Use workbook-level missingness and coverage in the linked audit; not copied into this matrix.

| USDA-ARS individual feedlot DMI | available_local | conditional (trainable: true) | conditional (trainable: false) | Beef cattle in feedlot experiments. Individual feedlot DMI and supporting fields as listed in the audit. | Feedlot DMI component analysis within dataset license and attribution terms. | `manifest: data/usda-ars-individual-dmi-feedlot/manifest.json`, `audit: docs/evidence/usda-ars-feedlot-dmi-audit.json`, `decision: docs/evidence/usda-ars-feedlot-engine-dmi-check.json` |

**usda-ars-feedlot-dmi — razões.** DMI: Open feedlot DMI can support a feedlot component assessment, not a pasture-DMI claim. ADG: Performance association is not sufficient by itself to establish a paired approved ADG validation target.
**Licença:** CC BY 4.0 (manifest) **Missingness:** See linked audit report; do not infer missing values from publication summaries.

| Dryad grazing yearling steers | available_local | ineligible (trainable: false) | conditional (trainable: true) | Yearling grazing steers. One ADG and body-weight record per steer; visits are interval records. | Separate yearling ADG descriptive reference only; no full-engine validation or adult-cow inference. | `manifest: data/dryad-grazing-yearlings/manifest.json`, `audit: docs/evidence/dryad-grazing-yearlings-audit.json`, `decision: docs/evidence/dryad-grazing-yearlings-audit.json` |

**dryad-grazing-yearlings — razões.** DMI: No DMI outcome is present. ADG: Open ADG and BW support a descriptive yearling reference; no experiment ID or paired starting/ending weights for this use.
**Licença:** CC0-1.0 (manifest) **Missingness:** The audit reports 154 model rows; DMI and experiment ID are absent, and visit coverage is incomplete for some animals.

| Rothamsted dairy-cross beef grazing | available_local | ineligible (trainable: false) | conditional (trainable: true) | Young growing dairy-cross beef cattle in temperate pasture; not a mature-cow cohort. Animal-period daily liveweight gain kg/steer/day; repeated periods per official tag. | Held-out cohort ADG component diagnostic only; not full-engine or adult-cow validation. | `manifest: data/rothamsted/manifest.json`, `audit: docs/evidence/rothamsted-adg-audit.json`, `decision: docs/evidence/engine-adg-rothamsted-check.json` |

**rothamsted-dairy-beef-grazing — razões.** DMI: No individual DMI outcome is present. ADG: Open repeated animal-period ADG supports a bounded component diagnostic, but its population and predictors differ from the approved CPER case.
**Licença:** CC BY 4.0 (manifest) **Missingness:** Integrity, coverage and cohort details are in the linked audit report.

| Angus cows on dormant-season rangeland | available_local | ineligible (trainable: false) | conditional (trainable: true) | Pregnant commercial Angus cows, ages 1–10, on dormant mixed-grass rangeland. Cow-season weight change; ADG is derived over a study-reported 84-day period. | Descriptive period-change reference with year+animal grouping and missingness disclosure. | `manifest: data/mdpi-angus-cow-grazing/manifest.json`, `audit: docs/evidence/mdpi-angus-cow-grazing-audit.json`, `decision: docs/evidence/mdpi-angus-cow-grazing-audit.json` |

**mdpi-angus-cows — razões.** DMI: Total forage DMI is not observed; supplement intake is not total DMI. ADG: Derived period weight change can serve as a descriptive cow-season reference, not verified daily ADG or an engine prediction target.
**Licença:** CC-BY-4.0 (manifest/article supplement; inspect data terms before redistribution) **Missingness:** Audit reports missing weight/BCS changes; 167 cow IDs recur across years, and GPS covers a subset/45 days.

| Public pasture DMI candidates with no reusable individual records found | unavailable_or_not_reusable | ineligible (trainable: false) | ineligible (trainable: false) | Candidate sources include adult beef cattle on pasture; assess each source separately if access/terms change. No individual-level reusable outcome file was retrieved for these candidates. | Literature/methods context and access follow-up only; do not reconstruct microdata from tables or figures. | `audit: docs/evidence/public-pasture-dmi-source-triage-2026-10.json`, `decision: docs/evidence/public-pasture-dmi-source-triage-2026-10.json` |

**public-pasture-dmi-unavailable — razões.** DMI: Underlying records are private, inaccessible, absent, or not data-specifically licensed; inaccessible sources are never counted as trainable. ADG: No usable individual ADG records with the required paired inputs were retrieved.
**Licença:** Underlying-data reuse license/access not established for the cited candidates. **Missingness:** Individual observations are unavailable; article summaries are not a substitute.

## Parecer especializado

**Estado:** pending_not_obtained. Nenhum parecer zootécnico independente foi realizado; a classificação de yearlings como adultos permanece pendente.
**Atribuição/evidência:** `docs/caso-zootecnico-demonstrativo.md`. A definição da pergunta exploratória foi aprovada pelo responsável do projeto; isso não é parecer de especialista. A issue #22 acompanha a revisão independente.

## Escopo e cautelas

- A disponibilidade de um manifesto não basta: o status e a licença são avaliados separadamente do escopo biológico e da qualidade do outcome.
- Fontes sem arquivo individual reutilizável e termos de uso estabelecidos têm `trainable: false`, mesmo quando o artigo tem licença aberta.
- `eligible`/`conditional` são específicos ao componente DMI ou ADG e ao uso descrito; não autorizam alegações de validade completa do motor, causalidade ou transferência populacional.
- Esta matriz não substitui a issue #22 e não altera a trilha observacional aprovada em #1/#6.

## Processamento

Fontes: 10; arquivos de entrada referenciados: 25; tempo observado: 0.004645 s.

Gerado pelo script `scripts/build_dmi_adg_readiness.py`; versão do schema: `riose.dmi-adg-readiness/v1`.
