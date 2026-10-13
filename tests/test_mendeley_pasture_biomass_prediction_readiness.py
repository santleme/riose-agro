import importlib.util
import hashlib
import json
import unittest
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/audit_mendeley_pasture_biomass_prediction_readiness.py"
ARTIFACT = ROOT / "docs/evidence/mendeley-pasture-biomass-prediction-readiness-2026-10.json"
OOF = ROOT / "docs/evidence/mendeley-pasture-biomass-grouped-oof-2026-10.csv"


spec = importlib.util.spec_from_file_location("biomass_readiness", SCRIPT)
biomass_readiness = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(biomass_readiness)


class MendeleyPastureBiomassPredictionReadinessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(ARTIFACT.read_text(encoding="utf-8"))

    def test_target_is_observed_biomass_and_never_dmi_or_adg(self):
        self.assertEqual(self.report["sourceDoi"], "10.17632/nj72kmdj77.1")
        self.assertEqual(self.report["module"], "forage_biomass_and_productivity")
        self.assertTrue(self.report["notDmiOrAdg"])
        self.assertEqual(self.report["target"]["column"], "dry_matter_yield_kg_dm_ha")
        self.assertEqual(self.report["target"]["unit"], "kg DM/ha")
        self.assertLess(self.report["target"]["derivations"]["dry_matter_weight_g_times_40"]["maxAbsoluteDifferenceKgHa"], 1e-5)
        self.assertEqual(self.report["target"]["derivations"]["dry_matter_yield_tonnes_ha_times_1000"]["maxAbsoluteDifferenceKgHa"], 0)

    def test_target_aliases_and_same_sample_weights_are_excluded_as_predictors(self):
        excluded = {row["column"] for row in self.report["featureAudit"]["excludedFromPredictors"]}
        for column in (
            "dry_matter_yield_kg_dm_ha",
            "dry_matter_weight_g",
            "dry_matter_yield_tonnes_ha",
            "fresh_harvest_weight_g",
            "fresh_green_weight_g",
            "fresh_other_weight_g",
        ):
            self.assertIn(column, excluded)

    def test_spatial_groups_and_farm_holdouts_are_descriptive_only(self):
        design = self.report["design"]
        self.assertEqual(design["rows"], 342)
        self.assertEqual(design["uniqueSpatialGroups"], 162)
        self.assertEqual(design["spatialGroupsRepeatedAcrossCampaigns"], 108)
        self.assertEqual(design["rowsBelongingToRepeatedSpatialGroups"], 288)
        self.assertEqual(design["farmCount"], 2)
        self.assertEqual(self.report["holdoutReadiness"]["randomRowSplit"].split(";")[0], "PROHIBITED")
        folds = self.report["holdoutReadiness"]["farmHoldoutFolds"]
        self.assertEqual([(fold["trainRows"], fold["testRows"]) for fold in folds], [(261, 81), (81, 261)])
        self.assertEqual(folds[1]["testManagementLevelsAbsentFromTrain"], ["3"])
        self.assertTrue(all(fold["status"] == "NO_FARM_HOLDOUT_MODEL_OR_METRICS" for fold in folds))

    def test_grouped_oof_has_no_repeated_location_across_folds(self):
        oof = self.report["holdoutReadiness"]["internalGroupedOof"]
        self.assertEqual(oof["eligibleRows"], 234)
        self.assertEqual(oof["eligibleSpatialGroups"], 135)
        self.assertEqual(oof["eligibleSpatialGroupsRepeatedAcrossCampaigns"], 99)
        self.assertEqual(oof["eligibleRowsInRepeatedSpatialGroups"], 198)
        self.assertEqual(oof["campaignsCovered"], ["2018-11", "2019-03"])
        self.assertEqual(oof["campaignsNotCovered"], ["2018-06"])
        self.assertEqual(oof["splitter"].split(";")[0], "sklearn.model_selection.GroupKFold(n_splits=5)")
        self.assertEqual(len(oof["folds"]), 5)
        self.assertTrue(all(fold["spatialGroupOverlap"] == 0 for fold in oof["folds"]))
        predictions = pd.read_csv(OOF)
        self.assertEqual(len(predictions), 234)
        self.assertEqual(predictions.groupby("spatial_group_id")["fold"].nunique().max(), 1)
        self.assertEqual(set(predictions["campaign"]), {"2018-11", "2019-03"})
        self.assertTrue(predictions["training_median_prediction_kg_dm_ha"].notna().all())
        self.assertTrue(predictions["height_linear_prediction_kg_dm_ha"].notna().all())

    def test_metrics_are_reproducible_and_not_external_validation(self):
        self.assertEqual(self.report["predictionReadiness"], "NO_GO_FOR_GENERALIZABLE_PREDICTION")
        self.assertTrue(self.report["holdoutReadiness"]["modelTrainingPerformed"])
        self.assertTrue(self.report["holdoutReadiness"]["metricsReported"])
        next_evaluation = self.report["holdoutReadiness"]["recommendedNextEvaluation"]
        self.assertIn("has been completed", next_evaluation)
        self.assertIn("independent third farm", next_evaluation)
        self.assertEqual(
            self.report["holdoutReadiness"]["internalGroupedOof"]["status"],
            "INTERNAL_GROUPED_OOF_DIAGNOSTIC_ONLY_NOT_EXTERNAL_VALIDATION",
        )
        markdown = (ROOT / "docs/evidence/mendeley-pasture-biomass-prediction-readiness-2026-10.md").read_text(encoding="utf-8")
        self.assertIn("do not constitute external validation", markdown)
        rebuilt, predictions = biomass_readiness.build_report()
        self.assertEqual(rebuilt, self.report)
        generated_csv = predictions.to_csv(index=False, float_format="%.8f", lineterminator="\n").encode("utf-8")
        self.assertEqual(hashlib.sha256(generated_csv).hexdigest(), self.report["holdoutReadiness"]["internalGroupedOof"]["predictionsArtifact"]["sha256"])
        self.assertEqual(OOF.read_bytes(), generated_csv)


if __name__ == "__main__":
    unittest.main()
