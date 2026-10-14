#!/usr/bin/env python3
"""Extract reviewable spatial geometry candidates from rendered source sprites.

The compiler measures alpha geometry and ground-contact evidence. It deliberately
marks inferred collision/footprint data as review-required: pixels alone cannot
prove physical dimensions for a perspective illustration.
"""

import json
import hashlib
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "graphics-poc/asset-registry.json"
MANIFEST = ROOT / "graphics-poc/assets/main-composer-render-manifest.json"
OUTPUT = ROOT / "graphics-poc/asset-geometry-v1.json"
ANNOTATIONS = ROOT / "graphics-poc/asset-spatial-annotations-v1.json"
CELL_W, CELL_H = 96.0, 48.0


def convex_hull(points):
    points = sorted(set((round(x, 5), round(y, 5)) for x, y in points))
    if len(points) <= 2:
        return points

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for point in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def rounded(value, digits=3):
    result = round(value, digits)
    return 0 if result == 0 else result


def inspect_image(path, frame=None, support_fraction=0.4, contact_fraction=0.18):
    image = Image.open(path).convert("RGBA")
    if frame:
        image = image.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"]))
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 12 else 0).getbbox()
    if not bbox:
        raise ValueError("sprite has no pixels with alpha >= 12")
    left, top, right, bottom = bbox
    width, height = image.size
    def sample_lower_band(fraction):
        band_top = max(top, bottom - max(2, math.ceil((bottom - top) * fraction)))
        points = []
        for y in range(band_top, bottom):
            row = alpha.crop((left, y, right, y + 1)).point(lambda value: 255 if value >= 24 else 0)
            span = row.getbbox()
            if span:
                points.extend([(left + span[0], y), (left + span[2] - 1, y)])
        return points

    return (image, {"x": left, "y": top, "width": right - left, "height": bottom - top},
            sample_lower_band(contact_fraction), sample_lower_band(support_fraction))


def compact_hull(hull, limit=12):
    if len(hull) <= limit:
        return hull
    return [hull[round(index * (len(hull) - 1) / (limit - 1))] for index in range(limit)]


def validate_annotation_polygon(polygon, asset_id):
    if not isinstance(polygon, list) or len(polygon) < 3:
        raise ValueError(f"Invalid spatial annotation for {asset_id}: expected >= 3 collision polygon points")
    points = []
    for point in polygon:
        if not isinstance(point, dict) or not all(isinstance(point.get(axis), (int, float)) and math.isfinite(point[axis]) for axis in ("x", "y")):
            raise ValueError(f"Invalid spatial annotation polygon coordinates for {asset_id}")
        points.append((float(point["x"]), float(point["y"])))
    if any(math.dist(points[index], points[(index + 1) % len(points)]) <= 1e-7 for index in range(len(points))):
        raise ValueError(f"Spatial collision polygon for {asset_id} contains duplicate adjacent vertices")
    twice_area = abs(sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1] for i in range(len(points))))
    if twice_area <= 1e-8:
        raise ValueError(f"Spatial collision polygon for {asset_id} has zero area")
    turns = []
    for index in range(len(points)):
        a, b, c = points[index - 1], points[index], points[(index + 1) % len(points)]
        turns.append((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))
    nonzero_turns = [value for value in turns if abs(value) > 1e-8]
    if not nonzero_turns or min(nonzero_turns) < 0 < max(nonzero_turns):
        raise ValueError(f"Spatial collision polygon for {asset_id} must be convex and ordered")
    return points


def validate_annotation_provenance(annotation, asset, image_path, image, asset_id):
    provenance = annotation.get("provenance")
    if not isinstance(provenance, dict) or provenance.get("geometryBasis") != "visual-sprite-estimate":
        raise ValueError(f"Spatial annotation for {asset_id} must identify visual-sprite-estimate provenance")
    expected_source = asset.get("source", {}).get("file")
    if provenance.get("sourceFile") != expected_source:
        raise ValueError(f"Spatial annotation for {asset_id} was made from a different source file")
    digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
    if provenance.get("sourceSha256") != digest:
        raise ValueError(f"Spatial annotation for {asset_id} is stale: source SHA-256 does not match")
    if provenance.get("sourceImagePx") != {"width": image.width, "height": image.height}:
        raise ValueError(f"Spatial annotation for {asset_id} source dimensions do not match")
    display = asset.get("displaySizePx") or {"width": image.width, "height": image.height}
    if provenance.get("displaySizePx") != display:
        raise ValueError(f"Spatial annotation for {asset_id} render scale does not match the registry")
    pivot = asset.get("pivot") or {"x": 0.5, "y": 1.0}
    if provenance.get("pivot") != {"x": pivot["x"], "y": pivot["y"]}:
        raise ValueError(f"Spatial annotation for {asset_id} ground pivot does not match the registry")
    projection = provenance.get("projection")
    if projection != {"type": "isometric-2to1", "cellWidth": CELL_W, "cellHeight": CELL_H}:
        raise ValueError(f"Spatial annotation for {asset_id} projection does not match the compiler")
    timestamp = provenance.get("annotatedAt")
    if not isinstance(timestamp, str) or not timestamp.endswith("Z"):
        raise ValueError(f"Spatial annotation for {asset_id} is missing an ISO UTC annotation timestamp")


def compile_asset(asset, source_manifest, annotation=None):
    source_path = asset.get("source", {}).get("file")
    frame = asset.get("atlas", {}).get("frame")
    if source_path and (ROOT / source_path).is_file():
        image_path, crop = ROOT / source_path, None
        measurement_source = "source-sprite"
    elif asset.get("atlas", {}).get("key") in source_manifest.get("atlases", {}):
        image_path = ROOT / source_manifest["atlases"][asset["atlas"]["key"]].lstrip("/")
        crop = frame
        measurement_source = "atlas-frame"
    else:
        return {"assetId": asset["assetId"], "geometryStatus": "missing-source", "reviewRequired": True}

    category = asset.get("category", "unknown")
    support_fraction = {"building": 0.4, "corral": 0.5, "vehicle": 0.4, "technology": 0.4,
                        "fence": 0.3, "water": 0.3, "feed": 0.3, "vegetation": 0.18}.get(category, 0.3)
    image, visual_bbox, contact_pixels, support_pixels = inspect_image(image_path, crop, support_fraction)
    display = asset.get("displaySizePx") or {"width": visual_bbox["width"], "height": visual_bbox["height"]}
    pivot = asset.get("pivot") or {"x": 0.5, "y": 1.0}
    # The renderer applies one uniform Pixi scale (min fit), so use that same
    # transform when mapping sprite pixels into world-cell coordinates.
    sprite_scale = min(display["width"] / image.width, display["height"] / image.height)
    sx = sy = sprite_scale
    anchor_px = (pivot["x"] * image.width, pivot["y"] * image.height)
    def project_support(pixels):
        world = []
        for px, py in pixels:
            dx = (px - anchor_px[0]) * sx
            dy = (py - anchor_px[1]) * sy
            # Inverse 2:1 iso projection: screen x=(col-row)*W/2; y=(col+row)*H/2.
            world.append(((dx / (CELL_W / 2) + dy / (CELL_H / 2)) / 2,
                          (dy / (CELL_H / 2) - dx / (CELL_W / 2)) / 2))
        hull = convex_hull(world)
        if len(hull) < 3:
            hull = [(-0.25, -0.25), (0.25, -0.25), (0.25, 0.25), (-0.25, 0.25)]
        return compact_hull(hull)

    contact_hull = project_support(contact_pixels)
    support_hull = project_support(support_pixels)
    # The broad lower silhouette can include walls, steps, shadows and plants.
    # Keep it as review evidence; only the narrow support trace is currently fed
    # to collision checks, and it remains explicitly provisional.
    hull = contact_hull
    footprint_is_annotation = False
    spatial_review = "required"
    if annotation is not None:
        polygon = annotation.get("collisionPolygon")
        units = annotation.get("units")
        status = annotation.get("reviewStatus")
        if units != "world-cell" or not isinstance(polygon, list) or len(polygon) < 3:
            raise ValueError(f"Invalid spatial annotation for {asset['assetId']}: expected a world-cell collisionPolygon with >= 3 points")
        polygon = validate_annotation_polygon(polygon, asset["assetId"])
        if status not in {"draft", "reviewed"}:
            raise ValueError(f"Invalid spatial annotation reviewStatus for {asset['assetId']}: use draft or reviewed")
        if status == "reviewed" and (not isinstance(annotation.get("reviewer"), str) or not annotation["reviewer"].strip()):
            raise ValueError(f"Reviewed spatial annotation for {asset['assetId']} requires reviewer")
        validate_annotation_provenance(annotation, asset, image_path, image, asset["assetId"])
        orientations = annotation.get("supportedOrientations", [0])
        declared_orientations = asset.get("supportedOrientations", [0])
        if not isinstance(orientations, list) or not orientations or any(value not in {0, 90, 180, 270} for value in orientations):
            raise ValueError(f"Spatial annotation for {asset['assetId']} has invalid supported orientations")
        if len(set(orientations)) != len(orientations) or not set(orientations).issubset(set(declared_orientations)):
            raise ValueError(f"Spatial annotation for {asset['assetId']} cannot add unverified orientations")
        clearance = annotation.get("clearanceCells", 0.25 if category in {"building", "corral", "vehicle", "technology", "vegetation", "fence"} else 0)
        if not isinstance(clearance, (int, float)) or not math.isfinite(clearance) or clearance < 0:
            raise ValueError(f"Spatial annotation for {asset['assetId']} has invalid clearanceCells")
        sockets = annotation.get("connectionSockets", [])
        if not isinstance(sockets, list):
            raise ValueError(f"Spatial annotation for {asset['assetId']} connectionSockets must be an array")
        hull = polygon
        # Human review can validate a visual trace, but does not establish the
        # sprite's represented real-world scale or a physically measured footprint.
        footprint_is_annotation = False
        spatial_review = "visual-draft" if status == "draft" else "visual-review-complete"
    min_x, max_x = min(x for x, _ in hull), max(x for x, _ in hull)
    min_y, max_y = min(y for _, y in hull), max(y for _, y in hull)
    support_min_x, support_max_x = min(x for x, _ in support_hull), max(x for x, _ in support_hull)
    support_min_y, support_max_y = min(y for _, y in support_hull), max(y for _, y in support_hull)
    should_block = category in {"building", "corral", "vehicle", "technology"}
    compiled = {
        "assetId": asset["assetId"],
        "geometryStatus": "inferred-review-required",
        "reviewRequired": True,
        "spatialReviewStatus": spatial_review,
        "measurementSource": measurement_source,
        "units": "world-cell",
        "sourceImagePx": {"width": image.width, "height": image.height},
        "visualBoundingBoxPx": visual_bbox,
        "groundContactAnchor": {"x": pivot["x"], "y": pivot["y"], "units": "normalized-sprite"},
        "groundFootprintCandidate": {"columns": round(max(0.25, max_x - min_x), 3), "rows": round(max(0.25, max_y - min_y), 3)},
        "collisionPolygonCandidate": [{"x": rounded(x), "y": rounded(y)} for x, y in hull],
        "supportRegionPolygonCandidate": [{"x": rounded(x), "y": rounded(y)} for x, y in support_hull],
        "supportRegionFootprintCandidate": {"columns": round(max(0.25, support_max_x - support_min_x), 3),
                                            "rows": round(max(0.25, support_max_y - support_min_y), 3)},
        "visualHeightCells": round(max(0.25, visual_bbox["height"] * sy / CELL_H), 3),
        "occlusion": {"base": "ground-contact-anchor", "heightCells": round(max(0.25, visual_bbox["height"] * sy / CELL_H), 3)},
        "semanticCategory": category,
        "supportedOrientations": [0],
        "connectionSockets": [],
        "clearanceCells": 0.25 if category in {"building", "corral", "vehicle", "technology", "vegetation", "fence"} else 0,
        "compatibleNeighbors": [],
        "collisionPolicy": "blocking" if should_block else "non-blocking",
        "evidence": {"alphaThreshold": 12, "groundContactAlphaThreshold": 24, "collisionTraceBandFraction": 0.18,
                     "supportRegionBandFraction": support_fraction, "contactPointCount": len(contact_pixels),
                     "supportPointCount": len(support_pixels), "supportRegionIsPhysicalFootprintProof": False,
                     "collisionCandidateIsPhysicalFootprintProof": footprint_is_annotation,
                     "spritePixelsOnlyCannotConfirmPhysicalScale": True},
    }
    if annotation is not None:
        compiled.update({"geometryStatus": "annotated-review-required",
                         "reviewRequired": True,
                         "spatialReviewStatus": spatial_review,
                         "annotation": {"reviewStatus": annotation["reviewStatus"], "reviewer": annotation.get("reviewer"),
                                        "sourceFile": source_path, "note": annotation.get("note", ""),
                                        "provenance": annotation["provenance"], "physicalFootprintStatus": "unverified"},
                         "supportedOrientations": orientations,
                         "connectionSockets": sockets,
                         "clearanceCells": float(clearance)})
    if category == "terrain":
        # Terrain is placed by tilemap contract, not by the alpha silhouette.
        compiled.update({"geometryStatus": "annotated", "reviewRequired": False, "spatialReviewStatus": "complete",
                         "groundFootprintCandidate": {"columns": 1, "rows": 1},
                         "collisionPolygonCandidate": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}, {"x": 0, "y": 1}],
                         "supportRegionFootprintCandidate": {"columns": 1, "rows": 1},
                         "supportRegionPolygonCandidate": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}, {"x": 0, "y": 1}],
                         "visualHeightCells": 0, "occlusion": {"base": "tile-origin", "heightCells": 0},
                         "clearanceCells": 0, "evidence": {"contract": "one tilemap cell per terrain tile", "alphaBoundsMeasured": True}})
    return compiled


def main():
    registry = json.loads(REGISTRY.read_text())
    manifest = json.loads(MANIFEST.read_text())
    manifest["atlases"] = {key: value for key, value in manifest.get("atlases", {}).items()}
    annotations = json.loads(ANNOTATIONS.read_text()) if ANNOTATIONS.is_file() else {"schemaVersion": "1.0.0", "assets": {}}
    if annotations.get("schemaVersion") != "1.0.0" or not isinstance(annotations.get("assets"), dict):
        raise ValueError(f"Invalid annotation file: {ANNOTATIONS}")
    unknown_assets = set(annotations["assets"]) - {asset["assetId"] for asset in registry["assets"]}
    if unknown_assets:
        raise ValueError(f"Spatial annotations refer to unknown assets: {', '.join(sorted(unknown_assets))}")
    result = {asset["assetId"]: compile_asset(asset, manifest, annotations["assets"].get(asset["assetId"])) for asset in registry["assets"]}
    OUTPUT.write_text(json.dumps({"schemaVersion": "1.0.0", "projection": {"type": "isometric-2to1", "cellWidth": CELL_W, "cellHeight": CELL_H},
                                  "compiler": "compile_asset_geometry.py", "assets": result}, indent=2) + "\n")
    reviewed = sum(1 for item in result.values() if item.get("geometryStatus") == "inferred-review-required")
    missing = [key for key, item in result.items() if item.get("geometryStatus") == "missing-source"]
    print(f"Compiled {len(result)} assets: {reviewed} measurable/review-required, {len(missing)} missing source: {', '.join(missing) if missing else 'none'}")


if __name__ == "__main__":
    main()
