const nameControl = document.querySelector('.header-name-control');
const definitionTrigger = document.querySelector('.meaning-trigger');
const definitionPanel = document.querySelector('.name-definition');
let definitionCloseTimer = 0;
function setDefinitionOpen(open) {
  nameControl.classList.toggle('is-open', open);
  definitionPanel.setAttribute('aria-hidden', String(!open));
  if (open) updateDefinitionPosition();
}

function updateDefinitionPosition() {
  const triggerBounds = definitionTrigger.getBoundingClientRect();
  const panelWidth = definitionPanel.getBoundingClientRect().width;
  const preferredLeft = triggerBounds.left + triggerBounds.width / 2 - panelWidth / 2;
  const safeLeft = Math.min(Math.max(preferredLeft, 16), window.innerWidth - panelWidth - 16);
  nameControl.style.setProperty('--definition-shift-x', `${(safeLeft - preferredLeft).toFixed(2)}px`);
}

function cancelDefinitionClose() {
  window.clearTimeout(definitionCloseTimer);
}

function scheduleDefinitionClose() {
  cancelDefinitionClose();
  if (definitionTrigger.matches(':focus-visible')) return;
  definitionCloseTimer = window.setTimeout(() => {
    if (!definitionTrigger.matches(':hover') && !definitionPanel.matches(':hover')) setDefinitionOpen(false);
  }, 180);
}

definitionTrigger.addEventListener('pointerenter', () => {
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    cancelDefinitionClose();
    setDefinitionOpen(true);
  }
});
definitionPanel.addEventListener('pointerenter', cancelDefinitionClose);
definitionPanel.addEventListener('pointerleave', scheduleDefinitionClose);
nameControl.addEventListener('pointerleave', scheduleDefinitionClose);
definitionTrigger.addEventListener('focus', () => {
  if (definitionTrigger.matches(':focus-visible')) setDefinitionOpen(true);
});
definitionTrigger.addEventListener('blur', (event) => {
  const pointerInsideDefinition = definitionTrigger.matches(':hover') || definitionPanel.matches(':hover');
  if (event.relatedTarget !== definitionTrigger && !pointerInsideDefinition) setDefinitionOpen(false);
});
document.addEventListener('pointerdown', (event) => {
  if (window.matchMedia('(hover: none), (pointer: coarse)').matches && !nameControl.contains(event.target)) {
    setDefinitionOpen(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && nameControl.classList.contains('is-open')) {
    definitionTrigger.focus();
    setDefinitionOpen(false);
  }
});
window.addEventListener('resize', () => {
  if (nameControl.classList.contains('is-open')) updateDefinitionPosition();
}, {passive: true});
