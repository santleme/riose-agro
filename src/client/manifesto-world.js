import {createProductWorldRenderer} from './product-world-renderer.bundle.js';
import {SIMULATOR_PATCH_BOUNDS} from './product-spatial.js';

const host = document.getElementById('manifesto-world-canvas');
if (!host) throw new Error('Manifesto farm host is unavailable');

function illustrativeAnimals() {
  return SIMULATOR_PATCH_BOUNDS.flatMap((bounds, patch) => [
    [.24, .34], [.69, .35], [.48, .72],
  ].map(([x, y], index) => ({
    id: patch * 3 + index + 1,
    patch,
    x: bounds.x + bounds.w * x,
    y: bounds.y + bounds.h * y,
    action: 'grazing',
  })));
}

async function renderManifestoWorld() {
  try {
    const renderer = await createProductWorldRenderer({host});
    renderer.update({
      animals: illustrativeAnimals(),
      selectedAnimalId: null,
      selectedEntityId: null,
      hoverAnimalId: null,
      hoverEntityId: null,
      pastures: [],
      hour: 12,
      weather: 'normal',
    });
    // The Manifesto is an illustrative still. The Product owns live controls.
    renderer.canvas.style.pointerEvents = 'none';
    renderer.canvas.tabIndex = -1;
    renderer.canvas.setAttribute('aria-label', 'Illustrative isometric farm scene built from the Product asset catalog.');
    host.dataset.renderer = 'pixi';
    host.classList.add('is-rendered');
  } catch (error) {
    host.dataset.renderer = 'unavailable';
    host.setAttribute('aria-label', 'Farm illustration unavailable. Open Product to explore the live farm.');
    console.error('Manifesto farm renderer unavailable.', error);
  }
}

renderManifestoWorld();
