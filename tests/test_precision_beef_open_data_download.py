import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/science/data_pipelines/download_precision_beef_open_data.py"
SPEC = importlib.util.spec_from_file_location("precision_beef_download", SCRIPT)
DOWNLOAD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DOWNLOAD)


def fake_record():
    files = []
    for key in sorted(DOWNLOAD.EXPECTED_FILES):
        files.append({
            "key": key,
            "size": 10,
            "checksum": "md5:" + "a" * 32,
            "links": {"self": f"https://example.invalid/{key}"},
        })
    return {
        "metadata": {
            "access_right": "open",
            "license": {"id": "cc-by-4.0"},
            "doi": "10.5281/zenodo.4064802",
            "title": "Precision Beef open dataset",
            "version": "1",
            "publication_date": "2022-03-10",
        },
        "files": files,
        "links": {"html": "https://zenodo.org/records/4064802"},
    }


class PrecisionBeefDownloadTests(unittest.TestCase):
    def test_accepts_only_open_cc_by_source_and_exact_file_inventory(self):
        record = fake_record()
        self.assertIs(DOWNLOAD.validate_record(record), record)
        parsed = [DOWNLOAD.parse_file_entry(item) for item in record["files"]]
        self.assertEqual({item["key"] for item in parsed}, DOWNLOAD.EXPECTED_FILES)
        record["metadata"]["license"]["id"] = "cc-by-nc-4.0"
        with self.assertRaisesRegex(ValueError, "not verified open CC BY 4.0"):
            DOWNLOAD.validate_record(record)

    def test_rejects_incomplete_inventory_and_missing_publisher_checksum(self):
        record = fake_record()
        record["files"].pop()
        with self.assertRaisesRegex(ValueError, "Unexpected Zenodo file inventory"):
            DOWNLOAD.validate_record(record)
        entry = {"key": "accel-01.csv", "size": 1, "checksum": "", "links": {"self": "https://example.invalid"}}
        with self.assertRaisesRegex(ValueError, "lacks publisher MD5"):
            DOWNLOAD.parse_file_entry(entry)

    def test_manifest_carries_source_groups_and_reference_label_limitations(self):
        record = fake_record()
        verified = [
            {**DOWNLOAD.parse_file_entry(item), "sha256": "b" * 64, "status": "verified_existing"}
            for item in record["files"]
        ]
        manifest = DOWNLOAD.create_manifest(record, verified, "c" * 64, "2026-10-13")
        self.assertEqual(manifest["source"]["license"], "CC BY 4.0")
        self.assertEqual(manifest["source"]["officialUrl"], "https://zenodo.org/records/4064802")
        self.assertEqual(manifest["source"]["totalArchiveSizeBytes"], 370)
        self.assertTrue(manifest["population"]["animalsObserved"])
        self.assertFalse(manifest["use"]["dmiTargetEligible"])
        self.assertIn("not independent human-video annotations", manifest["measurement"]["method"])
        self.assertIn("source-defined test set contains three animals", " ".join(manifest["use"]["limitations"]))
        self.assertEqual(manifest["provenance"]["apiMetadataSha256"], "c" * 64)
        self.assertEqual(manifest["processedOutputs"], [])
        self.assertEqual(len(manifest["files"]), 37)


if __name__ == "__main__":
    unittest.main()
