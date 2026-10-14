import importlib.util
import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("geometry_compiler", ROOT / "scripts/assets/compile_asset_geometry.py")
COMPILER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COMPILER)
REGISTRY = json.loads((ROOT / "graphics-poc/asset-registry.json").read_text())
MANIFEST = json.loads((ROOT / "graphics-poc/assets/main-composer-render-manifest.json").read_text())
ASSET = next(item for item in REGISTRY["assets"] if item["assetId"] == "building-farmhouse-imagegen-v1")


class AssetGeometryAnnotationTests(unittest.TestCase):
    def provenance(self):
        source = ROOT / ASSET["source"]["file"]
        from PIL import Image
        with Image.open(source) as image:
            source_dimensions = {"width": image.width, "height": image.height}
        return {"geometryBasis": "visual-sprite-estimate", "sourceFile": ASSET["source"]["file"],
                "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "sourceImagePx": source_dimensions, "displaySizePx": ASSET["displaySizePx"],
                "pivot": {"x": ASSET["pivot"]["x"], "y": ASSET["pivot"]["y"]},
                "projection": {"type": "isometric-2to1", "cellWidth": 96.0, "cellHeight": 48.0},
                "annotatedAt": "2026-10-14T12:00:00.000Z"}

    def test_contact_trace_and_support_region_remain_distinct_review_evidence(self):
        geometry = COMPILER.compile_asset(ASSET, MANIFEST)
        self.assertEqual(geometry["geometryStatus"], "inferred-review-required")
        self.assertGreater(geometry["supportRegionFootprintCandidate"]["columns"], geometry["groundFootprintCandidate"]["columns"])
        self.assertFalse(geometry["evidence"]["supportRegionIsPhysicalFootprintProof"])
        self.assertFalse(geometry["evidence"]["collisionCandidateIsPhysicalFootprintProof"])

    def test_draft_annotation_supplies_candidate_without_clearing_review(self):
        annotation = {"units": "world-cell", "reviewStatus": "draft", "collisionPolygon": [
            {"x": -2, "y": -1}, {"x": 0, "y": -1}, {"x": 0, "y": 0}, {"x": -2, "y": 0},
        ], "provenance": self.provenance()}
        geometry = COMPILER.compile_asset(ASSET, MANIFEST, annotation)
        self.assertEqual(geometry["geometryStatus"], "annotated-review-required")
        self.assertTrue(geometry["reviewRequired"])
        self.assertEqual(geometry["groundFootprintCandidate"], {"columns": 2, "rows": 1})
        self.assertFalse(geometry["evidence"]["collisionCandidateIsPhysicalFootprintProof"])

    def test_visual_review_does_not_claim_physical_footprint_evidence(self):
        annotation = {"units": "world-cell", "reviewStatus": "reviewed", "reviewer": "QA artist", "collisionPolygon": [
            {"x": -2, "y": -1}, {"x": 0, "y": -1}, {"x": 0, "y": 0}, {"x": -2, "y": 0},
        ], "provenance": self.provenance()}
        geometry = COMPILER.compile_asset(ASSET, MANIFEST, annotation)
        self.assertEqual(geometry["geometryStatus"], "annotated-review-required")
        self.assertTrue(geometry["reviewRequired"])
        self.assertFalse(geometry["evidence"]["collisionCandidateIsPhysicalFootprintProof"])
        self.assertEqual(geometry["annotation"]["physicalFootprintStatus"], "unverified")
        with self.assertRaisesRegex(ValueError, "requires reviewer"):
            COMPILER.compile_asset(ASSET, MANIFEST, {**annotation, "reviewer": ""})
        with self.assertRaisesRegex(ValueError, "must be convex"):
            COMPILER.compile_asset(ASSET, MANIFEST, {**annotation, "collisionPolygon": [
                {"x": 0, "y": 0}, {"x": 2, "y": 0}, {"x": 1, "y": 0.5}, {"x": 2, "y": 2}, {"x": 0, "y": 2},
            ]})

    def test_annotation_provenance_detects_source_or_scale_drift(self):
        annotation = {"units": "world-cell", "reviewStatus": "draft", "collisionPolygon": [
            {"x": -2, "y": -1}, {"x": 0, "y": -1}, {"x": 0, "y": 0}, {"x": -2, "y": 0},
        ], "provenance": self.provenance()}
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            COMPILER.compile_asset(ASSET, MANIFEST, {**annotation, "provenance": {**annotation["provenance"], "sourceSha256": "0" * 64}})
        with self.assertRaisesRegex(ValueError, "render scale"):
            COMPILER.compile_asset(ASSET, MANIFEST, {**annotation, "provenance": {**annotation["provenance"], "displaySizePx": {"width": 10, "height": 10}}})
        with self.assertRaisesRegex(ValueError, "cannot add unverified orientations"):
            COMPILER.compile_asset(ASSET, MANIFEST, {**annotation, "supportedOrientations": [0, 90]})
        with self.assertRaisesRegex(ValueError, "invalid clearanceCells"):
            COMPILER.compile_asset(ASSET, MANIFEST, {**annotation, "clearanceCells": -1})

    def test_degenerate_polygon_is_rejected(self):
        annotation = {"units": "world-cell", "reviewStatus": "draft", "collisionPolygon": [
            {"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 2, "y": 0},
        ], "provenance": self.provenance()}
        with self.assertRaisesRegex(ValueError, "zero area"):
            COMPILER.compile_asset(ASSET, MANIFEST, annotation)


if __name__ == "__main__":
    unittest.main()
