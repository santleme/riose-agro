const page = document.querySelector('.manifesto-page');
const world = document.querySelector('.manifesto-world');
const worldFrame = document.querySelector('.manifesto-world-frame');
const terms = [...document.querySelectorAll('.manifesto-term')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let pinnedScenario = null;
let worldVisible = false;
let worldLoaded = false;

function sendWorldMessage(message) {
  worldFrame.contentWindow?.postMessage({type: 'manifesto-world', ...message}, window.location.origin);
}

function setScenario(scenario) {
  sendWorldMessage({scenario: scenario || 'baseline'});
  terms.forEach((term) => term.setAttribute('aria-pressed', String(pinnedScenario === term.dataset.scenario)));
}

terms.forEach((term) => {
  term.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'touch' && !pinnedScenario) setScenario(term.dataset.scenario);
  });
  term.addEventListener('pointerleave', () => {
    if (!pinnedScenario && !term.matches(':focus')) setScenario('baseline');
  });
  term.addEventListener('focus', () => setScenario(term.dataset.scenario));
  term.addEventListener('blur', (event) => {
    if (event.relatedTarget?.closest?.('.manifesto-term')) return;
    setScenario(pinnedScenario || 'baseline');
  });
  term.addEventListener('click', (event) => {
    pinnedScenario = pinnedScenario === term.dataset.scenario ? null : term.dataset.scenario;
    const keyboardFocus = event.detail === 0 && term.matches(':focus-visible');
    const mouseHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches && term.matches(':hover');
    setScenario(pinnedScenario || (keyboardFocus || mouseHover ? term.dataset.scenario : 'baseline'));
  });
});

document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest?.('.manifesto-term') && pinnedScenario) {
    pinnedScenario = null;
    setScenario('baseline');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && pinnedScenario) {
    pinnedScenario = null;
    setScenario('baseline');
  }
});

function handleWorldLoad() {
  if (worldLoaded) return;
  worldLoaded = true;
  sendWorldMessage({visible: worldVisible, reducedMotion: reducedMotion.matches});
  setScenario(pinnedScenario || 'baseline');
  window.setTimeout(() => world.classList.add('is-live'), 450);
}
worldFrame.addEventListener('load', handleWorldLoad);
if (worldFrame.contentDocument?.readyState === 'complete') handleWorldLoad();
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin || event.source !== worldFrame.contentWindow || event.data?.type !== 'manifesto-world-ready') return;
  world.classList.add('is-live');
});
document.addEventListener('visibilitychange', () => {
  sendWorldMessage({visible: worldVisible && !document.hidden, reducedMotion: reducedMotion.matches});
});
reducedMotion.addEventListener?.('change', (event) => sendWorldMessage({visible: worldVisible && !document.hidden, reducedMotion: event.matches}));

page.classList.add('has-reveal');
if (reducedMotion.matches || !('IntersectionObserver' in window)) {
  document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('is-visible'));
  worldVisible = true;
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      if (entry.target === world) {
        worldVisible = true;
        sendWorldMessage({visible: !document.hidden, reducedMotion: reducedMotion.matches});
      }
      observer.unobserve(entry.target);
    });
  }, {threshold: 0, rootMargin: '0px'});
  document.querySelectorAll('[data-reveal]').forEach((element) => revealObserver.observe(element));
}
