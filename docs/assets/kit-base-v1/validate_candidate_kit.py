"""Validate candidate-kit paths and basic PNG metadata without approving artwork."""
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).parent
PROJECT = ROOT.parents[2]
manifest = json.loads((ROOT / "manifest-candidate-v1.json").read_text())
assets = manifest["assets"]
ids = [asset["id"] for asset in assets]
errors = []
checked_paths = set()
atlas_sizes = {}
atlas_images = {}


def project_path(value):
    path = Path(value)
    return path if path.is_absolute() else PROJECT / path


def check_png(value, expected_size=None, binary_alpha=False):
    path = project_path(value)
    checked_paths.add(str(path))
    if not path.is_file():
        errors.append(f"missing file: {value}")
        return
    try:
        with Image.open(path) as image:
            if image.format != "PNG":
                errors.append(f"not PNG: {value}")
            if expected_size and image.size != tuple(expected_size):
                errors.append(f"size mismatch for {value}: {image.size} != {tuple(expected_size)}")
            if binary_alpha and image.mode in ("RGBA", "LA"):
                alpha = image.getchannel("A")
                if set(alpha.getdata()) - {0, 255}:
                    errors.append(f"non-binary alpha: {value}")
    except Exception as exc:
        errors.append(f"cannot read {value}: {exc}")


if len(ids) != len(set(ids)):
    errors.append("asset IDs are not unique")

for atlas_id, atlas in manifest.get("atlases", {}).items():
    check_png(atlas["image"], atlas.get("sourceSize"))
    path = project_path(atlas["image"])
    if path.is_file():
        try:
            with Image.open(path) as image:
                atlas_sizes[atlas_id] = image.size
                atlas_images[atlas_id] = path
        except Exception as exc:
            errors.append(f"cannot read atlas {atlas_id}: {exc}")


def check_frame(asset_id, frame, source_size=None, trim=None):
    atlas_id = frame.get("atlas")
    size = atlas_sizes.get(atlas_id)
    if size is None:
        errors.append(f"{asset_id}: unknown or unreadable atlas {atlas_id}")
        return
    x, y, w, h = (frame.get(key, -1) for key in ("x", "y", "w", "h"))
    if min(x, y, w, h) < 0 or w == 0 or h == 0 or x + w > size[0] or y + h > size[1]:
        errors.append(f"{asset_id}: atlas frame is out of bounds")
    if trim and source_size:
        tx, ty, tw, th = (trim.get(key, -1) for key in ("x", "y", "w", "h"))
        if min(tx, ty, tw, th) < 0 or tw == 0 or th == 0 or tx + tw > source_size[0] or ty + th > source_size[1]:
            errors.append(f"{asset_id}: trim is outside source canvas")
        if (tw, th) != (w, h):
            errors.append(f"{asset_id}: trim size does not match atlas frame")


def verify_frame_pixels(asset_id, frame, source_file, trim, padding=2):
    atlas_path = atlas_images.get(frame.get("atlas"))
    source_path = project_path(source_file)
    if atlas_path is None or not source_path.is_file():
        return
    try:
        with Image.open(source_path) as source_image, Image.open(atlas_path) as atlas_image:
            source = source_image.convert("RGBA").crop((trim["x"], trim["y"], trim["x"] + trim["w"], trim["y"] + trim["h"]))
            atlas_rgba = atlas_image.convert("RGBA")
            x, y, w, h = (frame[key] for key in ("x", "y", "w", "h"))
            packed = atlas_rgba.crop((x, y, x + w, y + h))
            for source_pixel, atlas_pixel in zip(source.getdata(), packed.getdata()):
                if source_pixel[3] and source_pixel != atlas_pixel:
                    errors.append(f"{asset_id}: atlas frame pixels differ from source")
                    break
            strips = (
                (x - padding, y - padding, x + w + padding, y),
                (x - padding, y + h, x + w + padding, y + h + padding),
                (x - padding, y, x, y + h),
                (x + w, y, x + w + padding, y + h),
            )
            for strip in strips:
                if atlas_rgba.crop(strip).getchannel("A").getbbox():
                    errors.append(f"{asset_id}: atlas frame padding is not transparent")
                    break
    except Exception as exc:
        errors.append(f"cannot verify atlas pixels for {asset_id}: {exc}")

for asset in assets:
    check_png(asset["file"], asset.get("sourceSize"))
    atlas_source = asset.get("atlasSourceFile")
    if atlas_source:
        check_png(atlas_source, asset.get("sourceSize"))
    source = asset.get("sourceFile")
    if source:
        check_png(source)
    clean = asset.get("alphaCleanCandidateFile")
    if clean:
        check_png(clean, binary_alpha=True)
    for variant in asset.get("randomVariants", []):
        check_png(variant, binary_alpha=True)
    for item in asset.get("variantDiagnostics", []):
        check_png(item["file"], binary_alpha=True)
        check_png(item["sourceFile"])
    frame = asset.get("atlasFrame")
    if frame:
        check_frame(asset["id"], frame, asset.get("sourceSize"), asset.get("trim"))
        if asset.get("atlasSourceFile") and asset.get("trim"):
            verify_frame_pixels(asset["id"], frame, asset["atlasSourceFile"], asset["trim"])
    variants = asset.get("randomVariantFrames", [])
    if len(variants) != len(asset.get("randomVariants", [])):
        errors.append(f"{asset['id']}: random variant frame count mismatch")
    for index, variant in enumerate(variants):
        check_png(variant["file"], variant.get("sourceSize"))
        check_frame(f"{asset['id']} variant {index + 1}", variant["atlasFrame"], variant.get("sourceSize"), variant.get("trim"))
        verify_frame_pixels(f"{asset['id']} variant {index + 1}", variant["atlasFrame"], variant["file"], variant["trim"])

for rel in [
    "docs/assets/kit-base-v1/tile-preview-grass-light-03-3x3.png",
    "docs/assets/kit-base-v1/tile-preview-soil-dry-02-3x3.png",
    "docs/assets/kit-base-v1/tile-preview-dirt-road-straight-02-3x3.png",
    "docs/assets/kit-base-v1/tile-preview-dirt-road-turn-02-3x3.png",
    "docs/assets/kit-base-v1/tile-preview-soybean-emerging-02-3x3.png",
    "docs/assets/kit-base-v1/tile-preview-soybean-mature-02-3x3.png",
    "docs/assets/kit-base-v1/tile-preview-maize-growing-02-3x3.png",
    "docs/assets/kit-base-v1/tile-preview-maize-mature-02-3x3.png",
]:
    check_png(rel, (1152, 576))

check_png("docs/assets/kit-base-v1/scene-test-v2-kit.png", (2000, 1060))
check_png("docs/assets/kit-base-v1/comparativo-cena-kit-v2-referencia.png", (2400, 1080))
check_png("docs/assets/kit-base-v1/review-atlases-candidate-v1.png", (1950, 1395))

print(f"manifest assets: {len(assets)}; PNG paths checked: {len(checked_paths)}; errors: {len(errors)}")
for error in errors:
    print(f"ERROR: {error}")
raise SystemExit(bool(errors))
