// Translate renderer hits to the stable entities understood by Product UI.
// Keep this adapter free of Pixi/browser code so selection stays testable.
export function productWorldEntityFromHit(hit) {
  if (!hit) return null;
  if (hit.type === 'pasture') return {...hit, type: 'paddock', name: `Pasture ${String.fromCharCode(65 + hit.index)}`};
  if (hit.id === 'barn-corral') return {...hit, id: 'cattle-shed', type: 'structure', name: 'Cattle shed'};
  if (hit.id === 'farmstead') return {...hit, type: 'structure', name: 'Farmhouse'};
  if (hit.id === 'pond') return {...hit, type: 'water', name: 'Pond'};
  if (hit.id === 'crop-block') return {...hit, type: 'crop', name: 'Crop beds'};
  return hit;
}

export function productWorldAnimalById(animals, id) {
  return animals.find(animal => animal.id === id) ?? null;
}

export function productWorldVegetationAt(screenPoint, placements, project, assets, scaleFor = () => 1) {
  for (const placement of [...(placements ?? [])].reverse()) {
    const asset = assets.get(placement.asset);
    if (!asset) continue;
    const scale = scaleFor(placement.asset), [width, height] = asset.displaySize ?? [asset.frame.w, asset.frame.h];
    const anchor = asset.anchor ?? {x: .5, y: 1}, point = project(placement.x, placement.y);
    const left = point.x - width * scale * anchor.x, top = point.y - height * scale * anchor.y;
    if (screenPoint.x < left || screenPoint.x > left + width * scale
      || screenPoint.y < top || screenPoint.y > top + height * scale) continue;
    return {
      id: placement.id,
      type: 'tree',
      name: placement.name ?? 'Shade tree',
      asset: placement.asset,
      position: {x: placement.x, y: placement.y},
    };
  }
  return null;
}

export function productWorldAnimalAt(screenPoint, projectedAnimals, asset, scale = 1, padding = 1.1) {
  if (!asset || !Array.isArray(projectedAnimals)) return null;
  const [width, height] = asset.displaySize ?? [asset.frame?.w, asset.frame?.h];
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  const anchor = asset.anchor ?? {x: .5, y: 1};
  return projectedAnimals.map(animal => {
    const point = animal.visualPosition;
    if (!point) return null;
    const left = point.x - width * scale * anchor.x, top = point.y - height * scale * anchor.y;
    const hit = screenPoint.x >= left - padding && screenPoint.x <= left + width * scale + padding
      && screenPoint.y >= top - padding && screenPoint.y <= top + height * scale + padding;
    return hit ? {animal, distance: Math.hypot(screenPoint.x - point.x, screenPoint.y - point.y)} : null;
  }).filter(Boolean).sort((a, b) => a.distance - b.distance)[0]?.animal ?? null;
}
