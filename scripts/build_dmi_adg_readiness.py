#!/usr/bin/env python3
"""Build a deterministic, reference-only DMI/ADG data-readiness matrix.

The source registry below records decisions and paths; source rows and raw
measurements stay in their existing manifests and audit reports. Re-run with
``python3 scripts/build_dmi_adg_readiness.py`` to refresh the versioned JSON
and Markdown artifacts.
"""

from __future__ import annotations

import json
from pathlib import Path
from time import perf_counter
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.0.0"
JSON_OUTPUT = ROOT / "docs/evidence/dmi-adg-readiness-v1.json"
MARKDOWN_OUTPUT = ROOT / "docs/evidence/dmi-adg-readiness-v1.md"


# Decisions are intentionally scoped to independent, observational component
# assessment. They do not replace the #22 expert review or claim full-engine
# validation. `trainable` means records can be used as a model-training source
# within the stated component scope, not that any training has occurred.
SOURCES: list[dict[str, Any]] = [
    {
        "id": "usda-cper-behavior",
        "name": "USDA/CPER foraging behavior and weight gains",
        "manifest": "data/usda-cper/manifest.json",
        "audit": "docs/evidence/usda-cper-association.json",
        "decisionRef": "docs/caso-zootecnico-demonstrativo.md",
        "access": "available_local",
        "license": "U.S. Public Domain (manifest)",
        "population": "Yearling cattle on semi-arid Colorado rangeland; adult classification is unresolved.",
        "units": "Animal-period ADG in kg/day; DMI is not present.",
        "missingness": "See linked audit report; source has repeated animal-period observations.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "No individual DMI outcome is present."},
        "adg": {"status": "conditional", "trainable": True, "reason": "Suitable only for the approved exploratory association/component scope; yearling classification, observational design and repeated animal keys constrain generalization."},
        "permissibleUse": "Exploratory observational ADG/pastejo analysis; no causal claim, adult-cow claim, or full-engine validation.",
    },
    {
        "id": "usda-cper-ltgi",
        "name": "USDA/CPER long-term grazing intensity weight gains",
        "manifest": "data/usda-cper-ltgi-2000-2019/manifest.json",
        "audit": "docs/evidence/usda-cper-ltgi-audit.json",
        "decisionRef": "docs/evidence/engine-adg-usda-cper-ltgi-check.json",
        "access": "available_local",
        "license": "U.S. Public Domain (manifest)",
        "population": "Yearling cattle (heifers and steers) managed under grazing intensities, 2000–2019.",
        "units": "One animal-season row; entry/exit weights converted to kg; derived ADG kg/day.",
        "missingness": "Exclusions, repeated keys and measurement protocol changes are described in the audit report.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "No individual DMI outcome is present."},
        "adg": {"status": "conditional", "trainable": True, "reason": "Public individual seasonal gain supports a bounded ADG component diagnostic; it is not a daily trajectory or replicated causal treatment experiment."},
        "permissibleUse": "Bounded ADG component assessment with year/pasture/animal key discipline; not full-engine or causal treatment validation.",
    },
    {
        "id": "dryad-finishing-steers",
        "name": "Dryad finishing steers methane-model dataset",
        "manifest": "data/dryad-finishing-steers/manifest.json",
        "audit": "docs/evidence/dryad-finishing-steers-audit.json",
        "decisionRef": "docs/evidence/engine-dmi-dryad-finishing-check.json",
        "access": "available_local",
        "license": "CC0-1.0 (manifest)",
        "population": "Finishing/feedlot beef steers across five experiments.",
        "units": "One animal-by-experiment summary row; DMI and ADG in kg/day.",
        "missingness": "The linked audit reports 446 complete outcome rows; no daily paired trajectory.",
        "dmi": {"status": "conditional", "trainable": True, "reason": "Open individual experiment-level DMI is usable for a fixed-default finishing component diagnostic, but not pasture transfer or full-engine validation."},
        "adg": {"status": "conditional", "trainable": True, "reason": "ADG is reported for the same finishing cohort, but it is not the approved pasture population and is a phase summary."},
        "permissibleUse": "Limited finishing/feedlot component assessment; keep experiment IDs grouped and do not transfer conclusions to grazing.",
    },
    {
        "id": "sdsu-individual-dmi",
        "name": "SDSU individual DMI on rangeland",
        "manifest": "data/sdsu-individual-dmi/manifest.json",
        "audit": "docs/evidence/sdsu-individual-dmi-audit.json",
        "decisionRef": "docs/evidence/sdsu-engine-dmi-check.json",
        "access": "available_local",
        "license": "CC BY (manifest article/supplement; see source-specific evidence)",
        "population": "Rangeland grazing cohort described in the linked audit; verify eligibility for any target population before use.",
        "units": "Derived DMI kg/day from intake pounds and period mean dry-matter percentage; see manifest derivation.",
        "missingness": "Rows without forage matching are retained with derived DMI blank; see audit and manifest.",
        "dmi": {"status": "conditional", "trainable": True, "reason": "Local source and derivation are available, but derived intake and population/period limitations require a component-only interpretation."},
        "adg": {"status": "ineligible", "trainable": False, "reason": "The paired source/audit does not establish an approved ADG outcome for the target use."},
        "permissibleUse": "DMI component diagnostic under the documented derivation; no claim of complete pasture-engine validation.",
    },
    {
        "id": "grastech-dairy-grazing",
        "name": "GrASTech dairy grazing DMI",
        "manifest": "data/grastech-dairy-grazing-dmi/manifest.json",
        "audit": "docs/evidence/grastech-dairy-grazing-dmi-engine-check.json",
        "decisionRef": "docs/evidence/grastech-dairy-grazing-dmi-engine-check.json",
        "access": "available_local",
        "license": "Etalab Open License 2.0 (manifest)",
        "population": "Lactating dairy cows in a grazing supplementation experiment.",
        "units": "See audit report; linked workbooks hold animal, period, feed and herbage measures.",
        "missingness": "Use workbook-level missingness and coverage in the linked audit; not copied into this matrix.",
        "dmi": {"status": "conditional", "trainable": True, "reason": "Individual grazing-intake evidence is available, but dairy population and study-specific measurement limit transfer to beef cattle."},
        "adg": {"status": "ineligible", "trainable": False, "reason": "The cited audit does not establish an approved paired ADG target for this assessment."},
        "permissibleUse": "Dairy grazing DMI component analysis only; do not treat it as beef-cattle validation.",
    },
    {
        "id": "usda-ars-feedlot-dmi",
        "name": "USDA-ARS individual feedlot DMI",
        "manifest": "data/usda-ars-individual-dmi-feedlot/manifest.json",
        "audit": "docs/evidence/usda-ars-feedlot-dmi-audit.json",
        "decisionRef": "docs/evidence/usda-ars-feedlot-engine-dmi-check.json",
        "access": "available_local",
        "license": "CC BY 4.0 (manifest)",
        "population": "Beef cattle in feedlot experiments.",
        "units": "Individual feedlot DMI and supporting fields as listed in the audit.",
        "missingness": "See linked audit report; do not infer missing values from publication summaries.",
        "dmi": {"status": "conditional", "trainable": True, "reason": "Open feedlot DMI can support a feedlot component assessment, not a pasture-DMI claim."},
        "adg": {"status": "conditional", "trainable": False, "reason": "Performance association is not sufficient by itself to establish a paired approved ADG validation target."},
        "permissibleUse": "Feedlot DMI component analysis within dataset license and attribution terms.",
    },
    {
        "id": "dryad-grazing-yearlings",
        "name": "Dryad grazing yearling steers",
        "manifest": "data/dryad-grazing-yearlings/manifest.json",
        "audit": "docs/evidence/dryad-grazing-yearlings-audit.json",
        "decisionRef": "docs/evidence/dryad-grazing-yearlings-audit.json",
        "access": "available_local",
        "license": "CC0-1.0 (manifest)",
        "population": "Yearling grazing steers.",
        "units": "One ADG and body-weight record per steer; visits are interval records.",
        "missingness": "The audit reports 154 model rows; DMI and experiment ID are absent, and visit coverage is incomplete for some animals.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "No DMI outcome is present."},
        "adg": {"status": "conditional", "trainable": True, "reason": "Open ADG and BW support a descriptive yearling reference; no experiment ID or paired starting/ending weights for this use."},
        "permissibleUse": "Separate yearling ADG descriptive reference only; no full-engine validation or adult-cow inference.",
    },
    {
        "id": "rothamsted-dairy-beef-grazing",
        "name": "Rothamsted dairy-cross beef grazing",
        "manifest": "data/rothamsted/manifest.json",
        "audit": "docs/evidence/rothamsted-adg-audit.json",
        "decisionRef": "docs/evidence/engine-adg-rothamsted-check.json",
        "access": "available_local",
        "license": "CC BY 4.0 (manifest)",
        "population": "Young growing dairy-cross beef cattle in temperate pasture; not a mature-cow cohort.",
        "units": "Animal-period daily liveweight gain kg/steer/day; repeated periods per official tag.",
        "missingness": "Integrity, coverage and cohort details are in the linked audit report.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "No individual DMI outcome is present."},
        "adg": {"status": "conditional", "trainable": True, "reason": "Open repeated animal-period ADG supports a bounded component diagnostic, but its population and predictors differ from the approved CPER case."},
        "permissibleUse": "Held-out cohort ADG component diagnostic only; not full-engine or adult-cow validation.",
    },
    {
        "id": "mdpi-angus-cows",
        "name": "Angus cows on dormant-season rangeland",
        "manifest": "data/mdpi-angus-cow-grazing/manifest.json",
        "audit": "docs/evidence/mdpi-angus-cow-grazing-audit.json",
        "decisionRef": "docs/evidence/mdpi-angus-cow-grazing-audit.json",
        "access": "available_local",
        "license": "CC-BY-4.0 (manifest/article supplement; inspect data terms before redistribution)",
        "population": "Pregnant commercial Angus cows, ages 1–10, on dormant mixed-grass rangeland.",
        "units": "Cow-season weight change; ADG is derived over a study-reported 84-day period.",
        "missingness": "Audit reports missing weight/BCS changes; 167 cow IDs recur across years, and GPS covers a subset/45 days.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "Total forage DMI is not observed; supplement intake is not total DMI."},
        "adg": {"status": "conditional", "trainable": True, "reason": "Derived period weight change can serve as a descriptive cow-season reference, not verified daily ADG or an engine prediction target."},
        "permissibleUse": "Descriptive period-change reference with year+animal grouping and missingness disclosure.",
    },
    {
        "id": "public-pasture-dmi-unavailable",
        "name": "Public pasture DMI candidates with no reusable individual records found",
        "manifest": None,
        "audit": "docs/evidence/public-pasture-dmi-source-triage-2026-10.json",
        "decisionRef": "docs/evidence/public-pasture-dmi-source-triage-2026-10.json",
        "access": "unavailable_or_not_reusable",
        "license": "Underlying-data reuse license/access not established for the cited candidates.",
        "population": "Candidate sources include adult beef cattle on pasture; assess each source separately if access/terms change.",
        "units": "No individual-level reusable outcome file was retrieved for these candidates.",
        "missingness": "Individual observations are unavailable; article summaries are not a substitute.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "Underlying records are private, inaccessible, absent, or not data-specifically licensed; inaccessible sources are never counted as trainable."},
        "adg": {"status": "ineligible", "trainable": False, "reason": "No usable individual ADG records with the required paired inputs were retrieved."},
        "permissibleUse": "Literature/methods context and access follow-up only; do not reconstruct microdata from tables or figures.",
    },
]


def read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object: {path.relative_to(ROOT)}")
    return value


def build_record(source: dict[str, Any]) -> dict[str, Any]:
    manifest_ref = source["manifest"]
    audit_ref = source["audit"]
    manifest = read_json(ROOT / manifest_ref) if manifest_ref else None
    audit = read_json(ROOT / audit_ref)
    for dimension in ("dmi", "adg"):
        outcome = source[dimension]
        if outcome["status"] not in {"eligible", "conditional", "ineligible"}:
            raise ValueError(f"Unknown status for {source['id']}.{dimension}")
        if source["access"] != "available_local" and outcome["trainable"]:
            raise ValueError(f"Inaccessible source cannot be trainable: {source['id']}.{dimension}")
        if outcome["status"] == "ineligible" and outcome["trainable"]:
            raise ValueError(f"Ineligible source cannot be trainable: {source['id']}.{dimension}")

    result = {
        "id": source["id"],
        "name": source["name"],
        "references": {
            "manifest": manifest_ref,
            "audit": audit_ref,
            "decision": source["decisionRef"],
        },
        "sourceIdentity": {
            "doi": find_doi(manifest or audit),
            "license": source["license"],
        },
        "access": source["access"],
        "population": source["population"],
        "units": source["units"],
        "missingness": source["missingness"],
        "outcomes": {"dmi": source["dmi"], "adg": source["adg"]},
        "permissibleUse": source["permissibleUse"],
    }
    # Keep references demonstrably live; the detailed reports remain canonical.
    for ref in result["references"].values():
        if ref and not (ROOT / ref).is_file():
            raise FileNotFoundError(f"Missing evidence reference: {ref}")
    if manifest is not None and not manifest:
        raise ValueError(f"Empty manifest: {manifest_ref}")
    if not audit:
        raise ValueError(f"Empty audit report: {audit_ref}")
    return result


def find_doi(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("doi", "datasetDoi", "articleDoi", "article_doi"):
            found = value.get(key)
            if isinstance(found, str) and found:
                return found
        for child in value.values():
            found = find_doi(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_doi(child)
            if found:
                return found
    return None


def render_markdown(document: dict[str, Any]) -> str:
    lines = [
        f"# Matriz de prontidão DMI/ADG v{document['version']}",
        "",
        "Agregação determinística de manifestos e relatórios de auditoria existentes. Este índice referencia evidências; não replica linhas de dados. `trainable` indica elegibilidade de registros para treino dentro do escopo local indicado, não que houve treino.",
        "",
        f"**Entradas processadas:** {document['processing']['sourceCount']} fontes; {document['processing']['inputFileCount']} arquivos de entrada referenciados. **Tempo observado:** {document['processing']['elapsedSeconds']:.6f} s.",
        "",
        "## Matriz",
        "",
        "| Fonte | Acesso | DMI | ADG | População / unidade | Uso admissível | Evidências |",
        "|---|---|---|---|---|---|---|",
    ]
    for item in document["sources"]:
        dmi = item["outcomes"]["dmi"]
        adg = item["outcomes"]["adg"]
        refs = item["references"]
        source_refs = ", ".join(f"`{key}: {value}`" for key, value in refs.items() if value)
        compact = f"{item['population']} {item['units']}"
        lines.append(
            f"| {item['name']} | {item['access']} | {dmi['status']} (trainable: {str(dmi['trainable']).lower()}) | "
            f"{adg['status']} (trainable: {str(adg['trainable']).lower()}) | {compact} | {item['permissibleUse']} | {source_refs} |"
        )
        lines.append("")
        lines.append(f"**{item['id']} — razões.** DMI: {dmi['reason']} ADG: {adg['reason']}")
        lines.append(f"**Licença:** {item['sourceIdentity']['license']} **Missingness:** {item['missingness']}")
        lines.append("")
    review = document["domainExpertReview"]
    lines.extend([
        "## Parecer especializado",
        "",
        f"**Estado:** {review['status']}. {review['statement']}",
        f"**Atribuição/evidência:** `{review['reference']}`. {review['attributionNote']}",
        "",
        "## Escopo e cautelas",
        "",
        "- A disponibilidade de um manifesto não basta: o status e a licença são avaliados separadamente do escopo biológico e da qualidade do outcome.",
        "- Fontes sem arquivo individual reutilizável e termos de uso estabelecidos têm `trainable: false`, mesmo quando o artigo tem licença aberta.",
        "- `eligible`/`conditional` são específicos ao componente DMI ou ADG e ao uso descrito; não autorizam alegações de validade completa do motor, causalidade ou transferência populacional.",
        "- Esta matriz não substitui a issue #22 e não altera a trilha observacional aprovada em #1/#6.",
        "",
        "## Processamento",
        "",
        f"Fontes: {document['processing']['sourceCount']}; arquivos de entrada referenciados: {document['processing']['inputFileCount']}; tempo observado: {document['processing']['elapsedSeconds']} s.",
        "",
        f"Gerado pelo script `{document['generator']}`; versão do schema: `{document['schemaVersion']}`.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    started = perf_counter()
    document = {
        "schemaVersion": "riose.dmi-adg-readiness/v1",
        "version": VERSION,
        "generator": "scripts/build_dmi_adg_readiness.py",
        "purpose": "Reference-only readiness assessment for DMI and ADG component datasets.",
        "domainExpertReview": {
            "status": "pending_not_obtained",
            "statement": "Nenhum parecer zootécnico independente foi realizado; a classificação de yearlings como adultos permanece pendente.",
            "reference": "docs/caso-zootecnico-demonstrativo.md",
            "attributionNote": "A definição da pergunta exploratória foi aprovada pelo responsável do projeto; isso não é parecer de especialista. A issue #22 acompanha a revisão independente.",
        },
        "sources": [build_record(source) for source in SOURCES],
    }
    input_paths = {
        ref
        for source in document["sources"]
        for ref in source["references"].values()
        if ref
    }
    document["processing"] = {
        "sourceCount": len(document["sources"]),
        "inputFileCount": len(input_paths),
        "elapsedSeconds": round(perf_counter() - started, 6),
        "elapsedTimeKind": "observed_wall_clock_seconds",
    }
    JSON_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    MARKDOWN_OUTPUT.write_text(render_markdown(document), encoding="utf-8")


if __name__ == "__main__":
    main()
