import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('laya_worker', ROOT / 'scripts/ai/laya_intent_worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class LayaProtocolTests(unittest.TestCase):
    def test_request_is_bounded_and_has_no_tool_or_execution_channel(self):
        self.assertEqual(worker.validate_request({'prompt': 'Compare cattle scenarios'}), 'Compare cattle scenarios')
        for value in [{'prompt': ''}, {'prompt': 'x' * 1201}, {'prompt': 'test', 'execute': True}, [], None]:
            with self.assertRaises(ValueError):
                worker.validate_request(value)

    def test_metrics_count_failures_and_per_class_confusions(self):
        rows = [{'expected': 'a', 'label': 'a'}, {'expected': 'a', 'label': 'b'}, {'expected': 'b', 'error': 'timeout'}]
        metrics = worker.summarize(rows, ['a', 'b'])
        self.assertEqual(metrics['accuracy'], 1/3)
        self.assertEqual(metrics['perClass']['a']['recall'], 0.5)
        self.assertEqual(metrics['confusion']['b']['error'], 1)
        self.assertEqual(metrics['perClass']['b']['f1'], 0)

    def test_frozen_final_labels_languages_and_revision(self):
        data = (ROOT / 'tests/fixtures/intent-routing-v1.json').read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(), 'b7f73a27c600eebf823ccb3ba5510bf4d1ee00720c371fb354bed976cc314ab8')
        fixture = json.loads(data)
        self.assertEqual(set(fixture['labels']), set(worker.CRITERIA))
        for split in ['development', 'final']:
            for label in fixture['labels']:
                self.assertEqual({r['language'] for r in fixture['cases'] if r['split'] == split and r['expected'] == label}, {'pt', 'en'})
        self.assertEqual(len(worker.REVISION), 40)
        self.assertEqual(len(worker.ARTIFACT_SHA256), 5)

if __name__ == '__main__':
    unittest.main()
