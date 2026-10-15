import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/science/evaluations/evaluate_cper_adg_candidate_v2.py"
SPEC = importlib.util.spec_from_file_location("cper_adg_candidate_v2", SCRIPT)
experiment = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(experiment)


class CperAdgCandidateV2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows, cls.source = experiment.read_cohort()

    def test_protocol_is_preregistered_and_forbids_outcome_leakage(self):
        protocol = json.loads(experiment.PROTOCOL.read_text(encoding="utf-8"))
        self.assertEqual(protocol["status"], "preregistered_before_execution")
        self.assertEqual(protocol["source"]["allowedYears"], [2009, 2010, 2011, 2012, 2013])
        self.assertIn("realized Season.Days", " ".join(protocol["features"]["excluded"]))
        self.assertTrue(protocol["mechanisticBenchmark"]["use"].startswith("Descriptive benchmark only:"))
        self.assertEqual(self.source["sha256"], "533929668b59bc9b6f67bf202c87a746634871419972db126e6c94b2f83eac14")

    def test_year_splits_purge_identity_proxy(self):
        train, test, purged = experiment.split_year(self.rows, 2009)
        self.assertEqual(len(test), 62)
        self.assertEqual(purged, 4)
        self.assertFalse({r["identity"] for r in train} & {r["identity"] for r in test})
        inner_train, inner_test, _ = experiment.split_year(train, 2010)
        self.assertFalse({r["identity"] for r in inner_train} & {r["identity"] for r in inner_test})

    def test_candidate_grids_are_fixed_and_only_use_one_preoutcome_feature(self):
        self.assertEqual(set(experiment.GRIDS), {"M2", "M3", "M4", "M5"})
        self.assertEqual(len(experiment.GRIDS["M2"]), 4)
        for model_id in ("M1", "M2", "M3", "M4", "M5"):
            estimator = experiment.model(model_id, experiment.GRIDS[model_id][0] if model_id in experiment.GRIDS else ())
            self.assertTrue(hasattr(estimator, "fit"))
        self.assertEqual({row["year"] for row in self.rows}, set(experiment.YEARS))

    def test_same_rows_and_nested_search_report_if_artifacts_exist(self):
        report_path = experiment.EXP / "evaluation.json"
        oof_path = experiment.EXP / "oof-predictions.csv"
        if not report_path.exists() or not oof_path.exists():
            self.skipTest("Run scripts/science/evaluations/evaluate_cper_adg_candidate_v2.py to produce experiment outputs")
        report = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertFalse(report["cgrecOutcomesUsed"])
        self.assertEqual(report["evaluation"]["oofRows"], 320)
        self.assertTrue(report["evaluation"]["allModelsSameRows"])
        self.assertTrue(report["evaluation"]["engineRowMapping"]["oneToOneRowMapping"])
        self.assertEqual(report["evaluation"]["engineRowMapping"]["inputRows"], 320)
        self.assertEqual(set(report["evaluation"]["models"]), {
            "M0", "M1", "M2", "M3", "M4", "M5", "engineDefaultDescriptive", "engineTrainScaledDescriptive"
        })
        self.assertEqual(report["evaluation"]["engineUse"], "descriptive_only_excluded_from_selection")
        for fold in report["evaluation"]["folds"]:
            self.assertEqual(len(fold["innerTrainingYears"]), 4)
            self.assertEqual(set(fold["selectedParameters"]), {"M2", "M3", "M4", "M5"})
        for model_id in ("M2", "M3", "M4", "M5"):
            self.assertGreater(report["evaluation"]["cpuCosts"][model_id]["innerSearch"]["fitCalls"], 0)
        import csv
        with oof_path.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 320)
        self.assertEqual(len({row["rowId"] for row in rows}), 320)


if __name__ == "__main__":
    unittest.main()
