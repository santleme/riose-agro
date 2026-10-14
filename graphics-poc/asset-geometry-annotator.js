import {spritePixelFromWorldCell, validateAnnotationDocument, validateConvexWorldPolygon, worldCellFromSpritePixel} from './spatial-geometry-annotation.js';

const canvas = document.querySelector('#canvas'), ctx = canvas.getContext('2d');
const select = document.querySelector('#asset'), details = document.querySelector('#details'), status = document.querySelector('#status');
const registry = await fetch('/graphics-poc/asset-registry.json').then(response => { if (!response.ok) throw Error('Asset Registry indisponível'); return response.json(); });
const geometryManifest = await fetch('/graphics-poc/asset-geometry-v1.json').then(response => { if (!response.ok) throw Error('Manifesto de geometria indisponível'); return response.json(); });
const {cellWidth: CELL_W, cellHeight: CELL_H} = geometryManifest.projection;
if (geometryManifest.projection.type !== 'isometric-2to1' || !(CELL_W > 0) || !(CELL_H > 0) || Math.abs(CELL_W / CELL_H - 2) > 1e-8) throw Error('Projeção de geometria incompatível com o anotador.');
let annotationFile = await fetch('/graphics-poc/asset-spatial-annotations-v1.json').then(response => response.ok ? response.json() : {schemaVersion: '1.0.0', units: 'world-cell', projection: 'isometric-2to1', assets: {}});
let asset = null, image = null, points = [], transform = null;
const sources = registry.assets.filter(item => item.source?.file && item.displaySizePx && item.pivot).sort((a, b) => a.assetId.localeCompare(b.assetId));
const sourceById = new Map(sources.map(item => [item.assetId, item]));
const importedErrors = await verifyAnnotationDocument(annotationFile);
if (importedErrors.length) throw Error(`Arquivo de anotações inválido: ${importedErrors.join(' ')}`);
for (const item of sources) { const option = document.createElement('option'); option.value = item.assetId; option.textContent = `${item.assetId} · ${item.category}`; select.append(option); }

function worldFromPixel(x, y) {
  const sourceX = (x - transform.offsetX) / transform.fitScale, sourceY = (y - transform.offsetY) / transform.fitScale;
  const point = worldCellFromSpritePixel({x: sourceX, y: sourceY, pivot: asset.pivot, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight,
    displayWidth: asset.displaySizePx.width, displayHeight: asset.displaySizePx.height, cellWidth: CELL_W, cellHeight: CELL_H});
  return {x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6))};
}

function pixelFromWorld(point) {
  const pixel = spritePixelFromWorldCell({...point, pivot: asset.pivot, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight,
    displayWidth: asset.displaySizePx.width, displayHeight: asset.displaySizePx.height, cellWidth: CELL_W, cellHeight: CELL_H});
  return {x: transform.offsetX + pixel.x * transform.fitScale, y: transform.offsetY + pixel.y * transform.fitScale};
}

async function sourceProvenance() {
  const response = await fetch(`/${asset.source.file}`, {cache: 'no-store'});
  if (!response.ok) throw Error(`Não foi possível verificar a origem ${asset.source.file}`);
  const bytes = await response.arrayBuffer(), digest = await crypto.subtle.digest('SHA-256', bytes);
  const sourceSha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return {geometryBasis: 'visual-sprite-estimate', sourceFile: asset.source.file, sourceSha256,
    sourceImagePx: {width: image.naturalWidth, height: image.naturalHeight}, displaySizePx: {...asset.displaySizePx}, pivot: {x: asset.pivot.x, y: asset.pivot.y},
    projection: {type: geometryManifest.projection.type, cellWidth: CELL_W, cellHeight: CELL_H}, annotatedAt: new Date().toISOString()};
}

async function verifyAnnotationDocument(document) {
  const errors = validateAnnotationDocument(document, new Set(sourceById.keys()));
  if (errors.length) return errors;
  for (const [assetId, annotation] of Object.entries(document.assets)) {
    const source = sourceById.get(assetId), provenance = annotation.provenance;
    if (provenance.sourceFile !== source.source.file) { errors.push(`${assetId}: source file differs from the registry.`); continue; }
    const response = await fetch(`/${source.source.file}`, {cache: 'no-store'});
    if (!response.ok) { errors.push(`${assetId}: source file could not be checked.`); continue; }
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    const actualHash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (provenance.sourceSha256 !== actualHash) errors.push(`${assetId}: source changed since annotation.`);
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    if (!same(provenance.sourceImagePx, source.dimensionsPx) || !same(provenance.displaySizePx, source.displaySizePx)
      || !same(provenance.pivot, {x: source.pivot.x, y: source.pivot.y})
      || !same(provenance.projection, {type: geometryManifest.projection.type, cellWidth: CELL_W, cellHeight: CELL_H})) {
      errors.push(`${assetId}: source dimensions, pivot, display scale or projection changed since annotation.`);
    }
  }
  return errors;
}

function pathPolygon(polygon, color, width, close = true) {
  if (!polygon?.length) return;
  const pixels = polygon.map(pixelFromWorld); ctx.beginPath(); ctx.moveTo(pixels[0].x, pixels[0].y);
  for (const point of pixels.slice(1)) ctx.lineTo(point.x, point.y);
  if (close && pixels.length > 2) ctx.closePath();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!image?.complete) return;
  const fitScale = Math.min((canvas.width - 80) / image.naturalWidth, (canvas.height - 80) / image.naturalHeight, 1.5);
  const drawWidth = image.naturalWidth * fitScale, drawHeight = image.naturalHeight * fitScale;
  const offsetX = (canvas.width - drawWidth) / 2, offsetY = (canvas.height - drawHeight) / 2;
  transform = {fitScale, offsetX, offsetY}; ctx.imageSmoothingEnabled = false; ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  pathPolygon(asset.spatialGeometry?.collisionPolygonCandidate, '#ffd078', 2);
  pathPolygon(asset.spatialGeometry?.supportRegionPolygonCandidate, '#ee7188', 1.5);
  pathPolygon(points, '#55dcff', 3, points.length >= 3);
  for (const point of points) { const p = pixelFromWorld(point); ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = '#55dcff'; ctx.fill(); }
  const anchor = {x: offsetX + asset.pivot.x * image.naturalWidth * fitScale, y: offsetY + asset.pivot.y * image.naturalHeight * fitScale};
  ctx.beginPath(); ctx.moveTo(anchor.x - 10, anchor.y); ctx.lineTo(anchor.x + 10, anchor.y); ctx.moveTo(anchor.x, anchor.y - 10); ctx.lineTo(anchor.x, anchor.y + 10);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  details.textContent = JSON.stringify({assetId: asset.assetId, source: asset.source.file, imagePx: {width: image.naturalWidth, height: image.naturalHeight},
    pivot: asset.pivot, inferredContactFootprint: asset.spatialGeometry?.groundFootprintCandidate,
    broadSupportFootprint: asset.spatialGeometry?.supportRegionFootprintCandidate, annotationPointsWorldCell: points,
    annotationState: annotationFile.assets[asset.assetId]?.reviewStatus ?? 'none', physicalFootprintStatus: 'unverified',
    warning: 'Uma anotação visual não prova dimensões físicas nem ocupação real.'}, null, 2);
}

async function selectAsset() {
  asset = sources.find(item => item.assetId === select.value); image = new Image(); image.src = `/${asset.source.file}`;
  points = annotationFile.assets[asset.assetId]?.collisionPolygon?.map(point => ({...point})) ?? [];
  document.querySelector('#review').value = annotationFile.assets[asset.assetId]?.reviewStatus ?? 'draft';
  document.querySelector('#reviewer').value = annotationFile.assets[asset.assetId]?.reviewer ?? '';
  image.onload = draw; image.onerror = () => { status.textContent = `Não foi possível abrir ${asset.source.file}`; };
  if (image.complete) draw();
  status.textContent = `${sources.length} assets · ${points.length} pontos de anotação`; 
}

canvas.addEventListener('click', event => {
  if (!transform) return;
  const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) * canvas.width / rect.width, y = (event.clientY - rect.top) * canvas.height / rect.height;
  if (x < transform.offsetX || y < transform.offsetY || x > transform.offsetX + image.naturalWidth * transform.fitScale || y > transform.offsetY + image.naturalHeight * transform.fitScale) return;
  points.push(worldFromPixel(x, y)); draw();
  const check = validateConvexWorldPolygon(points);
  status.textContent = points.length >= 3 && !check.valid ? `Polígono inválido: ${check.reason}.` : `${points.length} pontos · world-cell · estimativa visual`;
});
select.addEventListener('change', () => selectAsset().catch(error => status.textContent = error.message));
document.querySelector('#undo').addEventListener('click', () => { points.pop(); draw(); });
document.querySelector('#clear').addEventListener('click', () => { points = []; draw(); });
document.querySelector('#download').addEventListener('click', async () => {
  const reviewStatus = document.querySelector('#review').value, reviewer = document.querySelector('#reviewer').value.trim();
  const polygonCheck = validateConvexWorldPolygon(points);
  if (!polygonCheck.valid) { status.textContent = `Anotação rejeitada: ${polygonCheck.reason}.`; return; }
  if (reviewStatus === 'reviewed' && !reviewer) { status.textContent = 'Informe o responsável antes de marcar a anotação como revisada.'; return; }
  const saved = annotationFile.assets[asset.assetId];
  try {
    annotationFile.assets[asset.assetId] = {units: 'world-cell', reviewStatus, ...(reviewer ? {reviewer} : {}),
      note: 'Estimativa visual do contato com o solo no sprite. Não constitui prova de escala ou footprint físico.', provenance: await sourceProvenance(),
      collisionPolygon: points.map(point => ({...point})), supportedOrientations: asset.spatialGeometry?.supportedOrientations ?? [0],
      clearanceCells: asset.spatialGeometry?.clearanceCells ?? 0.25};
    const errors = await verifyAnnotationDocument(annotationFile);
    if (errors.length) throw Error(errors.join(' '));
    const blob = new Blob([`${JSON.stringify(annotationFile, null, 2)}\n`], {type: 'application/json'}), link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'asset-spatial-annotations-v1.json'; link.click(); URL.revokeObjectURL(link.href);
    status.textContent = `Anotação visual ${reviewStatus} exportada para ${asset.assetId}; footprint físico permanece não verificado.`;
    draw();
  } catch (error) { annotationFile.assets[asset.assetId] = saved; status.textContent = `Exportação rejeitada: ${error.message}`; }
});
document.querySelector('#import').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try { const imported = JSON.parse(await file.text()), errors = await verifyAnnotationDocument(imported);
    if (errors.length) throw Error(errors.join(' '));
    annotationFile = imported; await selectAsset(); status.textContent = `Arquivo importado · ${Object.keys(annotationFile.assets).length} assets anotados`;
  } catch (error) { status.textContent = `Importação rejeitada: ${error.message}`; }
});
await selectAsset();
