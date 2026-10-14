#!/usr/bin/env python3
"""Pack authored cattle state strips and a reviewed idle pose into one atlas."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'assets/candidates/livestock/animation-v1'
states = {
    'idle': {'image': ROOT / 'assets/approved/livestock/nelore-adult-idle-v1.png', 'frames': 1, 'frameMs': 900, 'status': 'APPROVED_STATIC'},
    'walk': {'image': DIR / 'nelore-walk-cycle-4f.png', 'frames': 4, 'frameMs': 150, 'status': 'REVIEW'},
    'graze': {'image': DIR / 'nelore-graze-loop-4f.png', 'frames': 4, 'frameMs': 240, 'status': 'REVIEW'},
    'drink': {'image': DIR / 'nelore-drink-loop-4f.png', 'frames': 4, 'frameMs': 210, 'status': 'REVIEW'},
}

def trim(image):
    image = image.convert('RGBA')
    bounds = image.getchannel('A').point(lambda value: 255 if value > 12 else 0).getbbox()
    return image.crop(bounds) if bounds else image

cells = {}
max_frame_size = (567, 476)
for state, record in states.items():
    image = Image.open(record['image']).convert('RGBA')
    if state == 'idle':
        image = trim(image)
        scale = min(max_frame_size[0] / image.width, max_frame_size[1] / image.height, 1)
        if scale < 1: image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        cells[state] = [image]; continue
    meta = json.loads(record['image'].with_suffix('.json').read_text())
    width, height = meta['frameSize']['width'], meta['frameSize']['height']
    cells[state] = [trim(image.crop((i * width, 0, (i + 1) * width, height))) for i in range(record['frames'])]

cell_w = max(image.width for group in cells.values() for image in group) + 20
cell_h = max(image.height for group in cells.values() for image in group) + 20
columns = 4; rows = len(states)
atlas = Image.new('RGBA', (cell_w * columns, cell_h * rows), (0, 0, 0, 0))
clips = {}
for row, (state, frames) in enumerate(cells.items()):
    clip = {'state': state, 'frameMs': states[state]['frameMs'], 'status': states[state]['status'], 'frames': []}
    for index, image in enumerate(frames):
        col = index if len(frames) > 1 else 0
        x = col * cell_w + (cell_w - image.width) // 2
        y = row * cell_h + cell_h - 10 - image.height
        atlas.alpha_composite(image, (x, y))
        clip['frames'].append({'x': col * cell_w, 'y': row * cell_h, 'width': cell_w, 'height': cell_h, 'pivot': {'x': .5, 'y': 1.0}, 'contactBounds': {'x': x, 'y': y, 'width': image.width, 'height': image.height}})
    clips[state] = clip

out = DIR / 'nelore-state-atlas-v1.png'
out.parent.mkdir(parents=True, exist_ok=True); atlas.save(out, optimize=True)
manifest = {'schemaVersion': 1, 'assetId': 'livestock.nelore.adult.state-atlas.v1', 'file': out.relative_to(ROOT).as_posix(), 'sourceTool': 'Pillow atlas packer', 'frameSize': {'width': cell_w, 'height': cell_h}, 'layout': {'columns': columns, 'rows': rows, 'order': list(states)}, 'pivotMeaning': 'ground-contact center-bottom', 'clips': clips, 'reviewStatus': 'REVIEW', 'notes': 'Idle is one real reviewed static pose. Walk, graze and drink strips are generated candidate frame art; behavior clips remain unreviewed.'}
(DIR / 'nelore-state-atlas-v1.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'atlas': out.relative_to(ROOT).as_posix(), 'dimensions': atlas.size, 'states': {key: len(value) for key, value in cells.items()}}, ensure_ascii=False))
