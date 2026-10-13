#!/usr/bin/env python3
"""Create a hard-edge sprite export from a visually reviewed soft-alpha source.

This only thresholds alpha and clears RGB under fully transparent pixels. It does
not resize, quantize, recolor, sharpen, or alter visible RGB values. Always review
source and output on contrasting mattes before using the export.
"""
from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--threshold", type=int, default=128, choices=range(1, 256))
args = parser.parse_args()

with Image.open(args.source) as opened:
    image = opened.convert("RGBA")
alpha = image.getchannel("A")
mask = alpha.point(lambda value: 255 if value >= args.threshold else 0)
image.putalpha(mask)
# Prevent hidden source-background RGB from bleeding if a renderer filters scaling.
transparent = mask.point(lambda value: 255 if value == 0 else 0)
image.paste((0, 0, 0, 0), mask=transparent)
args.output.parent.mkdir(parents=True, exist_ok=True)
image.save(args.output, optimize=True)
print(f"Saved {args.output} ({image.width}x{image.height}, alpha threshold={args.threshold})")
