#!/usr/bin/env python3
"""Pack checked-in synthetic runtime sprites and synchronize release manifests."""
import copy
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CELL = (192, 128)
COLS = 8
RUNTIME = ROOT / "public/assets/manifest.json"
RELEASE = ROOT / "assets/manifests/actiii-release-v1.json"
PUBLIC_RELEASE = ROOT / "public/assets/manifests/actiii-release-v1.json"
RENDERER = ROOT / "graphics-poc/assets/main-composer-render-manifest.json"
ASSET_SOURCES = ROOT / "graphics-poc/asset-sources.json"
ATLAS = ROOT / "public/assets/atlas/synthetic-release-atlas-v1.png"

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    runtime = json.loads(RUNTIME.read_text())
    release = json.loads(RELEASE.read_text())
    renderer = json.loads(RENDERER.read_text())
    records = {asset["name"]: asset for asset in release["assets"]}
    assets = runtime["assets"]
    rows = (len(assets) + COLS - 1) // COLS
    atlas = Image.new("RGBA", (COLS * CELL[0], rows * CELL[1]), (0, 0, 0, 0))
    frames = {}
    for index, asset in enumerate(assets):
        name = asset["id"]
        record = records[name]
        sprite_path = ROOT / record["source"]["sourceFile"]
        sprite = Image.open(sprite_path).convert("RGBA")
        if sprite.size != CELL: raise ValueError(f"{sprite_path} has unexpected dimensions {sprite.size}")
        x, y = (index % COLS) * CELL[0], (index // COLS) * CELL[1]
        atlas.alpha_composite(sprite, (x, y))
        frame = {"atlas": "synthetic-release", "x": x, "y": y, "w": CELL[0], "h": CELL[1]}
        frames[name] = frame
        record["source"]["sha256"] = sha(sprite_path)
        record["frame"] = frame
    ATLAS.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS, optimize=True)
    atlas_sha = sha(ATLAS)
    atlas_record = {"image": "/assets/atlas/synthetic-release-atlas-v1.png", "cellLayout": "free-rects", "sourceSize": list(atlas.size)}
    runtime["atlases"] = {"synthetic-release": atlas_record}
    runtime["atlasSha256"] = {"synthetic-release": atlas_sha}
    asset_sources = {"sourceRevision": {"commit": "actiii-release-synthetic-v1"}, "assetSources": []}
    for asset in assets:
        record = records[asset["id"]]
        asset.update({"file": atlas_record["image"], "frame": frames[asset["id"]], "reviewStatus": "RELEASED", "status": "RELEASED", "semanticId": record["id"]})
        asset["provenance"] = {"sourceSemanticId": record["id"], "sourceFile": record["source"]["sourceFile"],
            "sourceManifest": "/assets/manifests/actiii-release-v1.json", "sourceSha256": record["source"]["sha256"],
            "sourceStatus": "RELEASED", "rights": copy.deepcopy(record["rights"]), "review": copy.deepcopy(record["review"])}
        asset_sources["assetSources"].append({"assetId": asset["id"], "file": asset["file"],
            "sourceFile": record["source"]["sourceFile"], "status": "RELEASED", "sha256": record["source"]["sha256"],
            "sourceApproval": record["rights"]["notes"], "sourceManifest": "/assets/manifests/actiii-release-v1.json",
            "sourceRevision": {"commit": "actiii-release-synthetic-v1"}})
    release["atlases"] = {"synthetic-release": {"image": "public/assets/atlas/synthetic-release-atlas-v1.png", "sourceSize": list(atlas.size), "sha256": atlas_sha}}
    renderer["atlases"] = {"synthetic-release": "/assets/atlas/synthetic-release-atlas-v1.png"}
    renderer["atlasSha256"] = {"synthetic-release": atlas_sha}
    renderer["unresolvedAssetIds"] = []
    for asset in renderer["assets"]:
        record = records[asset["assetId"]]
        asset.update({"sourceSemanticId": record["id"], "sourceFile": record["source"]["sourceFile"],
            "manifestSource": "/assets/manifests/actiii-release-v1.json", "reviewStatus": "RELEASED", "sourceStatus": "RELEASED",
            "atlasKey": "synthetic-release", "frame": frames[asset["assetId"]], "rights": copy.deepcopy(record["rights"]),
            "sourceReview": copy.deepcopy(record["review"])})
    release["assets"] = [dict(record, sourceManifest="assets/manifests/actiii-release-v1.json") for record in release["assets"]]
    paths = [(RUNTIME, runtime), (RELEASE, release), (PUBLIC_RELEASE, release), (RENDERER, renderer), (ASSET_SOURCES, asset_sources)]
    for path, value in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    print(f"Packed {len(assets)} runtime and {len(renderer['assets'])} Composer sprites into {atlas.size}; sha256 {atlas_sha}")

if __name__ == "__main__": main()
