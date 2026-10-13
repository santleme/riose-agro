#!/usr/bin/env python3
"""Measure non-semantic raster properties of the urban composition and rural content references.

This report supports art-direction calibration; it does not approve an asset or
infer material names, outline width, or a native sprite grid.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REFERENCES = {
    "urban_composition_master": ROOT / "docs/assets/pixel-art-urban-reference.png",
    "rural_content_scale_master": ROOT
    / "docs/assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png",
}


def _median_cut_palette(rgb: np.ndarray, mask: np.ndarray, colors: int = 12) -> list[dict[str, object]]:
    pixels = rgb[mask]
    indexed = Image.fromarray(pixels.reshape((-1, 1, 3)), mode="RGB").quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    palette = indexed.getpalette() or []
    counts = sorted(indexed.getcolors(maxcolors=pixels.shape[0]) or [], reverse=True)
    result = []
    for count, palette_index in counts[:colors]:
        red, green, blue = palette[palette_index * 3 : palette_index * 3 + 3]
        result.append({"hex": f"#{red:02X}{green:02X}{blue:02X}", "sampled_pixels": count})
    return result


def measure_image(path: Path, role: str) -> dict[str, object]:
    with Image.open(path) as opened:
        image = opened.convert("RGBA")
        source_mode = opened.mode
        has_icc_profile = bool(opened.info.get("icc_profile"))
    array = np.asarray(image, dtype=np.uint8)
    rgb = array[:, :, :3]
    alpha_counts = Counter(array[:, :, 3].reshape(-1).tolist())
    height, width = rgb.shape[:2]

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    saturation = hsv[:, :, 1].astype(np.float32) / 255.0
    value = hsv[:, :, 2].astype(np.float32) / 255.0
    backdrop_mask = (saturation < 0.10) & (value > 0.93)
    palette_mask = ~backdrop_mask

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 70, 150)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=35,
        minLineLength=24,
        maxLineGap=3,
    )

    orientation_lengths: dict[str, list[float]] = {
        "isometric_positive": [],
        "isometric_negative": [],
        "near_horizontal": [],
        "near_vertical": [],
        "other": [],
    }
    if lines is not None:
        for x1, y1, x2, y2 in lines[:, 0, :]:
            delta_x = int(x2 - x1)
            delta_y = int(y2 - y1)
            length = float(np.hypot(delta_x, delta_y))
            if delta_x == 0:
                bucket = "near_vertical"
            else:
                slope = delta_y / delta_x
                if 0.45 <= slope <= 0.55:
                    bucket = "isometric_positive"
                elif -0.55 <= slope <= -0.45:
                    bucket = "isometric_negative"
                elif abs(slope) > 0.90:
                    bucket = "near_vertical"
                elif abs(slope) < 0.08:
                    bucket = "near_horizontal"
                else:
                    bucket = "other"
            orientation_lengths[bucket].append(length)

    segment_count = sum(len(lengths) for lengths in orientation_lengths.values())
    total_segment_length = sum(sum(lengths) for lengths in orientation_lengths.values())
    isometric_length = sum(
        sum(orientation_lengths[key])
        for key in ("isometric_positive", "isometric_negative")
    )

    return {
        "role": role,
        "source": path.relative_to(ROOT).as_posix(),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "width_px": width,
        "height_px": height,
        "source_mode": source_mode,
        "embedded_icc_profile": has_icc_profile,
        "rgb_unique_color_count": int(np.unique(rgb.reshape(-1, 3), axis=0).shape[0]),
        "alpha_counts": {
            "transparent": alpha_counts[0],
            "partial": sum(count for alpha, count in alpha_counts.items() if 0 < alpha < 255),
            "opaque": alpha_counts[255],
        },
        "raster_distribution": {
            "near_white_neutral_mask_rule": "HSV saturation < 0.10 and value > 0.93; excluded only from palette/saturation samples",
            "near_white_neutral_pixel_count": int(backdrop_mask.sum()),
            "palette_sample_pixel_count": int(palette_mask.sum()),
            "saturation_quantiles_25_50_75_90": [
                round(float(item), 4) for item in np.quantile(saturation[palette_mask], [0.25, 0.50, 0.75, 0.90])
            ],
            "value_quantiles_25_50_75_90": [
                round(float(item), 4) for item in np.quantile(value[palette_mask], [0.25, 0.50, 0.75, 0.90])
            ],
        },
        "representative_median_cut_palette_12": _median_cut_palette(rgb, palette_mask),
        "long_edge_orientation_probe": {
            "method": "OpenCV grayscale Canny then probabilistic Hough segments; min length 24 px; slope tolerance around +/-0.5 is +/-0.05",
            "segment_count": segment_count,
            "segment_counts": {key: len(lengths) for key, lengths in orientation_lengths.items()},
            "isometric_slope_segment_length_share": round(isometric_length / total_segment_length, 4)
            if total_segment_length
            else None,
            "limitations": "A scene contains many non-ground edges; this is evidence of recurring orientations, not a camera calibration or proof that every object uses one grid.",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "docs/art/reference-measurements-v1.json",
        help="JSON report path (default: docs/art/reference-measurements-v1.json)",
    )
    args = parser.parse_args()

    report = {
        "report_version": "1.0",
        "purpose": "Descriptive raster measurements for assigned reference roles; not an approval, sprite-style authority, or material-semantic palette.",
        "images": [measure_image(path, role) for role, path in DEFAULT_REFERENCES.items()],
        "cross_reference_notes": [
            "The urban master is used only for composition grammar; the V7 scene controls rural content and relative scale.",
            "Palette chips are descriptive median-cut bins from the urban source, not Riose style tokens, exact material labels, or production swatches.",
            "Outline width, cluster-size limits, shadow direction, sprite scale, and transparent-edge behavior are not reliably inferred by these global raster statistics and remain a visual review task.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output.relative_to(ROOT)}")
    for image in report["images"]:
        probe = image["long_edge_orientation_probe"]
        print(
            f"{image['role']}: {image['width_px']}x{image['height_px']}, "
            f"{image['rgb_unique_color_count']} unique RGB colors, "
            f"{probe['segment_count']} line segments, "
            f"{probe['isometric_slope_segment_length_share']:.1%} Hough length near +/-0.5"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
