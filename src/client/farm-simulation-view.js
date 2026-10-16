const COW_SPRITE = '/assets/product-farm/nelore-agent.png';
const ACTIVITY = {grazing: 'Grazing', feeding: 'Feeding', drinking: 'Drinking', resting: 'Resting'};
const POSITIONS = [[15, 55], [32, 68], [50, 50], [68, 68], [84, 55], [42, 38]];
export const VISIBLE_ANIMAL_COUNT = POSITIONS.length;

const node = (tag, className, text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};

function animalLabel(animal) {
  return ACTIVITY[animal?.action] ?? 'State recorded';
}

function animalImage() {
  const image = document.createElement('img');
  image.src = COW_SPRITE;
  image.alt = '';
  image.draggable = false;
  return image;
}

export function renderWelcomeAnimals(host, onSelect) {
  if (!host) return;
  host.replaceChildren();
  POSITIONS.slice(0, 5).forEach(([left, top], index) => {
    const button = node('button', `farm-animal preview-animal preview-animal-${index + 1}`);
    button.type = 'button';
    button.style.setProperty('--animal-x', `${left}%`);
    button.style.setProperty('--animal-y', `${top}%`);
    button.setAttribute('aria-label', `Illustrative cattle preview ${index + 1}; no simulated animal state yet`);
    button.title = 'Illustrative preview · no run has been executed';
    button.append(animalImage());
    button.addEventListener('click', () => onSelect(index + 1));
    host.append(button);
  });
}

export function renderFarmAnimals(host, animals, selectedId, onSelect) {
  if (!host) return;
  host.replaceChildren();
  animals.slice(0, POSITIONS.length).forEach((animal, index) => {
    const [left, top] = POSITIONS[index];
    const activity = animalLabel(animal);
    const button = node('button', `farm-animal${animal.id === selectedId ? ' is-selected' : ''}`);
    button.type = 'button';
    button.style.setProperty('--animal-x', `${left}%`);
    button.style.setProperty('--animal-y', `${top}%`);
    button.dataset.activity = animal.action ?? 'unknown';
    button.setAttribute('aria-pressed', String(animal.id === selectedId));
    button.setAttribute('aria-label', `Animal ${animal.id}, ${activity}. Select to inspect its recorded journey.`);
    button.title = `Animal ${animal.id} · ${activity}`;
    button.append(animalImage());
    button.addEventListener('click', () => onSelect(animal.id));
    host.append(button);
  });
}

export function renderFarmInspector(host, {animal, referenceAnimal, day, branchLabel, history = []}) {
  if (!host) return;
  host.replaceChildren();
  if (!animal) {
    host.append(node('p', 'farm-inspector-empty', 'Select an animal to follow its recorded states.'));
    return;
  }
  const identity = node('div', 'farm-agent-identity');
  const portrait = node('span', 'farm-agent-portrait');
  portrait.append(animalImage());
  const title = node('div');
  title.append(node('strong', '', `Animal ${animal.id}`), node('span', '', animal.name ?? 'Engine identity'));
  identity.append(portrait, title);
  const state = node('div', 'farm-agent-current');
  state.append(node('span', '', `Day ${day} · current state`), node('strong', '', animalLabel(animal)));
  const facts = node('div', 'farm-agent-facts');
  const entries = [
    ['Starting weight', `${Number(animal.initialWeight).toFixed(1)} kg`],
    ['Current weight', `${Number(animal.weight).toFixed(1)} kg`],
    [branchLabel, referenceAnimal ? `${Number(referenceAnimal.weight).toFixed(1)} kg` : '—'],
  ];
  for (const [label, value] of entries) {
    const entry = node('div', 'farm-agent-fact');
    entry.append(node('span', '', label), node('strong', '', value));
    facts.append(entry);
  }
  const historyList = node('ol', 'farm-agent-events');
  const retained = Array.isArray(history) ? history.slice(-4).reverse() : [];
  for (const item of retained) {
    const event = node('li', 'farm-agent-event');
    const time = Number.isFinite(item.hour) ? `h${item.hour}` : 'Recorded';
    const reason = typeof item.reason === 'string' ? item.reason.replaceAll('_', ' ') : 'state transition';
    event.append(node('span', '', time), node('span', '', `${animalLabel(item)} · ${reason}`));
    historyList.append(event);
  }
  if (!retained.length) historyList.append(node('li', 'farm-agent-event', `No earlier transition is available at Day ${day}.`));
  host.append(identity, state, facts, node('p', 'farm-agent-origin', 'Engine-recorded states · illustrative behavior policy · not a validated biological model'), historyList);
}

export function renderFarmPaths(host, paths, checkpoints, selectedDay, selectedAnimalId, onSelectDay) {
  if (!host) return;
  host.replaceChildren();
  for (const path of paths) {
    const row = node('section', `farm-path farm-path-${path.id}`);
    const heading = node('div', 'farm-path-heading');
    heading.append(node('strong', '', path.label), node('span', '', path.detail));
    const events = node('div', 'farm-path-checkpoints');
    for (const checkpoint of checkpoints) {
      const state = path.states.find(item => item.day === checkpoint.day);
      const animal = state?.animals?.find(item => item.id === selectedAnimalId) ?? state?.animals?.[0];
      const button = node('button', `farm-path-checkpoint${checkpoint.day === selectedDay ? ' is-current' : ''}`);
      button.type = 'button';
      button.disabled = !state;
      button.setAttribute('aria-pressed', String(checkpoint.day === selectedDay));
      button.setAttribute('aria-label', state ? `${path.label}, Day ${checkpoint.day}${animal ? `, ${animalLabel(animal)}` : ''}. Inspect this checkpoint.` : `${path.label}, Day ${checkpoint.day}. No retained engine checkpoint.`);
      button.title = state ? `${path.label} · Day ${checkpoint.day}${animal ? ` · ${animalLabel(animal)}` : ''}` : `${path.label} · no retained checkpoint for Day ${checkpoint.day}`;
      if (animal) button.append(animalImage());
      button.append(node('small', '', state ? `Day ${checkpoint.day}` : `Day ${checkpoint.day} · —`));
      if (state) button.addEventListener('click', () => onSelectDay(checkpoint.day));
      events.append(button);
    }
    row.append(heading, events);
    host.append(row);
  }
}

export function pickJourneyCheckpoints(timeline, maximum = 4) {
  if (!timeline?.length) return [];
  if (timeline.length <= maximum) return timeline.map(item => ({day: item.day}));
  const indices = Array.from({length: maximum}, (_, i) => Math.round(i * (timeline.length - 1) / (maximum - 1)));
  return [...new Set(indices)].map(index => ({day: timeline[index].day}));
}
