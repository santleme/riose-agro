#!/usr/bin/env python3
"""Descriptive animal-cluster analysis of the approved USDA/CPER question.

This reports within-study associations only. It is not causal analysis or
validation/calibration of Agroville's numerical engine.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import random
import statistics
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = ROOT / "data/usda-cper"
SOURCE = DATA_DIR / "period.csv"
MANIFEST = DATA_DIR / "manifest.json"
REPORT = ROOT / "docs/evidence/usda-cper-association.json"
BOOTSTRAP_REPLICATES = 5000
BOOTSTRAP_SEED = 20261011
FEATURES = {
    "GBD_5min": "mean grazing-bout duration at 5-minute resolution (minutes)",
    "MeanVelo": "mean velocity while grazing (meters/minute)",
}


def _average_ranks(values: list[float]) -> list[float]:
    ordered = sorted(enumerate(values), key=lambda pair: pair[1])
    ranks = [0.0] * len(values)
    index = 0
    while index < len(ordered):
        end = index + 1
        while end < len(ordered) and ordered[end][1] == ordered[index][1]:
            end += 1
        average_rank = ((index + 1) + end) / 2
        for position in range(index, end):
            ranks[ordered[position][0]] = average_rank
        index = end
    return ranks


def _pearson(left: list[float], right: list[float]) -> float | None:
    if len(left) != len(right) or len(left) < 2:
        return None
    mean_left = statistics.fmean(left)
    mean_right = statistics.fmean(right)
    centered_left = [value - mean_left for value in left]
    centered_right = [value - mean_right for value in right]
    sum_left = sum(value * value for value in centered_left)
    sum_right = sum(value * value for value in centered_right)
    denominator = math.sqrt(sum_left * sum_right)
    if denominator == 0:
        return None
    return sum(a * b for a, b in zip(centered_left, centered_right)) / denominator


def spearman(left: list[float], right: list[float]) -> float | None:
    return _pearson(_average_ranks(left), _average_ranks(right))


def _remove_additive_group_effects(values: list[float], first: list[str], second: list[str]) -> list[float]:
    """Residualize values against two additive categorical effects by alternating demeaning."""
    residuals = values[:]
    groups = []
    for labels in (first, second):
        members: dict[str, list[int]] = defaultdict(list)
        for index, label in enumerate(labels):
            members[label].append(index)
        groups.append(list(members.values()))

    for _ in range(10_000):
        largest_change = 0.0
        for members in groups:
            for indices in members:
                mean = statistics.fmean(residuals[index] for index in indices)
                for index in indices:
                    residuals[index] -= mean
                    largest_change = max(largest_change, abs(mean))
        if largest_change < 1e-12:
            return residuals
    raise ValueError("Fixed-effect residualization did not converge")


def adjusted_rank_correlation(rows: list[dict], feature: str) -> float | None:
    """Partial Spearman sensitivity after additive period and pasture effects."""
    outcome_ranks = _average_ranks([row["_adg"] for row in rows])
    feature_ranks = _average_ranks([row[f"_{feature}"] for row in rows])
    periods = [row["60dADG_INT"].strip() for row in rows]
    pastures = [row["Pasture"].strip() for row in rows]
    residual_outcome = _remove_additive_group_effects(outcome_ranks, periods, pastures)
    residual_feature = _remove_additive_group_effects(feature_ranks, periods, pastures)
    return _pearson(residual_outcome, residual_feature)


def _percentile(sorted_values: list[float], probability: float) -> float:
    position = (len(sorted_values) - 1) * probability
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return sorted_values[low]
    fraction = position - low
    return sorted_values[low] * (1 - fraction) + sorted_values[high] * fraction


def _cluster_bootstrap(rows: list[dict], feature: str) -> dict:
    clusters: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        clusters[row["Eartag"]].append(row)
    cluster_ids = sorted(clusters)
    observed = spearman(
        [row["_adg"] for row in rows],
        [row[f"_{feature}"] for row in rows],
    )
    if observed is None:
        raise ValueError(f"Cannot calculate correlation for {feature}")

    rng = random.Random(BOOTSTRAP_SEED)
    estimates = []
    for _ in range(BOOTSTRAP_REPLICATES):
        selected = [rng.choice(cluster_ids) for _ in cluster_ids]
        sample = [row for cluster_id in selected for row in clusters[cluster_id]]
        estimate = spearman(
            [row["_adg"] for row in sample],
            [row[f"_{feature}"] for row in sample],
        )
        if estimate is not None and math.isfinite(estimate):
            estimates.append(estimate)
    if len(estimates) < BOOTSTRAP_REPLICATES * 0.95:
        raise ValueError(f"Too many degenerate bootstrap samples for {feature}")
    estimates.sort()
    return {
        "spearmanRho": observed,
        "animalClusterBootstrap95PercentileInterval": [
            _percentile(estimates, 0.025),
            _percentile(estimates, 0.975),
        ],
        "bootstrapReplicates": len(estimates),
        "bootstrapSeed": BOOTSTRAP_SEED,
        "clusterUnit": "Eartag; all periods for a sampled animal are kept together",
    }


def _adjusted_cluster_bootstrap(rows: list[dict], feature: str) -> dict:
    clusters: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        clusters[row["Eartag"]].append(row)
    cluster_ids = sorted(clusters)
    observed = adjusted_rank_correlation(rows, feature)
    if observed is None:
        raise ValueError(f"Cannot calculate adjusted rank correlation for {feature}")

    rng = random.Random(BOOTSTRAP_SEED + 1)
    estimates = []
    for _ in range(BOOTSTRAP_REPLICATES):
        selected = [rng.choice(cluster_ids) for _ in cluster_ids]
        sample = [row for cluster_id in selected for row in clusters[cluster_id]]
        estimate = adjusted_rank_correlation(sample, feature)
        if estimate is not None and math.isfinite(estimate):
            estimates.append(estimate)
    if len(estimates) < BOOTSTRAP_REPLICATES * 0.95:
        raise ValueError(f"Too many degenerate adjusted bootstrap samples for {feature}")
    estimates.sort()
    return {
        "partialSpearmanRho": observed,
        "animalClusterBootstrap95PercentileInterval": [
            _percentile(estimates, 0.025),
            _percentile(estimates, 0.975),
        ],
        "bootstrapReplicates": len(estimates),
        "bootstrapSeed": BOOTSTRAP_SEED + 1,
        "adjustment": "Additive fixed effects for 60dADG_INT and Pasture, applied to within-sample average ranks",
        "clusterUnit": "Eartag; all periods for a sampled animal are kept together",
        "interpretation": "Secondary descriptive sensitivity; not causal and not an engine validation",
    }


def _describe_group(rows: list[dict], feature: str) -> dict:
    estimate = spearman(
        [row["_adg"] for row in rows],
        [row[f"_{feature}"] for row in rows],
    )
    return {
        "nAnimalPeriods": len(rows),
        "nUniqueAnimals": len({row["Eartag"] for row in rows}),
        "spearmanRho": estimate,
    }


def analyze() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    expected = next((entry["sha256"] for entry in manifest["files"] if entry["path"] == "period.csv"), None)
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if expected is None or source_hash != expected:
        raise ValueError("period.csv does not match the published CPER snapshot manifest")

    with SOURCE.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        required = {"Year", "Pasture", "Eartag", "60dADG_INT", "DaysData", "GBD_5min", "MeanVelo", "ADG_60d"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing columns: {sorted(missing)}")
        rows = list(reader)

    grouped: dict[str, list[dict]] = defaultdict(list)
    per_period: dict[str, list[dict]] = defaultdict(list)
    per_pasture: dict[str, list[dict]] = defaultdict(list)
    by_period = Counter()
    by_pasture = Counter()
    for index, row in enumerate(rows, start=2):
        eartag = (row.get("Eartag") or "").strip()
        if not eartag:
            raise ValueError(f"Missing Eartag in CSV line {index}")
        try:
            adg = float(row["ADG_60d"])
            days = int(row["DaysData"])
            gbd = float(row["GBD_5min"])
            velocity = float(row["MeanVelo"])
        except (TypeError, ValueError) as error:
            raise ValueError(f"Invalid analysis value in CSV line {index}") from error
        if days <= 0 or not all(math.isfinite(value) for value in (adg, gbd, velocity)):
            raise ValueError(f"Non-finite or invalid analysis value in CSV line {index}")
        row.update({"Eartag": eartag, "_adg": adg, "_GBD_5min": gbd, "_MeanVelo": velocity})
        grouped[eartag].append(row)
        period = row["60dADG_INT"].strip()
        pasture = row["Pasture"].strip()
        if not period or not pasture:
            raise ValueError(f"Missing period or pasture in CSV line {index}")
        per_period[period].append(row)
        per_pasture[pasture].append(row)
        by_period[period] += 1
        by_pasture[pasture] += 1

    repeated = {animal: len(group) for animal, group in grouped.items() if len(group) > 1}
    features = {}
    for feature, meaning in FEATURES.items():
        by_period_rho = {}
        for period, period_rows in sorted(per_period.items()):
            by_period_rho[period] = _describe_group(period_rows, feature)
        by_pasture_rho = {
            pasture: _describe_group(pasture_rows, feature)
            for pasture, pasture_rows in sorted(per_pasture.items())
        }
        leave_one_period_out = {}
        for omitted_period in sorted(per_period):
            retained = [row for row in rows if row["60dADG_INT"].strip() != omitted_period]
            leave_one_period_out[omitted_period] = {
                "omittedPeriod": omitted_period,
                **_describe_group(retained, feature),
            }
        features[feature] = {
            "meaning": meaning,
            "pooledAnimalPeriodRows": len(rows),
            "uniqueAnimals": len(grouped),
            **_cluster_bootstrap(rows, feature),
            "adjustedFixedEffectsRankSensitivity": _adjusted_cluster_bootstrap(rows, feature),
            "withinPeriodDescriptiveAssociations": by_period_rho,
            "withinPastureDescriptiveAssociations": by_pasture_rho,
            "leaveOnePeriodOutSensitivity": leave_one_period_out,
        }

    return {
        "classification": "within_study_observational_association_exploration_not_engine_validation",
        "source": {
            **manifest["source"],
            "file": "data/usda-cper/period.csv",
            "sha256": source_hash,
            "sha256Verified": True,
        },
        "question": "Among observed yearling beef steers (approximately one year old) in the USDA/CPER 2019-2020 shortgrass study, how are mean grazing-bout duration and mean grazing velocity associated with observed ADG?",
        "coverage": {
            "animalPeriodRows": len(rows),
            "uniqueAnimals": len(grouped),
            "repeatedAnimalIds": repeated,
            "rowsByPeriod": dict(sorted(by_period.items())),
            "rowsByPasture": dict(sorted(by_pasture.items())),
            "target": "ADG_60d (kg/steer/day)",
        },
        "features": features,
        "limits": [
            "The data are observational; these associations do not estimate causal effects of grazing behavior or management.",
            "All observations come from one study, site, and shortgrass system. Period-specific correlations use small samples and are descriptive.",
            "Period and pasture stratifications are unadjusted descriptive slices, not a joint model; repeated animal-period observations can occur in more than one slice. Leave-one-period-out summaries are sensitivity checks, not independent validation folds.",
            "Animal-cluster bootstrap intervals describe resampling variation in this dataset; they are not prediction intervals, do not measure engine.js uncertainty, and do not generalize automatically to another herd or year.",
            "The two features were pre-specified in the approved case and also reported by the original study; this is a descriptive re-analysis of the same dataset, not independent confirmation of the published relationship.",
            "The analysis does not validate DMI, weight trajectories, costs, pasture stock, or pasture-versus-confinement scenarios in engine.js.",
            "The secondary partial-Spearman sensitivity residualizes within-sample ranks against additive period and pasture effects. Its animal-cluster bootstrap is descriptive; the small one-site dataset, sparse period-pasture cells, possible effect interactions, and unresampled site/year/paddock structure limit inference.",
        ],
    }


if __name__ == "__main__":
    result = analyze()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))
