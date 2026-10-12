"""Pack review-only category atlases from curated PNG candidates without resampling."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
PROJECT = ROOT.parents[2]
MANIFEST_PATH = ROOT / "manifest-candidate-v1.json"
OUT = ROOT / "atlas-candidate-v1"
MAX_WIDTH = 4096
PADDING = 2

manifest = json.loads(MANIFEST_PATH.read_text())
assets = manifest["assets"]
for asset in assets:
    asset.pop("atlasFrame", None)
    asset.pop("trim", None)
    asset.pop("atlasSourceFile", None)
    asset.pop("randomVariantFrames", None)

def read_trimmed(path: str):
    image = Image.open(PROJECT / path).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"Candidate is fully transparent: {path}")
    return image.crop(bbox), image.size, bbox

def next_power_of_two(n: int) -> int:
    return 1 << max(0, (n - 1).bit_length())

def pack_shelves(entries):
    """Choose the power-of-two shelf width with the smallest final atlas area."""
    widest = max(entry["padded_size"][0] for entry in entries)
    candidates = [width for width in (512, 1024, 2048, MAX_WIDTH) if widest <= width]
    best = None
    for max_width in candidates:
        x = y = shelf_h = used_w = 0
        positions = []
        for entry in entries:
            pw, ph = entry["padded_size"]
            if x + pw > max_width:
                y += shelf_h
                x, shelf_h = 0, 0
            positions.append((x, y))
            x += pw
            shelf_h = max(shelf_h, ph)
            used_w = max(used_w, x)
        used_h = y + shelf_h
        atlas_size = (max(256, next_power_of_two(used_w)), max(64, next_power_of_two(used_h)))
        score = (atlas_size[0] * atlas_size[1], 0 if atlas_size[0] >= atlas_size[1] else 1, abs(atlas_size[0] - atlas_size[1]), atlas_size[0])
        if best is None or score < best[0]:
            best = (score, atlas_size, positions)
    if best is None or best[1][0] > MAX_WIDTH:
        raise ValueError("Unable to pack sprites within 4096px atlas width")
    for entry, position in zip(entries, best[2]):
        entry["packed"] = position
    return best[1]

OUT.mkdir(parents=True, exist_ok=True)
by_category: dict[str, list[dict]] = {}
for asset in assets:
    category = asset["category"]
    entries = [{"kind": "asset", "asset": asset, "key": asset["id"], "path": asset.get("alphaCleanCandidateFile") or asset["file"]}]
    for index, path in enumerate(asset.get("randomVariants", [])):
        entries.append({"kind": "variant", "asset": asset, "index": index, "key": f"{asset['id']}__variant_{index + 1:02d}", "path": path})
    for entry in entries:
        entry["image"], entry["source_size"], entry["trim"] = read_trimmed(entry["path"])
        entry["padded_size"] = (entry["image"].width + 2 * PADDING, entry["image"].height + 2 * PADDING)
        if entry["padded_size"][0] > MAX_WIDTH:
            raise ValueError(f"Sprite exceeds atlas width: {entry['key']} {entry['padded_size']}")
        by_category.setdefault(category, []).append(entry)

atlas_defs = {}
for category, entries in by_category.items():
    # Shelf packing, largest sprites first. Each source stays at its original pixels.
    entries.sort(key=lambda entry: (entry["padded_size"][1], entry["padded_size"][0]), reverse=True)
    atlas_size = pack_shelves(entries)
    atlas = Image.new("RGBA", atlas_size, (0, 0, 0, 0))
    atlas_id = f"{category}-candidate-v1"
    for entry in entries:
        x, y = entry["packed"]
        x += PADDING
        y += PADDING
        atlas.alpha_composite(entry["image"], (x, y))
        l, t, r, b = entry["trim"]
        frame = {"atlas": atlas_id, "x": x, "y": y, "w": r - l, "h": b - t}
        if entry["kind"] == "asset":
            entry["asset"]["atlasFrame"] = frame
            entry["asset"]["trim"] = {"x": l, "y": t, "w": r - l, "h": b - t}
            entry["asset"]["atlasSourceFile"] = entry["path"]
        else:
            variants = entry["asset"].setdefault("randomVariantFrames", [None] * len(entry["asset"].get("randomVariants", [])))
            variants[entry["index"]] = {"file": entry["path"], "sourceSize": list(entry["source_size"]), "trim": {"x": l, "y": t, "w": r - l, "h": b - t}, "atlasFrame": frame}
    out_path = OUT / f"{category}-v1.png"
    atlas.save(out_path, optimize=True)
    atlas_defs[atlas_id] = {
        "image": str(out_path.relative_to(PROJECT)),
        "sourceSize": list(atlas_size),
        "filter": "nearest",
        "paddingPx": PADDING,
        "sourcePolicy": "alphaCleanCandidateFile when present, otherwise file; no resampling or palette change",
        "reviewStatus": "candidate atlas; visual style and frame/anchor review pending"
    }

manifest["atlases"] = atlas_defs
manifest["atlasPolicy"] = {
    "status": "review-only; not connected to runtime",
    "trim": "alpha bounds stored per frame; retain source canvas and anchor metadata",
    "paddingPx": PADDING,
    "resampling": "none"
}
MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
print(f"candidate atlases: {len(atlas_defs)}; frames: {sum(len(items) for items in by_category.values())}; padding: {PADDING}px")
for atlas_id, spec in atlas_defs.items():
    print(f"{atlas_id}: {spec['sourceSize'][0]}x{spec['sourceSize'][1]} -> {spec['image']}")
