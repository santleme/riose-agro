import unittest

import pyarrow.parquet as pq

from scripts.science.data_pipelines.process_dryad_mob_rotational_biomass import PADDOCK_PARQUET, SAMPLE_PARQUET, process


class DryadMobRotationalBiomassProcessingTest(unittest.TestCase):
    def test_public_cohort_preserves_missingness_and_paddock_groups(self):
        report = process()
        self.assertEqual(report["status"], "processed_candidate_external_biomass_cohort")
        self.assertEqual(report["rowLevelRows"], 623)
        self.assertEqual(report["rowsWithMissingTargetNotExported"], 17)
        self.assertEqual(report["aggregatedRows"], 64)
        self.assertEqual(report["groupCount"], 8)
        rows = pq.read_table(PADDOCK_PARQUET).to_pylist()
        self.assertEqual(len(rows), 64)
        self.assertEqual(len({row["paddockId"] for row in rows}), 8)
        self.assertEqual({row["calendarYear"] for row in rows}, {2015, 2016, 2017, 2018})
        self.assertTrue(all(8 <= row["nQuadratSamples"] <= 10 for row in rows))
        self.assertNotIn("animalId", pq.read_schema(SAMPLE_PARQUET).names)


if __name__ == "__main__":
    unittest.main()
