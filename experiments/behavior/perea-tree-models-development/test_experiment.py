import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "experiments/behavior/perea-tree-models-development/run_experiment.py"
spec = importlib.util.spec_from_file_location("perea_tree_models_development", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class PereaTreeModelDevelopmentTests(unittest.TestCase):
    def test_preregistration_is_fixed_and_matches_model_families(self):
        prereg = json.loads((SCRIPT.parent / "preregistration.json").read_text())
        ids = {candidate["id"] for candidate in module.candidate_specs()}
        self.assertEqual(ids, {
            "static_logistic", "temporal_logistic_c_0_1", "temporal_logistic_c_1", "temporal_logistic_c_10",
            "cart_depth_2", "cart_depth_3", "cart_depth_4", "random_forest", "hist_gradient_boosting",
        })
        self.assertEqual(prereg["status"], "registered_before_fitting")
        self.assertEqual(prereg["uncertainty"]["method"].split(";", 1)[0],
                         "Paired percentile bootstrap of animal-level metric contributions, resampling the 24 animals as intact groups with replacement")

    def test_paired_bootstrap_resamples_animals_deterministically(self):
        def animal(value):
            return {"perClass": {"RE": {"f1": value}, "RU": {"f1": value}}}
        first = {f"animal-{i:02d}": animal(0.6) for i in range(24)}
        second = {f"animal-{i:02d}": animal(0.5) for i in range(24)}
        result_a = module.bootstrap_difference(first, second, replicates=1000)
        result_b = module.bootstrap_difference(first, second, replicates=1000)
        self.assertEqual(result_a, result_b)
        self.assertEqual(result_a["resampledUnit"], "animal (24 groups, intact; paired candidate values)")
        self.assertAlmostEqual(result_a["pairedDifference"], 0.1)
        self.assertTrue(all(abs(value - 0.1) < 1e-12 for value in result_a["percentile95"]))

    def test_bootstrap_rejects_unpaired_or_wrong_group_count(self):
        one = {"animal-1": {"perClass": {"RE": {"f1": .5}, "RU": {"f1": .5}}}}
        with self.assertRaises(ValueError):
            module.bootstrap_difference(one, one, replicates=10)

    def test_complexity_order_is_preregistered(self):
        order = [module.complexity(s) for s in module.candidate_specs()]
        self.assertLess(order[0], order[1])
        self.assertLess(order[1], order[2])
        self.assertLess(order[2], order[3])
        self.assertLess(order[1], order[4])
        self.assertLess(order[6], order[7])
        self.assertLess(order[7], order[8])

    def test_inner_training_row_order_does_not_depend_on_set_iteration(self):
        index = {"AH:2": [4, 5], "BH:1": [0, 1], "RC:3": [2, 3]}
        from_set = module.indices_for_animals(index, {"AH:2", "BH:1", "RC:3"})
        from_reversed = module.indices_for_animals(index, ["RC:3", "BH:1", "AH:2"])
        self.assertEqual(from_set.tolist(), [4, 5, 0, 1, 2, 3])
        self.assertEqual(from_set.tolist(), from_reversed.tolist())


if __name__ == "__main__":
    unittest.main()
