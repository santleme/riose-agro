const header = document.querySelector('.site-header');
const hero = document.querySelector('.hero');
const lockup = document.querySelector('.hero-lockup');
const heroWordmark = document.querySelector('.hero-wordmark');
const headerWordmark = document.querySelector('.header-wordmark');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let scrollTicking = false;

function updateScrollState() {
  const scrollY = window.scrollY;
  const distance = Math.max(120, window.innerHeight * 0.2);
  const progress = reduceMotion.matches ? (scrollY > 0 ? 1 : 0) : Math.min(1, Math.max(0, scrollY / distance));
  const eased = progress * progress * (3 - 2 * progress);
  const locking = progress > 0 && progress < 1;
  const complete = progress >= 1;
  const headerHeight = header.getBoundingClientRect().height;
  const headerBrand = headerWordmark.getBoundingClientRect();
  const titleHeight = lockup.offsetHeight;
  const startY = hero.offsetHeight * 0.2 + titleHeight / 2;
  const targetY = headerHeight / 2;
  const targetX = headerBrand.left + headerBrand.width / 2;
  const scale = headerWordmark.offsetWidth / Math.max(1, heroWordmark.offsetWidth);
  const scrolled = scrollY > Math.min(90, window.innerHeight * 0.12);

  lockup.classList.toggle('is-locking', progress > 0);
  lockup.classList.toggle('is-locked', complete);
  header.classList.toggle('is-locking', locking);
  header.classList.toggle('is-scrolled', scrolled);
  document.body.classList.toggle('is-scrolled', scrolled);
  if (progress > 0) {
    lockup.style.setProperty('--lockup-y', `${(startY + (targetY - startY) * eased).toFixed(2)}px`);
    lockup.style.setProperty('--lockup-x', `${targetX.toFixed(2)}px`);
    lockup.style.setProperty('--lockup-scale', `${(1 + (scale - 1) * eased).toFixed(4)}`);
    lockup.style.setProperty('--lockup-progress', `${progress.toFixed(4)}`);
    lockup.style.setProperty('--lockup-blur', `${(Math.sin(progress * Math.PI) * 0.42).toFixed(2)}px`);
  }
  scrollTicking = false;
}

window.addEventListener('scroll', () => {
  if (!scrollTicking) {
    window.requestAnimationFrame(updateScrollState);
    scrollTicking = true;
  }
}, {passive: true});
updateScrollState();
