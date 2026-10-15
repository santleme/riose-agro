import json
import unittest
from pathlib import Path

from scripts.science.behavior.audit_perea_no_go_diagnostics import (
    OUTPUT_JSON, OUTPUT_MD, build_report, render_markdown,
)


class PereaNoGoDiagnosticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stored = json.loads(OUTPUT_JSON.read_text(encoding="utf-8"))
        cls.rebuilt = build_report()

    def test_report_replays_deterministically_and_preserves_no_go(self):
        self.assertEqual(self.rebuilt, self.stored)
        self.assertEqual(self.stored["decision"], "NO_GO_FOR_THIS_CANDIDATE_AND_SOURCE")
        self.assertTrue(self.stored["diagnosticOnly"])
        self.assertFalse(self.stored["gateDiagnostics"]["composition"]["passed"])
        self.assertFalse(self.stored["gateDiagnostics"]["transitionTV"]["passed"]["persistence"])
        self.assertFalse(self.stored["gateDiagnostics"]["rareClassRU"]["passed"])

    def test_replayed_sequence_diagnostics_reconcile_to_frozen_evaluator(self):
        original = json.loads(Path("docs/evidence/perea-confirmatory-v1.json").read_text(encoding="utf-8"))
        for model in ("iid", "persistence", "markov", "semimarkov"):
            for animal, expected in original["metrics"][model]["perAnimal"].items():
                actual = self.stored["sequenceDiagnostics"][model]["perAnimalSequenceDiagnostics"][animal]
                for metric, value in expected["diagnostics"].items():
                    self.assertAlmostEqual(actual[metric], value, places=12)

    def test_diagnostic_reports_censoring_and_sparse_ru_support_without_claiming_truth(self):
        self.assertEqual(self.stored["partition"]["confirmatoryAnimals"], ["AH:2008", "BH:5111", "BR:8065", "RC:35"])
        self.assertEqual(self.stored["pereaSourceCensoringByClass"]["RU"]["fractionTouchingEitherBoundary"], 264 / 267)
        self.assertEqual(self.stored["sequenceDiagnostics"]["semimarkov"]["completeInteriorRunDurationsByClass"]["RU"]["completeInteriorRuns"], 324)
        self.assertTrue(any("carry-forward" in item for item in self.stored["limitations"]))
        self.assertIn("**Decision remains NO-GO.", render_markdown(self.stored))


if __name__ == "__main__":
    unittest.main()
