import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data/mendeley-pasture-biomass"


class MendeleyPastureBiomassRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))
        cls.report = json.loads((DATA_DIR / "processed/quality-report-v1.json").read_text(encoding="utf-8"))

    def test_license_and_module_boundary_are_explicit(self):
        self.assertEqual(self.manifest["source"]["doi"], "10.17632/nj72kmdj77.1")
        self.assertEqual(self.manifest["source"]["license"], "CC BY 4.0")
        self.assertIn("forage_biomass_and_productivity", self.manifest["use"]["eligibleCohorts"])
        self.assertFalse(self.manifest["use"]["dmiTargetEligible"])
        self.assertTrue(self.report["notDmi"])

    def test_downloaded_sources_match_official_file_checksums(self):
        selected = [file for file in self.manifest["files"] if file["selectedForDownload"]]
        self.assertEqual(len(selected), 20)
        for file in selected:
            path = ROOT / file["localPath"]
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(digest, file["sha256"], file["name"])
            self.assertEqual(digest, file["verifiedSha256"], file["name"])

    def test_processed_rows_keep_repeated_spatial_groups_and_missingness(self):
        self.assertEqual(self.report["totalRows"], 342)
        self.assertEqual(self.report["uniqueSamplingRows"], 342)
        self.assertEqual(self.report["withinCampaignDuplicateRows"], 0)
        self.assertEqual(self.report["spatialGroupsObservedInMultipleCampaigns"], 108)
        self.assertEqual(self.report["rowsWithRepeatedSpatialGroup"], 288)
        self.assertEqual(self.report["campaigns"][0]["campaign"], "2018-06")
        self.assertEqual(self.report["campaigns"][0]["missingnessByColumn"]["sward_height_cm"], 108)
        self.assertEqual(self.report["campaigns"][0]["missingnessByColumn"]["dry_matter_yield_kg_dm_ha"], 0)
        self.assertEqual(self.report["validationSplitRequirement"], "group on farm/field_code/pixel_id/sampling_point_id; random row split would leak repeated locations across campaigns")

    def test_unit_check_and_parquet_checksum_are_recorded(self):
        for campaign in self.report["campaigns"]:
            self.assertLess(campaign["dryWeightToRecordedYieldMaxAbsoluteDeltaKgHa"], 1e-5)
        output = self.report["outputs"][0]
        path = ROOT / output["path"]
        self.assertTrue(path.exists())
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), output["sha256"])
        self.assertEqual(output["format"], "parquet")


if __name__ == "__main__":
    unittest.main()
