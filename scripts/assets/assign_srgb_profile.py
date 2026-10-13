#!/usr/bin/env python3
"""Embed an sRGB ICC profile in untagged PNGs without changing pixel values."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from PIL import Image, ImageCms


def pixel_digest(image: Image.Image) -> str:
    rgba = image.convert("RGBA")
    return hashlib.sha256(rgba.tobytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("png", nargs="+", type=Path)
    args = parser.parse_args()
    profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()

    for path in args.png:
        with Image.open(path) as source:
            if source.format != "PNG":
                parser.error(f"not a PNG: {path}")
            if source.info.get("icc_profile"):
                parser.error(f"already has an ICC profile; refusing to replace it: {path}")
            before = pixel_digest(source)
            image = source.copy()
        image.save(path, format="PNG", optimize=True, icc_profile=profile)
        with Image.open(path) as check:
            if not check.info.get("icc_profile"):
                raise RuntimeError(f"profile was not embedded: {path}")
            if pixel_digest(check) != before:
                raise RuntimeError(f"pixel data changed while tagging: {path}")
        print(f"tagged sRGB without RGB transform: {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
