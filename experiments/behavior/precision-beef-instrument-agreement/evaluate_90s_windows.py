#!/usr/bin/env python3
"""Evaluate the amended, fixed Precision Beef 90-second agreement cohort."""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
import pyarrow

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
PROCESSOR = HERE / "process_90s_windows.py"
REPORT_PATH = ROOT / "data/precision-beef/processing-report-90s.json"
AMENDMENT_PATH = HERE / "amendment-2026-10-13.json"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))
import evaluate_instrument_agreement as fixed  # noqa: E402
from process_90s_windows import FEATURES, LABELS, WINDOW_SECONDS  # noqa: E402

REQUIRED = {
    "animal_id", "farm_trial_id", "source_split", "window_index", "window_start",
    "window_end_exclusive", "window_seconds", "anchor_timestamp", "n_valid_collar_samples",
    "n_valid_halter_samples", "has_valid_collar", "has_valid_halter", "reference_majority_class",
    "reference_label_tie", "is_partial_boundary", *FEATURES,
}
MIN_VALID_SAMPLES_PER_STREAM = 800


def validate_90s_frame(frame: pd.DataFrame, animal: int, expected_rows: int | None = None,
                       context: str = "fixture") -> None:
    missing = REQUIRED - set(frame.columns)
    if missing:
        raise ValueError(f"{context} lacks required 90-second columns: {sorted(missing)}")
    if expected_rows is not None and len(frame) != expected_rows:
        raise ValueError(f"90-second manifest row count mismatch for {context}")
    if frame.empty:
        return
    if frame["animal_id"].isna().any() or set(frame["animal_id"].astype(int)) != {animal}:
        raise ValueError(f"Rows in {context} do not match animal ID")
    if frame["source_split"].isna().any() or set(frame["source_split"]) != {fixed.SPLIT_BY_ANIMAL[animal]}:
        raise ValueError(f"Rows in {context} violate the frozen animal source split")
    if frame["farm_trial_id"].isna().any() or set(frame["farm_trial_id"].astype(int)) != {fixed.TRIAL_BY_ANIMAL[animal]}:
        raise ValueError(f"Rows in {context} violate the frozen farm-trial mapping")
    if frame.duplicated(["animal_id", "window_index"]).any():
        raise ValueError(f"Duplicate animal-window records in {context}")
    seconds = pd.to_numeric(frame["window_seconds"], errors="coerce")
    if seconds.isna().any() or not seconds.eq(WINDOW_SECONDS).all():
        raise ValueError(f"Unexpected window duration in {context}")
    anchor = pd.to_datetime(frame["anchor_timestamp"], errors="coerce")
    starts = pd.to_datetime(frame["window_start"], errors="coerce")
    ends = pd.to_datetime(frame["window_end_exclusive"], errors="coerce")
    if anchor.isna().any() or starts.isna().any() or ends.isna().any():
        raise ValueError(f"Invalid wall-clock boundary timestamp in {context}")
    if anchor.dt.tz is not None or starts.dt.tz is not None or ends.dt.tz is not None:
        raise ValueError(f"Timezone must remain source-naive in {context}")
    if anchor.nunique(dropna=False) != 1:
        raise ValueError(f"Inconsistent README anchor within {context}")
    indices = pd.to_numeric(frame["window_index"], errors="coerce")
    expected_starts = anchor.iloc[0] + pd.to_timedelta(indices * WINDOW_SECONDS, unit="s")
    if not starts.eq(expected_starts).all() or not ends.eq(starts + pd.Timedelta(seconds=WINDOW_SECONDS)).all():
        raise ValueError(f"Window boundaries do not follow the frozen anchor/index rule in {context}")
    for name in ("n_valid_collar_samples", "n_valid_halter_samples"):
        counts = pd.to_numeric(frame[name], errors="coerce")
        if counts.isna().any() or (counts < 0).any() or not np.equal(counts, np.floor(counts)).all():
            raise ValueError(f"Invalid sample count in {name} for {context}")
    if not frame["has_valid_collar"].eq(pd.to_numeric(frame["n_valid_collar_samples"]) > 0).all():
        raise ValueError(f"Collar-valid flag disagrees with sample counts in {context}")
    if not frame["has_valid_halter"].eq(pd.to_numeric(frame["n_valid_halter_samples"]) > 0).all():
        raise ValueError(f"Halter-valid flag disagrees with sample counts in {context}")
    target = pd.to_numeric(frame["reference_majority_class"], errors="coerce")
    tied = frame["reference_label_tie"].fillna(False).astype(bool)
    if (tied & target.notna()).any():
        raise ValueError(f"Tied/invalid reference labels are inconsistent in {context}")
    if ((pd.to_numeric(frame["n_valid_halter_samples"]) == 0) & target.notna()).any():
        raise ValueError(f"Label exists without halter samples in {context}")


def load_90s_parquets(report_path: Path = REPORT_PATH, root: Path = ROOT) -> tuple[pd.DataFrame, dict]:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("kind") != "precision_beef_90s_window_processing":
        raise ValueError("Processing report does not describe the amended 90-second cohort")
    if report.get("windowSeconds") != WINDOW_SECONDS or "half-open" not in report.get("alignment", ""):
        raise ValueError("Processing report does not verify the frozen 90-second alignment")
    source = report.get("source", {})
    if source.get("doi") != "10.5281/zenodo.4064802" or source.get("license") != "CC BY 4.0" or source.get("rawChecksumsVerified") is not True:
        raise ValueError("Processing report lacks verified source/license provenance")
    if report.get("sourceTestAnimals") != sorted(fixed.TEST_ANIMALS):
        raise ValueError("Processing report changed the source-test animal set")
    animals = report.get("perAnimal", [])
    by_id = {int(item.get("animalId", -1)): item for item in animals}
    if set(by_id) != fixed.EXPECTED_ANIMALS or len(animals) != len(by_id):
        raise ValueError("Processing report must contain exactly one output for each animal 01–18")
    frames, checksums = [], {}
    for animal in sorted(fixed.EXPECTED_ANIMALS):
        item = by_id[animal]
        if item.get("sourceSplit") != fixed.SPLIT_BY_ANIMAL[animal] or item.get("farmTrialId") != fixed.TRIAL_BY_ANIMAL[animal]:
            raise ValueError(f"Processing report violates frozen source metadata for animal {animal:02d}")
        rel = Path(item.get("outputPath", ""))
        if rel.is_absolute():
            raise ValueError("Processed output path must be repository-relative")
        path = (root / rel).resolve()
        if root.resolve() not in path.parents or not path.is_file():
            raise FileNotFoundError(f"Missing or unsafe 90-second Parquet: {path}")
        if fixed.sha256_file(path) != item.get("outputSha256"):
            raise ValueError(f"90-second Parquet checksum mismatch for animal {animal:02d}")
        frame = pd.read_parquet(path)
        validate_90s_frame(frame, animal, expected_rows=item.get("outputRows"), context=path.name)
        frames.append(frame)
        checksums[f"{animal:02d}"] = item["outputSha256"]
    data = pd.concat(frames, ignore_index=True)
    if data.duplicated(["animal_id", "window_index"]).any():
        raise ValueError("Duplicate animal-window records across 90-second outputs")
    return data, {"doi": source["doi"], "license": source["license"], "processedParquets": len(frames),
                  "readmeSha256": source.get("readmeSha256"), "processedOutputSha256": checksums,
                  "processingReport": str(report_path.resolve().relative_to(root.resolve()))}


def eligible_windows(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Retain valid common bins with finite collar features and a unique label."""
    missing = REQUIRED - set(frame.columns)
    if missing:
        raise ValueError(f"Input windows lack required columns: {sorted(missing)}")
    if frame.empty:
        raise ValueError("No processed 90-second windows supplied")
    if frame.duplicated(["animal_id", "window_index"]).any():
        raise ValueError("Duplicate animal-window records are not allowed")
    data = frame.copy().reset_index(drop=True)
    data["animal_id"] = pd.to_numeric(data["animal_id"], errors="raise").astype(int)
    if not set(data["animal_id"]).issubset(fixed.EXPECTED_ANIMALS):
        raise ValueError("Unexpected animal ID in processed windows")
    for animal, group in data.groupby("animal_id", sort=True):
        validate_90s_frame(group, int(animal))
    feature_frame = data.loc[:, FEATURES].apply(pd.to_numeric, errors="coerce")
    finite = np.isfinite(feature_frame.to_numpy(dtype=float)).all(axis=1)
    common = data["has_valid_collar"].fillna(False).astype(bool).to_numpy() & data["has_valid_halter"].fillna(False).astype(bool).to_numpy()
    target = pd.to_numeric(data["reference_majority_class"], errors="coerce")
    partial_boundary = data["is_partial_boundary"].fillna(False).astype(bool).to_numpy()
    unique_label = target.isin(LABELS).to_numpy() & ~data["reference_label_tie"].fillna(False).astype(bool).to_numpy()
    collar_n = pd.to_numeric(data["n_valid_collar_samples"], errors="coerce").to_numpy(dtype=int)
    halter_n = pd.to_numeric(data["n_valid_halter_samples"], errors="coerce").to_numpy(dtype=int)
    enough_samples = (collar_n >= MIN_VALID_SAMPLES_PER_STREAM) & (halter_n >= MIN_VALID_SAMPLES_PER_STREAM)
    eligible_mask = common & finite & unique_label & ~partial_boundary & enough_samples
    data.loc[:, FEATURES] = feature_frame
    data["reference_majority_class"] = target
    eligible = data.loc[eligible_mask].copy().reset_index(drop=True)
    eligible["reference_majority_class"] = eligible["reference_majority_class"].astype(int)
    by_animal = {}

    def sample_count_distribution(rows: pd.DataFrame, column: str) -> dict[str, int]:
        values = pd.to_numeric(rows[column], errors="coerce").astype(int).value_counts().sort_index()
        return {str(int(count)): int(n_windows) for count, n_windows in values.items()}

    for animal, positions in data.groupby("animal_id", sort=True).indices.items():
        ix = np.asarray(positions, dtype=int)
        common_local, eligible_local = common[ix], eligible_mask[ix]
        ties = data.iloc[ix]["reference_label_tie"].fillna(False).astype(bool).to_numpy()
        partial = partial_boundary[ix]
        by_animal[f"{int(animal):02d}"] = {
            "sourceSplit": fixed.SPLIT_BY_ANIMAL[int(animal)], "unionWindows": int(len(ix)),
            "commonValidWindows": int(common_local.sum()), "eligibleWindows": int(eligible_local.sum()),
            "tiedReferenceWindows": int(ties.sum()), "partialBoundaryWindows": int(partial.sum()),
            "invalidReferenceWindows": int((common_local & ~target.iloc[ix].isin(LABELS).to_numpy() & ~ties).sum()),
            "belowThresholdWindows": int((common_local & ~enough_samples[ix]).sum()),
            "collarSampleCountDistribution": sample_count_distribution(data.iloc[ix], "n_valid_collar_samples"),
            "halterSampleCountDistribution": sample_count_distribution(data.iloc[ix], "n_valid_halter_samples"),
            "collarOnlyWindows": int((data.iloc[ix]["has_valid_collar"].astype(bool) & ~data.iloc[ix]["has_valid_halter"].astype(bool)).sum()),
            "halterOnlyWindows": int((data.iloc[ix]["has_valid_halter"].astype(bool) & ~data.iloc[ix]["has_valid_collar"].astype(bool)).sum()),
        }
    coverage = {
        "unionWindows": int(len(data)), "commonValidWindows": int(common.sum()),
        "eligibleWindows": int(eligible_mask.sum()), "tiedReferenceWindows": int(data["reference_label_tie"].fillna(False).astype(bool).sum()),
        "invalidReferenceWindows": int((common & ~target.isin(LABELS).to_numpy() & ~data["reference_label_tie"].fillna(False).astype(bool).to_numpy()).sum()),
        "partialBoundaryWindows": int(data["is_partial_boundary"].fillna(False).astype(bool).sum()),
        "minimumValidSamplesPerStream": MIN_VALID_SAMPLES_PER_STREAM,
        "nominalSamplesPerStream": WINDOW_SECONDS * 10,
        "belowThresholdWindows": int((common & ~enough_samples).sum()),
        "collarOnlyWindows": int((data["has_valid_collar"].astype(bool) & ~data["has_valid_halter"].astype(bool)).sum()),
        "halterOnlyWindows": int((data["has_valid_halter"].astype(bool) & ~data["has_valid_collar"].astype(bool)).sum()),
        "commonValidButExcludedForNonfiniteFeatures": int((common & ~finite).sum()), "byAnimal": by_animal,
        "collarSampleCountDistribution": sample_count_distribution(data, "n_valid_collar_samples"),
        "halterSampleCountDistribution": sample_count_distribution(data, "n_valid_halter_samples"),
    }
    return eligible, coverage


def _canonical_sha256(value: object) -> str:
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def reproducibility_record(evaluation: dict, eligible_test: pd.DataFrame) -> dict:
    """Bind runtime, fixed estimator settings, and ordered test rows/predictions."""
    final = evaluation["finalSourceTest"]
    ordered = eligible_test.reset_index(drop=True)
    predictions = final["predictions"]
    if len(ordered) != len(predictions["random_forest_fixed"]):
        raise ValueError("Prediction hashes require one prediction per ordered test row")
    return {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "pandas": pd.__version__,
        "scikitLearn": sklearn.__version__,
        "pyarrow": pyarrow.__version__,
        "randomSeed": fixed.SEED,
        "randomForestParameters": fixed.RF_PARAMETERS,
        "weighting": "Equal total sample weight per training animal; each eligible window receives 1 / that animal's eligible window count.",
        "development": "Fixed-parameter leave-one-animal-out over the 15 source-train animals; no parameter search or feature selection.",
        "testRowOrder": "Animal ascending, then source Parquet row/window order; windows are unique per animal and sorted by window_index during processing.",
        "testRowsSha256": _canonical_sha256([
            [int(animal), int(window)]
            for animal, window in zip(ordered["animal_id"], ordered["window_index"], strict=True)
        ]),
        "testLabelsSha256": _canonical_sha256(ordered["reference_majority_class"].astype(int).tolist()),
        "testPredictionSha256": {
            key: _canonical_sha256([int(value) for value in values])
            for key, values in predictions.items()
        },
        "implementationSha256": {
            "evaluate_90s_windows.py": fixed.sha256_file(Path(__file__).resolve()),
            "evaluate_instrument_agreement.py": fixed.sha256_file(Path(fixed.__file__) if hasattr(fixed, "__file__") else HERE / "evaluate_instrument_agreement.py"),
            "process_90s_windows.py": fixed.sha256_file(PROCESSOR),
            "preregistration.json": fixed.sha256_file(HERE / "preregistration.json"),
            "amendment-2026-10-13.json": fixed.sha256_file(AMENDMENT_PATH),
        },
    }


def run(report_path: Path = REPORT_PATH, output_dir: Path = HERE) -> dict:
    # Importing fixed protocol helpers does not fit anything; execution is an explicit CLI action.
    prereg = fixed.load_preregistration()
    amendment = json.loads(AMENDMENT_PATH.read_text(encoding="utf-8"))
    if amendment.get("status") != "registered_before_model_fit" or amendment.get("supersedes") != "preregistration.json":
        raise ValueError("The dated 90-second amendment must precede fitting and retain the original preregistration")
    if amendment.get("alignment", {}).get("windowSeconds") != WINDOW_SECONDS:
        raise ValueError("The implementation differs from the dated 90-second amendment")
    if amendment.get("cohort", {}).get("minimumValidSamplesPerStream") != MIN_VALID_SAMPLES_PER_STREAM:
        raise ValueError("The sample-coverage threshold differs from the dated 90-second amendment")
    raw, provenance = load_90s_parquets(report_path)
    eligible, coverage = eligible_windows(raw)
    train = eligible.loc[eligible["source_split"] == "source_train"].reset_index(drop=True)
    test = eligible.loc[eligible["source_split"] == "source_test"].reset_index(drop=True)
    if set(train["animal_id"].astype(int)) != fixed.EXPECTED_ANIMALS - fixed.TEST_ANIMALS:
        raise ValueError("All 15 source-train animals must contribute eligible windows")
    if set(test["animal_id"].astype(int)) != fixed.TEST_ANIMALS:
        raise ValueError("All frozen source-test animals must contribute eligible windows")
    evaluation = fixed.evaluate(train, test)
    result = {
        "kind": "precision_beef_90s_window_instrument_agreement_source_split_diagnostic",
        "protocolAmendment": "amendment-2026-10-13.json", "alignmentUnit": "90-second half-open wall-clock windows",
        "preregistration": {"path": "preregistration.json", "historicalStatus": prereg["status"],
                            "amendmentDatedBeforeFit": True, "features": list(FEATURES)},
        "source": provenance, "cohortCoverage": coverage, "evaluation": evaluation,
        "interpretation": "Exploratory instrument agreement only; not independent validation, human ground truth, farm/trial transport, grazing, DMI, or Riose validation.",
    }
    result["reproducibility"] = reproducibility_record(evaluation, test)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "results-90s.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output_dir / "results-90s.md").write_text(render_markdown(result), encoding="utf-8")
    return result


def render_markdown(result: dict) -> str:
    """Render a compact human-readable summary from the machine-readable result."""
    def pt_int(value: int) -> str:
        return f"{value:,}".replace(",", ".")

    evaluation = result["evaluation"]
    development = evaluation["developmentSourceTrainLeaveOneAnimalOut"]["metrics"]
    test = evaluation["finalSourceTest"]
    rf = test["models"]["random_forest_fixed"]
    baseline = test["models"]["training_majority_baseline"]
    coverage = result["cohortCoverage"]
    return f'''# Precision Beef: concordância entre instrumentos em janelas de 90 s

**Decisão:** CONDITIONAL para diagnóstico de concordância entre instrumentos; inelegível como evidência de comportamento em pastejo, consumo, ganho de peso ou validação da Riose.

## Coorte e protocolo

- Fonte: Zenodo DOI `10.5281/zenodo.4064802`, licença CC BY 4.0; 37 arquivos brutos verificados por checksum e 18 Parquets processados.
- 18 novilhos confinados; {pt_int(coverage['unionWindows'])} janelas comuns e {pt_int(coverage['eligibleWindows'])} elegíveis para pontuação.
- Janelas semiabertas de 90 s ancoradas no início arredondado do README. O modelo usa estatísticas do collar; o rótulo é a classe majoritária derivada do halter.
- O score exclui janelas de fronteira parcial, rótulos empatados/inválidos, features não finitas e contagens abaixo de {coverage['minimumValidSamplesPerStream']}/900 em qualquer instrumento.
- O split da fonte foi preservado: 15 animais no desenvolvimento; animais {', '.join(test['animals'])} no teste. Não houve sobreposição de animais.

## Resultados

| Avaliação | Macro-F1 | Acurácia balanceada | Acurácia |
|---|---:|---:|---:|
| Desenvolvimento, leave-one-animal-out nos 15 animais de treino | {development['macroF1']:.3f} | {development['balancedAccuracy']:.3f} | {development['accuracy']:.3f} |
| Teste da fonte, RF fixo ({pt_int(sum(rf['classSupport'].values()))} janelas) | {rf['macroF1']:.3f} | {rf['balancedAccuracy']:.3f} | {rf['accuracy']:.3f} |
| Teste da fonte, baseline de classe majoritária | {baseline['macroF1']:.3f} | {baseline['balancedAccuracy']:.3f} | {baseline['accuracy']:.3f} |

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
'''


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    parser.add_argument("--output-dir", type=Path, default=HERE)
    args = parser.parse_args(argv)
    result = run(args.report, args.output_dir)
    print(json.dumps({"status": "complete", "windows": result["cohortCoverage"]["eligibleWindows"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
