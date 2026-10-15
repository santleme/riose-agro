import * as PIXI from '../../assets/farm-scene/vendor/pixi.min.mjs';
import {compareConfiguredScenarios, DEFAULT_CONFIG, FarmEngine} from './engine.js';

const ASSET_ROOT = new URL('../../assets/farm-scene/', import.meta.url).href;
const viewport = document.querySelector('#scene-viewport');
const loading = document.querySelector('#scene-loading');
const status = document.querySelector('#scene-status');
const selectedObject = document.querySelector('#selected-object');
const zoomLabel = document.querySelector('#zoom-label');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const formatDelta = (value, digits = 1) => `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', {minimumFractionDigits: digits, maximumFractionDigits: digits})}`;
const formatCurrencyDelta = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`;

async function loadScene() {
  const response = await fetch(`${ASSET_ROOT}scene.json`);
  if (!response.ok) throw new Error('Não foi possível carregar o contrato da cena.');
  const scene = await response.json();
  await renderScene(scene);
}

async function renderScene(scene) {
  const app = new PIXI.Application();
  await app.init({
    resizeTo: viewport,
    background: '#e9ebdf',
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
  });
  const canvas = app.canvas;
  canvas.setAttribute('aria-label', 'Fazenda isométrica: arraste para mover a câmera e use mais ou menos para aproximar. Clique em um bovino para selecioná-lo.');
  canvas.setAttribute('role', 'img');
  canvas.tabIndex = 0;
  viewport.append(canvas);
  loading.hidden = true;

  const world = new PIXI.Container();
  const base = await PIXI.Assets.load(ASSET_ROOT + scene.terrain.asset);
  const ground = new PIXI.Sprite(base);
  ground.position.set(scene.terrain.x, scene.terrain.y);
  ground.width = scene.terrain.width;
  ground.height = scene.terrain.height;
  world.addChild(ground);

  const objectTextures = await Promise.all([...new Set(scene.objects.map(object => object.asset))]
    .map(async asset => [asset, await PIXI.Assets.load(ASSET_ROOT + asset)]));
  const textures = new Map(objectTextures);
  const sprites = [];
  for (const object of [...scene.objects].sort((a, b) => a.z - b.z || a.y - b.y)) {
    const sprite = new PIXI.Sprite(textures.get(object.asset));
    sprite.anchor.set(.5, 1);
    sprite.position.set(object.x, object.y);
    sprite.width = object.width;
    sprite.height = object.height;
    sprite.label = object.id;
    sprite.eventMode = 'none';
    world.addChild(sprite);
    sprites.push({object, sprite});
  }

  const selection = new PIXI.Graphics();
  selection.eventMode = 'none';
  world.addChild(selection);
  app.stage.addChild(world);

  let fitScale = 1;
  let zoom = scene.camera.initialZoom;
  const applyCamera = () => {
    const screen = app.renderer.screen;
    fitScale = Math.min(screen.width / scene.world.width, screen.height / scene.world.height);
    world.scale.set(fitScale * zoom);
    world.position.set((screen.width - scene.world.width * world.scale.x) / 2,
      (screen.height - scene.world.height * world.scale.y) / 2);
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  };
  applyCamera();
  app.renderer.on('resize', applyCamera);

  let pointerStart = null;
  let selected = null;
  canvas.addEventListener('pointerdown', event => {
    pointerStart = {x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.lastX;
    const dy = event.clientY - pointerStart.lastY;
    if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) pointerStart.moved = true;
    if (pointerStart.moved && scene.camera.pan) world.position.set(world.x + dx, world.y + dy);
    pointerStart.lastX = event.clientX;
    pointerStart.lastY = event.clientY;
  });
  canvas.addEventListener('pointerup', event => {
    if (!pointerStart) return;
    if (!pointerStart.moved) {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left - world.x) / world.scale.x;
      const y = (event.clientY - rect.top - world.y) / world.scale.y;
      selected = [...sprites].reverse().find(({object}) => object.type === 'cattle'
        && x >= object.x - object.width / 2 && x <= object.x + object.width / 2
        && y >= object.y - object.height && y <= object.y);
      selection.clear();
      if (selected) {
        const {object} = selected;
        selection.ellipse(object.x, object.y - 8, object.width * .44, 15).stroke({color: 0xd58d4b, width: 3});
        selectedObject.textContent = `${object.label} · ${({idle: 'parado', grazing: 'pastando', walking: 'caminhando'})[object.state]}`;
      } else selectedObject.textContent = 'Selecione um bovino';
    }
    pointerStart = null;
  });
  canvas.addEventListener('pointercancel', () => { pointerStart = null; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const localX = (screenX - world.x) / world.scale.x;
    const localY = (screenY - world.y) / world.scale.y;
    zoom = clamp(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), scene.camera.minZoom, scene.camera.maxZoom);
    world.scale.set(fitScale * zoom);
    world.position.set(screenX - localX * world.scale.x, screenY - localY * world.scale.y);
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }, {passive: false});

  document.querySelector('#zoom-in').addEventListener('click', () => setCenteredZoom(zoom * 1.15));
  document.querySelector('#zoom-out').addEventListener('click', () => setCenteredZoom(zoom / 1.15));
  document.querySelector('#camera-reset').addEventListener('click', () => { zoom = scene.camera.initialZoom; applyCamera(); });
  function setCenteredZoom(next) {
    const centerX = app.renderer.screen.width / 2;
    const centerY = app.renderer.screen.height / 2;
    const localX = (centerX - world.x) / world.scale.x;
    const localY = (centerY - world.y) / world.scale.y;
    zoom = clamp(next, scene.camera.minZoom, scene.camera.maxZoom);
    world.scale.set(fitScale * zoom);
    world.position.set(centerX - localX * world.scale.x, centerY - localY * world.scale.y);
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }
  status.textContent = `${scene.objects.filter(object => object.type === 'cattle').length} bovinos · câmera navegável`;
}

document.querySelector('#scenario-form').addEventListener('submit', event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const statusLine = document.querySelector('#simulation-status');
  button.disabled = true;
  statusLine.textContent = 'Comparando cenários…';
  try {
    const factor = document.querySelector('#scenario-factor').value;
    const days = Number(document.querySelector('#scenario-days').value);
    const referenceConfig = {...DEFAULT_CONFIG};
    const scenarioConfig = {...referenceConfig};
    if (factor === 'housing') scenarioConfig.housing = 'barn';
    if (factor === 'diet') scenarioConfig.diet = 'balanced';
    if (factor === 'supplement') scenarioConfig.supplement = .5;
    const engine = new FarmEngine(2026, 10);
    engine.configure(referenceConfig);
    const result = compareConfiguredScenarios(engine.snapshot(), {days, referenceConfig, scenarioConfig});
    const final = result.rows.at(-1);
    const weightDelta = final.scenarioWeight - final.referenceWeight;
    const costDelta = final.scenarioCost - final.referenceCost;
    const choice = document.querySelector('#scenario-factor').selectedOptions[0].textContent;
    document.querySelector('#result-period').textContent = `${days} dias`;
    document.querySelector('#result-summary').textContent = `${choice}: variação simulada de ${formatDelta(weightDelta)} kg por animal no período.`;
    document.querySelector('#weight-delta').textContent = `${formatDelta(weightDelta)} kg`;
    document.querySelector('#cost-delta').textContent = formatCurrencyDelta(costDelta);
    document.querySelector('#result-limitation').textContent = `Comparação demonstrativa · ${result.herdSize} bovinos · seed ${result.seed}. O motor não tem validação preditiva.`;
    document.querySelector('#scenario-result').hidden = false;
    statusLine.textContent = 'Comparação concluída pelo motor local.';
  } catch (error) {
    statusLine.textContent = `Falha ao simular: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

loadScene().catch(error => {
  loading.innerHTML = '<p>Não foi possível carregar os assets da fazenda.</p>';
  status.textContent = 'Falha ao carregar cena';
  console.error(error);
});
