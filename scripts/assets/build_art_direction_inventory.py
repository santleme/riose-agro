#!/usr/bin/env python3
"""Inventory every raster asset and render review contact sheets by semantic role.

The output distinguishes measurable image properties from subjective art review.
It never auto-approves style compatibility.
"""
from __future__ import annotations
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SEARCH_ROOTS = [ROOT / 'assets', ROOT / 'public/assets', ROOT / 'docs/assets', ROOT / 'graphics-poc']
OUTPUT = ROOT / 'assets/previews/asset-art-direction-v1'
RASTER = {'.png', '.webp', '.jpg', '.jpeg', '.bmp', '.gif'}

def category_for(path: Path) -> str:
    key = path.as_posix().lower()
    tests = [
        ('livestock', ('livestock', 'cattle', 'nelore', 'cow', 'calf', 'beef', 'dairy')),
        ('buildings', ('building', 'farmhouse', 'shed', 'barn', 'infrastructure')),
        ('handling-and-fences', ('handling', 'corral', 'fence', 'gate', 'chute', 'alley')),
        ('vegetation', ('vegetation', 'tree', 'shrub', 'grass-tuft')),
        ('water', ('water', 'pond', 'reservoir', 'trough', 'creek', 'stream')),
        ('roads-and-paths', ('road', 'path', 'track', 'trail')),
        ('terrain-and-soil', ('terrain', 'pasture', 'grass', 'soil', 'ground', 'cliff', 'earth', 'mud')),
        ('vehicles-and-machinery', ('vehicle', 'tractor', 'truck', 'pickup', 'machine')),
        ('technology', ('technology', 'rfid', 'reader', 'monitor', 'tag', 'sensor', 'scale')),
    ]
    for category, terms in tests:
        if any(term in key for term in terms):
            return category
    return 'props-and-other'

def role_for(path: Path, dimensions: tuple[int, int]) -> str:
    key = path.as_posix().lower()
    if any(term in key for term in ('previews/', 'contact-sheet', 'comparison', 'screenshot', 'scene-v', 'diorama-final')):
        return 'scene-or-review-preview'
    if 'atlas' in key or 'spritesheet' in key or dimensions[0] > 1200 or dimensions[1] > 1200:
        return 'atlas-or-spritesheet'
    return 'individual-sprite-or-texture'

def checker(size: tuple[int, int], step: int = 10) -> Image.Image:
    image = Image.new('RGBA', size, '#f0efe9')
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            if (x // step + y // step) % 2:
                draw.rectangle((x, y, x + step - 1, y + step - 1), fill='#d7d5cd')
    return image

def main() -> None:
    manifest_paths: dict[str, dict] = {}
    for manifest_path in (ROOT / 'assets/manifests/manifest.json', ROOT / 'graphics-poc/assets/main-composer-render-manifest.json'):
        if not manifest_path.exists():
            continue
        data = json.loads(manifest_path.read_text())
        records = data.get('assets', data.get('sprites', []))
        if isinstance(records, dict):
            records = list(records.values())
        for record in records:
            file = record.get('file') or record.get('source') or record.get('path')
            if isinstance(file, dict): file = file.get('file') or file.get('path')
            if file:
                manifest_paths[Path(file).as_posix()] = record

    selected = set()
    scene_path = ROOT / 'assets/previews/ranch-composition-v4/rural-diorama-scene-v4-grounding-v2-gate-v2-water-v2-feed-v2-review.json'
    scene_manifest = ROOT / 'assets/manifests/manifest.json'
    if scene_path.exists() and scene_manifest.exists():
        scene = json.loads(scene_path.read_text())
        manifest = json.loads(scene_manifest.read_text())
        by_id = {item['id']: item for item in manifest['assets']}
        ids = {scene.get('terrainAssetId')} | {p['assetId'] for p in scene.get('placements', [])} | {p['assetId'] for p in scene.get('groundingOverlays', [])}
        selected = {by_id[asset_id]['file'] for asset_id in ids if asset_id in by_id}

    paths = sorted({p for root in SEARCH_ROOTS if root.exists() for p in root.rglob('*')
                    if p.is_file() and p.suffix.lower() in RASTER and OUTPUT not in p.parents})
    OUTPUT.mkdir(parents=True, exist_ok=True)
    font_regular = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
    font_bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 13)
    inventory = []
    grouped: dict[str, list[dict]] = defaultdict(list)
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        with Image.open(path) as original:
            original.load()
            image = original.convert('RGBA')
            width, height = image.size
            alpha = image.getchannel('A')
            hist = alpha.histogram()
            transparent_fraction = sum(hist[:16]) / (width * height)
            partial_alpha_fraction = sum(hist[16:240]) / (width * height)
            rgb = image.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT)
            palette_counts = sorted(rgb.getcolors(maxcolors=1_000_000) or [], reverse=True)
            color_count_256 = len(palette_counts)
            palette = rgb.getpalette() or []
            dominant_palette = [f"#{palette[index * 3]:02x}{palette[index * 3 + 1]:02x}{palette[index * 3 + 2]:02x}" for _, index in palette_counts[:6]]
        record = manifest_paths.get(rel, {})
        status = record.get('status', record.get('reviewStatus', 'UNRESOLVED'))
        selection = 'selected-for-v4-pilot' if rel in selected else 'rejected-lab' if '/rejected/' in rel else 'pending-review'
        category = category_for(Path(rel))
        role = role_for(Path(rel), (width, height))
        entry = {
            'id': record.get('id') or record.get('assetId') or path.stem,
            'file': rel, 'category': category, 'role': role,
            'dimensionsPx': {'width': width, 'height': height},
            'alpha': {'transparentFraction': round(transparent_fraction, 4), 'partialAlphaFraction': round(partial_alpha_fraction, 4)},
            'sampledColorCountMax256': color_count_256,
            'dominantPaletteApproxHex': dominant_palette,
            'footprint': record.get('footprint'),
            'pivot': record.get('anchor') or record.get('pivot'),
            'perspective': record.get('perspective') or record.get('orientations'),
            'recommendedScale': record.get('scaleHints') or record.get('displaySizePx'),
            'animations': record.get('states') or record.get('frames'),
            'licenseAndProvenance': {'rights': record.get('rights'), 'source': record.get('source'), 'file': rel},
            'manifestStatus': status,
            'selection': selection,
            'compatibility': 'pending-human-review',
            'reviewSignals': ['perspective', 'relative-scale', 'palette', 'lighting', 'outline-and-shading', 'transparency-quality', 'detail-density', 'agro-context'],
            'sourceMetadata': record,
        }
        inventory.append(entry)
        grouped[category].append({'entry': entry, 'path': path})

    card_w, card_h, art_h, footer_h, gap, columns, per_page = 280, 216, 162, 54, 12, 5, 25
    sheets = []
    summary = Counter()
    for category, entries in sorted(grouped.items()):
        for page_index in range((len(entries) + per_page - 1) // per_page):
            batch = entries[page_index * per_page:(page_index + 1) * per_page]
            rows = (len(batch) + columns - 1) // columns
            width = 28 + columns * card_w + (columns - 1) * gap
            height = 88 + rows * (card_h + gap) + 20
            sheet = Image.new('RGB', (width, height), '#efeee8')
            draw = ImageDraw.Draw(sheet)
            title = category.upper().replace('-', ' ')
            suffix = f' · {page_index + 1}' if len(entries) > per_page else ''
            draw.text((14, 12), f'RIOSE ART DIRECTION · {title}{suffix}', font=font_bold, fill='#28392f')
            draw.text((14, 38), 'RGBA checker · escala original indicada · compatibilidade artística pendente de inspeção humana', font=font_regular, fill='#526157')
            for index, item in enumerate(batch):
                record = item['entry']
                with Image.open(item['path']) as opened:
                    source = opened.convert('RGBA')
                row, col = divmod(index, columns)
                x, y = 14 + col * (card_w + gap), 72 + row * (card_h + gap)
                draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=7, fill='#fffefa', outline='#c5c4bc')
                thumb = source.copy()
                thumb.thumbnail((card_w - 12, art_h - 10), Image.Resampling.LANCZOS)
                bg = checker((card_w - 8, art_h - 6))
                bg.alpha_composite(thumb, ((bg.width - thumb.width) // 2, (bg.height - thumb.height) // 2))
                sheet.paste(bg.convert('RGB'), (x + 4, y + 4))
                label = Path(record['file']).name
                if len(label) > 34: label = label[:31] + '...'
                draw.text((x + 7, y + art_h), label, font=font_bold, fill='#26372e')
                draw.text((x + 7, y + art_h + 18), f"{record['dimensionsPx']['width']}×{record['dimensionsPx']['height']} · {record['selection']} · {record['manifestStatus']}", font=font_regular, fill='#555e56')
                summary[record['selection']] += 1
                record['thumbnail'] = {'contactSheet': None, 'cellIndex': index, 'column': col, 'row': row}
            filename = f"{category}-p{page_index + 1:02d}.jpg"
            for item_index, item in enumerate(batch):
                item['entry']['thumbnail']['contactSheet'] = filename
            sheet.save(OUTPUT / filename, quality=88, optimize=True)
            sheets.append({'category': category, 'file': filename, 'items': len(batch)})

    payload = {'schemaVersion': 1, 'generatedBy': 'scripts/assets/build_art_direction_inventory.py', 'assetCount': len(inventory),
               'selectionCounts': dict(summary), 'compatibilityPolicy': 'No automated compatibility scores or approvals; subjective style review remains human.',
               'categories': sheets, 'assets': inventory}
    (OUTPUT / 'inventory.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    index = ['<!doctype html><meta charset="utf-8"><title>Riose asset art direction inventory</title><style>body{font:16px system-ui;background:#efeee8;color:#26372e;max-width:1100px;margin:32px auto;padding:0 18px}li{margin:10px 0}a{color:#235c43}small{color:#5d675f}</style>',
             '<h1>RIOSE · Asset Art Direction Inventory</h1>',
             f"<p>{len(inventory)} raster files · {dict(summary)}. Compatibility remains pending human review; status describes source review only.</p><ul>"]
    for sheet in sheets:
        index.append(f"<li><a href=\"{sheet['file']}\">{sheet['category']} · página {sheet['file'][-6:-4]}</a> <small>({sheet['items']} imagens)</small></li>")
    index += ['</ul><p><a href="inventory.json">Inventário JSON completo</a> · <a href="art-direction-report.json">Sinais de compatibilidade e paleta</a> · <a href="../../../docs/riose-art-direction-bible.md">Art direction bible</a></p>']
    (OUTPUT / 'index.html').write_text('\n'.join(index) + '\n')
    print(json.dumps({'inventory': f'assets/previews/asset-art-direction-v1/inventory.json', 'contactSheets': len(sheets), 'assets': len(inventory), 'selectionCounts': dict(summary)}, ensure_ascii=False))

if __name__ == '__main__': main()
