#!/usr/bin/env python3
"""Create evidence-based art compatibility signals without auto-approving art."""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
INVENTORY = ROOT / 'assets/previews/asset-art-direction-v1/inventory.json'
OUTPUT = ROOT / 'assets/previews/asset-art-direction-v1/art-direction-report.json'
BIBLE = ROOT / 'docs/riose-art-direction-bible.md'
SCENE = ROOT / 'assets/previews/ranch-composition-v4/rural-diorama-scene-v4-grounding-v2-gate-v2-water-v2-feed-v2-review.json'

def rgb(hex_color: str) -> np.ndarray:
    return np.array([int(hex_color[index:index + 2], 16) for index in (1, 3, 5)], dtype=np.float32)

def cluster_palette(samples: np.ndarray, count: int = 8) -> list[dict]:
    if len(samples) == 0: return []
    samples = samples.astype(np.float32)
    centers = samples[np.linspace(0, len(samples) - 1, min(count, len(samples)), dtype=int)].copy()
    for _ in range(10):
        labels = np.argmin(((samples[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2), axis=1)
        for index in range(len(centers)):
            group = samples[labels == index]
            if len(group): centers[index] = group.mean(axis=0)
    labels = np.argmin(((samples[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2), axis=1)
    counts = np.bincount(labels, minlength=len(centers))
    order = np.argsort(counts)[::-1]
    result = []
    for index in order:
        color = np.clip(np.round(centers[index]), 0, 255).astype(int)
        result.append({'hex': '#%02x%02x%02x' % tuple(color), 'pixelShare': round(float(counts[index] / len(samples)), 4)})
    return result

def edge_density(path: Path) -> float:
    with Image.open(path) as opened:
        image = opened.convert('RGBA')
        image.thumbnail((96, 96), Image.Resampling.LANCZOS)
        alpha = np.asarray(image.getchannel('A')) > 24
        edges = np.asarray(image.convert('RGB').convert('L').filter(ImageFilter.FIND_EDGES))
        visible = int(alpha.sum())
        return float((edges[alpha] > 48).sum() / visible) if visible else 0.0

def perspective_signal(value) -> str:
    if not value: return 'unknown-no-source-metadata'
    text = ' '.join(map(str, value if isinstance(value, list) else [value])).lower()
    if any(token in text for token in ('2:1', 'isometric', 'iso-2')): return 'declared-isometric'
    if 'three-quarter' in text or 'ne three-quarter' in text: return 'three-quarter-axis-review'
    if any(token in text for token in ('top-down', 'orthographic')): return 'declared-orthographic-review'
    return 'declared-other-perspective-review'

def main() -> None:
    payload = json.loads(INVENTORY.read_text())
    entries = payload['assets']
    selected = [entry for entry in entries if entry['selection'] == 'selected-for-v4-pilot']
    if not selected: raise SystemExit('Inventory does not contain selected pilot assets.')
    scene = json.loads(SCENE.read_text())
    runtime_sizes = {}
    for placement in scene['placements']:
        runtime_sizes.setdefault(placement['assetId'], []).append(placement['requestedSizePx'])
    selection_paths = [ROOT / entry['file'] for entry in selected]
    samples = []
    for path in selection_paths:
        with Image.open(path) as opened:
            image = opened.convert('RGBA')
            image.thumbnail((64, 64), Image.Resampling.LANCZOS)
            rgba = np.asarray(image)
            pixels = rgba.reshape(-1, 4)
            samples.append(pixels[pixels[:, 3] >= 160, :3][::2])
    palette = cluster_palette(np.concatenate(samples, axis=0))
    centers = np.stack([rgb(item['hex']) for item in palette])
    selected_edges = [edge_density(path) for path in selection_paths]
    edge_reference = float(np.median(selected_edges))
    decisions = {'within-art-palette': 0, 'near-art-palette': 0, 'palette-outlier': 0, 'unknown': 0}
    signal_counts = {key: {} for key in ('perspective', 'scale', 'outlineAndShadingProxy', 'transparency', 'lighting', 'agroContext')}
    records = []
    for entry in entries:
        colors = [rgb(color) for color in entry.get('dominantPaletteApproxHex', [])[:3]]
        color_distance = float(np.mean([np.linalg.norm(color[None, :] - centers, axis=1).min() for color in colors])) if colors else None
        if color_distance is None: palette_signal = 'unknown'
        elif color_distance <= 36: palette_signal = 'within-art-palette'
        elif color_distance <= 72: palette_signal = 'near-art-palette'
        else: palette_signal = 'palette-outlier'
        decisions[palette_signal] += 1
        source_meta = entry.get('sourceMetadata', {})
        scale = entry.get('recommendedScale') or {}
        preferred = scale.get('preferredRenderSizePx') or scale.get('displaySizePx')
        actual = entry.get('dimensionsPx', {})
        if preferred and preferred.get('width') and preferred.get('height'):
            scale_ratio = round(min(actual['width'] / preferred['width'], actual['height'] / preferred['height']), 3)
            scale_signal = 'usable-source-resolution' if scale_ratio >= 0.65 else 'low-source-resolution-at-recommended-size'
        else:
            scale_ratio, scale_signal = None, 'unknown-no-recommended-scale'
        path = ROOT / entry['file']
        edges = edge_density(path)
        density_ratio = round(edges / edge_reference, 3) if edge_reference else None
        if density_ratio is None: density_signal = 'unknown'
        elif .55 <= density_ratio <= 1.8: density_signal = 'near-pilot-edge-density'
        else: density_signal = 'edge-density-outlier-review'
        partial_alpha = entry.get('alpha', {}).get('partialAlphaFraction', 0)
        alpha_signal = 'soft-alpha-review' if partial_alpha > .25 else 'low-partial-alpha' if partial_alpha < .01 else 'moderate-partial-alpha-review'
        perspective = perspective_signal(entry.get('perspective'))
        context_signal = 'agro-context-tagged' if entry['category'] in {'livestock', 'buildings', 'handling-and-fences', 'vegetation', 'water', 'roads-and-paths', 'terrain-and-soil', 'vehicles-and-machinery', 'technology'} else 'context-review'
        for key, value in {
            'perspective': perspective, 'scale': scale_signal, 'outlineAndShadingProxy': density_signal,
            'transparency': alpha_signal, 'lighting': 'unknown-unless-explicitly-authored', 'agroContext': context_signal,
        }.items():
            signal_counts[key][value] = signal_counts[key].get(value, 0) + 1
        record = {
            'id': entry['id'], 'file': entry['file'], 'category': entry['category'],
            'thumbnail': entry.get('thumbnail'), 'selection': entry['selection'],
            'renderSizePx': runtime_sizes.get(entry['id']),
            'rightsAndProvenance': entry.get('licenseAndProvenance'),
            'signals': {
                'perspective': perspective, 'scale': scale_signal, 'scaleRatioToRecommended': scale_ratio,
                'palette': palette_signal, 'nearestPaletteDistanceRgb': round(color_distance, 1) if color_distance is not None else None,
                'edgeDensity': round(edges, 4), 'edgeDensityRatioToPilotMedian': density_ratio,
                'outlineAndShadingProxy': density_signal, 'transparency': alpha_signal,
                'partialAlphaFraction': partial_alpha, 'lighting': 'unknown-unless-explicitly-authored',
                'agroContext': context_signal,
            },
            'artisticApproval': 'pending-human-review',
            'machineAssessmentLimits': 'RGB distance, edge density and source metadata are screening signals; they do not identify lighting, perspective quality or artistic coherence reliably.',
        }
        records.append(record)
    report = {
        'schemaVersion': 1,
        'generatedBy': 'scripts/assets/score_art_compatibility.py',
        'referenceCollection': '28 files currently used by the V4/V5 pilot; this is usage provenance, not approval.',
        'selectedPilotAssets': len(selected), 'assetCount': len(entries),
        'artisticApprovalPolicy': 'No asset is automatically approved or distributed by these signals.',
        'derivedPilotPalette': palette,
        'pilotMedianEdgeDensity': round(edge_reference, 4),
        'paletteSignalCounts': decisions,
        'screeningSignalCounts': signal_counts,
        'humanReviewRequiredFor': ['lighting direction', 'isometric projection quality', 'relative scale', 'outline weight', 'detail coherence', 'agro-context fit', 'rights clearance'],
        'assets': records,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    categories = {}
    for asset in records:
        if asset['selection'] != 'selected-for-v4-pilot' or not asset['renderSizePx']: continue
        category = asset['category']
        categories.setdefault(category, []).extend(asset['renderSizePx'])
    def medians(values):
        return [int(np.median([size[axis] for size in values])) for axis in range(2)]
    scale_rows = [(category, medians(sizes)) for category, sizes in sorted(categories.items())]
    bible = [
        '# Riose Agro · Art Direction Bible V5', '',
        'Este guia deriva os números abaixo dos 28 arquivos usados na composição piloto; uso atual não equivale a aprovação artística ou liberação de direitos.', '',
        '## Projeção e escala', '',
        '- Projeção isométrica 2:1, coordenadas de tela de 61 px por eixo horizontal e 27,2 px por eixo vertical na placa de 14 × 14 unidades.',
        '- Convenção de terreno: 1 unidade isométrica = 5 m no plano. O render estiliza a altura em 74,7 px/unidade; não usar essa altura visual para alterar dados científicos.',
        '- As dimensões abaixo são medianas de `requestedSizePx` nos usos existentes, não limites universais. Assets sem metadados espaciais continuam marcados para revisão.',
        '', '| Categoria | Tamanho mediano de render |', '|---|---:|',
        *[f'| {category} | {size[0]} × {size[1]} px |' for category, size in scale_rows], '',
        '## Paleta derivada dos assets em uso', '',
        '| Cor | Participação amostrada |', '|---|---:|',
        *[f"| <span style=\"display:inline-block;width:1.5em;height:1em;background:{item['hex']}\"></span> `{item['hex']}` | {item['pixelShare']:.1%} |" for item in palette], '',
        'Amostragem reamostrada dos pixels visíveis dos 28 assets do piloto, quantizada em oito centros RGB. Não é uma paleta final aprovada; áreas de transparência foram excluídas.', '',
        '## Luz, material e compatibilidade', '',
        '- Iluminação principal dos renders Blender de terreno: quente, superior esquerda; preenchimento frio de cima/direita. Os manifests não descrevem uma direção comum de luz para os sprites existentes, então consistência de luz permanece pendente de inspeção.',
        '- Cores RGB, densidade de bordas, alpha e orientação declarada no inventário são sinais de triagem. Nenhum deles aprova perspectiva, estilo ou qualidade artística.',
        '- A composição atual mistura fontes geradas e sprites raster de famílias diferentes. A inspeção humana deve comparar contornos, sombras, escala, perspectiva, detalhe e adequação agropecuária antes de promover assets.',
        '- A coleção usada no piloto continua com revisão artística e direitos pendentes; ativos fora dela ficam em espera ou laboratório sem excluir seus originais.',
        '', 'Relatório técnico e sinais por arquivo: [art-direction-report.json](../assets/previews/asset-art-direction-v1/art-direction-report.json).',
    ]
    BIBLE.write_text('\n'.join(bible) + '\n')
    print(json.dumps({'report': OUTPUT.relative_to(ROOT).as_posix(), 'bible': BIBLE.relative_to(ROOT).as_posix(), 'assets': len(records), 'palette': palette, 'paletteSignals': decisions, 'signals': signal_counts, 'renderSizesByCategory': dict(scale_rows)}, ensure_ascii=False))

if __name__ == '__main__': main()
