import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.science.behavior.evaluate_perea_confirmatory import confirmatory_partition


class PereaConfirmatoryProtocolTests(unittest.TestCase):
    def test_reserved_partition_has_exact_four_test_and_twenty_disjoint_train_animals(self):
        animals = {
            f"{breed}:{animal}" for breed, ids in {
                "AH": ["2003", "2004", "2008", "2009", "2013", "2019"],
                "BH": ["4071", "4085", "4511", "4589", "5111", "6495"],
                "BR": ["7001", "8063", "8065", "8071", "8073", "8089"],
                "RC": ["35", "6", "1067", "2061", "2024", "9012"],
            }.items() for animal in ids
        }
        training, confirmatory = confirmatory_partition(animals)
        self.assertEqual(training | confirmatory, animals)
        self.assertFalse(training & confirmatory)
        self.assertEqual(len(training), 20)
        self.assertEqual(confirmatory, {"AH:2008", "BH:5111", "BR:8065", "RC:35"})

    def test_changed_roster_fails_closed_before_confirmatory_scoring(self):
        altered = {
            f"{breed}:{animal}" for breed, ids in {
                "AH": ["2003", "2004", "9999", "2009", "2013", "2019"],
                "BH": ["4071", "4085", "4511", "4589", "5111", "6495"],
                "BR": ["7001", "8063", "8065", "8071", "8073", "8089"],
                "RC": ["35", "6", "1067", "2061", "2024", "9012"],
            }.items() for animal in ids
        }
        with self.assertRaisesRegex(ValueError, "differs from frozen protocol"):
            confirmatory_partition(altered)


if __name__ == "__main__":
    unittest.main()
