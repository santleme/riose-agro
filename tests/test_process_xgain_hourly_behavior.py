import unittest

from scripts.process_xgain_hourly_behavior import process


class XGainHourlyBehaviorProcessingTest(unittest.TestCase):
    def test_public_archive_normalizes_to_animal_hour_counts(self):
        report = process()
        self.assertEqual(report["status"], "processed_descriptive_only")
        self.assertEqual(report["records"], 5760)
        self.assertEqual(report["animals"], 10)
        self.assertEqual(report["uniqueAnimalHourKeys"], 5760)
        self.assertEqual(report["duplicateAnimalHourKeys"], 0)
        self.assertEqual(report["missingValues"], 0)
        self.assertEqual(report["countSumMinutesPerHour"], {
            "minimum": 60,
            "mean": 60,
            "maximum": 60,
        })
        self.assertIn("not released human-reference", report["targetProvenance"])


if __name__ == "__main__":
    unittest.main()
