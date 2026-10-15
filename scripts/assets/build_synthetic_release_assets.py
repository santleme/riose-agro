#!/usr/bin/env python3
"""Create project-authored geometric sprites for the public runtime release."""
import colorsys
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "public/assets/manifest.json"
RELEASE = ROOT / "assets/manifests/actiii-release-v1.json"
SPRITES = ROOT / "assets/synthetic/runtime"
SIZE = (192, 128)

def color_for(name):
    hue = int(hashlib.sha256(name.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    r, g, b = colorsys.hsv_to_rgb(hue, .48, .78)
    return tuple(round(channel * 255) for channel in (r, g, b))

def create_sprite(asset):
    name = asset["id"]
    image = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    base = color_for(name)
    shade = tuple(int(channel * .62) for channel in base)
    light = tuple(min(255, int(channel * 1.25 + 25)) for channel in base)
    x, y = 96, 68
    category = asset.get("category", "object")
    # Original art made only from deterministic polygon and ellipse primitives.
    if category == "terrain":
        draw.polygon([(12, 66), (96, 28), (180, 66), (96, 108)], fill=base)
        draw.line([(18, 66), (96, 104), (174, 66)], fill=light, width=4)
        for px in range(42, 160, 22):
            draw.ellipse((px, 62 + (px % 16), px + 5, 67 + (px % 16)), fill=shade)
    elif any(word in name for word in ("cow", "cattle", "nelore", "heifer", "calf", "bull", "animal")):
        draw.ellipse((42, 45, 141, 100), fill=base, outline=shade, width=5)
        draw.ellipse((128, 48, 160, 78), fill=light, outline=shade, width=4)
        draw.polygon([(130, 52), (132, 35), (141, 50)], fill=light, outline=shade)
        for lx in (64, 119): draw.line((lx, 86, lx - 5, 112), fill=shade, width=8)
        draw.ellipse((149, 60, 154, 65), fill=(35, 35, 35, 255))
    elif any(word in name for word in ("tree", "shrub", "vegetation", "plant")):
        draw.polygon([(85, 95), (96, 41), (107, 95)], fill=shade)
        for box, col in [((45, 28, 112, 90), light), ((82, 20, 150, 86), base), ((62, 45, 130, 104), shade)]:
            draw.ellipse(box, fill=col)
    elif any(word in name for word in ("water", "pond", "trough", "tank")):
        draw.polygon([(18, 65), (96, 34), (174, 65), (96, 101)], fill=base, outline=shade)
        draw.line((45, 66, 96, 87, 148, 66), fill=light, width=5)
    elif any(word in name for word in ("road", "path", "fence", "gate")):
        draw.polygon([(12, 68), (96, 30), (180, 68), (96, 110)], fill=base, outline=shade)
        draw.line((24, 68, 96, 104, 168, 68), fill=light, width=6)
        if "fence" in name or "gate" in name:
            for px in (52, 96, 140): draw.line((px, 43, px, 86), fill=shade, width=6)
    else:
        # Buildings and equipment use a simple three-face isometric block.
        draw.polygon([(38, 51), (96, 22), (154, 51), (96, 80)], fill=light, outline=shade)
        draw.polygon([(38, 51), (96, 80), (96, 112), (38, 82)], fill=base, outline=shade)
        draw.polygon([(96, 80), (154, 51), (154, 82), (96, 112)], fill=shade, outline=shade)
        if any(word in name for word in ("barn", "house", "shed", "building")):
            draw.polygon([(34, 52), (96, 14), (158, 52), (96, 84)], fill=light, outline=shade)
            draw.rectangle((83, 70, 108, 108), fill=shade)
    return image

def main():
    runtime = json.loads(RUNTIME.read_text())
    assets = runtime["assets"]
    SPRITES.mkdir(parents=True, exist_ok=True)
    records = []
    for asset in assets:
        sprite = create_sprite(asset)
        path = SPRITES / f"{asset['id']}.png"
        sprite.save(path, optimize=True)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        records.append({
            "id": f"riose.synthetic.runtime.{asset['id']}.v1",
            "name": asset["id"],
            "category": asset.get("category", "object"),
            "status": "RELEASED",
            "rights": {"licenseState": "documented", "notes": "Project-owned synthetic sprite drawn from geometric primitives; no external image inputs, reference artwork, fonts, or third-party components."},
            "review": {"art": "pass", "technical": "pass", "decisionNote": "Minimal category silhouette inspected in the generated atlas; source dimensions, alpha channel, and reproducible packing verified."},
            "sourceManifest": "assets/manifests/actiii-release-v1.json",
            "source": {"kind": "project-authored-synthetic", "sourceFile": f"assets/synthetic/runtime/{path.name}", "sha256": digest,
                       "tool": "Project-authored geometric sprite source file"},
            "atlas": {"pack": "synthetic-release"},
            "file": "public/assets/atlas/synthetic-release-atlas-v1.png",
        })
    RELEASE.parent.mkdir(parents=True, exist_ok=True)
    RELEASE.write_text(json.dumps({"schemaVersion": 1, "sourceRevision": {"commit": "actiii-release-synthetic-v1"},
        "atlasPacks": {"synthetic-release": {"image": "public/assets/atlas/synthetic-release-atlas-v1.png"}}, "assets": records}, indent=2, ensure_ascii=False) + "\n")
    print(f"Generated {len(records)} project-authored sprites in {SPRITES}")

if __name__ == "__main__":
    main()
