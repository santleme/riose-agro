#!/usr/bin/env python3
"""Build a side-by-side calibration board for sprites drawn by the `/` scene.

This intentionally treats alpha bounds as image transparency data only. They
are not interpreted as a physical ground footprint. Candidate world dimensions
are explicit authoring assumptions and remain unapproved until artist review.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "public/assets/manifest.json"
APP_PATH = ROOT / "src/client/app.js"
OUT = ROOT / "assets/previews/v7"
PNG_PATH = OUT / "asset-scale-calibration.png"
JSON_PATH = OUT / "asset-scale-calibration.json"
MD_PATH = OUT / "asset-scale-calibration.md"

# Candidate model: one metre projects to a 12 x 6 px isometric cell. Dimensions
# are engineering hypotheses for a common ranch world, not measurements proven
# by sprite pixels. Width/length are ground-plane metres; height is apparent m.
PX_PER_M_X = 12
PX_PER_M_Y = 6
PROFILE = {
    "grass-light": {"groundFootprintM": [4, 4], "heightM": 0, "kind": "terrain tile", "basis": "candidate 4 m square terrain module"},
    "fence-straight": {"groundFootprintM": [3, 0.15], "heightM": 1.2, "kind": "fence segment", "basis": "candidate 3 m fence bay; visual height 1.2 m"},
    "gate": {"groundFootprintM": [3, 0.2], "heightM": 1.6, "kind": "gate segment", "basis": "candidate 3 m opening; visual height 1.6 m"},
    "pond": {"groundFootprintM": [8, 5], "heightM": 0.1, "kind": "water body", "basis": "candidate 8 x 5 m water footprint"},
    "farmhouse": {"groundFootprintM": [12, 9], "heightM": 5, "kind": "building", "basis": "candidate 12 x 9 m house base; 5 m apparent height"},
    "shed": {"groundFootprintM": [18, 12], "heightM": 5.5, "kind": "building", "basis": "candidate 18 x 12 m shed base; 5.5 m apparent height"},
    "corral": {"groundFootprintM": [12, 10], "heightM": 1.5, "kind": "handling prefab image", "basis": "candidate 12 x 10 m full corral base; 1.5 m rails"},
    "corral-wood-standard-imagegen-v1": {"groundFootprintM": [12, 10], "heightM": 1.5, "kind": "handling prefab (used by `/`)", "basis": "candidate 12 x 10 m full corral base; 1.5 m rails"},
    "cow-beef": {"groundFootprintM": [2.4, 1.2], "heightM": 1.5, "kind": "animal", "basis": "candidate 2.4 x 1.2 m adult bovine; 1.5 m apparent height"},
    "cow-dairy": {"groundFootprintM": [2.4, 1.2], "heightM": 1.5, "kind": "animal", "basis": "same candidate adult bovine dimensions as beef"},
    "water-trough": {"groundFootprintM": [2.5, 0.8], "heightM": 0.8, "kind": "livestock water fixture", "basis": "candidate 2.5 x 0.8 m trough; 0.8 m rim"},
    "shade-tree": {"groundFootprintM": [3, 3], "heightM": 8, "kind": "tree", "basis": "candidate 3 x 3 m trunk/clearance; 8 m canopy height"},
    "tractor": {"groundFootprintM": [4.5, 2.4], "heightM": 3, "kind": "vehicle", "basis": "candidate 4.5 x 2.4 m vehicle; 3 m apparent height"},
    "pickup": {"groundFootprintM": [5, 2.5], "heightM": 2.2, "kind": "vehicle", "basis": "candidate 5 x 2.5 m vehicle; 2.2 m apparent height"},
}

# Exact arguments at the current `/` renderer's drawSprite/drawCow call sites.
RUNTIME = {
    "grass-light": {"sizePx": [104, 70], "anchor": "center", "source": "app.js:118; grass-light/grass-mid share draw call"},
    "fence-straight": {"sizePx": [42, 31], "anchor": "center", "source": "app.js:109 horizontal; side edges use 38 x 28 and rotate π/2"},
    "gate": {"sizePx": [37, 28], "anchor": "center", "source": "app.js:124"},
    "pond": {"sizePx": [88, 61], "anchor": "center", "source": "app.js:127 default; wet season uses 102 x 70"},
    "farmhouse": {"sizePx": [75, 65], "anchor": "bottom", "source": "app.js:128 first instance; second is 65 x 53"},
    "shed": {"sizePx": [128, 91], "anchor": "bottom", "source": "app.js:129"},
    "corral": {"sizePx": [76, 58], "anchor": "bottom", "source": "manifest catalog entry; `/` draws the imagegen corral below"},
    "corral-wood-standard-imagegen-v1": {"sizePx": [93, 74], "anchor": "bottom", "source": "app.js:129"},
    "cow-beef": {"sizePx": [29, 27], "anchor": "bottom", "source": "app.js:150 drawCow; selected by animal id modulo 4"},
    "cow-dairy": {"sizePx": [29, 27], "anchor": "bottom", "source": "app.js:150 drawCow; selected by animal id modulo 4"},
    "water-trough": {"sizePx": [24, 22], "anchor": "bottom", "source": "app.js:124"},
    "shade-tree": {"sizePx": [66 * 0.56, 79 * 0.56], "anchor": "bottom", "source": "app.js:130-131; tree instance scale varies 0.48–0.62"},
    "tractor": {"sizePx": [49, 39], "anchor": "bottom", "source": "app.js:132"},
    "pickup": {"sizePx": [42, 34], "anchor": "bottom", "source": "app.js:132"},
}

ORDER = ["grass-light", "fence-straight", "gate", "pond", "farmhouse", "shed", "corral-wood-standard-imagegen-v1", "corral", "cow-beef", "cow-dairy", "water-trough", "shade-tree", "tractor", "pickup"]
BG = (244, 241, 229, 255)
INK = (48, 55, 43, 255)
MUTED = (103, 107, 91, 255)
GRID = (224, 219, 204, 255)
FOOT = (185, 125, 70, 255)


def font(size: int, bold: bool = False):
    candidates = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    for name in candidates:
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def crop_asset(manifest, asset):
    frame = asset["frame"]
    atlas_name = frame["atlas"]
    atlas_def = manifest["atlases"][atlas_name]
    atlas_path = ROOT / "public" / atlas_def["image"].lstrip("/")
    atlas = Image.open(atlas_path).convert("RGBA")
    x0, y0 = round(frame["x"]), round(frame["y"])
    x1, y1 = round(frame["x"] + frame["w"]), round(frame["y"] + frame["h"])
    return atlas.crop((x0, y0, x1, y1)), atlas_path.relative_to(ROOT).as_posix()


def draw_iso_grid(draw, origin, width=260, height=160, px=(PX_PER_M_X, PX_PER_M_Y)):
    ox, oy = origin
    # Isometric world grid at 2 m intervals using the same candidate projection.
    def project(wx, wy):
        return (ox + (wx - wy) * px[0] / 2, oy + (wx + wy) * px[1] / 2)
    wx_extent = max(8, math.ceil((width / px[0] + height / px[1]) / 2))
    wy_extent = max(8, math.ceil((width / px[0] + height / px[1]) / 2))
    for fixed in range(-wx_extent, wx_extent + 1, 5):
        a, b = project(fixed, -wy_extent), project(fixed, wy_extent)
        draw.line((*a, *b), fill=GRID, width=1)
    for fixed in range(-wy_extent, wy_extent + 1, 5):
        a, b = project(-wx_extent, fixed), project(wx_extent, fixed)
        draw.line((*a, *b), fill=GRID, width=1)


def dims_candidate(profile):
    length, width = profile["groundFootprintM"]
    projected_width = (length + width) * PX_PER_M_X / 2
    projected_depth = (length + width) * PX_PER_M_Y / 2
    projected_height = profile["heightM"] * PX_PER_M_X
    return [projected_width, projected_depth + projected_height]


def draw_sprite_panel(canvas, sprite, rect, size, anchor, footprint=None, title=None):
    draw = ImageDraw.Draw(canvas)
    x0, y0, x1, y1 = rect
    ox, oy = (x0 + x1) / 2, (y0 + y1) / 2 + 18
    # Render grid into a panel-sized layer so it cannot cover row labels or bleed
    # into adjacent assets. The displayed lines are world-space 5 m intervals.
    pw, ph = x1 - x0, y1 - y0
    grid = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    draw_iso_grid(ImageDraw.Draw(grid), (pw / 2, ph / 2 + 18), pw - 16, ph - 28)
    canvas.alpha_composite(grid, (x0, y0))
    if footprint:
        length, width = footprint
        # Project a ground rectangle, then align its far/downhill vertex to the
        # candidate ground contact anchor at the bottom-center of the sprite.
        world = [(-length/2, -width/2), (length/2, -width/2), (length/2, width/2), (-length/2, width/2)]
        projected = [((wx-wy)*PX_PER_M_X/2, (wx+wy)*PX_PER_M_Y/2) for wx, wy in world]
        min_x, max_x = min(p[0] for p in projected), max(p[0] for p in projected)
        max_y = max(p[1] for p in projected)
        corners = [(ox + px - (min_x+max_x)/2, oy + py - max_y) for px, py in projected]
        draw.polygon(corners, outline=FOOT, width=2)
    target_w, target_h = max(1, round(size[0])), max(1, round(size[1]))
    fitted = sprite.resize((target_w, target_h), Image.Resampling.LANCZOS)
    ax = 0.5
    ay = 1.0 if anchor == "bottom" else 0.5
    pos = (round(ox - target_w * ax), round(oy - target_h * ay))
    # Contact shadow is only a guide for the anchor; the sprite itself is unchanged.
    draw.ellipse((ox - max(4, target_w * .19), oy - 2, ox + max(4, target_w * .19), oy + 3), fill=(72, 66, 48, 42))
    canvas.alpha_composite(fitted, pos)
    draw = ImageDraw.Draw(canvas)
    draw.line((ox - 6, oy, ox + 6, oy), fill=(41, 92, 83, 255), width=2)
    draw.line((ox, oy - 6, ox, oy + 6), fill=(41, 92, 83, 255), width=2)
    if title:
        draw.text((x0 + 8, y0 + 5), title, fill=MUTED, font=font(12))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST_PATH.read_text())
    asset_map = {item["id"]: item for item in manifest["assets"]}
    missing = [asset_id for asset_id in ORDER if asset_id not in asset_map]
    if missing:
        raise SystemExit("Missing manifest assets: " + ", ".join(missing))
    # Ensure the runtime source still contains the expected real draw sites.
    app = APP_PATH.read_text()
    for needle in ["drawSprite('fence-straight'", "drawSprite('farmhouse'", "drawSprite('shed'", "drawSprite('water-trough'", "drawAssetOn(ctx,a.id%4===0?'cow-beef':'cow-dairy'"]:
        if needle not in app:
            raise SystemExit(f"Runtime check failed: expected draw call not found: {needle}")

    width, row_h, header_h = 1500, 174, 112
    height = header_h + row_h * len(ORDER) + 56
    sheet = Image.new("RGBA", (width, height), BG)
    d = ImageDraw.Draw(sheet)
    d.text((32, 24), "RIOSE AGRO · V7 ASSET SCALE BENCH", fill=INK, font=font(25, True))
    d.text((32, 60), "Left: current `/` drawSprite/drawCow dimensions. Right: shared-scale candidate; orange diamond = candidate ground footprint.", fill=INK, font=font(14))
    d.text((32, 82), f"Candidate projection: {PX_PER_M_X} px/m horizontal, {PX_PER_M_Y} px/m vertical · candidate footprints are hypotheses, not alpha-derived measurements.", fill=MUTED, font=font(13))
    d.text((397, 125), "CURRENT `/` RUNTIME", fill=INK, font=font(16, True))
    d.text((965, 125), "CALIBRATED CANDIDATE · REVIEW", fill=FOOT, font=font(16, True))
    metadata = {
        "schemaVersion": "riose.asset-calibration.v1",
        "sourceManifest": "public/assets/manifest.json",
        "runtimeSource": "src/client/app.js",
        "runtimeVerifiedBy": "literal drawSprite/drawCow call-site checks in this script",
        "candidateProjection": {"pxPerMeterX": PX_PER_M_X, "pxPerMeterY": PX_PER_M_Y, "status": "candidate authoring convention; not approved physical calibration"},
        "importantLimit": "PNG alpha bounds measure visible non-transparent pixels only. They do not prove ground footprints, collision, height, or contact geometry.",
        "assets": [],
    }
    for idx, asset_id in enumerate(ORDER):
        asset = asset_map[asset_id]
        prof = PROFILE[asset_id]
        run = RUNTIME[asset_id]
        sprite, source_path = crop_asset(manifest, asset)
        # Alpha bbox is diagnostic only; avoid pretending it is the footprint.
        alpha_bbox = sprite.getchannel("A").getbbox()
        y = header_h + idx * row_h
        if idx % 2 == 1:
            d.rectangle((0, y, width, y + row_h), fill=(238, 236, 225, 255))
        d.text((28, y + 12), asset_id, fill=INK, font=font(15, True))
        d.text((28, y + 35), prof["kind"], fill=MUTED, font=font(12))
        d.text((28, y + 57), f"PNG frame {sprite.width}×{sprite.height}", fill=MUTED, font=font(11))
        d.text((28, y + 75), f"alpha bbox {alpha_bbox}", fill=MUTED, font=font(10))
        actual_size = run["sizePx"]
        draw_sprite_panel(sheet, sprite, (350, y + 3, 925, y + row_h - 5), actual_size, run["anchor"], title=f"drawn {actual_size[0]:.1f} × {actual_size[1]:.1f} px · anchor {run['anchor']}")
        candidate_size = dims_candidate(prof)
        draw_sprite_panel(sheet, sprite, (930, y + 3, 1485, y + row_h - 5), candidate_size, "bottom", prof["groundFootprintM"], title=f"base {prof['groundFootprintM'][0]} × {prof['groundFootprintM'][1]} m · height {prof['heightM']} m · visual {candidate_size[0]:.0f} × {candidate_size[1]:.0f} px")
        d.text((350, y + row_h - 19), run["source"], fill=MUTED, font=font(9))
        d.text((940, y + row_h - 19), "CANDIDATE · " + prof["basis"], fill=FOOT, font=font(9))
        metadata["assets"].append({
            "id": asset_id,
            "category": asset.get("category"),
            "sourceFile": source_path,
            "frame": asset["frame"],
            "sourceFramePx": [sprite.width, sprite.height],
            "alphaBoundsPxDiagnosticOnly": list(alpha_bbox) if alpha_bbox else None,
            "currentRuntime": {"renderSizePx": [round(actual_size[0], 2), round(actual_size[1], 2)], "anchor": run["anchor"], "callSite": run["source"]},
            "candidate": {**prof, "projectedVisualBoundsPx": [round(candidate_size[0], 2), round(candidate_size[1], 2)], "groundFootprintStatus": "INFERRED_CANDIDATE_REQUIRES_ARTIST_REVIEW", "collisionStatus": "UNRESOLVED", "groundAnchorStatus": "candidate bottom-center; requires visual review"},
            "manifestDisplaySizePx": asset.get("displaySize"),
            "manifestReviewStatus": asset.get("reviewStatus"),
        })
    d.rectangle((0, height - 48, width, height), fill=(227, 224, 210, 255))
    d.text((32, height - 36), "Important: candidate proportions are explicit physical assumptions used to compare one shared world scale. They do not convert artwork pixels into physical truth. No asset geometry is approved by this sheet.", fill=INK, font=font(12))
    sheet.convert("RGB").save(PNG_PATH, quality=95)
    JSON_PATH.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")
    report = [
        "# V7 asset scale calibration bench",
        "",
        "Generated by `python3 scripts/assets/build_v7_asset_calibration.py` from the local `public/assets/manifest.json` and the current `/` draw call sites in `src/client/app.js`.",
        "",
        "The left column reports dimensions actually passed to `drawSprite()` or `drawCow()` for the primary current scene. The right column uses one explicit candidate projection (12 px/m horizontally, 6 px/m vertically) and candidate real-world dimensions. Orange outlines show candidate ground footprints.",
        "",
        "**Candidate dimensions are hypotheses only.** Alpha bounds indicate visible pixels in a PNG frame. They do not establish ground footprint, collision, height, access points, or anchor correctness. Candidate footprints, heights, and anchors need technical-art review against the actual art and desired world scale.",
        "",
        "The `corral-wood-standard-imagegen-v1` row is the image the `/` renderer draws in its current cattle scene; `corral` is included as a separate catalog asset for comparison.",
        "",
        f"Rendered contact sheet: `{PNG_PATH.relative_to(ROOT).as_posix()}`.",
        f"Machine-readable data: `{JSON_PATH.relative_to(ROOT).as_posix()}`.",
        "",
        "Runtime sizes in the sheet come from `buildTerrain()`/`drawCow()` call-site arguments. Sprite PNG frames are extracted from their manifest atlas rectangles; no source atlas files are modified.",
    ]
    MD_PATH.write_text("\n".join(report) + "\n")
    print(f"Wrote {PNG_PATH.relative_to(ROOT)} ({width}x{height})")
    print(f"Wrote {JSON_PATH.relative_to(ROOT)} ({len(ORDER)} assets)")
    print(f"Wrote {MD_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
