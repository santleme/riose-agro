#!/usr/bin/env python3
"""Normalize four-frame transparent sprite strips and emit atlas metadata."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw


def normalize(source: Path, output: Path, frames: int, state: str) -> dict:
    image = Image.open(source).convert('RGBA')
    if image.width % frames:
        raise ValueError(f'{source}: width {image.width} is not divisible by {frames} frames')
    cell_width = image.width // frames
    cells = []
    for index in range(frames):
        cell = image.crop((index * cell_width, 0, (index + 1) * cell_width, image.height))
        pixels = cell.load()
        # Remove the bright magenta/red/yellow matte fringe present in the generated
        # transparency edge; retain neutral dark outlines and the animal's pink ear.
        for y in range(cell.height):
            for x in range(cell.width):
                r, g, b, a = pixels[x, y]
                red_fringe = a and r > 155 and g < 95 and b < 115 and r > g * 1.65
                yellow_fringe = a and r > 215 and 115 < g < 210 and b < 100
                if red_fringe or yellow_fringe:
                    pixels[x, y] = (r, g, b, 0)
        bbox = cell.getchannel('A').point(lambda value: 255 if value > 12 else 0).getbbox()
        if not bbox:
            raise ValueError(f'{source}: empty frame {index}')
        crop = cell.crop(bbox)
        cells.append(crop)
    frame_width = max(cell.width for cell in cells) + 24
    frame_height = max(cell.height for cell in cells) + 24
    atlas = Image.new('RGBA', (frame_width * frames, frame_height), (0, 0, 0, 0))
    placements = []
    for index, cell in enumerate(cells):
        x = index * frame_width + (frame_width - cell.width) // 2
        y = frame_height - 12 - cell.height
        atlas.alpha_composite(cell, (x, y))
        placements.append({'frame': index, 'x': index * frame_width, 'y': 0, 'width': frame_width, 'height': frame_height,
                           'pivot': {'x': 0.5, 'y': 1.0}, 'contactBounds': {'x': x, 'y': y, 'width': cell.width, 'height': cell.height}})
    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output)
    metadata = {
        'schemaVersion': 1,
        'id': f'livestock.nelore.adult.{state}.imagegen.v1',
        'category': 'livestock', 'state': state, 'direction': 'three-quarter-front-left',
        'sourceFile': source.as_posix(), 'file': output.as_posix(),
        'sourceTool': 'OpenAI ImageGen; source art based on project Nelore sprite',
        'license': {'state': 'project-generated-review', 'notes': 'Verify current generation terms before public or commercial release.'},
        'review': {'status': 'REVIEW', 'art': 'unreviewed', 'technical': 'alpha-cleaned-and-frame-normalized'},
        'frameCount': frames, 'frameSize': {'width': frame_width, 'height': frame_height},
        'resolution': 'source pixels; no runtime scaling baked in', 'footprint': [1, 1],
        'collision': {'shape': 'ellipse', 'width': 0.72, 'height': 0.30},
        'placements': placements,
    }
    metadata_path = output.with_suffix('.json')
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    contact = Image.new('RGB', (frame_width * frames, frame_height + 28), '#f1eee4')
    contact.paste(atlas, (0, 20), atlas)
    draw = ImageDraw.Draw(contact)
    for index in range(frames): draw.text((index * frame_width + 8, 4), f'{state.upper()} · {index + 1}', fill='#26372e')
    contact_path = output.with_name(output.stem + '-contact.png')
    contact.save(contact_path)
    return {'atlas': output.as_posix(), 'metadata': metadata_path.as_posix(), 'contactSheet': contact_path.as_posix(), 'frameSize': metadata['frameSize'], 'frameCount': frames}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--frames', type=int, default=4)
    parser.add_argument('--state', required=True, choices=['idle', 'walk', 'graze', 'drink'])
    args = parser.parse_args()
    print(json.dumps(normalize(args.source, args.output, args.frames, args.state), ensure_ascii=False))


if __name__ == '__main__': main()
